# Renders buildings as 3D models into sprites that drop straight into the game (the way AoE2's art
# was made). Run with Blender's Python module:
#     python tools/render_buildings.py [type ...]
# Writes assets/buildings/<type>_s<style>_<team>.png and assets/buildings/manifest.json.
# The camera matches the game's projection exactly: screen x = 32·(x − y), screen y = 16·(x + y) − z
# (x, y in tiles; z in game pixels), so a building's footprint lands where the game expects it.
import bpy, bmesh, math, json, os, sys
from mathutils import Vector

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'tools', 'renders', 'buildings')  # (pack_atlases.py packs these into assets/atlas)
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


def bricks(name, c1, c2, mortar, scale=6, row=0.25, width=0.5, bump=0.4, rough=0.9, flat=False):
    """Stonework or roof tiles: Blender's brick pattern, varied per brick, with mortar grooves.
    Walls and roofs are mapped with (x + y, z) so courses run level on every face; floors with (x, y)."""
    m, nt, b = principled(name, c1, rough)
    tc0 = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc0.outputs['Object'], sep.inputs['Vector'])
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    if flat:
        nt.links.new(sep.outputs['X'], comb.inputs['X']); nt.links.new(sep.outputs['Y'], comb.inputs['Y'])
    else:
        add = nt.nodes.new('ShaderNodeMath'); add.operation = 'ADD'
        nt.links.new(sep.outputs['X'], add.inputs[0]); nt.links.new(sep.outputs['Y'], add.inputs[1])
        nt.links.new(add.outputs['Value'], comb.inputs['X']); nt.links.new(sep.outputs['Z'], comb.inputs['Y'])

    class _TC:  # (so the rest of this function can keep using tc.outputs['Object'])
        outputs = {'Object': comb.outputs['Vector']}
    tc = _TC()
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


STYLE = 0  # 0 Coal Age (timber and plaster), 1 Industrial (brick, slate and iron)


def make_materials(team_hex):
    lin = lambda h: srgb(h)
    return {
        'brick': bricks('brick', lin(0xa8684a), lin(0x865240), lin(0x6a5048), scale=7, row=0.16, width=0.42, bump=0.5),
        'glassb': principled('glassb', lin(0x9ab2c0), 0.25)[0],
        'ironwork': principled('ironwork', lin(0x3a3e42), 0.5, )[0],
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
        'slate': bricks('slate', lin(0x4c5258), lin(0x3e4348), lin(0x22262a), scale=10, row=0.16, width=0.28, bump=0.6),
        'shingle': bricks('shingle', lin(0x5a4636), lin(0x4a3a2c), lin(0x241a12), scale=10, row=0.16, width=0.24, bump=0.6),
        'paving': bricks('paving', lin(0xa49a86), lin(0x8e8572), lin(0x5e574a), scale=4, row=0.5, width=0.5, bump=0.3, flat=True),
        'cream': noisy('cream', lin(0xe2d6b6), var=0.06, scale=30, bump=0.05),
        'straw': noisy('straw', lin(0xc4a660), var=0.3, scale=90, bump=0.5),
        'water': principled('water', lin(0x2f4e5e), 0.15)[0],
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
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)  # textures in real units
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
    frame_walls(x0, x1, y0, y1, 0.12, H, M, bays=2)
    zt = 0.12 + H
    for y in (y0, y1):
        for sx, xm in ((-1, x0 + (x1 - x0) * 0.25), (1, x0 + (x1 - x0) * 0.75)):
            box((xm, y, 0.12 + H * 0.25), (0.035, 0.052, H * 0.5), M['timber'], rot=(0, sx * 0.75, 0))
    # windows with shutters, a door, a team-coloured banner
    windows([x0 + 0.35, x1 - 0.35], y1 + 0.02, 0.12 + H * 0.74, M)
    windows([y0 + 0.4], x1 + 0.02, 0.12 + H * 0.74, M, face='x')
    box((x1 + 0.02, y1 - 0.45, 0.12 + 0.2), (0.03, 0.26, 0.4), M['dark'])
    box((x1 + 0.03, y1 - 0.45, 0.12 + 0.2), (0.02, 0.22, 0.36), M['plank'])
    box((x0 + 0.12, y1 + 0.03, 0.12 + H * 0.55), (0.14, 0.02, 0.3), M['team'])
    # roof (ridge along x) with gable ends
    rise = 0.62
    gable_roof(x0, x1, y0, y1, zt, rise, roof_mat(M), along='x')
    for x in (x0, x1):
        gable_end(x, y0, y1, zt, rise, gable_mat(M), along='x')
    box(((x0 + x1) / 2, (y0 + y1) / 2, zt + rise + 0.05), (x1 - x0 + 0.4, 0.07, 0.07), M['timber'] if STYLE < 1 else M['ironwork'])
    box((x0 + 0.35, y0 + 0.4, zt + 0.55), (0.16, 0.16, 0.6), M['stone'])  # chimney
    # yard clutter
    cyl((x1 + 0.12, y1 + 0.15, 0.09), 0.07, 0.18, M['plank'], v=12)
    cyl((x1 + 0.12, y1 + 0.32, 0.09), 0.07, 0.18, M['plank'], v=12)
    log_pile(x0 + 0.5, y1 + 0.18, 0, 2, 0.5, M)


