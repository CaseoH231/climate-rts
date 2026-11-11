# Renders people (and the scout's horse) as posed 3D models into the game's unit sprites.
#     python tools/render_units.py [type ...]      (types: worker soldier archer scout)
# Writes assets/units/<texture key>.png (named exactly as the game names its unit textures),
# assets/units/manifest.json (the keys) and assets/units/contacts.json (where each worker tool's blow lands,
# so workers can line up with trees, rocks and walls).
import bpy, math, json, os, sys
from mathutils import Vector, Euler
from bpy_extras.object_utils import world_to_camera_view

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'tools', 'renders', 'units')  # (pack_atlases.py packs these into assets/atlas)
TEAMS = {'player': 0x3f6296, 'enemy': 0x93382f, 'green': 0x3b8044, 'yellow': 0xb58c22}
UNIT_RES, UNIT_SCALE = 3, 0.86             # must match art.js
PERSON = (56, 40, 28, 34.4)               # canvas w, h and where the feet are (art.js: 32 + 2·PAD, origin 0.5/0.86)
RIDER = (44, 40, 22, 36)                  # the scout's canvas (origin 0.5/0.9)
VEHICLE = (56, 40, 28, 28.8)              # cannon, armoured car, e-tank (origin 0.5/0.72)
K = 19.8                                  # canvas units per metre: a 1.75 m person is ~30 units tall, like the drawn ones
FACING = 35                               # people face screen-right, turned 10° towards the camera so you see their faces
                                          # (side-on, so a blow lands beside them: they can stand next to what they work)
FRAMES = [(0, 0), (1, 0), (-1, 0), (0.5, 0), (-0.5, 0), (0, 1), (0, 2)]  # (leg step, pose) for frames 0–6
JOBS = ['pick', 'axe', 'hammer', 'hoe', 'knife', 'spear', 'forage']
# with Electric Tools, the axe becomes a chainsaw and the pick and hammer a power drill
def job_tool(job, tier):
    if tier >= 2 and job == 'axe':
        return 'chainsaw'
    if tier >= 2 and job in ('pick', 'hammer'):
        return 'drill'
    return job


def srgb(h):
    c = [((h >> s) & 255) / 255 for s in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def mat(name, hexv, rough=0.8, metal=0.0, noise=0.0, scale=60):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    rgb = srgb(hexv)
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if noise:
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = 8
        r = nt.nodes.new('ShaderNodeValToRGB')
        r.color_ramp.elements[0].color = (*[c * (1 - noise) for c in rgb], 1); r.color_ramp.elements[1].color = (*[min(1, c * (1 + noise)) for c in rgb], 1)
        nt.links.new(n.outputs['Fac'], r.inputs['Fac']); nt.links.new(r.outputs['Color'], b.inputs['Base Color'])
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = 0.3
        nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def materials(team):
    return {
        'skin': mat('skin', 0xc99c78, 0.6), 'hair': mat('hair', 0x4a3424, 0.9),
        'tunic': mat('tunic', 0x7a6a4f, noise=0.15), 'trousers': mat('trousers', 0x4a3d30, noise=0.15),
        'boots': mat('boots', 0x2a1d13, 0.7), 'belt': mat('belt', 0x2e2118, 0.6),
        'team': mat('team', TEAMS[team], 0.75, noise=0.12), 'straw': mat('straw', 0xc4a660, 0.95, noise=0.3, scale=120),
        'wood': mat('wood', 0x6b4a2c, 0.8, noise=0.25, scale=30), 'steel': mat('steel', 0xc0c6cc, 0.3, metal=1.0),
        'iron': mat('iron', 0x7c8288, 0.45, metal=0.9), 'mail': mat('mail', 0x8a9096, 0.5, metal=0.8, noise=0.35, scale=400),
        'leather': mat('leather', 0x6a4a2c, 0.65, noise=0.2), 'wicker': mat('wicker', 0x9a7442, 0.9, noise=0.35, scale=150),
        'berry': mat('berry', 0xa02838, 0.4), 'horse': mat('horse', 0x6b4a2e, 0.7, noise=0.12), 'mane': mat('mane', 0x2a1e14, 0.9),
        'string': mat('string', 0xe8e0c8, 0.9), 'cream': mat('cream', 0xe2d6b6, 0.85, noise=0.08),
        'red': mat('red', 0xb02828, 0.6), 'hivis': mat('hivis', 0xe8c428, 0.8, noise=0.08),
        'kevlar': mat('kevlar', 0x33373c, 0.8, noise=0.12), 'orange': mat('orange', 0xe46a1c, 0.6),
        'yellow': mat('yellow', 0xe0b21a, 0.55),
    }


# ---------- building blocks (all parented to a joint) ----------
def add(obj, parent, m):
    if m:
        obj.data.materials.append(m)
    obj.parent = parent
    return obj


def empty(parent, loc=(0, 0, 0)):
    o = bpy.data.objects.new('j', None); bpy.context.collection.objects.link(o)
    o.parent = parent; o.location = loc
    return o


def limb(parent, length, r0, r1, m, v=10):
    """A tapered limb hanging down (−z) from its joint."""
    bpy.ops.mesh.primitive_cone_add(vertices=v, radius1=r1, radius2=r0, depth=length, location=(0, 0, -length / 2))
    return add(bpy.context.object, parent, m)


def ball(parent, loc, r, m, sx=1, sy=1, sz=1):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=r, location=loc)
    o = bpy.context.object; o.scale = (sx, sy, sz)
    return add(o, parent, m)


