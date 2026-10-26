"""The .pxa sprite format: parse, validate, serialize.

    @name   fx-torch-flame       # also the sprite id the game registers
    @use    chr16                # load a built-in palette's key->color map
    @scale  12                   # default render scale
    @fps    8                    # default frame rate (a frame's dur= wins)
    @size   16x24                # frame size; needed only when layers are offset
    @ramp   fire fire 5 12345    # 5 keys, dark -> light, from palette.js RAMPS.fire
    @ramp   wood #8a5a34 4 abcd shift=16   # or from ramp('#8a5a34', 4, {shift:16})
    @palette                     # per-file additions/overrides
    c #7fd4ff cape               # <key> <#hex | transparent | TOKEN> [note]
    a MAIN                       # an UPPERCASE colorway token: recoloured in game
    @anchor 8,23                 # the point that sits on the world (metadata)
    @point  flame 8,6            # named attachment points (metadata)
    @anim   burn burn-0 burn-1 burn-2 loop=1
    @recolor fire magic          # also register one sprite per damage-type ramp
    @export frames SATCHEL src/render/satchel-art.js   # legacy shape / path
    @lint   skip=orphan,stray colors=12
    @frame burn-0 dur=100        # or a bare @grid for a single-frame sprite
    ....KKKK....                 # rows straight after @frame: the base layer
    @layer flame at=2,0          # more layers, stacked bottom to top
    ..33..
    @layer bowl                  # a layer with no rows repeats its last grid

'.' is transparent unless the file redefines it. Full-line '#' comments are
stripped outside grid blocks only, so '#' is a legal palette key -- though
`validate` warns about it, since a comment and a grid row would look alike.
"""

import re
from collections import OrderedDict

from . import color as colors
from . import palettes

TRANSPARENT = (0, 0, 0, 0)
_TRANSPARENT_WORDS = ("transparent", "none", "clear", "-")
_RGBA = re.compile(r"^rgba?\(([^)]*)\)$")


class PxaError(Exception):
    pass


def parse_color(tok):
    """'#rgb' | '#rrggbb' | '#rrggbbaa' | 'rgba(r,g,b,a)' | 'transparent' -> (r,g,b,a)."""
    t = tok.strip().lower()
    if t in _TRANSPARENT_WORDS:
        return TRANSPARENT
    m = _RGBA.match(t.replace(" ", ""))
    if m:
        p = [float(v) for v in m.group(1).split(",")]
        a = p[3] if len(p) > 3 else 1.0
        return (int(p[0]), int(p[1]), int(p[2]), colors.js_round(a * 255))
    if not t.startswith("#"):
        raise PxaError("color must be #hex, 'transparent' or a TOKEN, got %r" % tok)
    h = t[1:]
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) == 6:
        h += "ff"
    if len(h) != 8:
        raise PxaError("bad hex color %r (want #rgb, #rrggbb or #rrggbbaa)" % tok)
    try:
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4, 6))
    except ValueError:
        raise PxaError("bad hex color %r" % tok)


def color_hex(c):
    if c[3] == 0:
        return "transparent"
    if c[3] == 255:
        return "#%02x%02x%02x" % (c[0], c[1], c[2])
    return "#%02x%02x%02x%02x" % tuple(c)


_DEFAULT_CW = colors.make_colorway()


def token_color(token, colorway=None):
    """A colorway token -> rgba, the way sprites.js would resolve it."""
    v = (colorway or {}).get(token) or _DEFAULT_CW.get(token)
    return parse_color(v) if v else None


def _kv(tokens):
    """['dur=100', 'at=2,3'] -> {'dur': '100', 'at': '2,3'}; bare words -> ''."""
    out = OrderedDict()
    for t in tokens:
        k, _, v = t.partition("=")
        out[k.lower()] = v
    return out


def _xy(text, what, source, lineno):
    try:
        x, y = [int(v) for v in text.replace(" ", "").split(",")]
        return x, y
    except ValueError:
        raise PxaError("%s:%d: %s wants X,Y, got %r" % (source, lineno, what, text))


