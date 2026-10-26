"""Grid transforms and drawing primitives.

Everything works on Frame row-strings, so results stay diffable text.
"""

from . import color as colors
from .fmt import Frame, PxaError, color_hex, parse_color


# ---------------------------------------------------------------- transforms

def flip_h(frame):
    return Frame(frame.name, [row[::-1] for row in frame.rows])


def flip_v(frame):
    return Frame(frame.name, list(reversed(frame.rows)))


def mirror(frame, side="l"):
    """Copy one half across the vertical axis. Odd widths keep the center column."""
    w = frame.width
    half = w // 2
    rows = []
    for row in frame.rows:
        mid = row[half:w - half]
        if side == "l":
            keep = row[:half]
            rows.append(keep + mid + keep[::-1])
        else:
            keep = row[w - half:]
            rows.append(keep[::-1] + mid + keep)
    return Frame(frame.name, rows)


def rotate(frame, turns=1):
    rows = frame.rows
    for _ in range(turns % 4):
        w = len(rows[0])
        rows = ["".join(rows[len(rows) - 1 - y][x] for y in range(len(rows)))
                for x in range(w)]
    return Frame(frame.name, rows)


def crop(frame, x, y, w, h, fill="."):
    rows = []
    for yy in range(y, y + h):
        src = frame.rows[yy] if 0 <= yy < frame.height else ""
        rows.append("".join(src[xx] if 0 <= xx < len(src) else fill
                            for xx in range(x, x + w)))
    return Frame(frame.name, rows)


def pad(frame, left=0, right=0, top=0, bottom=0, fill="."):
    return crop(frame, -left, -top,
                frame.width + left + right, frame.height + top + bottom, fill)


def trim(frame, empty="."):
    """Shrink to the tight bounding box of non-empty cells."""
    xs, ys = [], []
    for y, row in enumerate(frame.rows):
        for x, ch in enumerate(row):
            if ch != empty:
                xs.append(x)
                ys.append(y)
    if not xs:
        return Frame(frame.name, ["."])
    return crop(frame, min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)


def scale_up(frame, factor):
    if factor < 1:
        raise PxaError("scale factor must be >= 1")
    rows = []
    for row in frame.rows:
        big = "".join(ch * factor for ch in row)
        rows.extend([big] * factor)
    return Frame(frame.name, rows)


def replace(frame, mapping):
    """mapping: {old_char: new_char}."""
    table = dict((ord(k), v) for k, v in mapping.items())
    return Frame(frame.name, [row.translate(table) for row in frame.rows])


def shift(frame, dx=0, dy=0, fill="."):
    return crop(frame, -dx, -dy, frame.width, frame.height, fill)


# ------------------------------------------------------------------ silhouette

_N4 = ((0, -1), (-1, 0), (1, 0), (0, 1))
_N8 = _N4 + ((-1, -1), (1, -1), (-1, 1), (1, 1))


def outline(frame, char="K", empty=".", diagonal=False, inside=False):
    """Trace the silhouette. inside=False grows outward, True paints the rim."""
    nb = _N8 if diagonal else _N4
    out = frame.copy()
    hits = []
    for y in range(frame.height):
        for x in range(frame.width):
            solid = frame.get(x, y) != empty
            if inside:
                if not solid:
                    continue
                if any(frame.get(x + dx, y + dy) in (empty, None) for dx, dy in nb):
                    hits.append((x, y))
            else:
                if solid:
                    continue
                if any(frame.get(x + dx, y + dy) not in (empty, None)
                       for dx, dy in nb):
                    hits.append((x, y))
    for x, y in hits:
        out.set(x, y, char)
    return out


LIGHTS = {"tl": (-1, -1), "t": (0, -1), "tr": (1, -1), "l": (-1, 0),
          "r": (1, 0), "bl": (-1, 1), "b": (0, 1), "br": (1, 1)}


def _light(light):
    if light not in LIGHTS:
        raise PxaError("light must be one of %s" % " ".join(sorted(LIGHTS)))
    return LIGHTS[light]