def cube(parent, loc, size, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.object; o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    return add(o, parent, m)


def rod(parent, z0, z1, r, m, v=8, x=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=v, radius=r, depth=abs(z1 - z0), location=(x, 0, (z0 + z1) / 2))
    return add(bpy.context.object, parent, m)


def taper_box(parent, z0, z1, w0, w1, d0, d1, m):
    """A torso-like block from z0 (width w0, depth d0) up to z1 (w1, d1); width along y, depth along x."""
    v = []
    for z, w, d in ((z0, w0, d0), (z1, w1, d1)):
        v += [(-d / 2, -w / 2, z), (d / 2, -w / 2, z), (d / 2, w / 2, z), (-d / 2, w / 2, z)]
    me = bpy.data.meshes.new('t'); me.from_pydata(v, [], [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]); me.update()
    o = bpy.data.objects.new('t', me); bpy.context.collection.objects.link(o)
    mod = o.modifiers.new('b', 'BEVEL'); mod.width = 0.03; mod.segments = 3
    return add(o, parent, m)


# ---------- tools: built along −z from the grip; returns the tip (working end) as an empty ----------
def tool(kind, hand, M):
    g = empty(hand)
    tip = None
    if kind == 'pick':
        rod(g, 0.08, -0.72, 0.028, M['wood'])
        o = cube(g, (0.03, 0, -0.72), (0.44, 0.065, 0.065), M['iron']); o.rotation_euler = (0, 0.15, 0)
        tip = empty(g, (0.22, 0, -0.74))
    elif kind == 'axe':
        rod(g, 0.08, -0.66, 0.028, M['wood'])
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.12, radius2=0.04, depth=0.2, location=(0.1, 0, -0.62), rotation=(0, math.pi / 2, 0))
        o = add(bpy.context.object, g, M['steel']); o.scale = (0.5, 1, 1)
        tip = empty(g, (0.2, 0, -0.62))
    elif kind == 'hammer':
        rod(g, 0.06, -0.36, 0.026, M['wood'])
        cube(g, (0, 0, -0.38), (0.2, 0.09, 0.1), M['iron'])
        tip = empty(g, (0.1, 0, -0.38))
    elif kind == 'hoe':
        rod(g, 0.1, -1.0, 0.024, M['wood'])
        cube(g, (0.07, 0, -1.0), (0.16, 0.16, 0.03), M['iron'], rot=(0, 0.5, 0))
        tip = empty(g, (0.12, 0, -1.03))
    elif kind == 'knife':
        rod(g, 0.04, -0.06, 0.024, M['leather'])
        cube(g, (0, 0, -0.16), (0.05, 0.02, 0.2), M['steel'])
        tip = empty(g, (0, 0, -0.25))
    elif kind == 'spear':
        rod(g, 0.55, -1.0, 0.024, M['wood'])
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.05, radius2=0, depth=0.18, location=(0, 0, -1.09), rotation=(math.pi, 0, 0))
        add(bpy.context.object, g, M['steel'])
        tip = empty(g, (0, 0, -1.14))
    elif kind == 'chainsaw':
        cube(g, (0, 0, -0.05), (0.2, 0.1, 0.16), M['orange'])          # body
        cube(g, (-0.06, 0, 0.08), (0.08, 0.03, 0.1), M['kevlar'])      # rear handle (in the hand)
        cube(g, (0.08, 0, -0.1), (0.03, 0.14, 0.03), M['kevlar'])      # front bar handle
        cube(g, (0, 0, -0.42), (0.05, 0.016, 0.6), M['steel'])         # bar
        cube(g, (0, 0, -0.42), (0.56, 0.026, 0.026), M['iron']).rotation_euler = (0, math.pi / 2, 0)
        tip = empty(g, (0, 0, -0.72))
    elif kind == 'drill':
        cube(g, (0, 0, -0.03), (0.12, 0.07, 0.18), M['yellow'])        # body
        cube(g, (-0.02, 0, 0.1), (0.05, 0.03, 0.08), M['kevlar'])      # grip
        rod(g, -0.12, -0.34, 0.016, M['steel'])                        # bit
        tip = empty(g, (0, 0, -0.36))
    elif kind == 'baton':
        rod(g, 0.05, -0.3, 0.018, M['kevlar'])
        tip = empty(g, (0, 0, -0.32))
    elif kind == 'rifle':
        rod(g, 0.14, -0.3, 0.03, M['wood'])                       # stock
        cube(g, (0.03, 0, 0.1), (0.14, 0.035, 0.1), M['wood'])    # butt
        rod(g, -0.28, -0.92, 0.018, M['iron'])                    # barrel
        cube(g, (0.02, 0, -0.34), (0.05, 0.02, 0.06), M['iron'])  # lock
        tip = empty(g, (0, 0, -0.95))
    elif kind == 'sword':
        rod(g, 0.06, -0.04, 0.026, M['leather'])
        cube(g, (0, 0, -0.05), (0.2, 0.05, 0.04), M['iron'])
        cube(g, (0, 0, -0.42), (0.07, 0.025, 0.72), M['steel'])
        tip = empty(g, (0, 0, -0.8))
    return g, tip