class Layer(object):
    """One grid in a frame's stack. `ref` marks a layer written without rows:
    '' repeats the same-named layer of the previous frame, a name repeats it
    from that frame. Its rows are filled in when the file is resolved."""

    def __init__(self, name, rows=None, at=(0, 0), ref=None):
        self.name = name
        self.rows = list(rows or [])
        self.at = at
        self.ref = ref

    @property
    def width(self):
        return len(self.rows[0]) if self.rows else 0

    @property
    def height(self):
        return len(self.rows)


class Frame(object):
    def __init__(self, name, rows, layers=None, dur=None):
        self.name = name
        self.rows = list(rows)
        self.layers = layers      # None, or [Layer] bottom to top
        self.dur = dur            # ms, or None for the sprite's fps

    @property
    def width(self):
        return len(self.rows[0]) if self.rows else 0

    @property
    def height(self):
        return len(self.rows)

    def get(self, x, y):
        if 0 <= y < self.height and 0 <= x < len(self.rows[y]):
            return self.rows[y][x]
        return None

    def set(self, x, y, ch):
        if 0 <= y < self.height and 0 <= x < self.width:
            row = self.rows[y]
            self.rows[y] = row[:x] + ch + row[x + 1:]

    def copy(self, name=None):
        return Frame(name or self.name, self.rows, None, self.dur)

    def layer(self, name):
        for L in self.layers or []:
            if L.name == name:
                return L
        return None


class Ramp(object):
    def __init__(self, name, base, n, keys, opts, colors_):
        self.name = name
        self.base = base
        self.n = n
        self.keys = keys
        self.opts = opts
        self.colors = colors_

    def index(self, key):
        return self.keys.find(key)


class Sprite(object):
    def __init__(self, name="sprite", palette=None, frames=None, meta=None):
        self.name = name
        self.palette = palette if palette is not None else OrderedDict()
        self.tokens = {}              # key -> colorway TOKEN
        self.frames = frames if frames is not None else []
        self.meta = meta or {}
        self.ramps = OrderedDict()    # name -> Ramp
        self.anims = OrderedDict()    # id -> {"frames": [...], "loop": bool}
        self.recolors = []            # [(ramp name, [items as written])]
        self.points = OrderedDict()   # name -> (x, y)
        self.anchor = None
        self.export = None            # {"kind", "const", "path"}
        self.lint = {}                # raw @lint settings
        self.comments = []            # header comment lines, re-emitted by dumps()

    @property
    def width(self):
        return self.frames[0].width if self.frames else 0

    @property
    def height(self):
        return self.frames[0].height if self.frames else 0

    def frame(self, ref=None):
        """ref: None (first), a name, or an index as str/int."""
        if not self.frames:
            raise PxaError("sprite %r has no frames" % self.name)
        if ref is None or ref == "":
            return self.frames[0]
        for f in self.frames:
            if f.name == ref:
                return f
        try:
            return self.frames[int(ref)]
        except (ValueError, IndexError):
            pass
        raise PxaError("no frame %r (have: %s)"
                       % (ref, ", ".join(f.name for f in self.frames)))

    def color(self, ch):
        return self.palette.get(ch, TRANSPARENT)

    def colors_for(self, colorway=None, overrides=None):
        """key -> rgba with tokens resolved through `colorway` (else the game's
        default colorway) and `overrides` ({key: rgba}) applied last."""
        out = dict(self.palette)
        if colorway:
            for k, tok in self.tokens.items():
                c = token_color(tok, colorway)
                if c:
                    out[k] = c
        for k, v in (overrides or {}).items():
            out[k] = parse_color(v) if isinstance(v, str) else v
        return out

    def used_keys(self):
        used = set()
        for f in self.frames:
            for row in f.rows:
                used.update(row)
            for L in f.layers or []:
                for row in L.rows:
                    used.update(row)
        return used

    def ramp_of(self, key):
        """-> (Ramp, index) for a key that belongs to a ramp, else (None, -1)."""
        for r in self.ramps.values():
            i = r.index(key)
            if i >= 0:
                return r, i
        return None, -1

    def ramp_by_name_or_keys(self, text):
        if text in self.ramps:
            return self.ramps[text].keys
        return text

    def frame_ms(self, frame):
        if frame.dur:
            return frame.dur
        return int(round(1000.0 / max(1, self.meta.get("fps", 8))))

    def lint_skip(self):
        return set(s for s in self.lint.get("skip", "").split(",") if s)

    # -- recolour variants --------------------------------------------------
    def variants(self, ramps_js=None):
        """OrderedDict kind -> {key: '#hex'} for every @recolor, merged by kind."""
        out = OrderedDict()
        if not self.recolors:
            return out
        game = colors.game_ramps(ramps_js) if ramps_js is not False else {}
        for rname, items in self.recolors:
            r = self.ramps.get(rname)
            if r is None:
                raise PxaError("@recolor %s: no @ramp named %r" % (rname, rname))
            for item in items:
                kinds = colors.MAGIC_KINDS if item == "magic" else (item,)
                for kind in kinds:
                    label, _, hexv = kind.partition("=")
                    if hexv:
                        cols = colors.ramp(hexv, r.n, r.opts)
                    else:
                        g = game.get(label)
                        if g is None:
                            if item == "magic":
                                continue       # palette.js lacks that type yet
                            raise PxaError(
                                "@recolor %s: %r is not a palette.js RAMPS name%s"
                                % (rname, label, "" if game else
                                   " (palette.js not found; set PXFORGE_PALETTE_JS)"))
                        src = g["colors"]
                        cols = [src[colors.js_round(i * (len(src) - 1) / max(1, r.n - 1))]
                                for i in range(r.n)]
                    slot = out.setdefault(label, OrderedDict())
                    for k, c in zip(r.keys, cols):
                        slot[k] = c
        return out


