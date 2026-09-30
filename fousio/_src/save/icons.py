"""Step 4 (optional): item images for the sheets, from the game's own tooltip art.

    python icons.py        # reads fousio.json in the work folder, writes fousio/assets/img/items/<icon>.webp

Every item names an icon on its root template (inherited through parents). Base-game
icons are 380 px tooltip paintings in Game.pak (Public/Game/GUI/Assets/Tooltips/ItemIcons);
mods ship theirs under Mods/<mod>/GUI/Assets/(Tooltips/ItemIcons|ControllerUIIcons/items_png).
The DDS files are decoded with Pillow and saved as small transparent WebPs.
"""
import glob
import json
import os
import re
import shutil
import sys

from PIL import Image

import paths
from db import DB

bg3 = paths.bg3()
OUT = os.path.join(os.path.dirname(os.path.dirname(paths.HERE)), 'assets', 'img', 'items')
CACHE = paths.work('icons')


def icon_of(db, stats_id, template=None):
    e = db.entry(stats_id) or {}
    for key in (template, e.get('RootTemplate')):
        t = db.tpl(key) if key else None
        if t and t.get('Icon'):
            return t['Icon']
    return None


def extract(names):
    os.makedirs(CACHE, exist_ok=True)
    want = sorted(n for n in names if n and not glob.glob(os.path.join(CACHE, '**', n + '.DDS'), recursive=True))
    if not want:
        return
    alt = '|'.join(re.escape(n) for n in want)
    # base game: the big tooltip paintings
    bg3.divine('-a', 'extract-package', '-s', os.path.join(bg3.GAME_DATA, 'Game.pak'), '-d', os.path.join(CACHE, 'Game'),
               '-x', r'^Public/Game/GUI/Assets/Tooltips/ItemIcons/(%s)\.DDS$' % alt, '--use-regex')
    missing = [n for n in want if not glob.glob(os.path.join(CACHE, '**', n + '.DDS'), recursive=True)]
    if not missing:
        return
    alt = '|'.join(re.escape(n) for n in missing)
    for pak in sorted(glob.glob(os.path.join(paths.MODS_DIR, '*.pak'))):
        src, tmp = bg3._tmp_copy(pak)
        try:
            bg3.divine('-a', 'extract-package', '-s', src, '-d', os.path.join(CACHE, 'mods', os.path.basename(pak)[:-4]),
                       '-x', r'GUI/Assets/(Tooltips/ItemIcons|ControllerUIIcons/items_png)/(%s)\.DDS$' % alt, '--use-regex')
        except SystemExit:
            pass
        finally:
            if tmp:
                shutil.rmtree(tmp, ignore_errors=True)


def best_file(name):
    found = glob.glob(os.path.join(CACHE, '**', name + '.DDS'), recursive=True)
    if not found:
        return None
    # prefer tooltip art over controller icons, then the largest file
    found.sort(key=lambda f: ('Tooltips' not in f, -os.path.getsize(f)))
    return found[0]


def main():
    data = json.load(open(paths.work('fousio.json'), encoding='utf-8'))
    db = DB.load()
    items = data['equipment'] + data['pack']
    arts = paths.work('artifacts.json')
    if os.path.exists(arts):
        a = json.load(open(arts, encoding='utf-8'))
        items += [a['staff']] + a['circlet'].get('forms', [])
    names = {}
    for it in items:
        n = it.get('icon') or icon_of(db, it['id'])
        if n:
            names[it['id']] = n
    extract(set(names.values()))
    os.makedirs(OUT, exist_ok=True)
    done = {}
    for sid, n in names.items():
        f = best_file(n)
        if not f:
            print('no icon file for', sid, n)
            continue
        out = os.path.join(OUT, n + '.webp')
        if not os.path.exists(out):
            im = Image.open(f)
            im.load()
            im = im.convert('RGBA')
            if max(im.size) > 380:
                im.thumbnail((380, 380), Image.LANCZOS)
            im.save(out, 'WEBP', quality=88, method=6)
        done[sid] = n + '.webp'
    keep = set(done.values())
    for f in os.listdir(OUT):                       # drop art for items no longer on the sheet
        if f.endswith('.webp') and f not in keep:
            os.remove(os.path.join(OUT, f))
    os.makedirs(paths.DATA_OUT, exist_ok=True)
    json.dump(done, open(os.path.join(paths.DATA_OUT, 'icons.json'), 'w'), indent=1)
    print('%d item images in %s' % (len(done), OUT))


if __name__ == '__main__':
    main()
