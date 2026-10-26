# Browser regression checks

`regress.mjs` drives the real game in headless Chromium and asserts the things
that are easy to break and impossible to see in a diff: that weather stops at
the UI, that browsing the class list does not delete your spells, that Mage
Armor raises AC rather than applying a one-round condition, that a damage spell
cast in a quiet street is refused without burning the slot, and that the crime
ledger survives a save.

    npx --yes http-server -p 8099 -s ..     # serve the repo root
    node test/regress.mjs                    # BASE=http://127.0.0.1:8099 by default

It exits non-zero if any check fails. There is no test runner and no build step;
this is deliberately one file you can read in a sitting.

## Cache busting

`index.html` carries an import map pinning all 63 modules to a hash of their
contents, because a relative import does not inherit the query string of the
module importing it — so without the map a deploy can leave a browser running
some modules from the new build and some from the old. Regenerate it after
touching anything under `src/`:

    node tools/stamp.mjs

`regress.mjs` fails if you forget, and separately asserts that the browser
really does fetch every module content-hashed rather than ignoring the map.