# -------------------------------------------------------------------- parsing

def _set_key(sprite, key, tok, source, lineno):
    if colors.is_token(tok):
        c = token_color(tok)
        sprite.tokens[key] = tok
        sprite.palette[key] = c if c else (255, 0, 255, 255)   # unknown: loud magenta
    else:
        sprite.tokens.pop(key, None)
        try:
            sprite.palette[key] = parse_color(tok)
        except PxaError as exc:
            raise PxaError("%s:%d: %s" % (source, lineno, exc))


def _apply_use(sprite, name):
    for k, value in palettes.get(name)["colors"].items():
        _set_key(sprite, k, value, name, 0)
    sprite.meta.setdefault("use", name)


def _parse_ramp(sprite, val, source, lineno):
    parts = val.split()
    words = [p for p in parts if "=" not in p]
    opts = OrderedDict()
    for p in parts:
        if "=" in p:
            k, v = p.split("=", 1)
            if k not in ("spread", "shift", "desat", "at"):
                raise PxaError("%s:%d: @ramp option %r unknown (spread shift desat at)"
                               % (source, lineno, k))
            try:
                opts[k] = float(v) if "." in v else int(v)
            except ValueError:
                raise PxaError("%s:%d: @ramp %s=%r is not a number" % (source, lineno, k, v))
    if len(words) < 2:
        raise PxaError("%s:%d: @ramp wants NAME BASE [N] [KEYS], e.g. "
                       "`@ramp fire #f07a2a 5 abcde`" % (source, lineno))
    name, base = words[0], words[1]
    n, keys = None, None
    for w in words[2:]:
        if n is None and keys is None and w.isdigit():
            n = int(w)
        elif keys is None:
            keys = w
    if keys is None and n is not None and len(name) == n:
        keys = name
    if keys is None:
        raise PxaError("%s:%d: @ramp %s: say which keys it creates, dark to light, "
                       "e.g. `@ramp %s %s %d abcde`" % (source, lineno, name, name, base, n or 5))
    n = n or len(keys)
    if len(keys) != n or len(set(keys)) != n:
        raise PxaError("%s:%d: @ramp %s: %d distinct keys needed, got %r"
                       % (source, lineno, name, n, keys))
    if "." in keys:
        raise PxaError("%s:%d: @ramp %s: '.' is transparent, not a ramp key"
                       % (source, lineno, name))
    if base.startswith("#"):
        cols = colors.ramp(base, n, opts)
    else:
        g = colors.game_ramps().get(base)
        if g is None:
            raise PxaError("%s:%d: @ramp %s: %r is neither #hex nor a palette.js RAMPS name"
                           % (source, lineno, name, base))
        if opts:
            raise PxaError("%s:%d: @ramp %s: options apply to #hex bases; RAMPS.%s is fixed"
                           % (source, lineno, name, base))
        src = g["colors"]
        cols = [src[colors.js_round(i * (len(src) - 1) / max(1, n - 1))] for i in range(n)]
    sprite.ramps[name] = Ramp(name, base, n, keys, opts, cols)
    notes = sprite.meta.setdefault("notes", {})
    for i, (k, c) in enumerate(zip(keys, cols)):
        sprite.tokens.pop(k, None)
        sprite.palette[k] = parse_color(c)
        notes[k] = "%s %d" % (name, i)


