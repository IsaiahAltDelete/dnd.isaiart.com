"""Step 1: unpack a save and gather the game + mod data needed to read it.

    python prepare.py save "Fousio-57912622555__QuickSave_583"   # a folder under Savegames/Story, or a path to a .lsv
    python prepare.py vanilla                                     # once per game patch
    python prepare.py mods                                        # again whenever your mod list changes

Everything lands in the work folder (see paths.py), never in the repo.
"""
import base64
import glob
import json
import os
import re
import shutil
import sys

import paths

bg3 = paths.bg3()


# ------------------------------------------------------------------ the save
def unpack_save(which):
    src = which if which.lower().endswith('.lsv') else None
    if src is None:
        folder = which if os.path.isdir(which) else os.path.join(paths.SAVES, which)
        lsvs = glob.glob(os.path.join(folder, '*.lsv'))
        if not lsvs:
            raise SystemExit('no .lsv in ' + folder)
        src = lsvs[0]
    if os.path.isdir(paths.SAVE):
        shutil.rmtree(paths.SAVE)
    os.makedirs(paths.SAVE)
    local = os.path.join(paths.SAVE, 'save.lsv')           # plain name: Divine dislikes apostrophes in paths
    shutil.copy2(src, local)
    bg3.extract_package(local, os.path.join(paths.SAVE, 'x'))
    x = os.path.join(paths.SAVE, 'x')
    for name in ('Globals', 'meta'):
        bg3.lsf_to_lsx(os.path.join(x, name + '.lsf'), os.path.join(x, name + '.lsx'))
    t = open(os.path.join(x, 'Globals.lsx'), encoding='utf-8-sig').read()

    # the ECS world
    m = re.search(r'<attribute id="NewAge" type="ScratchBuffer" value="([^"]+)"', t)
    open(os.path.join(paths.SAVE, 'newage.bin'), 'wb').write(base64.b64decode(m.group(1)))

    # legacy regions: which entity is which item / character, and the player's statuses
    def region(name):
        a = t.index('<region id="%s"' % name)
        b = t.index('</region>', a)
        return t[a:b]
    items_r = region('Items')
    creators = re.findall(r'<node id="Creator">\s*<attribute id="Entity" type="guid" value="([^"]+)" />\s*'
                          r'<attribute id="TemplateType" type="uint8" value="\d+" />\s*<attribute id="TemplateID" type="\w+" value="([^"]+)" />', items_r)
    nodes = re.findall(r'<node id="Item">(.*?)<children>', items_r, re.S)
    assert len(creators) == len(nodes), (len(creators), len(nodes))
    items = []
    for (ent, tpl), body in zip(creators, nodes):
        st = re.search(r'id="Stats" type="FixedString" value="([^"]*)"', body)
        cur = re.search(r'id="CurrentTemplate" type="guid" value="([^"]*)"', body)
        items.append({'entity': ent, 'template': cur.group(1) if cur else tpl, 'stats': st.group(1) if st else ''})
    chars_r = region('Characters')
    ccreators = re.findall(r'<node id="Creator">\s*<attribute id="Entity" type="guid" value="([^"]+)" />\s*'
                           r'<attribute id="TemplateType" type="uint8" value="\d+" />\s*<attribute id="TemplateID" type="\w+" value="([^"]+)" />', chars_r)
    cnodes = chars_r.split('<node id="Character">')[1:]
    assert len(ccreators) == len(cnodes), (len(ccreators), len(cnodes))
    chars = []
    for (ent, tpl), body in zip(ccreators, cnodes):
        statuses = re.findall(r'<node id="StatusMeta">\s*<attribute id="ID" type="FixedString" value="([^"]+)"', body)
        chars.append({'entity': ent, 'template': tpl, 'statuses': statuses})
    json.dump({'items': items, 'characters': chars}, open(os.path.join(paths.SAVE, 'legacy.json'), 'w'))
    info = json.load(open(os.path.join(x, 'SaveInfo.json'), encoding='utf-8-sig'))
    info['_mtime'] = os.path.getmtime(src)
    info['_folder'] = os.path.basename(os.path.dirname(src))
    json.dump(info, open(os.path.join(paths.SAVE, 'saveinfo.json'), 'w'), indent=1)
    print('save unpacked: %d items, %d characters' % (len(items), len(chars)))


