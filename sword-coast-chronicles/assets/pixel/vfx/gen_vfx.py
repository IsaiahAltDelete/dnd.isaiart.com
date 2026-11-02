# assets/pixel/vfx/gen_vfx.py — writes the spell showpiece .pxa sources (fireball, lightning, smite, sigil).
#
# The frames are drawn by rule rather than by hand: a fireball is a handful of
# puffs of heat whose edges are roughened by noise and whose temperature is
# stepped onto the fire ramp; a lightning strike is a midpoint-displaced path
# drawn with Bresenham. The output is ordinary PixelForge source — preview,
# lint and touch it up like any other .pxa; rerun this only to start over.
#
#   python assets/pixel/vfx/gen_vfx.py [fireball lightning smite sigil]   (then: node tools/pxbuild.mjs)
#
# Deterministic: no random module, only a hash of (x, y, seed).

import math, os

HERE = os.path.dirname(os.path.abspath(__file__))
BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]


def hsh(x, y, s):
    h = (x * 374761393 + y * 668265263 + s * 144664) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffffff) / 4294967296.0


def vnoise(x, y, s):
    x0, y0 = math.floor(x), math.floor(y)
    fx, fy = x - x0, y - y0
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = hsh(x0, y0, s), hsh(x0 + 1, y0, s)
    c, d = hsh(x0, y0 + 1, s), hsh(x0 + 1, y0 + 1, s)
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy


def fbm(x, y, s):
    return vnoise(x / 4.0, y / 4.0, s) * 0.65 + vnoise(x / 2.0, y / 2.0, s + 17) * 0.35


def grid(w, h):
    return [['.'] * w for _ in range(h)]


def rows(g):
    return [''.join(r) for r in g]


def put(g, x, y, k):
    if 0 <= y < len(g) and 0 <= x < len(g[0]):
        g[y][x] = k


def bres(g, x0, y0, x1, y1, k, over=None):
    x0, y0, x1, y1 = int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))
    dx, sx = abs(x1 - x0), 1 if x0 < x1 else -1
    dy, sy = -abs(y1 - y0), 1 if y0 < y1 else -1
    err = dx + dy
    while True:
        if over is None or (0 <= y0 < len(g) and 0 <= x0 < len(g[0]) and g[y0][x0] in over):
            put(g, x0, y0, k)
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy; x0 += sx
        if e2 <= dx:
            err += dx; y0 += sy


# --------------------------------------------------------------------- fireball

