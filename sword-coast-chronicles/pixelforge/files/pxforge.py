#!/usr/bin/env python
"""pixelforge CLI -- author pixel art as text, render it as PNG/GIF.

    python pxforge.py <command> --help

Commands: new preview render sheet gif ascii validate lint info edit
          export import diff palettes templates

The game loop: author assets/pixel/<area>/NAME.pxa -> preview (and Read the
PNG) -> lint -> node tools/pxbuild.mjs, which compiles every .pxa into a
src/render/art/*.js module that registers the sprite with render/sprites.js.
"""

from __future__ import print_function

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pxlib import color, fmt, gif, ops, palettes, png, render, templates  # noqa: E402
from pxlib import export as pxexport  # noqa: E402
from pxlib import lint as pxlint  # noqa: E402
from pxlib.fmt import PxaError  # noqa: E402


# ------------------------------------------------------------------- helpers

def die(msg):
    sys.stderr.write("error: %s\n" % msg)
    sys.exit(1)


def out_path(args, src, suffix, ext):
    if getattr(args, "out", None):
        return os.path.abspath(args.out)
    base = os.path.splitext(os.path.abspath(src))[0]
    return base + suffix + ext


def emit_warnings(warnings):
    for w in warnings:
        # An unused key is normal -- palettes are broader than any one sprite.
        # It's only worth reporting from `validate`.
        if w.startswith("palette keys defined but unused"):
            continue
        sys.stderr.write("warning: %s\n" % w)


def load_sprite(path, strict=True):
    """strict=False still reports problems but hands back the sprite, so
    inspection commands work on exactly the files that need inspecting."""
    if not os.path.exists(path):
        die("no such file: %s" % path)
    try:
        sprite = fmt.load(path)
    except PxaError as exc:
        die(str(exc))
    errors, warnings = fmt.validate(sprite)
    emit_warnings(warnings)
    if errors and not strict:
        for e in errors:
            sys.stderr.write("error: %s\n" % e)
        return sprite
    if errors:
        for e in errors:
            sys.stderr.write("error: %s\n" % e)
        die("%s is not valid; fix the rows above (try `ascii --numbers`)" % path)
    return sprite


def write_canvas(canvas, path):
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    png.write_rgba(path, canvas.w, canvas.h, canvas.buf)
    print(path)


def parse_size(text):
    try:
        w, h = text.lower().split("x")
        return int(w), int(h)
    except Exception:
        die("bad --size %r, want WxH like 24x32" % text)


def _ints(text, n, what):
    parts = [p for p in text.replace(" ", "").split(",") if p != ""]
    if len(parts) != n:
        die("%s wants %d comma-separated numbers, got %r" % (what, n, text))
    try:
        return [int(p) for p in parts]
    except ValueError:
        die("%s wants numbers, got %r" % (what, text))


def split_frame_ref(ref):
    """'FILE[:FRAME]' -> (path, frame_or_None), without mistaking the colon in
    a Windows drive letter for the frame separator."""
    head, sep, tail = ref.rpartition(":")
    if sep and len(head) > 1 and not head.endswith(":"):
        return head, (tail or None)
    return ref, None


def split_assign(text, what):
    if "=" not in text:
        die("%s wants LHS=RHS, got %r" % (what, text))
    lhs, rhs = text.split("=", 1)
    return lhs.strip(), rhs.strip()


def _preset_colorways():
    """A handful of believable Realms outfits from palette.js dye ramps, for
    checking that a token-coloured sprite survives recolouring."""
    g = color.game_ramps()

    def mid(name, fallback):
        return g[name]["colors"][2] if name in g else fallback
    return [
        ("default", color.make_colorway()),
        ("madder/woad", color.make_colorway({"main": mid("madder", "#b8503a"), "alt": mid("woad", "#3a5a9a")})),
        ("green/ochre", color.make_colorway({"main": mid("green", "#3a7a44"), "alt": mid("ochre", "#c08a2a"),
                                             "skin": mid("skinTan", "#c08858")})),
        ("purple/black", color.make_colorway({"main": mid("purple", "#6a3a7a"), "alt": mid("black", "#2e2a34"),
                                              "skin": mid("skinDeep", "#5a3a2a"), "hair": "#d8d0c0"})),
        ("undyed", color.make_colorway({"main": mid("undyed", "#c8b894"), "alt": mid("leather", "#7a4a2a"),
                                        "skin": mid("skinPale", "#f0c8a0"), "hair": "#b0502a"})),
    ]


def colorways_from(args):
    out = []
    if getattr(args, "colorways", False):
        out.extend(_preset_colorways())
    for i, spec in enumerate(getattr(args, "colorway", None) or []):
        label, sep, body = spec.partition(":")
        if not sep or "=" in label:
            label, body = "custom %d" % (i + 1), spec
        try:
            out.append((label, color.parse_colorway_spec(body)))
        except ValueError as exc:
            die(str(exc))
    return out


def variant_overrides(sprite, kind):
    if not kind:
        return None
    v = sprite.variants()
    if kind not in v:
        die("no @recolor variant %r (have: %s)" % (kind, ", ".join(v) or "none"))
    return v[kind]


