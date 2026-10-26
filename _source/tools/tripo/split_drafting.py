"""Cắt model Tripo 'steampunk drafting machine' (1 khối lưới liền) thành các phần chuyển động cho app.
python3 split_drafting.py <in.glb> <out_dir> [k_stretch]
- bỏ tờ giấy nướng sẵn chữ (app tự vẽ giấy)
- tách: Arm_Base (đế xoay), Arm_Upper, Arm_Fore, Arm_Pen, RollAssembly (cuộn sau), FrontAssembly (trục trước), Static
- kéo dài cánh tay (đoạn giữa ống) để ngòi bút với tới hết khổ giấy
- đổi đơn vị: khổ giấy = 1.30 m, đặt đầu bàn viết tại Y=0 (toạ độ Blender) giống model cũ
"""
import sys, os, json, numpy as np, trimesh

src, out = sys.argv[1], sys.argv[2]
K = float(sys.argv[3]) if len(sys.argv) > 3 else 1.27
os.makedirs(out, exist_ok=True)
sc = trimesh.load(src, force='scene'); m = list(sc.geometry.values())[0]
V = m.vertices.copy(); F = m.faces; UV = m.visual.uv; mat = m.visual.material
C = V[F].mean(1)
N = m.face_normals

# ---------------- số đo trong toạ độ glTF gốc (đo bằng tia + ảnh chiếu)
A = np.array([0.289, 0.253])                  # trục xoay đế (x,z)
d = np.array([-0.4620, -0.1040]); d /= np.linalg.norm(d)   # hướng tay (từ đế ra ngòi bút) trên mặt phẳng ngang
l = np.array([-d[1], d[0]])
def uvy(P):
    rel = P[:, [0, 2]] - A
    return rel @ d, rel @ l, P[:, 1]
J = {'SH': (-0.014, 0.334), 'E': (0.190, 0.505), 'W': (0.355, 0.361), 'T': (0.481, 0.166)}
ROLL = dict(z=-0.334, y=0.365, r=0.087); FR = dict(z=0.440, y=0.130, r=0.034)
PX = (-0.425, -0.075)

u, v, y = uvy(C)
def seg_dist(pu, py, a, b):
    a = np.array(a); b = np.array(b); ab = b - a; L = np.linalg.norm(ab)
    t = ((pu - a[0]) * ab[0] + (py - a[1]) * ab[1]) / (L * L)
    tc = np.clip(t, 0, 1)
    return np.hypot(pu - (a[0] + ab[0] * tc), py - (a[1] + ab[1] * tc)), t * L
part = np.full(len(F), 'Static', dtype=object)

# ---------------- giấy nướng sẵn: bỏ
rr = np.hypot(C[:, 2] - ROLL['z'], C[:, 1] - ROLL['y'])
rf = np.hypot(C[:, 2] - FR['z'], C[:, 1] - FR['y'])
inX = (C[:, 0] > PX[0] - 0.008) & (C[:, 0] < PX[1] + 0.01)
paper = inX & (C[:, 2] > ROLL['z'] + 0.06) & (C[:, 2] < FR['z'] - 0.012) & (C[:, 1] > 0.140) & (C[:, 1] < 0.26) & (rr > ROLL['r'] + 0.006) & (N[:, 1] > 0.35)
# đoạn giấy rủ từ cuộn xuống bàn (mặt đứng)
r_, g_, b_ = None, None, None
img = np.asarray(mat.baseColorTexture.convert('RGB')); Hh, Ww, _ = img.shape
cu = UV[F].mean(1); colr = img[((1 - np.clip(cu[:, 1], 0, 1)) * (Hh - 1)).astype(int), (np.clip(cu[:, 0], 0, 1) * (Ww - 1)).astype(int)].astype(int)
creamy = (colr[:, 0] > 150) & (colr[:, 1] > 110) & (colr[:, 0] - colr[:, 2] > 25)
drop = inX & (C[:, 2] > ROLL['z'] + 0.05) & (C[:, 2] < -0.12) & (C[:, 1] > 0.15) & (C[:, 1] < 0.40) & (rr > ROLL['r'] + 0.003) & creamy
paper = paper | drop
part[paper] = 'DROP'
# cuộn giấy sau + trục trước
part[inX & (rr < ROLL['r'] + 0.008) & (rr > 0.02)] = 'RollAssembly'
part[(C[:, 0] > PX[0] - 0.01) & (C[:, 0] < PX[1] + 0.012) & (rf < FR['r'] + 0.006)] = 'FrontAssembly'

