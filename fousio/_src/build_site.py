"""Build the /fousio pages from the data read out of Fousio's final save.

    python fousio/_src/build_site.py

Inputs (all in this folder):
    data/fousio.json      the character, read from QuickSave 583 (see README.md)
    data/artifacts.json   the Staff of the Fixed Star and the Circlet of Nous
    ../assets/models/circlets.json   which GLB each circlet look uses (if present)

Outputs: fousio/index.html, fousio/staff/, fousio/circlet/, fousio/items/<slug>/.
Folders starting with "_" are not published by GitHub Pages, so this script and its
data stay out of the site.
"""
import html
import json
import os
import re
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # .../fousio
SITE = 'https://dnd.isaiart.com'
D = json.load(open(os.path.join(HERE, 'data', 'fousio.json'), encoding='utf-8'))
A = json.load(open(os.path.join(HERE, 'data', 'artifacts.json'), encoding='utf-8'))
CIRCLETS_JSON = os.path.join(ROOT, 'assets', 'models', 'circlets.json')
ICONS_JSON = os.path.join(HERE, 'data', 'icons.json')
ICONS = json.load(open(ICONS_JSON, encoding='utf-8')) if os.path.exists(ICONS_JSON) else {}


def icon_src(it):
    f = ICONS.get(it['id'])
    return '/fousio/assets/img/items/%s' % f if f else None
V = '8'                                             # asset version, bump to bust caches
_J = D.get('journey', {})
_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
_saved = _J.get('saved') or ''
_saved_txt = ('%d %s %s' % (int(_saved[8:10]), _MONTHS[int(_saved[5:7]) - 1], _saved[:4])) if len(_saved) == 10 else _saved
PLAYTIME = (_J.get('playtime') or '').replace('h ', ' h ').replace('m', ' m').strip()
GALE = any(b_['id'] == 'EPI_GALEGOD_BUFF' for b_ in D.get('boons', []))
GALE_LEDE = 'a friend who became the God of Ambition' if GALE else ''


def and_list(xs):
    xs = [x for x in xs if x]
    return xs[0] if len(xs) == 1 else ', '.join(xs[:-1]) + ' and ' + xs[-1]
PROVENANCE = ', '.join(x for x in (_J.get('save'), _saved_txt, (_J.get('playtime') or '').replace('h ', ' h ').replace('m', ' m').strip()) if x)


def esc(s):
    return html.escape(str(s if s is not None else ''), quote=True)


def slug(s):
    s = re.sub(r"['’]", '', s.lower())
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def signed(n):
    return ('+%d' % n) if n >= 0 else ('−%d' % abs(n))


def para(text):
    return ''.join('<p>%s</p>' % esc(p) for p in (text or '').split('\n') if p.strip())


RARITY_CLASS = {'Common': 'r-Common', 'Uncommon': 'r-Uncommon', 'Rare': 'r-Rare', 'Very Rare': 'r-VeryRare', 'Legendary': 'r-Legendary'}
SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation']
ORD = {1: '1st', 2: '2nd', 3: '3rd'}


def lvl_label(n):
    return 'Cantrip' if n == 0 else '%s level' % ORD.get(n, '%dth' % n)


# ------------------------------------------------------------------ glyphs (24px line icons, own drawings)
G = {
    'staff': '<path d="M12 22V9"/><path d="M12 2.5l1.3 2.7 3 .4-2.2 2 .6 2.9L12 9l-2.7 1.5.6-2.9-2.2-2 3-.4z"/>',
    'shield': '<path d="M12 3l7 2.8V11c0 4.8-3 8.3-7 10-4-1.7-7-5.2-7-10V5.8z"/><path d="M12 7.5v9M8.5 11h7"/>',
    'crossbow': '<path d="M3.5 8.5C7 10 17 10 20.5 8.5"/><path d="M3.5 8.5L12 12l8.5-3.5"/><path d="M12 4v17"/><path d="M9.5 19h5"/>',
    'hood': '<path d="M5 20.5C5 11 8 4.5 12 4.5S19 11 19 20.5"/><path d="M8.6 20.5c0-5 1.4-8.3 3.4-8.3s3.4 3.3 3.4 8.3"/>',
    'hat': '<path d="M3 18c3.5 1.6 14.5 1.6 18 0"/><path d="M7 17.4L11.4 4.2c.2-.6 1-.6 1.2 0L17 17.4"/><path d="M9.2 12.2c1.8.6 3.8.6 5.6 0"/>',
    'robe': '<path d="M9 3h6l1.2 3.2L20 8.3l-2 4-2.2-1.1V21H8.2V11.2L6 12.3l-2-4 3.8-2.1z"/><path d="M12 6v15"/>',
    'cloak': '<path d="M8.5 3.5h7l-1 3c3 3 5 8.5 5 14.5h-15c0-6 2-11.5 5-14.5z"/><path d="M12 6.5V21"/>',
    'gloves': '<path d="M8 21v-4.5L6 13V7.2a1 1 0 0 1 2 0V11V5.2a1 1 0 0 1 2 0V11V4.2a1 1 0 0 1 2 0V11V5.2a1 1 0 0 1 2 0V13l1.8-1.8a1.1 1.1 0 0 1 1.6 1.5L15 16.5V21z"/>',
    'boots': '<path d="M8 3.5h6v9.5l5 3v4H6v-4.2l2-2z"/><path d="M6 17h13"/>',
    'amulet': '<path d="M6 3c0 5 2.7 8 6 8s6-3 6-8"/><path d="M12 11v2"/><path d="M12 13l3 3.6-3 4.4-3-4.4z"/>',
    'ring': '<circle cx="12" cy="14.5" r="6"/><path d="M9.6 6.8L12 4.2l2.4 2.6L12 9.2z"/>',
    'underwear': '<path d="M3.5 7.5h17l-1 4.6c-3 .2-5.4 2.2-6.4 5.9h-2.2c-1-3.7-3.4-5.7-6.4-5.9z"/>',
    'fork': '<path d="M9 3v7a3 3 0 0 0 6 0V3"/><path d="M12 13v8"/><path d="M10 21h4"/>',
    'circlet': '<ellipse cx="12" cy="12.5" rx="9" ry="3.8"/><path d="M12 6.8l1.2 1.9-1.2 1.9-1.2-1.9z"/>',
    'shoes': '<path d="M3.5 15.5c3 0 5-1.5 6-4l6.5 2c2.5.8 4.5 1.8 4.5 4v1h-17z"/>',
    'mantle': '<path d="M4 9c3-4 13-4 16 0l-2 11H6z"/><path d="M8.5 8.2c1 2 5.5 2 7 0"/>',
    'shell': '<path d="M4 16c0-6 3.5-11 8-11s8 5 8 11z"/><path d="M12 5v11M8 6.5l1.5 9.5M16 6.5L14.5 16"/><path d="M3 16h18"/>',
}


def glyph_for(it):
    slot, name = it.get('slot', ''), it['name'].lower()
    if 'circlet' in name:
        return 'circlet'
    if 'hat' in name:
        return 'hat'
    if 'whelk' in name or 'shell' in name and it.get('slot') != 'MeleeOffHand':
        return 'shell'
    if 'mantle' in name:
        return 'mantle'
    if slot == 'VanityBoots':
        return 'shoes'
    by_slot = {'MeleeMainHand': 'staff', 'MeleeOffHand': 'shield', 'RangedMainHand': 'crossbow', 'Helmet': 'hood',
               'Breast': 'robe', 'Cloak': 'cloak', 'Gloves': 'gloves', 'Boots': 'boots', 'Amulet': 'amulet',
               'Ring': 'ring', 'Ring2': 'ring', 'Underwear': 'underwear', 'MusicalInstrument': 'fork', 'VanityBody': 'robe'}
    if slot in by_slot:
        return by_slot[slot]
    for k, g in (('staff', 'staff'), ('glove', 'gloves'), ('robe', 'robe'), ('shroud', 'cloak'), ('cape', 'cloak'),
                 ('band', 'ring'), ('ring', 'ring'), ('boot', 'boots'), ('bow', 'crossbow')):
        if k in name:
            return g
    return 'ring'


