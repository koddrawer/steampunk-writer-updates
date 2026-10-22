"""
Steampunk Writing Robot + Paper Scroll Machine
Chạy trong Blender:  Scripting tab -> Open -> Run Script
hoặc:  blender --background --python build_scene.py
Đơn vị: mét. Trục X = chiều dài máy, Y = chiều sâu, Z = lên.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix

# ------------------------------------------------------------------ reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
TAU = math.tau

def col(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

C_BASE = col("Base")
C_FEED = col("PaperFeeder")
C_ARM  = col("RobotArm")
C_DECO = col("Details")

# ------------------------------------------------------------------ materials
def mat_metal(name, color, rough=0.3, aniso=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = 1.0
    # vết bẩn/oxi hoá: noise -> độ nhám + tối màu ở hốc
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 18; nz.inputs["Detail"].default_value = 8
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["To Min"].default_value = rough * 0.6; mr.inputs["To Max"].default_value = min(1, rough * 1.7)
    nt.links.new(nz.outputs["Fac"], mr.inputs["Value"]); nt.links.new(mr.outputs["Result"], b.inputs["Roughness"])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = 'RGBA'
    mix.inputs[6].default_value = (*color, 1); mix.inputs[7].default_value = (color[0]*0.35, color[1]*0.3, color[2]*0.25, 1)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.55; ramp.color_ramp.elements[1].position = 0.8
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs["Factor"])
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    return m

def mat_basic(name, color, rough=0.5, metal=0.0, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    for k, v in kw.items(): b.inputs[k].default_value = v
    return m

def mat_wood():
    m = bpy.data.materials.new("Wood_Walnut"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (0.6, 5, 1)
    wv = nt.nodes.new("ShaderNodeTexWave"); wv.wave_type = 'BANDS'; wv.inputs["Scale"].default_value = 3
    wv.inputs["Distortion"].default_value = 12; wv.inputs["Detail"].default_value = 4
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.035, 0.013, 0.006, 1)
    ramp.color_ramp.elements[1].color = (0.13, 0.05, 0.022, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); nt.links.new(mp.outputs["Vector"], wv.inputs["Vector"])
    nt.links.new(wv.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.35
    b.inputs["Coat Weight"].default_value = 0.25
    return m

def mat_paper():
    m = bpy.data.materials.new("Paper_Parchment"); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 6; nz.inputs["Detail"].default_value = 10
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.50, 0.36, 0.19, 1)
    ramp.color_ramp.elements[1].color = (0.72, 0.58, 0.38, 1)
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    b.inputs["Subsurface Weight"].default_value = 0.05
    return m

M = dict(
    brass  = mat_metal("Brass",  (0.62, 0.40, 0.12), 0.32),
    brass2 = mat_metal("Brass_Polished", (0.80, 0.56, 0.20), 0.2),
    copper = mat_metal("Copper", (0.62, 0.26, 0.12), 0.3),
    iron   = mat_metal("DarkIron", (0.12, 0.11, 0.10), 0.45),
    bronze = mat_metal("Bronze", (0.32, 0.20, 0.09), 0.42),
    wood   = mat_wood(),
    paper  = mat_paper(),
    ink    = mat_basic("Ink", (0.02, 0.015, 0.01), 0.4),
    rubber = mat_basic("Hose_Rubber", (0.04, 0.03, 0.025), 0.55),
    glass  = mat_basic("Glass_InkBottle", (0.15, 0.07, 0.03), 0.05, **{"Transmission Weight": 1.0, "IOR": 1.5}),
    dial   = mat_basic("ClockFace", (0.92, 0.88, 0.78), 0.4),
    black  = mat_basic("BlackLacquer", (0.015, 0.015, 0.015), 0.2),
)

# ------------------------------------------------------------------ helpers
def link(obj, c):
    for uc in obj.users_collection: uc.objects.unlink(obj)
    c.objects.link(obj)
    return obj

def finish(obj, mat, c, bevel=0.0, smooth=True):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    if obj.type == 'MESH':
        for p in obj.data.polygons: p.material_index = 0
    if smooth and obj.type == 'MESH':
        for p in obj.data.polygons: p.use_smooth = True
        if bpy.app.version >= (4, 1):
            obj.modifiers.new("ws", 'SMOOTH_BY_ANGLE') if hasattr(bpy.types, "SmoothByAngleModifier") else None
    if bevel > 0:
        m = obj.modifiers.new("bev", 'BEVEL'); m.width = bevel; m.segments = 2; m.limit_method = 'ANGLE'
    return link(obj, c)

def box(name, loc, size, mat, c, bevel=0.004, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, mat, c, bevel, smooth=False)

def cyl(name, loc, r, depth, mat, c, axis='Z', verts=48, bevel=0.002, rot=None):
    r_ = {'X': (0, math.pi/2, 0), 'Y': (math.pi/2, 0, 0), 'Z': (0, 0, 0)}[axis] if rot is None else rot
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=r_)
    o = bpy.context.object; o.name = name
    return finish(o, mat, c, bevel)

def cyl_between(name, p1, p2, r, mat, c, verts=32, bevel=0.002):
    p1, p2 = Vector(p1), Vector(p2); d = p2 - p1
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(p1 + p2) / 2)
    o = bpy.context.object; o.name = name
    o.rotation_mode = 'QUATERNION'; o.rotation_quaternion = d.to_track_quat('Z', 'Y')
    return finish(o, mat, c, bevel)

def sphere(name, loc, r, mat, c, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=seg // 2, radius=r, location=loc)
    o = bpy.context.object; o.name = name
    return finish(o, mat, c)

def torus(name, loc, R, r, mat, c, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot,
                                     major_segments=64, minor_segments=12)
    o = bpy.context.object; o.name = name
    return finish(o, mat, c)

def gear(name, loc, r, thick, teeth, mat, c, axis='Z', hole=0.0, spokes=0, tooth_h=None, rot_extra=0.0):
    """Bánh răng thật: profile răng hình thang, có lỗ trục và nan hoa tuỳ chọn."""
    th = tooth_h or r * 0.12
    bm = bmesh.new()
    pts = []
    for i in range(teeth):
        a0 = TAU * i / teeth
        step = TAU / teeth
        for f, rr in ((0.0, r - th), (0.18, r - th), (0.32, r), (0.68, r), (0.82, r - th)):
            a = a0 + f * step + rot_extra
            pts.append((math.cos(a) * rr, math.sin(a) * rr))
    if spokes and hole == 0:
        hole = 0.0
    vb = [bm.verts.new((x, y, -thick / 2)) for x, y in pts]
    face = bm.faces.new(vb)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.z += thick
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    o.location = loc
    if axis == 'X': o.rotation_euler = (0, math.pi / 2, 0)
    if axis == 'Y': o.rotation_euler = (math.pi / 2, 0, 0)
    # cắt lỗ / cửa sổ nan hoa
    cutters = []
    if spokes:
        rin = r * 0.72
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=rin, depth=thick * 3, location=(0, 0, 0))
        ring_cut = bpy.context.object; cutters.append(ring_cut)
    elif hole > 0:
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=hole, depth=thick * 3)
        cutters.append(bpy.context.object)
    for cu in cutters:
        cu.parent = o; cu.matrix_parent_inverse.identity()
        md = o.modifiers.new("cut", 'BOOLEAN'); md.object = cu; md.operation = 'DIFFERENCE'; md.solver = 'EXACT'
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.ops.object.modifier_apply(modifier=md.name)
        bpy.data.objects.remove(cu)
    finish(o, mat, c, bevel=0.0015, smooth=False)
    if spokes:  # nan hoa + moay-ơ
        M_ = o.matrix_world.copy()
        hub = cyl(name + "_hub", (0, 0, 0), r * 0.16, thick * 1.6, mat, c)
        hub.parent = o
        for k in range(spokes):
            a = TAU * k / spokes + rot_extra
            p1 = Vector((math.cos(a) * r * 0.12, math.sin(a) * r * 0.12, 0))
            p2 = Vector((math.cos(a) * r * 0.76, math.sin(a) * r * 0.76, 0))
            s = cyl_between(name + f"_spoke{k}", p1, p2, thick * 0.32, mat, c, verts=12)
            s.parent = o
        cap = cyl(name + "_axle", (0, 0, 0), r * 0.06, thick * 2.6, M["iron"], c)
        cap.parent = o
    return o

def rivet_ring(prefix, center, R, n, r, mat, c, axis='Z', offset=0.0):
    cx, cy, cz = center
    for i in range(n):
        a = TAU * i / n
        u, v = math.cos(a) * R, math.sin(a) * R
        p = {'Z': (cx + u, cy + v, cz + offset), 'X': (cx + offset, cy + u, cz + v), 'Y': (cx + u, cy + offset, cz + v)}[axis]
        sphere(f"{prefix}_rivet{i}", p, r, mat, c, seg=10)

def rivet_line(prefix, p1, p2, n, r, mat, c):
    p1, p2 = Vector(p1), Vector(p2)
    for i in range(n):
        sphere(f"{prefix}_rv{i}", p1.lerp(p2, i / max(1, n - 1)), r, mat, c, seg=10)

def hose(name, pts, r, mat, c):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = r; cu.bevel_resolution = 4; cu.resolution_u = 24
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, cu); c.objects.link(o)
    cu.materials.append(mat)
    # vòng kẹp đồng dọc ống
    return o

# ================================================================== BASE
BX0, BX1, BY0, BY1 = -1.05, 1.55, -0.62, 0.62
BL, BW = BX1 - BX0, BY1 - BY0
BCX = (BX0 + BX1) / 2
box("Base_WoodPlinth", (BCX, 0, 0.05), (BL, BW, 0.07), M["wood"], C_BASE, 0.008)
box("Base_IronPlate", (BCX, 0, 0.0975), (BL - 0.04, BW - 0.04, 0.025), M["iron"], C_BASE, 0.004)
box("Base_WoodTop", (BCX - 0.25, 0, 0.12), (BL - 0.62, BW - 0.16, 0.02), M["wood"], C_BASE, 0.004)
# viền đồng + chân
for sx in (BX0 + 0.06, BX1 - 0.06):
    for sy in (BY0 + 0.06, BY1 - 0.06):
        box(f"Foot_{sx:.1f}_{sy:.1f}", (sx, sy, 0.008), (0.14, 0.14, 0.03), M["brass"], C_BASE, 0.006)
        box(f"CornerCap_{sx:.1f}_{sy:.1f}", (sx, sy, 0.05), (0.13, 0.13, 0.075), M["brass"], C_BASE, 0.006)
for sy in (BY0, BY1):
    box(f"Trim_Y{sy:.2f}", (BCX, sy, 0.10), (BL, 0.012, 0.03), M["brass"], C_BASE, 0.002)
    rivet_line(f"BaseRiv_Y{sy:.2f}", (BX0 + 0.15, sy - 0.008 * (1 if sy > 0 else -1), 0.10),
               (BX1 - 0.15, sy - 0.008 * (1 if sy > 0 else -1), 0.10), 26, 0.006, M["brass2"], C_BASE)
for sx in (BX0, BX1):
    box(f"Trim_X{sx:.2f}", (sx, 0, 0.10), (0.012, BW, 0.03), M["brass"], C_BASE, 0.002)

# ================================================================== PAPER FEEDER
PX0, PX1 = -0.82, 0.48                 # chiều rộng giấy (theo X)
PW = PX1 - PX0; PCX = (PX0 + PX1) / 2
FRAME_X = (PX0 - 0.09, PX1 + 0.09)     # hai khung gang hai bên

ROLL_Y, ROLL_Z, ROLL_R = 0.33, 0.62, 0.13      # cuộn giấy chính (phía sau, trên cao)
FR_Y, FR_Z, FR_R = -0.44, 0.237, 0.06           # trục cuộn trước
BED_Z = 0.30                                   # mặt bàn viết

# --- khung gang (side frames) dạng gothic với lỗ khoét
for i, fx in enumerate(FRAME_X):
    # tấm khung chính tạo bằng mesh profile
    prof = [(-0.56, 0.13), (0.45, 0.13), (0.45, 0.42), (0.36, 0.52), (0.36, 0.78), (0.26, 0.84),
            (0.16, 0.78), (0.10, 0.40), (-0.30, 0.34), (-0.50, 0.34), (-0.56, 0.24)]
    bm = bmesh.new()
    vs = [bm.verts.new((0, y, z)) for y, z in prof]
    f = bm.faces.new(vs)
    ex = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ex["geom"] if isinstance(e, bmesh.types.BMVert)]: v.co.x += 0.035
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(f"SideFrame{i}"); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(f"SideFrame{i}", me); scene.collection.objects.link(o)
    o.location = (fx - 0.0175, 0, 0)
    # lỗ khoét trang trí
    for j, (cy_, cz_, rr) in enumerate([(-0.30, 0.25, 0.055), (-0.08, 0.25, 0.055), (0.15, 0.26, 0.05), (0.26, 0.62, 0.05)]):
        bpy.ops.mesh.primitive_cylinder_add(vertices=6 if j < 3 else 32, radius=rr, depth=0.2,
                                            location=(fx, cy_, cz_), rotation=(0, math.pi / 2, 0))
        cu = bpy.context.object
        md = o.modifiers.new("hole", 'BOOLEAN'); md.object = cu; md.solver = 'EXACT'
        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=md.name)
        bpy.data.objects.remove(cu)
    finish(o, M["iron"], C_FEED, 0.004, smooth=False)
    side = -1 if i == 0 else 1
    # viền đồng quanh lỗ
    for (cy_, cz_, rr) in [(-0.30, 0.25, 0.055), (-0.08, 0.25, 0.055), (0.15, 0.26, 0.05)]:
        torus(f"FrameHoleRing{i}_{cy_}", (fx + side * 0.019, cy_, cz_), rr, 0.006, M["brass"], C_FEED, rot=(0, math.pi / 2, 0))
    rivet_line(f"FrameRiv{i}", (fx + side * 0.02, -0.52, 0.16), (fx + side * 0.02, 0.42, 0.16), 14, 0.006, M["brass2"], C_FEED)
    # ổ trục (bearing block) cho cuộn giấy & trục trước
    for (yy, zz, nm) in [(ROLL_Y, ROLL_Z, "Roll"), (FR_Y, FR_Z, "Front"), (0.05, BED_Z - 0.03, "Mid")]:
        cyl(f"Bearing{nm}{i}", (fx + side * 0.03, yy, zz), 0.045, 0.04, M["brass"], C_FEED, axis='X')
        cyl(f"BearingCap{nm}{i}", (fx + side * 0.055, yy, zz), 0.025, 0.02, M["brass2"], C_FEED, axis='X')
        rivet_ring(f"BearRiv{nm}{i}", (fx + side * 0.05, yy, zz), 0.035, 6, 0.004, M["iron"], C_FEED, axis='X')

# --- cuộn giấy chính (có các lớp cuộn ở mặt đầu)
cyl("PaperRoll_Main", (PCX, ROLL_Y, ROLL_Z), ROLL_R, PW, M["paper"], C_FEED, axis='X', verts=96, bevel=0.003)
for k in range(9):  # vân xoắn ở hai đầu cuộn
    rr = ROLL_R - 0.006 - k * 0.011
    for sx in (PX0 - 0.001, PX1 + 0.001):
        torus(f"RollLayer{k}_{sx:.2f}", (sx, ROLL_Y, ROLL_Z), rr, 0.0012, M["bronze"], C_FEED, rot=(0, math.pi / 2, 0))
cyl("PaperRoll_Core", (PCX, ROLL_Y, ROLL_Z), 0.03, PW + 0.012, M["wood"], C_FEED, axis='X')
cyl("PaperRoll_Shaft", (PCX, ROLL_Y, ROLL_Z), 0.016, PW + 0.34, M["iron"], C_FEED, axis='X')
cyl("FrontRoller", (PCX, FR_Y, FR_Z), FR_R, PW + 0.03, M["paper"], C_FEED, axis='X', verts=64)
cyl("FrontRoller_Shaft", (PCX, FR_Y, FR_Z), 0.016, PW + 0.34, M["iron"], C_FEED, axis='X')
for sx in (PX0 - 0.01, PX1 + 0.01):
    cyl(f"FrontRoller_Flange{sx:.2f}", (sx, FR_Y, FR_Z), FR_R + 0.012, 0.012, M["brass"], C_FEED, axis='X')

# --- dải giấy chạy từ cuộn sau -> bàn viết -> cuộn trước
def paper_profile2():
    pts = []
    p0 = Vector((ROLL_Y - ROLL_R * 0.995, ROLL_Z - 0.01))
    p1 = Vector((ROLL_Y - ROLL_R - 0.03, ROLL_Z - 0.25))
    p2 = Vector((0.16, BED_Z + 0.003)); p3 = Vector((0.0, BED_Z + 0.003))
    for t in range(20):
        u = t / 19
        q = (1-u)**3*p0 + 3*(1-u)**2*u*p1 + 3*(1-u)*u**2*p2 + u**3*p3
        pts.append((q.x, q.y))
    # bàn viết phẳng tới gần cuộn trước, rồi dốc xuống tiếp tuyến đỉnh cuộn
    top = (FR_Y, FR_Z + FR_R + 0.003)
    for t in range(1, 10):
        u = t / 9
        y = 0.0 + (top[0] - 0.0) * u
        z = BED_Z + 0.003
        pts.append((y, z))
    # quấn quanh cuộn trước: từ đỉnh (90°) đi về phía -Y (phía trước) xuống đáy
    for t in range(1, 20):
        a = math.radians(90 + t * 9.0)
        pts.append((FR_Y + math.cos(a) * (FR_R + 0.003), FR_Z + math.sin(a) * (FR_R + 0.003)))
    return pts

prof = paper_profile2()
bm = bmesh.new()
rows = []
for (y, z) in prof:
    rows.append((bm.verts.new((PX0 + 0.01, y, z)), bm.verts.new((PX1 - 0.01, y, z))))
uv_layer = bm.loops.layers.uv.new()
L = 0; lens = [0]
for i in range(1, len(prof)):
    L += (Vector(prof[i]) - Vector(prof[i - 1])).length; lens.append(L)
for i in range(len(rows) - 1):
    a, b_ = rows[i]; c_, d = rows[i + 1]
    f = bm.faces.new((a, b_, d, c_))
    for lp, uv in zip(f.loops, [(0, lens[i]), (1, lens[i]), (1, lens[i + 1]), (0, lens[i + 1])]):
        lp[uv_layer].uv = (uv[0], uv[1] / L)
me = bpy.data.meshes.new("PaperSheet"); bm.to_mesh(me); bm.free()
sheet = bpy.data.objects.new("PaperSheet", me); scene.collection.objects.link(sheet)
sol = sheet.modifiers.new("thick", 'SOLIDIFY'); sol.thickness = 0.0015
finish(sheet, M["paper"], C_FEED)

# --- chữ viết tay trên giấy (text objects nằm trên mặt bàn viết)
script_lines = [
    "Machina scribit verba aeterna, per rotas et vapores,",
    "atramentum fluit sicut tempus et charta volvitur,",
    "ingenium hominis in metallo vivit et numquam dormit,",
    "rotae canunt, vapor suspirat, calamus saltat,",
    "et omnis littera memoriam temporis servat.",
]
LINE_X0, LINE_Y0, LINE_DY = PX0 + 0.08, -0.04, 0.062
for i, line in enumerate(script_lines + ["quod scribitur manet, et nunc manus aenea"]):
    bpy.ops.object.text_add(location=(LINE_X0 + (i % 2) * 0.03, LINE_Y0 - i * LINE_DY, BED_Z + 0.0048))
    t = bpy.context.object
    t.name = f"Handwriting_{i}" if i < len(script_lines) else "Handwriting_current"
    t.data.body = line; t.data.size = 0.04; t.data.shear = 0.35; t.data.offset = 0.0007
    t.data.materials.append(M["ink"]); link(t, C_FEED)
bpy.context.view_layer.update()
cur = bpy.data.objects["Handwriting_current"]
PEN_TIP_X = cur.location.x + cur.dimensions.x + 0.004
PEN_TIP_Y = cur.location.y + 0.008

# --- bánh xe lớn có nan hoa (bên trái) + hệ bánh răng truyền động
LX = FRAME_X[0] - 0.07
gear("BigWheel_Left", (LX, -0.05, 0.40), 0.24, 0.035, 60, M["brass"], C_FEED, axis='X', spokes=8)
gear("Gear_RollDrive_L", (LX + 0.01, ROLL_Y, ROLL_Z), 0.09, 0.025, 28, M["brass"], C_FEED, axis='X', hole=0.02)
gear("Gear_Idler_L", (LX + 0.035, 0.22, 0.42), 0.07, 0.02, 22, M["bronze"], C_FEED, axis='X', hole=0.015)
gear("Gear_FrontDrive_L", (LX + 0.01, FR_Y, FR_Z), 0.075, 0.022, 24, M["brass"], C_FEED, axis='X', hole=0.016)
cyl("Pulley_Left", (LX - 0.04, -0.05, 0.40), 0.05, 0.03, M["iron"], C_FEED, axis='X')
# bánh răng phía phải khung
RX = FRAME_X[1] + 0.06
gear("Gear_RollDrive_R", (RX, ROLL_Y, ROLL_Z), 0.08, 0.025, 26, M["brass"], C_FEED, axis='X', hole=0.018)
gear("Gear_Worm_R", (RX + 0.01, 0.05, 0.42), 0.06, 0.03, 18, M["bronze"], C_FEED, axis='X', hole=0.014)
gear("Gear_FrontDrive_R", (RX, FR_Y, FR_Z), 0.07, 0.022, 22, M["brass"], C_FEED, axis='X', hole=0.015)
gear("Gear_Small_R", (RX + 0.03, -0.28, 0.24), 0.05, 0.02, 16, M["brass2"], C_FEED, axis='X', hole=0.01)

# --- thanh dẫn hướng, ray, thanh ngang
for (yy, zz, r) in [(-0.53, 0.17, 0.014), (0.40, 0.17, 0.014), (-0.30, 0.20, 0.010), (0.05, BED_Z - 0.03, 0.02)]:
    cyl(f"TieRod_{yy:.2f}_{zz:.2f}", (PCX, yy, zz), r, PW + 0.26, M["brass2"] if r < 0.02 else M["iron"], C_FEED, axis='X')
# bàn viết (platen) phía dưới giấy
box("WritingBed", (PCX, -0.15, BED_Z - 0.012), (PW + 0.02, 0.54, 0.022), M["bronze"], C_FEED, 0.004)
for yy in (-0.40, 0.10):
    box(f"BedSupport_{yy}", (PCX, yy, (BED_Z + 0.13) / 2 - 0.01), (PW - 0.1, 0.04, BED_Z - 0.15), M["iron"], C_FEED, 0.004)
# ray trượt dài phía trước (như trong ảnh)
cyl("FrontRail_A", (BCX + 0.2, -0.56, 0.155), 0.016, BL - 0.5, M["brass2"], C_FEED, axis='X')
cyl("FrontRail_B", (BCX + 0.2, -0.50, 0.135), 0.012, BL - 0.5, M["brass"], C_FEED, axis='X')
for xx in (BX0 + 0.25, 0.0, 0.7, BX1 - 0.25):
    box(f"RailClamp_{xx:.2f}", (xx, -0.53, 0.145), (0.05, 0.1, 0.05), M["iron"], C_FEED, 0.005)
# cơ cấu piston ngang bên trái phía trước
for k, (yy, zz) in enumerate([(-0.20, 0.20), (-0.10, 0.18)]):
    cyl(f"Piston_Cyl{k}", (PX0 - 0.35, yy, zz), 0.03, 0.22, M["brass"], C_FEED, axis='Y', rot=(0, math.pi / 2, 0))
    cyl(f"Piston_Rod{k}", (PX0 - 0.17, yy, zz), 0.010, 0.2, M["brass2"], C_FEED, axis='X')

# ================================================================== ROBOT ARM
AX, AY = 1.00, -0.15           # tâm đế tay robot (căn giữa vùng viết theo Y)
TURRET_TOP = 0.50
# --- đế tròn nhiều tầng (gỗ + đồng + bánh răng vòng)
cyl("ArmBase_Wood", (AX, AY, 0.20), 0.30, 0.17, M["wood"], C_ARM, verts=96, bevel=0.006)
for zz in (0.12, 0.285):
    cyl(f"ArmBase_BrassBand{zz}", (AX, AY, zz), 0.305, 0.022, M["brass"], C_ARM, verts=96)
    rivet_ring(f"ArmBaseRiv{zz}", (AX, AY, zz), 0.307, 36, 0.0055, M["brass2"], C_ARM)
gear("ArmBase_RingGear", (AX, AY, 0.315), 0.29, 0.04, 96, M["brass"], C_ARM, hole=0.2)
cyl("ArmBase_Plate", (AX, AY, 0.34), 0.25, 0.02, M["iron"], C_ARM, verts=96)
cyl("Turret_Lower", (AX, AY, 0.385), 0.2, 0.07, M["bronze"], C_ARM, verts=96)
gear("Turret_Gear", (AX, AY, 0.43), 0.19, 0.025, 72, M["brass2"], C_ARM, hole=0.1)
cyl("Turret_Upper", (AX, AY, 0.47), 0.13, 0.06, M["brass"], C_ARM, verts=64)
rivet_ring("TurretRiv", (AX, AY, 0.385), 0.202, 24, 0.006, M["brass2"], C_ARM)
gear("Turret_DriveGear", (AX - 0.17, AY - 0.20, 0.43), 0.06, 0.025, 20, M["brass"], C_ARM, hole=0.01)
cyl("Turret_Motor", (AX - 0.17, AY - 0.20, 0.38), 0.045, 0.08, M["copper"], C_ARM)

# --- IK đơn giản: vai -> khuỷu -> cổ tay -> ngòi bút
SH = Vector((AX, AY, 0.62))           # khớp vai
TIP = Vector((PEN_TIP_X, PEN_TIP_Y, BED_Z + 0.005))  # đầu ngòi
PEN_LEN = 0.20
WRIST = TIP + Vector((0, 0, PEN_LEN + 0.05))
L1, L2 = 1.02, 0.98           # tổng 2.0 m > khoảng cách tới góc giấy xa nhất (~1.84 m)
d = WRIST - SH
hdir = Vector((d.x, d.y, 0)).normalized()
dh, dz = Vector((d.x, d.y)).length, d.z
D = math.hypot(dh, dz)
cos_e = (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2)
elbow_int = math.acos(max(-1, min(1, cos_e)))
a_shoulder = math.atan2(dz, dh) + math.acos(max(-1, min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))))
ELB = SH + hdir * (math.cos(a_shoulder) * L1) + Vector((0, 0, math.sin(a_shoulder) * L1))
yaw = math.atan2(hdir.y, hdir.x)
side_v = Vector((-hdir.y, hdir.x, 0))   # trục khớp ngang

# cột đỡ vai (yoke) 2 tấm bên
for s in (-1, 1):
    p = SH + side_v * 0.11 * s
    box(f"ShoulderYoke{s}", (p.x, p.y, (TURRET_TOP + SH.z) / 2 + 0.02), (0.14, 0.03, SH.z - TURRET_TOP + 0.08),
        M["iron"], C_ARM, 0.006, rot=(0, 0, yaw))
cyl("Shoulder_Column", (AX, AY, 0.53), 0.08, 0.06, M["brass2"], C_ARM)

def joint(name, center, r, w, axis_v, gear_teeth=40, with_clock=False):
    q = axis_v.to_track_quat('Z', 'Y')
    rot = q.to_euler()
    cyl(name + "_Housing", center, r, w, M["copper"], C_ARM, rot=rot, verts=64)
    for s in (-1, 1):
        g = gear(name + f"_Gear{s}", center + axis_v * (w / 2 + 0.012) * s, r * 1.08, 0.02, gear_teeth,
                 M["brass"], C_ARM, hole=r * 0.25)
        g.rotation_mode = 'QUATERNION'; g.rotation_quaternion = q
        cyl(name + f"_Cap{s}", center + axis_v * (w / 2 + 0.03) * s, r * 0.45, 0.02, M["brass2"], C_ARM, rot=rot)
        cyl(name + f"_Bolt{s}", center + axis_v * (w / 2 + 0.045) * s, r * 0.18, 0.02, M["iron"], C_ARM, rot=rot, verts=6)
        # bulông lục giác quanh nắp
        for k in range(8):
            a = TAU * k / 8
            loc_ = Matrix.Translation(center + axis_v * (w / 2 + 0.024) * s) @ q.to_matrix().to_4x4() @ Vector((math.cos(a) * r * 0.7, math.sin(a) * r * 0.7, 0))
            sphere(name + f"_Riv{s}_{k}", loc_, 0.007, M["iron"], C_ARM, seg=8)
    if with_clock:
        c0 = center + axis_v * (w / 2 + 0.05) * -1
        cyl(name + "_ClockBezel", c0, r * 0.62, 0.02, M["brass2"], C_ARM, rot=rot)
        cyl(name + "_ClockFace", c0 - axis_v * 0.011, r * 0.52, 0.003, M["dial"], C_ARM, rot=rot)
        for k in range(12):
            a = TAU * k / 12
            m4 = Matrix.Translation(c0 - axis_v * 0.0135) @ q.to_matrix().to_4x4()
            sphere(name + f"_Tick{k}", m4 @ Vector((math.cos(a) * r * 0.44, math.sin(a) * r * 0.44, 0)), 0.004, M["black"], C_ARM, seg=6)
        m4 = Matrix.Translation(c0 - axis_v * 0.014) @ q.to_matrix().to_4x4()
        cyl_between(name + "_HandH", m4 @ Vector((0, 0, 0)), m4 @ Vector((r * 0.28, r * 0.12, 0)), 0.0025, M["black"], C_ARM, verts=6)
        cyl_between(name + "_HandM", m4 @ Vector((0, 0, 0)), m4 @ Vector((-r * 0.1, r * 0.42, 0)), 0.002, M["black"], C_ARM, verts=6)

joint("ShoulderJoint", SH, 0.11, 0.16, side_v, 44, with_clock=True)
joint("ElbowJoint", ELB, 0.085, 0.13, side_v, 36)

def limb(name, a, b, r, main_mat):
    a, b = Vector(a), Vector(b); v = (b - a); n = v.normalized()
    s, e = a + n * 0.08, b - n * 0.07
    cyl_between(name + "_Tube", s, e, r, main_mat, C_ARM, verts=48)
    # đai đồng + đinh tán dọc thân
    for k, u in enumerate((0.0, 0.33, 0.66, 1.0)):
        p = s.lerp(e, u)
        cyl_between(name + f"_Band{k}", p - n * 0.012, p + n * 0.012, r * 1.08, M["brass"], C_ARM, verts=48)
    # hộp cơ khí phía trên + piston thuỷ lực song song
    up = n.cross(side_v).normalized()
    if up.z < 0: up = -up
    cyl_between(name + "_HydCyl", s + up * (r + 0.03), s.lerp(e, 0.6) + up * (r + 0.03), 0.022, M["brass2"], C_ARM)
    cyl_between(name + "_HydRod", s.lerp(e, 0.6) + up * (r + 0.03), e + up * (r + 0.03), 0.01, M["iron"], C_ARM)
    for p_ in (s + up * (r + 0.03), e + up * (r + 0.03)):
        cyl_between(name + "_HydMount", p_ - up * (r + 0.03), p_, 0.012, M["iron"], C_ARM)
    # tấm ốp hai bên
    for sgn in (-1, 1):
        mid = s.lerp(e, 0.5) + side_v * sgn * (r + 0.006)
        q = n.to_track_quat('Z', 'Y')
        bpy.ops.mesh.primitive_cube_add(size=1, location=mid)
        pl = bpy.context.object; pl.name = name + f"_SidePlate{sgn}"
        pl.rotation_mode = 'QUATERNION'
        # local axes: Z dọc thân, X = side
        mat3 = Matrix((side_v, up, n)).transposed()
        pl.rotation_quaternion = mat3.to_quaternion()
        pl.scale = (0.008, r * 1.2, (e - s).length * 0.55)
        bpy.ops.object.transform_apply(scale=True)
        finish(pl, M["iron"], C_ARM, 0.003, smooth=False)
        for k in range(6):
            u = 0.24 + k * 0.104
            for vv in (-1, 1):
                sphere(name + f"_PRiv{sgn}_{k}_{vv}", s.lerp(e, u) + side_v * sgn * (r + 0.011) + up * vv * r * 0.45,
                       0.005, M["brass2"], C_ARM, seg=8)
    return up

up1 = limb("UpperArm", SH, ELB, 0.078, M["copper"])
up2 = limb("Forearm", ELB, WRIST, 0.06, M["copper"])

# --- cổ tay + đầu bút
cyl_between("Wrist_Block", WRIST + Vector((0, 0, 0.06)), WRIST - Vector((0, 0, 0.02)), 0.05, M["brass"], C_ARM)
gear("Wrist_Gear", WRIST + Vector((0, 0, 0.0)), 0.06, 0.018, 24, M["brass2"], C_ARM, hole=0.02)
cyl_between("PenHolder_Body", WRIST - Vector((0, 0, 0.02)), WRIST - Vector((0, 0, 0.13)), 0.034, M["iron"], C_ARM)
for k, z in enumerate((0.04, 0.08, 0.12)):
    cyl_between(f"PenHolder_Ring{k}", WRIST - Vector((0, 0, z - 0.007)), WRIST - Vector((0, 0, z + 0.007)), 0.038, M["brass2"], C_ARM)
# ống mực thuỷ tinh cạnh đầu bút
INKP = WRIST + side_v * 0.07 + Vector((0, 0, -0.04))
cyl_between("InkReservoir_Glass", INKP + Vector((0, 0, 0.06)), INKP - Vector((0, 0, 0.06)), 0.022, M["glass"], C_ARM)
cyl_between("InkReservoir_CapTop", INKP + Vector((0, 0, 0.07)), INKP + Vector((0, 0, 0.055)), 0.026, M["brass"], C_ARM)
cyl_between("InkReservoir_CapBot", INKP - Vector((0, 0, 0.055)), INKP - Vector((0, 0, 0.07)), 0.026, M["brass"], C_ARM)
cyl_between("InkReservoir_Bracket", INKP, WRIST - Vector((0, 0, 0.04)), 0.008, M["brass"], C_ARM)
# thân bút + ngòi kim loại
cyl_between("Pen_Barrel", WRIST - Vector((0, 0, 0.13)), TIP + Vector((0, 0, 0.06)), 0.014, M["black"], C_ARM)
bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=0.014, radius2=0.0012, depth=0.06, location=TIP + Vector((0, 0, 0.03)),
                                rotation=(math.pi, 0, 0))
nib = bpy.context.object; nib.name = "Pen_Nib"
nib.scale = (1, 0.45, 1); bpy.ops.object.transform_apply(scale=True)
finish(nib, M["brass2"], C_ARM)
cyl_between("Pen_NibSlit", TIP + Vector((0, 0, 0.0005)), TIP + Vector((0, 0, 0.03)), 0.0012, M["black"], C_ARM, verts=6)

# --- ống dẫn hơi/dây cáp quấn quanh tay
H = [
    ("Hose_A", [SH + Vector((0, 0, -0.1)) + side_v * 0.18, SH + side_v * 0.2 + up1 * 0.15, SH.lerp(ELB, 0.5) + up1 * 0.16 + side_v * 0.09,
                ELB + up1 * 0.14 + side_v * 0.1, ELB.lerp(WRIST, 0.5) + up2 * 0.11 + side_v * 0.07, WRIST + Vector((0, 0, 0.06)) + side_v * 0.05], 0.011),
    ("Hose_B", [Vector((AX + 0.12, AY + 0.15, 0.48)), SH + side_v * -0.2 + up1 * 0.05, SH.lerp(ELB, 0.4) + side_v * -0.11 + up1 * 0.1,
                ELB + side_v * -0.12 + up1 * 0.08, ELB.lerp(WRIST, 0.4) + side_v * -0.08, WRIST + side_v * -0.05 + Vector((0, 0, 0.03))], 0.009),
    ("Hose_C", [Vector((AX - 0.1, AY + 0.2, 0.48)), Vector((AX - 0.25, AY + 0.25, 0.70)), SH + side_v * -0.16 + Vector((0, 0, 0.12)),
                SH.lerp(ELB, 0.3) + up1 * 0.18], 0.008),
]
for nm, pts, r in H:
    hose(nm, pts, r, M["rubber"], C_ARM)


# ================================================================== RIG (armature + IK)
# Kéo empty "Pen_Target" trên mặt giấy -> cả tay robot tự xoay đế, gập vai/khuỷu theo.
bpy.ops.object.select_all(action='DESELECT')
arm_d = bpy.data.armatures.new("ArmRig"); rig = bpy.data.objects.new("ArmRig", arm_d)
C_ARM.objects.link(rig); arm_d.display_type = 'STICK'; rig.show_in_front = True
bpy.context.view_layer.objects.active = rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones
b_base = eb.new("Base");  b_base.head = (AX, AY, TURRET_TOP - 0.06); b_base.tail = SH
b_up = eb.new("Upper");   b_up.head = SH;    b_up.tail = ELB;  b_up.parent = b_base; b_up.use_connect = True
b_fo = eb.new("Fore");    b_fo.head = ELB;   b_fo.tail = WRIST; b_fo.parent = b_up;  b_fo.use_connect = True
b_pen = eb.new("Pen");    b_pen.head = WRIST; b_pen.tail = TIP; b_pen.parent = b_fo; b_pen.use_connect = True
for b in (b_up, b_fo): b.align_roll(side_v)      # trục Z cục bộ = trục khớp ngang
b_base.align_roll(hdir)
bpy.ops.object.mode_set(mode='POSE')
pb = rig.pose.bones
pb["Base"].lock_ik_x = pb["Base"].lock_ik_z = True           # đế chỉ xoay quanh trục đứng
for n in ("Upper", "Fore"):
    pb[n].lock_ik_x = pb[n].lock_ik_y = True                 # vai/khuỷu chỉ gập quanh trục ngang
pb["Fore"].use_ik_limit_z = True; pb["Fore"].ik_min_z, pb["Fore"].ik_max_z = math.radians(-160), math.radians(160)
bpy.ops.object.mode_set(mode='OBJECT')

def empty(name, loc, size, shape='SPHERE', parent=None):
    e = bpy.data.objects.new(name, None); e.empty_display_type = shape; e.empty_display_size = size
    C_ARM.objects.link(e); e.location = loc
    if parent: e.parent = parent; e.location = Vector(loc) - parent.location
    return e

pen_t = empty("Pen_Target", TIP, 0.04, 'SPHERE')                         # điều khiển chính
wrist_t = empty("Wrist_Target", WRIST, 0.025, 'CUBE', parent=pen_t)     # luôn ở trên ngòi bút
ik = pb["Fore"].constraints.new('IK'); ik.target = wrist_t; ik.chain_count = 3; ik.iterations = 800
dt = pb["Pen"].constraints.new('DAMPED_TRACK'); dt.target = pen_t           # bút luôn chĩa xuống ngòi
# giới hạn Pen_Target trong vùng viết của tờ giấy
lim = pen_t.constraints.new('LIMIT_LOCATION')
lim.use_min_x = lim.use_max_x = lim.use_min_y = lim.use_max_y = lim.use_min_z = lim.use_max_z = True
lim.min_x, lim.max_x = PX0 + 0.01, PX1 - 0.01
lim.min_y, lim.max_y = FR_Y + 0.02, 0.0
lim.min_z = lim.max_z = TIP.z

# gắn mesh vào xương
GROUPS = {
    "Base":  ("Turret_Upper", "Turret_Gear", "ShoulderYoke", "Shoulder_Column", "ShoulderJoint_"),
    "Upper": ("UpperArm_",),
    "Fore":  ("ElbowJoint_", "Forearm_"),
    "Pen":   ("Wrist_", "PenHolder_", "InkReservoir_", "Pen_Barrel", "Pen_Nib"),
}
bpy.context.view_layer.update()
for bone, prefixes in GROUPS.items():
    for o in list(C_ARM.objects):
        if o.parent is None and o.type in ('MESH', 'CURVE') and o.name.startswith(prefixes) and not o.name.startswith("Hose"):
            mw = o.matrix_world.copy()
            o.parent = rig; o.parent_type = 'BONE'; o.parent_bone = bone
            bpy.context.view_layer.update()
            o.matrix_world = mw

# ống dây: mỗi điểm điều khiển gắn hook vào một empty con của xương tương ứng
HOSE_BONES = {"Hose_A": ["Base", "Base", "Upper", "Fore", "Fore", "Pen"],
              "Hose_B": ["Base", "Base", "Upper", "Fore", "Fore", "Pen"],
              "Hose_C": ["Base", "Base", "Base", "Upper"]}
for hn, bones in HOSE_BONES.items():
    ho = bpy.data.objects[hn]
    for i, (bp, bn) in enumerate(zip(ho.data.splines[0].bezier_points, bones)):
        e = bpy.data.objects.new(f"{hn}_hook{i}", None); e.empty_display_size = 0.015
        C_ARM.objects.link(e); e.location = bp.co.copy()
        bpy.context.view_layer.update()
        mw = e.matrix_world.copy(); e.parent = rig; e.parent_type = 'BONE'; e.parent_bone = bn
        bpy.context.view_layer.update(); e.matrix_world = mw
        bpy.context.view_layer.update()
        hm = ho.modifiers.new(f"hook{i}", 'HOOK'); hm.object = e
        hm.vertex_indices_set([i * 3, i * 3 + 1, i * 3 + 2])
        hm.matrix_inverse = e.matrix_world.inverted()
        e.hide_viewport = False; e.hide_render = True

# hoạt cảnh: ngòi bút quét qua từng dòng từ mép trái tới mép phải khổ giấy
REST_TIP = TIP.copy()
f = 1
lines_y = [LINE_Y0 - i * LINE_DY + 0.008 for i in range(len(script_lines) + 1)]
for y in lines_y:
    for x, nf in ((PX0 + 0.02, 0), (PX1 - 0.02, 40)):
        f += nf
        pen_t.location = (x, y, TIP.z); pen_t.keyframe_insert("location", frame=f)
    f += 10
pen_t.location = REST_TIP; pen_t.keyframe_insert("location", frame=f + 10)
scene.frame_start, scene.frame_end = 1, f + 10
scene.frame_set(1)

# ================================================================== DETAILS (lọ mực, cần gạt, đồng hồ áp suất)
bx, by = 1.42, -0.22
cyl("InkBottle_Glass", (bx, by, 0.19), 0.04, 0.1, M["glass"], C_DECO)
cyl("InkBottle_Ink", (bx, by, 0.175), 0.036, 0.07, M["ink"], C_DECO)
cyl("InkBottle_Neck", (bx, by, 0.255), 0.016, 0.03, M["glass"], C_DECO)
bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.022, radius2=0.002, depth=0.05, location=(bx, by, 0.295))
finish(bpy.context.object, M["brass2"], C_DECO)
cyl("InkBottle_Tray", (bx, by, 0.135), 0.06, 0.014, M["brass"], C_DECO)
# đồng hồ áp suất
gx, gy = 1.42, 0.30
cyl("Gauge_Stem", (gx, gy, 0.18), 0.01, 0.1, M["brass"], C_DECO)
cyl("Gauge_Body", (gx, gy, 0.26), 0.05, 0.03, M["brass2"], C_DECO, axis='Y')
cyl("Gauge_Face", (gx, gy - 0.016, 0.26), 0.042, 0.002, M["dial"], C_DECO, axis='Y')
cyl_between("Gauge_Needle", (gx, gy - 0.018, 0.26), (gx + 0.025, gy - 0.018, 0.28), 0.0018, M["black"], C_DECO, verts=6)
# hộp điều khiển + cần gạt
box("ControlBox", (1.32, -0.50, 0.16), (0.16, 0.10, 0.08), M["bronze"], C_DECO, 0.006)
for k in range(3):
    cyl_between(f"Lever{k}", (1.27 + k * 0.05, -0.50, 0.20), (1.27 + k * 0.05, -0.53, 0.26), 0.005, M["brass2"], C_DECO)
    sphere(f"LeverKnob{k}", (1.27 + k * 0.05, -0.53, 0.265), 0.012, M["black"], C_DECO)
# trục truyền nối từ đế robot sang khung giấy
cyl("DriveShaft_ArmToFeeder", ((RX + 1.3) / 2, 0.36, 0.17), 0.014, 1.3 - RX, M["brass2"], C_DECO, axis='X')
for xx in (RX + 0.10, 1.28):
    gear(f"DriveShaft_Gear{xx:.2f}", (xx, 0.36, 0.17), 0.045, 0.018, 16, M["brass"], C_DECO, axis='X', hole=0.01)

# ================================================================== LIGHTING / CAMERA / RENDER
world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True
wn = world.node_tree.nodes; wl = world.node_tree.links
bg = wn["Background"]; bg.inputs["Color"].default_value = (0.42, 0.36, 0.30, 1); bg.inputs["Strength"].default_value = 0.35
bg2 = wn.new("ShaderNodeBackground"); bg2.inputs["Color"].default_value = (1, 1, 1, 1); bg2.inputs["Strength"].default_value = 3.0
lp = wn.new("ShaderNodeLightPath"); mx = wn.new("ShaderNodeMixShader")
wl.new(lp.outputs["Is Camera Ray"], mx.inputs[0]); wl.new(bg.outputs[0], mx.inputs[1]); wl.new(bg2.outputs[0], mx.inputs[2])
wl.new(mx.outputs[0], wn["World Output"].inputs[0])

def area(name, loc, size, energy, color=(1, 0.95, 0.88)):
    ld = bpy.data.lights.new(name, 'AREA'); ld.size = size; ld.energy = energy; ld.color = color
    o = bpy.data.objects.new(name, ld); scene.collection.objects.link(o); o.location = loc
    tr = o.constraints.new('TRACK_TO'); tr.target = target; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
    return o

target = bpy.data.objects.new("CamTarget", None); scene.collection.objects.link(target); target.location = (0.25, 0, 0.35)
area("Key", (-1.5, -2.5, 3.0), 2.5, 700)
area("Fill", (3.0, -1.2, 1.6), 2.0, 300, (0.9, 0.95, 1))
area("Rim", (0.5, 3.0, 2.5), 2.0, 600)

# sàn trắng (shadow catcher)
bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, -0.007))
fl = bpy.context.object; fl.name = "Floor"; fl.is_shadow_catcher = True
fl.data.materials.append(mat_basic("Floor", (1, 1, 1), 0.6))

cam_d = bpy.data.cameras.new("Camera"); cam_d.lens = 50
cam = bpy.data.objects.new("Camera", cam_d); scene.collection.objects.link(cam); scene.camera = cam
cam.location = (-1.9, -3.1, 2.0)
tr = cam.constraints.new('TRACK_TO'); tr.target = target; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'

scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1536, 1024
scene.render.film_transparent = False
scene.view_settings.view_transform = 'AgX'
print("BUILD DONE:", len(bpy.data.objects), "objects")
