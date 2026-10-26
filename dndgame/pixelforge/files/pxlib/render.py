"""Rasterizing: plain PNGs, sprite sheets, and the annotated preview.

The preview is the important one -- it renders the sprite big, with a pixel
grid, numbered rulers and a palette legend, so a mistake can be read off the
image as an (x, y) coordinate and fixed with a targeted edit.
"""

from . import font
from .fmt import rasterize

CHECKER_A = (58, 58, 68, 255)
CHECKER_B = (44, 44, 52, 255)
BG = (24, 24, 30, 255)
INK = (232, 232, 240, 255)
DIM = (128, 132, 148, 255)
GRID_MINOR = (255, 255, 255, 40)
GRID_MAJOR = (255, 255, 255, 96)
ACCENT = (120, 190, 255, 255)


class Canvas(object):
    def __init__(self, w, h, bg=(0, 0, 0, 0)):
        self.w = w
        self.h = h
        self.buf = bytearray(bytes(bg) * (w * h))

    def px(self, x, y, c):
        if not (0 <= x < self.w and 0 <= y < self.h):
            return
        i = (y * self.w + x) * 4
        a = c[3]
        if a == 255:
            self.buf[i:i + 4] = bytes(c)
        elif a:
            for k in range(3):
                old = self.buf[i + k]
                self.buf[i + k] = (c[k] * a + old * (255 - a)) // 255
            self.buf[i + 3] = max(self.buf[i + 3], a)

    def frect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.px(xx, yy, c)

    def hline(self, x, y, w, c):
        self.frect(x, y, w, 1, c)

    def vline(self, x, y, h, c):
        self.frect(x, y, 1, h, c)

    def blit_rgba(self, src, sw, sh, x, y, scale=1):
        for sy in range(sh):
            for sx in range(sw):
                i = (sy * sw + sx) * 4
                c = tuple(src[i:i + 4])
                if not c[3]:
                    continue
                self.frect(x + sx * scale, y + sy * scale, scale, scale, c)

    def text(self, x, y, s, c, scale=1, tracking=1):
        cx = x
        for ch in s:
            g = font.glyph(ch)
            for gy in range(font.GLYPH_H):
                bits = g[gy]
                for gx in range(font.GLYPH_W):
                    if bits & (1 << (font.GLYPH_W - 1 - gx)):
                        self.frect(cx + gx * scale, y + gy * scale, scale, scale, c)
            cx += (font.GLYPH_W + tracking) * scale
        return cx