# ---------- the person ----------
class Person:
    def __init__(self, M, kind, job=None, tier=0):
        self.M, self.kind, self.job, self.tier = M, kind, job, tier
        if tier == 1:  # steel tools after the first worker upgrades
            M = dict(M); M['iron'] = M['steel']
        root = empty(None)
        self.root = root
        self.pelvis = empty(root, (0, 0, 0.92))
        # legs (left = +y, the far side; right = −y, nearer the camera)
        self.hips, self.knees = {}, {}
        for side, y in (('L', 0.1), ('R', -0.1)):
            hip = empty(self.pelvis, (0, y, 0)); limb(hip, 0.46, 0.09, 0.072, M['trousers'])
            knee = empty(hip, (0, 0, -0.46)); limb(knee, 0.44, 0.072, 0.055, M['trousers'])
            foot = empty(knee, (0, 0, -0.44)); cube(foot, (0.05, 0, -0.03), (0.22, 0.11, 0.08), M['boots'])
            self.hips[side], self.knees[side] = hip, knee
        self.spine = empty(self.pelvis, (0, 0, 0))
        body = M['mail'] if kind == 'soldier' else M['leather'] if kind == 'archer' else M['tunic']
        taper_box(self.spine, -0.1, 0.52, 0.36, 0.44, 0.24, 0.26, body)
        # a team-coloured tabard / jerkin front, belt
        taper_box(self.spine, -0.14, 0.48, 0.26, 0.3, 0.04, 0.04, M['team']).location.x = 0.12
        cube(self.spine, (0, 0, 0.0), (0.27, 0.39, 0.06), M['belt'])
        if kind == 'worker' and tier == 1:  # a leather apron over the tabard
            taper_box(self.spine, -0.3, 0.2, 0.2, 0.16, 0.03, 0.03, M['leather']).location.x = 0.15
        if kind == 'worker' and tier == 2:  # a hi-vis vest with reflective bands, team colour on the shoulders
            taper_box(self.spine, -0.06, 0.5, 0.38, 0.46, 0.26, 0.28, M['hivis'])
            for z in (0.12, 0.3):
                cube(self.spine, (0.145, 0, z), (0.012, 0.42, 0.045), M['cream'])
            cube(self.spine, (0, 0, 0.52), (0.26, 0.46, 0.05), M['team'])
        elif tier == 2:  # a dark armoured vest with a team patch
            taper_box(self.spine, -0.06, 0.5, 0.4, 0.47, 0.27, 0.29, M['kevlar'])
            cube(self.spine, (0.15, 0.1, 0.32), (0.015, 0.11, 0.11), M['team'])
            cube(self.spine, (0.15, -0.08, 0.1), (0.03, 0.1, 0.08), M['kevlar'])  # pouch
        neck = empty(self.spine, (0, 0, 0.56))
        ball(neck, (0, 0, 0.05), 0.045, M['skin'], sz=1.4)
        self.head = empty(neck, (0, 0, 0.14))
        ball(self.head, (0, 0, 0), 0.115, M['skin'], sx=0.95, sz=1.1)
        ball(self.head, (0.098, 0.035, 0.015), 0.012, M['boots']); ball(self.head, (0.098, -0.035, 0.015), 0.012, M['boots'])  # eyes
        self.hat(kind, M)
        # arms
        self.sh, self.el, self.hands = {}, {}, {}
        sleeve = M['mail'] if kind == 'soldier' else M['leather'] if kind == 'archer' else M['tunic']
        for side, y in (('L', 0.25), ('R', -0.25)):
            s = empty(self.spine, (0, y, 0.48)); limb(s, 0.3, 0.07, 0.056, sleeve)
            e = empty(s, (0, 0, -0.3)); limb(e, 0.27, 0.056, 0.044, sleeve)
            h = empty(e, (0, 0, -0.29)); ball(h, (0, 0, 0), 0.05, M['skin'])
            self.sh[side], self.el[side], self.hands[side] = s, e, h
        self.tip = None
        self.toolgrip = None
        self.extras(kind, job, M)

    def hat(self, kind, M):
        h = self.head
        if kind == 'worker' and self.tier == 2:  # a yellow hard hat
            ball(h, (0, 0, 0.04), 0.125, M['yellow'], sz=0.75)
            cube(h, (0, 0, 0.0), (0.3, 0.21, 0.02), M['yellow'])
        elif self.tier == 2 and kind == 'medic':  # a white helmet with a red cross
            ball(h, (0, 0, 0.03), 0.125, M['cream'], sz=0.85)
            cube(h, (0.115, 0.0, 0.05), (0.012, 0.016, 0.05), M['red'])
            cube(h, (0.115, 0.0, 0.05), (0.012, 0.05, 0.016), M['red'])
        elif self.tier == 2 and kind in ('soldier', 'rifleman', 'archer', 'scout'):  # a modern composite helmet
            ball(h, (-0.005, 0, 0.03), 0.127, M['kevlar'], sz=0.9)
            rod(h, -0.005, 0.03, 0.128, M['team'], v=16)
        elif kind == 'worker' and self.tier == 1:  # a felt cap
            ball(h, (-0.01, 0, 0.04), 0.118, M['leather'], sz=0.8)
            cube(h, (0.1, 0, 0.03), (0.08, 0.16, 0.015), M['leather'])
        elif kind == 'worker':  # a straw hat
            rod(h, 0.05, 0.065, 0.19, M['straw'], v=20)
            bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.11, radius2=0.07, depth=0.1, location=(0, 0, 0.11)); add(bpy.context.object, h, M['straw'])
        elif kind == 'soldier':  # an iron kettle helmet
            ball(h, (0, 0, 0.03), 0.118, M['iron'], sz=0.85)
            rod(h, 0.0, 0.012, 0.16, M['iron'], v=20)
        elif kind == 'archer':  # a team-coloured hood
            ball(h, (-0.015, 0, 0.02), 0.122, M['team'], sz=1.05)
            ball(h, (0.03, 0, -0.01), 0.1, M['skin'])
        elif kind == 'rifleman':  # a peaked cap with a team band
            ball(h, (0, 0, 0.055), 0.115, M['boots'], sz=0.6)
            cube(h, (0.1, 0, 0.035), (0.09, 0.14, 0.018), M['boots'])
            rod(h, 0.0, 0.035, 0.117, M['team'], v=16)
        elif kind == 'medic':  # a pale field cap with a red cross
            ball(h, (0, 0, 0.045), 0.117, M['cream'], sz=0.65)
            cube(h, (0.105, 0.0, 0.06), (0.012, 0.016, 0.05), M['red'])
            cube(h, (0.105, 0.0, 0.06), (0.012, 0.05, 0.016), M['red'])
        else:
            ball(h, (-0.02, 0, 0.04), 0.108, M['hair'], sz=0.9)

    def extras(self, kind, job, M):
        R, L = self.hands['R'], self.hands['L']
        if kind == 'soldier' and self.tier == 2:
            # riot kit: a baton and a clear shield with a team stripe
            self.toolgrip, self.tip = tool('baton', R, M)
            sh = empty(self.el['L'], (0.08, 0.05, -0.18))
            clear = mat('clear', 0xb8ccd8, 0.15); clear.node_tree.nodes['Principled BSDF'].inputs['Alpha'].default_value = 0.4
            clear.blend_method = 'BLEND'
            cube(sh, (0, 0.02, 0), (0.34, 0.015, 0.5), clear)
            cube(sh, (0, 0.03, 0.18), (0.3, 0.012, 0.07), M['team'])
            return
        if kind == 'worker':
            if job == 'forage':
                b = empty(L, (0, 0, -0.08))
                bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=0.09, radius2=0.12, depth=0.16, location=(0, 0, -0.04)); add(bpy.context.object, b, M['wicker'])
                for (x, y) in ((0.03, 0.02), (-0.03, 0.01), (0, -0.03)):
                    ball(b, (x, y, 0.045), 0.025, M['berry'])
                self.berries = [ball(R, (0.02, 0, -0.03), 0.024, M['berry'])]
            else:
                self.toolgrip, self.tip = tool(job_tool(job, self.tier), R, M)
        elif kind == 'soldier':
            self.toolgrip, self.tip = tool('sword', R, M)
            sh = empty(self.el['L'], (0.06, 0.04, -0.16))
            bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.2, depth=0.03, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
            add(bpy.context.object, sh, M['team'])
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, radius=0.05, location=(0, 0.02, 0)); add(bpy.context.object, sh, M['iron'])
            rod(sh, -0.2, 0.2, 0.012, M['iron']).rotation_euler = (math.pi / 2, 0, 0)
        elif kind == 'rifleman':
            self.toolgrip, self.tip = tool('rifle', R, M)
        elif kind == 'medic':
            # a satchel with a red cross on a shoulder strap
            sa = cube(self.spine, (0.02, -0.2, 0.02), (0.1, 0.16, 0.14), M['cream'])
            cube(self.spine, (0.08, -0.2, 0.02), (0.012, 0.025, 0.09), M['red'])
            cube(self.spine, (0.08, -0.2, 0.02), (0.012, 0.09, 0.025), M['red'])
            strap = cube(self.spine, (0, 0.02, 0.3), (0.26, 0.05, 0.03), M['leather'])
            strap.rotation_euler = (math.radians(50), 0, 0)
        elif kind == 'archer':
            bow = empty(L)
            for k in range(10):  # a curved bow, upright in the left hand
                a0 = -0.9 + k * 0.18
                z = math.sin(a0) * 0.62
                x = -math.cos(a0) * 0.12 + 0.12
                cube(bow, (x, 0, z), (0.045, 0.045, 0.14), M['wood'], rot=(0, -a0 * 0.5, 0))
            self.string = rod(bow, -0.56, 0.56, 0.004, M['string'], v=4)
            self.string.location.x = -0.02
            q = empty(self.spine, (-0.13, 0.08, 0.3))  # quiver on the back
            rod(q, -0.2, 0.2, 0.05, M['leather']).rotation_euler = (0.3, 0, 0)
            self.bow = bow

    # angles in degrees, "forward from hanging straight down"
    def arm(self, side, a_s, a_e, out=0.0):
        self.sh[side].rotation_euler = (math.radians(out if side == 'L' else -out), -math.radians(a_s), 0)
        self.el[side].rotation_euler = (0, -math.radians(a_e), 0)

    def leg(self, side, a, knee):
        self.hips[side].rotation_euler = (0, -math.radians(a), 0)
        self.knees[side].rotation_euler = (0, math.radians(knee), 0)

    def pose(self, step, p, spec):
        """step: walking (−1…1); p: 0 rest, 1 wind-up/reach, 2 blow/pull; spec: this kind's pose table."""
        crouch = 0.0; lean = 0.0
        self.pelvis.location.z = 0.92
        self.leg('R', 24 * step, 22 if step < -0.2 else 4)
        self.leg('L', -24 * step, 22 if step > 0.2 else 4)
        rest = spec['rest']
        sw = 18 * step
        self.arm('L', rest['L'][0] + (sw if not rest.get('holdL') else 0), rest['L'][1], 8)
        self.arm('R', rest['R'][0] - (sw if not rest.get('holdR') else 0), rest['R'][1], 8)
        t = rest.get('t', 0)
        if p:
            ps = spec['poses'][p - 1]
            self.arm('R', ps['R'][0], ps['R'][1], 6)
            if 'L' in ps:
                self.arm('L', ps['L'][0], ps['L'][1], 14)
            t = ps.get('t', t); lean = ps.get('lean', 0); crouch = ps.get('crouch', 0)
        if self.toolgrip:
            self.toolgrip.rotation_euler = (0, -math.radians(t), 0)
            vis = not (p and spec['poses'][p - 1].get('empty'))
            for o in self.toolgrip.children_recursive:
                o.hide_render = not vis
        if hasattr(self, 'berries'):
            for o in self.berries:
                o.hide_render = not (p == 2)
        self.spine.rotation_euler = (0, math.radians(lean), 0)
        if hasattr(self, 'bow'):
            a = self.sh['L'].rotation_euler.y + self.el['L'].rotation_euler.y
            self.bow.rotation_euler = (0, -a - math.radians(lean), 0)
        if crouch:
            l = 0.45
            d = 2 * l - crouch
            th = math.degrees(math.acos(max(-1, min(1, d / (2 * l)))))
            self.pelvis.location.z = 0.92 - crouch
            self.leg('R', th + 10, 2 * th + 10); self.leg('L', th - 10, 2 * th - 10)


