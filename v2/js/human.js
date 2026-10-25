// ─── PEOPLE: the critic's rig (the player), plus the townsfolk (folk.js) ───
// critic.glb is built from flat colour materials (beret, hair, skin, sweater,
// jeans, shoe, sole), so one rig, re-coloured, gives the whole cast at the
// right human scale. Poses are written in the MODEL's axes (+X forward,
// +Y up, +Z to the right) and converted per bone at load, so a "swing forward"
// is a swing forward whatever way each bone happens to be rolled.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { paint, ink, blobShadow } from './style.js';
import { makeFolk, poseFolk } from './folk.js';

export const HUMAN_SCALE = 0.13;           // ≈1.2 units tall
const FOOT = 4.593;                        // model units from the origin down to the soles

let _glb = null;
export function loadHuman() {
  if (!_glb) _glb = new Promise((res, rej) => new GLTFLoader().load('../models/critic.glb', (g) => { fixColors(g.scene); res(g); }, undefined, rej));
  return _glb;
}

// critic.glb authoring bug (fixed the same way in the original game): the hands
// are baked into the JEANS mesh (so they render blue) and the nape hair into the
// SWEATER mesh (grey). Repaint just the verts those bones drive with the right
// colour as vertex colours; clones share the geometry, so this runs once.
const REPAINT = { jeans: { bones: ['handL', 'handR'], to: 'skin' }, sweater: { bones: ['head'], to: 'hair' } };
// the model's own skin is #f9efe5 — near paper-white, so in the gouache look her
// face and hands read as blank white. A warm, light skin tone instead (set before
// the hand repaint, so face and hands match).
export const CRITIC_SKIN = 0xefc3a2;
function fixColors(root) {
  root.traverse(o => { if (o.material?.name === 'skin') o.material.color.setHex(CRITIC_SKIN); });
  const colOf = {};
  root.traverse(o => { if (o.material?.name) colOf[o.material.name] = o.material.color; });
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const rule = REPAINT[o.material.name], tgt = rule && colOf[rule.to];
    const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!tgt || !si) return;
    const pick = new Set();
    o.skeleton.bones.forEach((b, i) => { if (rule.bones.includes(b.name.replace(/\./g, ''))) pick.add(i); });
    // the model already carries baked vertex colours (COLOR_0); keep them, and
    // fold the material colour in so these two meshes can drop it (absolute colours)
    const n = g.attributes.position.count, col = new Float32Array(n * 3), bc = o.material.color, old = g.attributes.color;
    for (let v = 0; v < n; v++) {
      let w = 0; for (let k = 0; k < 4; k++) if (pick.has(si.getComponent(v, k))) w += sw.getComponent(v, k);
      const c = w > 0.5 ? tgt : bc;
      const f = (i) => old ? old.getComponent(v, i) : 1;
      col[v * 3] = c.r * f(0); col[v * 3 + 1] = c.g * f(1); col[v * 3 + 2] = c.b * f(2);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.userData.absColor = true;
  });
  // the SKIN mesh also holds the sweater's flared cuffs (everything below y≈1 in the
  // bind pose; the face and neck sit above y≈2.5) — paint those the sweater's own
  // (baked) colour, a touch lighter for the rib, so sleeves run to the wrist and only
  // the face and hands are skin
  let knit = null;
  root.traverse(o => { if (o.isSkinnedMesh && o.material.name === 'sweater') {
    // average only the grey knit (the nape verts were repainted hair-brown above)
    const c = o.geometry.attributes.color, a = [0, 0, 0]; let n = 0;
    for (let v = 0; v < c.count; v++) {
      const r = c.getComponent(v, 0), b = c.getComponent(v, 2);
      if (Math.abs(r - b) > 0.04) continue;
      for (let k = 0; k < 3; k++) a[k] += c.getComponent(v, k); n++;
    }
    knit = new THREE.Color(...a.map(x => x / Math.max(1, n))).multiplyScalar(1.12);
  } });
  root.traverse(o => {
    if (!o.isSkinnedMesh || o.material.name !== 'skin' || !knit) return;
    const g = o.geometry, P = g.attributes.position, n = P.count, col = new Float32Array(n * 3), sk = o.material.color;
    for (let v = 0; v < n; v++) { const c = P.getY(v) < 1.5 ? knit : sk; col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.userData.absColor = true;
  });
  // the hands (in the JEANS mesh) reach up inside the cuff, and their wrists poke
  // out past the sleeve's side — paint everything above the hem sweater, so the
  // sleeve reads unbroken and only the hand below it is skin
  const HEM = -0.6;
  root.traverse(o => {
    if (!o.isSkinnedMesh || o.material.name !== 'jeans' || !knit) return;
    const g = o.geometry, P = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, col = g.attributes.color;
    const hand = new Set(); o.skeleton.bones.forEach((b, i) => { if (/hand/.test(b.name)) hand.add(i); });
    for (let v = 0; v < P.count; v++) {
      let w = 0; for (let k = 0; k < 4; k++) if (hand.has(si.getComponent(v, k))) w += sw.getComponent(v, k);
      if (w > 0.5 && P.getY(v) > HEM) col.setXYZ(v, knit.r, knit.g, knit.b);
    }
  });
  // the beret: the scalp (skin) and the crown of the hair poke through it on one
  // side. Swell it a touch, then paint any skin/hair point that still reaches
  // outside the beret's dome the beret's own colour — the parts you see through
  // the felt become felt. The dome is the beret's radius from its centre, binned
  // by direction (bind space; clones share the geometry, so this runs once).
  let beret = null;
  root.traverse(o => { if (o.isSkinnedMesh && o.material.name === 'beret') beret = o; });
  if (beret) {
    const P = beret.geometry.attributes.position, c = new THREE.Vector3(), d = new THREE.Vector3();
    for (let v = 0; v < P.count; v++) c.x += P.getX(v) / P.count, c.y += P.getY(v) / P.count, c.z += P.getZ(v) / P.count;
    for (let v = 0; v < P.count; v++) P.setXYZ(v, c.x + (P.getX(v) - c.x) * 1.13, c.y + (P.getY(v) - c.y) * 1.0, c.z + (P.getZ(v) - c.z) * 1.13);
    // the beret is notched on one side (its rim rides ~0.15 higher there), which is where the
    // head showed through: stretch it down in those directions so the rim runs level
    {
      const NB = 16, lo = new Float32Array(NB).fill(Infinity), hi = new Float32Array(NB).fill(-Infinity);
      const ang = (v) => (Math.atan2(P.getZ(v) - c.z, P.getX(v) - c.x) / Math.PI + 1) / 2 * NB;
      for (let v = 0; v < P.count; v++) { const k = Math.min(NB - 1, Math.floor(ang(v))); lo[k] = Math.min(lo[k], P.getY(v)); hi[k] = Math.max(hi[k], P.getY(v)); }
      const target = [...lo].sort((a, b) => a - b)[Math.floor(NB * 0.4)];
      const at = (arr, a) => { const i = Math.floor(a - 0.5), f = a - 0.5 - i, A = arr[(i + NB) % NB], B = arr[(i + 1) % NB]; return A + (B - A) * f; };
      for (let v = 0; v < P.count; v++) {
        const a = ang(v), r0 = at(lo, a), t0 = at(hi, a);
        if (r0 <= target + 0.005 || t0 - r0 < 1e-3) continue;
        P.setY(v, t0 - (t0 - P.getY(v)) * (t0 - target) / (t0 - r0));
      }
    }
    beret.geometry.computeVertexNormals();
    beret.geometry.computeBoundingSphere();
    // the rim's height in each direction round the head (the beret sits tilted)
    const NA = 32, rim = new Float32Array(NA).fill(Infinity);
    const az = (x, z) => Math.min(NA - 1, Math.floor((Math.atan2(z - c.z, x - c.x) / Math.PI + 1) / 2 * NA));
    for (let v = 0; v < P.count; v++) { const k = az(P.getX(v), P.getZ(v)); rim[k] = Math.min(rim[k], P.getY(v)); }
    for (let k = 0; k < NA; k++) if (!isFinite(rim[k])) rim[k] = Math.min(rim[(k + NA - 1) % NA], rim[(k + 1) % NA]);
    // the brim's reach in each direction (horizontal radius from the beret's axis)
    const reach = new Float32Array(NA);
    for (let v = 0; v < P.count; v++) { const k = az(P.getX(v), P.getZ(v)); reach[k] = Math.max(reach[k], Math.hypot(P.getX(v) - c.x, P.getZ(v) - c.z)); }
    // tuck in: hair and scalp near the band that sit outside the brim are pulled in under it
    // (geometry, not paint — they were drawn in FRONT of the beret, so colour can't hide them)
    root.traverse(o => {
      if (!o.isSkinnedMesh || !['skin', 'hair'].includes(o.material.name)) return;
      const Q = o.geometry.attributes.position;
      for (let v = 0; v < Q.count; v++) {
        const x = Q.getX(v) - c.x, z = Q.getZ(v) - c.z, y = Q.getY(v), k = az(Q.getX(v), Q.getZ(v));
        if (y < rim[k] - 0.3) continue;                              // well below the band: leave the hair alone
        const r = Math.hypot(x, z), lim = reach[k] * 0.9;
        if (r <= lim || r < 1e-4) continue;
        const t = THREE.MathUtils.smoothstep(y, rim[k] - 0.3, rim[k] - 0.05);   // ease in, so the hair's fall stays natural
        const nr = r + (lim - r) * t;
        Q.setXYZ(v, c.x + x / r * nr, y, c.z + z / r * nr);
      }
      o.geometry.computeVertexNormals(); o.geometry.computeBoundingSphere();
    });
    const felt = beret.material.color;
    // the rolled edge: a loop just outside the brim at rim height, built per instance
    // on the head bone (see makeHuman) so it hides the hair/felt seam from every side
    {
      const loop = [], NL = 48;
      const rimR = new Float32Array(NA);
      for (let v = 0; v < P.count; v++) { const k = az(P.getX(v), P.getZ(v)); if (P.getY(v) < rim[k] + 0.1) rimR[k] = Math.max(rimR[k], Math.hypot(P.getX(v) - c.x, P.getZ(v) - c.z)); }
      // smooth the per-direction rim (a wide circular average), so the edge rolls round evenly
      const sm = (arr, w = 4) => Array.from(arr, (_, k) => { let a = 0, n = 0; for (let d = -w; d <= w; d++) { const x = arr[(k + d + NA) % NA]; if (x > 0 && isFinite(x)) { a += x; n++; } } return n ? a / n : 0; });
      const rS = sm(Array.from(rimR, (x, k) => x || reach[k] * 0.9)), yS = sm(rim);
      for (let j = 0; j < NL; j++) {
        const a = j / NL * Math.PI * 2 - Math.PI, f = (a / Math.PI + 1) / 2 * NA - 0.5, i = Math.floor(f), t = f - i;
        const L = (arr) => arr[(i + NA) % NA] * (1 - t) + arr[(i + 1) % NA] * t;
        const rr = L(rS) + 0.03;
        loop.push(new THREE.Vector3(c.x + Math.cos(a) * rr, L(yS) + 0.02, c.z + Math.sin(a) * rr));
      }
      root.userData.beretRim = loop;
      root.userData.beretCol = felt.getHex();
    }
    root.traverse(o => {
      if (!o.isSkinnedMesh || !['skin', 'hair'].includes(o.material.name)) return;
      const g = o.geometry, Q = g.attributes.position;
      let col = g.attributes.color;
      if (!g.userData.absColor) {                       // hair: bake its colour so single verts can differ
        const mc = o.material.color, a = new Float32Array(Q.count * 3);
        for (let v = 0; v < Q.count; v++) { a[v * 3] = mc.r; a[v * 3 + 1] = mc.g; a[v * 3 + 2] = mc.b; }
        col = new THREE.BufferAttribute(a, 3); g.setAttribute('color', col); g.userData.absColor = true;
      }
      // anything at or above the rim in its direction is under the beret or bulging out of
      // its band — felt. Below the rim (the fringe, the face, the hair down the back) it stays.
      // At or above the rim in its direction: under the beret, or bulging out of its band — felt.
      // Below the rim, bare SCALP on the sides and back (the model has no hair over her
      // right temple, so skin showed between beret and hair) becomes hair; the face
      // (the front of the head, +X) stays skin.
      const scalp = o.material.name === 'skin', hairC = colOf.hair;
      for (let v = 0; v < Q.count; v++) {
        const y = Q.getY(v), r0 = rim[az(Q.getX(v), Q.getZ(v))];
        if (y > r0 - 0.1) col.setXYZ(v, felt.r, felt.g, felt.b);
        else if (scalp && y > r0 - 0.5 && Q.getX(v) - c.x < 0.42) col.setXYZ(v, hairC.r, hairC.g, hairC.b);
      }
      // one colour per triangle (by majority) so the felt line is crisp, not a smear —
      // split the shared vertices first (normals are copied, so shading stays smooth)
      const ng = g.toNonIndexed(); ng.userData = g.userData;
      const C = ng.attributes.color, isFelt = (i) => Math.abs(C.getX(i) - felt.r) + Math.abs(C.getY(i) - felt.g) + Math.abs(C.getZ(i) - felt.b) < 1e-3;
      for (let t = 0; t < C.count; t += 3) {
        const f = [0, 1, 2].filter(k => isFelt(t + k));
        if (f.length === 0 || f.length === 3) continue;
        if (f.length >= 2) { for (let k = 0; k < 3; k++) C.setXYZ(t + k, felt.r, felt.g, felt.b); }
        else { const o2 = [0, 1, 2].find(k => !isFelt(t + k)); for (const k of f) C.setXYZ(t + k, C.getX(t + o2), C.getY(t + o2), C.getZ(t + o2)); }
      }
      o.geometry = ng;
    });
  }
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
    o.material = o.geometry.userData.absColor ? paint(0xffffff, { vertexColors: true })
      : paint(look[name] ?? m.color.getHex(), { vertexColors: !!o.geometry.attributes.color, side: name === 'beret' ? THREE.DoubleSide : undefined });
    // (the beret is open on one side in the model: drawn double-sided, its inside is felt too)
  });
  const loop = glb.scene.userData.beretRim;
  if (loop) {
    let beret = null; rig.traverse(o => { if (o.isSkinnedMesh && o.userData.part === 'beret') beret = o; });
    const hi = beret?.skeleton.bones.findIndex(b => b.name.replace(/\./g, '') === 'head');
    if (beret && hi >= 0) {
      const toBone = beret.skeleton.boneInverses[hi].clone().multiply(beret.bindMatrix);
      const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true, 'centripetal'), 96, 0.085, 8, true);
      geo.applyMatrix4(toBone);
      const band = new THREE.Mesh(geo, paint(look.beret ?? glb.scene.userData.beretCol ?? 0xe27e72));
      band.userData.part = 'beret';
      beret.skeleton.bones[hi].add(band);
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
