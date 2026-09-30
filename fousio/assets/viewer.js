/* viewer.js — a small GLB turntable for the Fousio pages.
 *
 * three.js r160 (global THREE, vendored in ./vendor) plus a ~100 line GLB reader,
 * so there is no loader dependency and nothing is fetched from a CDN. Models are
 * plain glTF 2.0 binaries: float positions/normals, PBR factor materials, no
 * textures, no compression (see models/README.md).
 *
 *   const v = new FousioViewer(element, { src: 'models/fixed-star.glb', spin: 0.22 });
 *   v.load('models/circlet-b.glb');   // swap models with a crossfade
 *
 * The page stays in charge of layout: the viewer fills its element, renders only
 * while it is on screen, and never captures vertical scrolling on touch screens.
 */
(function () {
  'use strict';
  const T = window.THREE;
  if (!T) return;

  // ------------------------------------------------------------------ GLB reader
  const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
  const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  function readGLB(buf) {
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB file');
    let off = 12, json = null, bin = null;
    while (off + 8 <= dv.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), at = off + 8;
      if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, at, len)));
      else if (type === 0x004e4942) bin = buf.slice(at, at + len);
      off = at + len;
    }
    return { json, bin };
  }

  function attribute(g, bin, index) {
    const a = g.accessors[index], view = g.bufferViews[a.bufferView];
    const Arr = COMP[a.componentType], n = SIZE[a.type];
    const start = (view.byteOffset || 0) + (a.byteOffset || 0);
    const stride = view.byteStride || 0, bytes = Arr.BYTES_PER_ELEMENT;
    let data;
    if (stride && stride !== n * bytes) {             // interleaved: copy out
      data = new Arr(a.count * n);
      const src = new Arr(bin, 0, bin.byteLength / bytes | 0);
      for (let i = 0; i < a.count; i++)
        for (let k = 0; k < n; k++) data[i * n + k] = src[(start + i * stride) / bytes + k];
    } else {
      data = new Arr(bin.slice(start, start + a.count * n * bytes));
    }
    return new T.BufferAttribute(data, n, !!a.normalized);
  }

  function material(g, index) {
    const m = (g.materials || [])[index] || {};
    const pbr = m.pbrMetallicRoughness || {}, ext = m.extensions || {};
    const base = pbr.baseColorFactor || [1, 1, 1, 1];
    const mat = new T.MeshPhysicalMaterial({
      color: new T.Color(base[0], base[1], base[2]),
      metalness: pbr.metallicFactor ?? 1,
      roughness: pbr.roughnessFactor ?? 1,
      side: m.doubleSided ? T.DoubleSide : T.FrontSide,
    });
    mat.name = m.name || '';
    if (m.emissiveFactor) {
      mat.emissive = new T.Color(m.emissiveFactor[0], m.emissiveFactor[1], m.emissiveFactor[2]);
      mat.emissiveIntensity = (ext.KHR_materials_emissive_strength || {}).emissiveStrength ?? 1;
    }
    if (ext.KHR_materials_transmission) {
      mat.transmission = ext.KHR_materials_transmission.transmissionFactor ?? 0;
      mat.thickness = 0.03;
    }
    if (ext.KHR_materials_ior) mat.ior = ext.KHR_materials_ior.ior ?? 1.5;
    if (ext.KHR_materials_clearcoat) {
      mat.clearcoat = ext.KHR_materials_clearcoat.clearcoatFactor ?? 0;
      mat.clearcoatRoughness = ext.KHR_materials_clearcoat.clearcoatRoughnessFactor ?? 0;
    }
    if (m.alphaMode === 'BLEND' || base[3] < 1) { mat.transparent = true; mat.opacity = base[3]; }
    return mat;
  }

  function buildScene(g, bin, skip) {
    const root = new T.Group();
    const meshes = (g.meshes || []).map((mesh) => {
      const group = new T.Group();
      for (const p of mesh.primitives) {
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', attribute(g, bin, p.attributes.POSITION));
        if (p.attributes.NORMAL !== undefined) geo.setAttribute('normal', attribute(g, bin, p.attributes.NORMAL));
        if (p.attributes.TEXCOORD_0 !== undefined) geo.setAttribute('uv', attribute(g, bin, p.attributes.TEXCOORD_0));
        if (p.indices !== undefined) geo.setIndex(attribute(g, bin, p.indices));
        if (p.attributes.NORMAL === undefined) geo.computeVertexNormals();
        const obj = new T.Mesh(geo, material(g, p.material));
        obj.name = mesh.name || '';
        group.add(obj);
      }
      return group;
    });
    const node = (i) => {
      const n = g.nodes[i];
      const o = n.mesh !== undefined && !(skip || []).includes(n.name) ? meshes[n.mesh].clone() : new T.Group();
      if (n.matrix) o.applyMatrix4(new T.Matrix4().fromArray(n.matrix));
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
      (n.children || []).forEach((c) => o.add(node(c)));
      return o;
    };
    const scene = (g.scenes || [])[g.scene || 0];
    (scene ? scene.nodes : g.nodes.map((_, i) => i)).forEach((i) => root.add(node(i)));
    return root;
  }

  const cache = new Map();
  function loadGLB(url, skip) {
    if (!cache.has(url)) {
      cache.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(url + ': ' + r.status);
        return r.arrayBuffer();
      }).then((buf) => readGLB(buf)));
    }
    return cache.get(url).then(({ json, bin }) => buildScene(json, bin, skip));
  }

  // ------------------------------------------------------------------ studio light
  // A white room with soft boxes, baked to a prefiltered environment map: metals
  // need something to reflect, and on a white page that something should be light.
  function studio(renderer) {
    const pm = new T.PMREMGenerator(renderer);
    const scene = new T.Scene();
    const room = new T.Mesh(new T.BoxGeometry(12, 8, 12), new T.MeshBasicMaterial({ color: new T.Color(0.2, 0.2, 0.21), side: T.BackSide }));
    room.position.y = 2;
    scene.add(room);
    const floor = new T.Mesh(new T.PlaneGeometry(12, 12), new T.MeshBasicMaterial({ color: new T.Color(0.08, 0.075, 0.07) }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.9;
    scene.add(floor);
    const box = (w, h, x, y, z, ry, k) => {
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(k, k, k * 0.97), side: T.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0.5, 0); if (ry) m.rotateZ(ry);
      scene.add(m);
    };
    box(5, 2.4, -3.8, 3.2, 2.4, 0, 12);    // key, high left
    box(3, 3, 4.6, 1.4, -1.8, 0, 6);       // rim, right back
    box(6, 1.2, 0, 5.6, 0, 0, 5);          // overhead strip
    box(2.2, 4, 0.6, 0.8, 5.4, 0, 2.6);    // front fill
    box(1.4, 6, -5.2, 1, -2.6, 0, 3);      // narrow strip, left back
    const tex = pm.fromScene(scene, 0.035).texture;
    pm.dispose();
    return tex;
  }

  function shadowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(20,18,16,0.42)'); g.addColorStop(0.4, 'rgba(20,18,16,0.14)'); g.addColorStop(1, 'rgba(20,18,16,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return t;
  }

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ------------------------------------------------------------------ viewer
  class FousioViewer {
    constructor(el, opts) {
      this.el = el;
      this.o = Object.assign({ spin: 0.22, elevation: 0.12, fov: 28, fit: 1.12, float: 0.012, tilt: 0, exposure: 1.0, lift: 0, skip: ['star-gem'] }, opts || {});
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = this.o.exposure;
      this.renderer.setClearColor(0x000000, 0);
      const canvas = this.renderer.domElement;
      canvas.className = 'fv-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      el.appendChild(canvas);

      this.scene = new T.Scene();
      this.scene.environment = studio(this.renderer);
      const key = new T.DirectionalLight(0xffffff, 1.4); key.position.set(-3, 5, 4); this.scene.add(key);
      const rim = new T.DirectionalLight(0xfff4e6, 0.9); rim.position.set(4, 2, -4); this.scene.add(rim);
      this.scene.add(new T.HemisphereLight(0xffffff, 0xd9d4cc, 0.35));

      this.camera = new T.PerspectiveCamera(this.o.fov, 1, 0.01, 100);
      this.pivot = new T.Group();            // bobs
      this.tiltG = new T.Group();            // leans (staff on the diagonal)
      this.spinG = new T.Group();            // turns about the item's own axis
      this.tiltG.rotation.z = this.o.tilt;
      this.pivot.add(this.tiltG); this.tiltG.add(this.spinG);
      this.scene.add(this.pivot);
      this.shadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, toneMapped: false }));
      this.shadow.rotation.x = -Math.PI / 2;
      this.scene.add(this.shadow);

      this.angle = 0; this.vel = 0; this.dragging = false; this.idle = 0; this.t0 = performance.now();
      const r0 = el.getBoundingClientRect();
      this.visible = r0.bottom > -120 && r0.top < window.innerHeight + 120;   // the observer refines this
      this._bindInput(canvas);
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(el);
      this._io = new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; if (this.visible) this._kick(); }, { rootMargin: '120px' });
      this._io.observe(el);
      document.addEventListener('visibilitychange', () => this._kick());
      this._resize();
      if (this.o.src) this.load(this.o.src, { level: this.o.level || 0, roughness: this.o.roughness });
    }

    load(src, look) {
      const token = (this._token = (this._token || 0) + 1);
      this.el.classList.add('fv-loading');
      return loadGLB(src, this.o.skip).then((obj) => {
        if (token !== this._token) return;
        const wrap = new T.Group(); wrap.add(obj);
        if (look && look.level) obj.rotation.x = look.level;
        wrap.updateMatrixWorld(true);
        const box = new T.Box3().setFromObject(wrap), size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
        obj.position.sub(center);                     // centre on the pivot
        if (look && look.roughness !== undefined) {
          obj.traverse((m) => { if (m.material && m.material.metalness > 0.5) { m.material = m.material.clone(); m.material.roughness = look.roughness; } });
        }
        const holder = new T.Group(); holder.add(wrap);
        const old = this.model;
        this.model = holder; this.size = size;
        holder.userData.fade = 0;
        this._setOpacity(holder, 0);
        this.spinG.add(holder);
        if (old) { old.userData.fadeOut = 1; this._leaving = old; }
        this._frame();
        this.el.classList.remove('fv-loading');
        this.el.classList.add('fv-ready');
        this._kick();
      }).catch((e) => { this.el.classList.add('fv-error'); console.warn('viewer:', e.message); });
    }

    _setOpacity(obj, a) {
      obj.traverse((m) => {
        if (!m.material) return;
        if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.material.opacity;
        m.material.transparent = a < 1 || m.userData.baseOpacity < 1;
        m.material.opacity = m.userData.baseOpacity * a;
      });
    }

    _frame() {
      if (!this.size) return;
      const s = this.size, aspect = this.w / this.h || 1, fov = T.MathUtils.degToRad(this.camera.fov);
      const across = Math.max(s.x, s.z), t = this.o.tilt, c = Math.abs(Math.cos(t)), sn = Math.abs(Math.sin(t));
      const W = across * c + s.y * sn, H = across * sn + s.y * c;     // extents once leaned
      const needH = (H * this.o.fit) / (2 * Math.tan(fov / 2));
      const needW = (W * this.o.fit) / (2 * Math.tan(fov / 2) * aspect);
      const d = Math.max(needH, needW) + across * 0.5;
      const el = this.o.elevation;
      this.camera.position.set(0, Math.sin(el) * d + this.o.lift, Math.cos(el) * d);
      this.camera.lookAt(0, this.o.lift, 0);
      this.camera.near = d / 50; this.camera.far = d * 10; this.camera.updateProjectionMatrix();
      const sw = W * 0.7 + across * 0.35;
      this.shadow.scale.set(sw, Math.max(across * 1.05, sw * 0.3), 1);
      this.shadow.position.y = -H / 2 - H * 0.04;
    }

    _resize() {
      const r = this.el.getBoundingClientRect();
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.renderer.setSize(this.w, this.h, false);
      this.camera.aspect = this.w / this.h;
      this.camera.updateProjectionMatrix();
      this._frame();
      this._kick();
    }

    _bindInput(c) {
      let lastX = 0, lastT = 0;
      c.addEventListener('pointerdown', (e) => {
        this.dragging = true; lastX = e.clientX; lastT = performance.now(); this.vel = 0;
        c.setPointerCapture(e.pointerId); this.el.classList.add('fv-grab');
      });
      c.addEventListener('pointermove', (e) => {
        if (!this.dragging) return;
        const now = performance.now(), dx = e.clientX - lastX;
        this.angle += dx * 0.0085;
        this.vel = (dx * 0.0085) / Math.max(1, now - lastT) * 16;
        lastX = e.clientX; lastT = now; this.idle = 0; this._kick();
      });
      const up = () => { this.dragging = false; this.el.classList.remove('fv-grab'); };
      c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    }

    _kick() {
      if (this._raf || !this.visible || document.hidden) return;
      this._last = performance.now();
      const step = (now) => {
        this._raf = 0;
        if (!this.visible || document.hidden) return;
        const dt = Math.min(0.05, (now - this._last) / 1000); this._last = now;
        this._tick(dt, now);
        this.renderer.render(this.scene, this.camera);
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }

    _tick(dt, now) {
      if (!this.dragging) {
        this.idle += dt;
        this.angle += this.vel;
        this.vel *= Math.pow(0.04, dt);                   // inertia settles in about a second
        const spin = reduced ? this.o.spin * 0.25 : this.o.spin;
        const ease = Math.min(1, Math.max(0, (this.idle - 0.8) / 1.2));
        this.angle += spin * dt * ease;
      }
      this.spinG.rotation.y = this.angle;
      const t = (now - this.t0) / 1000;
      this.pivot.position.y = reduced || !this.size ? 0 : Math.sin(t * 0.9) * this.size.y * this.o.float;
      if (this.model && this.model.userData.fade < 1) {
        this.model.userData.fade = Math.min(1, this.model.userData.fade + dt * 2.2);
        const f = this.model.userData.fade;
        this._setOpacity(this.model, f);
        this.model.scale.setScalar(0.94 + 0.06 * (1 - Math.pow(1 - f, 3)));
      }
      if (this._leaving) {
        const o = this._leaving;
        o.userData.fadeOut -= dt * 3;
        if (o.userData.fadeOut <= 0) { this.spinG.remove(o); this._leaving = null; }
        else this._setOpacity(o, o.userData.fadeOut);
      }
    }
  }

  window.FousioViewer = FousioViewer;
})();
