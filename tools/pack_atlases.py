# Packs the rendered sprites (tools/renders/...) into a few big sheets the game loads at start:
#     python tools/pack_atlases.py
# Writes assets/atlas/<group>_<team>.png and assets/atlas/atlas.json, which lists, for every texture
# key the game uses, which sheet it's on and where; plus the measured tool contact points.
import json, os
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
REN = os.path.join(ROOT, 'tools', 'renders')
OUT = os.path.join(ROOT, 'assets', 'atlas')
TEAMS = ['player', 'enemy', 'green', 'yellow']
os.makedirs(OUT, exist_ok=True)
index = {'sheets': [], 'frames': {}, 'contacts': {}}


def pack(group, files, keyfn, width=2048):
    for team in TEAMS:
        mine = sorted(f for f in files if team in f[:-4].split('_'))
        if not mine:
            continue
        x = y = shelf = 0
        spots = []
        for f in mine:  # simple shelf packing
            im = Image.open(os.path.join(REN, group, f)).convert('RGBA')
            if x + im.width > width:
                x, y, shelf = 0, y + shelf, 0
            spots.append((f, im, x, y))
            x += im.width; shelf = max(shelf, im.height)
        sheet = Image.new('RGBA', (width, y + shelf))
        name = f'{group}_{team}'
        for f, im, sx, sy in spots:
            sheet.paste(im, (sx, sy))
            index['frames'][keyfn(f)] = [name, sx, sy, im.width, im.height]
        sheet.save(os.path.join(OUT, name + '.png'), optimize=True)
        index['sheets'].append(name)


pack('units', [f for f in os.listdir(os.path.join(REN, 'units')) if f.endswith('.png')], lambda f: f[:-4])
# house_s0_player.png → b3d_house_s0_player
pack('buildings', [f for f in os.listdir(os.path.join(REN, 'buildings')) if f.endswith('.png')], lambda f: 'b3d_' + f[:-4])
cpath = os.path.join(REN, 'units', 'contacts.json')
if os.path.exists(cpath):
    index['contacts'] = json.load(open(cpath))
json.dump(index, open(os.path.join(OUT, 'atlas.json'), 'w'))
print(len(index['frames']), 'sprites on', len(index['sheets']), 'sheets')
