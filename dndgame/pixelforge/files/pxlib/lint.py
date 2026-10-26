"""Pixel-art lint: the faults an art director circles, reported as cells.

Every finding names a frame and an (x, y), so it maps straight back to the cell
to fix -- the same loop as `preview`. The checks are heuristics tuned to be
quiet on clean art rather than exhaustive; a file can switch any of them off
with `@lint skip=code,code` (an emissive flame is *meant* to be brightest in
the middle, so `pillow` and `light` mean nothing there).

  stray    an opaque pixel with nothing around it: dust, or a spark that
           belongs in an FX sprite
  orphan   a lone pixel so close in value to its neighbours it reads as noise
  doubles  an L-shaped corner in a 1px outline (the "pixel-perfect" rule)
  jaggy    a silhouette edge whose stair steps go 1,3,1 instead of changing
           smoothly
  banding  ramp steps running in 1px parallel stripes, so the gradient shows
           its seams
  pillow   a form darkened toward every edge alike, lit from nowhere
  light    a form lit from the lower right; this world is lit from the upper left
           (neither applies to ramps named in `@lint emissive=RAMP,RAMP`)
  colors   more distinct colours than the sprite can justify
  dupes    two keys whose colours are nearly the same (one of them is noise)
  ramp     neighbouring ramp steps too close in value to read as two tones
"""

from collections import OrderedDict

from . import color as colors
from . import ops
from .fmt import color_hex

CODES = ("stray", "orphan", "doubles", "jaggy", "banding", "pillow", "light",
         "colors", "dupes", "ramp")

_N4 = ((0, -1), (-1, 0), (1, 0), (0, 1))
_N8 = _N4 + ((-1, -1), (1, -1), (-1, 1), (1, 1))


class Issue(object):
    def __init__(self, code, frame, x, y, msg):
        self.code, self.frame, self.x, self.y, self.msg = code, frame, x, y, msg

    def __str__(self):
        where = "" if self.x is None else " x=%d y=%d" % (self.x, self.y)
        f = "" if self.frame is None else " frame %s" % self.frame
        return "[%s]%s%s: %s" % (self.code, f, where, self.msg)


def _grid(frame):
    return [list(r) for r in frame.rows]


def _at(g, x, y):
    if 0 <= y < len(g) and 0 <= x < len(g[y]):
        return g[y][x]
    return None


def _opaque(ch, lut):
    return ch is not None and ch != "." and lut.get(ch, (0, 0, 0, 0))[3] > 0


def outline_keys(sprite, lut):
    """Keys that mostly sit on the silhouette: what the doubles check runs on."""
    if sprite.lint.get("outline"):
        return set(sprite.lint["outline"])
    edge, total = {}, {}
    for f in sprite.frames:
        g = _grid(f)
        for y, row in enumerate(g):
            for x, ch in enumerate(row):
                if not _opaque(ch, lut):
                    continue
                total[ch] = total.get(ch, 0) + 1
                if any(not _opaque(_at(g, x + dx, y + dy), lut) for dx, dy in _N4):
                    edge[ch] = edge.get(ch, 0) + 1
    out = set()
    for k, n in total.items():
        if n >= 6 and edge.get(k, 0) >= 0.6 * n:
            out.add(k)
    return out


def _stray_orphan(f, g, lut, out):
    for y, row in enumerate(g):
        for x, ch in enumerate(row):
            if not _opaque(ch, lut):
                continue
            nb = [_at(g, x + dx, y + dy) for dx, dy in _N8]
            if not any(_opaque(c, lut) for c in nb):
                out.append(Issue("stray", f.name, x, y, "lone %r pixel with nothing around it" % ch))
                continue
            if any(c == ch for c in nb):
                continue
            # A speck in a flat field: its 4-neighbours are (nearly) one key and
            # it is barely lighter or darker than that key. A lone pixel between
            # a dark and a light neighbour is a transition, not noise; a lone
            # pixel with real contrast is a deliberate highlight, rivet or eye.
            four = [c for c in (_at(g, x + dx, y + dy) for dx, dy in _N4) if _opaque(c, lut)]
            if len(four) < 3:
                continue
            common = max(set(four), key=four.count)
            if four.count(common) < 3:
                continue
            if abs(colors.luma(lut[ch]) - colors.luma(lut[common])) < 0.06:
                out.append(Issue("orphan", f.name, x, y,
                                 "lone %r pixel in a field of %r, too close in value to read "
                                 "(noise)" % (ch, common)))


def _doubles(f, keys, out):
    for key in sorted(keys):
        for x, y in ops.l_corners(f, key):
            out.append(Issue("doubles", f.name, x, y,
                             "L-corner in the %r line; drop it for a clean diagonal "
                             "(edit --perfect %s)" % (key, key)))


