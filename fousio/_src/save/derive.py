"""Step 3b: derived numbers for the sheet (AC, spell DC, spell attack, initiative, speed, saves,
skills), each with its sources. Adds a "derived" block to fousio.json in the work folder.

Item effects come from every equipped item's Boosts and its passives' Boosts (hidden ones
included), evaluated at the character's level. Situational boosts (while concentrating,
against spells) are listed as notes, never added in.
"""
import json
import re

import paths
from db import DB
from describe import args_of, split_top

ABIL = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
SKILLS = {'Athletics': 'Strength', 'Acrobatics': 'Dexterity', 'Sleight of Hand': 'Dexterity', 'Stealth': 'Dexterity',
          'Arcana': 'Intelligence', 'History': 'Intelligence', 'Investigation': 'Intelligence', 'Nature': 'Intelligence',
          'Religion': 'Intelligence', 'Animal Handling': 'Wisdom', 'Insight': 'Wisdom', 'Medicine': 'Wisdom',
          'Perception': 'Wisdom', 'Survival': 'Wisdom', 'Deception': 'Charisma', 'Intimidation': 'Charisma',
          'Performance': 'Charisma', 'Persuasion': 'Charisma'}
KEY = {k.replace(' ', ''): k for k in SKILLS}


def main():
    data = json.load(open(paths.work('fousio.json'), encoding='utf-8'))
    db = DB.load()
    level = data['level']
    mod = {a: (v - 10) // 2 for a, v in data['abilities'].items()}
    prof = data['prof']

    def cond_ok(c):
        if c is None:
            return True
        m = re.fullmatch(r'CharacterLevelGreaterThan\((\d+)\)', c.strip())
        return level > int(m.group(1)) if m else None      # None: situational

    item_boosts = []                                        # (item name, call, ok, raw entry)
    for it in data['equipment']:
        e = db.entry(it['id']) or {}
        raw = ';'.join(x for x in (e.get('Boosts'), e.get('DefaultBoosts')) if x)
        for key in ('PassivesOnEquip', 'PassivesMainHand', 'PassivesOffHand'):
            for p in split_top(e.get(key) or '', ';'):
                pe = db.entry(p)
                if pe and pe.get('Boosts'):
                    raw += ';' + pe['Boosts']
        for b in split_top(raw, ';'):
            c = None
            m = re.match(r'IF\((.*)\):(.*)$', b)
            if m:
                c, b = m.group(1), m.group(2)
            item_boosts.append((it['name'], b.strip(), cond_ok(c), e))

    def collect(fns, first=None):
        out = []
        for src, b, ok, e in item_boosts:
            fn, a = args_of(b)
            if fn in fns and ok and (first is None or (a and a[0].strip() in first)):
                out.append((src, a))
        return out

    char = []
    for src, s in data.get('char_boosts', []):
        for b in split_top(s, ';'):
            char.append((src, args_of(b)))

    # armour class
    parts = []
    ov = collect({'ACOverrideFormula'})
    body = next((it for it in data['equipment'] if it['slot'] == 'Breast'), None)
    be = db.entry(body['id']) if body else {}
    if ov:
        src, a = ov[0]
        parts.append(('%s (%s + DEX)' % (src, a[0]) if a[1].strip().lower() == 'true' else src,
                      int(a[0]) + (mod['Dexterity'] if a[1].strip().lower() == 'true' else 0)))
    elif body and be.get('ArmorClass') and (be.get('ArmorType') or 'None') not in ('None', 'Cloth'):
        cap = {'Leather': 99, 'Padded': 99, 'StuddedLeather': 99, 'Hide': 2, 'ChainShirt': 2, 'ScaleMail': 2,
               'BreastPlate': 2, 'HalfPlate': 2}.get(be.get('ArmorType'), 0)
        parts.append((body['name'], int(be['ArmorClass']) + min(mod['Dexterity'], cap)))
    else:
        parts.append(('10 + DEX', 10 + mod['Dexterity']))
    for it in data['equipment']:
        if it['slot'] == 'MeleeOffHand' and it.get('ac'):
            parts.append((it['name'], int(it['ac'])))
    parts += [(s, int(a[0])) for s, a in collect({'AC'})]
    ac = sum(v for _, v in parts)

    # spellcasting (spell attack boosts come as Melee + Ranged pairs: count the ranged one)
    dc_parts = [('8 + proficiency + INT', 8 + prof + mod['Intelligence'])] + [(s, int(a[0])) for s, a in collect({'SpellSaveDC'})]
    atk_parts = [('proficiency + INT', prof + mod['Intelligence'])] + \
                [(s, int(a[1])) for s, a in collect({'RollBonus'}, {'RangedSpellAttack'}) if a[1].strip().lstrip('+-').isdigit()]
    init_parts = [('DEX', mod['Dexterity'])] + [(s, int(a[0])) for s, a in collect({'Initiative'})]
    base_speed = next((int(a[1]) for s, (fn, a) in char if fn == 'ActionResource' and a and a[0] == 'Movement'), 9)
    speed_parts = [('base', base_speed)] + [(s, int(a[1])) for s, a in collect({'ActionResource'}, {'Movement'})]

    # proficiencies from class level 1, race, background and feats
    save_prof = {a[1].strip() for s, (fn, a) in char if fn == 'ProficiencyBonus' and a and a[0] == 'SavingThrow'}
    skill_src = {}
    for s, (fn, a) in char:
        if fn == 'ProficiencyBonus' and a and a[0] == 'Skill':
            skill_src.setdefault(KEY.get(a[1].strip(), a[1].strip()), s.capitalize())
    for s in data['skills_chosen']:
        skill_src.setdefault(KEY.get(s, s), data['class'])
    expert = {KEY.get(a[0].strip(), a[0].strip()) for s, (fn, a) in char if fn == 'ExpertiseBonus' and a}
    save_all = sum(int(a[1]) for s, a in collect({'RollBonus'}, {'SavingThrow'}) if len(a) == 2 and a[1].strip().lstrip('+-').isdigit())
    saves = {}
    for ab in ABIL:
        extra = sum(int(a[1]) for s, a in collect({'RollBonus'}, {'SavingThrow'}) if len(a) > 2 and a[2].strip() == ab)
        saves[ab] = {'bonus': mod[ab] + (prof if ab in save_prof else 0) + save_all + extra, 'prof': ab in save_prof}
    skills = []
    for sk, ab in SKILLS.items():
        p = prof * (2 if sk in expert else 1) if sk in skill_src else 0
        extra = [a[1].strip() for s, a in collect({'RollBonus'}, {'SkillCheck'})
                 if len(a) > 2 and a[2].strip().replace(' ', '') == sk.replace(' ', '')]
        skills.append({'name': sk, 'ability': ab[:3].upper(), 'bonus': mod[ab] + p, 'prof': sk in skill_src,
                       'expert': sk in expert, 'src': skill_src.get(sk), 'extra': extra})

    adv = sorted({src for src, b, ok, e in item_boosts if b.startswith('Advantage(AllSavingThrows')})
    crit = sorted({src for src, b, ok, e in item_boosts if b.startswith('CriticalHit(AttackTarget,Success,Never')})
    data['derived'] = {
        'ac': ac, 'ac_parts': parts,
        'dc': sum(v for _, v in dc_parts), 'dc_parts': dc_parts,
        'atk': sum(v for _, v in atk_parts), 'atk_parts': atk_parts,
        'init': sum(v for _, v in init_parts), 'init_parts': init_parts,
        'speed': sum(v for _, v in speed_parts), 'speed_parts': speed_parts,
        'mods': mod, 'saves': saves, 'skills': skills,
        'passive_perception': 10 + mod['Wisdom'] + (prof if 'Perception' in skill_src else 0),
        'adv_vs_spells': adv, 'crit_immune': crit,
    }
    json.dump(data, open(paths.work('fousio.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    d = data['derived']
    print('derived: AC %d  DC %d  attack +%d  initiative %+d  speed %dm' % (d['ac'], d['dc'], d['atk'], d['init'], d['speed']))
    print('  saves', {k[:3]: v['bonus'] for k, v in saves.items()}, 'proficient', sorted(save_prof))
    print('  skills', {s['name']: s['bonus'] for s in skills if s['prof']})


if __name__ == '__main__':
    main()