def _checker(canvas, x, y, w, h, cell):
    for yy in range(0, h, cell):
        for xx in range(0, w, cell):
            c = CHECKER_A if ((xx // cell + yy // cell) % 2 == 0) else CHECKER_B
            canvas.frect(x + xx, y + yy,
                         min(cell, w - xx), min(cell, h - yy), c)


def auto_scale(w, h, target=560, lo=1, hi=32):
    return max(lo, min(hi, target // max(1, max(w, h))))


def render_png(sprite, frame_ref=None, scale=8, bg=None, pad=0, colorway=None, overrides=None):
    w, h, buf = rasterize(sprite, frame_ref, bg=bg, colorway=colorway, overrides=overrides)
    out_w, out_h = w * scale + pad * 2, h * scale + pad * 2
    canvas = Canvas(out_w, out_h, bg if bg else (0, 0, 0, 0))
    canvas.blit_rgba(buf, w, h, pad, pad, scale)
    return canvas


def render_sheet(sprite, scale=8, cols=0, gap=0, bg=None, label=False, onion=False,
                 colorway=None, overrides=None):
    n = len(sprite.frames)
    cols = cols if cols > 0 else n
    rows = (n + cols - 1) // cols
    fw, fh = sprite.width, sprite.height
    cw, ch = fw * scale, fh * scale
    lab = (font.text_height(1) + 3) if label else 0
    out = Canvas(cols * cw + gap * (cols - 1),
                 rows * (ch + lab) + gap * (rows - 1),
                 bg if bg else (0, 0, 0, 0))
    for i, frame in enumerate(sprite.frames):
        cx = (i % cols) * (cw + gap)
        cy = (i // cols) * (ch + lab + gap)
        if onion and n > 1:
            prev = sprite.frames[(i - 1) % n]
            _, _, gbuf = rasterize(sprite, prev.name, colorway=colorway, overrides=overrides)
            out.blit_rgba(_ghost(gbuf, GHOST_PREV), fw, fh, cx, cy + lab, scale)
        _, _, buf = rasterize(sprite, frame.name, bg=None if onion else bg,
                              colorway=colorway, overrides=overrides)
        out.blit_rgba(buf, fw, fh, cx, cy + lab, scale)
        if label:
            cap = frame.name[:12].upper()
            if frame.dur:
                cap += " %dMS" % frame.dur
            out.text(cx + 1, cy, cap, DIM, 1)
    return out


def render_frames_rgba(sprite, scale=1, bg=None, colorway=None, overrides=None):
    """-> (w, h, [flat RGBA buffers]) for GIF export."""
    fw, fh = sprite.width, sprite.height
    bufs = []
    for frame in sprite.frames:
        canvas = render_png(sprite, frame.name, scale=scale, bg=bg,
                            colorway=colorway, overrides=overrides)
        bufs.append(canvas.buf)
    return fw * scale, fh * scale, bufs


GHOST_PREV = (255, 90, 80)     # onion skin: the frame before, in red
GHOST_NEXT = (80, 170, 255)    # and the frame after, in blue
ISSUE = (255, 64, 160, 255)


def _ghost(buf, rgb, alpha=96):
    """A frame reduced to a flat translucent silhouette for onion skinning."""
    out = bytearray(len(buf))
    for i in range(0, len(buf), 4):
        if buf[i + 3]:
            lum = (buf[i] * 3 + buf[i + 1] * 6 + buf[i + 2]) // 10
            k = 0.55 + 0.45 * lum / 255.0
            out[i:i + 4] = bytes((int(rgb[0] * k), int(rgb[1] * k), int(rgb[2] * k), alpha))
    return out


def strip_cells(sprite, frame, kind, specs=None):
    """-> [(label, w, h, rgba)] for one of the preview strips below the grid:
    'layers' (each layer alone), 'colorways' (token recolours), 'recolor'
    (every @recolor variant), 'frames' (the whole animation)."""
    cells = []
    if kind == "layers":
        for L in frame.layers or []:
            full = [["."] * frame.width for _ in range(frame.height)]
            for y, row in enumerate(L.rows):
                for x, ch in enumerate(row):
                    if ch != "." and 0 <= x + L.at[0] < frame.width and 0 <= y + L.at[1] < frame.height:
                        full[y + L.at[1]][x + L.at[0]] = ch
            w, h, buf = rasterize(sprite, rows=["".join(r) for r in full])
            cells.append(((L.name or "BASE")[:10], w, h, buf))
    elif kind == "colorways":
        for label, cw in specs or []:
            w, h, buf = rasterize(sprite, frame.name, colorway=cw)
            cells.append((label[:10], w, h, buf))
    elif kind == "recolor":
        w, h, buf = rasterize(sprite, frame.name)
        cells.append(("AUTHORED", w, h, buf))
        for kind_, over in sprite.variants().items():
            w, h, buf = rasterize(sprite, frame.name, overrides=over)
            cells.append((kind_[:10], w, h, buf))
    elif kind == "frames":
        for f in sprite.frames:
            w, h, buf = rasterize(sprite, f.name)
            cells.append((("%s %d" % (f.name, sprite.frame_ms(f)))[:12], w, h, buf))
    return cells


def _draw_strip(c, x, y, title, cells, cs, fs, maxw):
    """Lay cells out left to right (wrapping at maxw); -> height used."""
    c.text(x, y, title.upper(), ACCENT, fs)
    y0 = y + font.GLYPH_H * fs + 6
    lab = font.GLYPH_H + 3
    cx, cy, rowh = x, y0, 0
    for label, w, h, buf in cells:
        cw, ch = w * cs, h * cs
        if cx > x and cx + cw > x + maxw:
            cx, cy = x, cy + rowh + 8
            rowh = 0
        c.text(cx, cy, label.upper(), DIM, 1)
        _checker(c, cx, cy + lab, cw, ch, max(2, cs))
        c.blit_rgba(buf, w, h, cx, cy + lab, cs)
        cx += max(cw, font.text_width(label.upper(), 1)) + 10
        rowh = max(rowh, ch + lab)
    return cy + rowh - y


def render_preview(sprite, frame_ref=None, scale=0, fs=2, onion=False, strips=None,
                   issues=None, colorway=None):
    """Annotated inspection view: rulers, pixel grid, palette legend.

    onion   ghost the previous (red) and next (blue) frames under this one
    strips  [(title, cells)] from strip_cells(), drawn under the grid
    issues  lint findings for this frame, boxed in magenta on the grid
    """
    frame = sprite.frame(frame_ref)
    w, h = frame.width, frame.height
    if scale <= 0:
        scale = max(6, auto_scale(w, h, target=520))

    gw, gh = w * scale, h * scale
    digit_w = font.GLYPH_W * fs
    digit_h = font.GLYPH_H * fs

    head = digit_h + 6                     # title strip
    ruler_t = digit_h * 2 + 5              # x labels, tens over ones
    ruler_l = digit_w * 2 + fs + 6         # y labels, two digits side by side
    pad = 8

    used = sorted(k for k in sprite.used_keys() if k in sprite.palette)
    swatch = digit_h + 2

    from . import palettes as _pal
    from .fmt import color_hex
    notes = dict(sprite.meta.get("notes", {}))
    if sprite.meta.get("use") in _pal.PALETTES:
        for k, v in _pal.get(sprite.meta["use"])["notes"].items():
            notes.setdefault(k, v)
    labels = [(notes.get(k) or color_hex(sprite.palette[k]))[:16].upper()
              for k in used]

    key_col = swatch + 4 + font.text_width("W", fs) + fs * 2
    widest = max([font.text_width(s, fs) for s in labels] or [0])
    legend_w = max(key_col + widest, font.text_width("PALETTE", fs)) + 10
    legend_h = len(used) * (swatch + 3) + digit_h + 6

    cw = pad + ruler_l + gw + 14 + legend_w + pad
    body_h = pad + head + ruler_t + max(gh, legend_h) + pad
    strip_cs = max(2, min(6, scale // 3))
    strip_h = 0
    if strips:
        # measure by drawing into a scratch canvas of the final width
        cw = max(cw, 480)
        probe = Canvas(cw, 1, BG)
        for title_, cells in strips:
            strip_h += _draw_strip(probe, pad, 0, title_, cells, strip_cs, fs, cw - 2 * pad) + 14
    chh = body_h + strip_h
    c = Canvas(cw, chh, BG)

    ox = pad + ruler_l
    oy = pad + head + ruler_t

    title = "%s / %s  %dx%d  scale %d" % (sprite.name, frame.name, w, h, scale)
    if frame.dur:
        title += "  %dms" % frame.dur
    if onion:
        title += "  onion"
    if issues:
        title += "  %d lint" % len(issues)
    c.text(pad, pad, title.upper(), ACCENT, fs)

    # sprite over a transparency checker, onion ghosts beneath it
    _checker(c, ox, oy, gw, gh, max(4, scale // 2))
    if onion and len(sprite.frames) > 1:
        i = sprite.frames.index(frame)
        n = len(sprite.frames)
        for j, rgb in (((i - 1) % n, GHOST_PREV), ((i + 1) % n, GHOST_NEXT)):
            _, _, gbuf = rasterize(sprite, sprite.frames[j].name, colorway=colorway)
            c.blit_rgba(_ghost(gbuf, rgb), w, h, ox, oy, scale)
    _, _, buf = rasterize(sprite, frame.name, colorway=colorway)
    c.blit_rgba(buf, w, h, ox, oy, scale)

    # pixel grid, heavier every 8
    for x in range(w + 1):
        c.vline(ox + x * scale, oy, gh, GRID_MAJOR if x % 8 == 0 else GRID_MINOR)
    for y in range(h + 1):
        c.hline(ox, oy + y * scale, gw, GRID_MAJOR if y % 8 == 0 else GRID_MINOR)

    # rulers -- label every column when there's room, else every 5th
    # every column/row when its label fits the cell, else every 2nd, else every 5th
    step = 1 if scale >= digit_w + 2 else (2 if 2 * scale >= digit_w + 2 else 5)
    ystep = 1 if scale >= digit_h + 1 else (2 if 2 * scale >= digit_h + 1 else 5)
    for x in range(w):
        if x % step:
            continue
        col = ACCENT if x % 8 == 0 else DIM
        lx = ox + x * scale + max(0, (scale - digit_w) // 2)
        ly = pad + head
        if x >= 10:
            c.text(lx, ly, str(x // 10), col, fs)
        c.text(lx, ly + digit_h + 2, str(x % 10), col, fs)
    for y in range(h):
        if y % ystep:
            continue
        col = ACCENT if y % 8 == 0 else DIM
        label = str(y).rjust(2)
        ly = oy + y * scale + max(0, (scale - digit_h) // 2)
        c.text(pad, ly, label, col, fs)

    for it in issues or []:
        if it.x is None:
            continue
        bx, by = ox + it.x * scale, oy + it.y * scale
        for k in range(2):
            c.hline(bx - k, by - k, scale + 2 * k, ISSUE)
            c.hline(bx - k, by + scale - 1 + k, scale + 2 * k, ISSUE)
            c.vline(bx - k, by - k, scale + 2 * k, ISSUE)
            c.vline(bx + scale - 1 + k, by - k, scale + 2 * k, ISSUE)

    sy = body_h
    for title_, cells in strips or []:
        sy += _draw_strip(c, pad, sy, title_, cells, strip_cs, fs, cw - 2 * pad) + 14

    # legend
    lx = ox + gw + 14
    ly = pad + head
    c.text(lx, ly, "PALETTE", ACCENT, fs)
    ly += digit_h + 6
    for k, label in zip(used, labels):
        color = sprite.palette[k]
        if color[3] == 0:
            _checker(c, lx, ly, swatch, swatch, max(2, swatch // 2))
        else:
            c.frect(lx, ly, swatch, swatch, color)
        c.frect(lx, ly, swatch, 1, (255, 255, 255, 60))
        c.text(lx + swatch + 4, ly + 1, k, INK, fs)
        c.text(lx + key_col, ly + 1, label, DIM, fs)
        ly += swatch + 3
    return c
