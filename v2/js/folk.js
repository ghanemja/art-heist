// ─── FOLK: the townspeople, each built as their own person ──────────────────
// A tiny jointed body (groups for hips, spine, neck, arms, legs) dressed with
// smooth toon shapes: their own build, face, hair and clothes. Sized to sit
// beside the critic (≈1.2 units tall, about four heads high, same feet/hips/
// shoulders), so the cast reads as one world without being clones of her.
// Joints are plain groups facing +Z, so posing is just rotations.
import * as THREE from 'three';
import { paint, ink } from './style.js';
import { lathe } from './props.js';

const SKINS = { fair: 0xf0d2b6, rose: 0xe6b99a, olive: 0xcf9e74, tan: 0xb57b52, brown: 0x8d5a3b, deep: 0x5e3a28 };

const cap = (r, len, mat, seg = 12) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, seg), mat);
const ball = (r, mat, w = 20, h = 14) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), mat);
function at(o, x, y, z) { o.position.set(x, y, z); return o; }
function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

function bone(parent, x, y, z) { const b = new THREE.Bone(); b.position.set(x, y, z); parent.add(b); return b; }

// a smooth profile through a few control points (Catmull-Rom), so lathes read round
function smooth(pts, n = 28) {
  const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return c.getPoints(n).map(v => [Math.max(0.001, v.x), v.y]);
}

// a whole limb as ONE skinned tube (thigh→calf→ankle, or upper arm→forearm→wrist):
// weights blend across the knee/elbow so it bends in a soft curve, not a hinge.
// prof: [depth below the joint, radius] top to bottom; colAt(depth) → hex (sleeves, cuffs)
function limb(parent, x, y, bones, l1, l2, prof, colAt) {
  const geo = lathe(smooth(prof.map(([d, r]) => [r, -d]).reverse(), 34), 18);
  const pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3), c = new THREE.Color();
  const ss = THREE.MathUtils.smoothstep;
  for (let i = 0; i < n; i++) {
    const d = -pos.getY(i);
    const w1 = ss(d, l1 - 0.05, l1 + 0.05), w2 = ss(d, l1 + l2 - 0.012, l1 + l2 + 0.012);
    si.set([0, 1, 2, 0], i * 4); sw.set([1 - w1, Math.max(0, w1 - w2), w2, 0], i * 4);
    c.setHex(colAt(d)); col.set([c.r, c.g, c.b], i * 3);
  }
  geo.translate(x, y, 0);
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.SkinnedMesh(geo, paint(0xffffff, { vertexColors: true }));
  m.frustumCulled = false;
  m.userData.bones = bones;
  parent.add(m);
  return m;
}

