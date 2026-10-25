// ─── PEOPLE: the critic's rig (the player), plus the townsfolk (folk.js) ───
// critic.glb is built from flat colour materials (beret, hair, skin, sweater,
// jeans, shoe, sole), so one rig, re-coloured, gives the whole cast at the
// right human scale. Poses are written in the MODEL's axes (+X forward,
// +Y up, +Z to the right) and converted per bone at load, so a "swing forward"
// is a swing forward whatever way each bone happens to be rolled.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, ink, blobShadow } from './style.js';
import { makeFolk, poseFolk } from './folk.js';

export const HUMAN_SCALE = 0.13;           // ≈1.2 units tall
const FOOT = 4.593;                        // model units from the origin down to the soles

let _glb = null;
export function loadHuman() {
  if (!_glb) _glb = new Promise((res, rej) => new GLTFLoader().load('../models/critic.glb', (g) => { fixColors(g.scene); res(g); }, undefined, rej));
  return _glb;
}

// critic.glb assigns its colour regions wrongly (see the flat-colour part map):
//   • SKIN holds the face, both eyes, every lock of hair on the FRONT half of the head,
//     and the sweater cuffs at the wrists;
//   • HAIR holds only the back half of the hair;
//   • SWEATER holds the hair tips at the nape and over the shoulders;
//   • JEANS holds the hands.
// Each of those is its own connected piece of the mesh, so we recolour by PIECE: the
// largest piece on the head is the face (skin), the two little ones at eye height are
// the eyes, every other piece on the head is hair, the wrist pieces are sweater. The
// colours go in as absolute vertex colours; clones share the geometry, so this runs once.
export const CRITIC_SKIN = 0xefc3a2;     // the model's own #f9efe5 reads as blank paper in the gouache look
const EYE = 0x3a2a30;
// connected pieces of a mesh (vertices welded by position, then joined through triangles)
function pieces(g) {
  const P = g.attributes.position, n = P.count, par = Int32Array.from({ length: n }, (_, i) => i);
  const f = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const u = (a, b) => { a = f(a); b = f(b); if (a !== b) par[a] = b; };
  const seen = new Map();
  for (let v = 0; v < n; v++) { const k = Math.round(P.getX(v) * 1e4) + ',' + Math.round(P.getY(v) * 1e4) + ',' + Math.round(P.getZ(v) * 1e4); if (seen.has(k)) u(v, seen.get(k)); else seen.set(k, v); }
  const I = g.index ? g.index.array : null;
  if (I) for (let t = 0; t < I.length; t += 3) { u(I[t], I[t + 1]); u(I[t + 1], I[t + 2]); }
  const map = new Map();
  for (let v = 0; v < n; v++) {
    const r = f(v); if (!map.has(r)) map.set(r, { verts: [], min: new THREE.Vector3(9, 9, 9), max: new THREE.Vector3(-9, -9, -9) });
    const s = map.get(r); s.verts.push(v);
    const p = new THREE.Vector3(P.getX(v), P.getY(v), P.getZ(v)); s.min.min(p); s.max.max(p);
  }
  return [...map.values()].sort((a, b) => b.verts.length - a.verts.length);
}
function fixColors(root) {
  const mesh = {}; root.traverse(o => { if (o.isSkinnedMesh) mesh[o.material.name] = o; });
  const C = (hex) => new THREE.Color(hex);
  const skin = C(CRITIC_SKIN), hair = mesh.hair.material.color.clone(), eye = C(EYE);
  const paintVerts = (o, colourOf) => {
    const g = o.geometry, n = g.attributes.position.count, col = new Float32Array(n * 3), old = g.attributes.color, mc = o.material.color;
    for (let v = 0; v < n; v++) {   // default: the material colour × the model's baked shading
      const f = (i) => old ? old.getComponent(v, i) : 1;
      col[v * 3] = mc.r * f(0); col[v * 3 + 1] = mc.g * f(1); col[v * 3 + 2] = mc.b * f(2);
    }
    colourOf((v, c) => { col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }, col);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.userData.absColor = true;
  };
  // the knit: the sweater body's own baked grey
  const sw = mesh.sweater, swP = pieces(sw.geometry), body = swP[0], sc = sw.geometry.attributes.color;
  const knit = new THREE.Color(); for (const v of body.verts) knit.r += sc.getX(v), knit.g += sc.getY(v), knit.b += sc.getZ(v);
  knit.multiplyScalar(1 / body.verts.length).multiply(sw.material.color).multiplyScalar(1.1);
  // SWEATER: every piece above the collar is a hair tip
  paintVerts(sw, (set) => { for (const p of swP) if (p.min.y > 2.5) for (const v of p.verts) set(v, hair); });
  // SKIN: face, eyes, hair locks, cuffs
  const sk = mesh.skin, skP = pieces(sk.geometry);
  const headPieces = skP.filter(p => p.min.y > 2.5), face = headPieces[0];
  const isEye = (p) => p.verts.length < 60 && p.max.x - p.min.x < 0.1 && p.min.y > 3.1 && p.max.y < 3.7 && Math.abs((p.min.z + p.max.z) / 2) > 0.1;
  // the face's lower edge (her chin, tucked into the turtleneck) is a zigzag of teeth with
  // the collar's grey lining showing between them: level it down to the lowest tooth
  {
    const P = sk.geometry.attributes.position, NA = 64;
    let cx = 0, cz = 0; for (const v of face.verts) { cx += P.getX(v); cz += P.getZ(v); } cx /= face.verts.length; cz /= face.verts.length;
    const az = (v) => Math.min(NA - 1, Math.floor((Math.atan2(P.getZ(v) - cz, P.getX(v) - cx) / Math.PI + 1) / 2 * NA));
    const lo = new Float32Array(NA).fill(9);
    for (const v of face.verts) if (P.getY(v) < face.min.y + 0.3) lo[az(v)] = Math.min(lo[az(v)], P.getY(v));
    const sm = Array.from(lo, (_, k) => { let m = 9; for (let d = -3; d <= 3; d++) m = Math.min(m, lo[(k + d + NA) % NA]); return m; });
    for (const v of face.verts) { const y = P.getY(v), L = sm[az(v)]; if (L < 9 && y < L + 0.11 && y < 2.99) P.setY(v, L - 0.09); }   // (the mouth sits just above 3.0)
    sk.geometry.computeVertexNormals();
  }
  // a catchlight for each eye, placed on the head bone per instance (see makeHuman)
  root.userData.eyes = headPieces.filter(isEye).map(p => new THREE.Vector3(p.max.x + 0.012, p.min.y + (p.max.y - p.min.y) * 0.68, (p.min.z + p.max.z) / 2 + 0.04));
  paintVerts(sk, (set) => {
    for (const p of skP) {
      const c = p.max.y < 1.5 ? knit : p === face ? skin : isEye(p) ? eye : hair;
      for (const v of p.verts) set(v, c);
    }
  });
  // THE BERET. The model's own is broken past patching: its lower edge is a zigzag of
  // teeth with hair showing between them, it's notched on one side, and the model filled
  // the notch with face/hair geometry (the pale "lump"). So she gets a new one, modelled
  // to the old one's size and seat: a felt dome with a rounded hem, slouched a little to
  // her left, and the stalk on top. It's built here in the rig's bind space and put on
  // the head bone per instance (makeHuman); the old beret is hidden.
  {
    const bb = pieces(mesh.beret.geometry)[0];
    const cx = (bb.min.x + bb.max.x) / 2 + 0.02, cz = (bb.min.z + bb.max.z) / 2, rimY = 3.84;
    const R0 = 0.8, prof = [[0.001, 0.52], [0.55, 0.48], [R0 - 0.1, 0.16], [R0 - 0.05, 0.02], [R0 + 0.01, -0.01], [R0 + 0.07, 0.04],
      [R0 + 0.1, 0.17], [R0 + 0.09, 0.32], [R0 - 0.05, 0.52], [R0 * 0.55, 0.68], [0.001, 0.72]];
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 48);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    const geo = mergeVertices(g, 1e-4);
    geo.scale(1.0, 1.0, 0.88);                                   // oval, longer front-to-back
    geo.rotateX(0.12);                                           // slouched toward her left (+z)
    geo.rotateZ(0.06);                                           // and tipped a touch back
    geo.translate(cx, rimY, cz);
    const stalk = new THREE.LatheGeometry([[0.001, 0], [0.05, 0], [0.04, 0.1], [0.07, 0.13], [0.06, 0.17], [0.001, 0.18]].map(([r, y]) => new THREE.Vector2(r, y)), 12);
    stalk.deleteAttribute('uv'); stalk.deleteAttribute('normal');
    const st = mergeVertices(stalk, 1e-4); st.rotateX(0.12); st.rotateZ(0.06); st.translate(cx - 0.02, rimY + 0.7, cz + 0.08);
    geo.computeVertexNormals(); st.computeVertexNormals();
    root.userData.beret = { geo, stalk: st, color: mesh.beret.material.color.getHex() };
    mesh.beret.userData.hidden = true;
  }
  // the old beret's turned-up fold was modelled as separate scraps in the SKIN and HAIR
  // meshes (wide, sitting entirely at band height). They belong to the old hat — fold
  // them away to a point inside the new one. (Brows and eyes are small, so they're kept.)
  for (const [m, list] of [[sk, headPieces], [mesh.hair, pieces(mesh.hair.geometry)]]) {
    const P = m.geometry.attributes.position;
    for (const p of list) {
      if (p === face || isEye(p) || p.min.y < 3.45) continue;
      if (p.max.z - p.min.z < 0.5 && p.max.x - p.min.x < 0.5) continue;
      for (const v of p.verts) P.setXYZ(v, (p.min.x + p.max.x) / 2, 3.9, (p.min.z + p.max.z) / 2 * 0.5);
    }
    m.geometry.computeVertexNormals();
  }
  // the hair's crown must stay under the felt: for every hair point, cast a ray from inside
  // the head out through it; if it sits outside the beret along that ray, pull it back just
  // inside. (Exact, in bind space.)
  {
    const bm = new THREE.Mesh(root.userData.beret.geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const bb = new THREE.Box3().setFromBufferAttribute(root.userData.beret.geo.attributes.position);
    const C = new THREE.Vector3((bb.min.x + bb.max.x) / 2, 3.5, (bb.min.z + bb.max.z) / 2);
    const rc = new THREE.Raycaster(), p = new THREE.Vector3(), dir = new THREE.Vector3();
    const clamp = (g, verts) => {
      const P = g.attributes.position;
      for (const v of verts) {
        p.fromBufferAttribute(P, v); dir.subVectors(p, C); const len = dir.length(); if (len < 1e-4) continue; dir.divideScalar(len);
        rc.set(C, dir); rc.far = len + 0.5;
        const hit = rc.intersectObject(bm, false)[0];
        if (hit && hit.distance < len + 0.02) { const t = hit.distance - 0.04; P.setXYZ(v, C.x + dir.x * t, C.y + dir.y * t, C.z + dir.z * t); }
      }
      g.computeVertexNormals(); g.computeBoundingSphere();
    };
    // and just below the brim, nothing may bulge wider than the hem: ease it in
    const hemR = (bb.max.x - bb.min.x) / 2 * 0.86, hemY = bb.min.y;
    const tuck = (g, verts) => {
      const P = g.attributes.position;
      for (const v of verts) {
        const y = P.getY(v); if (y < hemY - 0.45 || y > hemY + 0.2) continue;
        const x = P.getX(v) - C.x, z = (P.getZ(v) - C.z) / 0.88, r = Math.hypot(x, z);
        if (r <= hemR) continue;
        const t = THREE.MathUtils.smoothstep(y, hemY - 0.45, hemY - 0.05), nr = r + (hemR - r) * t;
        P.setX(v, C.x + x / r * nr); P.setZ(v, C.z + z / r * nr * 0.88);
      }
    };
    const hv = [...Array(mesh.hair.geometry.attributes.position.count).keys()], sv = headPieces.filter(p => p !== face && !isEye(p)).flatMap(p => p.verts);
    tuck(mesh.hair.geometry, hv); tuck(sk.geometry, sv);
    clamp(mesh.hair.geometry, hv);
    clamp(sk.geometry, headPieces.filter(p => !isEye(p)).flatMap(p => p.verts));
  }
  // JEANS: the hands — skin below the cuff hem, sweater above it (the wrists reach up
  // inside the cuff and poked out past the sleeve's side)
  const jn = mesh.jeans, HEM = -0.6;
  const handBones = new Set(); jn.skeleton.bones.forEach((b, i) => { if (/hand/.test(b.name)) handBones.add(i); });
  paintVerts(jn, (set) => {
    const g = jn.geometry, P = g.attributes.position, si = g.attributes.skinIndex, sw2 = g.attributes.skinWeight;
    for (let v = 0; v < P.count; v++) {
      let w = 0; for (let k = 0; k < 4; k++) if (handBones.has(si.getComponent(v, k))) w += sw2.getComponent(v, k);
      if (w > 0.5) set(v, P.getY(v) > HEM ? knit : skin);
    }
  });
}

