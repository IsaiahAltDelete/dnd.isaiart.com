#!/usr/bin/env python3
"""Author the artifact item sprites as .pxa text, then hand them to pixelforge.

Every sprite is drawn flat here -- material '2', gem '5', metal 'M', page 'W' --
and pixelforge does the outlining and the shading, so the light direction is the
same on all twelve. The palette is *semantic*, not literal: the generator page
substitutes the rolled material / gemstone colors for keys 1-6 at render time,
which is the whole reason these are text and not PNGs.

  python build.py            # write sprites/*.pxa and run the pixelforge passes
"""

import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FORGE = r"C:\Users\Dizzy\Documents\Claude\tools\pixelforge\pxforge.py"

W, H = 24, 32

PALETTE = """@palette
K #17121b  outline
k #2c2430  contact shadow
1 #6b4a2e  material dark
2 #9c7043  material mid
3 #cfa46a  material light
4 #3f2f66  gem dark
5 #6d59b0  gem mid
6 #a996e8  gem light
m #4a4f5c  metal dark
M #99a2b4  metal light
W #f4efe2  highlight
"""


# ---------------------------------------------------------------- canvas ----

class Grid(object):
    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.g = [["." for _ in range(w)] for _ in range(h)]

    def set(self, x, y, ch):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.g[y][x] = ch

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.g[y][x]
        return "."

    def frect(self, x, y, w, h, ch):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.set(i, j, ch)

    def fell(self, x, y, w, h, ch):
        """Filled ellipse inscribed in the box (x, y, w, h)."""
        cx, cy = x + (w - 1) / 2.0, y + (h - 1) / 2.0
        rx, ry = w / 2.0, h / 2.0
        for j in range(y, y + h):
            for i in range(x, x + w):
                dx, dy = (i - cx) / rx, (j - cy) / ry
                if dx * dx + dy * dy <= 1.02:
                    self.set(i, j, ch)

    def line(self, x0, y0, x1, y1, ch):
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            self.set(x0, y0, ch)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def thickline(self, x0, y0, x1, y1, ch, t=3):
        half = t // 2
        for o in range(-half, t - half):
            self.line(x0 + o, y0, x1 + o, y1, ch)

    def taper(self, y0, y1, top, bot, ch):
        """Vertical taper: half-width `top` at y0 growing to `bot` at y1."""
        span = max(1, y1 - y0)
        for j in range(y0, y1 + 1):
            t = (j - y0) / float(span)
            hw = top + (bot - top) * t
            cx = (self.w - 1) / 2.0
            for i in range(self.w):
                if abs(i - cx) <= hw:
                    self.set(i, j, ch)

    def sweep(self, pts, radii, ch):
        """Filled discs along a polyline, radius interpolated per segment."""
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            r0, r1 = radii[i], radii[i + 1]
            steps = int(max(abs(x1 - x0), abs(y1 - y0))) * 3 + 1
            for k in range(steps + 1):
                t = k / float(steps)
                cx, cy = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
                r = r0 + (r1 - r0) * t
                d = int(round(2 * r + 1))
                self.fell(int(round(cx - r)), int(round(cy - r)), d, d, ch)

    def rows(self):
        return ["".join(r) for r in self.g]


# ---------------------------------------------------------------- sprites ---

def staff():
    g = Grid()
    g.frect(10, 11, 4, 21, "2")            # shaft
    for y in (13, 20, 27):                 # binding ferrules
        g.frect(9, y, 6, 2, "M")
    g.frect(9, 30, 6, 2, "M")              # shod foot
    g.line(9, 12, 7, 4, "M")               # claw prongs
    g.line(8, 12, 6, 4, "M")
    g.line(14, 12, 16, 4, "M")
    g.line(15, 12, 17, 4, "M")
    g.line(6, 4, 7, 2, "M")
    g.line(17, 4, 16, 2, "M")
    g.fell(9, 3, 6, 8, "5")                # captive orb
    g.set(10, 5, "6")
    g.set(11, 5, "6")
    return g


def wand():
    g = Grid()
    g.thickline(7, 27, 15, 11, "2", 3)     # tapered shaft, laid on the diagonal
    g.thickline(6, 29, 9, 23, "2", 4)      # grip
    g.set(16, 10, "M")
    g.line(14, 13, 17, 9, "M")             # ferrule
    g.line(15, 14, 18, 10, "M")
    g.fell(15, 4, 7, 8, "5")               # tip stone
    g.set(17, 6, "6")
    g.set(18, 6, "6")
    for px, py in ((13, 3), (12, 2), (14, 2), (13, 1), (21, 13), (20, 14), (11, 8)):
        g.set(px, py, "W")                 # sparks off the tip
    return g


