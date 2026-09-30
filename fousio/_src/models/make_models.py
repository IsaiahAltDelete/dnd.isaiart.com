"""Regenerate the web models in this folder (see README.md).

    python make_models.py              staff + circlets + circlets.json, then verify
    python make_models.py staff        fixed-star.glb only
    python make_models.py circlets     circlet-*.glb + circlets.json only
    python make_models.py verify       re-check the GLBs already in this folder

Sources are only READ (paths resolved from the home folder; override with the
FOUSIO_CLAUDESTUFF / FOUSIO_DIVINE environment variables):
  BG3 Forge    ~/Documents/ClaudeStuff/bg3forge   (node export_cli.js ... --glb)
  Mod source   ~/Documents/ClaudeStuff/modworkshop/isaiahsartifacts/src
  Divine.exe   ~/Documents/BG3Modding/Packed/Tools/Divine.exe   (LSLib, the Granny-enabled copy)
Intermediates (LSX, DAE, the forge GLB) go to a temp folder that is deleted afterwards.

Every GLB written here is glTF 2.0 binary, Y up, metres, bbox centred on the origin,
front facing +Z, nodes without transforms (baked), float32 POSITION + NORMAL,
uint16/uint32 indices, no textures / skins / animations / compression. Standard
library only.
"""
import json
import math
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
DOCS = os.path.join(os.path.expanduser('~'), 'Documents')
WORKSPACE = os.environ.get('FOUSIO_CLAUDESTUFF', os.path.join(DOCS, 'ClaudeStuff'))
DIVINE = os.environ.get('FOUSIO_DIVINE', os.path.join(DOCS, 'BG3Modding', 'Packed', 'Tools', 'Divine.exe'))
FORGE = os.path.join(WORKSPACE, 'bg3forge')
FORGE_MODEL = 'models/lib/staff-gold-star.js'            # defines 'Staff of the Fixed Star'
MOD = os.path.join(WORKSPACE, 'modworkshop', 'isaiahsartifacts', 'src')
MODULE = os.path.join(MOD, 'Public', 'IsaiahsArtifacts')
LOCA = os.path.join(MOD, 'Localization', 'English', 'IsaiahsArtifacts.loca.xml')
BANK_DIR = os.path.join(MODULE, 'Content', 'Assets', 'Characters', '[PAK]_DizzyWearables')

# The evolving circlet and its look variants: (stats entry, letter used in file names).
# The letter is the one in the in-game name ("Circlet of Nous E" is the D_Polished entry).
CIRCLET_ENTRIES = [
    'ART_CircletOfNous_Evolving', 'ART_CircletOfNous_Evolving_B', 'ART_CircletOfNous_Evolving_C',
    'ART_CircletOfNous_Evolving_D', 'ART_CircletOfNous_Evolving_D_Polished',
    'ART_CircletOfNous_Evolving_F', 'ART_CircletOfNous_Evolving_G',
    'ART_CircletOfNous_Evolving_H', 'ART_CircletOfNous_Evolving_I',
]
HUMAN_MALE = '7d73f501-f65e-46af-a13b-2cacf3985d05'       # race key of the braille crown visuals

# One line each, after modworkshop/braillecrown/make_crown.py VARIANTS (and a look at the meshes).
MESH_NOTES = {
    'Braille_Crown_HUM_M': 'wide: four ribbons (9/14/10 mm, a 7 mm one at the back) that merge and part, '
                           'lens-shaped openings at the temples',
    'Braille_Crown_Peak_HUM_M': 'peak: triple band, the top ribbon parts into a low arch over the brow',
    'Braille_Crown_Lens_HUM_M': 'lens: triple band, parts widest at the brow, merges behind the ears',
    'Braille_Crown_Open_HUM_M': 'open: the wide crown with nothing on the forehead, ribbons end at the temples',
    'Braille_Crown_Straight_HUM_M': 'straight: three parallel ribbons (7/14/7 mm), constant 2.5 mm gap',
    'Braille_Crown_StraightOpen_HUM_M': 'straight-open: the straight triple band with an open front',
    'Braille_Crown_Loop_HUM_M': 'loop: one ribbon round the back, hairpins at the temples, returns as a lower band',
}

PART_NAMES = {'Crown_Body': 'crown-body', 'Crown_Dots': 'braille-dots'}

# Staff: BG3 Forge palette key -> web material name
STAFF_MATERIALS = {'gold': 'gold', 'goldAged': 'gold-aged', 'silver': 'silver',
                   'amber': 'amber-gem', 'leatherBlack': 'leather-black'}


# =================================================================== small helpers

def log(*a):
    print(*a, flush=True)