def autoshade(frame, ramp, light="tl", empty=".", form=False, depth=1):
    """Push ramp colors toward light/shadow based on which side is exposed.

    ramp: dark->light key string, e.g. "123". A cell already in the ramp whose
    neighbour toward the light is empty becomes lighter; away from the light,
    darker. Everything else is untouched.

    empty: every character that counts as "outside the form". Pass ".K" on an
    already-outlined sprite, otherwise the outline hides every edge and nothing
    shades.

    form=True reads the silhouette as a volume instead of an edge: the mask is
    blurred and its gradient taken as a surface normal, so a round bowl gets a
    lit shoulder and a shadowed belly several pixels deep rather than a 1px rim
    (and never the pillow shading of darkening every edge alike). depth caps how
    many ramp steps a cell may move either way.
    """
    if len(ramp) < 2:
        raise PxaError("ramp needs at least 2 keys, got %r" % ramp)
    lx, ly = _light(light)
    outside = set(empty) | set([None])
    idx = dict((ch, i) for i, ch in enumerate(ramp))
    out = frame.copy()
    if not form:
        for y in range(frame.height):
            for x in range(frame.width):
                ch = frame.get(x, y)
                if ch not in idx:
                    continue
                i = idx[ch]
                lit = frame.get(x + lx, y + ly) in outside
                dark = frame.get(x - lx, y - ly) in outside
                if lit and not dark:
                    i = min(len(ramp) - 1, i + depth)
                elif dark and not lit:
                    i = max(0, i - depth)
                out.set(x, y, ramp[i])
        return out

    w, h = frame.width, frame.height
    mask = [[0.0 if frame.get(x, y) in outside else 1.0 for x in range(w)] for y in range(h)]
    r = 2
    blur = [[0.0] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            acc = 0.0
            for dy in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < h and 0 <= xx < w:
                        acc += mask[yy][xx]
            blur[y][x] = acc / ((2 * r + 1) ** 2)

    def B(x, y):
        return blur[y][x] if 0 <= x < w and 0 <= y < h else 0.0

    norm = (lx * lx + ly * ly) ** 0.5
    for y in range(h):
        for x in range(w):
            ch = frame.get(x, y)
            if ch not in idx:
                continue
            # outward normal = -gradient of the blurred mass
            nx = -(B(x + 1, y) - B(x - 1, y)) / 2
            ny = -(B(x, y + 1) - B(x, y - 1)) / 2
            s = (nx * lx + ny * ly) / norm
            step = 0
            if s > 0.05:
                step = 1 if s < 0.16 else 2
            elif s < -0.04:
                step = -1 if s > -0.14 else -2
            step = max(-depth, min(depth, step))
            out.set(x, y, ramp[max(0, min(len(ramp) - 1, idx[ch] + step))])
    return out


def selout(frame, sprite, key="K", light="tl", empty=".", shadow=False, key_for=None):
    """Selective outline: the outline takes the colour of what it wraps.

    Every `key` cell on the lit side of a form becomes a darker tone of the fill
    it borders -- two steps down that fill's @ramp, or palette.js outlineFor()
    of its colour when the fill has no ramp (key_for allocates a key for it).
    The shadow side keeps the dark outline, which is what holds the silhouette;
    shadow=True tints it too (to the fill ramp's darkest step).
    """
    lx, ly = _light(light)
    out = frame.copy()
    skip = set(empty) | set([key, None])
    for y in range(frame.height):
        for x in range(frame.width):
            if frame.get(x, y) != key:
                continue
            nbrs = [(dx, dy, frame.get(x + dx, y + dy)) for dx, dy in _N4]
            inner = [n for n in nbrs if n[2] not in skip]
            if not inner:
                inner = [(dx, dy, frame.get(x + dx, y + dy)) for dx, dy in _N8[4:]]
                inner = [n for n in inner if n[2] not in skip]
            if not inner:
                continue
            counts = {}
            for n in inner:
                counts[n[2]] = counts.get(n[2], 0) + 1
            fill = max(inner, key=lambda n: counts[n[2]])[2]
            # direction from the fill to the outline cell, against the light
            facing = sum(-dx * lx - dy * ly for dx, dy, c in inner if c == fill)
            lit = facing > 0
            if not lit and not shadow:
                continue
            r, i = sprite.ramp_of(fill)
            if r is not None:
                out.set(x, y, r.keys[max(0, i - 2)] if lit else r.keys[0])
            elif key_for is not None:
                c = sprite.palette.get(fill)
                if c and c[3]:
                    out.set(x, y, key_for(parse_color(colors.outline_for(color_hex(c)))))
    return out


def is_l_corner(frame, x, y, key):
    """Is (x, y) the redundant corner of an L in a 1px line of `key`? It has a
    horizontal and a vertical same-key neighbour, the diagonal between them is
    free, and anything else of `key` touching it also touches one of those two
    -- so removing it leaves a clean diagonal and disconnects nothing."""
    if frame.get(x, y) != key:
        return False
    same = [(dx, dy) for dx, dy in _N8 if frame.get(x + dx, y + dy) == key]
    hs = [d for d in same if d[1] == 0]
    vs = [d for d in same if d[0] == 0]
    for hx, _ in hs:
        for _, vy in vs:
            if frame.get(x + hx, y + vy) == key:
                continue
            rest = [d for d in same if d not in ((hx, 0), (0, vy))]
            if all(max(abs(dx - hx), abs(dy)) <= 1 or max(abs(dx), abs(dy - vy)) <= 1
                   for dx, dy in rest):
                return True
    return False


def l_corners(frame, key):
    return [(x, y) for y in range(frame.height) for x in range(frame.width)
            if is_l_corner(frame, x, y, key)]


def perfect(frame, keys, region=None):
    """The 'pixel perfect' pass: drop L-corner doubles from 1px lines of `keys`.
    A dropped cell takes the commonest neighbour that is not the line itself,
    so a line drawn over a fill leaves fill behind, not a hole."""
    x0, y0, w, h = region or (0, 0, frame.width, frame.height)
    for key in keys:
        for x, y in l_corners(frame, key):
            if not (x0 <= x < x0 + w and y0 <= y < y0 + h):
                continue
            if not is_l_corner(frame, x, y, key):
                continue          # an earlier removal already fixed this corner
            around = [frame.get(x + dx, y + dy) for dx, dy in _N8]
            around = [c for c in around if c is not None and c != key]
            fill = max(set(around), key=around.count) if around else "."
            frame.set(x, y, fill)
    return frame


BAYER = {
    "bayer2": ((0, 2), (3, 1)),
    "bayer4": ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5)),
    "checker": ((0, 1), (1, 0)),
}


