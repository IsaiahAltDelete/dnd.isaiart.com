"""Starter canvases.

The humanoid bases are blocked-in proportion guides drawn in the 's' key
(a flat grey). Paint over them, then `edit --replace s=.` to drop whatever
guide is left. Blocking in silhouette first is the difference between a
character that reads and a pile of pixels.
"""

from .fmt import Frame, Sprite, parse_color
from . import palettes

HUMANOID16 = [
    "................",
    "................",
    ".....ssssss.....",
    "....ssssssss....",
    "....ssssssss....",
    "....ssssssss....",
    "....ssssssss....",
    ".....ssssss.....",
    "...ssssssssss...",
    "..ssssssssssss..",
    "..ss.ssssss.ss..",
    "..ss.ssssss.ss..",
    ".....ssssss.....",
    "....sss..sss....",
    "....sss..sss....",
    "...ssss..ssss...",
]

HUMANOID32 = [
    "........................",
    ".........ssssss.........",
    "........ssssssss........",
    "........ssssssss........",
    "........ssssssss........",
    "........ssssssss........",
    "........ssssssss........",
    "........ssssssss........",
    ".........ssssss.........",
    "..........ssss..........",
    ".......ssssssssss.......",
    "......ssssssssssss......",
    ".....ss.ssssssss.ss.....",
    ".....ss.ssssssss.ss.....",
    ".....ss.ssssssss.ss.....",
    ".....ss.ssssssss.ss.....",
    ".....ss.ssssssss.ss.....",
    ".....ss.ssssssss.ss.....",
    "......ss.ssssss.ss......",
    "......ss.ssssss.ss......",
    ".......s.ssssss.s.......",
    "........ssssssss........",
    "........ssssssss........",
    "........sss..sss........",
    "........sss..sss........",
    "........sss..sss........",
    "........sss..sss........",
    "........sss..sss........",
    "........sss..sss........",
    "........sss..sss........",
    ".......ssss..ssss.......",
    ".......ssss..ssss.......",
]

HEAD16 = [
    "................",
    "................",
    "...ssssssssss...",
    "..ssssssssssss..",
    "..ssssssssssss..",
    "..ssssssssssss..",
    "..ssssssssssss..",
    "..ssssssssssss..",
    "..ssssssssssss..",
    "..ssssssssssss..",
    "..ssssssssssss..",
    "...ssssssssss...",
    "....ssssssss....",
    ".....ssssss.....",
    "................",
    "................",
]

TEMPLATES = {
    "humanoid16": HUMANOID16,
    "humanoid32": HUMANOID32,
    "head16": HEAD16,
}


def names():
    return sorted(TEMPLATES) + ["blank"]


def build(name, width, height, palette_name, sprite_name, frames):
    pal = palettes.get(palette_name)["colors"]
    sprite = Sprite(name=sprite_name, meta={"use": palette_name})
    sprite.palette["."] = parse_color("transparent")
    for k, hexc in pal.items():
        sprite.palette[k] = parse_color(hexc)

    if name == "blank":
        rows = ["." * width for _ in range(height)]
    else:
        if name not in TEMPLATES:
            raise KeyError("unknown template %r (have: %s)"
                           % (name, ", ".join(names())))
        rows = list(TEMPLATES[name])
        tw, th = len(rows[0]), len(rows)
        if (width, height) != (tw, th):
            # letterbox the guide into the requested canvas
            padded = []
            oy = (height - th) // 2
            ox = (width - tw) // 2
            for y in range(height):
                sy = y - oy
                if 0 <= sy < th:
                    row = rows[sy]
                    line = "".join(row[x - ox] if 0 <= x - ox < tw else "."
                                   for x in range(width))
                else:
                    line = "." * width
                padded.append(line)
            rows = padded

    sprite.frames = [Frame(fn, list(rows)) for fn in frames]
    return sprite