def divine(*args):
    cmd = [DIVINE, '-g', 'bg3'] + [str(a) for a in args]
    r = subprocess.run(cmd, capture_output=True, text=True)
    text = r.stdout + r.stderr
    if r.returncode != 0 or '[FATAL]' in text or '[ERROR]' in text:
        raise SystemExit('Divine failed: %s\n%s' % (' '.join(cmd), text))


def convert(src, tmp, ext):
    """Divine chokes on '[PAK]' and apostrophes in paths, so work on a plain copy."""
    base = os.path.splitext(os.path.basename(src))[0].replace('[', '_').replace(']', '_')
    plain = os.path.join(tmp, base + os.path.splitext(src)[1])
    shutil.copy2(src, plain)
    dst = os.path.join(tmp, base + ext)
    divine('-a', 'convert-resource' if ext == '.lsx' else 'convert-model', '-s', plain, '-d', dst)
    return dst


def lsx_attrs(node):
    out = {}
    for a in node.findall('attribute'):
        out[a.get('id')] = a.get('value') if a.get('value') is not None else a.get('handle')
    return out


def lsx_resources(path):
    root = ET.parse(path).getroot()
    return {lsx_attrs(n).get('ID'): n for n in root.iter('node') if n.get('id') == 'Resource'}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def dds_block_colour(path):
    """First texel colour of a BC1/BC3 DDS (the crown textures are solid colours)."""
    data = open(path, 'rb').read()
    if data[:4] != b'DDS ':
        raise SystemExit('not a DDS: ' + path)
    fourcc = data[84:88]
    off = 128 + (8 if fourcc == b'DXT5' else 0)
    if fourcc not in (b'DXT1', b'DXT5'):
        raise SystemExit('unexpected DDS format %r in %s' % (fourcc, path))
    c = struct.unpack_from('<H', data, off)[0]
    return ((c >> 11) & 31) / 31.0, ((c >> 5) & 63) / 63.0, (c & 31) / 31.0


def r4(v):
    return round(float(v), 4)


# =================================================================== GLB in / out

def pad4(b, fill=b'\0'):
    return b + fill * ((4 - len(b) % 4) % 4)


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67 or version != 2 or length != len(data):
        raise SystemExit('bad GLB header: ' + path)
    jlen, jtype = struct.unpack_from('<II', data, 12)
    gltf = json.loads(data[20:20 + jlen].decode('utf-8'))
    blen, btype = struct.unpack_from('<II', data, 20 + jlen)
    binary = data[28 + jlen:28 + jlen + blen]
    return gltf, binary


def accessor_values(gltf, binary, index):
    acc = gltf['accessors'][index]
    view = gltf['bufferViews'][acc['bufferView']]
    width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[acc['type']]
    fmt = {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[acc['componentType']]
    size = struct.calcsize(fmt)
    stride = view.get('byteStride', size * width)
    start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
    out = []
    for i in range(acc['count']):
        out.extend(struct.unpack_from('<%d%s' % (width, fmt), binary, start + i * stride))
    return out


def write_glb(path, parts, materials, generator):
    """parts: [{name, material (index), pos [floats], nrm [floats], idx [ints]}]
    materials: glTF material dicts. One node + mesh per part, no transforms."""
    gltf = {'asset': {'version': '2.0', 'generator': generator},
            'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
            'materials': materials, 'accessors': [], 'bufferViews': [], 'buffers': []}
    used = sorted({k for m in materials for k in m.get('extensions', {})})
    if used:
        gltf['extensionsUsed'] = used
    blob = bytearray()

    def view(raw, target):
        while len(blob) % 4:
            blob.append(0)
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': len(blob), 'byteLength': len(raw), 'target': target})
        blob.extend(raw)
        return len(gltf['bufferViews']) - 1

    def accessor(v, ctype, count, typ, lo=None, hi=None):
        a = {'bufferView': v, 'componentType': ctype, 'count': count, 'type': typ}
        if lo is not None:
            a['min'], a['max'] = lo, hi
        gltf['accessors'].append(a)
        return len(gltf['accessors']) - 1

    for p in parts:
        n = len(p['pos']) // 3
        pos32 = struct.pack('<%df' % len(p['pos']), *p['pos'])
        # min/max from the float32 values actually stored, as the spec asks
        f32 = struct.unpack('<%df' % len(p['pos']), pos32)
        lo = [min(f32[k::3]) for k in range(3)]
        hi = [max(f32[k::3]) for k in range(3)]
        a_pos = accessor(view(pos32, 34962), 5126, n, 'VEC3', lo, hi)
        a_nrm = accessor(view(struct.pack('<%df' % len(p['nrm']), *p['nrm']), 34962), 5126, n, 'VEC3')
        if n <= 65535:
            a_idx = accessor(view(struct.pack('<%dH' % len(p['idx']), *p['idx']), 34963), 5123, len(p['idx']), 'SCALAR')
        else:
            a_idx = accessor(view(struct.pack('<%dI' % len(p['idx']), *p['idx']), 34963), 5125, len(p['idx']), 'SCALAR')
        gltf['meshes'].append({'name': p['name'], 'primitives': [{
            'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm},
            'indices': a_idx, 'material': p['material'], 'mode': 4}]})
        gltf['nodes'].append({'name': p['name'], 'mesh': len(gltf['meshes']) - 1})
        gltf['scenes'][0]['nodes'].append(len(gltf['nodes']) - 1)

    while len(blob) % 4:
        blob.append(0)
    gltf['buffers'].append({'byteLength': len(blob)})
    js = pad4(json.dumps(gltf, separators=(',', ':')).encode('utf-8'), b' ')
    total = 12 + 8 + len(js) + 8 + len(blob)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(blob), 0x004E4942) + bytes(blob))


