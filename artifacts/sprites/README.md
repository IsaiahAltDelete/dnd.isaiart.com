# Item sprites

Sixteen 24×32 [pixelforge](https://isaiart.com/pixelforge/) sprites — one per item
form the generator can roll, including a portrait for each of the five
instruments so a card never says "Hand Drum" over a picture of a lute. The `.pxa` files are the source; the PNGs and the
grid strings inside `../index.html` are build artifacts.

## Semantic palette

The keys mean *roles*, not colours, which is what lets the page repaint every
sprite from whatever material and gemstone a roll produced:

| key | role | key | role |
|-----|------|-----|------|
| `1 2 3` | material dark → light | `m M` | metal (the material's trim colour) |
| `4 5 6` | gemstone dark → light | `K` | outline |
| `W` | highlight / paper | `k` | interior shadow |

`index.html` builds those eleven colours in `spritePalette()`; `_recolor_test.py`
runs the same maths offline so a palette change can be checked without a browser.

## Rebuilding

```bash
python build.py            # redraw every .pxa, outline + autoshade, write _contact.png
python _recolor_test.py    # render a spread across real material/gem pairs
```

`build.py` draws each item flat (material `2`, gem `5`, metal `M`) and hands the
finishing to pixelforge — `--outline K,diag` then `--autoshade …,tl` per ramp —
so every sprite shares one light direction. Edit the drawing code, not the grids,
unless you are fixing a single pixel.

After rebuilding, push the grids back into the page:

```bash
python embed.py            # rewrites the SPRITES object in ../index.html
```
