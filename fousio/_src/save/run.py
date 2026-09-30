"""Read a save end to end and refresh the site's data.

    python run.py "Fousio-57912622555__QuickSave_583" --playtime "290h 22m" --difficulty Custom
    python run.py <save> --skip-game-data        # reuse the extracted game/mod data from an earlier run

Then rebuild the pages with  python ../build_site.py
"""
import argparse
import os
import shutil
import subprocess
import sys

import paths

HERE = os.path.dirname(os.path.abspath(__file__))


def step(*args):
    print('>', ' '.join(args))
    r = subprocess.run([sys.executable] + list(args), cwd=HERE)
    if r.returncode:
        raise SystemExit('step failed: ' + ' '.join(args))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('save', help='save folder name under Savegames/Story, a folder path, or a .lsv path')
    ap.add_argument('--playtime')
    ap.add_argument('--difficulty')
    ap.add_argument('--skip-game-data', action='store_true')
    a = ap.parse_args()
    step('prepare.py', 'save', a.save)
    if not a.skip_game_data:
        step('prepare.py', 'vanilla')
        step('prepare.py', 'mods')
        if os.path.exists(paths.work('db.pkl')):
            os.remove(paths.work('db.pkl'))
    extra = []
    if a.playtime:
        extra += ['--playtime', a.playtime]
    if a.difficulty:
        extra += ['--difficulty', a.difficulty]
    step('build_data.py', *extra)
    step('build_artifacts.py')
    step('derive.py')
    step('icons.py')
    os.makedirs(paths.DATA_OUT, exist_ok=True)
    for f in ('fousio.json', 'artifacts.json'):
        shutil.copy2(paths.work(f), os.path.join(paths.DATA_OUT, f))
    print('data refreshed in', paths.DATA_OUT)


if __name__ == '__main__':
    main()