def centre(parts):
    """Move the combined bbox centre of all parts to the origin (baked)."""
    lo = [min(min(p['pos'][k::3]) for p in parts) for k in range(3)]
    hi = [max(max(p['pos'][k::3]) for p in parts) for k in range(3)]
    c = [(lo[k] + hi[k]) / 2 for k in range(3)]
    for p in parts:
        p['pos'] = [v - c[i % 3] for i, v in enumerate(p['pos'])]
    return [hi[k] - lo[k] for k in range(3)], c


def unit(x, y, z):
    d = math.sqrt(x * x + y * y + z * z) or 1.0
    return x / d, y / d, z / d


# =================================================================== the staff

def forge_material(name):
    """The fields of one BG3 Forge palette entry (js/materials.js), as strings."""
    src = open(os.path.join(FORGE, 'js', 'materials.js'), encoding='utf-8').read()
    m = re.search(r'\b%s:\s*\{([^}]*)\}' % re.escape(name), src)
    return dict(re.findall(r'(\w+):\s*([0-9.a-fA-Fx]+)', m.group(1))) if m else {}


def build_staff(out_dir, tmp):
    """BG3 Forge's own GLB, exported in MODEL space (Y up, the star at +Y, its face at
    +Z), then centred, with materials renamed and the amber gem made transmissive."""
    log('staff: node export_cli.js %s --glb' % FORGE_MODEL)
    r = subprocess.run(['node', 'export_cli.js', FORGE_MODEL, '--out', tmp, '--glb', '--audit'],
                       cwd=FORGE, capture_output=True, text=True)
    log('  ' + '\n  '.join(l for l in r.stdout.splitlines() if l.strip() and not l.strip().startswith(tmp)))
    if r.returncode != 0:
        raise SystemExit('export_cli failed:\n' + r.stdout + r.stderr)
    gltf, binary = read_glb(os.path.join(tmp, 'Staff_of_the_Fixed_Star.glb'))

    materials, remap = [], {}
    for i, m in enumerate(gltf['materials']):
        pbr = m['pbrMetallicRoughness']
        out = {'name': STAFF_MATERIALS.get(m['name'], m['name']),
               'pbrMetallicRoughness': {'baseColorFactor': [r4(v) for v in pbr['baseColorFactor'][:3]] + [1.0],
                                        'metallicFactor': pbr['metallicFactor'],
                                        'roughnessFactor': pbr['roughnessFactor']}}
        if 'emissiveFactor' in m:
            out['emissiveFactor'] = [r4(v) for v in m['emissiveFactor']]
        spec = forge_material(m['name'])
        if 'trans' in spec:
            # the forge's own GLB writer can only say "trans" as alpha blending; glTF has the
            # real thing (materials.js amber: trans 0.70, ior 1.55)
            out['extensions'] = {'KHR_materials_transmission': {'transmissionFactor': float(spec['trans'])},
                                 'KHR_materials_ior': {'ior': float(spec.get('ior', 1.5))}}
        remap[i] = len(materials)
        materials.append(out)

    parts, fixed = [], 0
    for node in gltf['nodes']:
        prim = gltf['meshes'][node['mesh']]['primitives'][0]
        pos = accessor_values(gltf, binary, prim['attributes']['POSITION'])
        nrm = accessor_values(gltf, binary, prim['attributes']['NORMAL'])
        idx = accessor_values(gltf, binary, prim['indices'])
        verts = [tuple(pos[i:i + 3]) + unit(*nrm[i:i + 3]) for i in range(0, len(pos), 3)]
        fixed += repair_normals(verts, idx, [tuple(round(c, 7) for c in v[:3]) for v in verts])
        part = compact(node['name'], verts, idx, flip_z=False)
        part['material'] = remap[prim['material']]
        parts.append(part)
    size, c = centre(parts)
    path = os.path.join(out_dir, 'fixed-star.glb')
    write_glb(path, parts, materials, 'BG3 Forge staff-gold-star.js, model space, centred (make_models.py)')
    log('  -> fixed-star.glb  %.1f KB  size %.3f x %.3f x %.3f m  (moved by %s; %d corner normals repaired)'
        % (os.path.getsize(path) / 1024, size[0], size[1], size[2], [round(-v, 4) for v in c], fixed))


