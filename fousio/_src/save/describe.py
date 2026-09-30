"""Human-readable descriptions for BG3 stats entries: spells, passives, statuses, items."""
import re
from db import clean

SCHOOLS = {'Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'}
ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma']
RARITY = {None: 'Common', '': 'Common', 'Common': 'Common', 'Uncommon': 'Uncommon', 'Rare': 'Rare',
          'VeryRare': 'Very Rare', 'Legendary': 'Legendary', 'Story': 'Story'}
SLOT_NAMES = {
    'Helmet': 'Head', 'Breast': 'Armour', 'Cloak': 'Cloak', 'MeleeMainHand': 'Main hand',
    'MeleeOffHand': 'Off hand', 'RangedMainHand': 'Ranged', 'RangedOffHand': 'Ranged off hand',
    'Ring': 'Ring', 'Ring2': 'Ring', 'Underwear': 'Underwear', 'Boots': 'Boots', 'Gloves': 'Gloves',
    'Amulet': 'Amulet', 'MusicalInstrument': 'Instrument', 'VanityBody': 'Camp clothes', 'VanityBoots': 'Camp shoes',
}


def split_top(s, sep=';'):
    """split on sep at paren depth 0"""
    out, depth, cur = [], 0, ''
    for ch in s:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if ch == sep and depth == 0:
            out.append(cur)
            cur = ''
        else:
            cur += ch
    out.append(cur)
    return [x.strip() for x in out if x.strip()]


def args_of(call):
    m = re.match(r'\s*([A-Za-z_]+)\((.*)\)\s*$', call, re.S)
    if not m:
        return None, []
    return m.group(1), split_top(m.group(2), ',')


def param_text(p):
    """one DescriptionParams entry -> the words the tooltip shows"""
    fn, a = args_of(p)
    if fn is None:
        return p.strip()
    if fn == 'DealDamage':
        amt = a[0] if a else ''
        typ = a[1] if len(a) > 1 else ''
        if 'MainMeleeWeapon' in amt or 'MainWeapon' in amt:
            return 'weapon damage'
        typ = typ.replace('MainMeleeWeaponDamageType', '').strip()
        return ('%s %s damage' % (amt, typ)).replace('  ', ' ').strip()
    if fn in ('RegainHitPoints', 'Heal'):
        return '%s hit points' % a[0]
    if fn == 'GainTemporaryHitPoints':
        return '%s temporary hit points' % a[0]
    if fn == 'Distance':
        return '%sm' % a[0]
    if fn == 'LevelMapValue':
        return 'a level-scaled amount'
    if fn in ('ApplyStatus',):
        return a[0] if a else ''
    return p.strip()


def fill(text, params):
    if not text:
        return text
    ps = split_top(params or '', ';')
    def rep(m):
        i = int(m.group(1)) - 1
        return param_text(ps[i]) if 0 <= i < len(ps) else m.group(0)
    return re.sub(r'\[(\d+)\]', rep, text)


def desc(db, e):
    if not e:
        return None
    raw = db.text(e.get('Description'), raw=True)
    if raw is None:
        return None
    return clean(fill(raw, e.get('DescriptionParams')))


def spell(db, name):
    e = db.entry(name)
    if not e:
        return {'id': name, 'name': prettify(name), 'level': None, 'school': None, 'desc': None, 'missing': True}
    lvl = e.get('Level')
    try:
        lvl = int(lvl) if lvl not in (None, '') else None
    except ValueError:
        lvl = None
    school = e.get('SpellSchool') if e.get('SpellSchool') in SCHOOLS else None
    return {
        'id': name,
        'name': db.text(e.get('DisplayName')) or prettify(name),
        'level': lvl,
        'school': school,
        'desc': desc(db, e),
        'cost': cost_text(e.get('UseCosts')),
        'concentration': 'IsConcentration' in (e.get('SpellFlags') or ''),
        'ritual': 'Ritual' in (e.get('SpellFlags') or '') or 'Ritual' in name,
        'src': e.get('_src'),
    }


