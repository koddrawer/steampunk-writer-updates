// Máy 3D: nạp GLB, vật liệu, khớp tay robot (IK), ống dây, giấy cuộn, bánh răng truyền động.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';

// Thông số hình học (toạ độ Blender: X ngang, Y sâu, Z lên) – khớp với build_scene.py
export const G = {
  PX0: -0.82, PX1: 0.48, ROLL_Y: 0.33, ROLL_Z: 0.62, ROLL_R: 0.13,
  FR_Y: -0.44, FR_Z: 0.237, FR_R: 0.06, BED_Z: 0.30,
};
function deriveG() { G.SHEET_X0 = G.PX0 + 0.01; G.SHEET_X1 = G.PX1 - 0.01; G.SHEET_W = G.SHEET_X1 - G.SHEET_X0; G.PAPER_Z = G.BED_Z + 0.003; }
deriveG();
// vùng viết trên bàn (Blender Y): mép trên, mép dưới, chỗ đỗ bút – mỗi model một khác
export const AREA = { ytop: -0.035, ymin: G.FR_Y + 0.025, park: [G.SHEET_X1 - 0.06, -0.22] };

export const b2t = (x, y, z) => new THREE.Vector3(x, z, -y);       // Blender -> three
const v3 = a => b2t(a[0], a[1], a[2]);

// Bộ truyền động: góc quay theo quãng giấy đã chạy s (m) và góc xoay đế yaw
const TEETH = { front: 24, frontR: 22, big: 60, rollL: 28, idler: 22, rollR: 26, worm: 18, small: 16, turret: 72, turretDrive: 20 };
function gearAngles(s, dyaw) {
  const thF = s / G.FR_R, thR = s / G.ROLL_R;
  return {
    FrontAssembly: thF, Gear_FrontDrive_L: thF, Gear_FrontDrive_R: thF,
    RollAssembly: thR, Gear_RollDrive_L: thR, Gear_RollDrive_R: thR,
    // trục truyền chung: bánh đà lớn + puli bên trái và bánh vít bên phải cùng một trục -> quay cùng góc
    BigWheel_Left: -thF * TEETH.front / TEETH.big, Pulley_Left: -thF * TEETH.front / TEETH.big, Gear_Worm_R: -thF * TEETH.front / TEETH.big,
    Gear_Idler_L: -thR * TEETH.rollL / TEETH.idler,
    // 2 bánh răng nhỏ hai bên ăn khớp với bánh răng trục giấy trước (quay ngược chiều)
    Gear_Small_R: -thF * TEETH.front / TEETH.small, 'Gear_Small_R.001': -thF * TEETH.frontR / TEETH.small,
    DriveShaft_ArmToFeeder: thF * 2.5, 'DriveShaft_Gear0.73': thF * 2.5, 'DriveShaft_Gear1.28': thF * 2.5,
    Turret_DriveGear: -dyaw * TEETH.turret / TEETH.turretDrive,
  };
}

// ---------- shader nhiễu (oxi hoá kim loại, vân gỗ) – toạ độ object nên không "trượt" khi chi tiết quay
const NOISE = `
varying vec3 vOPos;
float h3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
 return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*n3(p); p*=2.03; a*=.5;} return s; }
`;
function patch(mat, kind, opts = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vOPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOPos = position;');
    sh.fragmentShader = NOISE + sh.fragmentShader;
    if (kind === 'metal') {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <color_fragment>', `#include <color_fragment>
          float nM = fbm(vOPos*${(opts.scale || 22).toFixed(1)});
          float grime = smoothstep(0.52, 0.78, nM);
          diffuseColor.rgb *= mix(1.0, ${(opts.dark || 0.45).toFixed(2)}, grime);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor*(0.65+0.9*nM), 0.06, 1.0);`);
    } else if (kind === 'wood') {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          vec3 wp = vOPos*vec3(1.0, 14.0, 1.0);
          float ring = sin((vOPos.y*38.0 + fbm(vOPos*vec3(2.0,9.0,2.0))*9.0)) *0.5+0.5;
          float fine = fbm(vOPos*vec3(3.0,90.0,40.0));
          vec3 c1 = vec3(0.032,0.012,0.005), c2 = vec3(0.15,0.06,0.026);
          diffuseColor.rgb = mix(c1, c2, ring*0.7 + fine*0.4);`);
    }
  };
  mat.customProgramCacheKey = () => kind + JSON.stringify(opts);
  return mat;
}