def loads(text, source="<string>"):
    if text.startswith("﻿"):
        text = text[1:]          # PowerShell's `Out-File -Encoding utf8` BOM
    sprite = Sprite()
    sprite.palette["."] = TRANSPARENT
    mode = None            # None | 'palette' | 'grid'
    frame = None           # Frame being accumulated
    layer = None           # Layer being accumulated inside it
    saw_use = False
    layer_lines = {}

    def close_layer():
        if frame is None or layer is None:
            return
        if layer.name == "" and not layer.rows:
            return                          # no base grid: the stack starts at @layer
        frame.layers.append(layer)

    def flush():
        if frame is None:
            return
        close_layer()
        if not frame.layers:
            raise PxaError("%s: frame %r has no rows" % (source, frame.name))
        sprite.frames.append(frame)

    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.rstrip("\r\n")
        stripped = line.strip()
        if stripped.startswith("@"):
            parts = stripped[1:].split(None, 1)
            key = parts[0].lower()
            val = parts[1].strip() if len(parts) > 1 else ""
            if key in ("grid", "frame"):
                flush()
                bits = val.split()
                opts = _kv(bits[1:])
                dur = None
                if "dur" in opts:
                    try:
                        dur = int(opts["dur"])
                    except ValueError:
                        raise PxaError("%s:%d: dur= wants milliseconds, got %r"
                                       % (source, lineno, opts["dur"]))
                frame = Frame(bits[0] if bits else ("f%d" % len(sprite.frames)), [], [], dur)
                layer = Layer("")
                mode = "grid"
            elif key == "layer":
                if frame is None:
                    raise PxaError("%s:%d: @layer belongs inside a @frame" % (source, lineno))
                close_layer()
                bits = val.split()
                if not bits:
                    raise PxaError("%s:%d: @layer wants a name" % (source, lineno))
                opts = _kv(bits[1:])
                at = _xy(opts["at"], "at=", source, lineno) if "at" in opts else (0, 0)
                layer = Layer(bits[0], [], at, opts.get("from"))
                layer_lines[id(layer)] = lineno
                mode = "grid"
            elif key == "palette":
                flush()
                frame = layer = None
                mode = "palette"
            elif key == "name":
                sprite.name = val
            elif key == "use":
                _apply_use(sprite, val)
                saw_use = True
            elif key == "ramp":
                _parse_ramp(sprite, val, source, lineno)
            elif key == "anim":
                bits = val.split()
                if not bits:
                    raise PxaError("%s:%d: @anim wants ID FRAME..." % (source, lineno))
                opts = _kv([b for b in bits[1:] if "=" in b])
                sprite.anims[bits[0]] = {
                    "frames": [b for b in bits[1:] if "=" not in b],
                    "loop": opts.get("loop", "1") not in ("0", "false", "no")}
            elif key == "recolor":
                bits = val.replace(",", " ").split()
                if len(bits) < 2:
                    raise PxaError("%s:%d: @recolor wants RAMP KIND[,KIND] (or magic)"
                                   % (source, lineno))
                sprite.recolors.append((bits[0], bits[1:]))
            elif key == "anchor":
                sprite.anchor = _xy(val, "@anchor", source, lineno)
            elif key == "point":
                bits = val.split(None, 1)
                if len(bits) != 2:
                    raise PxaError("%s:%d: @point wants NAME X,Y" % (source, lineno))
                sprite.points[bits[0]] = _xy(bits[1], "@point", source, lineno)
            elif key == "export":
                bits = val.split()
                if not bits or bits[0] not in ("frames", "sprite"):
                    raise PxaError("%s:%d: @export wants `frames CONST PATH` or "
                                   "`sprite [PATH]`" % (source, lineno))
                exp = {"kind": bits[0], "const": None, "path": None}
                rest = bits[1:]
                if bits[0] == "frames":
                    if len(rest) != 2:
                        raise PxaError("%s:%d: @export frames wants CONST PATH"
                                       % (source, lineno))
                    exp["const"], exp["path"] = rest
                elif rest:
                    exp["path"] = rest[0]
                sprite.export = exp
            elif key == "lint":
                sprite.lint.update(_kv(val.split()))
            elif key in ("scale", "fps", "cols", "gap", "loop"):
                try:
                    sprite.meta[key] = int(val)
                except ValueError:
                    raise PxaError("%s:%d: @%s wants an integer, got %r"
                                   % (source, lineno, key, val))
            elif key == "size":
                sprite.meta["size"] = val
            else:
                sprite.meta[key] = val
            continue

        if mode == "grid":
            if not stripped:
                continue
            if stripped.startswith("#"):
                continue
            layer.rows.append(line.rstrip())
            continue

        if not stripped or stripped.startswith("#") or stripped.startswith("//"):
            if stripped and not sprite.frames and frame is None:
                sprite.comments.append(stripped)     # kept, so `edit` does not erase notes
            continue

        if mode == "palette":
            bits = stripped.split(None, 2)
            if len(bits) < 2:
                raise PxaError("%s:%d: palette line needs '<char> <color>', got %r"
                               % (source, lineno, stripped))
            ch, colortok = bits[0], bits[1]
            if len(ch) != 1:
                raise PxaError("%s:%d: palette key must be one character, got %r"
                               % (source, lineno, ch))
            _set_key(sprite, ch, colortok, source, lineno)
            if len(bits) > 2:
                sprite.meta.setdefault("notes", {})[ch] = bits[2].strip()
            continue

        raise PxaError("%s:%d: unexpected text outside any block: %r"
                       % (source, lineno, stripped))

    flush()
    if not sprite.frames:
        raise PxaError("%s: no @grid or @frame block found" % source)
    if not saw_use and len(sprite.palette) == 1:
        _apply_use(sprite, palettes.DEFAULT)
    _resolve_layers(sprite, source)
    return sprite