def svg(name, cls=''):
    return ('<svg class="%s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">%s</svg>') % (cls, G[name])


ARROW = ('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" '
         'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>')
DRAG = ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" '
        'stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/></svg>')


# ------------------------------------------------------------------ page shell
def page(path, title, desc, body, crumbs, nav='', og='/fousio/assets/img/og.jpg', scripts=('fousio.js',)):
    canonical = SITE + path
    crumb_html = '<a class="crumb" href="/"><span>dnd.isaiart</span></a>'
    trail = [('Fousio', '/fousio/')] + crumbs
    parts = []
    for i, (label, href) in enumerate(trail):
        if i == len(trail) - 1:
            parts.append('<span class="sep">/</span><b>%s</b>' % esc(label))
        else:
            parts.append('<span class="sep">/</span><a href="%s">%s</a>' % (href, esc(label)))
    crumb_html = ('<div class="crumb"><a href="/">dnd.isaiart</a>%s</div>' % ''.join(parts))
    needs_three = any(s == 'viewer.js' for s in scripts)
    js = ''
    if needs_three:
        js += '<script src="/fousio/assets/vendor/three.min.js?v=%s" defer></script>\n' % V
    for s in scripts:
        js += '<script src="/fousio/assets/%s?v=%s" defer></script>\n' % (s, V)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Isaiart's D&amp;D Resources">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{SITE}{og}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>✦</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/fousio/assets/fousio.css?v={V}">
{js}</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">{crumb_html}{nav}</div></header>
<main id="main">
{body}
</main>
<footer class="foot"><div class="wrap">
<p>Stats, spells, gear and companions are read straight out of Fousio's final save ({esc(PROVENANCE)}) with a custom reader for the game's save format. Item effects are described as they stand in the current build of <em>Fousio's Tome of Items</em>; items from other mods are credited on their sheets. Photos are in-game photo mode. Baldur's Gate 3, its item art and names are © Larian Studios, shown here as fan content.</p>
<p><a href="/">dnd.isaiart.com</a> · <a href="/fousio/">Fousio</a></p>
</div></footer>
</body>
</html>
'''


def write(rel, text):
    path = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8', newline='\n').write(text)


# ------------------------------------------------------------------ items: slugs and short lines
EQUIP = D['equipment']
PACK = D['pack']
STAFF_IDS = {'ART_IsaiahsStaff'}
CIRCLET_IDS = {'HAI_FocusCirclet'}
used = set()
for it in EQUIP + PACK:
    s = slug(it['name'])
    while s in used:
        s += '-2'
    used.add(s)
    it['slug'] = s
    if it['id'] in STAFF_IDS:
        it['href'] = '/fousio/staff/'
    elif it['id'] in CIRCLET_IDS:
        it['href'] = '/fousio/circlet/'
    else:
        it['href'] = '/fousio/items/%s/' % s


def type_line(it):
    bits = []
    if it['type'] == 'Weapon':
        prof = (it.get('proficiency') or '').rstrip('s') or 'Weapon'
        prof = {'Quarterstaff': 'Quarterstaff', 'LightCrossbow': 'Light crossbow'}.get(prof, re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', prof))
        dmg = it.get('damage') or ''
        ench = len(it.get('enchant') or [])
        bits.append(prof)
        if dmg:
            bits.append('%s %s' % (dmg, it.get('damage_type') or ''))
    elif it.get('slot') in ('MeleeOffHand',) or (it.get('ac') and it.get('slot') == 'MeleeOffHand'):
        bits.append('Shield')
        if it.get('ac'):
            bits.append('+%s Armour Class' % it['ac'])
    else:
        bits.append(it.get('slot_label') or {'Armor': 'Wearable'}.get(it['type'], it['type']))
    return ' · '.join(b for b in bits if b)


def short_line(it):
    if it.get('properties'):
        return it['properties'][0]
    if it.get('passives'):
        return it['passives'][0]['name']
    if it.get('spells'):
        return 'Grants ' + it['spells'][0]['name']
    return type_line(it)


def source_label(src):
    if not src:
        return None
    s = src.lower()
    table = [('fousiostomeofitems', "Fousio's Tome of Items (Isaiah's own mod)"), ('xfed', "Fade's Equipment Distribution"),
             ('xfate', "Fade's Assorted Treasure Expansion"), ('underwearofminorrituals', 'Underwear of Rituals'),
             ('mystical', 'Mystical Fashions'), ('spellupdate', '2024 Spell Updates'), ('test_4b516620', "Mystra's Spells"),
             ('vanilla', "Baldur's Gate 3")]
    for k, v in table:
        if k in s:
            return v
    return src


# ------------------------------------------------------------------ main sheet
def short(name):
    """Robe of the Archmagi -> Robe; Amulet of the Infinite Grain -> Infinite Grain"""
    n = re.sub(r'\s*\(.*?\)\s*', '', name)
    m = re.match(r'^(Cloak|Drape|Hood|Robe|Boots|Gloves) of ', n)       # worn pieces: the garment says it
    if m:
        return m.group(1)
    m = re.match(r'^(?:Amulet|Band|Ring|Staff) of (?:the )?(.+)$', n)    # trinkets: the name says it
    return m.group(1) if m and len(m.group(1)) < 22 else n


def parts_note(parts, base_label=None):
    if not parts:
        return ''
    first, rest = parts[0], parts[1:]
    head = base_label if base_label is not None else '%s %s' % (first[0], signed(first[1]))
    return ', '.join([head] + ['%s %s' % (short(n), signed(v)) for n, v in rest])


def vitals_html():
    d = D['derived']
    ac0 = d['ac_parts'][0][0]
    m = re.match(r'^(.*) \((\d+) \+ DEX\)$', ac0)
    ac_note = parts_note(d['ac_parts'], ('%s %s + DEX' % (short(m.group(1)), m.group(2))) if m else '%s %d' % (ac0, d['ac_parts'][0][1]))
    gear_dc = sum(v for _, v in d['dc_parts'][1:])
    gear_atk = sum(v for _, v in d['atk_parts'][1:])
    con = D['abilities']['Constitution']
    items = [
        ('Armour Class', d['ac'], '', ac_note),
        ('Hit Points', D['hp']['max'], '', '%s %d with CON %d' % (D['class'], D['level'], con)),
        ('Spell Save DC', d['dc'], '', '%d base%s' % (d['dc_parts'][0][1], ', gear %s' % signed(gear_dc) if gear_dc else '')),
        ('Spell Attack', d['atk'], '+', '%s base%s' % (signed(d['atk_parts'][0][1]), ', gear %s' % signed(gear_atk) if gear_atk else '')),
        ('Initiative', d['init'], '+' if d['init'] >= 0 else '', parts_note(d['init_parts'])),
        ('Speed', d['speed'], '', ', '.join(['%d m' % d['speed_parts'][0][1]] + ['%s +%d m' % (short(n), v) for n, v in d['speed_parts'][1:]])),
        ('Proficiency', D['prof'], '+', 'Level %d' % D['level']),
    ]
    out = []
    for i, (label, v, pre, note) in enumerate(items):
        unit = '<small>m</small>' if label == 'Speed' else ''
        out.append('<div class="vital" data-reveal style="--i:%d"><span class="v num"><span data-count="%d" data-prefix="%s">%s%d</span>%s</span>'
                   '<span class="label">%s</span><span class="why">%s</span></div>' % (i, v, pre, pre, v, unit, esc(label), esc(note)))
    return '<div class="wrap"><div class="vitals">%s</div></div>' % ''.join(out)


def abilities_html():
    d = D['derived']
    tiles = []
    for i, ab in enumerate(['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']):
        v, m = D['abilities'][ab], d['mods'][ab]
        sv = d['saves'][ab]
        key = ' key' if ab == 'Intelligence' else ''
        tiles.append(f'''<div class="abil{key}" data-score="{v}" style="--i:{i}">
