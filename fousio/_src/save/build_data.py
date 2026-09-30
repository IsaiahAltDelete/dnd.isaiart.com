"""Step 2: read the player character out of the unpacked save and write fousio.json.

    python build_data.py [--playtime "290h 22m"] [--difficulty Custom] [--entity N]

Nothing here is specific to Fousio: the player is the entity with a PlayerComponent,
and every other number is followed from there through the save's own references.
"""
import argparse
import collections
import glob
import json
import os
import re
import struct

import paths
from db import DB, clean
from describe import desc, item, passive, spell, prettify, SLOT_NAMES
from lsmf import LSMF, NULL, guid

ABIL = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
SKILL_ENUM = ['Deception', 'Intimidation', 'Performance', 'Persuasion', 'Acrobatics', 'SleightOfHand', 'Stealth',
              'Arcana', 'History', 'Investigation', 'Nature', 'Religion', 'Athletics', 'AnimalHandling', 'Insight',
              'Medicine', 'Perception', 'Survival']
SLOTS = ['Helmet', 'Breast', 'Cloak', 'MeleeMainHand', 'MeleeOffHand', 'RangedMainHand', 'RangedOffHand', 'Ring',
         'Underwear', 'Boots', 'Gloves', 'Amulet', 'Ring2', 'Wings', 'Horns', 'Overhead', 'MusicalInstrument',
         'VanityBody', 'VanityBoots']
SLOT_ORDER = ['MeleeMainHand', 'MeleeOffHand', 'RangedMainHand', 'RangedOffHand', 'Helmet', 'Breast', 'Cloak', 'Gloves',
              'Boots', 'Amulet', 'Ring', 'Ring2', 'Underwear', 'MusicalInstrument', 'VanityBody', 'VanityBoots']
LEVELS = {'EPI_Main_A': 'Epilogue camp', 'END_Main': 'The Netherbrain', 'CTY_Main_A': 'Lower City',
          'BGO_Main_A': "Rivington & Wyrm's Crossing", 'SCL_Main_A': 'Shadow-Cursed Lands', 'WLD_Main_A': 'The Wilderness',
          'CRE_Main_A': 'Crèche Y’llek', 'UND_Main_A': 'The Underdark', 'IRN_Main_A': 'Iron Throne', 'BGH_Main_A': 'Upper City'}