def passive(db, name):
    e = db.entry(name)
    if not e:
        return None
    props = e.get('Properties') or ''
    return {
        'id': name,
        'name': db.text(e.get('DisplayName')),
        'desc': desc(db, e),
        'hidden': 'IsHidden' in props,
        'boosts': e.get('Boosts'),
    }


def cost_text(uc):
    if not uc:
        return None
    parts = []
    for p in split_top(uc, ';'):
        k, _, v = p.partition(':')
        k = k.strip()
        names = {'ActionPoint': 'Action', 'BonusActionPoint': 'Bonus action', 'ReactionActionPoint': 'Reaction',
                 'SpellSlot': 'Spell slot', 'Movement': 'Movement'}
        if k in names:
            parts.append(names[k])
        elif k.startswith('SpellSlot'):
            parts.append('Level %s slot' % v.split(':')[-1] if ':' in v else 'Spell slot')
        elif k.endswith('_Charge'):
            parts.append('%s charge%s' % (v.split(':')[0], '' if v.split(':')[0] == '1' else 's'))
    return ', '.join(dict.fromkeys(parts)) or None


def prettify(name):
    n = re.sub(r'^(Target|Projectile|Shout|Zone|Wall|Throw|Teleportation|Rush|Cone)_', '', name)
    n = re.sub(r'_(Container|New|Minor|Wizard)$', '', n)
    n = n.replace('_', ' ')
    return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', n)


CONDITION_WORDS = {
    'CharacterLevelGreaterThan(4)': 'from level 5', 'CharacterLevelGreaterThan(8)': 'from level 9',
    'IsSpell()': 'against spells', 'HasSpellFlag(SpellFlags.Spell)': 'against spells',
}


def boost_lines(db, boosts):
    """a Boosts string -> short readable lines (unknown boosts are skipped, never guessed)"""
    out = []
    for b in split_top(boosts or '', ';'):
        cond = None
        m = re.match(r'IF\((.*?)\):(.*)$', b)
        if m:
            cond, b = m.group(1), m.group(2)
        fn, a = args_of(b)
        line = None
        if fn == 'AC':
            line = '+%s Armour Class' % a[0]
        elif fn == 'ACOverrideFormula':
            line = 'Armour Class becomes %s + %s modifier' % (a[0], a[2] if len(a) > 2 else 'Dexterity')
        elif fn == 'Ability':
            cap = ' (max %s)' % a[2] if len(a) > 2 else ''
            line = '+%s %s%s' % (a[1], a[0], cap)
        elif fn == 'AbilityOverrideMinimum':
            line = '%s becomes %s' % (a[0], a[1])
        elif fn == 'SpellSaveDC':
            line = '+%s Spell Save DC' % a[0]
        elif fn == 'RollBonus':
            what = {'MeleeSpellAttack': 'Spell Attack Rolls', 'RangedSpellAttack': 'Spell Attack Rolls',
                    'Attack': 'Attack Rolls', 'SavingThrow': 'Saving Throws', 'SkillCheck': 'Skill Checks',
                    'RawAbility': 'Ability Checks', 'MeleeWeaponAttack': 'Melee Attack Rolls',
                    'RangedWeaponAttack': 'Ranged Attack Rolls', 'DeathSavingThrow': 'Death Saving Throws'}.get(a[0], a[0])
            extra = ' (%s)' % a[2] if len(a) > 2 else ''
            line = '+%s to %s%s' % (a[1], what, extra)
        elif fn == 'WeaponEnchantment':
            line = '+%s weapon enchantment' % a[0]
        elif fn == 'Initiative':
            line = '+%s Initiative' % a[0]
        elif fn == 'ActionResource' and a and a[0] == 'Movement':
            line = '+%sm movement speed' % a[1]
        elif fn == 'Resistance':
            line = '%s to %s damage' % ({'Resistant': 'Resistance', 'Immune': 'Immunity'}.get(a[1], a[1]), a[0])
        elif fn == 'StatusImmunity':
            st = db.entry(a[0])
            nm = db.text(st.get('DisplayName')) if st else None
            line = 'Immune to %s' % (nm or prettify(a[0]).title()) if nm else None
        elif fn == 'Advantage':
            what = {'AllSavingThrows': 'Saving Throws', 'Concentration': 'Concentration checks'}.get(a[0], a[0])
            line = 'Advantage on %s' % what
        elif fn == 'Disadvantage' and a and a[0] == 'AttackTarget':
            line = 'Attacks against you have Disadvantage'
        elif fn == 'CriticalHit' and a and a[0] == 'AttackTarget' and 'Never' in a:
            line = 'Immune to Critical Hits'
        elif fn == 'Proficiency':
            line = 'Proficiency: %s' % prettify(a[0])
        elif fn == 'WeaponProperty' and a and a[0] == 'Magical':
            line = None
        if line:
            if cond:
                line += ' ' + CONDITION_WORDS.get(cond, '(conditional)')
            out.append(line)
    return list(dict.fromkeys(out))