# ---------------- tay robot
near = (np.abs(v) < 0.11)
dU, tU = seg_dist(u, y, J['SH'], J['E'])
dF, tF = seg_dist(u, y, J['E'], J['W'])
dP, tP = seg_dist(u, y, J['W'], J['T'])
dSH = np.hypot(u - J['SH'][0], y - J['SH'][1])
dE = np.hypot(u - J['E'][0], y - J['E'][1])
dW = np.hypot(u - J['W'][0], y - J['W'][1])
col = (np.hypot(*(C[:, [0, 2]] - A).T) < 0.14) & (y > 0.212) & (y < 0.30)
arm = near & (y > 0.163) & (part == 'Static')
best = np.full(len(F), '', dtype=object)
cand = np.stack([np.where(dU < 0.095, dU, 9), np.where(dF < 0.085, dF, 9), np.where((dP < 0.075) & (u > J['W'][0] - 0.05), dP, 9)], 1)
k = cand.argmin(1); ok = cand.min(1) < 9
names = np.array(['Arm_Upper', 'Arm_Fore', 'Arm_Pen'])
best[ok] = names[k[ok]]
best[(dE < 0.075)] = 'Arm_Upper'
best[(dW < 0.045)] = 'Arm_Pen'             # khớp cổ tay + hộp mực đi cùng đầu bút
best[(dSH < 0.08)] = 'Arm_Base'
best[(dU < 0.058) & (tU > 0.035)] = 'Arm_Upper'          # ống tay trên sát vai
best[col] = 'Arm_Base'
# mảnh lơ lửng trên cao gần tay: theo đoạn gần nhất
hi = near & (y > 0.40) & (u > -0.05) & (u < 0.5) & (best == '')
kk = np.stack([dU, dF, dP], 1).argmin(1)
best[hi] = names[kk[hi]]
# thanh piston treo dưới tay trên (nối về đế): đi cùng tay trên
rod = near & (u > -0.02) & (u < 0.16) & (y > 0.25) & (y < 0.48) & (best == '') & ~col
best[rod] = 'Arm_Upper'
# mọi thứ phía trên đầu bút (hộp mực, núm, dây) đi cùng đầu bút
pen_hi = (np.abs(v) < 0.075) & (u > J['W'][0] - 0.02) & (u < 0.62) & (y > 0.25) & (best == '')
best[pen_hi] = 'Arm_Pen'
sel = arm & (best != '')
part[sel] = best[sel]
# phía sau đế (ống dây sau vai) cũng thuộc đế xoay
back = near & (u < 0.02) & (u > -0.16) & (y > 0.24) & (part == 'Static') & (y < 0.62)
part[back] = 'Arm_Base'
print({p: int((part == p).sum()) for p in set(part)})

# ---------------- kéo dài tay: dời đỉnh theo đoạn
SH, E, W, T = [np.array(J[n]) for n in ('SH', 'E', 'W', 'T')]
L1, L2 = np.linalg.norm(E - SH), np.linalg.norm(W - E)
d1, d2 = (E - SH) / L1, (W - E) / L2
e1, e2 = (K - 1) * L1, (K - 1) * L2
r0 = 0.075
def ramp(t, L): return np.clip((t - r0) / (L - 2 * r0), 0, 1)
newV = []      # mỗi phần có bản sao đỉnh riêng
def shift_uvy(P, which):
    pu, pv, py = uvy(P)
    add = np.zeros((len(P), 2))
    if which == 'Arm_Upper':
        t = (pu - SH[0]) * d1[0] + (py - SH[1]) * d1[1]; add += np.outer(ramp(t, L1) * e1, d1)
    if which == 'Arm_Fore':
        add += e1 * d1
        t = (pu - E[0]) * d2[0] + (py - E[1]) * d2[1]; add += np.outer(ramp(t, L2) * e2, d2)
    if which == 'Arm_Pen':
        add += e1 * d1 + e2 * d2
    Q = P.copy()
    Q[:, 0] += add[:, 0] * d[0]; Q[:, 2] += add[:, 0] * d[1]; Q[:, 1] += add[:, 1]
    return Q
sh1 = e1 * d1; sh2 = e1 * d1 + e2 * d2
Jn = {'SH': SH, 'E': E + sh1, 'W': W + sh2, 'T': T + sh2}