def _size_hint(sprite):
    s = sprite.meta.get("size")
    if s:
        try:
            w, h = [int(v) for v in str(s).lower().split("x")]
            return w, h
        except ValueError:
            pass
    return None


def _resolve_layers(sprite, source):
    """Fill in repeated layers, then flatten every stacked frame."""
    last = {}
    by_frame = {}
    for f in sprite.frames:
        for L in f.layers:
            if L.name and not L.rows:
                src = by_frame.get((L.ref, L.name)) if L.ref else last.get(L.name)
                if src is None:
                    where = ("frame %r" % L.ref) if L.ref else "an earlier frame"
                    raise PxaError("%s: frame %r layer %r has no rows and %s has no "
                                   "layer %r to repeat" % (source, f.name, L.name, where, L.name))
                L.rows = list(src.rows)
                if L.ref is None:
                    L.ref = ""
                if L.at == (0, 0):
                    L.at = src.at
            else:
                L.ref = None
            last[L.name] = L
            by_frame[(f.name, L.name)] = L
        if len(f.layers) == 1 and f.layers[0].name == "" and f.layers[0].at == (0, 0):
            f.rows = f.layers[0].rows
            f.layers = None
        else:
            flatten(sprite, f)


def flatten(sprite, frame):
    """Recompute frame.rows from its layer stack (top layer wins)."""
    if not frame.layers:
        return frame
    size = _size_hint(sprite)
    if size:
        w, h = size
    else:
        base = frame.layers[0]
        w, h = base.width + base.at[0], base.height + base.at[1]
    grid = [["."] * w for _ in range(h)]
    for L in frame.layers:
        ax, ay = L.at
        for y, row in enumerate(L.rows):
            for x, ch in enumerate(row):
                if ch != "." and 0 <= x + ax < w and 0 <= y + ay < h:
                    grid[y + ay][x + ax] = ch
    frame.rows = ["".join(r) for r in grid]
    return frame