<span class="label">{ab}</span>
<div class="ringbox"><svg class="ring" viewBox="0 0 120 120" aria-hidden="true"><circle class="track" cx="60" cy="60" r="52"/><circle class="arc" cx="60" cy="60" r="52"/></svg>
<div class="rv"><span class="score num" data-count="{v}">{v}</span><span class="mod num">{signed(m)}</span></div></div>
<div class="save"><span class="pdot{' on' if sv['prof'] else ''}" title="{'Proficient' if sv['prof'] else 'Not proficient'}"></span>Save <b class="num">{signed(sv['bonus'])}</b></div>
</div>''')
    bp = D['base_points']
    order = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
    base = ', '.join('%s %d' % (x[:3].upper(), 8 + bp[x]) for x in order)
    from collections import Counter
    def plus(lst):
        return ', '.join('+%d %s' % (n, x[:3].upper()) for x, n in Counter(lst).items())
    bits = []
    if D.get('racial_bonus'):
        bits.append('<b>%s</b> as a %s' % (plus([D['racial_bonus'][0]] * 2 + D['racial_bonus'][1:2]), esc(D['race'])))
    for f in D['feats']:
        ab = [t for t in D['timeline'] if t['level'] == f['level']]
        if f.get('choice'):
            bits.append('<b>%s</b> at level %d' % (esc(re.sub(r'^(\w+): (.+)$', r'\1 (\2)', f['choice'][0])), f['level']))
        elif ab and ab[0].get('abilities'):
            bits.append('<b>%s</b> at level %d' % (plus(ab[0]['abilities']), f['level']))
    if any(b_['id'] == 'HAG_HAIR_INT' for b_ in D['boons']):
        bits.append('<b>+1 INT</b> from Auntie Ethel’s hair')
    score_line = re.compile(r'^(\+\d+ (%s)\b|(%s) becomes \d+)' % ('|'.join(order), '|'.join(order)))
    gear = [it['name'] for it in D['equipment'] if any(score_line.match(p) for p in it.get('properties') or [])]
    saves = [x for x in order if D['derived']['saves'][x]['prof']]
    note = ('<p class="abil-note" data-reveal>Scores as saved at the end of the story. He started on point buy (<b>%s</b>), then took %s; '
            'the rest is his gear%s. Proficient saves: %s.</p>') % (
        base, ', '.join(bits) or 'no increases', (' (%s)' % ', '.join(gear)) if gear else '', ', '.join(saves))
    return '<div class="abils">%s</div>%s' % (''.join(tiles), note)


def boons_html():
    rows = []
    for b in D['boons']:
        rows.append('<div class="trait" data-reveal><span class="k">Boon</span><span class="t">%s</span><span class="d">%s</span></div>'
                    % (esc(b['name']), esc(b['desc'] or '')))
    d = D['derived']
    rows.append('<div class="trait" data-reveal><span class="k">Defence</span><span class="t">Advantage on saves against spells</span><span class="d">%s</span></div>'
                % esc('From ' + ', '.join(d['adv_vs_spells']) + '.'))
    rows.append('<div class="trait" data-reveal><span class="k">Defence</span><span class="t">Immune to Critical Hits</span><span class="d">%s</span></div>'
                % esc('From ' + ' and '.join(d['crit_immune']) + '.'))
    return '<div class="traits">%s</div>' % ''.join(rows)


def skills_html():
    d = D['derived']
    rows = []
    for s in d['skills']:
        extra = ''.join(' <span class="ab">+%s</span>' % esc(x) for x in s['extra'])
        rows.append('<li class="%s"><span class="pdot%s"></span><span class="n">%s</span> <span class="ab">%s</span>%s<span class="b num">%s</span></li>'
                    % ('on' if s['prof'] else '', ' on' if s['prof'] else '', esc(s['name']), s['ability'], extra, signed(s['bonus'])))
    pp = d['passive_perception']
    return ('<ul class="skills" data-reveal>%s</ul><div class="passives" data-reveal><span class="chip">Passive Perception <b class="num">%d</b></span>'
            '<span class="chip">Darkvision <b>12 m</b></span><span class="chip">Proficiency bonus <b class="num">+%d</b></span></div>') % (''.join(rows), pp, D['prof'])


def traits_html():
    rows = []
    def add(k, t, dsc):
        rows.append('<div class="trait" data-reveal><span class="k">%s</span><span class="t">%s</span><span class="d">%s</span></div>' % (esc(k), esc(t), esc(dsc or '')))
    race = D['features']['race']
    add('Race', D['race'], D['race_desc'])
    for f in race:
        if f:
            add('', f['name'], f['desc'])
    add('', 'High Elf Cantrip', 'Light, chosen at level 1.')
    add('Class', 'Abjuration Wizard', D['class_desc'])
    for f in D['features']['class']:
        if f:
            add('', f['name'], f['desc'])
    for f in D['feats']:
        add('Feat · level %d' % f['level'], f['name'], f['desc'])
    add('Background', D['background'], D['background_desc'])
    return '<div class="traits">%s</div>' % ''.join(rows)


FEATURES_AT = {1: 'Arcane Recovery', 2: 'Arcane Ward', 6: 'Projected Ward', 10: 'Improved Abjuration'}


def path_html():
    steps = []
    for i, t in enumerate(D['timeline']):
        grp = []

        def g(k, v, cls=''):
            grp.append('<div class="grp %s"><span class="k">%s</span><span>%s</span></div>' % (cls, esc(k), v))
        if t['level'] == 1:
            g('Class', 'Wizard · High Half-Elf · Sage', 'sub')
            g('Skills', esc(', '.join(t['skills'])))
        if t['subclass']:
            g('School', '<b>%s</b>' % esc(t['subclass']), 'sub')
        feats_here = t.get('features') if t.get('features') is not None else ([FEATURES_AT[t['level']]] if t['level'] in FEATURES_AT else [])
        for fx in feats_here:
            g('Feature', esc(fx))
        if t['feat']:
            g('Feat', '<b>%s</b>' % esc(t['feat']), 'feat')
        for p in t['passives']:
            g('Choice', esc(p['name']), 'feat')
        can = [s['name'] for s in t['spells'] if s['level'] == 0]
        lev = [s['name'] for s in t['spells'] if s['level']]
        if can:
            g('Cantrips' if len(can) > 1 else 'Cantrip', esc(', '.join(can)))
        if lev:
            g('Spells', esc(', '.join(lev)))
        steps.append('<article class="step" data-reveal style="--i:%d"><div class="lv num">%d<small>Level</small></div>%s</article>'
                     % (i % 4, t['level'], ''.join(grp)))
    prev = ('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>')
    arrows = ('<div class="path-nav"><button type="button" data-scroll="path-track" data-dir="prev" aria-label="Earlier levels">%s</button>'
              '<button type="button" data-scroll="path-track" data-dir="next" aria-label="Later levels">%s</button></div>') % (prev, ARROW)
    return '<div class="path">%s<div class="path-track" id="path-track">%s</div><div class="path-bar"><i></i></div></div>' % (arrows, ''.join(steps))


def spells_html():
    d = D['derived']
    book = D['spellbook']
    cantrips = D['cantrips']
    total = len(book) + len(cantrips)
    head = f'''<div class="cast-head">