# Pose tables: arm angles (shoulder, elbow) forward from hanging; t = tool angle relative to the forearm.
# Two-handed tools put the left hand on the handle too.
REST_TOOL = {'rest': {'R': (10, 70), 'L': (0, 10), 't': 95, 'holdR': True}}
WORKER_POSES = {
    # power tools are held low and pushed into the work, not swung
    'chainsaw': [{'R': (55, 35), 'L': (45, 45), 't': 60, 'lean': 2}, {'R': (65, 20), 'L': (55, 35), 't': 78, 'lean': 10}],
    'drill': [{'R': (45, 45), 'L': (30, 50), 't': 15, 'lean': 2}, {'R': (55, 30), 'L': (40, 40), 't': 25, 'lean': 10}],
    'pick': [{'R': (165, 25), 'L': (155, 35), 't': 80, 'lean': -6}, {'R': (65, 10), 'L': (60, 20), 't': 35, 'lean': 16}],
    'axe': [{'R': (160, 40), 'L': (148, 50), 't': 75, 'lean': -6}, {'R': (80, 0), 'L': (75, 10), 't': 10, 'lean': 8}],
    'hammer': [{'R': (150, 50), 't': 20, 'lean': -2}, {'R': (60, 25), 't': 30, 'lean': 12}],
    'hoe': [{'R': (130, 30), 'L': (118, 30), 't': 50, 'lean': -2}, {'R': (50, 10), 'L': (45, 15), 't': 75, 'lean': 16}],
    'knife': [{'R': (60, 60), 't': 0, 'lean': 14, 'crouch': 0.16}, {'R': (40, 30), 't': 45, 'lean': 18, 'crouch': 0.16}],
    'spear': [{'R': (170, 40), 't': -120, 'lean': -10}, {'R': (100, 0), 'empty': True, 'lean': 14}],
    'forage': [{'R': (78, 5), 'lean': 12, 'crouch': 0.06}, {'R': (20, 95), 'lean': 4, 'crouch': 0.06}],
}
SPECS = {
    # rifle at port arms; poses: take aim (level), fire
    'rifleman': {'rest': {'R': (30, 55), 'L': (0, 15), 't': 35, 'holdR': True},
                 'poses': [{'R': (85, 5), 'L': (70, 38), 't': 4, 'lean': 2}, {'R': (87, 4), 'L': (72, 36), 't': 2, 'lean': -2}]},
    # reaching into the satchel, then kneeling to treat someone
    'medic': {'rest': {'R': (0, 12), 'L': (10, 25)},
              'poses': [{'R': (40, 70), 'L': (20, 40), 'lean': 8}, {'R': (65, 20), 'L': (50, 30), 'lean': 14, 'crouch': 0.12}]},
    'soldier': {'rest': {'R': (15, 45), 'L': (30, 70), 't': 100, 'holdR': True, 'holdL': True},
                'poses': [{'R': (165, 40), 'L': (35, 75), 't': 35, 'lean': -6}, {'R': (80, 10), 'L': (40, 70), 't': 20, 'lean': 10}]},
    'archer': {'rest': {'R': (0, 10), 'L': (15, 20), 'holdL': True},
               'poses': [{'R': (95, 125), 'L': (90, 0)}, {'R': (95, 110), 'L': (90, 0)}]},
}


