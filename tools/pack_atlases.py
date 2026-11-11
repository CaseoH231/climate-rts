# Packs the rendered sprites (tools/renders/...) into a few big sheets the game loads at start:
#     python tools/pack_atlases.py
# Writes assets/atlas/<group>_<team>.webp and assets/atlas/atlas.json, which lists, for every texture
# key the game uses, which sheet it's on and where; plus the measured tool contact points.
import json, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REN = os.path.join(ROOT, 'tools', 'renders')
OUT = os.path.join(ROOT, 'assets', 'atlas')
TEAMS = ['player', 'enemy', 'green', 'yellow']
os.makedirs(OUT, exist_ok=True)
for old in os.listdir(OUT):  # start fresh: sheets get renamed as the art grows
    if old.endswith('.png') or old.endswith('.webp'):
        os.remove(os.path.join(OUT, old))
index = {'sheets': [], 'frames': {}, 'contacts': {}}


def pack(group, files, keyfn, width=2048, split=lambda f: ''):
    # one sheet per team (and per age for buildings), so no single image gets too big for a graphics card
    parts = sorted({split(f) for f in files})
    for part in parts:
        for team in TEAMS:
            mine = sorted(f for f in files if team in f[:-4].split('_') and split(f) == part)
            if not mine:
                continue
            pack_one(group + part, group, mine, keyfn, width, team)


def pack_one(name0, group, mine, keyfn, width, team):
    if True:
        x = y = shelf = 0
        spots = []
        for f in mine:  # simple shelf packing
            im = Image.open(os.path.join(REN, group, f)).convert('RGBA')
            if x + im.width > width:
                x, y, shelf = 0, y + shelf, 0
            spots.append((f, im, x, y))
            x += im.width; shelf = max(shelf, im.height)
        sheet = Image.new('RGBA', (width, y + shelf))
        name = f'{name0}_{team}'
        for f, im, sx, sy in spots:
            sheet.paste(im, (sx, sy))
            index['frames'][keyfn(f)] = [name, sx, sy, im.width, im.height]
        # WebP: about a sixth of the size of PNG for these, with no visible difference
        sheet.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6)
        index['sheets'].append(name)


pack('units', [f for f in os.listdir(os.path.join(REN, 'units')) if f.endswith('.png')], lambda f: f[:-4])
# house_s0_player.png → b3d_house_s0_player
import re
pack('buildings', [f for f in os.listdir(os.path.join(REN, 'buildings')) if f.endswith('.png')], lambda f: 'b3d_' + f[:-4],
     split=lambda f: '_' + re.search(r'_(s\d)_', f).group(1))
ppath = os.path.join(REN, 'buildings', 'points.json')
if os.path.exists(ppath):
    index['points'] = json.load(open(ppath))  # where smoke / steam / spray comes out of rendered buildings
cpath = os.path.join(REN, 'units', 'contacts.json')
if os.path.exists(cpath):
    index['contacts'] = json.load(open(cpath))
json.dump(index, open(os.path.join(OUT, 'atlas.json'), 'w'))
print(len(index['frames']), 'sprites on', len(index['sheets']), 'sheets')