# ------------------------------------------------------------------ vanilla
VANILLA_REGEX = {
    'Shared.pak': r'^Public/Shared(Dev)?/(Stats/Generated/Data/.*\.txt|RootTemplates/_merged\.lsf|(Races|ClassDescriptions|Backgrounds|Feats|Progressions|Gods|Origins|CharacterCreationPresets|Lists)/.*\.lsx)$',
    'Gustav.pak': r'^Public/Gustav(Dev)?/(Stats/Generated/Data/.*\.txt|RootTemplates/_merged\.lsf|(Races|ClassDescriptions|Backgrounds|Feats|Progressions|Origins|Lists)/.*\.lsx)$',
    'GustavX.pak': r'^Public/GustavX/(Stats/Generated/Data/.*\.txt|RootTemplates/_merged\.lsf|(Races|ClassDescriptions|Backgrounds|Feats|Progressions|Origins|Lists)/.*\.lsx)$',
}


def vanilla():
    g = bg3.GAME_DATA
    for pak, rx in VANILLA_REGEX.items():
        bg3.divine('-a', 'extract-package', '-s', os.path.join(g, pak), '-d', os.path.join(paths.VANILLA, pak[:-4]), '-x', rx, '--use-regex')
    for f in glob.glob(os.path.join(paths.VANILLA, '**', 'RootTemplates', '_merged.lsf'), recursive=True):
        bg3.lsf_to_lsx(f, f[:-4] + '.lsx')
    loca = os.path.join(paths.VANILLA, 'loca')
    bg3.extract_package(os.path.join(g, 'Localization', 'English.pak'), loca, 'Localization/English/english.loca')
    bg3.convert_loca(os.path.join(loca, 'Localization', 'English', 'english.loca'), os.path.join(loca, 'english.xml'))
    print('vanilla data in', paths.VANILLA)


# ------------------------------------------------------------------ mods
MOD_REGEX = r'(Stats/Generated/Data/.*\.txt|Localization/English/.*\.(loca|xml)|RootTemplates/.*\.lsf|Feats/.*\.lsx)$'


def mods():
    for pak in sorted(glob.glob(os.path.join(paths.MODS_DIR, '*.pak'))):
        name = re.sub(r'[^A-Za-z0-9_.-]', '_', os.path.splitext(os.path.basename(pak))[0])
        dest = os.path.join(paths.MODS, name)
        if os.path.isdir(dest):
            continue
        os.makedirs(dest)
        try:
            src, tmp = bg3._tmp_copy(pak)
            try:
                bg3.divine('-a', 'extract-package', '-s', src, '-d', dest, '-x', MOD_REGEX, '--use-regex')
            finally:
                if tmp:
                    shutil.rmtree(tmp, ignore_errors=True)
        except SystemExit as e:
            print('skipped', name, str(e)[:120])
    for f in glob.glob(os.path.join(paths.MODS, '**', '*.loca'), recursive=True):
        if not os.path.exists(f + '.xml'):
            try:
                bg3.convert_loca(f, f + '.xml')
            except SystemExit as e:
                print('loca failed', f, str(e)[:120])
    for f in glob.glob(os.path.join(paths.MODS, '**', 'RootTemplates', '*.lsf'), recursive=True):
        if not os.path.exists(f[:-4] + '.lsx'):
            try:
                bg3.lsf_to_lsx(f, f[:-4] + '.lsx')
            except SystemExit as e:
                print('template failed', f, str(e)[:120])
    print('mod data in', paths.MODS)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'save':
        unpack_save(sys.argv[2])
    elif cmd == 'vanilla':
        vanilla()
    elif cmd == 'mods':
        mods()
    else:
        print(__doc__)