function makeMaterials(tex) {
  const L = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
  const metal = (c, rough, o) => patch(new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: rough }), 'metal', o);
  return {
    'Brass': metal(L(0.62, 0.40, 0.12), 0.32),
    'Brass_Polished': metal(L(0.80, 0.56, 0.20), 0.2, { dark: 0.7 }),
    'Copper': metal(L(0.62, 0.26, 0.12), 0.3),
    'Bronze': metal(L(0.32, 0.20, 0.09), 0.42),
    'DarkIron': metal(L(0.10, 0.095, 0.09), 0.5, { dark: 0.6, scale: 15 }),
    'Wood_Walnut': patch(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.25 }), 'wood'),
    'ClockFace': new THREE.MeshStandardMaterial({ color: L(0.92, 0.88, 0.78), roughness: 0.4 }),
    'BlackLacquer': new THREE.MeshStandardMaterial({ color: L(0.015, 0.015, 0.015), roughness: 0.2 }),
    'Ink': new THREE.MeshStandardMaterial({ color: L(0.02, 0.015, 0.01), roughness: 0.25 }),
    'Glass_InkBottle': new THREE.MeshPhysicalMaterial({ color: L(0.35, 0.16, 0.06), roughness: 0.05, transparent: true, opacity: 0.55, metalness: 0, clearcoat: 1 }),
    'Hose_Rubber': new THREE.MeshStandardMaterial({ color: L(0.04, 0.03, 0.025), roughness: 0.55 }),
    'PaperRoll': new THREE.MeshStandardMaterial({ map: tex.diffuse, normalMap: tex.normal, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.9, color: 0xf2e6cf }),
    'Paper_Parchment': new THREE.MeshStandardMaterial({ map: tex.diffuseRoller, roughness: 0.9, color: 0xe9dcc2 }),
  };
}

export class Machine {
  constructor(scene, base) { this.scene = scene; this.base = base; this.s = 0; this.root = new THREE.Group(); scene.add(this.root); }

