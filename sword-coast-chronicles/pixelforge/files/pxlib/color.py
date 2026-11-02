"""Colour maths shared with the game: an exact port of src/render/palette.js.

The game's colour language lives in palette.js -- hue-shifted ramps (cool
shadows, warm lights), selective outline colours, the named material RAMPS --
and the colorway tokens of sprites.js. Art authored here must land on exactly
the same hex values, so every function below mirrors its JS twin operation for
operation (JS `%` is fmod, `Math.round` rounds half up). tools/pxbuild.mjs
re-derives every ramp with the real palette.js and refuses to build if the two
ever disagree, so a drift is caught at build time rather than seen as a
slightly-wrong orange.

RAMPS are not copied: they are parsed out of palette.js itself, so a ramp added
there is usable here the moment it exists.
"""

import math
import os
import re

COOL = 245   # shadows drift toward blue-violet
WARM = 55    # highlights drift toward yellow


def js_round(v):
    return math.floor(v + 0.5)


def _clamp255(v):
    return max(0, min(255, js_round(v)))


def hex_to_rgb(hexstr):
    h = str(hexstr or "#000").replace("#", "")
    if len(h) == 3:
        h = h[0] * 2 + h[1] * 2 + h[2] * 2
    try:
        n = int(h[:6], 16)
    except ValueError:
        n = 0
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]


def rgb_to_hex(r, g, b):
    return "#%02x%02x%02x" % (_clamp255(r), _clamp255(g), _clamp255(b))


def hex_to_hsl(hexstr):
    r0, g0, b0 = hex_to_rgb(hexstr)
    r, g, b = r0 / 255, g0 / 255, b0 / 255
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return [0, 0, l]
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r:
        h = (g - b) / d + (6 if g < b else 0)
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return [h * 60, s, l]


def hsl_to_hex(h, s, l):
    h = math.fmod(math.fmod(h, 360) + 360, 360)
    s = max(0, min(1, s))
    l = max(0, min(1, l))
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs(math.fmod(h / 60, 2) - 1))
    m = l - c / 2
    if h < 60:
        r, g, b = c, x, 0
    elif h < 120:
        r, g, b = x, c, 0
    elif h < 180:
        r, g, b = 0, c, x
    elif h < 240:
        r, g, b = 0, x, c
    elif h < 300:
        r, g, b = x, 0, c
    else:
        r, g, b = c, 0, x
    return rgb_to_hex((r + m) * 255, (g + m) * 255, (b + m) * 255)


def _sign(v):
    return (v > 0) - (v < 0)


def hue_toward(h, target, amt):
    d = math.fmod(target - h + 540, 360) - 180
    if abs(d) < amt:
        return target
    return h + _sign(d) * amt


RAMP_DEFAULTS = {"spread": 0.52, "shift": 22, "desat": 0.18}


def ramp(base, steps=5, opts=None):
    """palette.js ramp(): `steps` hex colours around `base`, darkest first."""
    opts = opts or {}
    spread = opts.get("spread", RAMP_DEFAULTS["spread"])
    shift = opts.get("shift", RAMP_DEFAULTS["shift"])
    desat = opts.get("desat", RAMP_DEFAULTS["desat"])
    at = opts["at"] if opts.get("at") is not None else (steps - 1) // 2
    h, s, l = hex_to_hsl(base)
    chroma = s * (1 - abs(2 * l - 1))
    out = []
    for i in range(steps):
        k = 0 if steps == 1 else (i - at) / max(at, steps - 1 - at)
        lt = min(0.95, max(0.04, l + k * spread / 2))
        if chroma < 0.05:
            tint = abs(k) * 0.12
            hh = COOL - 20 if k < 0 else (WARM - 10 if k > 0 else h)
            out.append(base if k == 0 else hsl_to_hex(hh, max(s * 0.5, tint), lt))
            continue
        hs = shift * min(1, chroma / 0.3)
        hh = hue_toward(h, COOL, -k * hs) if k < 0 else hue_toward(h, WARM, k * hs)
        ss = s * (1 - abs(k) * desat) + (0 if k == 0 else 0.02)
        out.append(hsl_to_hex(hh, ss, lt))
    return out


def outline_for(fill, strength=1):
    """palette.js outlineFor(): a dark, saturated, cool edge for a fill."""
    h, s, l = hex_to_hsl(fill)
    return hsl_to_hex(hue_toward(h, COOL, 18 * strength), min(1, s * 0.9 + 0.1),
                      max(0.05, l * (0.32 - 0.1 * (strength - 1))))


def mix(a, b, t):
    A, B = hex_to_rgb(a), hex_to_rgb(b)
    return rgb_to_hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t,
                      A[2] + (B[2] - A[2]) * t)


def luma(rgb):
    r, g, b = rgb[:3]
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


# --------------------------------------------------------- sprites.js tokens

COLOR_TOKENS = (
    "SKIN", "SKIN_D", "SKIN_L", "HAIR", "HAIR_D", "HAIR_L", "EYE",
    "MAIN", "MAIN_D", "MAIN_L", "ALT", "ALT_D", "ALT_L",
    "METAL", "METAL_D", "METAL_L", "TRIM", "TRIM_D",
    "LEATHER", "LEATHER_D", "CLOTH", "CLOTH_D", "ACCENT", "ACCENT_D",
    "OUTLINE", "SHADOW", "HORN", "HORN_D", "WHITE", "BLACK",
)