def worker_spec(job, tier=0):
    t = job_tool(job, tier)
    rest = {'R': (8, 10), 'L': (0, 60), 'holdL': True} if t == 'forage' else REST_TOOL['rest']
    if t == 'spear':
        rest = {'R': (10, 70), 'L': (0, 10), 't': 170, 'holdR': True}
    if t in ('chainsaw', 'drill'):
        rest = {'R': (25, 45), 'L': (0, 15), 't': 30, 'holdR': True}
    return {'rest': rest, 'poses': WORKER_POSES[t]}


# ---------- horse (for the scout) ----------
def horse(M, parent):
    h = empty(parent)
    ball(h, (0, 0, 1.0), 0.32, M['horse'], sx=2.0, sy=0.85, sz=1.0)
    neck = empty(h, (0.5, 0, 1.15)); neck.rotation_euler = (0, math.radians(-35), 0)
    limb(neck, 0.5, 0.16, 0.12, M['horse']).rotation_euler = (0, math.pi, 0)
    ball(neck, (0.06, 0, 0.55), 0.13, M['horse'], sx=2.0, sy=0.8, sz=0.9).rotation_euler = (0, math.radians(60), 0)
    cube(neck, (-0.06, 0, 0.3), (0.06, 0.05, 0.55), M['mane'])
    tail = empty(h, (-0.62, 0, 1.08)); tail.rotation_euler = (0, math.radians(25), 0); limb(tail, 0.5, 0.05, 0.02, M['mane'])
    legs = {}
    for name, x, y in (('FL', 0.42, 0.14), ('FR', 0.42, -0.14), ('BL', -0.42, 0.14), ('BR', -0.42, -0.14)):
        top = empty(h, (x, y, 0.85)); limb(top, 0.42, 0.06, 0.04, M['horse'])
        low = empty(top, (0, 0, -0.42)); limb(low, 0.42, 0.035, 0.03, M['horse'])
        ball(low, (0, 0, -0.42), 0.04, M['mane'])
        legs[name] = (top, low)
    # saddle cloth in the team colour
    cube(h, (0, 0, 1.28), (0.5, 0.62, 0.05), M['team'])
    return h, legs