def dither(frame, x, y, w, h, a, b, t=0.5, grad=None, pattern="bayer4", mask=None):
    """Ordered (Bayer) dither between keys a and b over a region.

    t is the share of b; grad='v'|'h'|'r' sweeps it 0 -> 1 top to bottom, left
    to right, or centre to rim. The matrix is anchored to the frame, not the
    region, so neighbouring dithers tile without seams. Only cells already a or
    b change unless mask says otherwise ('*' = any opaque, 'all' = everything,
    or a string of keys).
    """
    if pattern not in BAYER:
        raise PxaError("dither pattern must be one of %s" % " ".join(sorted(BAYER)))
    m = BAYER[pattern]
    n = len(m)
    levels = float(n * n) if pattern != "checker" else 2.0
    cx, cy = x + (w - 1) / 2.0, y + (h - 1) / 2.0
    rad = max(1.0, (max(w, h) - 1) / 2.0)
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            cur = frame.get(xx, yy)
            if cur is None:
                continue
            if mask is None:
                if cur not in (a, b):
                    continue
            elif mask == "*":
                if cur == ".":
                    continue
            elif mask != "all" and cur not in mask:
                continue
            if grad == "v":
                tt = (yy - y + 0.5) / h
            elif grad == "h":
                tt = (xx - x + 0.5) / w
            elif grad == "r":
                tt = min(1.0, (((xx - cx) ** 2 + (yy - cy) ** 2) ** 0.5) / rad)
            else:
                tt = t
            thr = (m[yy % n][xx % n] + 0.5) / levels
            frame.set(xx, yy, b if tt > thr else a)
    return frame


# -------------------------------------------------------------------- drawing

def draw_point(frame, x, y, ch):
    frame.set(x, y, ch)


def draw_line(frame, x0, y0, x1, y1, ch):
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        frame.set(x0, y0, ch)
        if x0 == x1 and y0 == y1:
            return
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def draw_rect(frame, x, y, w, h, ch, fill=False):
    if w <= 0 or h <= 0:
        return
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            edge = xx in (x, x + w - 1) or yy in (y, y + h - 1)
            if fill or edge:
                frame.set(xx, yy, ch)


def draw_ellipse(frame, x, y, w, h, ch, fill=False):
    """Inscribed in the box (x, y, w, h)."""
    if w <= 0 or h <= 0:
        return
    cx, cy = x + (w - 1) / 2.0, y + (h - 1) / 2.0
    rx, ry = w / 2.0, h / 2.0
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            nx = (xx - cx) / rx
            ny = (yy - cy) / ry
            d = nx * nx + ny * ny
            if d <= 1.0:
                if fill:
                    frame.set(xx, yy, ch)
                else:
                    # keep the rim: inside, but with an outside 4-neighbour
                    rim = False
                    for dx, dy in _N4:
                        ox, oy = xx + dx, yy + dy
                        onx = (ox - cx) / rx
                        ony = (oy - cy) / ry
                        if onx * onx + ony * ony > 1.0:
                            rim = True
                            break
                    if rim:
                        frame.set(xx, yy, ch)


def flood_fill(frame, x, y, ch):
    target = frame.get(x, y)
    if target is None or target == ch:
        return
    stack = [(x, y)]
    while stack:
        cx, cy = stack.pop()
        if frame.get(cx, cy) != target:
            continue
        frame.set(cx, cy, ch)
        for dx, dy in _N4:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < frame.width and 0 <= ny < frame.height:
                stack.append((nx, ny))


def paste(dst, src, x, y, transparent="."):
    for sy in range(src.height):
        for sx in range(src.width):
            ch = src.get(sx, sy)
            if ch == transparent:
                continue
            dst.set(x + sx, y + sy, ch)