<div class="cast-card" data-reveal style="--i:0"><div class="v num" data-count="{d['dc']}">{d['dc']}</div><span class="label">Spell save DC</span></div>
<div class="cast-card" data-reveal style="--i:1"><div class="v num" data-count="{d['atk']}" data-prefix="+">+{d['atk']}</div><span class="label">Spell attack</span></div>
<div class="cast-card" data-reveal style="--i:2"><div class="v num">{len(D['prepared'])}<span class="muted">/19</span></div><span class="label">Prepared</span></div>
<div class="cast-card" data-reveal style="--i:3"><div class="v num" data-count="{total}">{total}</div><span class="label">Spells in the book</span></div>
</div>'''
    # slots: wizard 12
    slots = [4, 3, 3, 3, 2, 1]
    rows = []
    for lv, n in enumerate(slots, 1):
        pips = ''.join('<span class="pip" style="--i:%d"></span>' % (lv * 2 + k) for k in range(n))
        rows.append('<div class="slot-row"><span class="num">%s</span><span class="pips">%s</span></div>' % (ORD.get(lv, '%dth' % lv), pips))
    counts = {s: 0 for s in SCHOOLS}
    for s in book + cantrips:
        if s['school'] in counts:
            counts[s['school']] += 1
    tot = sum(counts.values()) or 1
    bars = ''.join('<i class="sch-%s" style="--w:%.2f%%;background:var(--sc);--i:%d" title="%s: %d"></i>' % (s, 100 * c / tot, i, s, c, )
                   for i, (s, c) in enumerate(sorted(counts.items(), key=lambda x: -x[1])) if c)
    legend = ''.join('<span class="sch-%s"><i style="background:var(--sc)"></i>%s <b class="num">%d</b></span>' % (s, s, c)
                     for s, c in sorted(counts.items(), key=lambda x: -x[1]) if c)
    left = ('<div><h3>Spell slots</h3><div class="slots slots-wrap">%s</div>'
            '<p class="muted" style="font-size:14px;margin-top:16px">Arcane Recovery restores slots on a Short Rest. '
            'Arcane Ward soaks damage and recharges whenever he casts Abjuration magic.</p></div>') % ''.join(rows)
    right = ('<div><h3>The book by school</h3><div class="schools-wrap"><div class="schools">%s</div></div><div class="legend">%s</div></div>'
             % (bars, legend))
    def chip(s):
        tag = ' <small>%s</small>' % lvl_label(s['level']) if s['level'] else ''
        return '<span class="sp sch-%s"><i></i>%s%s</span>' % (s['school'] or 'None', esc(s['name']), tag)
    prepared = sorted(D['prepared'], key=lambda s: (s['level'], s['name']))
    prep = ('<div class="cols" style="margin-top:44px"><div data-reveal><h3>Cantrips · %d</h3><div class="prep">%s</div></div>'
            '<div data-reveal><h3>Prepared at the end · %d of 19</h3><div class="prep">%s</div></div></div>') % (
        len(cantrips), ''.join(chip(s) for s in cantrips), len(prepared), ''.join(chip(s) for s in prepared))
    # spellbook: chips grouped by level, details in a drawer
    prepared_ids = {s['id'] for s in prepared}
    allsp = sorted(cantrips + book, key=lambda s: (s['level'] if s['level'] is not None else 9, s['name'].lower()))
    data = {}
    groups = []
    for lv in range(0, 7):
        these = [s for s in allsp if (s['level'] or 0) == lv]
        if not these:
            continue
        btns = []
        for s in these:
            sc = s['school'] or 'None'
            data[s['id']] = {
                'name': s['name'], 'school': s['school'],
                'kind': ' · '.join(x for x in (lvl_label(lv), s['school'], 'Prepared' if s['id'] in prepared_ids else None) if x),
                'desc': s.get('desc') or '',
                'meta': ' · '.join(x for x in (s.get('cost'), 'Concentration' if s.get('concentration') else None,
                                                'Ritual' if s.get('ritual') else None) if x),
            }
            q = ('%s %s' % (s['name'], sc)).lower()
            btns.append('<button type="button" class="sp sch-%s%s" data-id="%s" data-school="%s" data-q="%s" aria-expanded="false"><i></i>%s</button>'
                        % (sc, ' on' if s['id'] in prepared_ids else '', esc(s['id']), sc, esc(q), esc(s['name'])))
        groups.append('<section class="sgroup" data-lv="%d"><h4>%s <b class="num">%d</b></h4><div class="chips">%s</div></section>'
                      % (lv, 'Cantrips' if lv == 0 else lvl_label(lv), len(these), ''.join(btns)))
    lv_buttons = '<button type="button" data-v="all" aria-pressed="true">All</button>' + ''.join(
        '<button type="button" data-v="%d" aria-pressed="false">%s</button>' % (n, 'Cantrips' if n == 0 else n) for n in range(0, 7))
    sch_buttons = '<button type="button" data-v="all" aria-pressed="true">All schools</button>' + ''.join(
        '<button type="button" data-v="%s" aria-pressed="false">%s</button>' % (x, x) for x in SCHOOLS if counts[x])
    search = ('<label class="search"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" '
              'aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="book-q" type="search" '
              'placeholder="Search the spellbook" aria-label="Search the spellbook" autocomplete="off"></label>')
    tools = ('<h3 style="margin-top:48px">The spellbook</h3>'
             '<div class="book-tools" style="margin-top:0"><div class="seg" data-filter="lv" role="group" aria-label="Spell level">%s</div>%s</div>'
             '<div class="book-tools" style="margin-top:0"><div class="seg" data-filter="school" role="group" aria-label="School">%s</div>'
             '<span class="count" id="book-count" aria-live="polite">%d spells</span></div>') % (lv_buttons, search, sch_buttons, total)
    drawer = ('<aside class="drawer" id="spell-drawer" aria-hidden="true" aria-label="Spell"><button type="button" class="x" aria-label="Close">×</button>'
              '<span class="dk"></span><h3 class="dn"></h3><div class="dd"></div><p class="dm"></p></aside>')
    blob = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
    return (head + '<div class="cols">%s%s</div>' % (left, right) + prep + tools + '<div class="book" id="book">%s</div>' % ''.join(groups)
            + drawer + '<script type="application/json" id="spell-data">%s</script>' % blob)


def gear_card(it, i):
    rc = RARITY_CLASS.get(it['rarity'], 'r-Common')
    label = it.get('slot_label') or ('Carried' if it in PACK else '')
    if it['id'] in STAFF_IDS:
        line = 'Reforged as the Staff of the Fixed Star'
    elif it['id'] in CIRCLET_IDS:
        line = 'The Circlet of Nous, before it evolved'
    else:
        line = short_line(it)
    src = icon_src(it)
    ic = ('<span class="ic has-img"><img src="%s" alt="" loading="lazy" decoding="async"></span>' % src) if src \
        else '<span class="ic">%s</span>' % svg(glyph_for(it))
    return ('<a class="gi %s" href="%s" data-reveal style="--i:%d">%s<span><span class="slot">%s</span>'
            '<span class="nm">%s</span><span class="ln">%s</span></span><span class="ar">%s</span></a>'
            % (rc, it['href'], i % 6, ic, esc(label), esc(it['name']), esc(line), ARROW))


def gear_html():
    feat = f'''<div class="feature-row">