# =================================================================== the circlets

def trace_circlets(tmp):
    """stats entry -> RootTemplate -> visual (human male) -> GR2 + material -> finish."""
    stats = {}
    data_dir = os.path.join(MODULE, 'Stats', 'Generated', 'Data')
    for fn in sorted(os.listdir(data_dir)):
        cur = None
        for line in open(os.path.join(data_dir, fn), encoding='utf-8'):
            line = line.strip()
            if line.startswith('new entry '):
                cur = line.split('"')[1]
            elif cur and line.startswith('data "RootTemplate"'):
                stats[cur] = line.split('"')[3]
    loca = {c.get('contentuid'): (c.text or '') for c in ET.parse(LOCA).getroot().iter('content')}

    templates = {}
    for go in ET.parse(convert(os.path.join(MODULE, 'RootTemplates', '_merged.lsf'), tmp, '.lsx')).getroot().iter('node'):
        if go.get('id') == 'GameObjects':
            a = lsx_attrs(go)
            templates[a.get('MapKey')] = (a, go)
    visuals = lsx_resources(convert(os.path.join(BANK_DIR, 'Dizzy_Visuals.lsf'), tmp, '.lsx'))
    mats = lsx_resources(convert(os.path.join(BANK_DIR, 'Dizzy_Materials.lsf'), tmp, '.lsx'))
    texs = lsx_resources(convert(os.path.join(BANK_DIR, 'Dizzy_Textures.lsf'), tmp, '.lsx'))

    def texture_file(tex_id):
        return os.path.join(MOD, lsx_attrs(texs[tex_id])['SourceFile'].replace('/', os.sep))

    rows = []
    for entry in CIRCLET_ENTRIES:
        uid = stats[entry]
        a, go = templates[uid]
        visual_id = None
        for vis_list in go.iter('node'):
            if vis_list.get('id') != 'Visuals':
                continue
            for obj in vis_list.iter('node'):
                if obj.get('id') == 'Object' and lsx_attrs(obj).get('MapKey') == HUMAN_MALE:
                    visual_id = lsx_attrs(obj.find('children/node')).get('Object')
        if visual_id not in visuals:
            raise SystemExit('%s: human-male visual %s not in Dizzy_Visuals' % (entry, visual_id))
        va = lsx_attrs(visuals[visual_id])
        objects = []
        for o in visuals[visual_id].iter('node'):
            if o.get('id') == 'Objects':
                oa = lsx_attrs(o)
                if oa.get('LOD') == '0':
                    objects.append((oa['ObjectID'].split('.')[1], oa['MaterialID']))
        mat_ids = {m for _, m in objects}
        if len(mat_ids) != 1:
            raise SystemExit('%s: expected one material, got %s' % (entry, mat_ids))
        mnode = mats[mat_ids.pop()]
        params = {}
        for p in mnode.iter('node'):
            pa = lsx_attrs(p)
            if 'ParameterName' in pa:
                params[pa['ParameterName']] = pa.get('ID') or pa.get('Value')
        metal_r, rough, _ = dds_block_colour(texture_file(params['physicalmap']))
        albedo = [srgb_to_linear(c) for c in dds_block_colour(texture_file(params['basecolor']))]
        tint = [float(x) for x in params['Metal_Primary'].split()]
        rows.append({
            'stats': entry, 'rootTemplate': uid, 'displayName': loca.get(a.get('DisplayName'), ''),
            'visual': va['Name'], 'mesh': os.path.basename(va['SourceFile']),
            'meshPath': va['SourceFile'], 'objects': [o for o, _ in objects],
            'bg3Material': lsx_attrs(mnode)['Name'],
            'metallic': round(metal_r, 3), 'roughness': round(rough, 3),
            'baseColor': [round(albedo[k] * tint[k], 4) for k in range(3)],
        })
    return rows


WELD_COS = math.cos(math.radians(1.0))


