"""Assemble captured gameplay frames; never modifies game sprite sources."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(sys.argv[1] if len(sys.argv)>1 else 'output/street-social/motion')
data = json.loads((root / 'report.json').read_text(encoding='utf-8'))
for name in ('music', 'market', 'repair', 'music-night', 'news'):
    frames = [s for s in data['script'] if s['id'].rsplit('-', 1)[0] == name]
    if not frames: continue
    images = [Image.open(s['image']).convert('RGB') for s in frames]
    chosen = []
    for phase in ('approach', 'request', 'reply', 'action', 'thanks', 'return'):
        choices = [(s,im) for s,im in zip(frames,images) if s['phase'] == phase]
        if choices: chosen.append(choices[len(choices)//2])
    # Two action moments make hand motion visible in a static review.
    choices = [(s,im) for s,im in zip(frames,images) if s['phase']=='action']
    chosen.extend(choices[:2])
    sheet = Image.new('RGB',(600,250*((len(chosen)+1)//2)), '#17191d')
    draw = ImageDraw.Draw(sheet)
    for i,(s,im) in enumerate(chosen):
        x,y=(i%2)*300,(i//2)*250;c=s['crop'];box=(c['x'],c['y'],c['x']+c['w'],c['y']+c['h'])
        draw.text((x+7,y+5),name+' / '+s['phase']+' / '+s['id'].rsplit('-',1)[1],fill='#e4d8b6')
        sheet.paste(im.crop(box),(x,y+25))
    sheet.save(root / (name+'-filmstrip.png'))
    palette=images[0].quantize(colors=256)
    indexed=[im.quantize(palette=palette,dither=Image.Dither.NONE) for im in images]
    indexed[0].save(root / (name + '.gif'), save_all=True, append_images=indexed[1:], duration=167, loop=0, optimize=False)
    print(name, len(frames), 'frames')