# mods whose content is a personal-use port: their items stay off the public pages
PRIVATE_SOURCES = {'Mystical_Fashions'}
STATUS_SKIP = re.compile(r'^(TE_|EPI_SCRATCH|ECP_|HAS_SHOVEL|CRE_GITH|BLADESONG|TAD_PEACE)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--playtime', default=None, help='as shown on the load screen, e.g. "290h 22m"')
    ap.add_argument('--difficulty', default=None)
    ap.add_argument('--entity', type=int, default=None)
    args = ap.parse_args()

    L = LSMF(os.path.join(paths.SAVE, 'newage.bin'))
    T = L.by_name
    db = DB.load()
    legacy = json.load(open(os.path.join(paths.SAVE, 'legacy.json')))
    info = json.load(open(os.path.join(paths.SAVE, 'saveinfo.json')))
    g2e = {L.entity_guid(i): i for i in range(L.n_ent)}
    E = args.entity if args.entity is not None else L.players()[0]

    def comp(name, ent=E):
        return L.comp(name, ent)

    def uname(g):
        return db.uname(g)

    # ------------------------------------------------------------------ identity and scores
    cc = comp('game.character_creation.v1.CharacterCreationStatsComponent')
    race, subrace = guid(cc[0:16]), guid(cc[16:32])
    name = L.str16(cc, 56)
    base_pts = struct.unpack_from('<7I', L.raw(struct.unpack_from('<Q', cc, 72)[0], 28))
    bg = guid(comp('game.character_creation.v0.BackgroundComponent'))
    cb, ce = struct.unpack_from('<2Q', comp('game.stats.v0.ClassesComponent'))
    classes = []
    for p in range(cb, ce, 40):
        r = L.raw(p, 40)
        classes.append({'class': guid(r[0:16]), 'subclass': guid(r[16:32]), 'level': struct.unpack_from('<I', r, 32)[0]})
    stats = struct.unpack('<9I', comp('game.stats.v3.StatsComponent'))
    abilities = dict(zip(ABIL, stats[2:8]))
    prof = stats[8]
    hp = struct.unpack_from('<2I', comp('game.stats.v0.HealthComponent'))
    level = struct.unpack('<I', comp('game.stats.v0.LevelComponent'))[0]
    xp = struct.unpack_from('<I', comp('game.experience.v0.ExperienceComponent') or b'\0' * 4)[0]
    app = comp('game.character_creation.v3.AppearanceComponent')
    appearance = {'skin': uname(guid(app[32:48])), 'eyes': uname(guid(app[64:80])), 'hair': uname(guid(app[96:112]))}

    # ------------------------------------------------------------------ level-up history
    lb, le = struct.unpack_from('<2Q', comp('game.character_creation.v3.LevelUpComponent'))
    timeline, racial_bonus, asi, skills_chosen = [], [], [], []

    def slots(beg, end, stride, fn):
        return [fn(p) for p in range(beg, end, stride)] if beg != NULL and end > beg else []

    for i, p in enumerate(L.ptrs(lb, le), 1):
        raw = L.raw(p, 96)
        feat = guid(raw[32:48])
        sub = raw[16:32] != b'\0' * 16
        entry = {'level': i, 'class': uname(guid(raw[0:16])), 'subclass': uname(guid(raw[16:32])) if sub else None,
                 'feat_id': feat if feat != '00000000-0000-0000-0000-000000000000' else None,
                 'spells': [], 'passives': [], 'abilities': [], 'skills': []}
        sraw = L.raw(struct.unpack_from('<Q', raw, 72)[0], 112)
        for fi in range(7):
            b, e = struct.unpack_from('<2Q', sraw, fi * 16)
            if b == NULL:
                continue
            for sp in L.ptrs(b, e):
                t, k, r = L.which(sp)
                s = L.raw(sp, t['size'])
                b2, e2 = struct.unpack_from('<2Q', s, 24)
                n = t['name']
                if n.endswith('SpellSelector'):
                    entry['spells'] += slots(b2, e2, 16, lambda q: L.str16(L.raw(q, 16)))
                elif n.endswith('PassiveSelector'):
                    entry['passives'] += slots(b2, e2, 16, lambda q: L.str16(L.raw(q, 16)))
                elif n.endswith('AbilityBonusSelector') or n.endswith('AbilitySelector'):
                    vals = slots(b2, e2, 8, lambda q: ABIL[L.enum(struct.unpack('<Q', L.raw(q, 8))[0]) - 1])
                    (racial_bonus if n.endswith('AbilityBonusSelector') else asi).extend(vals)
                    entry['abilities'] += vals
                elif n.endswith('SkillSelector'):
                    vals = slots(b2, e2, 8, lambda q: SKILL_ENUM[L.enum(struct.unpack('<Q', L.raw(q, 8))[0])])
                    skills_chosen += vals
                    entry['skills'] += vals
        entry['spells'] = [spell(db, s) for s in entry['spells']]
        entry['passives'] = [passive(db, s) or {'id': s, 'name': prettify(s)} for s in entry['passives']]
        feat_rec = db.uuid.get(entry['feat_id']) if entry['feat_id'] else None
        entry['feat'] = None
        entry['feat_desc'] = None
        if feat_rec:
            extra = ''
            if entry['abilities'] and entry['feat_id'] and not entry['passives']:
                extra = ' (' + ', '.join('+%d %s' % (n, a) for a, n in collections.Counter(entry['abilities']).items()) + ')'
            entry['feat'] = (feat_rec.get('display') or feat_rec.get('name')) + extra
            entry['feat_desc'] = feat_rec.get('desc')
        timeline.append(entry)

    # ------------------------------------------------------------------ class/race features from the progression tables
    spell_lists = {}
    for u, rec in db.uuid.items():
        if rec['node'] == 'SpellList':
            m = re.search(r'id="Spells" type="\w+" value="([^"]*)"', rec['body'])
            if m:
                spell_lists[u] = [x for x in m.group(1).split(';') if x]

    def table_of(g):
        rec = db.uuid.get(g)
        m = re.search(r'id="ProgressionTableUUID" type="guid" value="([^"]+)"', rec['body']) if rec else None
        return m.group(1) if m else None

    tables = {}
    for c in classes:
        tables[table_of(c['class'])] = ('class', c['level'])
        if c['subclass'] != '00000000-0000-0000-0000-000000000000':
            tables[table_of(c['subclass'])] = ('class', c['level'])
    tables[table_of(race)] = ('race', level)
    tables[table_of(subrace)] = ('race', level)
    features = {'race': [], 'class': []}
    by_level = collections.defaultdict(list)
    seen = set()
    char_boosts = []                     # (source, boost string) that shape saves and skills
    first_class_table = table_of(classes[0]['class'])
    for u, rec in db.uuid.items():
        if rec['node'] != 'Progression':
            continue
        b = rec['body']
        tu = re.search(r'id="TableUUID" type="guid" value="([^"]+)"', b)
        if not tu or tu.group(1) not in tables or 'id="IsMulticlass" type="bool" value="true"' in b:
            continue
        kind, max_lv = tables[tu.group(1)]
        lv = int(re.search(r'id="Level" type="\w+" value="(\d+)"', b).group(1))
        if lv > max_lv:
            continue
        bo = re.search(r'id="Boosts" type="\w+" value="([^"]*)"', b)
        if bo:
            parts = [x.strip() for x in bo.group(1).split(';') if x.strip()]
            if kind == 'class' and not (tu.group(1) == first_class_table and lv == 1):
                parts = [x for x in parts if 'SavingThrow' not in x]    # saves come from the first class only
            char_boosts.append((kind, ';'.join(parts)))
        pa = re.search(r'id="PassivesAdded" type="\w+" value="([^"]*)"', b)
        names = [x for x in (pa.group(1).split(';') if pa else []) if x and not x.startswith('UnlockedSpellSlot')]
        for x in names:
            e = db.entry(x)
            if e and e.get('Boosts'):
                char_boosts.append((kind, e['Boosts']))
        feats_here = []
        for x in names:
            p = passive(db, x)
            if p and p['name'] and not p['hidden'] and x not in seen:
                seen.add(x)
                feats_here.append({'name': p['name'], 'desc': p['desc']})
        sel = re.search(r'id="Selectors" type="\w+" value="([^"]*)"', b)
        for lst in re.findall(r'AddSpells\(([0-9a-f-]{36})', sel.group(1) if sel else ''):
            for sid in spell_lists.get(lst, []):
                s = spell(db, sid)
                if sid not in seen and not s.get('missing'):
                    seen.add(sid)
                    feats_here.append({'name': s['name'], 'desc': s['desc']})
        features[kind] += feats_here
        if kind == 'class':
            by_level[lv] += [f['name'] for f in feats_here]
    for t in timeline:
        t['features'] = by_level.get(t['level'], [])
        for p in t['passives']:                                    # feat choices, e.g. Resilient: Constitution
            e = db.entry(p.get('id', ''))
            if e and e.get('Boosts'):
                char_boosts.append(('feat', e['Boosts']))
    bgp = re.search(r'id="Passives" type="\w+" value="([^"]*)"', (db.uuid.get(bg) or {}).get('body', ''))
    for x in (bgp.group(1).split(';') if bgp else []):
        e = db.entry(x)
        if e and e.get('Boosts'):
            char_boosts.append(('background', e['Boosts']))

    # ------------------------------------------------------------------ spells
    lsb, lse = struct.unpack_from('<2Q', comp('game.spell.v0.LearnedSpells'))
    learned = []
    for p in range(lsb, lse, 32):                           # SpellsLearnedByClass elements, inline
        r = L.raw(p, 32)
        b, e = struct.unpack_from('<2Q', r, 16)
        learned += [L.str16(L.raw(q, 16)) for q in range(b, e, 16)]
    picked = [s['id'] for t in timeline for s in t['spells']]
    book_ids = list(dict.fromkeys(picked + learned))
    spellbook = [spell(db, s) for s in book_ids]
    book_set = set(book_ids)
    class_names = {uname(c['class']) for c in classes} | {uname(c['subclass']) for c in classes}
    pb, pe = struct.unpack_from('<2Q', comp('game.spell.v0.SpellBookPrepares'))
    prepared = {}
    for q in range(pb, pe, 24):                             # MetaId: {name, SpellSource*}
        raw = L.raw(q, 24)
        sid = L.str16(raw)
        owner = uname(guid(L.raw(struct.unpack_from('<Q', raw, 16)[0], 24)[8:24]))
        if sid in book_set and owner in class_names:
            s = spell(db, sid)
            if s['level']:
                prepared[sid] = s
    prepared = sorted(prepared.values(), key=lambda s: (s['level'], s['name']))
    cantrips = [s for s in spellbook if s['level'] == 0]
    spellbook = [s for s in spellbook if s['level'] != 0]

    # ------------------------------------------------------------------ items
    items = {g2e.get(it['entity']): it for it in legacy['items']}
    ob, oe, primary = struct.unpack_from('<3Q', comp('game.inventory.v0.OwnerComponent'))
    primary = L.ref(primary)
    invs = [L.ref(x) for x in L.ptrs(ob, oe)]
    cct = T['game.inventory.v1.ContainerComponent']

    def inventory(ent):
        raw = L.comp('game.inventory.v1.ContainerComponent', ent)
        if raw is None:
            return []
        a, b, c, d = struct.unpack('<4Q', raw)
        sl = struct.unpack_from('<%dH' % ((b - a) // 2), L.b, L.B + a)
        return [(s, items.get(L.ref(struct.unpack('<Q', L.raw(p, 8))[0]))) for s, p in zip(sl, L.ptrs(c, d))]

    equipment, pack = [], []
    for inv in invs:
        for s, it in inventory(inv):
            if not it:
                continue
            iinfo = item(db, it['stats'], it['template'])
            if inv == primary:
                e = db.entry(it['stats']) or {}
                does_something = iinfo['properties'] or iinfo['passives'] or iinfo['spells'] or iinfo['type'] == 'Weapon'
                private = (iinfo.get('src') or '') in PRIVATE_SOURCES
                if iinfo['type'] in ('Weapon', 'Armor') and iinfo['rarity'] != 'Common' and does_something and not private and \
                        (e.get('Slot') or '') not in ('VanityBody', 'VanityBoots'):
                    pack.append(iinfo)          # magic gear only: cosmetic outfits stay off the sheet
            else:
                iinfo['slot'] = SLOTS[s] if s < len(SLOTS) else str(s)
                iinfo['slot_label'] = SLOT_NAMES.get(iinfo['slot'], iinfo['slot'])
                equipment.append(iinfo)
    equipment.sort(key=lambda i: SLOT_ORDER.index(i['slot']) if i['slot'] in SLOT_ORDER else 99)

    # ------------------------------------------------------------------ boons (statuses that mean something)
    me = next((c for c in legacy['characters'] if g2e.get(c['entity']) == E), {'statuses': []})
    boons = []
    for s in dict.fromkeys(me['statuses']):
        e = db.entry(s)
        nm = db.text(e.get('DisplayName')) if e else None
        if not nm or nm.startswith('%%%') or 'SHOULD NOT SEE' in nm or STATUS_SKIP.match(s) or s == 'ARCANE_WARD':
            continue
        boons.append({'id': s, 'name': nm, 'desc': desc(db, e)})

    # ------------------------------------------------------------------ companions: approval of the player, names from their DisplayName
    def display_name(ent):
        raw = L.comp('game.display_names.v2.Component', ent)
        if raw is None:
            return None
        b, e = struct.unpack_from('<2Q', raw)
        for p in range(b, e, 32):
            for x in struct.unpack('<4Q', L.raw(p, 32)):
                t, k, r = L.which(x)
                if t and t['name'] == 'core.v0.TranslatedString':
                    h = L.str16(L.raw(x, 32))
                    if h and db.text(h):
                        return db.text(h)
        return None

    companions = []
    rt = T['game.approval.v0.Ratings']
    for i, ent in enumerate(L.lists.get(rt['i'], [])):
        q = struct.unpack('<6Q', L.raw(rt['off'] + 48 * i, 48))
        keys = [L.ref(x) for x in L.ptrs(q[0], q[1])]
        vals = struct.unpack_from('<%di' % ((q[3] - q[2]) // 4), L.b, L.B + q[2])
        for kk, v in zip(keys, vals):
            if kk == E:
                nm = display_name(ent) or 'Companion %d' % ent
                nm = re.sub(r'^Nightwarden ', '', nm)
                companions.append({'name': nm, 'approval': v})
    companions.sort(key=lambda c: (-c['approval'], c['name']))

    def single_u32(tname):
        t = T.get(tname)
        return struct.unpack('<I', L.raw(t['off'], 4))[0] if t and t['count'] else None

    save_name = info.get('Save Name', '')
    mq = re.search(r'QuickSave_(\d+)', save_name)
    import datetime
    data = {
        'name': name,
        'race': uname(subrace) or uname(race), 'race_desc': (db.uuid.get(subrace) or {}).get('desc'),
        'class': uname(classes[0]['class']), 'subclass': uname(classes[0]['subclass']),
        'class_desc': (db.uuid.get(classes[0]['subclass']) or {}).get('desc'),
        'classes': [{'class': uname(c['class']), 'subclass': uname(c['subclass']), 'level': c['level']} for c in classes],
        'level': level, 'xp': xp, 'prof': prof,
        'background': uname(bg), 'background_desc': (db.uuid.get(bg) or {}).get('desc'),
        'hp': {'current': hp[0], 'max': hp[1]},
        'abilities': abilities,
        'base_points': dict(zip(ABIL, base_pts[1:7])),
        'racial_bonus': racial_bonus, 'asi': asi, 'skills_chosen': skills_chosen,
        'appearance': appearance,
        'timeline': timeline,
        'cantrips': cantrips, 'prepared': prepared, 'spellbook': spellbook,
        'equipment': equipment, 'pack': pack,
        'boons': boons, 'companions': companions,
        'features': features,
        'char_boosts': char_boosts,
        'feats': [{'level': t['level'], 'name': t['feat'], 'desc': t['feat_desc'], 'choice': [p['name'] for p in t['passives']]}
                  for t in timeline if t['feat']],
        'journey': {
            'days': single_u32('game.calendar.v0.DaysPassedComponent'),
            'supplies': single_u32('game.camp.v0.TotalSuppliesComponent'),
            'playtime': args.playtime,
            'difficulty': args.difficulty,
            'save': save_name.replace('_', ' '),
            'quicksaves': int(mq.group(1)) if mq else None,
            'location': LEVELS.get(info.get('Current Level'), info.get('Current Level')),
            'saved': datetime.datetime.fromtimestamp(info['_mtime']).strftime('%Y-%m-%d'),
        },
    }
    out = paths.work('fousio.json')
    json.dump(data, open(out, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('wrote', out)
    print(' ', name, data['race'], data['subclass'], data['class'], level, 'HP', hp, abilities)
    print('  cantrips', len(cantrips), 'prepared', len(prepared), 'book', len(spellbook),
          'missing', [s['id'] for s in spellbook if s.get('missing')][:10])
    print('  equipment', len(equipment), 'pack', len(pack), 'boons', [b['name'] for b in boons])
    print('  feats', [(f['level'], f['name']) for f in data['feats']])
    print('  features', {k: [f['name'] for f in v] for k, v in features.items()})
    print('  companions', companions)


if __name__ == '__main__':
    main()