def ring():
    g = Grid()
    g.fell(4, 11, 16, 16, "2")             # band
    g.fell(7, 14, 10, 10, ".")             # hollow
    g.frect(9, 9, 6, 3, "M")               # prong setting
    g.fell(8, 2, 8, 9, "5")                # crown stone
    g.set(10, 4, "6")
    g.set(11, 4, "6")
    g.set(10, 5, "6")
    return g


def amulet():
    g = Grid()
    g.thickline(2, 0, 9, 11, "M", 2)       # chain
    g.thickline(21, 0, 14, 11, "M", 2)
    g.frect(10, 10, 4, 3, "M")             # bail
    g.fell(6, 12, 12, 15, "2")             # pendant disc
    g.fell(9, 16, 6, 7, "5")               # set stone
    g.set(10, 18, "6")
    g.set(11, 18, "6")
    g.frect(11, 27, 2, 3, "M")             # drop
    g.fell(10, 29, 4, 3, "M")
    return g


def tome():
    g = Grid()
    g.frect(4, 3, 16, 26, "2")             # cover
    g.frect(4, 3, 3, 26, "1")              # spine
    g.frect(18, 5, 3, 22, "W")             # page block
    g.frect(16, 4, 4, 3, "M")              # corner furniture
    g.frect(16, 25, 4, 3, "M")
    g.frect(15, 13, 6, 5, "M")             # clasp
    g.fell(8, 11, 8, 9, "5")               # cover boss
    g.set(10, 13, "6")
    g.set(11, 13, "6")
    return g


def blade():
    g = Grid()
    g.frect(11, 2, 2, 2, "2")              # point
    g.frect(10, 4, 4, 2, "2")
    g.frect(9, 6, 6, 14, "2")              # blade proper
    g.frect(11, 5, 2, 15, "3")             # fuller catches the light
    g.frect(6, 20, 12, 3, "M")             # crossguard
    g.frect(3, 21, 18, 1, "M")             # flared quillons
    g.frect(4, 20, 2, 2, "M")
    g.frect(18, 20, 2, 2, "M")
    g.frect(10, 23, 4, 5, "1")             # grip
    g.frect(9, 23, 6, 1, "M")              # ferrule
    g.fell(8, 27, 8, 5, "M")               # pommel
    g.fell(10, 28, 4, 3, "5")
    g.set(11, 29, "6")
    return g


def shield():
    g = Grid()
    g.frect(6, 2, 12, 1, "2")              # rolled top edge
    g.frect(5, 3, 14, 1, "2")
    for y in range(4, 16):                 # straight shoulders
        g.frect(4, y, 16, 1, "2")
    for y in range(14, 31):                # sweep down to a real point
        t = (y - 14) / 16.0
        inset = int(round(8.0 * t ** 1.3))
        w = 16 - 2 * inset
        if w < 2:
            break
        g.frect(4 + inset, y, w, 1, "2")
    g.frect(5, 3, 14, 2, "M")              # rim
    for y in range(4, 14):
        g.set(4, y, "M")
        g.set(19, y, "M")
    g.frect(11, 5, 2, 22, "1")             # pale
    g.fell(8, 9, 8, 9, "5")                # boss
    g.set(10, 11, "6")
    g.set(11, 11, "6")
    return g


def armor():
    g = Grid()
    g.frect(9, 1, 6, 4, "M")               # gorget
    g.frect(10, 2, 4, 3, "k")              # neck opening
    g.frect(4, 5, 16, 5, "2")              # chest
    g.fell(1, 6, 7, 7, "M")                # pauldrons
    g.fell(16, 6, 7, 7, "M")
    for y in range(10, 30):                # cuirass down to a rounded skirt
        t = (y - 10) / 19.0
        inset = int(round(5.0 * t ** 1.15))
        g.frect(4 + inset, y, 16 - 2 * inset, 1, "2")
    g.frect(11, 14, 2, 15, "1")            # centre seam
    for y in range(21, 24):                # belt sits at the waist
        t = (y - 10) / 19.0
        inset = int(round(5.0 * t ** 1.15))
        g.frect(4 + inset, y, 16 - 2 * inset, 1, "M")
    g.fell(8, 9, 8, 9, "5")                # breast stone
    g.set(10, 11, "6")
    g.set(11, 11, "6")
    return g