# ---------- scene and rendering ----------
def setup(canvas):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    W, H, fx, fy = canvas
    bpy.ops.object.light_add(type='SUN', rotation=(math.radians(42), 0, math.radians(25)))
    sun = bpy.context.object.data; sun.energy = 3.6; sun.angle = math.radians(6); sun.color = (1.0, 0.94, 0.84)
    world = bpy.data.worlds.new('sky'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs['Color'].default_value = (0.5, 0.58, 0.72, 1); bg.inputs['Strength'].default_value = 0.7
    bpy.ops.object.camera_add(rotation=(math.radians(60), 0, math.radians(45)))
    cam = bpy.context.object
    cam.data.type = 'ORTHO'; cam.data.sensor_fit = 'HORIZONTAL'; cam.data.ortho_scale = W / K
    # put the feet (the origin) where the game expects them on the canvas
    rot = cam.rotation_euler.to_matrix()
    view, right, up = rot @ Vector((0, 0, -1)), rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    centre = Vector((0, 0, 0)) - right * ((fx - W / 2) / K) + up * ((fy - H / 2) / K)
    cam.location = centre - view * 20
    sc.camera = cam
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 32; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
    sc.cycles.filter_width = 0.9
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = -0.1
    sc.render.resolution_x = W * UNIT_RES; sc.render.resolution_y = H * UNIT_RES
    return sc, cam


def key(utype, team, frame, job=None, tier=0):
    return f"u_{utype}_{team}{f'_w{frame}' if frame else ''}{f'_t{tier}' if tier else ''}{f'_{job}' if job and job != 'pick' else ''}"


CONTACTS_ONLY = '--contacts-only' in sys.argv


def shoot(sc, name):
    if CONTACTS_ONLY:
        return
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)


def contact_of(sc, cam, tip, canvas):
    W, H, fx, fy = canvas
    bpy.context.view_layer.update()
    w = tip.matrix_world.translation
    p = world_to_camera_view(sc, cam, w)
    cx, cy = p.x * W, (1 - p.y) * H
    # also the point on the ground right under it: how far in front of the feet the blow lands
    g = world_to_camera_view(sc, cam, Vector((w.x, w.y, 0)))
    gx, gy = g.x * W, (1 - g.y) * H
    return {'x': round((cx - fx) * UNIT_SCALE, 2), 'y': round((cy - fy) * UNIT_SCALE, 2),
            'gx': round((gx - fx) * UNIT_SCALE, 2), 'gy': round((gy - fy) * UNIT_SCALE, 2)}