def dae_parts(path):
    """Crown_Body / Crown_Dots from a Divine GR2->DAE conversion: bind-pose positions
    (the skin is 100 % Head_M with identity bind shape), the GR2's own vertex normals.

    The GR2 splits a vertex wherever its tangent frame or UV differs, so most positions
    carry several normals that agree to well under a degree. Those are welded (1 degree,
    averaged); real creases (the bevels, 20+ degrees apart) stay split. That quarters the
    vertex count without changing the shading."""
    C = '{http://www.collada.org/2005/11/COLLADASchema}'
    root = ET.parse(path).getroot()
    parts = []
    for g in root.find(C + 'library_geometries').findall(C + 'geometry'):
        m = g.find(C + 'mesh')
        src = {s.get('id'): [float(x) for x in s.find(C + 'float_array').text.split()]
               for s in m.findall(C + 'source')}
        pos = src[m.find(C + 'vertices').find(C + 'input').get('source')[1:]]
        clusters = {}          # position index -> [[representative normal, normal sum, vertex id]]
        sums, idx = [], []
        for t in m.findall(C + 'triangles'):
            inputs = t.findall(C + 'input')
            stride = max(int(i.get('offset')) for i in inputs) + 1
            ov = [int(i.get('offset')) for i in inputs if i.get('semantic') == 'VERTEX'][0]
            ni = [i for i in inputs if i.get('semantic') == 'NORMAL'][0]
            on, nrm = int(ni.get('offset')), src[ni.get('source')[1:]]
            p = [int(x) for x in t.find(C + 'p').text.split()]
            for k in range(0, len(p), stride):
                vi, n = p[k + ov], p[k + on]
                nv = unit(nrm[3 * n], nrm[3 * n + 1], nrm[3 * n + 2])
                for c in clusters.setdefault(vi, []):
                    r = c[0]
                    if r[0] * nv[0] + r[1] * nv[1] + r[2] * nv[2] >= WELD_COS:
                        break
                else:
                    c = [nv, None, len(sums)]
                    clusters[vi].append(c)
                    sums.append([vi, 0.0, 0.0, 0.0])
                s = sums[c[2]]
                s[1] += nv[0]
                s[2] += nv[1]
                s[3] += nv[2]
                idx.append(c[2])
        verts = [(pos[3 * vi], pos[3 * vi + 1], pos[3 * vi + 2]) + unit(sx, sy, sz) for vi, sx, sy, sz in sums]
        fixed = repair_normals(verts, idx, [s[0] for s in sums])
        parts.append({'name': g.get('name'), 'verts': verts, 'idx': idx, 'repaired': fixed})
    return parts


BAD_COS = math.cos(math.radians(60.0))      # a corner this far off its own face is wrong
GROUP_COS = math.cos(math.radians(40.0))    # the crowns' smooth-by-angle rule (braillecrown)
SLIVER = 1e-6                               # triangles thinner than 1 micron: no usable face normal


def face_normal(p):
    """Unit normal of triangle p (three points), or None for a sliver."""
    e1 = [p[1][k] - p[0][k] for k in range(3)]
    e2 = [p[2][k] - p[0][k] for k in range(3)]
    cr = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
    twice_area = math.sqrt(cr[0] ** 2 + cr[1] ** 2 + cr[2] ** 2)
    longest = max(math.dist(p[0], p[1]), math.dist(p[1], p[2]), math.dist(p[2], p[0]))
    if longest == 0 or twice_area / longest < SLIVER:
        return None
    return tuple(c / twice_area for c in cr)