def cloak():
    g = Grid()
    g.fell(7, 2, 10, 7, "2")               # raised hood
    g.fell(9, 4, 6, 5, "k")                # hood interior stays dark
    g.frect(5, 8, 14, 3, "M")              # collar band
    for y in range(11, 29):                # falling cloth
        t = (y - 11) / 17.0
        spread = int(round(8.0 * t ** 0.8))
        g.frect(7 - spread, y, 10 + 2 * spread, 1, "2")
    for x in range(0, 24, 4):              # scalloped hem
        g.frect(x, 29, 2, 1, "2")
        g.frect(x + 2, 29, 2, 2, "2")
    for x0, x1 in ((8, 3), (11, 11), (15, 20)):
        g.line(x0, 12, x1, 28, "1")        # folds fan out with the cloth
    g.fell(9, 7, 6, 6, "5")                # clasp
    g.set(10, 9, "6")
    g.set(11, 9, "6")
    return g


def orb():
    g = Grid()
    g.fell(4, 2, 16, 16, "5")              # sphere
    g.fell(7, 4, 5, 5, "6")
    g.frect(8, 5, 2, 2, "W")               # specular
    g.line(6, 17, 4, 27, "M")              # cradle prongs
    g.line(7, 17, 5, 27, "M")
    g.line(17, 17, 19, 27, "M")
    g.line(16, 17, 18, 27, "M")
    g.frect(10, 17, 4, 11, "M")
    g.frect(3, 27, 18, 3, "2")             # base
    g.frect(5, 30, 14, 1, "1")
    return g


def bow():
    g = Grid()
    STR_X = 17                             # the string is the straight edge
    for y in range(2, 30):                 # limbs bow away from it
        t = (y - 15.5) / 13.5
        x = STR_X - int(round(9.0 * (1.0 - t * t)))
        if abs(t) > 0.88:                  # tips recurve back to the nocks
            x += int(round(4.0 * (abs(t) - 0.88) / 0.12))
        g.frect(min(x, STR_X - 1), y, 3, 1, "2")
    g.line(STR_X, 2, STR_X, 29, "W")       # string
    g.frect(STR_X - 1, 2, 2, 1, "M")       # nocks
    g.frect(STR_X - 1, 29, 2, 1, "M")
    g.frect(7, 11, 4, 10, "1")             # leather grip
    g.frect(6, 13, 6, 2, "M")              # arrow shelf
    g.frect(6, 18, 6, 2, "M")
    g.frect(8, 15, 2, 3, "5")              # inlaid stone
    g.set(8, 16, "6")
    return g


def lute():
    g = Grid()
    g.fell(3, 14, 18, 17, "2")             # lute bowl
    g.fell(6, 12, 12, 10, "2")             # upper bout
    g.frect(10, 3, 4, 13, "1")             # neck
    g.frect(8, 0, 8, 4, "M")               # pegbox
    g.set(8, 2, "K")
    g.set(15, 2, "K")
    g.fell(9, 17, 6, 6, "K")               # rose / soundhole
    g.fell(10, 18, 4, 4, "5")
    g.set(11, 19, "6")
    for x in (10, 12, 13):                 # strings
        g.line(x, 4, x, 16, "W")
    g.frect(9, 25, 6, 2, "M")              # bridge
    return g


def lyre():
    g = Grid()
    g.fell(4, 19, 16, 12, "2")             # soundbox
    g.frect(6, 21, 12, 2, "1")             # binding
    for dx in (0, 1):                      # arms curving up and outward
        g.line(7 - dx, 20, 5 - dx, 12, "2")
        g.line(5 - dx, 12, 5 - dx, 7, "2")
        g.line(16 + dx, 20, 18 + dx, 12, "2")
        g.line(18 + dx, 12, 18 + dx, 7, "2")
    g.frect(3, 4, 18, 3, "M")              # yoke
    g.frect(4, 3, 3, 2, "M")               # finials
    g.frect(17, 3, 3, 2, "M")
    for x in (8, 10, 12, 14, 16):          # strings
        g.line(x, 7, x, 20, "W")
    g.fell(9, 22, 6, 6, "5")               # rose
    g.set(10, 24, "6")
    return g