def render_person(utype, team, keys, contacts, tier=0):
    jobs = JOBS if utype == 'worker' else [None]
    contacts = contacts.setdefault(str(tier), {})
    for job in jobs:
        sc, cam = setup(PERSON)
        M = materials(team)
        person = Person(M, utype, job, tier)
        person.root.rotation_euler.z = math.radians(FACING)
        spec = worker_spec(job, tier) if utype == 'worker' else SPECS[utype]
        for f, (step, p) in enumerate(FRAMES):
            person.pose(step, p, spec)
            k = key(utype, team, f, job, tier)
            shoot(sc, k); keys.append(k)
            # where the blow lands (for forage: the reaching hand; for the spear: the tip while aiming)
            if utype == 'worker' and team == 'player':
                if (job == 'forage' and p == 1):
                    contacts[job] = contact_of(sc, cam, person.hands['R'], PERSON)
                elif job == 'spear' and p == 1 and person.tip:
                    contacts[job] = contact_of(sc, cam, person.tip, PERSON)
                elif job not in ('forage', 'spear') and p == 2 and person.tip:
                    contacts[job] = contact_of(sc, cam, person.tip, PERSON)


# The field cannon: a bronze barrel on a two-wheeled carriage (one frame; vehicles don't animate).
def render_cannon(team, keys):
    sc, cam = setup(VEHICLE)
    M = materials(team)
    root = empty(None)
    root.rotation_euler.z = math.radians(FACING)
    bronze = mat('bronze', 0x8a6a30, 0.35, metal=1.0)
    for side, y in ((1, 0.26), (-1, -0.26)):
        w = empty(root, (0, y, 0.34))
        bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=0.34, depth=0.07, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
        add(bpy.context.object, w, M['wood'])
        bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=0.36, depth=0.04, location=(0, y * 0.02, 0), rotation=(math.pi / 2, 0, 0))
        add(bpy.context.object, w, M['iron'])  # tyre
        for k in range(6):
            a = k * math.pi / 3
            cube(w, (math.cos(a) * 0.17, 0.015 * side, math.sin(a) * 0.17), (0.3, 0.025, 0.045), M['wood'], rot=(0, -a, 0))
        ball(w, (0, 0.045 * side, 0), 0.06, M['iron'])
    # trail (the carriage beams running back to the ground)
    for y in (0.1, -0.1):
        cube(root, (-0.45, y, 0.22), (0.95, 0.07, 0.09), M['wood'], rot=(0, -0.22, 0))
    cube(root, (0.05, 0, 0.36), (0.3, 0.46, 0.08), M['wood'])  # axle block
    # barrel, tipped up a little
    b = empty(root, (0.1, 0, 0.47)); b.rotation_euler = (0, math.radians(-78), 0)
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=0.1, radius2=0.08, depth=0.8, location=(0, 0, 0.45))
    add(bpy.context.object, b, bronze)
    rod(b, -0.45, 0.14, 0.095, bronze, v=20)
    ball(b, (0, 0, -0.45), 0.1, bronze)
    for z in (-0.3, 0.05):
        rod(b, z, z + 0.035, 0.115, bronze, v=20)
    cube(root, (0.02, 0, 0.56), (0.05, 0.3, 0.04), M['team'])  # a team band on the axle
    k = key('cannon', team, 0)
    shoot(sc, k); keys.append(k)


def render_armoured_car(team, keys):
    # a six-wheeled armoured car with a small turret, in the team's colours
    sc, cam = setup(VEHICLE)
    M = materials(team)
    root = empty(None)
    root.rotation_euler.z = math.radians(FACING)
    root.scale = (0.85, 0.85, 0.85)
    hull = taper_box(root, 0.5, 0.95, 0.75, 0.6, 1.7, 1.3, M['kevlar'])
    taper_box(root, 0.28, 0.5, 0.8, 0.78, 1.8, 1.75, M['kevlar'])
    # angled nose and team stripe
    cube(root, (0.0, 0, 0.72), (1.74, 0.72, 0.06), M['team'])
    for side, y in ((1, 0.42), (-1, -0.42)):
        for x in (-0.6, 0, 0.6):
            w = empty(root, (x, y, 0.26))
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.26, depth=0.18, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
            add(bpy.context.object, w, M['boots'])
            bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.12, depth=0.19, location=(0, 0.01 * side, 0), rotation=(math.pi / 2, 0, 0))
            add(bpy.context.object, w, M['iron'])
    # turret with a stubby gun facing ahead
    t = empty(root, (0.25, 0, 0.95))
    taper_box(t, 0, 0.26, 0.5, 0.4, 0.55, 0.45, M['kevlar'])
    cube(t, (0.08, 0, 0.28), (0.4, 0.4, 0.04), M['team'])
    g = cube(t, (0.5, 0, 0.14), (0.5, 0.06, 0.06), M['iron'])
    cube(t, (0.1, 0.18, 0.2), (0.1, 0.1, 0.14), M['iron'])  # hatch
    # headlights and a radio whip
    for y in (0.25, -0.25):
        ball(root, (0.86, y, 0.5), 0.045, M['cream'])
    rod(root, 1.0, 1.7, 0.008, M['iron'], x=-0.7)
    k = key('armoured_car', team, 0)
    shoot(sc, k); keys.append(k)


