"""Built-in palettes.

Each entry maps a stable single-character key -> hex color, so a grid written
against a palette keeps meaning. `keys` is the key string in ramp order and
`notes` documents intent (which matters most for chr16/skin ramps).
"""

from collections import OrderedDict


def _pal(keys, colors, notes=None):
    if len(keys) != len(colors):
        raise ValueError("palette key/color length mismatch: %d vs %d"
                         % (len(keys), len(colors)))
    od = OrderedDict()
    for k, c in zip(keys, colors):
        od[k] = c
    return {"colors": od, "notes": notes or {}}


PALETTES = {
    # Hand-picked for character work: paired dark/mid/light ramps so shading is
    # a mechanical +1/-1 on the key rather than a color decision every time.
    "chr16": _pal(
        "Kks123456789mMhHWe",
        ["#0d0b14", "#241f2e", "#3c3247",           # K outline, k shadow, s guide
         "#7a4a34", "#c17f5b", "#f0b98d",           # 1 2 3 skin  dark/mid/light
         "#2c4a7c", "#3f6cb0", "#6fa0e0",           # 4 5 6 cloth A
         "#6d2233", "#a63b4c", "#d9697a",           # 7 8 9 cloth B
         "#5a5f6e", "#a8b0c0",                      # m M metal
         "#2a1a12", "#6b4227",                      # h H hair
         "#f4f1e8", "#101018"],                     # W highlight, e eye
        {"1": "skin dark", "2": "skin mid", "3": "skin light",
         "4": "clothA dark", "5": "clothA mid", "6": "clothA light",
         "7": "clothB dark", "8": "clothB mid", "9": "clothB light",
         "m": "metal dark", "M": "metal light",
         "h": "hair dark", "H": "hair light",
         "K": "outline", "k": "shadow", "s": "guide/greyblock",
         "W": "highlight", "e": "eye"}),

    "pico8": _pal(
        "0123456789abcdef",
        ["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f",
         "#c2c3c7", "#fff1e8", "#ff004d", "#ffa300", "#ffec27", "#00e436",
         "#29adff", "#83769c", "#ff77a8", "#ffccaa"]),

    "sweetie16": _pal(
        "0123456789abcdef",
        ["#1a1c2c", "#5d275d", "#b13e53", "#ef7d57", "#ffcd75", "#a7f070",
         "#38b764", "#257179", "#29366f", "#3b5dc9", "#41a6f6", "#73eff7",
         "#f4f4f4", "#94b0c2", "#566c86", "#333c57"]),

    "db16": _pal(
        "0123456789abcdef",
        ["#140c1c", "#442434", "#30346d", "#4e4a4e", "#854c30", "#346524",
         "#d04648", "#757161", "#597dce", "#d27d2c", "#8595a1", "#6daa2c",
         "#d2aa99", "#6dc2ca", "#dad45e", "#deeed6"]),

    # The game's humanoid key map (render/spritedata_chars.js PAL). Values are
    # colorway TOKENS, so a layer authored against it recolours per character
    # in game; previews resolve them through the default colorway.
    "sc-chars": _pal(
        "KsdleHhjaAqbBmMntTLPcCxXoOWZ",
        ["OUTLINE", "SKIN", "SKIN_D", "SKIN_L", "EYE", "HAIR_D", "HAIR", "HAIR_L",
         "MAIN", "MAIN_D", "MAIN_L", "ALT", "ALT_D", "METAL", "METAL_D", "METAL_L",
         "TRIM", "TRIM_D", "LEATHER", "LEATHER_D", "CLOTH", "CLOTH_D",
         "ACCENT", "ACCENT_D", "HORN", "HORN_D", "WHITE", "BLACK"],
        {"K": "outline", "s": "skin", "d": "skin dark", "l": "skin light",
         "e": "eye", "h": "hair", "H": "hair dark", "j": "hair light",
         "a": "main", "A": "main dark", "q": "main light", "b": "alt", "B": "alt dark",
         "m": "metal", "M": "metal dark", "n": "metal light", "t": "trim",
         "T": "trim dark", "L": "leather", "P": "leather dark", "c": "cloth",
         "C": "cloth dark", "x": "accent", "X": "accent dark", "o": "horn",
         "O": "horn dark", "W": "white", "Z": "black"}),

    "gb": _pal("0123", ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"]),

    "mono": _pal("0123", ["#000000", "#555555", "#aaaaaa", "#ffffff"]),

    "edg32": _pal(
        "0123456789abcdefghijklmnopqrstuv",
        ["#be4a2f", "#d77643", "#ead4aa", "#e4a672", "#b86f50", "#733e39",
         "#3e2731", "#a22633", "#e43b44", "#f77622", "#feae34", "#fee761",
         "#63c74d", "#3e8948", "#265c42", "#193c3e", "#124e89", "#0099db",
         "#2ce8f5", "#ffffff", "#c0cbdc", "#8b9bb4", "#5a6988", "#3a4466",
         "#262b44", "#181425", "#ff0044", "#68386c", "#b55088", "#f6757a",
         "#e8b796", "#c28569"]),
}

DEFAULT = "chr16"
TRANSPARENT_KEY = "."


def get(name):
    if name not in PALETTES:
        raise KeyError("unknown palette %r (have: %s)"
                       % (name, ", ".join(sorted(PALETTES))))
    return PALETTES[name]


def names():
    return sorted(PALETTES)