/*
  spec: {
    skin, hair, hairStyle: 'bob'|'bun'|'crop'|'bald'|'pony'|'curls',
    top, sleeve: 'long'|'short', bottom, shoes,
    outfit: 'coat'|'dress'|'apron'|'uniform'|'vest'|'cardigan'|null, accent,
    hat: 'cap'|'helmet'|'flat'|'beanie'|null, hatColor,
    beard, glasses, height (1), build (1 = average, >1 broader), belly (0..1)
  }
*/
export function makeFolk(spec) {
  const S = { height: 1, build: 1, belly: 0, sleeve: 'long', shoes: 0x5a3d2c, sole: 0xd9cdb6, ...spec };
  const skinHex = SKINS[S.skin] ?? S.skin ?? SKINS.rose;
  const skin = paint(skinHex);
  const top = paint(S.top), bottom = paint(S.bottom), shoe = paint(S.shoes, { hatch: 0 }), soleM = paint(S.sole, { hatch: 0 });
  const hairM = paint(S.hair ?? 0x3a2a24);
  const dark = paint(0x2a2230, { hatch: 0 });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const H = S.height, B = S.build;
  body.scale.setScalar(H);
  const J = {};

  // ── hips + legs ──
  const HIP = 0.565;
  J.hips = joint(body, 0, HIP, 0);
  const limbs = [];
  const rB = Math.sqrt(B);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R', x = s * 0.068 * B;
    const th = J['thigh' + k] = bone(J.hips, x, 0, 0);
    const sh = J['shin' + k] = bone(th, 0, -0.27, 0);
    const ft = J['foot' + k] = bone(sh, 0, -0.25, 0);
    const legCol = S.outfit === 'dress' ? (d) => d > 0.24 ? skinHex : S.bottom : () => S.bottom;
    limbs.push(limb(J.hips, x, 0, [th, sh, ft], 0.27, 0.25, [
      [-0.045, 0.001], [-0.032, 0.05 * B], [0, 0.066 * B], [0.1, 0.066 * B], [0.2, 0.056 * rB], [0.27, 0.047 * rB],
      [0.33, 0.05 * rB], [0.41, 0.044], [0.49, 0.035], [0.52, 0.033], [0.535, 0.001]], legCol));
    // a shoe: rounded, longer than wide, sole flat on the ground
    const f = ball(0.056, shoe, 18, 10); f.scale.set(1.05, 0.62, 1.85); at(f, 0, -0.004, 0.036); ft.add(f);
    const sole = ball(0.059, soleM, 18, 6); sole.scale.set(1.08, 0.22, 1.9); at(sole, 0, -0.03, 0.036); ft.add(sole);
  }
  // pelvis
  const pel = ball(0.12 * B, bottom); pel.scale.set(1.05, 0.62, 0.8); J.hips.add(pel);

  // ── spine + torso ──
  J.spine = joint(J.hips, 0, 0.02, 0);
  // the shoulder line slopes from the neck into the arms (no bolt-on shoulder balls)
  const torso = new THREE.Mesh(lathe(smooth([[0.001, -0.01], [0.112, 0.0], [0.125 + 0.03 * S.belly, 0.1], [0.12 + 0.05 * S.belly, 0.17],
    [0.13, 0.25], [0.128, 0.29], [0.105, 0.33], [0.06, 0.358], [0.001, 0.368]], 32), 28), top);
  torso.scale.set(B * 1.0, 1, 0.78 + 0.12 * S.belly);
  J.spine.add(torso);
  // ── neck + head ──
  J.neck = joint(J.spine, 0, 0.35, 0);
  J.neck.add(at(cap(0.04, 0.05, skin, 10), 0, 0.03, 0));
  J.head = joint(J.neck, 0, 0.06, 0);
  const head = ball(0.118, skin, 24, 18); head.scale.set(0.95, 1.06, 0.98); at(head, 0, 0.12, 0); J.head.add(head);
  // face: eyes, brows, nose, a blush, a mouth line — small, soft, drawn
  const faceBits = [];
  const n0 = J.head.children.length;
  for (const s of [-1, 1]) {
    const e = ball(0.016, dark, 10, 8); e.scale.set(0.8, 1.15, 0.5); at(e, s * 0.042, 0.135, 0.112); J.head.add(e);
    const br = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.026, 3, 6), hairM); br.rotation.z = Math.PI / 2 + s * 0.12; at(br, s * 0.044, 0.172, 0.104); J.head.add(br);
    const ch = ball(0.02, paint(0xe89a86, { hatch: 0 }), 10, 8); ch.scale.set(1, 0.6, 0.3); at(ch, s * 0.066, 0.1, 0.098); J.head.add(ch);
    const ear = ball(0.024, skin, 10, 8); ear.scale.set(0.5, 1, 0.8); at(ear, s * 0.112, 0.125, 0); J.head.add(ear);
  }
  faceBits.push(...J.head.children.slice(n0).filter((o, i) => i % 4 !== 3));   // all but the ears
  const nose = ball(0.018, skin, 10, 8); nose.scale.set(0.9, 0.9, 0.8); at(nose, 0, 0.115, 0.118); J.head.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 10, Math.PI), dark); mouth.rotation.z = Math.PI; at(mouth, 0, 0.083, 0.11); J.head.add(mouth);
  faceBits.push(mouth);
  if (S.glasses) for (const s of [-1, 1]) { const g = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 5, 14), dark); at(g, s * 0.043, 0.135, 0.12); J.head.add(g); faceBits.push(g); }
  // hair
  const hairCap = (r = 0.128, cut = 0.5) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI * cut), hairM); return m; };
  const hs = S.hairStyle;
  if (hs !== 'bald') {
    const c = hairCap(0.126, hs === 'crop' ? 0.42 : 0.5); at(c, 0, 0.13, -0.008); c.rotation.x = -0.25; c.scale.set(0.98, 1.05, 1.02); J.head.add(c);
  } else {
    const c = hairCap(0.121, 0.62); at(c, 0, 0.12, -0.01); c.rotation.x = -1.9; J.head.add(c);   // a fringe round the back only
  }
  if (hs === 'bob') {
    for (const s of [-1, 1]) { const side = cap(0.05, 0.1, hairM); side.scale.set(0.8, 1, 1.2); at(side, s * 0.1, 0.09, -0.01); J.head.add(side); }
    const back = ball(0.12, hairM); back.scale.set(1, 0.95, 0.75); at(back, 0, 0.1, -0.05); J.head.add(back);
    const fringe = cap(0.035, 0.12, hairM); fringe.rotation.z = Math.PI / 2; at(fringe, 0, 0.205, 0.08); J.head.add(fringe);
  } else if (hs === 'bun') {
    J.head.add(at(ball(0.06, hairM), 0, 0.26, -0.06));
  } else if (hs === 'pony') {
    const p = cap(0.035, 0.14, hairM); p.rotation.x = 0.5; at(p, 0, 0.12, -0.15); J.head.add(p);
  } else if (hs === 'curls') {
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; J.head.add(at(ball(0.045, hairM, 10, 8), Math.cos(a) * 0.1, 0.2 + Math.sin(i * 1.7) * 0.02, Math.sin(a) * 0.09 - 0.01)); }
  }
  if (S.beard) {
    const bd = ball(0.1, hairM); bd.scale.set(1, 0.72, 0.8); at(bd, 0, 0.055, 0.035); J.head.add(bd);
    const mo = cap(0.016, 0.06, hairM, 8); mo.rotation.z = Math.PI / 2; at(mo, 0, 0.096, 0.112); J.head.add(mo);
    mouth.visible = false;
  }
  // hats
  const hatM = paint(S.hatColor ?? 0x2a2230);
  if (S.hat === 'cap') {          // a guard's peaked cap
    J.head.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.125, 0.07, 22), hatM), 0, 0.245, -0.005));
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 18, 1, false, -Math.PI / 2, Math.PI), dark); at(peak, 0, 0.215, 0.06); peak.rotation.x = 0.15; J.head.add(peak);
    J.head.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.128, 0.018, 22), paint(0xe4b84f)), 0, 0.22, -0.005));
  } else if (S.hat === 'flat') {  // a flat cap
    const f = ball(0.135, hatM, 22, 10); f.scale.set(1, 0.38, 1.1); at(f, 0, 0.225, 0.01); J.head.add(f);
    const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), hatM); at(peak, 0, 0.205, 0.08); peak.rotation.x = 0.25; J.head.add(peak);
  } else if (S.hat === 'helmet') {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.142, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hatM); h.scale.set(0.95, 0.9, 1.15); at(h, 0, 0.17, -0.01); J.head.add(h);
    for (const x of [-0.05, 0, 0.05]) { const v = cap(0.012, 0.09, dark, 6); v.rotation.x = Math.PI / 2; at(v, x, 0.3, -0.01); J.head.add(v); }
  } else if (S.hat === 'beanie') {
    const b = hairCap(0.132, 0.48); b.material = hatM; at(b, 0, 0.15, -0.005); J.head.add(b);
    J.head.add(at(ball(0.032, hatM, 10, 8), 0, 0.29, -0.01));
  }

  // ── arms: one skinned tube each, shoulder to wrist; a round shoulder caps the join ──
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R', x = s * 0.112 * B, y = 0.287;   // the joint sits inside the shoulder curve
    const sh = J['arm' + k] = bone(J.spine, x, y, 0);
    const fa = J['fore' + k] = bone(sh, 0, -0.16, 0);
    const hd = J['hand' + k] = bone(fa, 0, -0.15, 0);
    const cuff = S.sleeve === 'short' ? 0.085 : 0.285;
    limbs.push(limb(J.spine, x, y, [sh, fa, hd], 0.16, 0.15, [
      [-0.04, 0.001], [-0.025, 0.038 * rB], [0, 0.046 * rB], [0.07, 0.044 * rB], [0.15, 0.036], [0.17, 0.035],
      [0.22, 0.035], [0.28, 0.028], [0.3, 0.026], [0.312, 0.001]], (d) => d < cuff ? S.top : skinHex));
    // a mitten hand: flat palm facing the thigh, a thumb forward, fingers suggested by a curl
    const palm = ball(0.032, skin, 16, 12); palm.scale.set(0.62, 1.15, 0.95); at(palm, 0, -0.03, 0.004); hd.add(palm);
    const curl = ball(0.024, skin, 12, 8); curl.scale.set(0.6, 0.9, 0.8); at(curl, -s * 0.004, -0.058, 0.012); hd.add(curl);
    const thumb = cap(0.011, 0.022, skin, 8); thumb.rotation.x = 0.7; thumb.rotation.z = s * 0.25; at(thumb, -s * 0.008, -0.022, 0.03); hd.add(thumb);
  }
  // bind the limbs in this rest pose
  root.updateMatrixWorld(true);
  for (const m of limbs) m.bind(new THREE.Skeleton(m.userData.bones));

  // ── outfits ──
  const acc = paint(S.accent ?? 0xf3ead7);
  if (S.outfit === 'coat') {          // a long coat: a flared skirt of fabric from the waist
    const c = new THREE.Mesh(lathe([[0.001, -0.33], [0.172, -0.32], [0.175, -0.3], [0.15, -0.12], [0.13, 0]], 20), top);
    c.scale.set(B, 1, 0.82); at(c, 0, 0.04, 0); J.hips.add(c);
    const lap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.01), acc); at(lap, 0, 0.24, 0.1); J.spine.add(lap);
  } else if (S.outfit === 'dress') {
    const d = new THREE.Mesh(lathe([[0.001, -0.33], [0.198, -0.32], [0.2, -0.3], [0.14, -0.05], [0.12, 0.05]], 22), top);
    d.scale.set(B, 1, 0.85); J.hips.add(d);
  } else if (S.outfit === 'apron') {  // a framer's canvas apron
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.2 * B, 0.42, 0.012), acc); at(a, 0, 0.06, 0.1 + 0.035 * S.belly); J.spine.add(a);
    const pk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.014), paint(0x8a6a52)); at(pk, 0, -0.04, 0.107 + 0.035 * S.belly); J.spine.add(pk);
  } else if (S.outfit === 'uniform') {
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.12 * B, 0.018, 6, 22), dark); belt.rotation.x = Math.PI / 2; belt.scale.set(1, 0.82 + 0.12 * S.belly, 1); at(belt, 0, 0.04, 0); J.spine.add(belt);
    const badge = ball(0.018, paint(0xe4b84f), 8, 6); at(badge, -0.06, 0.25, 0.1); J.spine.add(badge);
  } else if (S.outfit === 'vest') {   // a courier's high-vis vest
    const v = new THREE.Mesh(lathe([[0.122, 0], [0.135, 0.12], [0.135, 0.26], [0.1, 0.32]], 20), acc);
    v.scale.set(B * 1.04, 1, 0.84); J.spine.add(v);
  } else if (S.outfit === 'cardigan') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.012), acc); at(c, 0, 0.16, 0.098); J.spine.add(c);
  }

  for (const o of faceBits) o.userData.noInk = true;   // eyes, brows, cheeks: drawn, not outlined
  root.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
  ink(root, 'fine');
  return { kind: 'folk', rig: root, J, t: Math.random() * 10, wc: Math.random() * 6 };
}