def lumber_camp(M):
    # an open-sided shed on posts, a plank roof, logs stacked under it and a chopping block
    x0, x1, y0, y1 = 0.06, 0.94, -0.94, -0.12
    zt = 0.62
    for x in (x0, x1):
        for y in (y0, y1):
            box((x, y, zt / 2), (0.05, 0.05, zt), M['timber'])
    box(((x0 + x1) / 2, (y0 + y1) / 2, 0.03), (x1 - x0 + 0.06, y1 - y0 + 0.06, 0.06), M['plank'])
    gable_roof(x0, x1, y0, y1, zt, 0.22, M['plank'], over=0.1, thick=0.04, along='x')
    log_pile((x0 + x1) / 2, (y0 + y1) / 2, 0.06, 4, 0.8, M)
    log_pile(x1 + 0.0, y1 + 0.02, 0.0, 2, 0.4, M, axis='y')
    box((x0 + 0.05, (y0 + y1) / 2, zt / 2), (0.03, y1 - y0, zt), M['plank'])  # back wall
    box((x1 - 0.1, y1 + 0.06, 0.25), (0.02, 0.03, 0.18), M['metal'], rot=(0.4, 0, 0))  # an axe stuck in the block
    cyl((x1 + 0.03, y1 + 0.1, 0.06), 0.08, 0.12, M['log'], v=12)
    box((x0, y1 + 0.05, 0.3), (0.02, 0.1, 0.18), M['team'])


def mining_camp(M):
    x0, x1, y0, y1 = 0.06, 0.94, -0.94, -0.14
    zt = 0.58
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
    cone((cx, cy, 1.22 + 0.25), 0.46, 0.02, 0.5, roof_mat(M, 'thatch'), v=28)
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


def frame_walls(x0, x1, y0, y1, z0, H, M, bays=2):
    """Walls in the age's style: plaster in a dark timber frame (Coal), or brick with stone sills (Industrial)."""
    if STYLE >= 1:
        box(((x0 + x1) / 2, (y0 + y1) / 2, z0 + H / 2), (x1 - x0, y1 - y0, H), M['brick'])
        # stone quoins on the corners and a sill course
        for x in (x0, x1):
            for y in (y0, y1):
                box((x, y, z0 + H / 2), (0.07, 0.07, H), M['stone'])
        box(((x0 + x1) / 2, (y0 + y1) / 2, z0 + H - 0.03), (x1 - x0 + 0.05, y1 - y0 + 0.05, 0.06), M['stone'])
        return
    box(((x0 + x1) / 2, (y0 + y1) / 2, z0 + H / 2), (x1 - x0, y1 - y0, H), M['plaster'])
    for i in range(bays + 1):
        x = x0 + (x1 - x0) * i / bays
        for y in (y0, y1):
            box((x, y, z0 + H / 2), (0.05, 0.05, H), M['timber'])
    for i in range(bays + 1):
        y = y0 + (y1 - y0) * i / bays
        for x in (x0, x1):
            box((x, y, z0 + H / 2), (0.05, 0.05, H), M['timber'])
    for y in (y0, y1):
        box(((x0 + x1) / 2, y, z0 + H - 0.02), (x1 - x0 + 0.04, 0.055, 0.05), M['timber'])
        box(((x0 + x1) / 2, y, z0 + H * 0.5), (x1 - x0, 0.052, 0.035), M['timber'])
    for x in (x0, x1):
        box((x, (y0 + y1) / 2, z0 + H - 0.02), (0.055, y1 - y0 + 0.04, 0.05), M['timber'])
        box((x, (y0 + y1) / 2, z0 + H * 0.5), (0.052, y1 - y0, 0.035), M['timber'])


