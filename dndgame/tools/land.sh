#!/bin/sh
# tools/land.sh — land the current worktree branch on main, safely, from inside the worktree.
#
#   sh tools/land.sh            # merge main into this branch, re-stamp, then fast-forward main
#
# Protocol (docs/OVERHAUL.md §Landing): every agent works on its own branch in its
# own worktree. To land, main is merged INTO the branch first, so any conflict is
# resolved here, where the work lives, never in the shared main checkout. Then main
# is fast-forwarded to the branch. If main moved in between (another agent landed),
# the loop simply goes round again.
#
# index.html's import map is regenerated rather than merged: two branches that
# touched different modules always "conflict" on it, and the right answer is
# always "hash what is actually on disk now". Any other conflict stops the script
# with the list of files; resolve them, `git commit`, and run it again.

set -u
# The main checkout is the first worktree git lists, wherever this repo now lives.
MAIN="${MAIN_TREE:-$(git worktree list --porcelain | sed -n '1s/^worktree //p')}"
# Any Node 18+. The original laptop used a bundled runtime; prefer it only if present.
BUNDLED="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
if [ -z "${NODE:-}" ]; then if [ -x "$BUNDLED" ]; then NODE="$BUNDLED"; else NODE=node; fi; fi
BR=$(git rev-parse --abbrev-ref HEAD)
if [ "$BR" = "main" ]; then echo "land.sh: run this from your worktree branch, not main"; exit 1; fi
if [ -n "$(git status --porcelain)" ]; then echo "land.sh: commit your work first (git add -A && git commit)"; exit 1; fi

restamp() {
  "$NODE" tools/stamp.mjs >/dev/null || return 1
  git add index.html
}

i=0
while [ $i -lt 8 ]; do
  i=$((i + 1))
  if ! git merge --no-edit main >/dev/null 2>&1; then
    CONF=$(git diff --name-only --diff-filter=U)
    OTHER=$(echo "$CONF" | grep -v '^index.html$' || true)
    if [ -n "$OTHER" ]; then
      echo "land.sh: CONFLICTS merging main into $BR — resolve these, git commit, then rerun:"
      echo "$OTHER"
      exit 2
    fi
    restamp || { echo "land.sh: stamp failed"; exit 3; }
    if grep -q '^<<<<<<<\|^>>>>>>>' index.html; then
      echo "land.sh: index.html has conflict markers outside the import map — resolve by hand"; exit 2
    fi
    git commit --no-edit -q || true
  fi
  # Always re-stamp after a merge: new modules from either side need entries.
  restamp && (git diff --cached --quiet || git commit -q -m "stamp import map")
  if "$NODE" tools/stamp.mjs --check >/dev/null 2>&1; then :; else echo "land.sh: stamp --check failed"; exit 3; fi
  if git -C "$MAIN" merge --ff-only "$BR" >/dev/null 2>&1; then
    echo "LANDED $BR at $(git rev-parse --short HEAD)"
    exit 0
  fi
  # main moved under us (or its checkout is momentarily locked): go round again.
  sleep 4
done
echo "land.sh: could not fast-forward main after $i tries (is the main checkout dirty? git -C \"$MAIN\" status)"
exit 4
