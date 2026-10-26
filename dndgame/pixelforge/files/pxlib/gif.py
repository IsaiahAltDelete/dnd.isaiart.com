"""Pure-Python animated GIF89a writer (stdlib only).

Uses the "uncompressed LZW" encoding: every pixel is emitted as a literal code
and the code table is cleared before it could ever outgrow the current code
width. That is fully spec-legal and every decoder handles it, at the cost of
larger files -- irrelevant for sprites, and worth it for being provably correct
rather than depending on which off-by-one an LZW implementation happens to use.
"""

import struct


class _Bits(object):
    """LSB-first bit packer, emitting GIF sub-blocks."""

    def __init__(self):
        self.out = bytearray()
        self.acc = 0
        self.nbits = 0

    def put(self, code, width):
        self.acc |= code << self.nbits
        self.nbits += width
        while self.nbits >= 8:
            self.out.append(self.acc & 0xFF)
            self.acc >>= 8
            self.nbits -= 8

    def finish(self):
        if self.nbits:
            self.out.append(self.acc & 0xFF)
            self.acc = 0
            self.nbits = 0
        return bytes(self.out)


def _sub_blocks(data):
    out = bytearray()
    for i in range(0, len(data), 255):
        part = data[i:i + 255]
        out.append(len(part))
        out += part
    out.append(0)
    return bytes(out)


def _encode_indices(indices, min_code_size):
    clear = 1 << min_code_size
    eoi = clear + 1
    width = min_code_size + 1
    # Decoder adds one table entry per code it reads; clear well before the
    # table would need a wider code.
    budget = (1 << width) - (eoi + 1) - 2
    bits = _Bits()
    bits.put(clear, width)
    since = 0
    for idx in indices:
        if since >= budget:
            bits.put(clear, width)
            since = 0
        bits.put(idx, width)
        since += 1
    bits.put(eoi, width)
    return _sub_blocks(bits.finish())


def _quantize(frames, width, height):
    """frames: list of flat RGBA buffers -> (palette bytes, [index lists], transparent_index)."""
    order = []
    seen = {}
    for buf in frames:
        for i in range(0, len(buf), 4):
            a = buf[i + 3]
            key = (0, 0, 0, 0) if a < 128 else (buf[i], buf[i + 1], buf[i + 2], 255)
            if key not in seen:
                seen[key] = len(order)
                order.append(key)
    # transparency always gets its own slot, index 0
    if (0, 0, 0, 0) in seen:
        order.remove((0, 0, 0, 0))
    order.insert(0, (0, 0, 0, 0))
    seen = dict((c, i) for i, c in enumerate(order))
    if len(order) > 256:
        raise ValueError("GIF supports at most 256 colors, sprite uses %d" % len(order))

    index_frames = []
    for buf in frames:
        idx = bytearray(width * height)
        for p in range(width * height):
            i = p * 4
            a = buf[i + 3]
            key = (0, 0, 0, 0) if a < 128 else (buf[i], buf[i + 1], buf[i + 2], 255)
            idx[p] = seen[key]
        index_frames.append(idx)
    return order, index_frames, 0


def write_gif(path, width, height, frames, delay_cs=10, loop=0):
    """frames: list of flat RGBA buffers, all width*height*4. delay_cs in 1/100 s,
    one number for every frame or a list with one per frame."""
    if not frames:
        raise ValueError("no frames to write")
    colors, index_frames, transparent = _quantize(frames, width, height)

    bits = max(1, (len(colors) - 1).bit_length())
    table_size = 1 << bits
    gct = bytearray()
    for r, g, b, _a in colors:
        gct += bytes((r, g, b))
    gct += bytes(3 * (table_size - len(colors)))
    min_code_size = max(2, bits)

    out = bytearray(b"GIF89a")
    out += struct.pack("<HH", width, height)
    out += bytes((0xF0 | (bits - 1), 0, 0))  # GCT present, depth, no sort
    out += gct
    # NETSCAPE2.0 looping extension
    out += b"\x21\xFF\x0BNETSCAPE2.0\x03\x01" + struct.pack("<H", loop) + b"\x00"

    # one delay for every frame, or a list: per-frame timing from @frame dur=
    delays = list(delay_cs) if isinstance(delay_cs, (list, tuple)) else [delay_cs] * len(frames)
    for idx, d in zip(index_frames, delays):
        delay = max(1, int(d))
        out += b"\x21\xF9\x04\x09" + struct.pack("<H", delay) + bytes((transparent, 0))
        out += b"\x2C" + struct.pack("<HHHH", 0, 0, width, height) + b"\x00"
        out += bytes((min_code_size,))
        out += _encode_indices(idx, min_code_size)
    out += b"\x3B"
    with open(path, "wb") as fh:
        fh.write(bytes(out))
