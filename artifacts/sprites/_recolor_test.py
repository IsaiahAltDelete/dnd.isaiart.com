"""Mirror of the page's spritePalette() so the recolor can be eyeballed offline."""
import os, re, sys, subprocess
sys.path.insert(0, r"C:\Users\Dizzy\Documents\Claude\tools\pixelforge")

HERE = os.path.dirname(os.path.abspath(__file__))
FORGE = r"C:\Users\Dizzy\Documents\Claude\tools\pixelforge\pxforge.py"

def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
def hx(t):
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(round(v)))) for v in t)
def mix(a, b, t):
    x, y = rgb(a), rgb(b)
    return hx(tuple(x[i] + (y[i] - x[i]) * t for i in range(3)))
shade = lambda h, t: mix(h, '#120c14', t)
tint = lambda h, t: mix(h, '#fffaf0', t)
lum = lambda h: (0.2126 * rgb(h)[0] + 0.7152 * rgb(h)[1] + 0.0722 * rgb(h)[2]) / 255

def floor_lum(h, minimum):
    """Nudge a colour up until it clears `minimum` luminance."""
    for _ in range(14):
        if lum(h) >= minimum:
            break
        h = tint(h, 0.12)
    return h


def palette(mat, matAcc, gem, gemAcc):
    """Kept in lockstep with spritePalette() in ../index.html."""
    pale = lum(mat) > 0.72
    if abs(lum(gem) - lum(mat)) < 0.20:
        gem = shade(gem, 0.42) if lum(mat) > 0.5 else tint(gem, 0.34)
    pale_gem = lum(gem) > 0.74
    return {
        '1': shade(mat, 0.30 if pale else 0.40),
        '2': shade(mat, 0.10) if pale else mat,
        '3': tint(mat, 0.10 if pale else 0.32),
        '4': shade(gem, 0.30 if pale_gem else 0.38),
        '5': shade(gem, 0.12) if pale_gem else gem,
        '6': tint(gem, 0.10 if pale_gem else 0.36),
        'm': shade(matAcc, 0.34), 'M': tint(matAcc, 0.22),
        'K': floor_lum(mix(shade(mat, 0.84), '#1a1420', 0.5), 0.135),
        'k': shade(mat, 0.62),
        'W': mix('#f7f1e1', gemAcc, 0.14),
    }


# material(main, accent), gem(main, accent) -- the extremes of the two tables.
COMBOS = [
    ("ashwood-ruby",     "#E3C98A", "#4B3427", "#B72833", "#C8A763", "staff"),
    ("blacksteel-topaz", "#46464F", "#B8893D", "#C28B38", "#8A4C29", "blade"),
    ("vellum-amethyst",  "#EEDBB8", "#653759", "#8A68B6", "#DDD1F0", "tome"),
    ("moonsilver-sapph", "#C9D1DD", "#6A3429", "#345DAD", "#D7E2F6", "amulet"),
    ("driftglass-opal",  "#9FCBC3", "#89513B", "#CFE3DE", "#DA9DA8", "orb"),
    ("witchwood-emerald","#7B563D", "#4C786B", "#2F8F5B", "#BF9A56", "cloak"),
    ("dragonbone-garnet","#E7DBCA", "#8C2C2C", "#87323A", "#EAD8C2", "shield"),
    ("starion-labrador", "#B8BFCA", "#3E4D7A", "#6D798E", "#2C7F8A", "armor"),
    ("sunbrass-moonston","#C69D52", "#6B231A", "#E7EDF4", "#AE7E7E", "ring"),
    ("stoneglass-smoky", "#B7B0A5", "#596A4C", "#7A665A", "#D6AF68", "lute"),
    ("ashwood-labrador", "#E3C98A", "#4B3427", "#6D798E", "#2C7F8A", "bow"),
    ("blacksteel-ruby",  "#46464F", "#B8893D", "#B72833", "#C8A763", "wand"),
    ("vellum-moonstone", "#EEDBB8", "#653759", "#E7EDF4", "#AE7E7E", "lyre"),
    ("sunbrass-topaz",   "#C69D52", "#6B231A", "#C28B38", "#8A4C29", "horn"),
    ("moonsilver-opal",  "#C9D1DD", "#6A3429", "#CFE3DE", "#DA9DA8", "chime"),
    ("dragonbone-emrld", "#E7DBCA", "#8C2C2C", "#2F8F5B", "#BF9A56", "drum"),
]

def grid_rows(name):
    rows, seen = [], False
    for line in open(os.path.join(HERE, name + ".pxa")):
        line = line.rstrip("\n").lstrip("\ufeff")
        if line.startswith("@grid") or line.startswith("@frame"):
            seen = True; continue
        if seen and line.strip() and not line.startswith("@") and not line.lstrip().startswith("#"):
            rows.append(line)
    return rows

out = ["@name  recolor", "@scale 6", ""]
frames = []
for label, mat, matAcc, gem, gemAcc, sprite in COMBOS:
    pal = palette(mat, matAcc, gem, gemAcc)
    # Unique keys per frame so one file can hold twelve different palettes.
    tag = str(len(frames))
    remap = {}
    lines = []
    for i, (k, v) in enumerate(sorted(pal.items())):
        nk = chr(ord('A') + i) if tag == '0' else None
    frames.append((label, sprite, pal))

# Simpler: render each combo to its own PNG, then let `sheet` stitch nothing --
# instead emit one .pxa per combo and a montage via repeated render.
paths = []
for label, sprite, pal in frames:
    body = ["@name  " + label, "@scale 6", "", "@palette"]
    for k, v in pal.items():
        body.append("%s %s" % (k, v))
    body += ["", "@grid"] + grid_rows(sprite)
    p = os.path.join(HERE, "_rc_%s.pxa" % label)
    open(p, "w").write("\n".join(body) + "\n")
    paths.append((label, p))

from pxlib import png as pxpng, fmt as pxfmt, render as pxrender

COLS, SCALE, GAP = 6, 6, 8
tiles = []
for label, path in paths:
    sp = pxfmt.load(path)
    tiles.append(pxrender.render_png(sp, scale=SCALE))
w, h = tiles[0].w, tiles[0].h
rows_n = (len(tiles) + COLS - 1) // COLS
canvas = pxrender.Canvas(COLS * (w + GAP) + GAP, rows_n * (h + GAP) + GAP, (27, 22, 32, 255))
for i, t in enumerate(tiles):
    canvas.blit_rgba(t.buf, t.w, t.h, GAP + (i % COLS) * (w + GAP), GAP + (i // COLS) * (h + GAP))
pxpng.write_rgba(os.path.join(HERE, "_recolor.png"), canvas.w, canvas.h, canvas.buf)
for _, path in paths:
    os.remove(path)
print("wrote _recolor.png")
