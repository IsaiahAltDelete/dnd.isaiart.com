"""Stats + localisation + root templates + UUID tables over vanilla BG3 and the installed mods.

Load order follows the game: Shared, SharedDev, Gustav, GustavDev, GustavX, then every mod
(alphabetical, Fousio's Tome of Items last), so later definitions win. Mods that redefine
an entry with `using` its own name inherit from the earlier definition, as in game.
Built once into db.pkl in the work folder; delete that file to rebuild.
"""
import glob
import html
import os
import pickle
import re

import paths

PICKLE = paths.work('db.pkl')
LAYERS = ['Shared', 'SharedDev', 'Gustav', 'GustavDev', 'GustavX']
LAST_MOD = 'FousiosTomeOfItems'


def parse_stats_file(path, into, src):
    cur = None
    for line in open(path, encoding='utf-8-sig', errors='replace').read().splitlines():
        line = line.strip()
        if line.startswith('new entry '):
            name = line[len('new entry '):].strip().strip('"')
            cur = {'type': None, 'using': None, 'data': {}, 'src': src, 'name': name, 'prev': into.get(name)}
            into[name] = cur
        elif cur is None:
            continue
        elif line.startswith('type '):
            cur['type'] = line[5:].strip().strip('"')
        elif line.startswith('using '):
            cur['using'] = line[6:].strip().strip('"')
        elif line.startswith('data '):
            m = re.match(r'data\s+"([^"]+)"\s+"(.*)"\s*$', line)
            if m:
                cur['data'][m.group(1)] = m.group(2)


def parse_loca(path, into):
    t = open(path, encoding='utf-8-sig', errors='replace').read()
    for m in re.finditer(r'<content contentuid="([^"]+)"[^>]*>(.*?)</content>', t, re.S):
        into[m.group(1)] = m.group(2)


def parse_rt(path, into, src):
    t = open(path, encoding='utf-8-sig', errors='replace').read()
    for chunk in t.split('<node id="GameObjects">')[1:]:
        head = chunk[:20000]
        mk = re.search(r'id="MapKey" type="(?:FixedString|guid)" value="([^"]+)"', head)
        if not mk:
            continue

        def attr(name, h=head):
            m = re.search(r'<attribute id="%s" type="[^"]+" (?:value|handle)="([^"]*)"' % name, h)
            return m.group(1) if m else None
        into[mk.group(1)] = {'Name': attr('Name'), 'Stats': attr('Stats'), 'Type': attr('Type'),
                             'Parent': attr('ParentTemplateId'), 'Icon': attr('Icon'),
                             'DisplayName': attr('DisplayName'), 'Description': attr('Description'),
                             'TechnicalDescription': attr('TechnicalDescription'), 'src': src}


def parse_uuid_tables(path, into, loca):
    """UUID -> {node, name, display, desc} for Races, ClassDescriptions, Backgrounds, Feats, CC presets..."""
    s = open(path, encoding='utf-8-sig', errors='replace').read()
    for nm in re.finditer(r'<node id="([^"]+)">(.*?)(?=<node id=|</children>|</node>)', s, re.S):
        body = nm.group(2)
        u = re.search(r'id="(?:UUID|ID|FeatId|ResourceUUID|MapKey)" type="(?:guid|FixedString|LSString)" value="([0-9a-f-]{36})"', body)
        if not u:
            continue
        name = re.search(r'id="Name" type="\w+" value="([^"]*)"', body)
        dn = re.search(r'id="DisplayName" type="TranslatedString" handle="([^"]+)"', body)
        de = re.search(r'id="Description" type="TranslatedString" handle="([^"]+)"', body)
        rec = {'node': nm.group(1), 'name': name.group(1) if name else None,
               'display': clean(loca[dn.group(1)]) if dn and dn.group(1) in loca else None,
               'desc': clean(loca[de.group(1)]) if de and de.group(1) in loca else None, 'body': body}
        def put(key, r):
            old = into.get(key)                   # later layers override, but never blank out a name
            if old:
                r = {k: (r.get(k) if r.get(k) is not None else old.get(k)) for k in set(old) | set(r)}
            into[key] = r
        put(u.group(1), rec)
        fid = re.search(r'id="FeatId" type="guid" value="([0-9a-f-]{36})"', body)
        if fid:                                   # FeatDescriptions are keyed by their feat
            put(fid.group(1), dict(rec, node='FeatDescription'))