<a class="feature" href="/fousio/staff/" data-reveal style="--i:0">
<div class="stage" data-model="/fousio/assets/models/fixed-star.glb" data-spin="0.35" data-fit="1.08" data-elevation="0.1" data-float="0.008" data-tilt="-0.72">{poster('fixed-star')}</div>
<div class="cap"><div><div class="t">Staff of the Fixed Star</div><div class="s">Isaiah’s Staff, reforged · the weapon he ended the story with</div></div><span class="go">{ARROW}</span></div></a>
<a class="feature" href="/fousio/circlet/" data-reveal style="--i:1">
<div class="stage" data-model="/fousio/assets/models/{first_circlet()}" data-level="{circlet_level(first_circlet())}" data-spin="0.3" data-fit="1.6" data-elevation="0.38" data-float="0.02">{poster('circlet')}</div>
<div class="cap"><div><div class="t">Circlet of Nous</div><div class="s">Braille-cut gold that grows with him · nine looks</div></div><span class="go">{ARROW}</span></div></a>
</div>'''
    worn = [it for it in EQUIP if not it['slot'].startswith('Vanity')]
    vanity = [it for it in EQUIP if it['slot'].startswith('Vanity')]
    g1 = '<div class="gear">%s</div>' % ''.join(gear_card(it, i) for i, it in enumerate(worn))
    g2 = '<h3 style="margin-top:40px">In his pack</h3><div class="gear">%s</div>' % ''.join(gear_card(it, i) for i, it in enumerate(PACK))
    g3 = '<h3 style="margin-top:40px">At camp</h3><div class="gear">%s</div>' % ''.join(gear_card(it, i) for i, it in enumerate(vanity))
    return feat + '<h3 style="margin-top:36px">Equipped</h3>' + g1 + g2 + g3


def poster(name):
    p = os.path.join(ROOT, 'assets', 'img', 'poster-%s.webp' % name)
    if os.path.exists(p):
        return '<img class="poster" src="/fousio/assets/img/poster-%s.webp" alt="" loading="lazy">' % name
    return ''


def circlet_level(fname):
    """radians that level a circlet modelled tilted as worn (circlets.json wornTiltDeg)"""
    try:
        c = json.load(open(CIRCLETS_JSON, encoding='utf-8'))
        return round(float(c['files'][fname]['wornTiltDeg']) * 3.14159265 / 180, 4)
    except Exception:
        return 0


def first_circlet():
    try:
        c = json.load(open(CIRCLETS_JSON, encoding='utf-8'))
        lst = c if isinstance(c, list) else c.get('variants') or c.get('circlets') or []
        for v in lst:
            f = v.get('file') or v.get('glb')
            if f and (v.get('stats') == 'ART_CircletOfNous_Evolving' or v.get('letter') == 'A'):   # the look in the photos
                return os.path.basename(f)
        return os.path.basename(lst[0].get('file') or lst[0].get('glb'))
    except Exception:
        return 'circlet-b.glb'


def companions_html():
    rows = ''.join('<li style="--i:%d"><span>%s</span><span class="bar"><i style="--w:%d%%"></i></span><span class="v num">%d</span></li>'
                   % (i, esc(c['name']), max(0, c['approval']), c['approval']) for i, c in enumerate(D['companions']))
    j = D['journey']
    pm = re.match(r'(\d+)\s*h\s*(\d+)?', j.get('playtime') or '')
    stats = ([('Hours played', int(pm.group(1)), ' h %s m' % pm.group(2) if pm.group(2) else ' h')] if pm else []) + \
            [('Days in Faerûn', j['days'], ''), ('Quicksaves', j['quicksaves'], ''),
             ('Experience', D['xp'], ''), ('Camp supplies', j['supplies'], ''), ('Spells learned', len(D['spellbook']) + len(D['cantrips']), '')]
    st = ''.join('<div class="stat" data-reveal style="--i:%d"><div class="v num"><span data-count="%d">%s</span><small style="font-size:.45em">%s</small></div><span class="label">%s</span></div>'
                 % (i, v, '{:,}'.format(v), suf, esc(k)) for i, (k, v, suf) in enumerate(stats))
    stats = [x for x in stats if x[1] is not None]
    quote = '' if not GALE else ('<div class="quote" data-reveal>Gale ascended. Fousio ended the story standing in the epilogue camp under the '
             'Aura of Possibility, a gift from the new God of Ambition.<small>The Aura of Possibility (+10 to all Ability Checks '
             'near the God of Ambition) is active in the final save.</small></div>')
    return ('<div class="cols"><div><h3>Approval of Fousio</h3><ul class="comp">%s</ul></div><div><h3>The road</h3><div class="stats">%s</div>%s</div></div>'
            % (rows, st, quote))


GALLERY = [
    # (file stem, big width, small width, caption, alt)
    ('dark', 1920, 960, 'May', 'Fousio in black and gold, lit from one side'),
    ('prism', 1920, 960, 'May · the Astral Plane', 'Fousio holding the Astral Prism under a red sky'),
    ('sun-close', 1920, 960, 'July', 'Close-up in a gold sunburst crown with a red stone'),
    ('sun-staff', 1920, 960, 'July', 'Fousio in the sunburst crown, staff in hand'),
    ('sun-down', 1920, 960, 'July', 'Looking down, the lattice staff over his shoulder'),
    ('sun-hall', 1920, 960, 'July', 'In the sunburst crown at a banquet, lit by a rose window'),
    ('sun-forest', 1920, 960, 'July', 'The sunburst crown in the forest, Karlach behind him'),
    ('canyon', 1920, 960, 'August', 'In a gold and burgundy robe against a canyon'),
    ('red', 1920, 960, 'September', 'Fousio in a red robe with a red staff'),
    ('front', 1920, 960, 'September · Circlet of Nous', 'Facing the camera, the braille circlet glowing at his brow'),
    ('bands', 1300, 800, 'September · Circlet of Nous', 'Close-up in an early build of the braille circlet'),
    ('profile', 1920, 960, 'September · Circlet of Nous', 'In profile, the circlet sweeping back over his curls'),
    ('bands-side', 1500, 800, 'September · Circlet of Nous', 'Profile in the early circlet, face tattoos visible'),
    ('turn', 1920, 960, 'September · Circlet of Nous', 'Three-quarter view in the circlet'),
    ('glance', 1920, 960, 'September · Circlet of Nous', 'Looking down, the circlet catching the light'),
    ('camp-close', 1920, 960, 'September · at camp', 'At camp in a checkered robe, the Fixed Star over his shoulder'),
    ('camp-star', 1920, 960, 'September · at camp', 'Full length at camp, holding the Staff of the Fixed Star'),
]


def gallery_html(stems=None):
    items = []
    for stem, big, small, cap, alt in GALLERY:
        if stems and stem not in stems:
            continue
        items.append('<button type="button" data-full="/fousio/assets/img/%s-%d.webp" data-alt="%s" data-reveal style="--i:%d">'
                     '<img src="/fousio/assets/img/%s-%d.webp" srcset="/fousio/assets/img/%s-%d.webp %dw, /fousio/assets/img/%s-%d.webp %dw" '
                     'sizes="(max-width: 820px) 86vw, 50vw" alt="%s" loading="lazy" decoding="async"><span class="gcap">%s</span></button>'
                     % (stem, big, esc(alt), len(items) % 2, stem, small, stem, small, small, stem, big, big, esc(alt), esc(cap)))
    prev = ('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" '
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>')
    nav = ('<div class="path-nav gal-nav"><button type="button" data-scroll="gallery-track" data-dir="prev" aria-label="Previous photos">%s</button>'
           '<button type="button" data-scroll="gallery-track" data-dir="next" aria-label="More photos">%s</button></div>') % (prev, ARROW)
    track = 'gallery-track' if not stems else 'gallery-track-%d' % len(stems)
    nav = nav.replace('gallery-track', track)
    return ('%s<div class="gallery" id="%s">%s</div><dialog class="lightbox" aria-label="Photo"><img alt=""></dialog>' % (nav, track, ''.join(items)))


def main_page():
    total = len(D['spellbook']) + len(D['cantrips'])
    maxed = sum(1 for c in D['companions'] if c['approval'] >= 100)
    name_chars = ''.join('<span class="ch" style="--i:%d">%s</span>' % (i, esc(c)) for i, c in enumerate(D['name']))
    nav = ('<nav aria-label="Sections"><a href="#abilities">Abilities</a><a href="#traits">Traits</a><a href="#path">Path</a>'
           '<a href="#spells">Spells</a><a href="#gear">Gear</a><a href="#journey">Journey</a><a href="#gallery">Gallery</a></nav>')
    hero = f'''<section class="hero"><div class="wrap">