// poses: k 0 standing … 1 walking; talk 0..1 raises a hand
export function poseFolk(inst, dt, k, { talk = 0 } = {}) {
  const J = inst.J;
  inst.t += dt; inst.wc += dt * 5.6 * (0.35 + 0.9 * k);
  const s = Math.sin(inst.wc), c = Math.cos(inst.wc), t = inst.t, idle = 1 - k;
  const legA = 0.48 * k, armA = 0.4 * k;
  // forward is +Z: a negative X rotation swings a hanging limb forward
  J.thighL.rotation.x = -legA * s; J.thighR.rotation.x = legA * s;
  J.shinL.rotation.x = 0.9 * k * Math.max(0, -c); J.shinR.rotation.x = 0.9 * k * Math.max(0, c);
  J.armL.rotation.set(armA * s, 0, -0.08 - idle * 0.02 * Math.sin(t * 1.3));
  J.armR.rotation.set(-armA * s, 0, 0.08 + idle * 0.02 * Math.sin(t * 1.3));
  J.foreL.rotation.x = -0.22 - 0.2 * k; J.foreR.rotation.x = -0.22 - 0.2 * k;
  J.hips.rotation.y = 0.08 * s * k; J.spine.rotation.y = -0.1 * s * k;
  J.hips.rotation.z = idle * 0.03 * Math.sin(t * 0.45);
  J.spine.rotation.x = idle * 0.015 * Math.sin(t * 1.9);
  J.head.rotation.y = idle * 0.25 * Math.sin(t * 0.37) * Math.max(0, Math.sin(t * 0.21));
  J.head.rotation.x = 0;
  if (talk) {
    J.armR.rotation.x += -talk * (0.7 + 0.12 * Math.sin(t * 3.1));
    J.foreR.rotation.x += -talk * (0.9 + 0.25 * Math.sin(t * 4.3));
    J.armR.rotation.z += talk * 0.15;
    J.head.rotation.x = talk * 0.05 * Math.sin(t * 2.7);
  }
  return Math.abs(c) * 0.03 * k;
}