def roof_mat(M, kind='roof'):
    return M['slate'] if STYLE >= 1 else M[kind]


def gable_mat(M):
    return M['brick'] if STYLE >= 1 else M['plaster']


def windows(xs, y, z, M, face='y'):
    for x in xs:
        if face == 'y':
            box((x, y, z), (0.16, 0.03, 0.18 if STYLE >= 1 else 0.14), M['window']); box((x, y + 0.015, z), (0.025, 0.02, 0.19 if STYLE >= 1 else 0.15), M['timber' if STYLE < 1 else 'ironwork'])
            if STYLE >= 1:
                box((x, y + 0.01, z - 0.11), (0.2, 0.03, 0.03), M['stone'])  # sill
            else:
                for sx in (-1, 1):
                    box((x + sx * 0.12, y + 0.01, z), (0.07, 0.02, 0.16), M['plank'])  # shutters
        else:
            box((y, x, z), (0.03, 0.16, 0.18 if STYLE >= 1 else 0.14), M['window']); box((y + 0.015, x, z), (0.02, 0.025, 0.19 if STYLE >= 1 else 0.15), M['timber' if STYLE < 1 else 'ironwork'])
            if STYLE >= 1:
                box((y + 0.01, x, z - 0.11), (0.03, 0.2, 0.03), M['stone'])
            else:
                for sx in (-1, 1):
                    box((y + 0.01, x + sx * 0.12, z), (0.02, 0.07, 0.16), M['plank'])


def battlements(cx, cy, r, z, M, n=10, round_=True, w=None, d=None):
    if round_:
        cyl((cx, cy, z + 0.06), r + 0.04, 0.12, M['stone'], v=28)
        for k in range(n):
            a = 2 * math.pi * k / n
            box((cx + math.cos(a) * r, cy + math.sin(a) * r, z + 0.2), (0.12, 0.12, 0.16), M['stone'], rot=(0, 0, a))
    else:
        box((cx, cy, z + 0.05), (w + 0.06, d + 0.06, 0.1), M['stone'])
        for i in range(3):
            for (px, py) in ((cx - w / 2 + 0.06 + i * (w - 0.12) / 2, cy - d / 2), (cx - w / 2 + 0.06 + i * (w - 0.12) / 2, cy + d / 2),
                             (cx - w / 2, cy - d / 2 + 0.06 + i * (d - 0.12) / 2), (cx + w / 2, cy - d / 2 + 0.06 + i * (d - 0.12) / 2)):
                box((px, py, z + 0.17), (0.11, 0.11, 0.15), M['stone'])


def flag(x, y, z, M, h=0.6):
    cyl((x, y, z + h / 2), 0.012, h, M['timber'], v=6)
    mesh([(x, y, z + h), (x + 0.22, y + 0.22 * 0.0, z + h - 0.06), (x, y, z + h - 0.14)], [(0, 1, 2)], M['team'])
    mesh([(x, y, z + h), (x + 0.02, y - 0.22, z + h - 0.06), (x, y, z + h - 0.14)], [(0, 1, 2)], M['team'])


def arch_door(x, y, z, M, w=0.24, h=0.36, face='y'):
    """An arched wooden door at (x, y) in a wall facing −y/+y ('y') or ±x ('x')."""
    if face == 'y':
        box((x, y, z + h / 2), (w, 0.04, h), M['dark']); box((x, y + 0.01, z + h / 2 - 0.01), (w - 0.04, 0.03, h - 0.03), M['plank'])
        cyl((x, y + 0.005, z + h), w / 2, 0.045, M['dark'], rot=(math.pi / 2, 0, 0), v=16)
    else:
        box((x, y, z + h / 2), (0.04, w, h), M['dark']); box((x + 0.01, y, z + h / 2 - 0.01), (0.03, w - 0.04, h - 0.03), M['plank'])
        cyl((x + 0.005, y, z + h), w / 2, 0.045, M['dark'], rot=(0, math.pi / 2, 0), v=16)


