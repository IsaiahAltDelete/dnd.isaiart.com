"""Where everything lives. Override with environment variables if your setup differs.

    FOUSIO_WORK       scratch folder for unpacked saves, game data and caches (default: %TEMP%/fousio-sheet)
    FOUSIO_BG3_TOOLS  ClaudeStuff/modworkshop/tools, for bg3.py (Divine wrapper)
    FOUSIO_LSLIB      folder with LSLib's Divine.exe / LSLib.dll
"""
import os
import sys
import tempfile

HOME = os.path.expanduser('~')
WORK = os.environ.get('FOUSIO_WORK') or os.path.join(tempfile.gettempdir(), 'fousio-sheet')
BG3_TOOLS = os.environ.get('FOUSIO_BG3_TOOLS') or os.path.join(HOME, 'Documents', 'ClaudeStuff', 'modworkshop', 'tools')
LSLIB = os.environ.get('FOUSIO_LSLIB') or os.path.join(HOME, 'Documents', 'BG3Modding', 'Packed', 'Tools')
LARIAN = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Larian Studios', "Baldur's Gate 3")
SAVES = os.path.join(LARIAN, 'PlayerProfiles', 'Public', 'Savegames', 'Story')
MODS_DIR = os.path.join(LARIAN, 'Mods')

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_OUT = os.path.join(os.path.dirname(HERE), 'data')     # fousio/_src/data, read by build_site.py

SAVE = os.path.join(WORK, 'save')           # the unpacked .lsv
VANILLA = os.path.join(WORK, 'vanilla')     # race/class/feat tables, English loca, SharedDev stats
MODS = os.path.join(WORK, 'mods')           # stats/loca/templates of every installed mod
os.makedirs(WORK, exist_ok=True)

if BG3_TOOLS not in sys.path:
    sys.path.insert(0, BG3_TOOLS)


def bg3():
    import bg3 as m     # ClaudeStuff/modworkshop/tools/bg3.py
    return m


def work(*parts):
    return os.path.join(WORK, *parts)
