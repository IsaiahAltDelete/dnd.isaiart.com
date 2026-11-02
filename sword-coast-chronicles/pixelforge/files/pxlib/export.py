"""Game export: a .pxa becomes an ES module that registers it with sprites.js.

The module is data plus one defineSprite() call, in the exact shape
render/sprites.js expects: frames as arrays of row strings, a palette whose
values are hex colours or UPPERCASE colorway tokens (kept verbatim, so a
character layer still recolours per hero), anims with fps. Output is a pure
function of the source -- no timestamps, no set iteration, fixed number
formatting -- so the same .pxa always yields the same bytes and the stamp hash
in index.html only moves when the art does.

tools/pxbuild.mjs is the usual driver; `pxforge.py export` runs it on one file.
"""

import json
import posixpath
import re
from collections import OrderedDict
from functools import reduce
from math import gcd

from . import color as colors
from .fmt import PxaError, color_hex

_IDENT = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")
_GROUP = re.compile(r"^(.*?)[-_]?(\d+)$")
SPRITES_JS = "src/render/sprites.js"
DEFAULT_DIR = "src/render/art"


def js_str(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def js_key(k):
    return k if _IDENT.match(k) else js_str(k)


def js_num(v):
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return repr(v)


def const_name(sprite_id):
    c = re.sub(r"[^A-Za-z0-9]+", "_", sprite_id).strip("_").upper()
    return ("_" + c) if c[:1].isdigit() else (c or "SPRITE")


def palette_value(sprite, key):
    if key in sprite.tokens:
        return sprite.tokens[key]
    c = sprite.palette[key]
    if c[3] == 255:
        return color_hex(c)
    return "rgba(%d,%d,%d,%s)" % (c[0], c[1], c[2], js_num(round(c[3] / 255.0, 3)))


def anims_for(sprite):
    """Declared @anims, else one per numbered frame group (burn-0, burn-1 ...).
    Uneven dur= values are expanded by their common divisor so sprites.js's
    fixed-fps animFrame() plays them at the authored tempo; `seq`/`durations`
    keep the exact timing for callers that want it."""
    declared = sprite.anims
    if not declared:
        declared = OrderedDict()
        once = sprite.meta.get("loop") == 1
        for f in sprite.frames:
            m = _GROUP.match(f.name)
            if m and m.group(1):
                declared.setdefault(m.group(1), {"frames": [], "loop": not once})
                declared[m.group(1)]["frames"].append(f.name)
        for k in [k for k, a in declared.items() if len(a["frames"]) < 2]:
            del declared[k]
    out = OrderedDict()
    for aid, a in declared.items():
        seq = list(a["frames"])
        durs = [sprite.frame_ms(sprite.frame(n)) for n in seq]
        if len(set(durs)) == 1:
            frames, step = seq, durs[0]
        else:
            step = max(10, reduce(gcd, durs))
            frames = []
            for n, d in zip(seq, durs):
                frames.extend([n] * max(1, int(round(d / float(step)))))
        out[aid] = OrderedDict([
            ("frames", frames), ("fps", 1000.0 / step), ("loop", a["loop"]),
            ("seq", seq), ("durations", durs), ("ms", sum(durs))])
    return out


def used_keys_in_order(sprite):
    used = set()
    for f in sprite.frames:
        for row in f.rows:
            used.update(row)
    return [k for k in sprite.palette
            if k in used and k != "." and (k in sprite.tokens or sprite.palette[k][3] > 0)]


def _wrap_entries(entries, indent, width=100):
    lines, cur = [], ""
    for e in entries:
        piece = e + ","
        if cur and len(indent) + len(cur) + 1 + len(piece) > width:
            lines.append(indent + cur)
            cur = piece
        else:
            cur = (cur + " " + piece) if cur else piece
    if cur:
        lines.append(indent + cur)
    return lines


def _import_path(out_rel, target=SPRITES_JS):
    rel = posixpath.relpath(target, posixpath.dirname(out_rel) or ".")
    return rel if rel.startswith(".") else "./" + rel


def default_out(sprite_id):
    return "%s/%s.js" % (DEFAULT_DIR, sprite_id)


def sprite_module(sprite, sprite_id, out_rel, src_rel):
    const = (sprite.export or {}).get("const") or const_name(sprite_id)
    keys = used_keys_in_order(sprite)
    variants = sprite.variants()
    lines = []
    mod = out_rel[4:] if out_rel.startswith("src/") else out_rel
    lines.append("// %s — generated from %s by tools/pxbuild.mjs; edit the .pxa and "
                 "rebuild, never this file." % (mod, src_rel))
    lines.append("import { defineSprite } from %s;" % js_str(_import_path(out_rel)))
    lines.append("")
    lines.append("export const %s = Object.freeze({" % const)
    lines.append("  w: %d, h: %d," % (sprite.width, sprite.height))
    if sprite.anchor:
        lines.append("  anchor: { x: %d, y: %d }," % sprite.anchor)
    if sprite.points:
        lines.append("  points: { %s }," % ", ".join(
            "%s: [%d, %d]" % (js_key(n), x, y) for n, (x, y) in sprite.points.items()))
    lines.append("  palette: {")
    lines.extend(_wrap_entries(["%s: %s" % (js_key(k), js_str(palette_value(sprite, k)))
                                for k in keys], "    "))
    lines.append("  },")
    lines.append("  frames: {")
    for f in sprite.frames:
        lines.append("    %s: [" % js_key(f.name))
        lines.extend("      %s," % js_str(r) for r in f.rows)
        lines.append("    ],")
    lines.append("  },")
    anims = anims_for(sprite)
    lines.append("  anims: {")
    for aid, a in anims.items():
        lines.append("    %s: {" % js_key(aid))
        lines.extend(_wrap_entries(["frames: [%s]" % ", ".join(js_str(n) for n in a["frames"])],
                                   "      ", 10000))
        lines.append("      fps: %s, loop: %s, ms: %d," % (js_num(a["fps"]),
                                                          "true" if a["loop"] else "false", a["ms"]))
        lines.append("      seq: [%s]," % ", ".join(js_str(n) for n in a["seq"]))
        lines.append("      durations: [%s]," % ", ".join(str(d) for d in a["durations"]))
        lines.append("    },")
    lines.append("  },")
    if variants:
        lines.append("  recolor: {")
        for kind, over in variants.items():
            lines.append("    %s: {" % js_key(kind))
            lines.extend(_wrap_entries(["%s: %s" % (js_key(k), js_str(v)) for k, v in over.items()
                                        if k in keys], "      "))
            lines.append("    },")
        lines.append("  },")
    lines.append("});")
    lines.append("")
    lines.append("defineSprite(%s, %s);" % (js_str(sprite_id), const))
    if variants:
        lines.append("// One sprite per @recolor variant: %s-fire, %s-cold, ..." % (sprite_id, sprite_id))
        lines.append("for (const [kind, palette] of Object.entries(%s.recolor)) {" % const)
        lines.append("  defineSprite(`%s-${kind}`, { ...%s, palette: { ...%s.palette, ...palette } });"
                     % (sprite_id, const, const))
        lines.append("}")
    lines.append("export default %s;" % const)
    return "\n".join(lines) + "\n"


def frames_module(sprite, const, src_rel):
    """The legacy shape (render/satchel-art.js): just {frame: rows}, no registry.
    The header and JSON layout match scripts/build-satchel.mjs byte for byte."""
    frames = OrderedDict((f.name, f.rows) for f in sprite.frames)
    return ("// Generated from %s; retain that file as the pixel source.\n"
            "export const %s = %s;\n" % (src_rel, const, json.dumps(frames, indent=2)))


def compile_sprite(sprite, src_rel, sprite_id=None, out_rel=None):
    """-> (out_rel, module text, report). Raises PxaError on a bad export spec."""
    sprite_id = sprite_id or sprite.name
    if not re.match(r"^[a-z0-9][a-z0-9-]*$", sprite_id):
        raise PxaError("sprite id %r must be lowercase-with-dashes (it is the sprites.js "
                       "registry name)" % sprite_id)
    exp = sprite.export or {"kind": "sprite", "const": None, "path": None}
    out_rel = out_rel or exp.get("path") or default_out(sprite_id)
    if exp["kind"] == "frames":
        text = frames_module(sprite, exp["const"], src_rel)
    else:
        text = sprite_module(sprite, sprite_id, out_rel, src_rel)
    game = colors.game_ramps()
    named = OrderedDict()
    for r in sprite.ramps.values():
        if not r.base.startswith("#"):
            named[r.base] = game[r.base]["colors"]
    for kind in sprite.variants():
        if kind in game:
            named[kind] = game[kind]["colors"]
    report = OrderedDict([
        ("id", sprite_id), ("out", out_rel), ("kind", exp["kind"]),
        ("frames", [f.name for f in sprite.frames]),
        ("variants", list(sprite.variants().keys())),
        ("ramps", [OrderedDict([("name", r.name), ("base", r.base), ("n", r.n),
                                ("opts", r.opts), ("colors", r.colors)])
                   for r in sprite.ramps.values()]),
        ("gameRamps", named),
    ])
    return out_rel, text, report