// the critic keeps her own colours; everyone else is their own person (folk.js)
export const LOOKS = {
  critic: {},
  vivi: { folk: true, skin: 'olive', hair: 0x2b1d1a, hairStyle: 'bun', glasses: true, stance: 'writing', top: 0x8e2f3a, outfit: 'coat', accent: 0xf3ead7,
    bottom: 0x2a2230, shoes: 0x6e2a2e, height: 1.05, build: 0.94,
    // the director: an oval face, worried brows, a tight anxious mouth, lashes, glasses, a sleek bun with a centre part
    face: { shape: { jaw: 0.25, chin: 0.45, cheeks: 0.25, long: 0.35, skull: 0.5, brow: 0.35 }, nose: 'straight', noseSize: 0.85, mouth: 'worried',
      eyes: 'round', brows: 'worried', browW: 0.8, lashes: true, glasses: true, hair: 'bun', blush: 0.7 } },
  otto: { folk: true, skin: 'rose', hair: 0x9a9490, hairStyle: 'crop', hat: 'cap', hatColor: 0x24304a, stance: 'torch', top: 0x3a4a68, outfit: 'uniform',
    bottom: 0x262c3c, shoes: 0x1e1a1c, sole: 0x6a5e54, height: 0.98, build: 1.16, belly: 0.8,
    // the night guard: a round, jowly face, heavy-lidded sleepy eyes, bushy grey brows, a big button nose, ruddy cheeks
    face: { shape: { jaw: 0.85, chin: 0.3, cheeks: 0.95, long: -0.25, skull: 0.4, brow: 0.6 }, nose: 'button', noseSize: 1.35, mouth: 'flat',
      eyes: 'sleepy', brows: 'heavy', browW: 1.6, browColor: 0x9a9490, hair: 'sides', blush: 1.3, blushColor: 0xe0806e } },
  pia: { folk: true, skin: 'brown', hair: 0x1d1a1a, hairStyle: 'pony', hat: 'helmet', hatColor: 0xe0b445, stance: 'coffee', top: 0x3f8f88, sleeve: 'short',
    outfit: 'vest', accent: 0xd6e04c, bottom: 0x3b4a5e, shoes: 0xe9e2d0, height: 0.95, build: 0.9,
    // the courier: a heart-shaped face, bright eyes, raised brows, a snub nose and a big grin
    face: { shape: { jaw: 0.15, chin: 0.6, cheeks: 0.6, long: 0.0, skull: 0.55, brow: 0.4 }, nose: 'snub', noseSize: 0.95, mouth: 'grin',
      eyes: 'round', eyeSize: 1.1, brows: 'raised', lashes: true, hair: 'pony', blush: 0.8, blushColor: 0xc86a5a } },
  rex: { folk: true, skin: 'fair', hair: 0x7a4a2a, hairStyle: 'crop', beard: true, stance: 'crossed', hat: 'flat', hatColor: 0x5b4636, top: 0x6f8a6a,
    outfit: 'apron', accent: 0xd8c9a8, bottom: 0x4a3a2c, height: 1.02, build: 1.08, belly: 0.4,
    // the framer (and suspect): a square jaw, a Roman nose, narrowed eyes, one brow up, a smirk in a trimmed beard
    face: { shape: { jaw: 1.0, chin: 0.85, cheeks: 0.35, long: 0.15, skull: 0.6, brow: 0.85 }, nose: 'roman', noseSize: 1.0, mouth: 'smirk',
      eyes: 'narrow', browsL: 'frown', browsR: 'raised', browW: 1.3, hair: 'crop', beard: true, blush: 0 } },
};