def load(path):
    with open(path, "r", encoding="utf-8-sig") as fh:
        return loads(fh.read(), source=path)


# ---------------------------------------------------------------- serializing

def _opt_text(opts):
    return " ".join("%s=%s" % (k, v) for k, v in opts.items())


def dumps(sprite):
    out = ["@name  %s" % sprite.name]
    if sprite.meta.get("use"):
        out.append("@use   %s" % sprite.meta["use"])
    for key in ("scale", "fps", "cols", "gap", "loop"):
        if key in sprite.meta:
            out.append("@%-5s %s" % (key, sprite.meta[key]))
    out.append("@size  %dx%d" % (sprite.width, sprite.height))
    out.extend(sprite.comments)
    if sprite.anchor:
        out.append("@anchor %d,%d" % sprite.anchor)
    for name, (x, y) in sprite.points.items():
        out.append("@point %s %d,%d" % (name, x, y))

    # What the file would hold without an @palette block: @use, then the ramps.
    base, base_tok = {}, {}
    if sprite.meta.get("use"):
        for k, v in palettes.get(sprite.meta["use"])["colors"].items():
            if colors.is_token(v):
                base_tok[k] = v
                base[k] = token_color(v) or (255, 0, 255, 255)
            else:
                base[k] = parse_color(v)
    for r in sprite.ramps.values():
        line = "@ramp  %s %s %d %s" % (r.name, r.base, r.n, r.keys)
        if r.opts:
            line += " " + _opt_text(r.opts)
        out.append(line)
        for k, c in zip(r.keys, r.colors):
            base[k] = parse_color(c)
            base_tok.pop(k, None)

    extra = OrderedDict()
    for k, c in sprite.palette.items():
        if k == "." and c == TRANSPARENT:
            continue
        tok = sprite.tokens.get(k)
        if tok != base_tok.get(k) or (not tok and base.get(k) != c):
            extra[k] = tok or color_hex(c)
    if extra:
        out.append("")
        out.append("@palette")
        notes = sprite.meta.get("notes", {})
        ramp_keys = set("".join(r.keys for r in sprite.ramps.values()))
        for k, v in extra.items():
            line = "%s %s" % (k, v)
            if notes.get(k) and k not in ramp_keys:
                line += "  %s" % notes[k]
            out.append(line)

    tail = []
    for aid, a in sprite.anims.items():
        tail.append("@anim %s %s%s" % (aid, " ".join(a["frames"]),
                                       "" if a["loop"] else " loop=0"))
    for rname, items in sprite.recolors:
        tail.append("@recolor %s %s" % (rname, ",".join(items)))
    if sprite.export:
        e = sprite.export
        tail.append("@export %s" % " ".join(v for v in (e["kind"], e["const"], e["path"]) if v))
    if sprite.lint:
        tail.append("@lint %s" % " ".join(("%s=%s" % (k, v)) if v else k
                                          for k, v in sprite.lint.items()))
    if tail:
        out.append("")
        out.extend(tail)

    for f in sprite.frames:
        out.append("")
        out.append("@frame %s%s" % (f.name, (" dur=%d" % f.dur) if f.dur else ""))
        if not f.layers:
            out.extend(f.rows)
            continue
        for L in f.layers:
            if L.name:
                bits = ["@layer", L.name]
                if L.at != (0, 0):
                    bits.append("at=%d,%d" % L.at)
                if L.ref:
                    bits.append("from=%s" % L.ref)
                out.append(" ".join(bits))
            if L.ref is None or not L.name:
                out.extend(L.rows)
    return "\n".join(out) + "\n"


def save(sprite, path):
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(dumps(sprite))


# ----------------------------------------------------------------- validating