# ---------------- đổi đơn vị + vị trí (glTF -> three của app)
S = 1.30 / (PX[1] - PX[0])
BED0_Z = -0.10                                   # đầu bàn viết phẳng (glTF z) -> Y=0
OFF = np.array([0.7725, 0.0, -BED0_Z * S])       # three = S*gltf + OFF
OFF[0] = -0.17 - S * (PX[0] + PX[1]) / 2         # giữa khổ giấy trùng model cũ (x=-0.17)
def to3(P): return P * S + OFF
def b(P3): return [float(P3[0]), float(-P3[2]), float(P3[1])]      # three -> Blender
def uy2g(uu, yy): return np.array([A[0] + uu * d[0], yy, A[1] + uu * d[1]])

scene = trimesh.Scene()
for p in ['Static', 'Arm_Base', 'Arm_Upper', 'Arm_Fore', 'Arm_Pen', 'RollAssembly', 'FrontAssembly']:
    fi = np.where(part == p)[0]
    if not len(fi): continue
    vi, inv = np.unique(F[fi].ravel(), return_inverse=True)
    P = V[vi]
    if p in ('Arm_Upper', 'Arm_Fore', 'Arm_Pen'): P = shift_uvy(P, p)
    mesh = trimesh.Trimesh(to3(P), inv.reshape(-1, 3), process=False,
                           visual=trimesh.visual.TextureVisuals(uv=UV[vi], material=mat))
    scene.add_geometry(mesh, node_name=p, geom_name=p)
scene.export(os.path.join(out, 'machine.glb'))

# ---------------- thông số cho app (toạ độ Blender, đơn vị m)
g = lambda P: b(to3(P))
bones = {n: g(uy2g(*Jn[n])) for n in Jn}
axis_b = g(np.array([A[0], 0.22, A[1]]))
roll_c = g(np.array([0, ROLL['y'], ROLL['z']])); fr_c = g(np.array([0, FR['y'], FR['z']]))
bed_y = 0.150 * S
px0 = (PX[0] * S + OFF[0]); px1 = (PX[1] * S + OFF[0])
Gm = {'PX0': px0, 'PX1': px1, 'ROLL_Y': roll_c[1], 'ROLL_Z': roll_c[2], 'ROLL_R': ROLL['r'] * S + 0.004,
      'FR_Y': fr_c[1], 'FR_Z': fr_c[2], 'FR_R': FR['r'] * S + 0.004, 'BED_Z': bed_y}
base_y = (A[1] * S + OFF[2]) * -1
meta = {
  'G': Gm,
  'yawAxis': axis_b,
  'bones': {'Base': [axis_b, bones['SH']], 'Upper': [bones['SH'], bones['E']], 'Fore': [bones['E'], bones['W']], 'Pen': [bones['W'], bones['T']]},
  'hoses': [], 'spin': {
    'RollAssembly': {'center': roll_c, 'axis': [1, 0, 0]}, 'FrontAssembly': {'center': fr_c, 'axis': [1, 0, 0]}},
  'paperTextures': {'diffuse': '../../paper_diffuse.jpg', 'normal': '../../paper_normal.jpg'},
  'write': {'ytop': base_y + 0.42, 'ymin': base_y - 0.34, 'park': [px1 - 0.08, base_y + 0.05]},
  'scale': S, 'stretch': K,
  'material': {'roughness': 0.62, 'metalness': 0.25},
  'cams': {
    'main':  {'pos': [-0.17, 3.0, 3.25], 'target': [-0.17, 0.57, 1.18], 'fov': 42},
    'donor': {'pos': [-0.17, 2.75, 3.15], 'target': [-0.17, 0.56, 1.30], 'fov': 34},
    'quote': {'pos': [-0.17, 4.9, 4.0], 'target': [-0.17, 0.56, 1.20], 'fov': 52}},
  'lights': {
    'key': {'pos': [-2.6, 5.6, 4.6], 'target': [0.2, 0.5, 0.8], 'box': 3.6, 'far': 16},
    'spot': {'pos': [-1.7, 5.2, 3.4], 'target': [-0.17, 0.56, 1.25], 'far': 16, 'angle': 0.62},
    'rim': {'pos': [2.5, 3.2, -3.6]},
    'glow': {'pos': [2.2, 2.0, 2.4], 'dist': 6.5}},
}
json.dump(meta, open(os.path.join(out, 'machine.json'), 'w'), indent=1)
print(json.dumps(meta, indent=1))