def round_tower(cx, cy, r, h, M, z0=0, roof='cone'):
    cyl((cx, cy, z0 + h / 2), r, h, M['stone'], v=24)
    cyl((cx, cy, z0 + 0.05), r + 0.05, 0.1, M['stone'], v=24)
    for zz in (h * 0.45, h * 0.75):  # arrow slits on the visible side
        for a in (-0.6, 0.15):
            ang = -math.pi / 4 + a
            box((cx + math.cos(ang) * r, cy + math.sin(ang) * r, z0 + zz), (0.03, 0.03, 0.12), M['dark'], rot=(0, 0, ang))
    if roof == 'cone':
        cone((cx, cy, z0 + h + 0.4), r + 0.1, 0.01, 0.8, M['team_roof'] if 'team_roof' in M else M['slate'], v=24)
    else:
        battlements(cx, cy, r, z0 + h, M)


def town_centre(M):
    # a two-storey timber hall on a stone plinth, a round tower with a team-coloured spire, banners
    box((1.5, -1.5, 0.07), (2.7, 2.7, 0.14), M['paving'])
    x0, x1, y0, y1 = 0.45, 2.5, -2.45, -0.85
    box(((x0 + x1) / 2, (y0 + y1) / 2, 0.14 + 0.2), (x1 - x0 + 0.06, y1 - y0 + 0.06, 0.4), M['stone'])
    frame_walls(x0, x1, y0, y1, 0.54, 0.62, M, bays=3)
    zt = 0.54 + 0.62
    windows([x0 + 0.35, (x0 + x1) / 2, x1 - 0.35], y1 + 0.02, 0.54 + 0.4, M)
    windows([y0 + 0.4, y1 - 0.4], x1 + 0.02, 0.54 + 0.4, M, face='x')
    arch_door(1.5, y1 + 0.03, 0.14, M, w=0.36, h=0.5)
    for x in (0.8, 2.2):
        box((x, y1 + 0.05, 0.75), (0.14, 0.02, 0.42), M['team'])
    gable_roof(x0, x1, y0, y1, zt, 0.75, roof_mat(M, 'slate'), along='x')
    for x in (x0, x1):
        gable_end(x, y0, y1, zt, 0.75, gable_mat(M), along='x')
    box(((x0 + x1) / 2, (y0 + y1) / 2, zt + 0.8), (x1 - x0 + 0.4, 0.08, 0.08), M['timber'])
    M2 = dict(M); M2['team_roof'] = M['team']
    round_tower(0.75, -0.75, 0.32, 2.3, M2)
    flag(0.75, -0.75, 2.3 + 0.75, M)
    # low walls with gateposts, a well, crates
    box((2.85, -1.6, 0.2), (0.14, 1.5, 0.4), M['stone'])
    box((1.6, -2.85, 0.2), (1.9, 0.14, 0.4), M['stone'])
    cyl((2.75, -2.75, 0.12), 0.16, 0.24, M['stone'], v=16)
    cyl((2.75, -2.75, 0.25), 0.12, 0.02, M['water'], v=16)
    for (x, y) in ((0.35, -2.7), (0.55, -2.75)):
        box((x, y, 0.08), (0.16, 0.16, 0.16), M['plank'])


