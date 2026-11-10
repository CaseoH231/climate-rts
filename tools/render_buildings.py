# Renders buildings as 3D models into sprites that drop straight into the game (the way AoE2's art
# was made). Run with Blender's Python module:
#     python tools/render_buildings.py [type ...]
# Writes assets/buildings/<type>_s<style>_<team>.png and assets/buildings/manifest.json.
# The camera matches the game's projection exactly: screen x = 32·(x − y), screen y = 16·(x + y) − z
# (x, y in tiles; z in game pixels), so a building's footprint lands where the game expects it.
import bpy, bmesh, math, json, os, sys
from mathutils import Vector

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'buildings')
ART_RES, ART_TOP, TILE = 2, 110, 32
TEAMS = {'player': 0x3f6296, 'enemy': 0x93382f, 'green': 0x3b8044, 'yellow': 0xb58c22}
Z_SQUASH = 32 / (math.sin(math.radians(60)) * 32 * math.sqrt(2))  # the game draws heights a little shorter than a true camera would


def srgb(hexv):
    c = [((hexv >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


# ---------- materials ----------
def principled(name, rgb, rough=0.85):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m, m.node_tree, b


def noisy(name, rgb, var=0.15, scale=30, bump=0.2, rough=0.85):
    m, nt, b = principled(name, rgb, rough)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = 10
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*[c * (1 - var) for c in rgb], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, c * (1 + var)) for c in rgb], 1)
    nt.links.new(n.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
    nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def bricks(name, c1, c2, mortar, scale=6, row=0.25, width=0.5, bump=0.4, rough=0.9):
    """Stonework or roof tiles: Blender's brick pattern, varied per brick, with mortar grooves."""
    m, nt, b = principled(name, c1, rough)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    br = nt.nodes.new('ShaderNodeTexBrick')
    br.inputs['Color1'].default_value = (*c1, 1); br.inputs['Color2'].default_value = (*c2, 1)
    br.inputs['Mortar'].default_value = (*mortar, 1); br.inputs['Scale'].default_value = scale
    br.inputs['Mortar Size'].default_value = 0.025; br.inputs['Brick Width'].default_value = width
    br.inputs['Row Height'].default_value = row; br.offset = 0.5
    nt.links.new(tc.outputs['Object'], br.inputs['Vector'])
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 40
    nt.links.new(tc.outputs['Object'], n.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 0.35
    nt.links.new(br.outputs['Color'], mix.inputs['A']); nt.links.new(n.outputs['Color'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
    nt.links.new(br.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def wood(name, rgb, scale=8):
    m, nt, b = principled(name, rgb, 0.8)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    w = nt.nodes.new('ShaderNodeTexWave'); w.inputs['Scale'].default_value = scale; w.inputs['Distortion'].default_value = 2.5
    w.wave_type = 'BANDS'; w.bands_direction = 'Z'
    nt.links.new(tc.outputs['Object'], w.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*[c * 0.7 for c in rgb], 1); ramp.color_ramp.elements[1].color = (*[min(1, c * 1.25) for c in rgb], 1)
    nt.links.new(w.outputs['Fac'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m


def make_materials(team_hex):
    lin = lambda h: srgb(h)
    return {
        'plaster': noisy('plaster', lin(0xc9b998), var=0.12, scale=18, bump=0.15),
        'timber': wood('timber', lin(0x4a3220)),
        'plank': wood('plank', lin(0x6e5236), scale=22),
        'stone': bricks('stone', lin(0x8e877a), lin(0x77706a), lin(0x4a453e), scale=5, row=0.3, width=0.55),
        'roof': bricks('roof', lin(0x8a4630), lin(0x6e3626), lin(0x3a1c14), scale=9, row=0.18, width=0.3, bump=0.6),
        'thatch': noisy('thatch', lin(0xa88a50), var=0.3, scale=60, bump=0.6, rough=1.0),
        'window': principled('window', lin(0xe8b860), 0.3)[0],
        'dark': principled('dark', lin(0x1e1812), 0.9)[0],
        'team': noisy('team', lin(team_hex), var=0.1, scale=20, bump=0.05, rough=0.7),
        'metal': principled('metal', lin(0x6e7276), 0.45)[0],
        'coal': noisy('coal', lin(0x1c1a18), var=0.4, scale=50, bump=0.8, rough=0.6),
        'rock': noisy('rock', lin(0x8a8476), var=0.25, scale=12, bump=0.6),
        'log': wood('log', lin(0x6a4a2c), scale=2),
        'logend': principled('logend', lin(0xc8a070), 0.9)[0],
        'grain': noisy('grain', lin(0xc9a443), var=0.25, scale=80, bump=0.4),
    }


# ---------- modelling helpers (x, y in tiles; z in tiles too, squashed afterwards) ----------
ROOT_OBJ = None


def link(o, m):
    if m:
        o.data.materials.append(m)
    o.parent = ROOT_OBJ
    return o


def box(c, s, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=c, rotation=rot)
    o = bpy.context.object; o.scale = (s[0] / 2, s[1] / 2, s[2] / 2)
    return link(o, m)


def cyl(c, r, d, m, rot=(0, 0, 0), v=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=d, location=c, rotation=rot)
    return link(bpy.context.object, m)


def cone(c, r1, r2, d, m, v=24):
    bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r1, radius2=r2, depth=d, location=c)
    return link(bpy.context.object, m)


def mesh(verts, faces, m):
    me = bpy.data.meshes.new('m'); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new('o', me); bpy.context.collection.objects.link(o)
    return link(o, m)


def gable_roof(x0, x1, y0, y1, z, rise, m, over=0.18, thick=0.07, along='x'):
    """A pitched roof over the rectangle, ridge running along x (or y), with eaves overhang and thickness."""
    if along == 'x':
        xa, xb, ym = x0 - over, x1 + over, (y0 + y1) / 2
        e0, e1 = y0 - over, y1 + over
        drop = over * rise / ((y1 - y0) / 2)
        for ye in (e0, e1):
            v = [(xa, ye, z - drop), (xb, ye, z - drop), (xb, ym, z + rise), (xa, ym, z + rise)]
            v += [(p[0], p[1], p[2] + thick) for p in v]
            mesh(v, [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], m)
        # gable walls (triangles) under the roof ends
        return ym
    else:
        ya, yb, xm = y0 - over, y1 + over, (x0 + x1) / 2
        e0, e1 = x0 - over, x1 + over
        drop = over * rise / ((x1 - x0) / 2)
        for xe in (e0, e1):
            v = [(xe, ya, z - drop), (xe, yb, z - drop), (xm, yb, z + rise), (xm, ya, z + rise)]
            v += [(p[0], p[1], p[2] + thick) for p in v]
            mesh(v, [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], m)
        return xm


def gable_end(x, y0, y1, z, rise, m, along='x'):
    if along == 'x':
        return mesh([(x, y0, z), (x, y1, z), (x, (y0 + y1) / 2, z + rise)], [(0, 1, 2)], m)
    return mesh([(y0, x, z), (y1, x, z), ((y0 + y1) / 2, x, z + rise)], [(0, 1, 2)], m)


def log_pile(x, y, z, n_rows, length, M, axis='x'):
    for row in range(n_rows):
        for k in range(n_rows - row + 1):
            off = (k - (n_rows - row) / 2) * 0.13
            pos = (x, y + off, z + 0.065 + row * 0.11) if axis == 'x' else (x + off, y, z + 0.065 + row * 0.11)
            rot = (0, math.pi / 2, 0) if axis == 'x' else (math.pi / 2, 0, 0)
            cyl(pos, 0.065, length, M['log'], rot=rot, v=10)


# ---------- buildings (footprint: x ∈ [0, w], game y ∈ [0, h] → Blender y ∈ [-h, 0]) ----------
def house(M):
    W, D = 2.0, 2.0
    x0, x1, y0, y1 = 0.3, 1.7, -1.75, -0.25
    H = 0.62
    box(((x0 + x1) / 2, (y0 + y1) / 2, 0.06), (x1 - x0 + 0.08, y1 - y0 + 0.08, 0.12), M['stone'])
    box(((x0 + x1) / 2, (y0 + y1) / 2, 0.12 + H / 2), (x1 - x0, y1 - y0, H), M['plaster'])
    zt = 0.12 + H
    # timber frame
    for x in (x0, (x0 + x1) / 2, x1):
        for y in (y0, y1):
            box((x, y, 0.12 + H / 2), (0.05, 0.05, H), M['timber'])
    for y in (y0, (y0 + y1) / 2, y1):
        for x in (x0, x1):
            box((x, y, 0.12 + H / 2), (0.05, 0.05, H), M['timber'])
    for y in (y0, y1):
        box(((x0 + x1) / 2, y, zt - 0.02), (x1 - x0 + 0.04, 0.055, 0.05), M['timber'])
        box(((x0 + x1) / 2, y, 0.12 + H * 0.5), (x1 - x0, 0.052, 0.035), M['timber'])
        for sx, xm in ((-1, x0 + (x1 - x0) * 0.25), (1, x0 + (x1 - x0) * 0.75)):
            box((xm, y, 0.12 + H * 0.25), (0.035, 0.052, H * 0.5), M['timber'], rot=(0, sx * 0.75, 0))
    for x in (x0, x1):
        box((x, (y0 + y1) / 2, zt - 0.02), (0.055, y1 - y0 + 0.04, 0.05), M['timber'])
        box((x, (y0 + y1) / 2, 0.12 + H * 0.5), (0.052, y1 - y0, 0.035), M['timber'])
    # windows with frames, a door, a team-coloured banner
    for x in (x0 + 0.35, x1 - 0.35):
        box((x, y1 + 0.02, 0.12 + H * 0.72), (0.2, 0.03, 0.16), M['window'])
        box((x, y1 + 0.035, 0.12 + H * 0.72), (0.03, 0.02, 0.17), M['timber'])
    box((x1 + 0.02, y0 + 0.4, 0.12 + H * 0.72), (0.03, 0.2, 0.16), M['window'])
    box((x1 + 0.02, y1 - 0.45, 0.12 + 0.2), (0.03, 0.26, 0.4), M['dark'])
    box((x1 + 0.03, y1 - 0.45, 0.12 + 0.2), (0.02, 0.22, 0.36), M['plank'])
    box((x0 + 0.12, y1 + 0.03, 0.12 + H * 0.55), (0.14, 0.02, 0.3), M['team'])
    # roof (ridge along x) with gable ends
    rise = 0.62
    gable_roof(x0, x1, y0, y1, zt, rise, M['roof'], along='x')
    for x in (x0, x1):
        gable_end(x, y0, y1, zt, rise, M['plaster'], along='x')
    box(((x0 + x1) / 2, (y0 + y1) / 2, zt + rise + 0.05), (x1 - x0 + 0.4, 0.07, 0.07), M['timber'])
    box((x0 + 0.35, y0 + 0.4, zt + 0.55), (0.16, 0.16, 0.6), M['stone'])  # chimney
    # yard clutter
    cyl((x1 + 0.12, y1 + 0.15, 0.09), 0.07, 0.18, M['plank'], v=12)
    cyl((x1 + 0.12, y1 + 0.32, 0.09), 0.07, 0.18, M['plank'], v=12)
    log_pile(x0 + 0.5, y1 + 0.18, 0, 2, 0.5, M)


def lumber_camp(M):
    # an open-sided shed on posts, a plank roof, logs stacked under it and a chopping block
    x0, x1, y0, y1 = 0.12, 0.88, -0.85, -0.18
    zt = 0.5
    for x in (x0, x1):
        for y in (y0, y1):
            box((x, y, zt / 2), (0.05, 0.05, zt), M['timber'])
    box(((x0 + x1) / 2, (y0 + y1) / 2, 0.03), (x1 - x0 + 0.06, y1 - y0 + 0.06, 0.06), M['plank'])
    gable_roof(x0, x1, y0, y1, zt, 0.22, M['plank'], over=0.1, thick=0.04, along='x')
    log_pile((x0 + x1) / 2, (y0 + y1) / 2, 0.06, 3, 0.7, M)
    cyl((x1 + 0.03, y1 + 0.1, 0.06), 0.08, 0.12, M['log'], v=12)
    box((x0, y1 + 0.05, 0.3), (0.02, 0.1, 0.18), M['team'])


def mining_camp(M):
    x0, x1, y0, y1 = 0.12, 0.88, -0.85, -0.2
    zt = 0.48
    for x in (x0, x1):
        for y in (y0, y1):
            box((x, y, zt / 2), (0.055, 0.055, zt), M['timber'])
    box((x0 + 0.02, (y0 + y1) / 2, zt / 2), (0.03, y1 - y0, zt), M['plank'])  # back wall
    gable_roof(x0, x1, y0, y1, zt, 0.2, M['plank'], over=0.1, thick=0.04, along='y')
    # heaps of stone and coal, a cart on rails
    for (cx, cy, mat, r) in ((0.45, -0.55, 'rock', 0.16), (0.72, -0.4, 'coal', 0.14)):
        o = cone((cx, cy, r * 0.5), r, 0.02, r, M[mat], v=9)
        o.rotation_euler = (0, 0, 0.4)
    box((0.62, -0.05, 0.1), (0.22, 0.14, 0.1), M['metal'])
    box((0.62, -0.05, 0.15), (0.2, 0.12, 0.02), M['coal'])
    for dx in (-0.08, 0.08):
        cyl((0.62 + dx, -0.05, 0.035), 0.035, 0.16, M['dark'], rot=(math.pi / 2, 0, 0), v=10)
    box((x1, y1 + 0.03, 0.3), (0.1, 0.02, 0.18), M['team'])


def mill(M):
    # a stone tower windmill with a conical thatched cap and four sails
    cx, cy = 1.0, -1.0
    cyl((cx, cy, 0.06), 0.62, 0.12, M['stone'], v=28)
    o = cone((cx, cy, 0.12 + 0.55), 0.48, 0.38, 1.1, M['plaster'], v=28)  # whitewashed stone
    cone((cx, cy, 1.22 + 0.25), 0.46, 0.02, 0.5, M['thatch'], v=28)
    # door and window facing the camera (towards +x, −y)
    box((cx + 0.33, cy + 0.3, 0.32), (0.06, 0.22, 0.32), M['plank'], rot=(0, 0, 0.75))
    box((cx + 0.3, cy + 0.27, 0.85), (0.04, 0.12, 0.14), M['window'], rot=(0, 0, 0.75))
    # sails on a hub facing the viewer
    hub = Vector((cx + 0.36, cy + 0.36, 1.2))
    cyl(hub + Vector((0.7071, -0.7071, 0)) * 0.04, 0.06, 0.12, M['timber'], rot=(math.pi / 2, 0, math.radians(45)), v=12)
    # the sails turn in the plane facing the viewer: spanned by screen-right (u) and up (z)
    u = Vector((0.7071, 0.7071, 0))
    out = Vector((0.7071, -0.7071, 0)) * 0.08
    for k in range(4):
        a = math.radians(25 + k * 90)
        d = u * math.cos(a) + Vector((0, 0, 1)) * math.sin(a)
        side = u * -math.sin(a) + Vector((0, 0, 1)) * math.cos(a)
        q = Vector((0, 0, 1)).rotation_difference(d)
        arm = box(hub + out + d * 0.45, (0.035, 0.035, 0.9), M['timber'])
        arm.rotation_mode = 'QUATERNION'; arm.rotation_quaternion = q
        # a cloth sail on a lattice beside each arm
        v = [hub + out + d * t + side * w for t, w in ((0.18, 0.02), (0.88, 0.02), (0.88, 0.17), (0.18, 0.17))]
        mesh([tuple(p) for p in v], [(0, 1, 2, 3)], M['plaster'])
    # sacks and a cart of grain
    for (x, y) in ((0.35, -0.3), (0.5, -0.22)):
        o = cyl((x, y, 0.09), 0.07, 0.18, M['plaster'], v=10)
    box((1.55, -0.35, 0.1), (0.3, 0.2, 0.08), M['plank'])
    box((1.55, -0.35, 0.16), (0.27, 0.17, 0.06), M['grain'])
    box((0.25, -1.6, 0.4), (0.02, 0.12, 0.22), M['team'])


BUILDINGS = {'house': (house, 2, 2), 'lumber_camp': (lumber_camp, 1, 1), 'mining_camp': (mining_camp, 1, 1), 'mill': (mill, 2, 2)}


# ---------- scene, camera and render ----------
def setup_scene(w, h):
    global ROOT_OBJ
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    bpy.ops.object.empty_add(location=(0, 0, 0))
    ROOT_OBJ = bpy.context.object
    ROOT_OBJ.scale = (1, 1, Z_SQUASH)
    # the ground only catches shadows (the game draws its own ground)
    bpy.ops.mesh.primitive_plane_add(size=12, location=(w / 2, -h / 2, 0))
    bpy.context.object.is_shadow_catcher = True
    # warm sun from the upper left of the screen (−x), soft blue sky fill
    # (light travels away from the viewer's lower left, so the left-front walls are lit and shadows fall
    #  up and to the right, into the empty space above the footprint rather than off the bottom edge)
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(42), 0, math.radians(25)))
    sun = bpy.context.object.data; sun.energy = 3.4; sun.angle = math.radians(4); sun.color = (1.0, 0.94, 0.84)
    world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.5, 0.58, 0.72, 1); bg.inputs['Strength'].default_value = 0.6
    # the canvas the game expects for this footprint, and which ground point is at its centre
    wpx, hpx = w * TILE, h * TILE
    cw, ch = wpx + hpx, (wpx + hpx) / 2 + ART_TOP
    cx, cy = cw / 2 - hpx, ch / 2 - ART_TOP          # canvas centre, relative to the footprint's top corner
    gx = (cx / 32 + cy / 16) / 2
    gy = (cy / 16 - cx / 32) / 2
    target = Vector((gx, -gy, 0))
    bpy.ops.object.camera_add(rotation=(math.radians(60), 0, math.radians(45)))
    cam = bpy.context.object
    view = cam.rotation_euler.to_matrix() @ Vector((0, 0, -1))
    cam.location = target - view * 40
    cam.data.type = 'ORTHO'; cam.data.sensor_fit = 'HORIZONTAL'
    cam.data.ortho_scale = cw / (32 * math.sqrt(2))
    cam.data.clip_end = 200
    sc.camera = cam
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -0.2
    sc.render.resolution_x = int(cw * ART_RES); sc.render.resolution_y = int(ch * ART_RES)
    return sc


def render(btype, style=0, teams=TEAMS):
    fn, w, h = BUILDINGS[btype]
    os.makedirs(OUT, exist_ok=True)
    for team, hexv in teams.items():
        sc = setup_scene(w, h)
        fn(make_materials(hexv))
        path = os.path.join(OUT, f'{btype}_s{style}_{team}.png')
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        clean_alpha(path)


def clean_alpha(path):
    # the shadow catcher leaves a faint haze over the whole picture; keep only real shadows
    img = bpy.data.images.load(path)
    px = list(img.pixels)
    for i in range(3, len(px), 4):
        if px[i] < 0.12:
            px[i] = 0.0
    img.pixels[:] = px
    img.save()
    bpy.data.images.remove(img)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    types = args or list(BUILDINGS)
    for t in types:
        render(t)
    # the game reads this list to know which buildings have rendered art
    have = sorted({f.rsplit('_', 1)[0] for f in os.listdir(OUT) if f.endswith('.png')})
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(have, f)
    print('rendered', types, '→', have)