def validate(sprite):
    """-> (errors, warnings), both lists of strings."""
    errors, warnings = [], []
    if not sprite.frames:
        return ["sprite has no frames"], warnings

    w, h = sprite.frames[0].width, sprite.frames[0].height
    if w == 0:
        errors.append("frame %r has zero width" % sprite.frames[0].name)

    seen_names = set()
    for f in sprite.frames:
        if f.name in seen_names:
            warnings.append("duplicate frame name %r" % f.name)
        seen_names.add(f.name)
        if f.height != h:
            errors.append("frame %r has %d rows, frame %r has %d"
                          % (f.name, f.height, sprite.frames[0].name, h))
        for y, row in enumerate(f.rows):
            if len(row) != w:
                errors.append("frame %r row %d is %d chars, expected %d: %r"
                              % (f.name, y, len(row), w, row))
        for L in f.layers or []:
            lw = L.width
            for y, row in enumerate(L.rows):
                if len(row) != lw:
                    errors.append("frame %r layer %r row %d is %d chars, expected %d: %r"
                                  % (f.name, L.name or "(base)", y, len(row), lw, row))
            if L.at[0] + lw > f.width or L.at[1] + L.height > f.height \
                    or L.at[0] < 0 or L.at[1] < 0:
                warnings.append("frame %r layer %r at=%d,%d (%dx%d) is clipped by the "
                                "%dx%d frame" % (f.name, L.name or "(base)", L.at[0],
                                                 L.at[1], lw, L.height, f.width, f.height))

    undefined = {}
    for f in sprite.frames:
        grids = [(f.name, f.rows)] + [("%s/%s" % (f.name, L.name), L.rows)
                                      for L in (f.layers or [])]
        for label, rows in grids:
            for y, row in enumerate(rows):
                for x, ch in enumerate(row):
                    if ch not in sprite.palette:
                        undefined.setdefault(ch, (label, x, y))
    for ch, (fname, x, y) in sorted(undefined.items()):
        errors.append("undefined palette key %r (first at frame %r x=%d y=%d)"
                      % (ch, fname, x, y))

    for k, tok in sorted(sprite.tokens.items()):
        if tok not in colors.COLOR_TOKENS:
            warnings.append("key %r uses token %r, which sprites.js does not know "
                            "(it would draw nothing)" % (k, tok))

    owner = {}
    for r in sprite.ramps.values():
        for k in r.keys:
            if k in owner:
                warnings.append("key %r is in ramps %r and %r; the later one wins"
                                % (k, owner[k], r.name))
            owner[k] = r.name

    names = set(f.name for f in sprite.frames)
    for aid, a in sprite.anims.items():
        missing = [n for n in a["frames"] if n not in names]
        if missing:
            errors.append("@anim %s names missing frame(s): %s" % (aid, " ".join(missing)))
        if not a["frames"]:
            errors.append("@anim %s lists no frames" % aid)
    try:
        sprite.variants()
    except PxaError as exc:
        errors.append(str(exc))
    for name, (x, y) in list(sprite.points.items()) + (
            [("@anchor", sprite.anchor)] if sprite.anchor else []):
        if not (0 <= x <= w and 0 <= y <= h):
            warnings.append("point %s (%d,%d) lies outside the %dx%d frame" % (name, x, y, w, h))

    if "#" in sprite.palette:
        warnings.append("'#' is a palette key; grid rows starting with it are "
                        "read as comments")
    unused = set(sprite.palette) - sprite.used_keys() - {"."}
    if unused:
        warnings.append("palette keys defined but unused: %s"
                        % " ".join(sorted(unused)))
    return errors, warnings


def rasterize(sprite, frame_ref=None, bg=None, colorway=None, overrides=None, rows=None):
    """-> (w, h, bytearray RGBA) at 1x. `rows` rasterizes a bare grid (a layer)."""
    grid = rows if rows is not None else sprite.frame(frame_ref).rows
    lut = sprite.colors_for(colorway, overrides) if (colorway or overrides) else sprite.palette
    h = len(grid)
    w = len(grid[0]) if grid else 0
    buf = bytearray(w * h * 4)
    for y in range(h):
        row = grid[y]
        for x in range(w):
            c = lut.get(row[x], TRANSPARENT) if x < len(row) else TRANSPARENT
            if c[3] == 0 and bg is not None:
                c = bg
            i = (y * w + x) * 4
            buf[i:i + 4] = bytes(c)
    return w, h, buf