def barracks(M):
    box((1.5, -1.5, 0.05), (2.8, 2.8, 0.1), M['paving'])
    x0, x1, y0, y1 = 0.35, 2.65, -2.1, -0.5
    box(((x0 + x1) / 2, (y0 + y1) / 2, 0.1 + 0.42), (x1 - x0, y1 - y0, 0.84), M['stone'])
    zt = 0.94
    for x in (x0 + 0.4, x0 + 0.9, x1 - 0.9, x1 - 0.4):
        box((x, y1 + 0.02, 0.62), (0.07, 0.03, 0.18), M['dark'])  # narrow windows
    for y in (y0 + 0.5, y1 - 0.5):
        box((x1 + 0.02, y, 0.62), (0.03, 0.07, 0.18), M['dark'])
    arch_door(x1 + 0.03, (y0 + y1) / 2, 0.1, M, w=0.4, h=0.5, face='x')
    for y in ((y0 + y1) / 2 - 0.4, (y0 + y1) / 2 + 0.4):
        box((x1 + 0.05, y, 0.6), (0.02, 0.16, 0.44), M['team'])
    gable_roof(x0, x1, y0, y1, zt, 0.7, roof_mat(M, 'shingle'), over=0.15, along='x')
    for x in (x0, x1):
        gable_end(x, y0, y1, zt, 0.7, M['stone'], along='x')
    # the yard: a weapon rack, a straw training dummy, an archery target
    box((2.0, -2.55, 0.2), (0.6, 0.06, 0.04), M['timber'])
    for k in range(5):
        cyl((1.75 + k * 0.12, -2.55, 0.28), 0.012, 0.56, M['timber'], v=6)
        cone((1.75 + k * 0.12, -2.55, 0.6), 0.025, 0.0, 0.07, M['metal'], v=6)
    cyl((0.8, -2.55, 0.3), 0.025, 0.6, M['timber'], v=8)
    cyl((0.8, -2.55, 0.42), 0.09, 0.26, M['straw'], v=12)
    box((0.8, -2.55, 0.48), (0.04, 0.4, 0.04), M['timber'])
    o = cyl((2.75, -1.5, 0.35), 0.2, 0.06, M['straw'], rot=(0, math.pi / 2 - 0.3, 0), v=20)
    cyl((2.77, -1.5, 0.35), 0.1, 0.065, M['team'], rot=(0, math.pi / 2 - 0.3, 0), v=20)
    flag(x1 - 0.1, y1 - 0.1, zt + 0.7, M, h=0.5)


def tower(M):
    round_tower(1.0, -1.0, 0.56, 2.1, M, roof='battlements')
    arch_door(1.0 + 0.4, -1.0 - 0.4, 0.0, M, w=0.24, h=0.36)  # on the front of the tower
    flag(1.0, -1.0, 2.25, M, h=0.6)
    box((1.0, -1.0, 2.15), (0.5, 0.5, 0.04), M['plank'])


def market(M):
    box((1.5, -1.5, 0.05), (2.9, 2.9, 0.1), M['paving'])
    # a small tiled house at the back
    frame_walls(0.25, 1.25, -1.25, -0.25, 0.1, 0.55, M, bays=2)
    gable_roof(0.25, 1.25, -1.25, -0.25, 0.65, 0.45, roof_mat(M), along='y')
    for y in (-1.25, -0.25):
        gable_end(y, 0.25, 1.25, 0.65, 0.45, gable_mat(M), along='y')
    windows([0.75], -0.23, 0.45, M)
    # three striped stalls: one in the team colour, two in market colours
    def stall(cx, cy, stripe):
        for dx in (-0.3, 0.3):
            for dy in (-0.22, 0.22):
                box((cx + dx, cy + dy, 0.3), (0.035, 0.035, 0.5), M['timber'])
        box((cx, cy, 0.3), (0.62, 0.4, 0.06), M['plank'])  # counter
        for k in range(6):
            mat = stripe if k % 2 == 0 else M['cream']
            box((cx - 0.3 + (k + 0.5) * 0.1, cy, 0.58), (0.1, 0.56, 0.03), mat, rot=(0.25, 0, 0))
        for k in range(3):  # goods
            cyl((cx - 0.18 + k * 0.18, cy - 0.05, 0.36), 0.06, 0.06, M['grain'] if k % 2 else M['plank'], v=12)
    yel = noisy('yel', srgb(0xc9a23a), var=0.1); grn = noisy('grn', srgb(0x4a7a44), var=0.1)
    stall(2.1, -0.75, yel); stall(2.15, -1.95, M['team']); stall(0.95, -2.2, grn)
    for (x, y) in ((1.6, -1.35), (1.75, -1.25)):
        cyl((x, y, 0.2), 0.08, 0.2, M['plank'], v=12)
    box((1.4, -2.75, 0.17), (0.18, 0.18, 0.14), M['plank'])


def wall(M):
    box((0.5, -0.5, 0.42), (0.86, 0.86, 0.84), M['stone'])
    box((0.5, -0.5, 0.7), (0.88, 0.88, 0.06), M['team'])
    battlements(0.5, -0.5, 0, 0.84, M, round_=False, w=0.86, d=0.86)


def gate(M):
    box((0.5, -0.5, 0.55), (0.9, 0.9, 1.1), M['stone'])
    arch_door(0.5, -0.04, 0.0, M, w=0.42, h=0.55)
    arch_door(0.96, -0.5, 0.0, M, w=0.42, h=0.55, face='x')
    box((0.5, -0.5, 0.95), (0.92, 0.92, 0.06), M['team'])
    battlements(0.5, -0.5, 0, 1.1, M, round_=False, w=0.9, d=0.9)
    flag(0.5, -0.5, 1.25, M, h=0.5)