def repo_root():
    p = color.find_palette_js()
    return os.path.dirname(os.path.dirname(os.path.dirname(p))) if p else os.getcwd()


def rel_to(path, root):
    return os.path.relpath(os.path.abspath(path), root).replace(os.sep, "/")


# ----------------------------------------------------------------- commands

def cmd_new(args):
    w, h = parse_size(args.size)
    frames = [f.strip() for f in args.frames.split(",") if f.strip()] or ["idle"]
    try:
        sprite = templates.build(args.template, w, h, args.palette,
                                 args.name or os.path.splitext(
                                     os.path.basename(args.file))[0], frames)
    except KeyError as exc:
        die(str(exc))
    sprite.meta["scale"] = args.scale
    if len(frames) > 1:
        sprite.meta["fps"] = args.fps
    path = os.path.abspath(args.file)
    if os.path.exists(path) and not args.force:
        die("%s already exists (pass --force to overwrite)" % path)
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    fmt.save(sprite, path)
    print(path)
    print("%dx%d, %d frame(s), palette %s, template %s"
          % (w, h, len(frames), args.palette, args.template))


def cmd_render(args):
    sprite = load_sprite(args.file)
    scale = args.scale or sprite.meta.get("scale", 8)
    bg = fmt.parse_color(args.bg) if args.bg else None
    cws = colorways_from(args)
    canvas = render.render_png(sprite, args.frame, scale=scale, bg=bg, pad=args.pad,
                               colorway=cws[0][1] if cws else None,
                               overrides=variant_overrides(sprite, args.recolor))
    write_canvas(canvas, out_path(args, args.file, "", ".png"))


def cmd_preview(args):
    sprite = load_sprite(args.file)
    frame = sprite.frame(args.frame)
    strips = []
    if args.frames:
        strips.append(("frames (ms)", render.strip_cells(sprite, frame, "frames")))
    if args.layers:
        if not frame.layers:
            die("frame %r has no layers" % frame.name)
        strips.append(("layers, bottom to top", render.strip_cells(sprite, frame, "layers")))
    cws = colorways_from(args)
    if cws:
        strips.append(("colorways", render.strip_cells(sprite, frame, "colorways", cws)))
    if args.recolor:
        if not sprite.recolors:
            die("%s has no @recolor" % args.file)
        strips.append(("recolor variants", render.strip_cells(sprite, frame, "recolor")))
    issues = None
    if args.lint:
        issues = [i for i in pxlint.lint(sprite) if i.frame == frame.name]
        for i in issues:
            print("lint: %s" % i)
    canvas = render.render_preview(sprite, args.frame, scale=args.scale, onion=args.onion,
                                   strips=strips, issues=issues)
    write_canvas(canvas, out_path(args, args.file, ".preview", ".png"))


def cmd_sheet(args):
    sprite = load_sprite(args.file)
    scale = args.scale or sprite.meta.get("scale", 8)
    cols = args.cols or sprite.meta.get("cols", 0)
    bg = fmt.parse_color(args.bg) if args.bg else None
    cws = colorways_from(args)
    canvas = render.render_sheet(sprite, scale=scale, cols=cols, gap=args.gap,
                                 bg=bg, label=args.label, onion=args.onion,
                                 colorway=cws[0][1] if cws else None,
                                 overrides=variant_overrides(sprite, args.recolor))
    write_canvas(canvas, out_path(args, args.file, ".sheet", ".png"))
    print("%d frames, %dx%d each, scale %d"
          % (len(sprite.frames), sprite.width, sprite.height, scale))


def cmd_gif(args):
    sprite = load_sprite(args.file)
    scale = args.scale or sprite.meta.get("scale", 8)
    bg = fmt.parse_color(args.bg) if args.bg else None
    cws = colorways_from(args)
    w, h, bufs = render.render_frames_rgba(sprite, scale=scale, bg=bg,
                                           colorway=cws[0][1] if cws else None,
                                           overrides=variant_overrides(sprite, args.recolor))
    path = out_path(args, args.file, "", ".gif")
    if args.fps:
        delays = [max(2, int(round(100.0 / args.fps)))] * len(bufs)
    else:
        # the authored timing: each frame's dur=, else the sprite's @fps
        delays = [max(2, int(round(sprite.frame_ms(f) / 10.0))) for f in sprite.frames]
    try:
        gif.write_gif(path, w, h, bufs, delay_cs=delays, loop=args.loop)
    except ValueError as exc:
        die(str(exc))
    print(path)
    print("%d frames, %s cs/frame, %dx%d" % (len(bufs), ",".join(str(d) for d in delays), w, h))