<div>
<div class="eyebrow"><span class="dot"></span><span class="label">Baldur’s Gate 3 · Final save{' · ' + esc(PLAYTIME) if PLAYTIME else ''}</span></div>
<h1 class="name" aria-label="{esc(D['name'])}"><span class="line" aria-hidden="true">{name_chars}</span></h1>
<p class="subtitle"><span>{esc(D['race'])}</span><span>{esc(D['subclass'])} {esc(D['class'])}</span><span>Level {D['level']}</span><span>{esc(D['background'])}</span></p>
<p class="lede">An abjurer who finished the story with {and_list(['%d spells in his book' % total, '%d companions at full approval' % maxed, GALE_LEDE])}. Everything on this page is read straight out of his final save.</p>
<div class="hairline"></div>
</div>
<figure class="portrait"><img src="/fousio/assets/img/portrait-1152.webp" srcset="/fousio/assets/img/portrait-720.webp 720w, /fousio/assets/img/portrait-1152.webp 1152w" sizes="(max-width: 820px) 92vw, 40vw" width="1152" height="1440" alt="Fousio: a Black half-elf with a blond curly fade, pointed ears and a glowing gold braille circlet" fetchpriority="high"><figcaption>In the Circlet of Nous</figcaption></figure>
</div></section>'''
    sections = [
        ('abilities', '01', 'Abilities', 'Six scores, six saving throws. Intelligence carries everything he casts.', abilities_html()),
        ('traits', '02', 'Skills & traits', 'What a High Half-Elf sage and an abjurer bring to a fight, and what the road gave him.',
         '<div class="cols"><div><h3>Skills</h3>%s<h3 style="margin-top:44px">Boons &amp; defences</h3>%s</div><div><h3>Features</h3>%s</div></div>'
         % (skills_html(), boons_html(), traits_html())),
        ('path', '03', 'Path to twelve', 'Every choice he made at each level, in order.', path_html()),
        ('spells', '04', 'Spellcasting', 'Everything in his spellbook, from the level-ups and from the scrolls he copied on the way. Open a spell to read it.', spells_html()),
        ('gear', '05', 'Gear', 'What he wore and carried when the save was made. Every item has its own sheet.', gear_html()),
        ('journey', '06', 'Companions & the road', 'How the party felt about him at the end, and how long it took to get there.', companions_html()),
        ('gallery', '07', 'Gallery', 'Photo mode, May to September 2026. Tap a photo to see it full size.', gallery_html()),
    ]
    body = hero + vitals_html()
    for sid, idx, title, sub, inner in sections:
        body += ('<section class="block" id="%s"><div class="wrap"><div class="sec-head" data-reveal><span class="idx">%s</span><h2>%s</h2>'
                 '<p>%s</p></div>%s</div></section>' % (sid, idx, esc(title), esc(sub), inner))
    desc = 'Fousio, a High Half-Elf Abjuration Wizard at level 12: the full character sheet read from his final Baldur’s Gate 3 save, with his spellbook, gear and signature artifacts.'
    write('index.html', page('/fousio/', 'Fousio · Character Sheet', desc, body, [], nav=nav, scripts=('viewer.js', 'fousio.js')))


# ------------------------------------------------------------------ artifact pages
def facts_html(rows):
    return '<div class="facts" data-reveal>%s</div>' % ''.join('<div class="fact"><span class="k">%s</span><span class="v">%s</span></div>' % (esc(k), v) for k, v in rows if v)


def staff_page():
    s = A['staff']
    rows = [('Type', 'Quarterstaff'), ('Damage', '1d6 + 1 Bludgeoning'), ('Versatile', '1d8 + 1'), ('Enchantment', '+1, +2 from level 9'),
            ('Rarity', '<span class="rar r-Legendary">Legendary</span>'), ('Weight', '%s kg' % s['weight']), ('Value', '{:,} gp'.format(int(s['value'] or 0))),
            ('Source', esc(source_label(s['src'])))]
    tiers = [
        ('Levels 1–4', 'Dormant', ['+1 staff', 'Shield once per Long Rest', '10 Soul Charges', 'Regains 1d6 + 2 charges on a Long Rest']),
        ('Levels 5–8', 'Awakened', ['+1 Spell Save DC', 'Counterspell for 1 charge, refunded by the countered spell’s level', '20 Soul Charges', 'Regains 2d6 + 2']),
        ('Level 9+', 'Legendary', ['+2 staff, +2 Spell Attack', 'Retributive Strike', '30 Soul Charges', 'Regains 2d8 + 4']),
    ]
    tiers_html = '<div class="tiers">%s</div>' % ''.join(
        '<div class="tier" style="--i:%d"><div class="lv">%s</div><div class="nm">%s</div><ul>%s</ul></div>' % (i, esc(a), esc(b), ''.join('<li>%s</li>' % esc(x) for x in c))
        for i, (a, b, c) in enumerate(tiers))
    passives = ''.join('<div class="pcard" data-reveal><div class="t">%s</div><p>%s</p></div>' % (esc(p['name']), esc(p['desc'])) for p in s['passives'])
    order = {'always': 1, 'from level 5': 5, 'from level 9': 9}
    rows_sp = []
    for sp in sorted(s['spells'], key=lambda x: (order.get(x['unlock'], 1), x['name'])):
        nm = re.sub(r'\s*\((\d+) charges?(, [^)]*)?\)', '', sp['name'])
        cost = sp.get('cost') or ''
        rows_sp.append('<tr><td><b>%s</b><span class="d">%s</span></td><td class="c">%s</td><td class="c">%s</td></tr>'
                       % (esc(nm), esc((sp.get('desc') or '').split('\n')[0][:220]), esc(cost), esc({1: 'Level 1', 5: 'Level 5', 9: 'Level 9'}[order.get(sp['unlock'], 1)])))
    spells_tbl = '<table class="spells"><thead><tr><th>Spell</th><th>Cost</th><th>From</th></tr></thead><tbody>%s</tbody></table>' % ''.join(rows_sp)
    ex = s['extra']
    rupture = ''.join('<tr><td><b>%d charges</b></td><td class="c num">%d Force</td><td class="c num">%d Force</td></tr>' % (r['charges'], r['damage'], r['backlash']) for r in s['rupture'])
    rs = f'''<h3>Retributive Strike</h3>
