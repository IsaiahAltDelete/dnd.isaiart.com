"""Reader for the ECS world that Baldur's Gate 3 keeps in a save (Patch 8).

A save's Globals.lsf has a region "NewAge" whose one attribute is a ScratchBuffer: a
binary blob that starts with the magic "LSMF". No public tool reads it, so this is
worked out from the bytes. What is known:

  header   48 bytes: magic, version, hash, and (at 0x10) the offset of the name table.
           Every other offset in the file is relative to byte 48 ("B").
  data     one packed array per type, back to back. Types are components
           ("game.stats.v3.StatsComponent") and the structs they point into
           ("game.spell.v3.SpellData"), plus enum value tables ("...EAbility").
  names    a NUL-separated string table of the type names, then the type table:
           48-byte records {u64 name_off, u32 name_len, u32 0xD3, u64 hash,
           u32 element_size, u32 version, u64 count, u64 data_off}.
  level    type 0 ("core.v0.Level") is {begin, end} of the level's entity GUIDs
           (the first entries of the core.v0.EntityId array: entity i has GUID i)
           and {begin, end} of the component table: for each component type a
           record {begin, end, type_index, count} + padding blocks, where
           [begin, end) is a u32 list giving, for element k of that type, the
           entity that owns it.

Inside elements: pointers are u64 offsets (relative to B); arrays are {begin, end}
pointer pairs; strings are {u64 ptr, u32 len, u32 pad}; enum fields point at an
8-byte slot of the enum's value table; entity references point at a core.v0.EntityId
element (a 16-byte GUID, looked up in the level's entity list); GUIDs are stored
like LSLib's "bswap_guids" (see guid()).
"""
import bisect
import re
import struct

NULL = 0xffffffffffffffff


def guid(raw):
    """16 stored bytes -> the GUID string the game data uses"""
    d1, d2, d3 = struct.unpack_from('<IHH', raw, 0)
    d4 = raw[8:16]
    d4 = bytes([d4[1], d4[0], d4[3], d4[2], d4[5], d4[4], d4[7], d4[6]])
    return '%08x-%04x-%04x-%s-%s' % (d1, d2, d3, d4[:2].hex(), d4[2:].hex())


class LSMF:
    def __init__(self, path_or_bytes):
        self.b = b = path_or_bytes if isinstance(path_or_bytes, (bytes, bytearray)) else open(path_or_bytes, 'rb').read()
        if b[:4] != b'LSMF':
            raise ValueError('not an LSMF blob')
        self.B = 48
        m = re.search(rb'core\.v0\.Level[ -~]+', b)
        self.NB = m.start() - 1
        o = self._find_table(m.end())
        self.types = []
        while o + 48 <= len(b):
            no, nl, kind, h, sz, ver, cnt, doff = struct.unpack_from('<QIIQIIQQ', b, o)
            if kind != 211 or nl > 300:
                break
            self.types.append(dict(i=len(self.types), name=b[self.NB + no:self.NB + no + nl].decode(), size=sz,
                                   ver=ver, count=cnt, off=doff))
            o += 48
        self.by_name = {t['name']: t for t in self.types}
        self.ent_begin, self.ent_end, self.ct_begin, self.ct_end = self.u64s(self.types[0]['off'], 4)
        self.n_ent = (self.ent_end - self.ent_begin) // 16
        self._component_lists()
        self._ranges = sorted((t['off'], t['off'] + t['size'] * t['count'], t) for t in self.types if t['count'])
        self._starts = [r[0] for r in self._ranges]
        self._emap = None

    def _find_table(self, after):
        for i in range(after, after + 64):
            no, nl = struct.unpack_from('<QI', self.b, i)
            if no == 1 and nl == 13 and struct.unpack_from('<I', self.b, i + 12)[0] == 211:
                return i
        raise ValueError('type table not found')

    # ------------------------------------------------------------------ raw access
    def u64s(self, off, n):
        return struct.unpack_from('<%dQ' % n, self.b, self.B + off)

    def u32s(self, off, n):
        return struct.unpack_from('<%dI' % n, self.b, self.B + off)

    def raw(self, off, n):
        return self.b[self.B + off:self.B + off + n]

    def string(self, ptr, n):
        return self.raw(ptr, n).decode('utf-8', 'replace')

    def str16(self, raw, at=0):
        """a {ptr, len} string field inside an element"""
        p, n = struct.unpack_from('<QI', raw, at)
        return self.string(p, n) if 0 < n < 4096 else ''

    def ptrs(self, beg, end):
        """an array of u64 pointers"""
        if beg in (0, NULL) or end <= beg:
            return []
        return list(struct.unpack_from('<%dQ' % ((end - beg) // 8), self.b, self.B + beg))

    def enum(self, ptr):
        return struct.unpack('<Q', self.raw(ptr, 8))[0]

    def which(self, off):
        """(type, element index, offset in element) for a pointer into a type array"""
        i = bisect.bisect_right(self._starts, off) - 1
        if i >= 0:
            s, e, t = self._ranges[i]
            if s <= off < e:
                return t, (off - s) // t['size'], (off - s) % t['size']
        return None, None, None

    # ------------------------------------------------------------------ entities
    def _component_lists(self):
        self.lists = {}
        o = self.ct_begin
        while o < self.ct_end:
            beg, end, ti, cnt = self.u64s(o, 4)
            n = (end - beg) // 4
            assert n == cnt, (o, beg, end, ti, cnt)
            self.lists[ti] = list(self.u32s(beg, n))
            o += 32
            while o < self.ct_end and self.u64s(o, 1)[0] != end:     # padding blocks
                o += 32

    def entity_guid(self, i):
        return guid(self.raw(self.ent_begin + 16 * i, 16))

    def ref(self, ptr):
        """pointer to a core.v0.EntityId element -> entity index (None if empty)"""
        if ptr in (0, NULL):
            return None
        if self._emap is None:
            self._emap = {}
            for i in range(self.n_ent):
                self._emap.setdefault(self.raw(self.ent_begin + 16 * i, 16), i)
        return self._emap.get(self.raw(ptr, 16))

    def owners(self, tname):
        t = self.by_name.get(tname)
        return self.lists.get(t['i'], []) if t else []

    def comp(self, tname, ent):
        """raw bytes of the component `tname` on entity `ent` (None if it has none)"""
        t = self.by_name[tname]
        lst = self.lists.get(t['i'], [])
        try:
            k = lst.index(ent)
        except ValueError:
            return None
        return self.raw(t['off'] + k * t['size'], t['size'])

    def comps(self, ent):
        """every component name on an entity (for exploring)"""
        return [t['name'] for t in self.types if ent in self.lists.get(t['i'], ())]

    def players(self):
        return self.owners('game.v0.PlayerComponent')