const AX = { fwd: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(0, 0, 1) };
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion();

// build one person from the loaded glb: re-coloured, toon-painted, inked
export function makeHuman(glb, look = {}) {
  const rig = skeletonClone(glb.scene);
  rig.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material, name = m.name;
    o.userData.part = name;                  // the model's part name (beret, hair, skin, sweater…) outlives the repaint
    // the hair locks are single-sided sheets: seen from behind they were culled and only
    // their outline drew (solid black) — so anything that carries hair is double-sided
    const side = ['hair', 'skin', 'sweater'].includes(name) ? THREE.DoubleSide : THREE.FrontSide;
    const soft = ['skin', 'hair', 'sweater'].includes(name);      // the pieces that carry her face and hair
    o.material = o.geometry.userData.absColor ? paint(0xffffff, { vertexColors: true, side, soft, hatch: soft ? 0.3 : 1 })
      : paint(look[name] ?? m.color.getHex(), { vertexColors: !!o.geometry.attributes.color, side, soft, hatch: soft ? 0.3 : 1 });
  });
  // the new beret (see fixColors), riding the head bone; the model's own is hidden
  const nb = glb.scene.userData.beret;
  if (nb) {
    let oldB = null, skinM = null;
    rig.traverse(o => { if (o.isSkinnedMesh && o.userData.part === 'beret') oldB = o; if (o.isSkinnedMesh && o.userData.part === 'skin') skinM = o; });
    if (oldB) { oldB.visible = false; oldB.userData.noInk = true; }
    const hi = skinM?.skeleton.bones.findIndex(b => b.name.replace(/\./g, '') === 'head');
    if (skinM && hi >= 0) {
      const toBone = skinM.skeleton.boneInverses[hi].clone().multiply(skinM.bindMatrix), felt = paint(look.beret ?? nb.color);
      for (const geo of [nb.geo, nb.stalk]) {
        const m = new THREE.Mesh(geo.clone().applyMatrix4(toBone), felt);
        m.userData.part = 'beret';
        skinM.skeleton.bones[hi].add(m);
      }
    }
  }
  // the eyes' catchlights: little white dots, riding the head bone
  const eyes = glb.scene.userData.eyes;
  if (eyes?.length) {
    let skinM = null; rig.traverse(o => { if (o.isSkinnedMesh && o.userData.part === 'skin') skinM = o; });
    const hi = skinM?.skeleton.bones.findIndex(b => b.name.replace(/\./g, '') === 'head');
    if (skinM && hi >= 0) {
      const toBone = skinM.skeleton.boneInverses[hi].clone().multiply(skinM.bindMatrix), white = paint(0xffffff, { hatch: 0, emissive: 0xffffff });
      for (const e of eyes) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8).scale(0.4, 1, 1), white);
        dot.position.copy(e).applyMatrix4(toBone); dot.quaternion.setFromRotationMatrix(toBone);
        dot.userData.noInk = true;
        skinM.skeleton.bones[hi].add(dot);
      }
    }
  }
  ink(rig, 'fine');
  const s = HUMAN_SCALE * (look.height ?? 1);
  rig.scale.set(s * (look.width ?? 1), s, s * (look.width ?? 1));
  rig.position.y = FOOT * s;
  rig.rotation.y = -Math.PI / 2;            // the model faces +X → turn it to +Z
  // each bone's bind rotation relative to the rig root, to convert model-space turns
  const inst = { rig, bones: {}, bind: {}, bw: {}, wc: Math.random() * 6, t: Math.random() * 10 };
  let root = null; rig.traverse(o => { if (o.name === 'CriticRig') root = o; });
  root = root || rig;
  root.updateWorldMatrix(true, true);
  // (decompose, not setFromRotationMatrix: the world matrices carry the 0.13 scale)
  const _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const worldQ = (o) => { const q = new THREE.Quaternion(); o.matrixWorld.decompose(_p, q, _s); return q; };
  const rootInv = worldQ(root).invert();
  rig.traverse(o => {
    if (!o.isBone) return;
    const k = o.name.replace(/\./g, '');
    inst.bones[k] = o; inst.bind[k] = o.quaternion.clone();
    inst.bw[k] = rootInv.clone().multiply(worldQ(o));
  });
  return inst;
}