def cmd_ascii(args):
    sprite = load_sprite(args.file, strict=False)
    refs = [f.name for f in sprite.frames] if args.all else [args.frame]
    for ref in refs:
        frame = sprite.frame(ref)
        w = max([len(r) for r in frame.rows] or [0])
        print("@frame %s  (%dx%d)" % (frame.name, frame.width, frame.height))
        if args.numbers:
            tens = "".join(str(x // 10) if x >= 10 else " " for x in range(w))
            ones = "".join(str(x % 10) for x in range(w))
            print("     " + tens)
            print("     " + ones)
            for y, row in enumerate(frame.rows):
                # flag ragged rows right where they are, with the delta
                flag = "" if len(row) == frame.width else \
                    "   <- %d chars (%+d)" % (len(row), len(row) - frame.width)
                print("%3d |%s%s" % (y, row, flag))
        else:
            for row in frame.rows:
                print(row)
        print("")


def cmd_watch(args):
    from pxlib import watch
    if not os.path.exists(args.file):
        die("no such file: %s" % args.file)
    try:
        watch.serve(args.file, port=args.port, host=args.host)
    except KeyboardInterrupt:
        print("stopped")


def cmd_validate(args):
    if not os.path.exists(args.file):
        die("no such file: %s" % args.file)
    try:
        sprite = fmt.load(args.file)
    except PxaError as exc:
        die(str(exc))
    errors, warnings = fmt.validate(sprite)
    for w in warnings:
        print("warning: %s" % w)
    for e in errors:
        print("error: %s" % e)
    if errors:
        sys.exit(1)
    print("ok: %s  %dx%d  %d frame(s)  %d colors used"
          % (sprite.name, sprite.width, sprite.height, len(sprite.frames),
             len(sprite.used_keys() - {"."})))


def cmd_info(args):
    sprite = load_sprite(args.file)
    print("name    %s" % sprite.name)
    print("size    %dx%d" % (sprite.width, sprite.height))
    print("frames  %s" % ", ".join(f.name for f in sprite.frames))
    for k in ("use", "scale", "fps"):
        if k in sprite.meta:
            print("%-7s %s" % (k, sprite.meta[k]))
    for r in sprite.ramps.values():
        print("ramp    %s  %s from %s  %s" % (r.name, r.keys, r.base, " ".join(r.colors)))
    for aid, a in pxexport.anims_for(sprite).items():
        print("anim    %s  %s  %dms%s" % (aid, " ".join("%s:%d" % p for p in zip(a["seq"], a["durations"])),
                                          a["ms"], "" if a["loop"] else "  once"))
    layered = [f for f in sprite.frames if f.layers]
    if layered:
        print("layers  %s" % ", ".join("%s[%s]" % (f.name, " ".join(L.name or "base" for L in f.layers))
                                       for f in layered))
    if sprite.recolors:
        print("recolor %s" % ", ".join(sprite.variants()))
    if sprite.anchor:
        print("anchor  %d,%d" % sprite.anchor)
    for name, (x, y) in sprite.points.items():
        print("point   %s %d,%d" % (name, x, y))
    counts = {}
    for f in sprite.frames:
        for row in f.rows:
            for ch in row:
                counts[ch] = counts.get(ch, 0) + 1
    total = sum(counts.values())
    print("\nkey  count   share  color")
    notes = dict(sprite.meta.get("notes", {}))
    if sprite.meta.get("use") in palettes.PALETTES:
        for k, v in palettes.get(sprite.meta["use"])["notes"].items():
            notes.setdefault(k, v)
    for ch, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        label = fmt.color_hex(sprite.color(ch))
        if notes.get(ch):
            label += "  " + notes[ch]
        print("%-4s %-7d %5.1f%%  %s" % (repr(ch)[1:-1], n, 100.0 * n / total, label))


def cmd_lint(args):
    skip = [s for s in (args.skip or "").split(",") if s]
    unknown = [s for s in skip if s not in pxlint.CODES]
    if unknown:
        die("unknown lint code(s) %s (have: %s)" % (", ".join(unknown), " ".join(pxlint.CODES)))
    total = 0
    for path in args.files:
        sprite = load_sprite(path)
        issues = pxlint.lint(sprite, skip=skip, max_colors=args.max_colors)
        for i in issues:
            print("%s: %s" % (path, i))
        total += len(issues)
        if not issues:
            print("%s: clean" % path)
    if total:
        print("%d finding(s)%s" % (total, "" if args.strict else " (warnings; --strict fails on them)"))
    if total and args.strict:
        sys.exit(1)


def _compile(path, root, sprite_id=None, out_rel=None):
    if not os.path.exists(path):
        raise PxaError("no such file: %s" % path)
    sprite = fmt.load(path)
    errors, warnings = fmt.validate(sprite)
    if errors:
        raise PxaError("%s is not valid: %s" % (path, "; ".join(errors)))
    out_rel, module, report = pxexport.compile_sprite(sprite, rel_to(path, root), sprite_id, out_rel)
    report["warnings"] = [w for w in warnings if not w.startswith("palette keys defined but unused")]
    return out_rel, module, report


def cmd_export(args):
    root = os.path.abspath(args.root) if args.root else repo_root()
    if args.manifest:
        # Batch mode for tools/pxbuild.mjs: JSON in, JSON out, nothing written.
        text = sys.stdin.read() if args.manifest == "-" else open(args.manifest, encoding="utf-8").read()
        results = []
        for item in json.loads(text):
            try:
                out_rel, module, report = _compile(item["src"], root, item.get("name"), item.get("out"))
                report["text"] = module
                report["src"] = item["src"]
                results.append(report)
            except PxaError as exc:
                results.append({"src": item["src"], "error": str(exc)})
        sys.stdout.write(json.dumps(results))
        return
    if not args.file:
        die("export wants FILE.pxa (or --manifest)")
    out_rel = rel_to(args.js, root) if args.js else None
    out_rel, module, _report = _compile(args.file, root, args.name, out_rel)
    path = os.path.join(root, out_rel)
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if args.check:
        if old != module:
            print("stale: %s (rebuild with tools/pxbuild.mjs)" % out_rel)
            sys.exit(1)
        print("up to date: %s" % out_rel)
        return
    if old == module:
        print("unchanged: %s" % out_rel)
        return
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(module)
    print("wrote %s" % out_rel)


def cmd_palettes(args):
    if args.name:
        pal = palettes.get(args.name)
        print("%s (%d colors)" % (args.name, len(pal["colors"])))
        for k, c in pal["colors"].items():
            note = pal["notes"].get(k, "")
            print("  %s  %-9s %s" % (k, c, note))
        return
    for name in palettes.names():
        pal = palettes.get(name)
        print("%-11s %2d colors  keys: %s"
              % (name, len(pal["colors"]), "".join(pal["colors"].keys())))


def cmd_templates(args):
    for name in templates.names():
        if name == "blank":
            print("%-12s any size, all transparent" % name)
        else:
            rows = templates.TEMPLATES[name]
            print("%-12s %dx%d proportion guide (key 's')"
                  % (name, len(rows[0]), len(rows)))


def cmd_diff(args):
    a = load_sprite(args.a)
    b = load_sprite(args.b)
    fa = a.frame(args.frame)
    fb = b.frame(args.frame)
    if (fa.width, fa.height) != (fb.width, fb.height):
        print("size differs: %dx%d vs %dx%d"
              % (fa.width, fa.height, fb.width, fb.height))
        sys.exit(1)
    n = 0
    for y in range(fa.height):
        for x in range(fa.width):
            ca, cb = fa.get(x, y), fb.get(x, y)
            if ca != cb:
                n += 1
                if n <= args.limit:
                    print("x=%-3d y=%-3d  %s -> %s" % (x, y, ca, cb))
    if n > args.limit:
        print("... and %d more" % (n - args.limit))
    print("%d cell(s) differ of %d" % (n, fa.width * fa.height))


# -------------------------------------------------------------------- import

_KEY_POOL = ("KkbrgyocmwLDRGYOCMW"
             "0123456789"
             "abcdefhijlnpqstuvxz"
             "ABEFHIJNPQSTUVXZ")


def cmd_import(args):
    try:
        w, h, buf = png.read_rgba(args.file)
    except Exception as exc:
        die("could not read %s: %s" % (args.file, exc))

    step = max(1, args.grid)
    sw, sh = w // step, h // step
    if sw == 0 or sh == 0:
        die("--grid %d is larger than the %dx%d image" % (step, w, h))

    cells = []
    counts = {}
    for y in range(sh):
        row = []
        for x in range(sw):
            i = ((y * step + step // 2) * w + (x * step + step // 2)) * 4
            c = tuple(buf[i:i + 4])
            if c[3] < args.alpha_cutoff:
                c = (0, 0, 0, 0)
            row.append(c)
            counts[c] = counts.get(c, 0) + 1
        cells.append(row)

    opaque = [c for c in counts if c[3] > 0]
    opaque.sort(key=lambda c: -counts[c])
    if args.max_colors and len(opaque) > args.max_colors:
        keep = opaque[:args.max_colors]
        remap = {}
        for c in opaque[args.max_colors:]:
            best = min(keep, key=lambda k: (k[0] - c[0]) ** 2 + (k[1] - c[1]) ** 2
                       + (k[2] - c[2]) ** 2)
            remap[c] = best
        cells = [[remap.get(c, c) for c in row] for row in cells]
        opaque = keep

    pool = [k for k in _KEY_POOL if k != "."]
    if len(opaque) > len(pool):
        die("image has %d colors, more than the %d available keys; "
            "use --max-colors" % (len(opaque), len(pool)))
    keymap = {(0, 0, 0, 0): "."}
    for i, c in enumerate(opaque):
        keymap[c] = pool[i]

    sprite = fmt.Sprite(name=args.name or os.path.splitext(
        os.path.basename(args.file))[0])
    sprite.palette["."] = fmt.TRANSPARENT
    for c, k in keymap.items():
        if k != ".":
            sprite.palette[k] = c
    sprite.frames = [fmt.Frame("imported",
                               ["".join(keymap[c] for c in row) for row in cells])]
    sprite.meta["scale"] = 8
    path = out_path(args, args.file, "", ".pxa")
    if os.path.exists(path) and not args.force:
        die("%s already exists (pass --force)" % path)
    fmt.save(sprite, path)
    print(path)
    print("%dx%d px from %dx%d (grid %d), %d colors"
          % (sw, sh, w, h, step, len(opaque)))


# ---------------------------------------------------------------------- edit

class OpAction(argparse.Action):
    """Collect every drawing flag into one ordered list so edits apply in
    the sequence they were typed, not grouped by flag."""

    def __call__(self, parser, ns, values, option_string=None):
        if getattr(ns, "oplist", None) is None:
            ns.oplist = []
        ns.oplist.append((self.dest, values))


# Ops that change the grid's dimensions must hit every frame, otherwise the
# sprite ends up with frames of different sizes. Everything else honours
# --frame / --all.
_SHAPE_OPS = {"trim", "pad", "crop", "scale", "rot"}


def _apply_op(sprite, frame, name, value):
    """-> Frame (possibly a new object). Drawing ops mutate in place."""
    if name == "set":
        lhs, ch = split_assign(value, "--set")
        x, y = _ints(lhs, 2, "--set")
        ops.draw_point(frame, x, y, ch)
    elif name == "line":
        lhs, ch = split_assign(value, "--line")
        x0, y0, x1, y1 = _ints(lhs, 4, "--line")
        ops.draw_line(frame, x0, y0, x1, y1, ch)
    elif name in ("rect", "frect"):
        lhs, ch = split_assign(value, "--" + name)
        x, y, w, h = _ints(lhs, 4, "--" + name)
        ops.draw_rect(frame, x, y, w, h, ch, fill=(name == "frect"))
    elif name in ("ellipse", "fellipse"):
        lhs, ch = split_assign(value, "--" + name)
        x, y, w, h = _ints(lhs, 4, "--" + name)
        ops.draw_ellipse(frame, x, y, w, h, ch, fill=(name == "fellipse"))
    elif name == "fill":
        lhs, ch = split_assign(value, "--fill")
        x, y = _ints(lhs, 2, "--fill")
        ops.flood_fill(frame, x, y, ch)
    elif name == "row":
        lhs, s = split_assign(value, "--row")
        y = _ints(lhs, 1, "--row")[0]
        if len(s) != frame.width:
            die("--row %d: string is %d chars, frame is %d wide"
                % (y, len(s), frame.width))
        if not (0 <= y < frame.height):
            die("--row %d is outside 0..%d" % (y, frame.height - 1))
        frame.rows[y] = s
    elif name == "col":
        lhs, s = split_assign(value, "--col")
        x = _ints(lhs, 1, "--col")[0]
        if len(s) != frame.height:
            die("--col %d: string is %d chars, frame is %d tall"
                % (x, len(s), frame.height))
        for y, ch in enumerate(s):
            frame.set(x, y, ch)
    elif name == "replace":
        mapping = {}
        for pair in value.split(","):
            if not pair.strip():
                continue
            a, b = split_assign(pair, "--replace")
            if len(a) != 1 or len(b) != 1:
                die("--replace wants single chars, got %r" % pair)
            mapping[a] = b
        return ops.replace(frame, mapping)
    elif name == "paste":
        lhs, ref = split_assign(value, "--paste")
        x, y = _ints(lhs, 2, "--paste")
        src_path, src_frame = split_frame_ref(ref)
        src = load_sprite(src_path)
        ops.paste(frame, src.frame(src_frame), x, y)
    elif name == "shift":
        dx, dy = _ints(value, 2, "--shift")
        return ops.shift(frame, dx, dy)
    elif name == "flip_h":
        return ops.flip_h(frame)
    elif name == "flip_v":
        return ops.flip_v(frame)
    elif name == "mirror":
        if value not in ("l", "r"):
            die("--mirror wants l or r, got %r" % value)
        return ops.mirror(frame, value)
    elif name == "rot":
        return ops.rotate(frame, _ints(value, 1, "--rot")[0])
    elif name == "trim":
        return ops.trim(frame)
    elif name == "pad":
        l, r, t, b = _ints(value, 4, "--pad")
        return ops.pad(frame, l, r, t, b)
    elif name == "crop":
        x, y, w, h = _ints(value, 4, "--crop")
        return ops.crop(frame, x, y, w, h)
    elif name == "scale":
        return ops.scale_up(frame, _ints(value, 1, "--scale")[0])
    elif name == "outline":
        parts = [p.strip() for p in value.split(",")]
        ch = parts[0] or "K"
        flags = set(parts[1:])
        return ops.outline(frame, ch, diagonal=("diag" in flags),
                           inside=("in" in flags))
    elif name == "autoshade":
        parts = [p.strip() for p in value.split(",")]
        flags = [p for p in parts[1:] if p == "form" or p.startswith("depth=")]
        pos = [p for p in parts[1:] if p not in flags]
        ramp = sprite.ramp_by_name_or_keys(parts[0])
        light = pos[0] if pos and pos[0] else "tl"
        empty = pos[1] if len(pos) > 1 else "."
        depth = 1
        for f in flags:
            if f.startswith("depth="):
                depth = _ints(f[6:], 1, "depth=")[0]
        try:
            return ops.autoshade(frame, ramp, light, empty, form=("form" in flags), depth=depth)
        except PxaError as exc:
            die(str(exc))
    elif name == "selout":
        parts = [p.strip() for p in value.split(",") if p.strip()]
        key = parts[0] if parts and "=" not in parts[0] else "K"
        opts = dict(p.split("=", 1) for p in parts if "=" in p)
        flags = set(p for p in parts[1:] if "=" not in p)
        try:
            return ops.selout(frame, sprite, key, opts.get("light", "tl"), opts.get("empty", "."),
                              shadow=("shadow" in flags), key_for=lambda c: _key_for(sprite, c))
        except PxaError as exc:
            die(str(exc))
    elif name == "perfect":
        region = None
        keys = value
        if "=" in value:
            lhs, keys = split_assign(value, "--perfect")
            region = _ints(lhs, 4, "--perfect")
        ops.perfect(frame, [k for k in keys.replace(",", "") if k != "."], region)
    elif name == "dither":
        lhs, rhs = split_assign(value, "--dither")
        x, y, w, h = _ints(lhs, 4, "--dither")
        parts = [p.strip() for p in rhs.split(",")]
        ab = parts[0]
        if len(ab) != 2:
            die("--dither wants two keys after '=', e.g. 0,0,8,8=ab,grad=v")
        opts = dict(p.split("=", 1) for p in parts[1:] if "=" in p)
        try:
            ops.dither(frame, x, y, w, h, ab[0], ab[1], t=float(opts.get("t", 0.5)),
                       grad=opts.get("grad"), pattern=opts.get("pattern", "bayer4"),
                       mask=opts.get("mask"))
        except (PxaError, ValueError) as exc:
            die(str(exc))
    else:
        die("unhandled op %r" % name)
    return frame


def _key_for(sprite, rgba):
    """A palette key holding exactly `rgba`, allocating a fresh one if needed
    (selout derives outline colours that may not exist in the file yet)."""
    for k, c in sprite.palette.items():
        if tuple(c) == tuple(rgba) and k not in sprite.tokens and k != ".":
            return k
    for k in _KEY_POOL:
        if k not in sprite.palette and k != "#":
            sprite.palette[k] = tuple(rgba)
            sprite.meta.setdefault("notes", {})[k] = "selout"
            return k
    die("no free palette key left for a selective-outline colour")


def _copy_frame(name, base):
    layers = None
    if base.layers:
        layers = [fmt.Layer(L.name, L.rows, L.at, None) for L in base.layers]
    return fmt.Frame(name, list(base.rows), layers, base.dur)


def cmd_edit(args):
    sprite = load_sprite(args.file)

    for spec in args.add_frame or []:
        name, _, src = spec.partition("=")
        base = sprite.frame(src) if src else sprite.frames[-1]
        sprite.frames.append(_copy_frame(name, base))
    for name in args.del_frame or []:
        keep = [f for f in sprite.frames if f.name != name]
        if len(keep) == len(sprite.frames):
            die("no frame %r to delete" % name)
        if not keep:
            die("refusing to delete the last frame")
        sprite.frames = keep
    if args.flatten:
        for f in sprite.frames:
            f.layers = None

    oplist = getattr(args, "oplist", None) or []
    if oplist:
        if args.all:
            targets = list(range(len(sprite.frames)))
        else:
            want = sprite.frame(args.frame)
            targets = [i for i, f in enumerate(sprite.frames) if f is want]
        for name, value in oplist:
            scope = range(len(sprite.frames)) if name in _SHAPE_OPS else targets
            for i in scope:
                f = sprite.frames[i]
                if not f.layers:
                    if args.layer:
                        die("frame %r has no layers (drop --layer)" % f.name)
                    res = _apply_op(sprite, f, name, value)
                    res.dur = f.dur
                    sprite.frames[i] = res
                    continue
                if name in _SHAPE_OPS:
                    die("--%s resizes the grid; frame %r is layered, so --flatten first "
                        "or resize each layer's rows by hand" % (name.replace("_", "-"), f.name))
                if not args.layer:
                    die("frame %r is layered (%s); pass --layer NAME, or --flatten to bake it"
                        % (f.name, " ".join(L.name or "base" for L in f.layers)))
                L = f.layer("" if args.layer == "base" else args.layer)
                if L is None:
                    if args.all:
                        continue          # --all --layer: frames without it are skipped
                    die("frame %r has no layer %r" % (f.name, args.layer))
                res = _apply_op(sprite, fmt.Frame(f.name, L.rows), name, value)
                L.rows, L.ref = list(res.rows), None
                fmt.flatten(sprite, f)

    errors, warnings = fmt.validate(sprite)
    emit_warnings(warnings)
    if errors:
        for e in errors:
            sys.stderr.write("error: %s\n" % e)
        die("edit produced an invalid sprite; nothing was written")

    if args.dry:
        sys.stdout.write(fmt.dumps(sprite))
        return
    path = os.path.abspath(args.out) if args.out else os.path.abspath(args.file)
    fmt.save(sprite, path)
    print(path)
    print("%dx%d, %d frame(s), %d op(s) applied"
          % (sprite.width, sprite.height, len(sprite.frames), len(oplist)))


# ----------------------------------------------------------------------- cli

def add_colorway_args(s):
    s.add_argument("--colorway", action="append", metavar="[LABEL:]field=#hex,...",
                   help="resolve colorway tokens with these seeds (main alt skin hair "
                        "eye metal leather cloth accent horn outline) or TOKEN=#hex")
    s.add_argument("--colorways", action="store_true",
                   help="the preset outfits (preview shows them all as a strip)")


def build_parser():
    p = argparse.ArgumentParser(
        prog="pxforge", description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd")

    def add(name, help_text):
        s = sub.add_parser(name, help=help_text, description=help_text)
        return s

    s = add("new", "Create a .pxa canvas, optionally from a proportion guide.")
    s.add_argument("file")
    s.add_argument("--size", default="16x16", help="WxH (default 16x16)")
    s.add_argument("--template", default="blank",
                   help="blank | humanoid16 | humanoid32 | head16")
    s.add_argument("--palette", default=palettes.DEFAULT)
    s.add_argument("--frames", default="idle", help="comma-separated frame names")
    s.add_argument("--name", default="")
    s.add_argument("--scale", type=int, default=10)
    s.add_argument("--fps", type=int, default=8)
    s.add_argument("--force", action="store_true")
    s.set_defaults(func=cmd_new)

    s = add("preview", "Render an annotated inspection PNG (rulers + legend).")
    s.add_argument("file")
    s.add_argument("-o", "--out")
    s.add_argument("--frame", default=None)
    s.add_argument("--scale", type=int, default=0, help="0 = auto-fit")
    s.add_argument("--onion", action="store_true",
                   help="ghost the previous (red) and next (blue) frame underneath")
    s.add_argument("--frames", action="store_true", help="add a strip of every frame with its ms")
    s.add_argument("--layers", action="store_true", help="add a strip of this frame's layers")
    s.add_argument("--recolor", action="store_true", help="add a strip of every @recolor variant")
    add_colorway_args(s)
    s.add_argument("--lint", action="store_true", help="box this frame's lint findings")
    s.set_defaults(func=cmd_preview)

    s = add("render", "Render one frame to a clean PNG.")
    s.add_argument("file")
    s.add_argument("-o", "--out")
    s.add_argument("--frame", default=None)
    s.add_argument("--scale", type=int, default=0)
    s.add_argument("--bg", default=None, help="#hex background, else transparent")
    s.add_argument("--pad", type=int, default=0, help="border in output pixels")
    s.add_argument("--recolor", default=None, metavar="KIND", help="render a @recolor variant")
    add_colorway_args(s)
    s.set_defaults(func=cmd_render)

    s = add("sheet", "Render all frames into one sprite sheet PNG.")
    s.add_argument("file")
    s.add_argument("-o", "--out")
    s.add_argument("--scale", type=int, default=0)
    s.add_argument("--cols", type=int, default=0)
    s.add_argument("--gap", type=int, default=0)
    s.add_argument("--bg", default=None)
    s.add_argument("--label", action="store_true", help="caption each frame")
    s.add_argument("--onion", action="store_true", help="ghost each frame's predecessor")
    s.add_argument("--recolor", default=None, metavar="KIND", help="render a @recolor variant")
    add_colorway_args(s)
    s.set_defaults(func=cmd_sheet)

    s = add("gif", "Export frames as an animated GIF.")
    s.add_argument("file")
    s.add_argument("-o", "--out")
    s.add_argument("--scale", type=int, default=0)
    s.add_argument("--fps", type=int, default=0, help="override every frame's dur=")
    s.add_argument("--recolor", default=None, metavar="KIND", help="render a @recolor variant")
    add_colorway_args(s)
    s.add_argument("--loop", type=int, default=0, help="0 = forever")
    s.add_argument("--bg", default=None)
    s.set_defaults(func=cmd_gif)

    s = add("ascii", "Print the grid as text, optionally with coordinate rulers.")
    s.add_argument("file")
    s.add_argument("--frame", default=None)
    s.add_argument("--all", action="store_true")
    s.add_argument("-n", "--numbers", action="store_true")
    s.set_defaults(func=cmd_ascii)

    s = add("watch", "Serve a live-updating view of a sprite in the browser.")
    s.add_argument("file")
    s.add_argument("--port", type=int, default=8765)
    s.add_argument("--host", default="127.0.0.1")
    s.set_defaults(func=cmd_watch)

    s = add("validate", "Check row widths, frame sizes and palette coverage.")
    s.add_argument("file")
    s.set_defaults(func=cmd_validate)

    s = add("lint", "Report pixel-art faults (orphans, jaggies, banding, pillow shading...).")
    s.add_argument("files", nargs="+")
    s.add_argument("--skip", default="", help="comma-separated codes: " + " ".join(pxlint.CODES))
    s.add_argument("--max-colors", type=int, default=0)
    s.add_argument("--strict", action="store_true", help="exit 1 on any finding")
    s.set_defaults(func=cmd_lint)

    s = add("export", "Compile a sprite into a game module (src/render/art/*.js).")
    s.add_argument("file", nargs="?")
    s.add_argument("--js", default=None, help="output module (default src/render/art/ID.js)")
    s.add_argument("--name", default=None, help="sprite id (default @name)")
    s.add_argument("--root", default=None, help="repo root (default: found from palette.js)")
    s.add_argument("--check", action="store_true", help="exit 1 if the module is stale")
    s.add_argument("--manifest", default=None,
                   help="batch: JSON list of {src,name?,out?} (or - for stdin) -> JSON on stdout")
    s.set_defaults(func=cmd_export)

    s = add("info", "Summarize a sprite and its color usage.")
    s.add_argument("file")
    s.set_defaults(func=cmd_info)

    s = add("palettes", "List built-in palettes, or dump one.")
    s.add_argument("name", nargs="?")
    s.set_defaults(func=cmd_palettes)

    s = add("templates", "List starter templates.")
    s.set_defaults(func=cmd_templates)

    s = add("diff", "Report cells that differ between two sprites.")
    s.add_argument("a")
    s.add_argument("b")
    s.add_argument("--frame", default=None)
    s.add_argument("--limit", type=int, default=40)
    s.set_defaults(func=cmd_diff)

    s = add("import", "Convert a PNG into an editable .pxa grid.")
    s.add_argument("file")
    s.add_argument("-o", "--out")
    s.add_argument("--grid", type=int, default=1,
                   help="source pixels per art pixel (use 8 for 8x-scaled art)")
    s.add_argument("--max-colors", type=int, default=0)
    s.add_argument("--alpha-cutoff", type=int, default=128)
    s.add_argument("--name", default="")
    s.add_argument("--force", action="store_true")
    s.set_defaults(func=cmd_import)

    s = add("edit", "Apply drawing and transform ops, in the order given.")
    s.add_argument("file")
    s.add_argument("-o", "--out", help="write elsewhere (default: in place)")
    s.add_argument("--frame", default=None, help="target frame (default: first)")
    s.add_argument("--all", action="store_true", help="target every frame")
    s.add_argument("--dry", action="store_true", help="print result, don't save")
    s.add_argument("--layer", default=None, metavar="NAME",
                   help="apply ops to this layer of a layered frame ('base' = the unnamed one)")
    s.add_argument("--flatten", action="store_true", help="bake every frame's layers into one grid")
    s.add_argument("--add-frame", action="append", metavar="NAME[=COPYOF]")
    s.add_argument("--del-frame", action="append", metavar="NAME")
    draw = s.add_argument_group(
        "drawing ops (applied in order; coordinates are 0-based x,y)")
    draw.add_argument("--set", action=OpAction, metavar="X,Y=C")
    draw.add_argument("--line", action=OpAction, metavar="X0,Y0,X1,Y1=C")
    draw.add_argument("--rect", action=OpAction, metavar="X,Y,W,H=C")
    draw.add_argument("--frect", action=OpAction, metavar="X,Y,W,H=C")
    draw.add_argument("--ellipse", action=OpAction, metavar="X,Y,W,H=C")
    draw.add_argument("--fellipse", action=OpAction, metavar="X,Y,W,H=C")
    draw.add_argument("--fill", action=OpAction, metavar="X,Y=C",
                      help="flood fill")
    draw.add_argument("--row", action=OpAction, metavar="Y=STRING")
    draw.add_argument("--col", action=OpAction, metavar="X=STRING")
    draw.add_argument("--replace", action=OpAction, metavar="A=B[,C=D]")
    draw.add_argument("--paste", action=OpAction, metavar="X,Y=FILE[:FRAME]")
    shape = s.add_argument_group(
        "transforms (always apply to every frame, to keep sizes consistent)")
    shape.add_argument("--flip-h", action=OpAction, nargs=0, dest="flip_h")
    shape.add_argument("--flip-v", action=OpAction, nargs=0, dest="flip_v")
    shape.add_argument("--mirror", action=OpAction, metavar="l|r",
                       help="copy one half across the vertical axis")
    shape.add_argument("--rot", action=OpAction, metavar="N",
                       help="N quarter-turns clockwise")
    shape.add_argument("--shift", action=OpAction, metavar="DX,DY")
    shape.add_argument("--trim", action=OpAction, nargs=0)
    shape.add_argument("--pad", action=OpAction, metavar="L,R,T,B")
    shape.add_argument("--crop", action=OpAction, metavar="X,Y,W,H")
    shape.add_argument("--scale", action=OpAction, metavar="N",
                       help="upscale the grid itself, N x N per cell")
    shape.add_argument("--outline", action=OpAction, metavar="C[,diag][,in]")
    shape.add_argument("--autoshade", action=OpAction,
                       metavar="RAMP[,LIGHT[,EMPTY]][,form][,depth=N]",
                       help="e.g. 456,tl,.K or wood,tl,.K,form,depth=2 -- lighten lit "
                            "edges, darken shadowed ones; RAMP is keys or an @ramp "
                            "name; EMPTY lists chars that count as outside the form "
                            "(use .K once outlined); form shades the volume, not the rim")
    draw.add_argument("--selout", action=OpAction, metavar="K[,light=tl][,shadow]",
                      help="selective outline: lit-side K cells take a darker tone of "
                           "the fill they wrap")
    draw.add_argument("--perfect", action=OpAction, metavar="[X,Y,W,H=]KEYS",
                      help="pixel-perfect pass: drop L-corner doubles from 1px lines "
                           "of KEYS (what lint calls 'doubles')")
    draw.add_argument("--dither", action=OpAction,
                      metavar="X,Y,W,H=AB[,t=0.5][,grad=v|h|r][,pattern=bayer4|bayer2|checker][,mask=*]",
                      help="ordered dither between keys A and B over a region")
    s.set_defaults(func=cmd_edit)
    return p


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 1
    try:
        args.func(args)
    except PxaError as exc:
        die(str(exc))
    return 0


if __name__ == "__main__":
    sys.exit(main())