class DB:
    def __init__(self):
        self.stats, self.loca, self.rt, self.uuid = {}, {}, {}, {}

    @classmethod
    def build(cls):
        db = cls()
        V = paths.VANILLA
        for layer in LAYERS:
            for f in sorted(glob.glob(os.path.join(V, '*', 'Public', layer, 'Stats', 'Generated', 'Data', '*.txt'))):
                parse_stats_file(f, db.stats, 'vanilla')
        parse_loca(os.path.join(V, 'loca', 'english.xml'), db.loca)
        for layer in LAYERS:
            for f in glob.glob(os.path.join(V, '*', 'Public', layer, 'RootTemplates', '_merged.lsx')):
                parse_rt(f, db.rt, 'vanilla')
        mods = sorted(os.listdir(paths.MODS)) if os.path.isdir(paths.MODS) else []
        mods = [m for m in mods if m != LAST_MOD] + ([LAST_MOD] if LAST_MOD in mods else [])
        for m in mods:
            base = os.path.join(paths.MODS, m)
            for f in sorted(glob.glob(os.path.join(base, '**', 'Stats', 'Generated', 'Data', '*.txt'), recursive=True)):
                parse_stats_file(f, db.stats, m)
            for f in sorted(glob.glob(os.path.join(base, '**', 'Localization', '**', '*.xml'), recursive=True)):
                if os.sep + 'english' + os.sep in f.lower():
                    parse_loca(f, db.loca)
            for f in sorted(glob.glob(os.path.join(base, '**', 'RootTemplates', '*.lsx'), recursive=True)):
                parse_rt(f, db.rt, m)
        tables = []
        for layer in LAYERS:
            tables += sorted(f for f in glob.glob(os.path.join(V, '*', 'Public', layer, '**', '*.lsx'), recursive=True)
                             if os.sep + 'RootTemplates' + os.sep not in f)
        tables += sorted(glob.glob(os.path.join(paths.MODS, '**', 'Feats', '*.lsx'), recursive=True))
        for f in tables:
            parse_uuid_tables(f, db.uuid, db.loca)
        pickle.dump(db.__dict__, open(PICKLE, 'wb'))
        return db

    @classmethod
    def load(cls):
        if not os.path.exists(PICKLE):
            return cls.build()
        db = cls()
        db.__dict__.update(pickle.load(open(PICKLE, 'rb')))
        return db

    def entry(self, name):
        """fully resolved stats entry (using chain applied), or None"""
        e = self.stats.get(name)
        if e is None:
            return None
        chain, seen = [], set()
        while e is not None and id(e) not in seen:
            seen.add(id(e))
            chain.append(e)
            if not e['using']:
                e = None
            elif e['using'] == e.get('name'):
                e = e.get('prev')
            else:
                e = self.stats.get(e['using'])
        out = {}
        for c in reversed(chain):
            out.update(c['data'])
        out.update({'_type': chain[0]['type'], '_src': chain[0]['src'], '_name': name, '_using': chain[0]['using']})
        return out

    def text(self, handle, raw=False):
        if not handle:
            return None
        t = self.loca.get(handle.split(';')[0])
        if t is None:
            return None
        return t if raw else clean(t)

    def tpl(self, key):
        """root template with DisplayName/Description/Icon/Stats inherited from its parents"""
        t = self.rt.get(key)
        if t is None:
            return None
        out, p, depth = dict(t), t.get('Parent'), 0
        while p and depth < 12:
            pt = self.rt.get(p)
            if pt is None:
                break
            for k in ('DisplayName', 'Description', 'Icon', 'Stats', 'TechnicalDescription'):
                if not out.get(k) and pt.get(k):
                    out[k] = pt[k]
            p, depth = pt.get('Parent'), depth + 1
        return out

    def uname(self, g):
        """display name (or internal name) of a race/class/background/feat/preset UUID"""
        v = self.uuid.get(g)
        return (v['display'] or v['name']) if v else None


def clean(t):
    """loca text -> plain text with line breaks; LSTags keep their inner text"""
    t = html.unescape(t)
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = re.sub(r'<LSTag[^>]*>(.*?)</LSTag>', r'\1', t, flags=re.S)
    t = re.sub(r'<[^>]+>', '', t)
    return t.strip()


if __name__ == '__main__':
    db = DB.build()
    print(len(db.stats), 'stats', len(db.loca), 'loca lines', len(db.rt), 'templates', len(db.uuid), 'uuids')