def granted_spells(db, boosts):
    out = []
    for b in split_top(boosts or '', ';'):
        cond = None
        m = re.match(r'IF\((.*?)\):(.*)$', b)
        if m:
            cond, b = m.group(1), m.group(2)
        fn, a = args_of(b)
        if fn in ('UnlockSpell', 'UnlockInterrupt') and a:
            sid = a[0]
            e = db.entry(sid)
            s = spell(db, sid) if e and fn == 'UnlockSpell' else None
            if s is None:
                s = {'id': sid, 'name': db.text(e.get('DisplayName')) if e else prettify(sid),
                     'desc': desc(db, e), 'level': None, 'school': None, 'cost': cost_text(e.get('Cost') if e else None)}
            s['unlock'] = CONDITION_WORDS.get(cond, 'always') if cond else 'always'
            s['kind'] = 'reaction' if fn == 'UnlockInterrupt' else 'spell'
            out.append(s)
    return out


def item(db, stats_name, template):
    e = db.entry(stats_name) or {}
    t = db.tpl(template) or (db.tpl(e.get('RootTemplate')) if e.get('RootTemplate') else None) or {}
    name = db.text(t.get('DisplayName')) or prettify(stats_name)
    passives = []
    for key in ('PassivesOnEquip', 'PassivesMainHand', 'PassivesOffHand'):
        for p in split_top(e.get(key) or '', ';'):
            pp = passive(db, p)
            if pp and not pp['hidden'] and pp['name'] and not pp['name'].startswith('%%%'):
                passives.append(pp)
    boosts = ';'.join(x for x in (e.get('Boosts'), e.get('DefaultBoosts')) if x)
    spells = granted_spells(db, ';'.join(x for x in (e.get('Boosts'), e.get('BoostsOnEquipMainHand'),
                                                         e.get('BoostsOnEquipOffHand')) if x))
    kind = e.get('_type')
    info = {
        'id': stats_name,
        'name': name,
        'desc': db.text(t.get('Description')),
        'tech': db.text(t.get('TechnicalDescription')),
        'rarity': RARITY.get(e.get('Rarity'), e.get('Rarity') or 'Common'),
        'type': kind,
        'weight': e.get('Weight'),
        'value': e.get('ValueOverride'),
        'properties': boost_lines(db, boosts),
        'passives': passives,
        'spells': spells,
        'src': e.get('_src'),
        'icon': t.get('Icon'),
    }
    if kind == 'Weapon':
        info['damage'] = e.get('Damage')
        info['damage_type'] = e.get('Damage Type')
        info['versatile'] = e.get('VersatileDamage')
        info['weapon_props'] = [p for p in (e.get('Weapon Properties') or '').split(';') if p and p not in ('Dippable', 'Magical')]
        info['proficiency'] = (e.get('Proficiency Group') or '').split(';')[0]
        ench = [b for b in boost_lines(db, boosts) if 'enchantment' in b]
        info['enchant'] = ench
    elif kind == 'Armor':
        info['ac'] = e.get('ArmorClass')
        info['armor_type'] = e.get('ArmorType')
    return info