// turn bone `n` by angle `a` about a MODEL axis, through its own joint
function turn(inst, n, axis, a) {
  const b = inst.bones[n]; if (!b || !a) return;
  const bw = inst.bw[n];
  _qa.setFromAxisAngle(axis, a);
  _q.copy(bw).invert().multiply(_qa).multiply(bw);     // Bw⁻¹ · Q · Bw
  b.quaternion.multiply(_q);
}

const BONES = ['hips', 'spine1', 'spine2', 'neck', 'head', 'upperlegL', 'lowerlegL', 'upperlegR', 'lowerlegR',
  'upperarmL', 'lowerarmL', 'upperarmR', 'lowerarmR', 'footL', 'footR'];

// k: 0 standing … 1 full walk. talk: 0…1 a little hand gesture while speaking
export function pose(inst, dt, k, { talk = 0, run = 0 } = {}) {
  if (inst.kind === 'folk') return poseFolk(inst, dt, k, { talk });
  if (!inst.bones.hips) return 0;
  inst.t += dt;
  inst.wc += dt * (5.6 + 2.4 * run) * (0.35 + 0.9 * k);
  const s = Math.sin(inst.wc), c = Math.cos(inst.wc);
  for (const n of BONES) if (inst.bones[n]) inst.bones[n].quaternion.copy(inst.bind[n]);
  const { fwd, up, side } = AX;
  const leg = (0.48 + 0.18 * run) * k, arm = (0.42 + 0.2 * run) * k;
  // legs swing forward/back about the side axis; the knee folds on the way through
  turn(inst, 'upperlegL', side, leg * s);
  turn(inst, 'upperlegR', side, -leg * s);
  // (the knee folds while its leg swings FORWARD — the thigh angle goes as s, so the
  // left leg travels forward while c > 0; folding it on the back-swing reads as moonwalking)
  turn(inst, 'lowerlegL', side, -(0.9 + 0.3 * run) * k * Math.max(0, c));
  turn(inst, 'lowerlegR', side, -(0.9 + 0.3 * run) * k * Math.max(0, -c));
  turn(inst, 'footL', side, 0.25 * k * Math.max(0, c));
  turn(inst, 'footR', side, 0.25 * k * Math.max(0, -c));
  // arms counter-swing, elbows soft and a touch forward, hands in from the hips
  turn(inst, 'upperarmL', side, -arm * s);
  turn(inst, 'upperarmR', side, arm * s);
  turn(inst, 'lowerarmL', side, 0.22 + 0.25 * k + 0.1 * run);
  turn(inst, 'lowerarmR', side, 0.22 + 0.25 * k + 0.1 * run);
  turn(inst, 'upperarmL', fwd, -0.07);
  turn(inst, 'upperarmR', fwd, 0.07);
  // the body: hips twist with the stride, shoulders against them; a lean when running
  turn(inst, 'hips', up, 0.09 * s * k);
  turn(inst, 'spine2', up, -0.12 * s * k);
  turn(inst, 'spine1', side, -0.12 * run * k);
  // standing: breathe, shift weight, glance about
  const idle = 1 - k, t = inst.t;
  turn(inst, 'spine2', side, idle * 0.02 * Math.sin(t * 1.9));
  turn(inst, 'hips', fwd, idle * 0.03 * Math.sin(t * 0.45));
  turn(inst, 'head', up, idle * 0.22 * Math.sin(t * 0.37) * Math.max(0, Math.sin(t * 0.21)));
  // talking: the right hand comes up and turns over with the words
  if (talk) {
    turn(inst, 'upperarmR', side, talk * (0.55 + 0.12 * Math.sin(t * 3.1)));
    turn(inst, 'lowerarmR', side, talk * (0.9 + 0.2 * Math.sin(t * 4.3)));
    turn(inst, 'head', side, talk * 0.06 * Math.sin(t * 2.7));
  }
  // a step's bob: lowest as the feet pass
  return Math.abs(c) * 0.035 * k;
}