def _segments(prof):
    """Split an edge profile into monotone stretches with steps of at most 1."""
    segs, seg, direction = [], [], 0
    for pos, v in prof:
        if seg:
            ppos, pv = seg[-1]
            d = v - pv
            if pos != ppos + 1 or abs(d) > 1:
                segs.append(seg)
                seg, direction = [], 0
            elif d and direction and d != direction:
                segs.append(seg)
                seg, direction = [seg[-1]], d      # a turn: the corner starts the next one
            elif d:
                direction = d
        seg.append((pos, v))
    if seg:
        segs.append(seg)
    return segs


def _profile_jags(prof):
    """prof: [(pos, value)] along an edge -> positions whose stair run breaks the
    smooth progression (1,3,1 / 3,1,3 / 1,1,4,1). Runs that alternate by one
    (1,2,1,2) are a clean line of that slope and pass."""
    bad = []
    for seg in _segments(prof):
        if len(seg) < 4:
            continue
        runs, start = [], 0
        for i in range(1, len(seg)):
            if seg[i][1] != seg[i - 1][1]:
                runs.append((start, i - start))
                start = i
        runs.append((start, len(seg) - start))
        inner = runs[1:-1]            # the first and last runs are cut by the segment ends
        for j in range(1, len(inner) - 1):
            a, b, c = inner[j - 1][1], inner[j][1], inner[j + 1][1]
            peak = (b > a and b > c) or (b < a and b < c)
            if peak and max(abs(b - a), abs(b - c)) >= 2:
                s, n = inner[j]
                bad.append(seg[s + n // 2][0])
    return bad


def _jaggy(f, g, lut, out):
    h = len(g)
    w = len(g[0]) if g else 0
    rows = [[x for x in range(w) if _opaque(g[y][x], lut)] for y in range(h)]
    cols = [[y for y in range(h) if _opaque(g[y][x], lut)] for x in range(w)]
    seen = set()
    for side, prof, mk in (
            ("left", [(y, r[0]) for y, r in enumerate(rows) if r], lambda p, v: (v, p)),
            ("right", [(y, r[-1]) for y, r in enumerate(rows) if r], lambda p, v: (v, p)),
            ("top", [(x, c[0]) for x, c in enumerate(cols) if c], lambda p, v: (p, v)),
            ("bottom", [(x, c[-1]) for x, c in enumerate(cols) if c], lambda p, v: (p, v))):
        vals = dict(prof)
        for pos in _profile_jags(prof):
            x, y = mk(pos, vals[pos])
            if (x, y) in seen:
                continue
            seen.add((x, y))
            out.append(Issue("jaggy", f.name, x, y,
                             "uneven stair step on the %s edge; even out the run lengths" % side))


def _banding(f, g, sprite, out):
    idx = {}
    for r in sprite.ramps.values():
        for i, k in enumerate(r.keys):
            idx[k] = (r.name, i)
    if not idx:
        return
    marks = {}
    for y, row in enumerate(g):
        for x, ch in enumerate(row):
            if ch not in idx:
                continue
            name, i0 = idx[ch]
            for d in ((1, 0), (0, 1), (1, 1), (1, -1)):
                c1 = idx.get(_at(g, x + d[0], y + d[1]))
                c2 = idx.get(_at(g, x + 2 * d[0], y + 2 * d[1]))
                if not c1 or not c2 or c1[0] != name or c2[0] != name:
                    continue
                s = c1[1] - i0
                if s in (1, -1) and c2[1] - c1[1] == s:
                    marks.setdefault(d, set()).add((x, y))
    for d, cells in marks.items():
        px, py = -d[1], d[0]          # perpendicular: where a parallel stripe sits
        done = set()
        for (x, y) in sorted(cells, key=lambda c: (c[1], c[0])):
            if (x, y) in done:
                continue
            chain, cx, cy = [(x, y)], x, y
            while True:
                nxt = [(cx + px + k * d[0], cy + py + k * d[1]) for k in (0, -1, 1)]
                nxt = [c for c in nxt if c in cells and c not in done]
                if not nxt:
                    break
                cx, cy = nxt[0]
                chain.append((cx, cy))
            done.update(chain)
            if len(chain) >= 3:
                out.append(Issue("banding", f.name, x, y,
                                 "ramp %s steps run as 1px parallel stripes for %d lines; "
                                 "vary the band widths or merge a step" % (idx[g[y][x]][0], len(chain))))


def _forms(f, g, sprite, out):
    # A light source is brightest in its middle by nature: `@lint emissive=fire`
    # keeps flames, coals and spell glows out of the pillow/light checks.
    glow = set(sprite.lint.get("emissive", "").split(","))
    idx = {}
    for r in sprite.ramps.values():
        if r.name in glow:
            continue
        for i, k in enumerate(r.keys):
            idx[k] = (r.name, i)
    if not idx:
        return
    lx, ly = -1, -1                   # toward the light: upper left
    seen = set()
    for y0, row in enumerate(g):
        for x0, ch in enumerate(row):
            if ch not in idx or (x0, y0) in seen:
                continue
            name = idx[ch][0]
            comp, stack = [], [(x0, y0)]
            seen.add((x0, y0))
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for dx, dy in _N4:
                    c = (x + dx, y + dy)
                    k = _at(g, *c)
                    if c not in seen and k in idx and idx[k][0] == name:
                        seen.add(c)
                        stack.append(c)
            if len(comp) < 16:
                continue
            cs = set(comp)
            lit, shade, inner = [], [], []
            for x, y in comp:
                i = idx[g[y][x]][1]
                outward = [(dx, dy) for dx, dy in _N4 if (x + dx, y + dy) not in cs]
                if not outward:
                    inner.append(i)
                    continue
                facing = sum(dx * lx + dy * ly for dx, dy in outward)
                if facing > 0:
                    lit.append(i)
                elif facing < 0:
                    shade.append(i)
            if len(lit) < 3 or len(shade) < 3 or len(inner) < 3:
                continue
            ml, ms, mi = (sum(v) / float(len(v)) for v in (lit, shade, inner))
            x, y = min(comp, key=lambda c: (c[1], c[0]))
            if abs(ml - ms) < 0.35 and mi - max(ml, ms) > 0.6:
                out.append(Issue("pillow", f.name, x, y,
                                 "%s form darkens toward every edge alike (edges %.1f/%.1f, "
                                 "middle %.1f); push the light to the upper left" % (name, ml, ms, mi)))
            elif ms - ml > 0.6:
                out.append(Issue("light", f.name, x, y,
                                 "%s form is lit from the lower right (upper-left edge %.1f, "
                                 "lower-right %.1f)" % (name, ml, ms)))


def _palette_checks(sprite, lut, max_colors, out):
    used = [k for k in sprite.palette if k in sprite.used_keys() and _opaque(k, lut)]
    distinct = OrderedDict()
    for k in used:
        distinct.setdefault(lut[k], []).append(k)
    limit = max_colors or int(sprite.lint.get("colors") or 20)
    if len(distinct) > limit:
        out.append(Issue("colors", None, None, None,
                         "%d distinct colours (limit %d); merge near-duplicates or drop a "
                         "ramp step" % (len(distinct), limit)))
    cols = list(distinct.items())
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            a, b = cols[i][0], cols[j][0]
            d = sum((a[c] - b[c]) ** 2 for c in range(3)) ** 0.5
            if d < 10 and a[3] == b[3]:
                out.append(Issue("dupes", None, None, None,
                                 "keys %s (%s) and %s (%s) are nearly the same colour"
                                 % ("".join(cols[i][1]), color_hex(a), "".join(cols[j][1]),
                                    color_hex(b))))
    for r in sprite.ramps.values():
        for i in range(len(r.keys) - 1):
            a, b = lut.get(r.keys[i]), lut.get(r.keys[i + 1])
            if a and b and abs(colors.luma(a) - colors.luma(b)) < 0.035:
                out.append(Issue("ramp", None, None, None,
                                 "ramp %s steps %d and %d (%s, %s) are too close in value to "
                                 "read as two tones" % (r.name, i, i + 1, r.keys[i], r.keys[i + 1])))


def lint(sprite, skip=(), max_colors=None):
    """-> [Issue] for every check not skipped (by argument or @lint skip=)."""
    skip = set(skip) | sprite.lint_skip()
    lut = sprite.colors_for()
    out = []
    keys = outline_keys(sprite, lut) if "doubles" not in skip else set()
    for f in sprite.frames:
        g = _grid(f)
        found = []
        if not ({"stray", "orphan"} <= skip):
            _stray_orphan(f, g, lut, found)
        if keys:
            _doubles(f, keys, found)
        if "jaggy" not in skip:
            _jaggy(f, g, lut, found)
        if "banding" not in skip:
            _banding(f, g, sprite, found)
        if not ({"pillow", "light"} <= skip):
            _forms(f, g, sprite, found)
        out.extend(i for i in found if i.code not in skip)
    tail = []
    _palette_checks(sprite, lut, max_colors, tail)
    out.extend(i for i in tail if i.code not in skip)
    return out