<p class="muted">{esc(s['rupture_desc'])}</p>
<table class="spells"><thead><tr><th>Poured in</th><th>Everyone around him</th><th>Backlash on Fousio</th></tr></thead><tbody>{rupture}</tbody></table>
<div class="odds">
<div class="odd" data-reveal style="--i:0"><div class="v num">50%</div><div class="t">{esc(ex['escape']['name'])}</div><p>{esc(ex['escape']['desc'])}</p></div>
<div class="odd" data-reveal style="--i:1"><div class="v num">50%</div><div class="t">Backlash</div><p>The explosion washes over him: 16 Force damage for every charge poured in, no save.</p></div>
<div class="odd" data-reveal style="--i:2"><div class="v">∞</div><div class="t">{esc(ex['shattered']['name'])}</div><p>{esc(ex['shattered']['desc'])} It never lifts: the end of a chapter.</p></div>
</div>
<h3>The last charge</h3>
<p class="muted">{esc(ex['last']['desc'])}</p>
<div class="odds">
<div class="odd" data-reveal style="--i:0"><div class="v num">5%</div><div class="t">{esc(ex['surge']['name'])}</div><p>{esc(ex['surge']['desc'])}</p></div>
<div class="odd" data-reveal style="--i:1"><div class="v num">4.75%</div><div class="t">{esc(ex['grief']['name'])}</div><p>{esc(ex['grief']['desc'])}</p></div>
<div class="odd" data-reveal style="--i:2"><div class="v num">90%</div><div class="t">Silence</div><p>Nothing happens. The staff waits for the next Long Rest.</p></div>
</div>'''
    content = (f'<p class="lore" data-reveal>{esc(s["desc"])}</p>'
               '<h3>Grows with its bearer</h3>' + tiers_html +
               '<h3>On the staff</h3>' + passives +
               '<h3 style="margin-top:34px">Soul Charge spells</h3>' + spells_tbl + rs +
               '<p class="muted" style="font-size:14px">At the end of the story Fousio carried this staff as <b>Isaiah’s Staff</b>. The Staff Forge later gave it this shape; the stats are the same.</p>' +
               '<h3 style="margin-top:44px">In game</h3>' + gallery_html(['camp-star', 'camp-close']))
    body = f'''<section class="stage-hero">
<div class="bgname" aria-hidden="true"><span>Fixed Star</span></div>
<div class="fv" id="fv" data-model="/fousio/assets/models/fixed-star.glb" data-spin="0.28" data-fit="1.16" data-elevation="0.08" data-float="0.01"></div>
<div class="titles"><div class="wrap"><div><h1>Staff of the Fixed Star</h1><div class="kick">Isaiah’s Staff, reforged · Legendary quarterstaff</div></div>
<div class="meta-r"><span class="rar r-Legendary">Legendary</span></div></div></div>
<div class="hint">{DRAG} Drag to turn</div>
</section>
<section class="block" style="padding-top:clamp(40px,6vw,80px)"><div class="wrap"><div class="sheet">{facts_html(rows)}<div>{content}</div></div>
<div class="pager"><a href="/fousio/#gear"><span class="label">Back to</span>Fousio’s gear</a><a class="next" href="/fousio/circlet/"><span class="label">Next artifact</span>Circlet of Nous</a></div>
</div></section>'''
    desc = 'The Staff of the Fixed Star, Isaiah’s Staff reforged: a Legendary quarterstaff with Soul Charges, charge spells and Retributive Strike. Rotating 3D model and full rundown.'
    write('staff/index.html', page('/fousio/staff/', 'Staff of the Fixed Star · Fousio', desc, body, [('Staff of the Fixed Star', '/fousio/staff/')],
                                   scripts=('viewer.js', 'fousio.js')))


def circlet_page():
    c = A['circlet']
    try:
        cj = json.load(open(CIRCLETS_JSON, encoding='utf-8'))
        lst = cj if isinstance(cj, list) else cj.get('variants') or cj.get('circlets') or []
    except Exception:
        cj, lst = {}, []
    files, rough = {}, {}
    fin = (cj.get('finishes') if isinstance(cj, dict) else None) or {}
    for v in lst:
        sid = v.get('stats') or v.get('id') or v.get('stats_entry') or ''
        f = v.get('file') or v.get('glb')
        if sid and f:
            files[sid] = os.path.basename(f)
            r = (fin.get(v.get('finish')) or {}).get('roughnessFactor')
            if r is not None:
                rough[sid] = r
    buttons = []
    first = None
    for v in c['variants']:
        d = re.sub(r'\s*Same wards as Circlet of Nous A; wakes at levels 5 and 9\.?', '', v['desc'] or '')
        if v['id'] == 'ART_CircletOfNous_Evolving':
            d = 'Four ribbons that merge and part, opening into lens shapes at the temples. Polished gold.'
        v['cap'] = d
        f = files.get(v['id'])
        if not f:
            continue
        letter = v['name'].split()[-1]
        if first is None:
            first = f
        buttons.append('<button type="button" data-src="/fousio/assets/models/%s" data-rough="%s" data-level="%s" data-cap="%s" aria-pressed="%s" aria-label="Look %s">%s</button>'
                       % (f, rough.get(v['id'], ''), circlet_level(f), esc(v['cap']), 'true' if first == f and len(buttons) == 0 else 'false', esc(letter), esc(letter)))
    first = first or first_circlet()
    first_desc = next((v['cap'] for v in c['variants'] if files.get(v['id']) == first), c['variants'][0]['cap'])
    rows = [('Type', 'Circlet (head)'), ('Rarity', '<span class="rar r-Legendary">Legendary</span>'), ('Tiers', 'Level 1, 5 and 9'),
            ('Looks', '%d' % len(c['variants'])), ('Weight', '%s kg' % c['weight'] if c.get('weight') else None), ('Source', esc(source_label(c['src'])))]
    tiers = [('Levels 1–4', 'Focus', ['+1 Spell Attack while concentrating']),
             ('Levels 5–8', 'Restored', ['+1 Spell Attack, always', 'Sharp Mind: +1 Constitution saves']),
             ('Level 9+', 'Legendary', ['+1 Spell Save DC', 'Unshakable Mind: Advantage on Concentration saves'])]
    tiers_html = '<div class="tiers">%s</div>' % ''.join(
        '<div class="tier" style="--i:%d"><div class="lv">%s</div><div class="nm">%s</div><ul>%s</ul></div>' % (i, esc(a), esc(b), ''.join('<li>%s</li>' % esc(x) for x in cc))
        for i, (a, b, cc) in enumerate(tiers))
    passives = ''.join('<div class="pcard" data-reveal><div class="t">%s</div><p>%s</p></div>' % (esc(p['name']), esc(p['desc'])) for p in c['passives'])
    forms = ''.join('<div class="pcard" data-reveal><div class="t">%s <small class="rar %s">%s</small></div><p>%s</p></div>'
                    % (esc(f['name']), RARITY_CLASS.get(f['rarity'], ''), esc(f['rarity']), esc(f['desc'])) for f in c['forms'])
    photos = gallery_html(['front', 'bands', 'profile', 'bands-side', 'turn', 'glance'])
    looks = ''.join('<div class="fact"><span class="k">%s</span><span class="v" style="font-weight:400;text-align:left;max-width:70%%">%s</span></div>'
                    % (esc(v['name'].split()[-1]), esc(v['cap'])) for v in c['variants'])
    content = (f'<p class="lore" data-reveal>A thin band that keeps the mind in one piece. Braille is cut into the gold, so a blind wearer can read the ward with a fingertip.</p>'
               '<h3>Grows with its bearer</h3>' + tiers_html + '<h3>On the circlet</h3>' + passives +
               '<h3 style="margin-top:34px">Nine looks</h3><div class="facts" style="position:static;margin-bottom:34px">%s</div>' % looks +
               '<h3>Earlier forms</h3>' + forms +
               '<p class="muted" style="font-size:14px;margin-top:20px">In the final save he still carried the Fragmented circlet; the evolving circlet came later, in the run these photos are from.</p>')
    body = f'''<section class="stage-hero">