def fireball():
    W, H = 48, 48
    # (dur ms, fire puffs (cx, cy, r, heat), smoke puffs (cx, cy, r, density))
    F = [
        (40, [(24, 31, 4.5, 1.0)], []),
        (50, [(24, 30, 8.5, 1.0), (20, 27, 4, 1.0)], []),
        (60, [(24, 29, 12, 0.96), (19, 24, 6, 1.0), (29, 33, 6.5, 0.86), (24, 38, 5.5, 0.8)], []),
        (70, [(24, 27, 14, 0.86), (18, 21, 7.5, 0.92), (31, 23, 6.5, 0.8), (24, 37, 8, 0.72),
              (14, 32, 5.5, 0.66), (34, 34, 5.5, 0.62)], []),
        (80, [(24, 25, 13.5, 0.72), (17, 19, 7.5, 0.76), (31, 20, 7, 0.7), (24, 36, 7.5, 0.55),
              (13, 31, 5, 0.5), (35, 33, 5, 0.48)], [(19, 11, 6, 1.0), (30, 12, 5.5, 1.0)]),
        (90, [(24, 25, 10.5, 0.6), (17, 20, 6, 0.6), (31, 20, 5.5, 0.56), (24, 35, 5.5, 0.42)],
             [(24, 13, 9, 1.0), (14, 15, 6.5, 1.0), (34, 15, 6.5, 1.0), (24, 23, 7, 0.75)]),
        (100, [(22, 27, 4, 0.55), (28, 24, 3, 0.52), (24, 34, 3, 0.42)],
              [(24, 11, 9, 0.95), (14, 13, 6.5, 0.9), (34, 12, 6.5, 0.9), (22, 22, 7, 0.85), (17, 28, 4.5, 0.7), (31, 27, 5, 0.7)]),
        (110, [(24, 29, 2, 0.5)],
              [(23, 8, 8.5, 0.72), (12, 10, 6, 0.62), (36, 9, 6, 0.62), (25, 18, 6.5, 0.6), (16, 22, 4.5, 0.5), (32, 21, 4.5, 0.5)]),
        (120, [],
              [(23, 5, 7.5, 0.42), (11, 7, 5, 0.34), (37, 6, 5, 0.34), (26, 14, 5, 0.36), (17, 17, 3.5, 0.3)]),
    ]
    frames = []
    for fi, (dur, fire, smoke) in enumerate(F):
        g = grid(W, H)
        # The whole blast sits a little lower after contact, on the ground.
        drop = 0 if fi < 2 else 3
        fire = [(cx, cy + drop, r, t) for (cx, cy, r, t) in fire]
        smoke = [(cx, cy + drop, r, dn) for (cx, cy, r, dn) in smoke]
        for y in range(H):
            for x in range(W):
                v1, v2, heat = 0, 0, -1
                for (cx, cy, r, t) in fire:
                    n = fbm(x + fi * 3, y + fi * 5, 11)
                    rr = r * (0.82 + 0.36 * n)
                    d = math.hypot(x - cx, y - cy) / rr
                    if d < 1:
                        v = 1 - d
                        # Hotter at the heart and on the upper-left, where the light is.
                        hv = t * (0.46 + 0.54 * v) + 0.08 * (-(x - cx) - (y - cy)) / max(1, r)
                        if v > v1:
                            v2, v1, heat = v1, v, max(heat, hv)
                        else:
                            v2 = max(v2, v)
                            heat = max(heat, hv * 0.96)
                if v1 > 0:
                    j = (fbm(x * 1.7, y * 1.7, 29 + fi) - 0.5) * 0.16
                    h2 = heat + j
                    # Where two billows meet, a darker crease: the ball boils
                    # instead of reading as one flat disc.
                    if v2 > 0 and v1 - v2 < 0.1 and v1 < 0.7:
                        h2 -= 0.16
                    k = '4' if h2 > 0.86 else '3' if h2 > 0.68 else '2' if h2 > 0.47 else '1' if h2 > 0.3 else '0'
                    # Late flames thin out instead of darkening: a dark pixel on
                    # lit ground reads as a scorch mark, not as fire.
                    if fi >= 5 and k == '0':
                        continue
                    g[y][x] = k
                    continue
                best = None
                for (cx, cy, r, dens) in smoke:
                    n = fbm(x + fi * 2, y - fi * 4, 53)
                    rr = r * (0.8 + 0.4 * n)
                    d = math.hypot(x - cx, y - cy) / rr
                    if d < 1 and (best is None or d - 0.3 * dens < best[2]):
                        # Each puff is its own lit ball: top-left pale, lower-right deep.
                        lit = (-(x - cx) * 0.6 - (y - cy)) / rr + (n - 0.5) * 0.35
                        best = (lit, dens, d - 0.3 * dens, d)
                if best:
                    lit, dens, _, d = best
                    # Solid in the middle, dithered only at the rim, thinner as it rises.
                    cover = dens * (1.6 - d * 1.1)
                    if BAYER[((y & 3) << 2) | (x & 3)] >= cover * 16:
                        continue
                    g[y][x] = 'w' if lit > 0.35 else 'v' if lit > -0.2 else 'u'
        if fi == 0:
            # The contact flash: four white rays off the heart.
            for i in range(5, 9):
                for (dx, dy) in ((i, 0), (-i, 0), (0, -i), (0, i)):
                    put(g, 24 + dx, 31 + dy, '4' if i < 7 else '3')
        frames.append((dur, rows(g)))
    head = """@name  vfx-fireball
@scale 8
@size  48x48
# The fireball: a white-hot contact flash, a ball of flame that swells and
# boils (hot heart and upper-left, cooling to red at the lumpy rim), then the
# flames thin out under a pall of smoke that rises and breaks up by dither.
# Timing is fast in, slow out: 40ms at contact, 120ms for the last smoke.
# Anchored at the ground under the blast; vfx.js adds the shock ring, the
# scorch and the flames across the spell's real radius.
#
# Generated by gen_vfx.py (edit by hand freely; rerun only to start over).
@anchor 24,46
@point centre 24,30
@ramp  fire fire 5 01234
@ramp  smoke stone 5 uvwxy
@recolor fire magic
@anim  boom boom-0 boom-1 boom-2 boom-3 boom-4 boom-5 boom-6 boom-7 boom-8 loop=0
# Fire is its own light (no outline, brightest inside); the rays of the
# contact frame are 1px on purpose; the smoke is dithered as it thins.
@lint  skip=pillow,light,stray,orphan,jaggy,doubles,banding emissive=fire
"""
    return head, [('boom-%d' % i, d, r) for i, (d, r) in enumerate(frames)]


