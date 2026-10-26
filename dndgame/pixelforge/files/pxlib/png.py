"""Pure-Python PNG encode/decode (stdlib only: struct + zlib).

Only what a pixel-art pipeline needs:
  write_rgba(path, w, h, buf)  -> non-interlaced 8-bit RGBA
  read_rgba(path)              -> (w, h, bytearray RGBA), handles the common
                                  color types / bit depths produced by editors.
"""

import struct
import zlib

PNG_SIG = b"\x89PNG\r\n\x1a\n"

_CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def _chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_rgba(path, width, height, pixels):
    """pixels: flat RGBA bytes, length width*height*4."""
    if width <= 0 or height <= 0:
        raise ValueError("bad image size %dx%d" % (width, height))
    if len(pixels) != width * height * 4:
        raise ValueError("pixel buffer is %d bytes, expected %d"
                         % (len(pixels), width * height * 4))
    stride = width * 4
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None) -- sprites compress fine as-is
        raw += pixels[y * stride:(y + 1) * stride]
    blob = PNG_SIG
    blob += _chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    blob += _chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    blob += _chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(blob)


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _unfilter(raw, height, stride, fbpp):
    out = bytearray()
    prev = bytearray(stride)
    pos = 0
    for _ in range(height):
        ft = raw[pos]
        pos += 1
        line = bytearray(raw[pos:pos + stride])
        pos += stride
        if ft == 1:
            for i in range(fbpp, stride):
                line[i] = (line[i] + line[i - fbpp]) & 0xFF
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ft == 3:
            for i in range(stride):
                left = line[i - fbpp] if i >= fbpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ft == 4:
            for i in range(stride):
                left = line[i - fbpp] if i >= fbpp else 0
                ul = prev[i - fbpp] if i >= fbpp else 0
                line[i] = (line[i] + _paeth(left, prev[i], ul)) & 0xFF
        elif ft != 0:
            raise ValueError("unknown PNG filter type %d" % ft)
        out += line
        prev = line
    return out


def _samples(line, width, channels, depth):
    """Extract per-pixel sample tuples from one unfiltered scanline."""
    if depth == 8:
        return [tuple(line[i * channels:(i + 1) * channels]) for i in range(width)]
    if depth == 16:
        return [tuple(line[(i * channels + c) * 2] for c in range(channels))
                for i in range(width)]
    # sub-byte depths (1/2/4) -- palette or grayscale only
    mask = (1 << depth) - 1
    per_byte = 8 // depth
    vals = []
    for i in range(width * channels):
        byte = line[i // per_byte]
        shift = 8 - depth * ((i % per_byte) + 1)
        vals.append((byte >> shift) & mask)
    return [tuple(vals[i * channels:(i + 1) * channels]) for i in range(width)]


def read_rgba(path):
    """-> (width, height, bytearray RGBA)."""
    with open(path, "rb") as fh:
        blob = fh.read()
    if blob[:8] != PNG_SIG:
        raise ValueError("not a PNG file: %s" % path)
    pos, ihdr, plte, trns, idat = 8, None, b"", None, bytearray()
    while pos + 8 <= len(blob):
        ln = struct.unpack(">I", blob[pos:pos + 4])[0]
        tag = blob[pos + 4:pos + 8]
        body = blob[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if tag == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif tag == b"PLTE":
            plte = body
        elif tag == b"tRNS":
            trns = body
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break
    if ihdr is None:
        raise ValueError("PNG has no IHDR: %s" % path)
    w, h, depth, ctype, _comp, _filt, interlace = ihdr
    if interlace:
        raise ValueError("interlaced PNGs are not supported (%s)" % path)
    if ctype not in _CHANNELS:
        raise ValueError("unsupported PNG color type %d" % ctype)
    channels = _CHANNELS[ctype]
    stride = (w * channels * depth + 7) // 8
    fbpp = max(1, (channels * depth) // 8)
    raw = _unfilter(zlib.decompress(bytes(idat)), h, stride, fbpp)

    maxv = (1 << depth) - 1
    out = bytearray(w * h * 4)
    for y in range(h):
        line = raw[y * stride:(y + 1) * stride]
        for x, s in enumerate(_samples(line, w, channels, depth)):
            if ctype == 3:
                idx = s[0]
                r, g, b = plte[idx * 3:idx * 3 + 3]
                a = trns[idx] if (trns and idx < len(trns)) else 255
            elif ctype in (0, 4):
                v = s[0] if depth in (8, 16) else s[0] * 255 // maxv
                r = g = b = v
                a = s[1] if ctype == 4 else 255
            else:
                r, g, b = s[0], s[1], s[2]
                a = s[3] if ctype == 6 else 255
            i = (y * w + x) * 4
            out[i:i + 4] = bytes((r, g, b, a))
    return w, h, out