def fishing_dock(M):
    # a plank pier on posts, a hut, nets on a drying frame, barrels and a little boat
    box((1.0, -1.0, 0.1), (1.9, 1.9, 0.06), M['plank'])
    for x in (0.1, 1.0, 1.9):
        for y in (-0.1, -1.0, -1.9):
            cyl((x, y, 0.0), 0.04, 0.3, M['timber'], v=8)
    frame_walls(0.25, 1.05, -1.0, -0.25, 0.13, 0.5, M, bays=2)
    gable_roof(0.25, 1.05, -1.0, -0.25, 0.63, 0.35, roof_mat(M, 'shingle'), along='x')
    for x in (0.25, 1.05):
        gable_end(x, -1.0, -0.25, 0.63, 0.35, gable_mat(M), along='x')
    for x in (1.35, 1.75):
        cyl((x, -0.4, 0.4), 0.015, 0.55, M['timber'], v=6)
    net = mesh([(1.35, -0.4, 0.65), (1.75, -0.4, 0.65), (1.75, -0.4, 0.25), (1.35, -0.4, 0.25)], [(0, 1, 2, 3)], M['straw'])
    for (x, y) in ((0.4, -1.5), (0.55, -1.6)):
        cyl((x, y, 0.22), 0.08, 0.18, M['plank'], v=12)
    hull = cyl((1.5, -1.6, 0.13), 0.12, 0.6, M['plank'], rot=(0, math.pi / 2, 0.4), v=12)
    hull.scale = (0.12, 0.12, 0.3)
    box((0.6, -0.25, 0.4), (0.02, 0.12, 0.2), M['team'])


def smokestack(x, y, z0, h, M, r=0.1):
    cyl((x, y, z0 + h / 2), r, h, M['brick'], v=14)
    cyl((x, y, z0 + h - 0.04), r + 0.03, 0.08, M['stone'], v=14)
    cyl((x, y, z0 + h + 0.03), r - 0.02, 0.06, M['dark'], v=14)


def power_plant(M):
    # a brick generating hall, a tall smokestack, a coal heap with a cart, and a transformer yard
    box((1.5, -1.5, 0.05), (2.9, 2.9, 0.1), M['paving'])
    x0, x1, y0, y1 = 0.3, 2.1, -2.3, -0.5
    frame_walls(x0, x1, y0, y1, 0.1, 0.95, M, bays=3)
    zt = 1.05
    # tall arched windows glowing with furnace light
    for x in (x0 + 0.35, x0 + 0.9, x1 - 0.35):
        box((x, y1 + 0.02, 0.62), (0.18, 0.03, 0.5), M['window'])
        cyl((x, y1 + 0.02, 0.87), 0.09, 0.035, M['window'], rot=(math.pi / 2, 0, 0), v=14)
    arch_door(x1 + 0.03, (y0 + y1) / 2, 0.1, M, w=0.44, h=0.6, face='x')
    gable_roof(x0, x1, y0, y1, zt, 0.5, roof_mat(M), along='y')
    for y in (y0, y1):
        gable_end(y, x0, x1, zt, 0.5, gable_mat(M), along='y')
    smokestack(x0 + 0.35, y0 + 0.35, zt + 0.3, 1.5, M, r=0.14)
    # coal heap and cart
    o = cone((2.55, -2.45, 0.22), 0.3, 0.02, 0.44, M['coal'], v=10); o.rotation_euler = (0, 0, 0.3)
    box((2.5, -1.7, 0.12), (0.26, 0.16, 0.12), M['metal'])
    box((2.5, -1.7, 0.19), (0.24, 0.14, 0.03), M['coal'])
    # transformer yard: two cylinders with iron frames behind a fence
    for (tx, ty) in ((2.55, -0.65), (2.55, -1.1)):
        cyl((tx, ty, 0.22), 0.1, 0.36, M['metal'], v=12)
        box((tx, ty, 0.44), (0.16, 0.16, 0.03), M['ironwork'])
    for k in range(5):
        box((2.3, -0.45 - k * 0.22, 0.12), (0.02, 0.02, 0.24), M['ironwork'])
    box((2.3, -0.9, 0.22), (0.02, 0.92, 0.02), M['ironwork'])
    box((x0 + 0.1, y1 + 0.04, 0.7), (0.14, 0.02, 0.4), M['team'])