<div class="bgname" aria-hidden="true"><span>Nous</span></div>
<div class="variants" role="group" aria-label="Circlet look" data-variants="fv" data-caption="look-cap">{''.join(buttons)}</div>
<div class="fv" id="fv" data-model="/fousio/assets/models/{first}" data-level="{circlet_level(first)}" data-spin="0.3" data-fit="2.3" data-fit-mobile="1.32" data-elevation="0.42" data-float="0.02" data-lift="-0.03" data-lift-mobile="-0.04"></div>
<div class="titles"><div class="wrap"><div><h1>Circlet of Nous</h1><div class="kick" id="look-cap">{esc(first_desc or '')}</div></div>
<div class="meta-r"><span class="rar r-Legendary">Legendary</span></div></div></div>
<div class="hint">{DRAG} Drag to turn</div>
</section>
<section class="block" style="padding-top:clamp(40px,6vw,80px)"><div class="wrap"><div class="sheet">{facts_html(rows)}<div>{content}</div></div>
<h3 style="margin-top:56px">Worn</h3>{photos}
<div class="pager"><a href="/fousio/staff/"><span class="label">Previous artifact</span>Staff of the Fixed Star</a><a class="next" href="/fousio/#gear"><span class="label">Back to</span>Fousio’s gear</a></div>
</div></section>'''
    desc = 'The Circlet of Nous: an evolving Legendary circlet cut with braille, in nine looks. Rotating 3D models, tiers and photos of Fousio wearing it.'
    write('circlet/index.html', page('/fousio/circlet/', 'Circlet of Nous · Fousio', desc, body, [('Circlet of Nous', '/fousio/circlet/')],
                                     scripts=('viewer.js', 'fousio.js')))


# ------------------------------------------------------------------ item sheets
def item_page(it, prev_it, next_it):
    rc = RARITY_CLASS.get(it['rarity'], 'r-Common')
    rows = []
    if it['type'] == 'Weapon':
        rows += [('Damage', esc('%s %s' % (it.get('damage') or '', it.get('damage_type') or ''))),
                 ('Versatile', esc(it.get('versatile'))) if it.get('versatile') else ('', None),
                 ('Properties', esc(', '.join(it.get('weapon_props') or [])))]
    if it.get('ac') and it.get('slot') == 'MeleeOffHand':
        rows.append(('Armour Class', '+%s' % esc(it['ac'])))
    rows += [('Slot', esc(it.get('slot_label') or 'Carried')), ('Rarity', '<span class="rar %s">%s</span>' % (rc, esc(it['rarity']))),
             ('Weight', '%s kg' % esc(it['weight']) if it.get('weight') else None),
             ('Value', '{:,} gp'.format(int(float(it['value']))) if it.get('value') else None),
             ('Source', esc(source_label(it['src'])))]
    content = ''
    if it.get('desc'):
        content += '<p class="lore" data-reveal>%s</p>' % esc(it['desc'])
    if it.get('properties'):
        content += '<h3>Properties</h3><ul class="plist" data-reveal>%s</ul>' % ''.join('<li>%s</li>' % esc(p) for p in it['properties'])
    if it.get('passives'):
        content += '<h3>Effects</h3>' + ''.join('<div class="pcard" data-reveal><div class="t">%s</div><p>%s</p></div>' % (esc(p['name']), esc(p['desc'] or ''))
                                              for p in it['passives'])
    if it.get('spells'):
        content += '<h3 style="margin-top:34px">Grants</h3>' + ''.join(
            '<div class="pcard" data-reveal><div class="t">%s<small>%s</small></div>%s</div>'
            % (esc(s['name']), esc(' · '.join(x for x in (s.get('cost'), lvl_label(s['level']) if s.get('level') else None) if x)),
               '<p>%s</p>' % esc(s['desc']) if s.get('desc') else '') for s in it['spells'])
    if not content:
        content = '<p class="muted">No special properties: this one is about how it looks.</p>'
    where = 'Worn in the %s slot' % (it.get('slot_label') or '').lower() if it in EQUIP else 'Carried in his pack'
    nav_prev = '<a href="%s"><span class="label">Previous</span>%s</a>' % (prev_it['href'], esc(prev_it['name'])) if prev_it else '<span></span>'
    nav_next = '<a class="next" href="%s"><span class="label">Next</span>%s</a>' % (next_it['href'], esc(next_it['name'])) if next_it else '<span></span>'
    src = icon_src(it)
    art = (f'<div class="art"><img src="{src}" alt="{esc(it["name"])}, as it appears in the game" width="380" height="380"></div>'
           if src else f'<div class="glyph">{svg(glyph_for(it))}</div>')
    body = f'''<section class="item-hero {rc}{' has-art' if src else ''}">{art}<div class="wrap">
<a class="backlink" href="/fousio/#gear">← Fousio’s gear</a>
<div class="slot" style="margin-top:28px"><span class="label">{esc(where)}</span><span class="rar {rc}">{esc(it['rarity'])}</span></div>
<h1 style="view-transition-name: item-title">{esc(it['name'])}</h1>
<div class="typeline">{esc(type_line(it))}</div>
</div></section>
<section class="block" style="padding-top:clamp(20px,3vw,36px)"><div class="wrap"><div class="sheet">{facts_html(rows)}<div>{content}</div></div>
<div class="pager">{nav_prev}{nav_next}</div>
</div></section>'''
    desc = '%s: %s %s from Fousio’s final save. %s' % (it['name'], it['rarity'], type_line(it).lower(), (it.get('desc') or '')[:120])
    write('items/%s/index.html' % it['slug'], page('/fousio/items/%s/' % it['slug'], '%s · Fousio' % it['name'], desc, body,
                                                     [('Gear', '/fousio/#gear'), (it['name'], it['href'])]))


def items_pages():
    items_dir = os.path.join(ROOT, 'items')
    if os.path.isdir(items_dir):
        shutil.rmtree(items_dir)
    seq = EQUIP + PACK
    made = []
    for i, it in enumerate(seq):
        if it['href'].startswith('/fousio/items/'):
            item_page(it, seq[i - 1] if i > 0 else None, seq[i + 1] if i + 1 < len(seq) else None)
            made.append(it)
    return made


if __name__ == '__main__':
    main_page()
    staff_page()
    circlet_page()
    seq = items_pages()
    print('built: index, staff, circlet, %d item sheets' % len(seq))
