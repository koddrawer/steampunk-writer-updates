"""Xuất model của người dùng sang GLB cho app (chạy bằng bpy).
python3 export_glb.py <in.blend> <out_dir>
"""
import bpy, sys, json, os, math
from mathutils import Vector

src, out = sys.argv[-2], sys.argv[-1]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src)
scene = bpy.context.scene
vl = bpy.context.view_layer
rig = bpy.data.objects["ArmRig"]

# ---------- 1. rest pose + thông số xương
rig.data.pose_position = 'REST'
vl.update()
B = {b.name: (list(rig.matrix_world @ b.head_local), list(rig.matrix_world @ b.tail_local)) for b in rig.data.bones}
meta = {"bones": B}

# ---------- 2. ống dây: điểm điều khiển + xương
hoses = []
for hn in ("Hose_A", "Hose_B", "Hose_C"):
    ho = bpy.data.objects.get(hn)
    if not ho: continue
    pts = [list(ho.matrix_world @ bp.co) for bp in ho.data.splines[0].bezier_points]
    bones = []
    for i in range(len(pts)):
        hm = ho.modifiers.get(f"hook{i}")
        bones.append(hm.object.parent_bone if hm and hm.object else "Base")
    hoses.append({"name": hn, "points": pts, "bones": bones, "radius": ho.data.bevel_depth})
meta["hoses"] = hoses

# ---------- 3. texture giấy của người dùng
paper_tex = {}
pm = bpy.data.materials.get("Cold Pressed Paper - 01")
if pm and pm.node_tree:
    for nd in pm.node_tree.nodes:
        if nd.type == 'TEX_IMAGE' and nd.image:
            n = nd.image.name.lower()
            kind = "normal" if "normal" in n else "bump" if "bump" in n else "diffuse" if "diffuse" in n else None
            if kind and kind != "bump":
                img = nd.image
                img.filepath_raw = os.path.join(out, f"paper_{kind}.jpg"); img.file_format = 'JPEG'
                img.save(filepath=os.path.join(out, f"paper_{kind}.jpg"))
                paper_tex[kind] = f"paper_{kind}.jpg"
meta["paperTextures"] = paper_tex

# ---------- 4. gỡ xương: giữ transform world ở tư thế rest
arm_children = {}
for o in list(bpy.data.objects):
    if o.parent == rig and o.type in ('MESH',):
        mw = o.matrix_world.copy()
        arm_children.setdefault(o.parent_bone, []).append(o)
        o.parent = None; o.matrix_world = mw
vl.update()

# ---------- 5. xoá những thứ app tự dựng lại
kill = [o for o in bpy.data.objects if o.type in ('EMPTY', 'ARMATURE', 'LIGHT', 'CAMERA', 'FONT', 'CURVE')
        or o.name in ("PaperSheet", "Floor")]
for o in kill:
    bpy.data.objects.remove(o, do_unlink=True)

# ---------- 6. áp dụng modifier cho mọi mesh
bpy.ops.object.select_all(action='DESELECT')
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    o.select_set(True)
vl.objects.active = meshes[0]
# con của bánh xe nan hoa: gộp vào cha trước
bpy.ops.object.convert(target='MESH')
vl.update()

def join(objs, active, name):
    objs = [o for o in objs if o and o.name in bpy.data.objects]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        o.select_set(True)
    vl.objects.active = active
    active.select_set(True)
    if len(objs) > 1:
        bpy.ops.object.join()
    active.name = name
    return active

def by_prefix(*p):
    return [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(p)]

O = bpy.data.objects
# bánh xe lớn + nan hoa + moay-ơ
bw = O["BigWheel_Left"]
join([bw] + [c for c in bw.children], bw, "BigWheel_Left")

# ---------- 7. nhóm chuyển động
groups = {}
for bone, objs in arm_children.items():
    objs = [o for o in objs if o.name in O]
    if objs:
        groups["Arm_" + bone] = join(objs, objs[0], "Arm_" + bone)

roll = join(by_prefix("PaperRoll_", "RollLayer"), O["PaperRoll_Shaft"], "RollAssembly")
front = join(by_prefix("FrontRoller"), O["FrontRoller_Shaft"], "FrontAssembly")

SPIN = ["BigWheel_Left", "Pulley_Left", "Gear_RollDrive_L", "Gear_Idler_L", "Gear_FrontDrive_L",
        "Gear_RollDrive_R", "Gear_Worm_R", "Gear_FrontDrive_R", "Gear_Small_R", "Gear_Small_R.001", "Gear_Small_L", "Turret_DriveGear",
        "DriveShaft_ArmToFeeder", "RollAssembly", "FrontAssembly"] + [o.name for o in by_prefix("DriveShaft_Gear")]
spin = {}
for n in SPIN:
    o = O.get(n)
    if not o: continue
    mw = o.matrix_world
    ax = Vector((mw[0][2], mw[1][2], mw[2][2])).normalized()
    spin[n] = {"center": list(mw.translation), "axis": list(ax)}
meta["spin"] = spin

# ---------- 8. gộp phần tĩnh theo vật liệu
moving = set(SPIN) | set(g.name for g in groups.values())
static = [o for o in O if o.type == 'MESH' and o.name not in moving]
bymat = {}
for o in static:
    m = o.data.materials[0].name if o.data.materials and o.data.materials[0] else "none"
    bymat.setdefault(m, []).append(o)
for m, objs in bymat.items():
    join(objs, objs[0], "Static_" + m.replace(" ", "_"))

# ---------- 9. vật liệu: bỏ node phức tạp (app tự dựng lại theo tên)
for m in bpy.data.materials:
    if not m.node_tree: continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    for n in list(nt.nodes):
        if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL'):
            nt.nodes.remove(n)
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    outn = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    nt.links.new(bsdf.outputs[0], outn.inputs[0])

for o in O:
    if o.type == 'MESH':
        o.data.shade_smooth() if False else None

bpy.ops.export_scene.gltf(filepath=os.path.join(out, "machine.glb"), export_format='GLB',
                          export_apply=True, export_yup=True, export_materials='EXPORT',
                          export_cameras=False, export_lights=False, export_animations=False,
                          export_extras=False)
json.dump(meta, open(os.path.join(out, "machine.json"), "w"), indent=1)
print("EXPORTED", [o.name for o in O])