def repair_normals(verts, idx, vpos):
    """Some shipped vertex normals point up to 150 degrees away from the faces that use
    them (strips across the ribbon tops carrying the outer wall's normal; they render as
    dark bars). A smooth-by-40-degrees mesh never has a corner more than ~40 degrees off
    its own face, so any corner past 60 gets the angle-weighted normal of the faces at
    that position within 40 degrees of its face, as a new vertex. Positions untouched;
    returns the number of corners changed."""
    face_n, corner_w = [], []
    at_pos = {}
    for t in range(0, len(idx), 3):
        p = [verts[i][:3] for i in idx[t:t + 3]]
        face_n.append(face_normal(p))
        ws = []
        for c in range(3):
            a = [p[(c + 1) % 3][k] - p[c][k] for k in range(3)]
            b = [p[(c + 2) % 3][k] - p[c][k] for k in range(3)]
            la, lb = math.sqrt(sum(v * v for v in a)), math.sqrt(sum(v * v for v in b))
            ws.append(math.acos(max(-1.0, min(1.0, sum(a[k] * b[k] for k in range(3)) / (la * lb)))) if la * lb > 0 else 0.0)
            at_pos.setdefault(vpos[idx[t + c]], []).append((t // 3, c))
        corner_w.append(ws)
    new_keys, fixed = {}, 0
    for t in range(len(face_n)):
        f = face_n[t]
        if f is None:
            continue
        for c in range(3):
            v = idx[3 * t + c]
            n = verts[v][3:]
            if f[0] * n[0] + f[1] * n[1] + f[2] * n[2] >= BAD_COS:
                continue
            s = [0.0, 0.0, 0.0]
            for t2, c2 in at_pos[vpos[v]]:
                g = face_n[t2]
                if g is not None and f[0] * g[0] + f[1] * g[1] + f[2] * g[2] >= GROUP_COS:
                    w = corner_w[t2][c2]
                    s = [s[k] + w * g[k] for k in range(3)]
            nn = unit(*s) if any(s) else f
            key = (vpos[v], round(nn[0], 4), round(nn[1], 4), round(nn[2], 4))
            if key not in new_keys:
                new_keys[key] = len(verts)
                verts.append(verts[v][:3] + nn)
            idx[3 * t + c] = new_keys[key]
            fixed += 1
    return fixed


def game_to_web(parts):
    """BG3 game space is LEFT-handed: in the vanilla body the Wrist_L bone is at +X while
    the toes point at -Z, so a right-handed viewer shows every game mesh mirrored.
    z -> -z both undoes that mirror and turns the front (game -Z) to glTF's +Z. It is a
    reflection, so the triangle winding is reversed to keep front faces outward.
    Checked against in-game photos: crown A's lopsided openings (a lens under the top
    ribbon on the wearer's right, a big one under the braille band on the left) land on
    the same sides here; the braille runs left to right seen from the front."""
    out = []
    for p in parts:
        part = compact(PART_NAMES.get(p['name'], p['name']), p['verts'], p['idx'], flip_z=True)
        part['repaired'] = p.get('repaired', 0)
        out.append(part)
    return out


def compact(name, verts, idx, flip_z):
    """Flat pos/nrm/idx lists, dropping vertices no triangle uses. flip_z: z -> -z with the
    winding reversed (see game_to_web)."""
    remap = {}
    for i in idx:
        remap.setdefault(i, len(remap))
    pos, nrm = [], []
    s = -1 if flip_z else 1
    for v in sorted(remap, key=remap.get):
        x, y, z, nx, ny, nz = verts[v]
        pos += [x, y, s * z]
        nrm += [nx, ny, s * nz]
    out_idx = []
    for i in range(0, len(idx), 3):
        a, b, c = (remap[v] for v in idx[i:i + 3])
        out_idx += [a, c, b] if flip_z else [a, b, c]
    return {'name': name, 'pos': pos, 'nrm': nrm, 'idx': out_idx}


def worn_tilt(part):
    """Degrees the ring rises toward the front (+Z), from the normal of its best-fit plane
    (principal axis of least spread of the crown body's vertices). Rotating about X by
    +this turns that normal to +Y, i.e. levels the ring."""
    p = part['pos']
    n = len(p) // 3
    mean = [sum(p[k::3]) / n for k in range(3)]
    cov = [[sum((p[3 * i + a] - mean[a]) * (p[3 * i + b] - mean[b]) for i in range(n)) / n for b in range(3)]
           for a in range(3)]

    def det(m):
        return (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))
    v = [0.0, 1.0, 0.0]                      # inverse iteration -> eigenvector of the smallest eigenvalue
    d = det(cov)
    for _ in range(60):
        w = [det([[v[r] if c == col else cov[r][c] for c in range(3)] for r in range(3)]) / d for col in range(3)]
        s = math.sqrt(sum(x * x for x in w))
        v = [x / s for x in w]
    if v[1] < 0:
        v = [-x for x in v]
    return math.degrees(math.atan2(-v[2], v[1]))


def gold_material(name, row):
    return {'name': name, 'pbrMetallicRoughness': {
        'baseColorFactor': row['baseColor'] + [1.0],
        'metallicFactor': row['metallic'], 'roughnessFactor': row['roughness']}}


def build_circlets(out_dir, tmp):
    rows = trace_circlets(tmp)
    for r in rows:
        r['letter'] = r['displayName'].split()[-1] if r['displayName'].startswith('Circlet of Nous ') else r['stats'][-1]
        r['finish'] = 'matte' if r['roughness'] > 0.45 else 'polished'
    # one file per distinct mesh; it carries the finish of the polished variant if the mesh
    # has one (the shipped look the page most likely wants), else the only variant's finish
    by_mesh = {}
    for r in rows:
        by_mesh.setdefault(r['mesh'], []).append(r)
    files = {}
    for mesh, group in by_mesh.items():
        carrier = next((r for r in group if r['finish'] == 'polished'), group[0])
        fname = 'circlet-%s.glb' % carrier['letter'].lower()
        log('circlet %s: %s  (%s)' % (fname, mesh, ', '.join('%s %s' % (r['letter'], r['finish']) for r in group)))
        dae = convert(os.path.join(MOD, carrier['meshPath'].replace('/', os.sep)), tmp, '.dae')
        parts = game_to_web(dae_parts(dae))
        for p in parts:
            p['material'] = 0
        size, was = centre(parts)
        write_glb(os.path.join(out_dir, fname), parts, [gold_material('gold-' + carrier['finish'], carrier)],
                  '%s (Fousio\'s Tome of Items), game space -> web (make_models.py)' % mesh)
        files[fname] = {'mesh': mesh, 'design': MESH_NOTES.get(os.path.splitext(mesh)[0], ''),
                        'material': 'gold-' + carrier['finish'],
                        'tris': sum(len(p['idx']) // 3 for p in parts),
                        'parts': [p['name'] for p in parts],
                        'sizeMetres': [round(s, 4) for s in size],
                        'wornCentre': [round(v, 4) for v in was],
                        'wornTiltDeg': round(worn_tilt(next(p for p in parts if p['name'] == 'crown-body')), 1),
                        'normalsRepaired': sum(p['repaired'] for p in parts),
                        'bytes': os.path.getsize(os.path.join(out_dir, fname))}
        for r in group:
            r['file'] = fname
        log('  -> %s  %.1f KB  %d tris  size %.3f x %.3f x %.3f m  (%d corner normals repaired)'
            % (fname, files[fname]['bytes'] / 1024, files[fname]['tris'], size[0], size[1], size[2],
               files[fname]['normalsRepaired']))

    finishes = {}
    for r in rows:
        finishes.setdefault(r['finish'], {'material': 'gold-' + r['finish'], 'bg3Material': r['bg3Material'],
                                          'baseColorFactor': r['baseColor'] + [1.0],
                                          'metallicFactor': r['metallic'], 'roughnessFactor': r['roughness']})
    doc = {
        'about': 'Circlet of Nous looks from Fousio\'s Tome of Items (BG3 mod): one entry per stats entry, '
                 'one GLB per distinct mesh. Variants sharing a mesh differ only in finish; when a variant\'s '
                 'finish is not the one baked into its file, apply that finish\'s factors from "finishes".',
        'space': 'Y up, metres, bbox centred on the origin, front of the head at +Z, as worn: the ring rises '
                 'wornTiltDeg toward the brow, like vanilla circlets (rotate about X by +wornTiltDeg to level '
                 'it; three.js rotation.x = wornTiltDeg * Math.PI / 180). wornCentre is where the bbox centre '
                 'sat on the vanilla human-male head (same axes, feet at y 0).',
        'variants': [{
            'letter': r['letter'], 'stats': r['stats'], 'displayName': r['displayName'],
            'file': r['file'], 'mesh': r['mesh'], 'finish': r['finish'],
            'rootTemplate': r['rootTemplate'], 'visual': r['visual'],
        } for r in rows],
        'files': files,
        'finishes': finishes,
    }
    with open(os.path.join(out_dir, 'circlets.json'), 'w', encoding='utf-8') as f:
        f.write(json_text(doc) + '\n')
    log('  -> circlets.json (%d variants, %d files)' % (len(rows), len(files)))


def json_text(o, depth=0):
    """json.dumps(indent=2), but arrays of plain values stay on one line."""
    pad = '  ' * depth
    if isinstance(o, dict):
        return '{\n' + ',\n'.join('%s  %s: %s' % (pad, json.dumps(k), json_text(v, depth + 1))
                                  for k, v in o.items()) + '\n' + pad + '}'
    if isinstance(o, list) and any(isinstance(v, (dict, list)) for v in o):
        return '[\n' + ',\n'.join(pad + '  ' + json_text(v, depth + 1) for v in o) + '\n' + pad + ']'
    return json.dumps(o, ensure_ascii=False)


# =================================================================== verification

def verify(out_dir):
    """Re-read every GLB and check it against the loader's constraints."""
    ok = True
    for fn in sorted(f for f in os.listdir(out_dir) if f.endswith('.glb')):
        path = os.path.join(out_dir, fn)
        gltf, binary = read_glb(path)
        problems = []
        for key in ('images', 'textures', 'samplers', 'skins', 'animations', 'cameras', 'extensionsRequired'):
            if gltf.get(key):
                problems.append('has ' + key)
        allowed = {'KHR_materials_transmission', 'KHR_materials_ior', 'KHR_materials_emissive_strength'}
        if set(gltf.get('extensionsUsed', [])) - allowed:
            problems.append('extensions %s' % gltf['extensionsUsed'])
        for n in gltf['nodes']:
            if set(n) - {'name', 'mesh'}:
                problems.append('node %s has %s' % (n.get('name'), sorted(set(n) - {'name', 'mesh'})))
        for m in gltf['materials']:
            if not m.get('name'):
                problems.append('unnamed material')
        lo, hi, tris, bad_n, flipped, off = [1e9] * 3, [-1e9] * 3, 0, 0, 0, 0
        for mesh in gltf['meshes']:
            for prim in mesh['primitives']:
                if set(prim['attributes']) - {'POSITION', 'NORMAL', 'TEXCOORD_0'}:
                    problems.append('attributes %s' % sorted(prim['attributes']))
                for sem in ('POSITION', 'NORMAL'):
                    if gltf['accessors'][prim['attributes'][sem]]['componentType'] != 5126:
                        problems.append(sem + ' not float32')
                if gltf['accessors'][prim['indices']]['componentType'] not in (5123, 5125):
                    problems.append('indices not uint16/uint32')
                if prim.get('mode', 4) != 4:
                    problems.append('not triangles')
                pos = accessor_values(gltf, binary, prim['attributes']['POSITION'])
                nrm = accessor_values(gltf, binary, prim['attributes']['NORMAL'])
                idx = accessor_values(gltf, binary, prim['indices'])
                for k in range(3):
                    lo[k] = min(lo[k], min(pos[k::3]))
                    hi[k] = max(hi[k], max(pos[k::3]))
                bad_n += sum(1 for i in range(0, len(nrm), 3)
                             if abs(nrm[i] ** 2 + nrm[i + 1] ** 2 + nrm[i + 2] ** 2 - 1) > 1e-3)
                for i in range(0, len(idx), 3):
                    fu = face_normal([pos[3 * j:3 * j + 3] for j in idx[i:i + 3]])
                    if fu is None:
                        continue                       # sliver: invisible, no meaningful normal
                    vn = [sum(nrm[3 * j + k] for j in idx[i:i + 3]) for k in range(3)]
                    if fu[0] * vn[0] + fu[1] * vn[1] + fu[2] * vn[2] < 0:
                        flipped += 1
                    off += sum(1 for j in idx[i:i + 3]
                               if fu[0] * nrm[3 * j] + fu[1] * nrm[3 * j + 1] + fu[2] * nrm[3 * j + 2] < BAD_COS)
                tris += len(idx) // 3
        centre_ = [(lo[k] + hi[k]) / 2 for k in range(3)]
        if max(abs(v) for v in centre_) > 1e-5:
            problems.append('bbox centre %s' % [round(v, 6) for v in centre_])
        if bad_n:
            problems.append('%d non-unit normals' % bad_n)
        if flipped:
            problems.append('%d of %d triangles wound against their normals' % (flipped, tris))
        if off:
            problems.append('%d corner normals more than 60 degrees off their face' % off)
        mats = ', '.join('%s(m%.2g r%.3g%s)' % (m['name'], m['pbrMetallicRoughness']['metallicFactor'],
                                                m['pbrMetallicRoughness']['roughnessFactor'],
                                                ' +transmission' if 'KHR_materials_transmission' in m.get('extensions', {}) else '')
                         for m in gltf['materials'])
        log('%-18s %7.1f KB %6d tris %2d parts  %.3f x %.3f x %.3f m  %s  %s'
            % (fn, os.path.getsize(path) / 1024, tris, len(gltf['nodes']), hi[0] - lo[0], hi[1] - lo[1],
               hi[2] - lo[2], mats, 'OK' if not problems else 'PROBLEMS: ' + '; '.join(problems)))
        ok = ok and not problems
    listing = os.path.join(out_dir, 'circlets.json')
    if os.path.exists(listing):
        doc = json.load(open(listing, encoding='utf-8'))
        missing = sorted({v['file'] for v in doc['variants']} - set(os.listdir(out_dir)))
        log('circlets.json: %s%s' % (', '.join('%s=%s(%s)' % (v['letter'], v['file'], v['finish'])
                                               for v in doc['variants']),
                                     ('  MISSING: %s' % missing) if missing else '  OK'))
        ok = ok and not missing
    return ok


def main():
    args = sys.argv[1:]
    out_dir = HERE
    if '--out' in args:
        out_dir = os.path.abspath(args[args.index('--out') + 1])
        del args[args.index('--out'):args.index('--out') + 2]
    os.makedirs(out_dir, exist_ok=True)
    what = args or ['staff', 'circlets']
    if what == ['verify']:
        raise SystemExit(0 if verify(out_dir) else 'verification failed')
    tmp = tempfile.mkdtemp(prefix='fousio_models_')
    try:
        if 'staff' in what:
            build_staff(out_dir, tmp)
        if 'circlets' in what:
            build_circlets(out_dir, tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if not verify(out_dir):
        raise SystemExit('verification failed')


if __name__ == '__main__':
    main()
