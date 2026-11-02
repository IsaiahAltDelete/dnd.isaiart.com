#!/usr/bin/env python
"""Self-test: `python selftest.py`. Exits non-zero on any failure.

Covers every CLI command, the drawing/transform ops, and -- most importantly --
round-trips the PNG and GIF encoders through independent decoders, since those
are hand-written and have no library to check them against. The game pipeline
half checks the palette.js colour port (against the live JS when node is on
PATH), layers, timing, recolours, export determinism, the craft ops and lint.
"""

from __future__ import print_function

import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.join(HERE, "pxforge.py")
EX = os.path.join(HERE, "examples")
sys.path.insert(0, HERE)

from pxlib import fmt, ops, png, render  # noqa: E402

FAILS = []


def check(label, ok, detail=""):
    print("%-4s %s%s" % ("ok" if ok else "FAIL", label,
                         "" if ok else "  -- " + str(detail)))
    if not ok:
        FAILS.append(label)


def run(label, args, expect_ok=True):
    p = subprocess.Popen([sys.executable, CLI] + args,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    out, err = p.communicate()
    ok = (p.returncode == 0) if expect_ok else (p.returncode != 0)
    check(label, ok, (out + err).decode("utf-8", "replace").strip()[:400])
    return out.decode("utf-8", "replace")


# ---------------------------------------------------------------- gif decoder

def lzw_decode(data, mcs):
    clear, eoi = 1 << mcs, (1 << mcs) + 1
    width = mcs + 1
    table = [(i,) for i in range(clear)] + [None, None]
    out, prev = [], None
    acc = nbits = pos = 0
    while True:
        while nbits < width:
            if pos >= len(data):
                return out
            acc |= data[pos] << nbits
            nbits += 8
            pos += 1
        code = acc & ((1 << width) - 1)
        acc >>= width
        nbits -= width
        if code == clear:
            table = [(i,) for i in range(clear)] + [None, None]
            width, prev = mcs + 1, None
            continue
        if code == eoi:
            return out
        if code < len(table) and table[code] is not None:
            entry = table[code]
        elif prev is not None:
            entry = prev + (prev[0],)
        else:
            raise ValueError("bad code %d" % code)
        out.extend(entry)
        if prev is not None:
            table.append(prev + (entry[0],))
            if len(table) == (1 << width) and width < 12:
                width += 1
        prev = entry


def parse_gif(path):
    blob = open(path, "rb").read()
    assert blob[:6] in (b"GIF89a", b"GIF87a"), "bad magic"
    w, h, flags = struct.unpack("<HHB", blob[6:11])
    pos = 13
    gct_size = 3 * (1 << ((flags & 7) + 1))
    gct = blob[pos:pos + gct_size]
    pos += gct_size
    frames = []
    while pos < len(blob) and blob[pos] != 0x3B:
        if blob[pos] == 0x21:
            pos += 2
            while blob[pos]:
                pos += 1 + blob[pos]
            pos += 1
        elif blob[pos] == 0x2C:
            fw, fh = struct.unpack("<HH", blob[pos + 5:pos + 9])
            assert not (blob[pos + 9] & 0x80), "unexpected local color table"
            pos += 10
            mcs = blob[pos]
            pos += 1
            sub = bytearray()
            while blob[pos]:
                n = blob[pos]
                sub += blob[pos + 1:pos + 1 + n]
                pos += 1 + n
            pos += 1
            idx = lzw_decode(bytes(sub), mcs)
            assert len(idx) == fw * fh, "decoded %d px, want %d" % (len(idx), fw * fh)
            frames.append((fw, fh, idx))
        else:
            raise ValueError("unexpected block 0x%02x" % blob[pos])
    return w, h, gct, frames


def gif_matches(gif_path, pxa_path, scale):
    _w, _h, gct, frames = parse_gif(gif_path)
    sprite = fmt.load(pxa_path)
    if len(frames) != len(sprite.frames):
        return "frame count %d != %d" % (len(frames), len(sprite.frames))
    for (fw, fh, idx), sf in zip(frames, sprite.frames):
        canvas = render.render_png(sprite, sf.name, scale=scale)
        if (fw, fh) != (canvas.w, canvas.h):
            return "size %dx%d != %dx%d" % (fw, fh, canvas.w, canvas.h)
        for p in range(fw * fh):
            j = p * 4
            if canvas.buf[j + 3] < 128:
                if idx[p] != 0:
                    return "opaque where transparent expected at %d" % p
                continue
            i = idx[p] * 3
            if idx[p] == 0 or (gct[i], gct[i + 1], gct[i + 2]) != \
                    tuple(canvas.buf[j:j + 3]):
                return "color mismatch at px %d" % p
    return None


def gif_delays(path):
    """Per-frame delays (1/100 s) from each Graphic Control Extension."""
    blob = open(path, "rb").read()
    out, pos = [], 0
    while True:
        pos = blob.find(b"\x21\xF9\x04", pos)
        if pos < 0:
            return out
        out.append(struct.unpack("<H", blob[pos + 4:pos + 6])[0])
        pos += 8


def write(path, text):
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


# A layered, token-coloured, ramped, timed sprite exercising the whole format.
STACK = """@name test-stack
@size 6x4
# header comment that edit must keep
@ramp wood #8a5a34 3 abc
@palette
K #101010
m MAIN
@anchor 3,4
@point top 3,0
@anim sway f0 f1 loop=0

@frame f0 dur=100
KKKKKK
KaaabK
KaaabK
KKKKKK
@layer gem at=2,1
mm
@frame f1 dur=60
KKKKKK
KcbbaK
KcbbaK
KKKKKK
@layer gem
"""


def pipeline_tests(tmp):
    from pxlib import color, export, lint as pxlint

    # -- the colour port must equal palette.js exactly --------------------------
    check("ramp port: RAMPS.fire", color.ramp("#f07a2a", 5, {"spread": 0.64, "shift": 28})
          == ["#671015", "#b52f13", "#f07a2a", "#f1c67a", "#f6f0c7"])
    check("ramp port: grey stone", color.ramp("#8a8a88", 5)
          == ["#3e424f", "#62656e", "#8a8a88", "#afada5", "#d2cec5"])
    check("ramp port: 7 steps", color.ramp("#f07a2a", 7, {"spread": 0.8, "shift": 30})
          == ["#440a10", "#821810", "#c43c12", "#f07a2a", "#f2b86c", "#f5e2ad", "#fcfae9"])
    check("outlineFor port", color.outline_for("#3a7a44") == color.hsl_to_hex(
        *[v for v in (color.hue_toward(color.hex_to_hsl("#3a7a44")[0], color.COOL, 18),
                      min(1, color.hex_to_hsl("#3a7a44")[1] * 0.9 + 0.1),
                      max(0.05, color.hex_to_hsl("#3a7a44")[2] * 0.32))]))
    check("makeColorway port", color.make_colorway({"main": "#7a3030"})["MAIN_D"] == "#552222")
    game = color.game_ramps()
    check("palette.js RAMPS parsed", len(game) > 40 and game["fire"]["colors"][0] == "#671015",
          "%d ramps" % len(game))
    node = shutil.which("node") or os.environ.get("NODE")
    pal = color.find_palette_js()
    if node and pal:
        js = ("import('%s').then(m=>console.log(JSON.stringify([m.ramp('#5a8a3a',5),"
              "m.ramp('#c8b894',4,{spread:0.42}),m.outlineFor('#a8322e')])))"
              % ("file:///" + pal.replace("\\", "/")))
        p = subprocess.run([node, "--input-type=module", "-e", js], capture_output=True, text=True)
        if p.returncode == 0:
            got = json.loads(p.stdout)
            check("ramp port == live palette.js (node)", got == [
                color.ramp("#5a8a3a", 5), color.ramp("#c8b894", 4, {"spread": 0.42}),
                color.outline_for("#a8322e")], got)

    # -- format: ramps, tokens, layers, timing, anims, points --------------------
    sp = os.path.join(tmp, "stack.pxa")
    write(sp, STACK)
    s = fmt.load(sp)
    check("@ramp creates keys", [fmt.color_hex(s.palette[k]) for k in "abc"]
          == color.ramp("#8a5a34", 3))
    check("token kept as token", s.tokens.get("m") == "MAIN")
    check("layer flattened on top", s.frame("f0").rows[1] == "KammbK")
    check("layer with no rows repeats", s.frame("f1").rows[1] == "KcmmaK")
    check("dur= parsed", [f.dur for f in s.frames] == [100, 60])
    check("@anchor/@point", s.anchor == (3, 4) and s.points["top"] == (3, 0))
    errs, _ = fmt.validate(s)
    check("stack validates", not errs, errs)
    again = fmt.loads(fmt.dumps(s))
    check("dumps round-trips layers", [f.rows for f in again.frames] == [f.rows for f in s.frames]
          and again.frame("f1").layers[1].ref == "" and again.tokens == s.tokens)
    check("dumps keeps comments", "# header comment that edit must keep" in fmt.dumps(s))
    try:
        fmt.loads("@name x\n@ramp w #8a5a34 3\n@grid\n.\n")
        check("@ramp without keys rejected", False)
    except fmt.PxaError:
        check("@ramp without keys rejected", True)
    try:
        fmt.loads("@name x\n@grid\nab\n@layer q\n")
        check("dangling empty layer rejected", False)
    except fmt.PxaError:
        check("dangling empty layer rejected", True)

    # -- timing: uneven durations expand to the authored tempo --------------------
    a = export.anims_for(s)["sway"]
    check("uneven dur expands by gcd", a["frames"] == ["f0"] * 5 + ["f1"] * 3 and a["fps"] == 50
          and a["loop"] is False and a["ms"] == 160, a)
    run("gif honours dur=", ["gif", sp, "--scale", "2", "-o", os.path.join(tmp, "stack.gif")])
    check("gif per-frame delays", gif_delays(os.path.join(tmp, "stack.gif")) == [10, 6])

    # -- export: shape, tokens verbatim, determinism, --check ---------------------
    out_rel, text, report = export.compile_sprite(s, "assets/pixel/test/stack.pxa")
    check("export default path", out_rel == "src/render/art/test-stack.js")
    check("export registers sprite", "defineSprite('test-stack', TEST_STACK);" in text
          and "import { defineSprite } from '../sprites.js';" in text)
    check("export keeps tokens", "m: 'MAIN'" in text)
    check("export deterministic", export.compile_sprite(fmt.load(sp), "assets/pixel/test/stack.pxa")[1] == text)
    check("export header names module", text.startswith("// render/art/test-stack.js — generated"))
    js = os.path.join(tmp, "src", "render", "art", "test-stack.js")
    run("export --js", ["export", sp, "--js", js, "--root", tmp])
    run("export --check fresh", ["export", sp, "--js", js, "--root", tmp, "--check"])
    write(js, "stale")
    run("export --check stale fails", ["export", sp, "--js", js, "--root", tmp, "--check"],
        expect_ok=False)
    man = subprocess.run([sys.executable, CLI, "export", "--manifest", "-", "--root", tmp],
                         input=json.dumps([{"src": sp}, {"src": os.path.join(tmp, "nope.pxa")}]),
                         capture_output=True, text=True)
    res = json.loads(man.stdout or "[]")
    check("export --manifest batch", len(res) == 2 and res[0].get("id") == "test-stack"
          and "defineSprite('test-stack'" in res[0].get("text", "") and "error" in res[1],
          man.stderr[:300])
    fr = fmt.loads("@name legacy\n@export frames LEGACY src/x.js\n@use gb\n@frame a\n01\n@frame b\n10\n")
    _, legacy, _ = export.compile_sprite(fr, "assets/pixel/x.pxa")
    check("frames export shape", legacy == "// Generated from assets/pixel/x.pxa; retain that file "
          "as the pixel source.\nexport const LEGACY = {\n  \"a\": [\n    \"01\"\n  ],\n  \"b\": [\n"
          "    \"10\"\n  ]\n};\n")
    satchel = os.path.join(HERE, "..", "..", "assets", "pixel", "satchel.pxa")
    art = os.path.join(HERE, "..", "..", "src", "render", "satchel-art.js")
    if os.path.exists(satchel) and os.path.exists(art):
        _, t, _ = export.compile_sprite(fmt.load(satchel), "assets/pixel/satchel.pxa")
        check("satchel byte-identical", t == open(art, encoding="utf-8", newline="").read())

    # -- recolor variants -----------------------------------------------------------
    rc = fmt.loads("@name r\n@ramp glow fire 5 01234\n@recolor glow magic,teal=#2a9a9a\n@grid\n01234\n")
    v = rc.variants()
    check("recolor magic + custom", "necrotic" in v and "teal" in v
          and v["cold"]["0"] == game["cold"]["colors"][0]
          and list(v["teal"].values()) == color.ramp("#2a9a9a", 5))
    _, rtext, _ = export.compile_sprite(rc, "assets/pixel/r.pxa")
    check("recolor registers variants", "defineSprite(`r-${kind}`" in rtext)

    # -- craft ops ----------------------------------------------------------------
    so = fmt.loads("@name so\n@ramp w #8a5a34 5 abcde\n@palette\nK #000000\n"
                   "@grid\n.KKK.\nKeeeK\nKeeeK\n.KKK.\n")
    out = ops.selout(so.frames[0], so, "K", "tl")
    check("selout tints the lit side", out.rows[0] == ".ccc." and out.rows[1][0] == "c")
    check("selout keeps the shadow side", out.rows[3] == ".KKK." and out.rows[1][4] == "K")
    d = ops.dither(fmt.Frame("d", ["aaaa", "aaaa", "aaaa", "aaaa"]), 0, 0, 4, 4, "a", "b", t=0.5)
    check("dither bayer 50%", d.rows == ["baba", "abab", "baba", "abab"], d.rows)
    g = ops.dither(fmt.Frame("g", ["aaaa"] * 8), 0, 0, 4, 8, "a", "b", grad="v")
    check("dither gradient", g.rows[0].count("b") < g.rows[-1].count("b"), g.rows)
    blob = fmt.Frame("b", ["....." * 2] + [".." + "3" * 6 + ".."] * 6 + ["....." * 2])
    sh = ops.autoshade(blob, "12345", "tl", ".", form=True, depth=2)
    lit = [ch for ch in sh.rows[1][2:5]]
    dark = [ch for ch in sh.rows[6][5:8]]
    check("autoshade form: top-left lighter", max(lit) > "3" and min(dark) < "3", sh.rows)
    pf = fmt.Frame("p", ["K...", "KK..", ".KK.", "..K."])
    ops.perfect(pf, "K")
    check("perfect drops L-corners", pf.rows == ["K...", ".K..", "..K.", "..K."], pf.rows)

    # -- lint ---------------------------------------------------------------------
    def codes(text):
        return set(i.code for i in pxlint.lint(fmt.loads(text)))
    check("lint: stray", "stray" in codes("@name l\n@use gb\n@grid\n0...\n....\n..33\n..33\n"))
    check("lint: doubles", "doubles" in codes(
        "@name l\n@use gb\n@grid\n0.....\n00....\n.00...\n..00..\n...00.\n....0.\n"))
    check("lint: orphan", "orphan" in codes(
        "@name l\n@palette\na #808080\nb #848484\n@grid\naaa\naba\naaa\n"))
    check("lint: pillow", "pillow" in codes(
        "@name l\n@ramp s #8a8a88 5 12345\n@grid\n" + "\n".join(
            ["1111111", "1333331", "1355531", "1355531", "1355531", "1333331", "1111111"]) + "\n"))
    check("lint: light from lower right", "light" in codes(
        "@name l\n@ramp s #8a8a88 5 12345\n@grid\n" + "\n".join(
            ["1111111", "1122222", "1222333", "1223334", "1233344", "1233444", "1234445"]) + "\n"))
    check("lint: banding", "banding" in codes(
        "@name l\n@ramp s #8a8a88 5 12345\n@grid\n12345\n12345\n12345\n12345\n"))
    check("lint: dupes", "dupes" in codes("@name l\n@palette\na #808080\nb #828181\n@grid\naabb\n"))
    check("lint: jaggy", "jaggy" in codes("@name l\n@use gb\n@grid\n" + "\n".join(
        ["0" * n + "." * (12 - n) for n in (1, 2, 3, 4, 4, 4, 5, 6, 7, 8, 9, 10)]) + "\n"))
    check("lint: skip honoured", "stray" not in codes(
        "@name l\n@use gb\n@lint skip=stray\n@grid\n0...\n....\n"))
    clean = [i for i in pxlint.lint(fmt.load(os.path.join(EX, "knight.pxa")))
             if i.code in ("stray", "banding", "pillow")]
    check("lint quiet on the knight example", not clean, [str(i) for i in clean][:3])
    run("lint cli", ["lint", sp])
    write(os.path.join(tmp, "lintme.pxa"), "@name l\n@use gb\n@grid\n0...\n....\n")
    run("lint --strict fails on findings", ["lint", "--strict", os.path.join(tmp, "lintme.pxa")],
        expect_ok=False)

    # -- previews -----------------------------------------------------------------
    run("preview --onion --layers --frames", ["preview", sp, "--frame", "f0", "--onion", "--layers",
                                              "--frames", "-o", os.path.join(tmp, "pv.png")])
    run("preview --colorways --lint", ["preview", sp, "--colorways", "--colorway",
                                       "blue:main=#3a5a9a", "--lint", "-o", os.path.join(tmp, "pc.png")])
    rp = os.path.join(tmp, "rc.pxa")
    write(rp, "@name r\n@ramp glow fire 5 01234\n@recolor glow magic\n@grid\n01234\n")
    run("preview --recolor", ["preview", rp, "--recolor", "-o", os.path.join(tmp, "pr.png")])
    run("sheet --onion --recolor", ["sheet", rp, "--onion", "--recolor", "cold",
                                    "-o", os.path.join(tmp, "ps.png")])
    for name in ("pv", "pc", "pr", "ps"):
        try:
            w, h, buf = png.read_rgba(os.path.join(tmp, name + ".png"))
            check("png decodes (%s)" % name, len(buf) == w * h * 4)
        except Exception as exc:
            check("png decodes (%s)" % name, False, exc)
    cw = color.parse_colorway_spec("main=#3a5a9a")
    _, _, px_default = fmt.rasterize(s, "f0")
    _, _, px_blue = fmt.rasterize(s, "f0", colorway=cw)
    check("colorway recolours tokens", px_default != px_blue and bytes(px_blue[32:35]) == b"\x3a\x5a\x9a")  # the gem, row 1 x 2

    # -- edit on layers, comments survive -------------------------------------------
    run("edit refuses a layered frame without --layer", ["edit", sp, "--set", "0,0=a"], expect_ok=False)
    run("edit --layer", ["edit", sp, "--frame", "f0", "--layer", "gem", "--set", "0,0=a"])
    s2 = fmt.load(sp)
    check("edit --layer lands in the layer", s2.frame("f0").rows[1] == "KaambK"
          and s2.frame("f0").layer("gem").rows == ["am"])
    check("edit keeps comments", "# header comment that edit must keep" in open(sp, encoding="utf-8").read())
    run("edit --selout/--dither/--perfect", ["edit", sp, "--flatten", "--all", "--selout", "K",
                                             "--dither", "1,1,4,2=ab", "--perfect", "K"])
    check("edit --flatten drops layers", all(f.layers is None for f in fmt.load(sp).frames))


def main():
    tmp = tempfile.mkdtemp(prefix="pxforge-selftest-")
    a = os.path.join(tmp, "a.pxa")
    try:
        run("palettes", ["palettes"])
        run("palettes NAME", ["palettes", "pico8"])
        run("templates", ["templates"])
        run("new", ["new", a, "--size", "16x16", "--template", "humanoid16",
                    "--frames", "idle,walk", "--force"])
        run("validate", ["validate", a])
        run("info", ["info", a])
        run("ascii -n --all", ["ascii", a, "-n", "--all"])
        run("edit draw", ["edit", a, "--replace", "s=5", "--frect", "2,2,4,4=8",
                          "--rect", "9,9,5,5=m", "--line", "0,0,15,15=W",
                          "--ellipse", "3,10,6,5=h", "--fellipse", "10,2,5,5=2",
                          "--set", "0,15=e", "--fill", "15,0=6"])
        run("edit row/col", ["edit", a, "--frame", "walk",
                             "--row", "7=" + "K" * 16, "--col", "0=" + "W" * 16])
        run("edit transforms", ["edit", a, "--all", "--outline", "K,diag",
                                "--autoshade", "456,tl,.K", "--mirror", "l",
                                "--flip-h", "--flip-v", "--shift", "1,1"])
        run("edit resize", ["edit", a, "-o", os.path.join(tmp, "c.pxa"),
                            "--pad", "2,2,2,2", "--crop", "1,1,18,18",
                            "--rot", "1", "--trim", "--scale", "2"])
        run("edit --dry", ["edit", a, "--dry", "--replace", "5=4"])
        run("add/del frame", ["edit", a, "--add-frame", "jump=idle"])
        run("del frame", ["edit", a, "--del-frame", "jump"])
        run("paste (drive colon)",
            ["edit", a, "--paste", "2,2=%s:idle" % os.path.join(EX, "knight.pxa")])
        run("render", ["render", a, "--scale", "5", "--pad", "3", "--bg", "#202030"])
        run("render --frame", ["render", a, "--frame", "walk",
                               "-o", os.path.join(tmp, "walk.png")])
        run("preview", ["preview", a, "--scale", "9"])
        run("preview auto-scale", ["preview", os.path.join(EX, "walk.pxa"),
                                   "--frame", "step_r",
                                   "-o", os.path.join(tmp, "p2.png")])
        run("sheet", ["sheet", a, "--scale", "6", "--cols", "1", "--gap", "3",
                      "--label"])
        run("gif", ["gif", a, "--scale", "4", "--fps", "12"])
        run("gif single frame", ["gif", os.path.join(EX, "mage.pxa"),
                                 "-o", os.path.join(tmp, "mage.gif")])
        run("import", ["import", os.path.join(tmp, "a.png"), "--grid", "5",
                       "-o", os.path.join(tmp, "back.pxa"), "--force"])
        run("import --max-colors", ["import", os.path.join(tmp, "a.png"),
                                    "--grid", "5", "--max-colors", "4",
                                    "-o", os.path.join(tmp, "b4.pxa"), "--force"])
        run("diff", ["diff", a, a])

        # bundled examples must always be valid
        for name in sorted(os.listdir(EX)):
            if name.endswith(".pxa"):
                run("example %s" % name, ["validate", os.path.join(EX, name)])

        # invalid input must fail loudly rather than emit art
        run("reject missing file", ["validate", os.path.join(tmp, "nope.pxa")],
            expect_ok=False)
        ragged = os.path.join(tmp, "ragged.pxa")
        open(ragged, "w").write("@name x\n@grid\n..KK\n..K\n")
        run("reject ragged rows", ["render", ragged], expect_ok=False)
        run("reject short --row", ["edit", a, "--row", "0=short"],
            expect_ok=False)
        run("reject 1-char ramp", ["edit", a, "--autoshade", "Z"],
            expect_ok=False)
        undef = os.path.join(tmp, "undef.pxa")
        open(undef, "w").write("@name x\n@use gb\n@grid\n01Z3\n0123\n")
        run("reject undefined key", ["render", undef], expect_ok=False)

        # BOM tolerance (PowerShell `Out-File -Encoding utf8`)
        bom = os.path.join(tmp, "bom.pxa")
        with open(bom, "wb") as fh:
            fh.write(b"\xef\xbb\xbf@name b\n@use gb\n@grid\n0123\n3210\n")
        run("accept UTF-8 BOM", ["validate", bom])

        # encoders vs independent decoders
        for label, path in (("a.png", os.path.join(tmp, "a.png")),
                            ("preview", os.path.join(tmp, "a.preview.png")),
                            ("sheet", os.path.join(tmp, "a.sheet.png"))):
            try:
                w, h, buf = png.read_rgba(path)
                check("png round-trip %s" % label, len(buf) == w * h * 4)
            except Exception as exc:
                check("png round-trip %s" % label, False, exc)

        for label, g, p, sc in (("multi-frame", os.path.join(tmp, "a.gif"), a, 4),
                                ("single-frame", os.path.join(tmp, "mage.gif"),
                                 os.path.join(EX, "mage.pxa"), 12)):
            try:
                check("gif decodes exactly (%s)" % label,
                      gif_matches(g, p, sc) is None, gif_matches(g, p, sc))
            except Exception as exc:
                check("gif decodes exactly (%s)" % label, False, exc)

        # geometry invariants
        f = fmt.Frame("t", ["abc", "def", "ghi"])
        check("flip_h involutive", ops.flip_h(ops.flip_h(f)).rows == f.rows)
        check("flip_v involutive", ops.flip_v(ops.flip_v(f)).rows == f.rows)
        check("rot 4x identity", ops.rotate(f, 4).rows == f.rows)
        check("rot 1 turns rows", ops.rotate(f, 1).rows == ["gda", "heb", "ifc"])
        check("mirror l symmetric",
              ops.mirror(fmt.Frame("t", ["ab.c", "d.ef"]), "l").rows
              == ["abba", "d..d"])
        check("scale_up 2x", ops.scale_up(fmt.Frame("t", ["ab"]), 2).rows
              == ["aabb", "aabb"])
        check("trim tightens",
              ops.trim(fmt.Frame("t", ["....", ".xx.", "...."])).rows == ["xx"])
        check("pad grows",
              ops.pad(fmt.Frame("t", ["x"]), 1, 1, 1, 1).rows
              == ["...", ".x.", "..."])
        check("outline surrounds",
              ops.outline(fmt.Frame("t", ["...", ".x.", "..."]), "K").rows
              == [".K.", "KxK", ".K."])

        # the game pipeline: colour port, layers, timing, export, craft ops, lint
        pipeline_tests(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("")
    if FAILS:
        print("%d FAILURE(S): %s" % (len(FAILS), ", ".join(FAILS)))
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