# ------------------------------------------------------------------- lightning

def bolt_path(x0, y0, x1, y1, seed, depth=5, jag=0.22):
    pts = [(x0, y0), (x1, y1)]
    amp = math.hypot(x1 - x0, y1 - y0) * jag
    for d in range(depth):
        out = [pts[0]]
        for i in range(len(pts) - 1):
            (ax_, ay_), (bx_, by_) = pts[i], pts[i + 1]
            mx, my = (ax_ + bx_) / 2, (ay_ + by_) / 2
            dx, dy = bx_ - ax_, by_ - ay_
            l = math.hypot(dx, dy) or 1
            off = (hsh(i, d, seed) * 2 - 1) * amp
            out += [(mx - dy / l * off, my + dx / l * off), (bx_, by_)]
        pts = [(min(36, max(3, px_)), py_) for (px_, py_) in out]
        amp *= 0.55
    return pts


def draw_path(g, pts, k, reveal=1.0, dx=0, dy=0, over=None):
    n = max(2, int(math.ceil(len(pts) * reveal)))
    for i in range(n - 1):
        bres(g, pts[i][0] + dx, pts[i][1] + dy, pts[i + 1][0] + dx, pts[i + 1][1] + dy, k, over)


def lightning():
    W, H = 40, 112
    gx, gy = 20, 108
    A = bolt_path(15, 0, gx, gy, 3, 4, 0.17)
    B = bolt_path(25, 0, gx, gy, 8, 4, 0.17)
    brA = [bolt_path(A[i][0], A[i][1], A[i][0] + s * 13, A[i][1] + 22, 40 + i, 3, 0.3) for i, s in ((5, -1), (9, 1), (12, -1))]
    brB = [bolt_path(B[i][0], B[i][1], B[i][0] + s * 12, B[i][1] + 20, 60 + i, 3, 0.3) for i, s in ((4, 1), (10, -1))]

    def splash(g, rx, ry, k, k2=None):
        for y in range(-ry, ry + 1):
            for x in range(-rx, rx + 1):
                d = (x / (rx + 0.5)) ** 2 + (y / (ry + 0.5)) ** 2
                if d <= 1 and y >= 0 - ry:
                    put(g, gx + x, gy + y, k2 if (k2 and d > 0.45) else k)

    F = []
    # 0: the leader creeps down, faint.
    g = grid(W, H); draw_path(g, A, '2', 0.6)
    for b in brA[:1]: draw_path(g, b, '1', 0.8)
    F.append((30, g))
    # 1: the return stroke: white core, lit edge, every branch.
    g = grid(W, H)
    for b in brA: draw_path(g, b, '2'); draw_path(g, b, '3', 1, 1, 0)
    draw_path(g, A, '3', 1, -1, 0); draw_path(g, A, '3', 1, 1, 0); draw_path(g, A, '4')
    splash(g, 5, 1, '4', '3')
    F.append((40, g))
    # 2: the flash frame: three wide, the ground lit white.
    g = grid(W, H)
    for b in brA: draw_path(g, b, '3', 1, 1, 0); draw_path(g, b, '4')
    for ox in (-2, 2): draw_path(g, A, '2', 1, ox, 0)
    for ox in (-1, 1): draw_path(g, A, '3', 1, ox, 0)
    draw_path(g, A, '4'); draw_path(g, A, '4', 1, 0, 1)
    splash(g, 8, 2, '4', '3')
    F.append((40, g))
    # 3: re-struck down a new channel.
    g = grid(W, H)
    for b in brB: draw_path(g, b, '2')
    draw_path(g, B, '2', 1, 1, 0); draw_path(g, B, '4')
    splash(g, 5, 1, '3', '2')
    F.append((50, g))
    # 4: dimming, the branches gone.
    g = grid(W, H)
    draw_path(g, B, '1', 1, 1, 0); draw_path(g, B, '3')
    splash(g, 4, 1, '2', '1')
    F.append((60, g))
    # 5: the afterimage breaks up from the top down.
    g = grid(W, H)
    draw_path(g, B, '2')
    for y in range(H):
        for x in range(W):
            if g[y][x] != '.' and (y < 50 or hsh(x, y // 3, 5) < 0.35):
                g[y][x] = '.'
    splash(g, 3, 1, '1')
    F.append((70, g))
    # 6: embers where it struck.
    g = grid(W, H)
    for (x, y) in ((gx - 3, gy - 1), (gx + 2, gy - 2), (gx, gy - 4), (gx + 4, gy), (gx - 5, gy)):
        put(g, x, y, '2')
    put(g, gx, gy, '3'); put(g, gx - 1, gy, '1'); put(g, gx + 1, gy, '1')
    F.append((80, g))
    head = """@name  vfx-lightning
@scale 5
@size  40x112
# A lightning strike from the sky: a faint leader creeps down, the return
# stroke goes white with every branch lit, one flash frame three pixels wide
# with the ground lit, a re-strike down a new channel, then it dims and
# breaks up from the top, leaving embers where it hit.
# Anchored where it strikes the ground.
#
# Generated by gen_vfx.py (edit by hand freely; rerun only to start over).
@anchor 20,108
@point  ground 20,108
@ramp  bolt lightning 5 01234
@recolor bolt magic
@anim  strike strike-0 strike-1 strike-2 strike-3 strike-4 strike-5 strike-6 loop=0
# Lightning is a 1px jagged line by nature, and its own light.
@lint  skip=pillow,light,stray,orphan,jaggy,doubles,banding emissive=bolt
"""
    return head, [('strike-%d' % i, d, rows(g)) for i, (d, g) in enumerate(F)]


# ----------------------------------------------------------------------- smite

def smite():
    W, H = 40, 72
    cx, gy = 20, 69

    def column(g, top, w, keys, dith_top=None):
        # keys: (outer, body, core); widths shrink toward the core.
        hw = w // 2
        for y in range(top, gy + 1):
            for x in range(cx - hw - 1, cx + hw + 2):
                d = abs(x - cx)
                if d > hw + 1:
                    continue
                if dith_top is not None and y < dith_top and BAYER[((y & 3) << 2) | (x & 3)] >= 8:
                    continue
                if d == hw + 1:
                    if BAYER[((y & 3) << 2) | (x & 3)] < 8:
                        put(g, x, y, keys[0])
                elif d > max(0, hw - 2):
                    put(g, x, y, keys[1])
                else:
                    put(g, x, y, keys[2])

    def rays(g, n, k, kd):
        for i in range(1, n + 1):
            kk = k if i < n * 0.6 else kd
            put(g, cx - i, gy - 1, kk); put(g, cx + i, gy - 1, kk)
        for i in range(1, n // 2 + 1):
            kk = k if i < n * 0.3 else kd
            put(g, cx - i, gy - 1 - i, kd); put(g, cx + i, gy - 1 - i, kd)

    def ground(g, rx, k, k2):
        ry = max(1, rx // 4)
        for y in range(-ry, ry + 1):
            for x in range(-rx, rx + 1):
                d = (x / (rx + 0.5)) ** 2 + (y / (ry + 0.5)) ** 2
                if 0.55 < d <= 1:
                    put(g, cx + x, gy + y, k2)
                elif d <= 0.55 and rx > 4:
                    put(g, cx + x, gy + y, k)

    def sparkles(g, pts, k):
        for (x, y) in pts:
            put(g, x, y, k); put(g, x - 1, y, '2'); put(g, x + 1, y, '2'); put(g, x, y - 1, '2'); put(g, x, y + 1, '2')

    F = []
    g = grid(W, H); column(g, 0, 1, ('1', '2', '3')); F.append((40, g))
    g = grid(W, H); column(g, 0, 3, ('2', '3', '4')); ground(g, 6, '4', '3'); F.append((40, g))
    g = grid(W, H); column(g, 0, 7, ('1', '3', '4')); ground(g, 10, '4', '3'); rays(g, 18, '4', '3'); F.append((50, g))
    g = grid(W, H); column(g, 0, 9, ('1', '2', '4')); ground(g, 13, '3', '2'); rays(g, 13, '3', '2')
    sparkles(g, ((8, 50), (32, 44), (11, 30)), '4'); F.append((60, g))
    g = grid(W, H); column(g, 0, 5, ('1', '2', '3'), dith_top=26); ground(g, 16, '2', '2')
    sparkles(g, ((7, 42), (33, 36), (12, 22), (29, 55)), '3'); F.append((70, g))
    g = grid(W, H)
    for (y0, y1) in ((4, 12), (20, 30), (38, 50), (56, 66)):
        for y in range(y0, y1):
            put(g, cx, y, '3' if y < y1 - 3 else '2'); put(g, cx - 1, y, '1'); put(g, cx + 1, y, '1')
    sparkles(g, ((9, 34), (31, 28), (14, 14), (27, 48)), '3'); F.append((80, g))
    g = grid(W, H)
    for (x, y) in ((10, 26), (30, 20), (16, 8), (25, 40), (20, 52)):
        put(g, x, y, '3'); put(g, x, y + 1, '1')
    F.append((100, g))
    head = """@name  vfx-smite
@scale 6
@size  40x72
# Holy smite: a thread of light drops out of the sky, slams to a column with a
# white core and a dithered edge, flares across the ground in four rays, then
# narrows, breaks into rising segments and leaves a few sparkles.
# Anchored on the ground under the column.
#
# Generated by gen_vfx.py (edit by hand freely; rerun only to start over).
@anchor 20,69
@point  ground 20,69
@ramp  holy radiant 5 01234
@recolor holy magic
@anim  smite smite-0 smite-1 smite-2 smite-3 smite-4 smite-5 smite-6 loop=0
# Light from within (brightest in the core), with a dithered 1px fringe; the
# radiant ramp's two top whites are meant to be near-identical (white-hot).
@lint  skip=pillow,light,stray,orphan,jaggy,doubles,banding,ramp emissive=holy
"""
    return head, [('smite-%d' % i, d, rows(g)) for i, (d, g) in enumerate(F)]


# ----------------------------------------------------------------------- sigil

RUNES = ['010111010', '111101111', '101010101', '110011110', '011110011', '100111001', '111010111', '101111101']


def ellipse_pts(rx, ry):
    pts = set()
    rx2, ry2 = rx * rx, ry * ry
    x, y = 0, ry
    px, py = 0, 2 * rx2 * y
    p = ry2 - rx2 * ry + 0.25 * rx2
    while px < py:
        pts.update({(x, y), (-x, y), (x, -y), (-x, -y)})
        x += 1; px += 2 * ry2
        if p < 0:
            p += ry2 + px
        else:
            y -= 1; py -= 2 * rx2; p += ry2 + px - py
    p = ry2 * (x + 0.5) ** 2 + rx2 * (y - 1) ** 2 - rx2 * ry2
    while y >= 0:
        pts.update({(x, y), (-x, y), (x, -y), (-x, -y)})
        y -= 1; py -= 2 * rx2
        if p > 0:
            p += rx2 - py
        else:
            x += 1; px += 2 * ry2; p += rx2 - py + px
    return sorted(pts, key=lambda q: math.atan2(q[1], q[0]))


def sigil():
    W, H = 48, 28
    cx, cy = 24, 14
    outer = ellipse_pts(22, 12)
    inner = ellipse_pts(16, 8)

    def arc(g, pts, frac, k, start=-math.pi / 2):
        for (x, y) in pts:
            a = (math.atan2(y, x) - start) % (2 * math.pi)
            if a <= frac * 2 * math.pi:
                put(g, cx + x, cy + y, k)

    def star(g, k, frac=1.0, rot=0.0):
        # Seven points, every second joined: Mystra's seven stars, the Weave's sign.
        n = 7
        for i in range(n):
            if i / n >= frac:
                break
            a1 = rot + i / n * 2 * math.pi - math.pi / 2
            a2 = rot + ((i + 2) % n) / n * 2 * math.pi - math.pi / 2
            bres(g, cx + math.cos(a1) * 15, cy + math.sin(a1) * 7.5, cx + math.cos(a2) * 15, cy + math.sin(a2) * 7.5, k)

    def runes(g, k, n_on=7, shift=0, holes=None):
        for i in range(7):
            if i >= n_on:
                break
            # Between the star's points, one rune under each gap.
            a = (i + 0.5 + shift * 0.5) / 7 * 2 * math.pi - math.pi / 2
            rx_, ry_ = 19, 10
            gx = cx + int(round(math.cos(a) * rx_)) - 1
            gy = cy + int(round(math.sin(a) * ry_)) - 1
            r = RUNES[(i + shift) % 8]
            for j in range(9):
                if r[j] == '1' and not (holes and hsh(gx + j % 3, gy + j // 3, holes) < 0.5):
                    put(g, gx + j % 3, gy + j // 3, k)

    def thin(g, cover, seed):
        for y in range(H):
            for x in range(W):
                if g[y][x] != '.' and BAYER[((y & 3) << 2) | (x & 3)] >= cover * 16:
                    g[y][x] = '.'

    F = []
    g = grid(W, H); arc(g, outer, 0.35, '2'); F.append((50, g))
    g = grid(W, H); arc(g, outer, 0.8, '2'); arc(g, inner, 0.2, '1'); F.append((50, g))
    g = grid(W, H); arc(g, outer, 1, '3'); arc(g, inner, 0.7, '2'); star(g, '1', 0.5); F.append((50, g))
    g = grid(W, H); arc(g, outer, 1, '3'); arc(g, inner, 1, '2'); star(g, '2'); runes(g, '3', 4); F.append((60, g))
    g = grid(W, H); arc(g, outer, 1, '3'); arc(g, inner, 1, '3'); star(g, '2'); runes(g, '4', 7); F.append((60, g))
    g = grid(W, H); star(g, '3'); arc(g, inner, 1, '3'); arc(g, outer, 1, '4'); runes(g, '4', 7, 1); F.append((80, g))
    g = grid(W, H); star(g, '2'); arc(g, inner, 1, '2'); arc(g, outer, 1, '3'); runes(g, '4', 7, 2); F.append((80, g))
    g = grid(W, H); star(g, '1'); arc(g, inner, 1, '2'); arc(g, outer, 1, '2'); runes(g, '3', 7, 3); thin(g, 0.75, 4); F.append((100, g))
    g = grid(W, H); arc(g, inner, 1, '1'); arc(g, outer, 1, '1'); runes(g, '2', 7, 4); thin(g, 0.4, 5); F.append((120, g))
    head = """@name  vfx-sigil
@scale 8
@size  48x28
# An arcane sigil laid on the ground (seen at the world's 2:1 slant): the
# outer circle draws itself clockwise from the top, the inner circle and a
# seven-point star (Mystra's seven stars) follow, seven runes light up and
# turn, then it thins away by dither. Anchored at its centre on the ground.
#
# Generated by gen_vfx.py (edit by hand freely; rerun only to start over).
@anchor 24,14
@point  centre 24,14
@ramp  sig arcane 5 01234
@recolor sig magic
@anim  draw draw-0 draw-1 draw-2 draw-3 draw-4 draw-5 draw-6 draw-7 draw-8 loop=0
# Drawn light (1px lines by design), thinned by ordered dither as it fades.
@lint  skip=pillow,light,stray,orphan,jaggy,doubles,banding emissive=sig
"""
    return head, [('draw-%d' % i, d, rows(g)) for i, (d, g) in enumerate(F)]


def write(name, head, frames):
    out = [head.rstrip('\n'), '']
    for (fname, dur, rs) in frames:
        out.append('@frame %s dur=%d' % (fname, dur))
        out.extend(rs)
        out.append('')
    with open(os.path.join(HERE, name), 'w', newline='\n') as f:
        f.write('\n'.join(out))


if __name__ == '__main__':
    import sys
    MAKE = {'fireball': fireball, 'lightning': lightning, 'smite': smite, 'sigil': sigil}
    for n in sys.argv[1:] or list(MAKE):
        write(n + '.pxa', *MAKE[n]())
        print('wrote %s.pxa' % n)