def workshop(M):
    # a brick workshop with a sawtooth (factory) roof, a gear over the door, crates and barrels
    box((1.5, -1.5, 0.05), (2.9, 2.9, 0.1), M['paving'])
    x0, x1, y0, y1 = 0.35, 2.4, -2.4, -0.6
    frame_walls(x0, x1, y0, y1, 0.1, 0.72, M, bays=3)
    zt = 0.82
    windows([x0 + 0.4, (x0 + x1) / 2, x1 - 0.4], y1 + 0.02, 0.55, M)
    arch_door(x1 + 0.03, (y0 + y1) / 2, 0.1, M, w=0.4, h=0.52, face='x')
    # sawtooth roof: three slanted teeth with glass on the steep side
    teeth = 3
    tw = (x1 - x0) / teeth
    for k in range(teeth):
        xa = x0 + k * tw
        v = [(xa, y0 - 0.1, zt), (xa, y1 + 0.1, zt), (xa + tw, y1 + 0.1, zt + 0.3), (xa + tw, y0 - 0.1, zt + 0.3)]
        v += [(p[0], p[1], p[2] + 0.05) for p in v]
        mesh(v, [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], roof_mat(M))
        mesh([(xa + tw, y0 - 0.1, zt), (xa + tw, y1 + 0.1, zt), (xa + tw, y1 + 0.1, zt + 0.3), (xa + tw, y0 - 0.1, zt + 0.3)], [(0, 1, 2, 3)], M['glassb'])
        for j in range(4):
            yb = y0 - 0.1 + (j + 0.5) * (y1 - y0 + 0.2) / 4
            box((xa + tw, yb, zt + 0.15), (0.015, 0.02, 0.3), M['ironwork'])
    # a big gear on the front gable
    gx, gy, gz = (x0 + x1) / 2, y1 + 0.04, 0.9
    cyl((gx, gy, gz), 0.14, 0.03, M['ironwork'], rot=(math.pi / 2, 0, 0), v=12)
    for k in range(8):
        a = k * math.pi / 4
        box((gx + math.cos(a) * 0.16, gy, gz + math.sin(a) * 0.16), (0.05, 0.03, 0.05), M['ironwork'], rot=(0, a, 0))
    smokestack(x0 + 0.25, y0 + 0.3, zt, 0.9, M, r=0.09)
    for (bx, by) in ((2.65, -1.2), (2.65, -1.5), (2.62, -1.35)):
        cyl((bx, by, 0.11), 0.08, 0.22, M['plank'], v=12)
    box((2.6, -2.2, 0.13), (0.24, 0.24, 0.26), M['plank'])
    box((x1 - 0.05, y1 + 0.04, 0.62), (0.14, 0.02, 0.36), M['team'])


BUILDINGS = {'house': (house, 2, 2), 'lumber_camp': (lumber_camp, 1, 1), 'mining_camp': (mining_camp, 1, 1), 'mill': (mill, 2, 2),
             'town_centre': (town_centre, 3, 3), 'barracks': (barracks, 3, 3), 'tower': (tower, 2, 2), 'market': (market, 3, 3),
             'wall': (wall, 1, 1), 'gate': (gate, 1, 1), 'fishing_dock': (fishing_dock, 2, 2),
             'power_plant': (power_plant, 3, 3), 'workshop': (workshop, 3, 3)}


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
    sc.cycles.filter_width = 0.9  # crisper edges, like AoE2's pre-rendered sprites
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 128; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -0.2
    sc.render.resolution_x = int(cw * ART_RES); sc.render.resolution_y = int(ch * ART_RES)
    return sc


def render(btype, style=0, teams=TEAMS):
    global STYLE
    STYLE = style
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
    styles = [int(a.split('=')[1]) for a in sys.argv[1:] if a.startswith('--style=')] or [0]
    types = args or list(BUILDINGS)
    for t in types:
        for st in styles:
            render(t, style=st)
    # the game reads this list to know which buildings have rendered art
    have = sorted({f.rsplit('_', 1)[0] for f in os.listdir(OUT) if f.endswith('.png')})
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(have, f)
    print('rendered', types, '→', have)