COLORWAY_DEFAULTS = {
    "skin": "#e0a878", "hair": "#3a2416", "eye": "#37527a",
    "main": "#7a3030", "alt": "#2f4f7f", "metal": "#aab2c0",
    "leather": "#6b4a2a", "cloth": "#c8b58a", "accent": "#e3b34a",
    "horn": "#8c8377", "outline": "#170f0c",
}

_TOKEN_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")


def is_token(tok):
    return bool(_TOKEN_RE.match(tok or ""))


def shade_hex(hexstr, amt):
    """sprites.js shadeHex(): lighten toward white (amt > 0) or scale to black."""
    r, g, b = hex_to_rgb(hexstr)
    if amt >= 0:
        return rgb_to_hex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt)
    k = 1 + amt
    return rgb_to_hex(r * k, g * k, b * k)


def make_colorway(seed=None):
    """sprites.js makeColorway(): the token map a seed of ~11 colours implies."""
    c = dict(COLORWAY_DEFAULTS)
    c.update(seed or {})
    return {
        "SKIN": c["skin"], "SKIN_D": shade_hex(c["skin"], -0.26), "SKIN_L": shade_hex(c["skin"], 0.20),
        "HAIR": c["hair"], "HAIR_D": shade_hex(c["hair"], -0.32), "HAIR_L": shade_hex(c["hair"], 0.24),
        "EYE": c["eye"],
        "MAIN": c["main"], "MAIN_D": shade_hex(c["main"], -0.30), "MAIN_L": shade_hex(c["main"], 0.22),
        "ALT": c["alt"], "ALT_D": shade_hex(c["alt"], -0.30), "ALT_L": shade_hex(c["alt"], 0.22),
        "METAL": c["metal"], "METAL_D": shade_hex(c["metal"], -0.34), "METAL_L": shade_hex(c["metal"], 0.30),
        "TRIM": c["accent"], "TRIM_D": shade_hex(c["accent"], -0.30),
        "LEATHER": c["leather"], "LEATHER_D": shade_hex(c["leather"], -0.30),
        "CLOTH": c["cloth"], "CLOTH_D": shade_hex(c["cloth"], -0.28),
        "ACCENT": c["accent"], "ACCENT_D": shade_hex(c["accent"], -0.30),
        "HORN": c["horn"], "HORN_D": shade_hex(c["horn"], -0.30),
        "OUTLINE": c["outline"], "SHADOW": "rgba(0,0,0,0.35)",
        "WHITE": "#f4ece0", "BLACK": "#120c0a",
    }


def parse_colorway_spec(spec):
    """'main=#3a5a9a,skin=#8a5a3a' (seed fields) or 'MAIN_D=#223355' (tokens)."""
    seed, direct = {}, {}
    for part in (spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        if "=" not in part:
            raise ValueError("colorway wants field=#hex pairs, got %r" % part)
        k, v = [p.strip() for p in part.split("=", 1)]
        if k in COLORWAY_DEFAULTS:
            seed[k] = v
        elif k in COLOR_TOKENS:
            direct[k] = v
        else:
            raise ValueError("unknown colorway field %r (seed fields: %s; or a token)"
                             % (k, " ".join(sorted(COLORWAY_DEFAULTS))))
    cw = make_colorway(seed)
    cw.update(direct)
    return cw


# ------------------------------------------------------- palette.js RAMPS

# The damage types (plus arcane and healing) that have a ramp, in the order
# palette.js lists them. `@recolor RAMP magic` expands to these.
MAGIC_KINDS = ("fire", "cold", "lightning", "thunder", "acid", "poison",
               "necrotic", "radiant", "psychic", "force", "arcane", "healing")

_R5 = re.compile(r"^\s*(\w+)\s*:\s*R5\(\s*'(#[0-9a-fA-F]{3,6})'\s*(?:,\s*\{([^}]*)\})?\s*\)")
_cache = {}


def find_palette_js(start=None):
    env = os.environ.get("PXFORGE_PALETTE_JS")
    if env:
        return env if os.path.exists(env) else None
    here = start or os.path.dirname(os.path.abspath(__file__))
    for base in (here, os.getcwd()):
        d = base
        for _ in range(6):
            p = os.path.join(d, "src", "render", "palette.js")
            if os.path.exists(p):
                return p
            d = os.path.dirname(d)
    return None


def game_ramps(path=None):
    """{name: {"base", "opts", "colors"}} for every R5 entry in palette.js RAMPS."""
    path = path or find_palette_js()
    if not path:
        return {}
    if path in _cache:
        return _cache[path]
    text = open(path, "r", encoding="utf-8").read()
    a = text.find("export const RAMPS")
    b = text.find("});", a)
    out = {}
    if a >= 0 and b > a:
        for line in text[a:b].splitlines():
            m = _R5.match(line)
            if not m:
                continue
            opts = {}
            for kv in (m.group(3) or "").split(","):
                if ":" in kv:
                    k, v = [s.strip() for s in kv.split(":", 1)]
                    opts[k] = float(v) if "." in v else int(v)
            out[m.group(1)] = {"base": m.group(2), "opts": opts,
                               "colors": ramp(m.group(2), 5, opts)}
    _cache[path] = out
    return out