def render_e_tank(team, keys):
    # an electric battle tank: low sloped hull, tracks with road wheels, a long gun,
    # glowing blue battery strips instead of exhausts
    sc, cam = setup(VEHICLE)
    M = materials(team)
    glow = mat('glow', 0x6ad8ff, 0.3)
    em = glow.node_tree.nodes['Principled BSDF']
    em.inputs['Emission Color'].default_value = (0.35, 0.85, 1.0, 1); em.inputs['Emission Strength'].default_value = 2.5
    root = empty(None)
    root.rotation_euler.z = math.radians(FACING)
    root.scale = (0.72, 0.72, 0.72)
    taper_box(root, 0.32, 0.72, 1.2, 0.95, 2.1, 1.7, M['kevlar'])          # hull
    cube(root, (0.95, 0, 0.5), (0.3, 1.1, 0.3), M['kevlar'], rot=(0, 0.55, 0))  # sloped glacis
    cube(root, (0, 0, 0.74), (1.6, 0.9, 0.04), M['team'])
    for y in (0.62, -0.62):
        taper_box(root, 0.0, 0.42, 0.3, 0.3, 2.2, 2.0, M['boots']).location.y = y   # track
        for x in (-0.75, -0.25, 0.25, 0.75):
            bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.16, depth=0.32, location=(x, y, 0.2), rotation=(math.pi / 2, 0, 0))
            add(bpy.context.object, root, M['iron'])
        cube(root, (0, y * 1.02, 0.52), (1.4, 0.04, 0.05), glow)  # battery strip
    t = empty(root, (-0.05, 0, 0.74))
    taper_box(t, 0, 0.32, 0.85, 0.65, 1.0, 0.8, M['kevlar'])
    cube(t, (0.05, 0, 0.33), (0.6, 0.5, 0.03), M['team'])
    g = rod(t, 0, 1.25, 0.05, M['iron'], v=12)
    g.rotation_euler = (0, math.pi / 2, 0); g.location = (0.55, 0, 0.16)
    cube(t, (1.15, 0, 0.16), (0.14, 0.14, 0.14), M['iron'])  # muzzle
    cube(t, (-0.2, 0.25, 0.36), (0.14, 0.14, 0.08), M['iron'])  # sensor
    k = key('e_tank', team, 0)
    shoot(sc, k); keys.append(k)


def render_scout(team, keys, tier=0):
    sc, cam = setup(RIDER)
    M = materials(team)
    root = empty(None)
    root.rotation_euler.z = math.radians(FACING)
    h, legs = horse(M, root)
    rider = Person(M, 'scout', tier=tier)
    rider.root.parent = root
    rider.root.location = (0.0, 0, 0.52)
    # seated: thighs forward and apart, a lance held upright
    for side in ('L', 'R'):
        rider.leg(side, 70, 80)
        rider.hips[side].rotation_euler.x = math.radians(25 if side == 'L' else -25)
    rider.arm('R', 40, 50, 6); rider.arm('L', 35, 60, 6)
    g, _ = tool('spear', rider.hands['R'], M); g.rotation_euler = (0, -math.radians(100), 0)
    cloak = taper_box(rider.spine, 0.0, 0.5, 0.4, 0.3, 0.05, 0.05, M['team']); cloak.location.x = -0.13
    gallop = [((0, 0), (0, 0), (0, 0), (0, 0)), ((35, 20), (25, 15), (-30, -10), (-20, -5)), ((-25, 40), (-15, 30), (30, 40), (20, 30))]
    for f, angles in enumerate(gallop):
        for (name, (a, kb)) in zip(('FL', 'FR', 'BL', 'BR'), angles):
            top, low = legs[name]
            top.rotation_euler = (0, -math.radians(a), 0)
            low.rotation_euler = (0, math.radians(kb) * (-1 if name[0] == 'F' else 1), 0)
        k = key('scout', team, f, tier=tier)
        shoot(sc, k); keys.append(k)


if __name__ == '__main__':
    types = [a for a in sys.argv[1:] if not a.startswith('-')] or ['worker', 'soldier', 'archer', 'scout']
    os.makedirs(OUT, exist_ok=True)
    mpath, cpath = os.path.join(OUT, 'manifest.json'), os.path.join(OUT, 'contacts.json')
    keys = set(json.load(open(mpath))) if os.path.exists(mpath) else set()
    contacts = json.load(open(cpath)) if os.path.exists(cpath) else {}
    if contacts and '0' not in contacts:
        contacts = {}  # (older flat format)
    teams = [t for t in TEAMS if ('--team=' + t) in sys.argv] or list(TEAMS)
    for team in teams:
        for t in types:
            new = []
            if t == 'scout':
                render_scout(team, new)
            elif t in ('scout1', 'scout2'):
                render_scout(team, new, tier=int(t[-1]))
            elif t == 'cannon':
                render_cannon(team, new)
            elif t == 'armoured_car':
                render_armoured_car(team, new)
            elif t == 'e_tank':
                render_e_tank(team, new)
            elif t[-1] in '12':  # an upgrade tier of a person (worker1, soldier2, rifleman1, ...)
                render_person(t[:-1], team, new, contacts, tier=int(t[-1]))
            else:
                render_person(t, team, new, contacts)
            keys.update(new)
    json.dump(sorted(keys), open(mpath, 'w'))
    json.dump(contacts, open(cpath, 'w'), indent=1)
    print('rendered', types, len(keys), 'sprites')