def horn():
    g = Grid()
    g.sweep([(6, 4), (4, 12), (7, 19), (11, 23)],
            [1.2, 1.9, 2.4, 3.0], "2")     # tapering bore
    g.fell(10, 15, 13, 16, "2")            # flared bell
    g.fell(12, 17, 9, 12, "M")             # rim
    g.fell(13, 18, 7, 10, "k")             # bore mouth
    g.frect(5, 1, 3, 4, "M")               # mouthpiece
    g.frect(2, 10, 4, 2, "M")              # tuning bands
    g.frect(6, 17, 4, 2, "M")
    g.fell(2, 13, 5, 5, "5")               # thumb stone
    g.set(3, 14, "6")
    return g


def chime():
    g = Grid()
    g.fell(9, 0, 6, 5, "M")                # hanging loop
    g.fell(11, 1, 2, 3, ".")
    g.frect(2, 5, 20, 4, "2")              # crossbar
    g.frect(2, 5, 20, 1, "M")
    for x, length in ((4, 18), (8, 23), (12, 14), (16, 20)):
        g.frect(x, 9, 3, length, "M")      # tubes of graded length
        g.frect(x, 9, 1, length, "m")
        g.set(x + 1, 9 + length - 1, "K")
    g.fell(9, 3, 6, 6, "5")                # boss on the bar
    g.set(10, 5, "6")
    return g


def drum():
    g = Grid()
    g.fell(1, 5, 22, 22, "2")              # frame
    g.fell(4, 8, 16, 16, "W")              # head
    for a in range(8):                     # tension cords
        import math
        t = a * math.pi / 4
        g.line(12 + int(round(9 * math.cos(t))), 16 + int(round(9 * math.sin(t))),
               12 + int(round(4 * math.cos(t))), 16 + int(round(4 * math.sin(t))), "1")
    g.fell(9, 13, 6, 6, "5")               # painted boss
    g.set(10, 15, "6")
    g.thickline(19, 30, 22, 22, "1", 2)    # beater
    g.fell(20, 19, 4, 4, "M")
    return g


SPRITES = [
    ("staff", staff), ("wand", wand), ("ring", ring), ("amulet", amulet),
    ("tome", tome), ("blade", blade), ("shield", shield), ("armor", armor),
    ("cloak", cloak), ("orb", orb), ("bow", bow),
    ("lute", lute), ("lyre", lyre), ("horn", horn), ("chime", chime), ("drum", drum),
]


# ------------------------------------------------------------------ build ---

def write_pxa(name, grid):
    path = os.path.join(HERE, name + ".pxa")
    body = "\n".join([
        "@name  %s" % name,
        "@scale 10",
        "",
        PALETTE.rstrip(),
        "",
        "@grid",
    ] + grid.rows()) + "\n"
    with open(path, "w") as fh:
        fh.write(body)
    return path


def forge(*args):
    cmd = [sys.executable, FORGE] + list(args)
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = r.stdout.decode("utf-8", "replace")
    if r.returncode:
        print("FAIL: %s\n%s" % (" ".join(args[:2]), out))
    return out


def read_grid(path):
    """Pull the finished rows back out of a .pxa (everything after @grid)."""
    rows, seen = [], False
    with open(path) as fh:
        for line in fh:
            line = line.rstrip("\n").lstrip("﻿")
            if line.startswith("@grid") or line.startswith("@frame"):
                seen = True
                continue
            if seen and line.strip() and not line.startswith("@") \
                    and not line.lstrip().startswith("#"):
                rows.append(line)
    return rows


def main():
    for name, fn in SPRITES:
        path = write_pxa(name, fn())
        # pixelforge owns the finishing passes so every sprite gets the same
        # light direction and the same outline treatment.
        forge("edit", path,
              "--outline", "K,diag",
              "--autoshade", "123,tl,.K",
              "--autoshade", "456,tl,.K",
              "--autoshade", "mM,tl,.K")
        print("%-11s %s" % (name, forge("validate", path).strip()))

    # One multi-frame file purely so `sheet --label` can render a contact sheet
    # to read back and check the silhouettes against each other.
    contact = os.path.join(HERE, "_contact.pxa")
    out = ["@name  contact", "@scale 6", "", PALETTE.rstrip(), ""]
    for name, _ in SPRITES:
        out.append("@frame %s" % name)
        out.extend(read_grid(os.path.join(HERE, name + ".pxa")))
        out.append("")
    with open(contact, "w") as fh:
        fh.write("\n".join(out) + "\n")
    forge("sheet", contact, "--cols", "6", "--gap", "3", "--scale", "6",
          "--label", "--bg", "#1b1620", "-o", os.path.join(HERE, "_contact.png"))
    print("wrote _contact.png")


if __name__ == "__main__":
    main()
