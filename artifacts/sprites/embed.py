#!/usr/bin/env python3
"""Rewrite the SPRITES object in ../index.html from the .pxa files.

Each sprite becomes one 768-character string: 32 rows of 24, concatenated.
Run this after build.py so the page and the sources cannot drift apart.
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, os.pardir, "index.html")
W, H = 24, 32

NAMES = ["staff", "wand", "ring", "amulet", "tome", "blade",
         "shield", "armor", "cloak", "orb", "bow",
         "lute", "lyre", "horn", "chime", "drum"]


def grid(name):
    rows, seen = [], False
    with open(os.path.join(HERE, name + ".pxa")) as fh:
        for line in fh:
            line = line.rstrip("\n").lstrip("﻿")
            if line.startswith("@grid") or line.startswith("@frame"):
                seen = True
                continue
            if seen and line.strip() and not line.startswith("@") \
                    and not line.lstrip().startswith("#"):
                rows.append(line)
    if len(rows) != H or any(len(r) != W for r in rows):
        raise SystemExit("%s.pxa is not %dx%d (got %d rows, widths %s)"
                         % (name, W, H, len(rows), sorted(set(map(len, rows)))))
    return "".join(rows)


def main():
    body = ",\n".join("      %-11s '%s'" % (n + ":", grid(n)) for n in NAMES)
    with open(PAGE, encoding="utf-8") as fh:
        page = fh.read()
    pattern = re.compile(r"(    const SPRITES = \{\n).*?(\n    \};)", re.S)
    if not pattern.search(page):
        raise SystemExit("could not find the SPRITES block in index.html")
    updated = pattern.sub(lambda m: m.group(1) + body + m.group(2), page, count=1)
    if updated == page:
        print("index.html already up to date")
        return
    with open(PAGE, "w", encoding="utf-8") as fh:
        fh.write(updated)
    print("updated %s (%d sprites)" % (os.path.relpath(PAGE, HERE), len(NAMES)))


if __name__ == "__main__":
    sys.exit(main())