// a person standing somewhere: returns a group now, fills in when the rig loads
export function person(look) {
  const g = new THREE.Group();
  const turnG = new THREE.Group(); g.add(turnG);
  g.add(blobShadow(0.3));
  g.userData.turn = turnG;
  if (look.folk) {
    const inst = makeFolk(look);
    turnG.add(inst.rig);
    g.userData.human = inst;
    return g;
  }
  loadHuman().then(glb => {
    const inst = makeHuman(glb, look);
    turnG.add(inst.rig);
    g.userData.human = inst;
  });
  return g;
}

// sitting (the jeep's driver): thighs forward, shins down, hands on the wheel
export function sit(inst) {
  if (!inst.bones.hips) return;
  for (const n of BONES) if (inst.bones[n]) inst.bones[n].quaternion.copy(inst.bind[n]);
  const { fwd, side } = AX;
  for (const n of ['upperlegL', 'upperlegR']) turn(inst, n, side, 1.45);
  for (const n of ['lowerlegL', 'lowerlegR']) turn(inst, n, side, -1.35);
  for (const n of ['upperarmL', 'upperarmR']) turn(inst, n, side, 0.75);
  for (const n of ['lowerarmL', 'lowerarmR']) turn(inst, n, side, 0.6);
  turn(inst, 'upperarmL', fwd, 0.12); turn(inst, 'upperarmR', fwd, -0.12);
}