  async load(onProgress) {
    const meta = await (await fetch(this.base + 'machine.json')).json();
    this.meta = meta;
    if (meta.G) { Object.assign(G, meta.G); deriveG(); }
    if (meta.write) { AREA.ytop = meta.write.ytop; AREA.ymin = meta.write.ymin; AREA.park = meta.write.park; }
    else { AREA.ymin = G.FR_Y + 0.025; AREA.park = [G.SHEET_X1 - 0.06, -0.22]; }
    const tl = new THREE.TextureLoader();
    const ld = (f) => new Promise(r => tl.load(this.base + f, t => r(t), undefined, () => r(null)));
    const [diff, norm] = await Promise.all([ld(meta.paperTextures.diffuse || 'paper_diffuse.jpg'), ld(meta.paperTextures.normal || 'paper_normal.jpg')]);
    for (const t of [diff, norm]) if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
    if (diff) diff.colorSpace = THREE.SRGBColorSpace;
    const rollDiff = diff ? diff.clone() : null; if (rollDiff) { rollDiff.repeat.set(3, 1); rollDiff.needsUpdate = true; }
    this.tex = { diffuse: rollDiff, normal: norm, sheetDiffuse: diff, diffuseRoller: diff };
    this.mats = makeMaterials(this.tex);

    const gltf = await new GLTFLoader().loadAsync(this.base + 'machine.glb', e => onProgress && onProgress(e.loaded / (e.total || 9e6)));
    const model = gltf.scene; this.root.add(model);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const n = o.material && o.material.name;
      let m = this.mats[n];
      if (n === 'Cold Pressed Paper - 01' || /Paper/i.test(n || '') && !m) m = this.mats.PaperRoll;
      if (m) o.material = m;
      else if (meta.material && o.material) {               // model ảnh nướng (Tripo): chỉnh độ bóng cho hợp đèn
        o.material.roughness = meta.material.roughness ?? o.material.roughness;
        o.material.metalness = meta.material.metalness ?? o.material.metalness;
        if (o.material.map) o.material.map.anisotropy = 8;
      }
    });
    model.updateMatrixWorld(true);
    const byName = (n) => model.getObjectByName(n) || model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));

    // ---- bánh răng / trục quay: pivot ở tâm, quay quanh trục world
    this.spin = [];
    for (const [name, sp] of Object.entries(meta.spin)) {
      const obj = byName(name); if (!obj) continue;
      const piv = new THREE.Group(); piv.position.copy(v3(sp.center)); this.root.add(piv); piv.updateMatrixWorld();
      piv.attach(obj);
      const ax = b2t(...sp.axis).normalize();
      this.spin.push({ name, piv, ax });
    }

    // ---- tay robot
    const B = meta.bones;
    this.SH = v3(B.Upper[0]); this.ELB0 = v3(B.Upper[1]); this.W0 = v3(B.Fore[1]); this.TIP0 = v3(B.Pen[1]);
    this.L1 = this.SH.distanceTo(this.ELB0); this.L2 = this.ELB0.distanceTo(this.W0);
    this.penVec = this.W0.clone().sub(this.TIP0);                                 // ngòi bút -> cổ tay (giữ nguyên hướng, chỉ xoay theo đế)
    this.AX = meta.yawAxis ? v3(meta.yawAxis) : this.SH.clone(); this.AX.y = this.SH.y;   // trục xoay đứng của đế
    this.shOff = this.SH.clone().sub(this.AX);
    this.yaw0 = Math.atan2(-(this.TIP0.z - this.AX.z), this.TIP0.x - this.AX.x);
    if (!meta.yawAxis) this.yaw0 = Math.atan2(-(this.W0.z - this.SH.z), this.W0.x - this.SH.x);
    const yawP = new THREE.Group(); yawP.position.copy(this.AX); this.root.add(yawP);
    const shP = new THREE.Group(); shP.position.copy(this.shOff); yawP.add(shP);
    const elP = new THREE.Group(); elP.position.copy(this.ELB0).sub(this.SH); shP.add(elP);
    const penP = new THREE.Group(); penP.position.copy(this.W0); this.root.add(penP);
    this.root.updateMatrixWorld(true);
    const parts = { Base: byName('Arm_Base'), Upper: byName('Arm_Upper'), Fore: byName('Arm_Fore'), Pen: byName('Arm_Pen') };
    if (parts.Base) yawP.attach(parts.Base);
    if (parts.Upper) shP.attach(parts.Upper);
    if (parts.Fore) elP.attach(parts.Fore);
    if (parts.Pen) penP.attach(parts.Pen);
    Object.assign(this, { yawP, shP, elP, penP, parts });
    this.root.updateMatrixWorld(true);

    // ---- ống dây: điểm điều khiển gắn vào nhóm chi tiết tương ứng
    this.hoses = meta.hoses.map(h => {
      const pts = h.points.map((p, i) => {
        const g = parts[h.bones[i]] || parts.Base;
        return { g, local: g.worldToLocal(v3(p)) };
      });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mats.Hose_Rubber);
      mesh.castShadow = true; this.root.add(mesh);
      return { pts, mesh, r: h.radius };
    });

    this.buildSheet();
    this.tip = this.TIP0.clone();
    this.setPen(this.TIP0.x, -this.TIP0.z, this.TIP0.y);
    return this;
  }

  // ---- tờ giấy chạy từ cuộn sau -> bàn viết -> quấn cuộn trước (giống hồ sơ trong Blender)
  buildSheet() {
    const prof = []; // [y, z] toạ độ Blender
    const bez = (p0, p1, p2, p3, u) => { const a = 1 - u; return [a*a*a*p0[0] + 3*a*a*u*p1[0] + 3*a*u*u*p2[0] + u*u*u*p3[0], a*a*a*p0[1] + 3*a*a*u*p1[1] + 3*a*u*u*p2[1] + u*u*u*p3[1]]; };
    const z0 = G.PAPER_Z;
    // đoạn ôm cuộn chính (để giấy "dính" vào cuộn)
    for (let i = 0; i <= 16; i++) { const a = Math.PI * 0.5 + (Math.PI * 0.5 * 0.985) * i / 16;
      prof.push([G.ROLL_Y + Math.cos(a) * (G.ROLL_R + 0.0015), G.ROLL_Z + Math.sin(a) * (G.ROLL_R + 0.0015)]); }
    const p0 = [G.ROLL_Y - G.ROLL_R * 0.995, G.ROLL_Z - 0.01], p1 = [G.ROLL_Y - G.ROLL_R - 0.03, G.ROLL_Z - 0.25], p2 = [0.16, z0], p3 = [0, z0];
    for (let i = 1; i <= 40; i++) prof.push(bez(p0, p1, p2, p3, i / 40));
    this.bedStartIdx = prof.length - 1;
    // trục trước cao hơn mặt bàn (model mới): thêm đoạn dốc lên đỉnh trục
    const frTop = G.FR_Z + G.FR_R + 0.003, ramp = Math.max(0, frTop - z0) > 0.005 ? Math.min(0.5, (frTop - z0) * 8) : 0;
    for (let i = 1; i <= 40; i++) prof.push([(G.FR_Y + ramp) * i / 40, z0]);
    if (ramp) for (let i = 1; i <= 8; i++) { const u = i / 8, e = u * u * (3 - 2 * u); prof.push([G.FR_Y + ramp * (1 - u), z0 + (frTop - z0) * e]); }
    for (let i = 1; i <= 36; i++) { const a = Math.PI / 2 + i * (Math.PI * 0.95) / 36; prof.push([G.FR_Y + Math.cos(a) * (G.FR_R + 0.003), G.FR_Z + Math.sin(a) * (G.FR_R + 0.003)]); }
    const cum = [0]; for (let i = 1; i < prof.length; i++) cum.push(cum[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    this.sheetLen = cum[cum.length - 1]; this.aBed0 = cum[this.bedStartIdx];
    this.inkStart = this.meta && this.meta.write ? Math.max(0, this.arcAt(AREA.ytop + 0.06)) : 0;
    const pos = [], uv = [], idx = [];
    prof.forEach(([y, z], i) => {
      for (const [k, x] of [[0, G.SHEET_X0], [1, G.SHEET_X1]]) { const p = b2t(x, y, z); pos.push(p.x, p.y, p.z); uv.push(k, 1 - cum[i] / this.sheetLen); }
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    this.sheetGeo = geo;
  }
  // độ dài cung (từ đầu tờ giấy) của điểm y trên bàn viết
  arcAt(y) { return this.aBed0 + (0 - y); }

  attachPaper(paper, opts = {}) {
    this.paper = paper;
    const m = paper.material(this.tex.sheetDiffuse, this.tex.normal, this.sheetLen, opts);
    this.sheet = new THREE.Mesh(this.sheetGeo, m);
    this.sheet.receiveShadow = true; this.sheet.castShadow = false;
    this.root.add(this.sheet);
  }

  // ---- IK: đặt ngòi bút tại (x,y) bed (Blender) với độ cao z
  setPen(x, y, z) {
    const T = b2t(x, y, z); this.tip.copy(T);
    const up = new THREE.Vector3(0, 1, 0);
    let yaw;
    if (this.meta.yawAxis) yaw = Math.atan2(-(T.z - this.AX.z), T.x - this.AX.x);
    else { const W1 = T.clone().add(this.penVec); yaw = Math.atan2(-(W1.z - this.SH.z), W1.x - this.SH.x); }
    const dy0 = yaw - this.yaw0;
    const W = T.clone().add(this.penVec.clone().applyAxisAngle(up, dy0));
    const SHw = this.AX.clone().add(this.shOff.clone().applyAxisAngle(up, dy0));
    const d = W.clone().sub(SHw);
    const dh = Math.hypot(d.x, d.z) || 1e-6;
    let D = Math.hypot(dh, d.y);
    D = Math.min(Math.max(D, Math.abs(this.L1 - this.L2) + 1e-3), this.L1 + this.L2 - 1e-4);
    const a = Math.atan2(d.y, dh) + Math.acos(THREE.MathUtils.clamp((this.L1 ** 2 + D * D - this.L2 ** 2) / (2 * this.L1 * D), -1, 1));
    const hd = new THREE.Vector3(d.x / dh, 0, d.z / dh);
    const E = SHw.clone().addScaledVector(hd, Math.cos(a) * this.L1); E.y += Math.sin(a) * this.L1;
    const dy = dy0; this.dyaw = dy;
    this.yawP.rotation.set(0, dy, 0);
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dy);
    const u0 = this.ELB0.clone().sub(this.SH).normalize();
    const u1 = E.clone().sub(SHw).applyQuaternion(qy.clone().invert()).normalize();
    const q1 = new THREE.Quaternion().setFromUnitVectors(u0, u1);
    this.shP.quaternion.copy(q1);
    const f0 = this.W0.clone().sub(this.ELB0).normalize();
    const f1 = W.clone().sub(E).applyQuaternion(qy.clone().multiply(q1).invert()).normalize();
    this.elP.quaternion.setFromUnitVectors(f0, f1);
    this.penP.position.copy(W); this.penP.rotation.set(0, dy, 0);
  }

  setPaperS(s) { this.s = s; }

  update() {
    const ang = gearAngles(this.s, this.dyaw || 0);
    for (const g of this.spin) { const a = ang[g.name]; if (a !== undefined) g.piv.quaternion.setFromAxisAngle(g.ax, a); }
    this.root.updateMatrixWorld(true);
    for (const h of this.hoses) {
      const pts = h.pts.map(p => p.g.localToWorld(p.local.clone()));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      h.mesh.geometry.dispose();
      h.mesh.geometry = new THREE.TubeGeometry(curve, 64, h.r, 8, false);
    }
  }
}
