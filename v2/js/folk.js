// ─── FOLK: the townspeople, each built as their own person ──────────────────
// A tiny jointed body (groups for hips, spine, neck, arms, legs) dressed with
// smooth toon shapes: their own build, face, hair and clothes. Sized to sit
// beside the critic (≈1.2 units tall, about four heads high, same feet/hips/
// shoulders), so the cast reads as one world without being clones of her.
// Joints are plain groups facing +Z, so posing is just rotations.
import * as THREE from 'three';
import { paint, ink } from './style.js';
import { lathe } from './props.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const SKINS = { fair: 0xf0d2b6, rose: 0xe6b99a, olive: 0xcf9e74, tan: 0xb57b52, brown: 0x8d5a3b, deep: 0x5e3a28 };

const cap = (r, len, mat, seg = 12) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, seg), mat);
const ball = (r, mat, w = 20, h = 14) => new THREE.Mesh(new THREE.SphereGeometry(r, w, h), mat);
function at(o, x, y, z) { o.position.set(x, y, z); return o; }
function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// a shoe drawn from its side silhouette, extruded with a soft bevel, then flared so
// the toe is wider than the heel. Origin = the ankle; the sole sits ANK below it.
const ANK = 0.045;
let _shoe = null;
function shoeGeo() {
  if (_shoe) return _shoe;
  const y0 = -ANK;
  const ext = (sh, depth, bev) => {
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 4, curveSegments: 14 });
    g.translate(0, 0, -depth / 2).rotateY(-Math.PI / 2);          // silhouette x → +Z (forward), extrusion → X (width)
    g.deleteAttribute('uv');
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {                             // flare: wider at the toe
      const k = THREE.MathUtils.clamp((p.getZ(i) + 0.02) / 0.09, 0, 1);
      p.setX(i, p.getX(i) * (1 + 0.28 * k));
    }
    const w = mergeVertices(g, 1e-5); w.computeVertexNormals();     // weld → smooth, rounded shading
    w.computeBoundingBox(); w.translate(0, y0 - w.boundingBox.min.y, 0);
    return w;
  };
  // side silhouette (x = forward): an S. The topline dips DOWN round the ankle,
  // rises over the tongue, dips across the vamp, swells over the toe box and turns
  // down at the tip; the heel is upright and rounded; the bottom follows the toe spring.
  const up = new THREE.Shape();
  up.moveTo(-0.034, 0.012);
  up.quadraticCurveTo(-0.046, 0.016, -0.044, 0.032);              // rounded heel
  up.quadraticCurveTo(-0.043, 0.049, -0.036, 0.054);              // back of the heel, up to the tab
  up.quadraticCurveTo(-0.02, 0.044, -0.004, 0.046);               // collar dips down round the ankle
  up.quadraticCurveTo(0.012, 0.05, 0.024, 0.054);                 // up over the tongue
  up.quadraticCurveTo(0.046, 0.042, 0.058, 0.039);                // the vamp dips (concave)…
  up.quadraticCurveTo(0.086, 0.036, 0.1, 0.022);                  // …then swells over the toe box (convex)
  up.quadraticCurveTo(0.103, 0.014, 0.088, 0.014);                // the toe turns down
  up.quadraticCurveTo(0.06, 0.012, 0.04, 0.012);                  // underside rides the toe spring
  up.lineTo(-0.034, 0.012);
  // the sole: thin, rounded heel, the toe springs up off the ground
  const so = new THREE.Shape();
  so.moveTo(-0.04, 0.004);
  so.quadraticCurveTo(-0.046, 0.0, -0.034, 0.0);
  so.lineTo(0.048, 0.0);
  so.quadraticCurveTo(0.088, 0.0, 0.104, 0.012);                  // toe spring
  so.quadraticCurveTo(0.112, 0.019, 0.102, 0.022);                // the tip
  so.quadraticCurveTo(0.086, 0.016, 0.048, 0.013);                // top of the sole follows it
  so.lineTo(-0.036, 0.013);
  so.quadraticCurveTo(-0.047, 0.011, -0.04, 0.004);
  const upper = ext(up, 0.046, 0.011), sole = ext(so, 0.056, 0.005);
  // a foot is ~15% of a person's height: scale up so the collar rises above the ankle
  for (const g of [upper, sole]) { g.translate(0, ANK, 0); g.scale(1.2, 1.2, 1.2); g.translate(0, -ANK, 0); }
  upper.translate(0, 0.009, 0);                                   // the upper sits in the sole
  return (_shoe = { upper, sole });
}

// ── a hand: a soft palm, four fingers that can curl round a grip, a thumb ──
// hangs from the wrist (−Y); the palm faces the body (side s: −1 left, +1 right), thumb forward.
function makeHand(s, skin) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(rbox(0.016, 0.036, 0.032, 0.007, 2), skin); palm.position.set(0, -0.02, 0.002); g.add(palm);
  const fingers = [];
  for (const [z, len] of [[0.011, 0.024], [0.0035, 0.027], [-0.0045, 0.025], [-0.012, 0.02]]) {
    const knuckle = new THREE.Group(); knuckle.position.set(0, -0.037, z); g.add(knuckle);
    const f = cap(0.0058, len - 0.012, skin, 8); f.position.y = -len / 2; knuckle.add(f);
    const tip = new THREE.Group(); tip.position.y = -len * 0.55; knuckle.add(tip);   // a second joint so a curl looks like a curl
    fingers.push(knuckle);
  }
  const thumb = new THREE.Group(); thumb.position.set(-s * 0.005, -0.01, 0.015); g.add(thumb);
  const th = cap(0.0068, 0.014, skin, 8); th.position.y = -0.012; thumb.add(th);
  thumb.rotation.x = 0.55; thumb.rotation.z = -s * 0.35;
  for (const o of [palm, ...g.children]) o.userData.noInk = false;
  g.userData = { fingers, thumb, s };
  return g;
}
// curl the fingers toward the palm (0 open … 1 a fist round a handle)
function gripHand(h, k) {
  const { fingers, thumb, s } = h.userData;
  fingers.forEach((f, i) => { f.rotation.z = -s * k * (1.25 + i * 0.08); });
  thumb.rotation.z = -s * (0.35 + 0.5 * k);
}
const rbox = (w, h, d, r, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));

// ── things people hold (attached to the hand, origin in the closed fist) ──
const PROPS = {
  clipboard() {
    const g = new THREE.Group();
    const board = new THREE.Mesh(rbox(0.006, 0.15, 0.11, 0.003), paint(0x9a6b45)); g.add(board);
    const paper = new THREE.Mesh(rbox(0.002, 0.13, 0.095, 0.001), paint(0xfaf6ea)); paper.position.x = 0.004; paper.position.y = -0.006; g.add(paper);
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.001, 0.003, 0.07), paint(0x8a8fa8, { hatch: 0 })); l.position.set(0.0055, 0.03 - i * 0.022, -0.005); l.userData.noInk = true; g.add(l); }
    const clip = new THREE.Mesh(rbox(0.012, 0.016, 0.04, 0.004), paint(0xc8ccd2)); clip.position.set(0.004, 0.072, 0); g.add(clip);
    return g;
  },
  pen() { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.0035, 0.06, 3, 6), paint(0x2a2230, { hatch: 0 })); m.rotation.x = Math.PI / 2; return m; },
  cup() {
    const g = new THREE.Group();
    g.scale.setScalar(1.3);
    g.add(new THREE.Mesh(lathe([[0.001, 0], [0.017, 0], [0.023, 0.06], [0.001, 0.06]], 16), paint(0xf3ead7)));
    const sleeve = new THREE.Mesh(lathe([[0.0192, 0.016], [0.0222, 0.044]], 16), paint(0xb07a52)); g.add(sleeve);
    const lid = new THREE.Mesh(lathe([[0.001, 0.058], [0.025, 0.058], [0.025, 0.064], [0.016, 0.07], [0.001, 0.07]], 16), paint(0x3a3340)); g.add(lid);
    g.position.y = -0.04;                 // held round the middle
    const outer = new THREE.Group(); outer.add(g);
    return outer;
  },
  torch() {                       // axis along +Y, lens at the top end
    const g = new THREE.Group();
    g.add(new THREE.Mesh(lathe([[0.001, -0.05], [0.011, -0.05], [0.011, 0.03], [0.016, 0.045], [0.016, 0.06], [0.001, 0.06]], 14), paint(0x2a2a30)));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.013, 14), paint(0xfff1c8, { emissive: 0xffe2a0, hatch: 0 }));
    lens.rotation.x = -Math.PI / 2; lens.position.y = 0.0612; lens.userData.noInk = true; g.add(lens);
    return g;
  },
};

// ── stances: what each person is DOING with their hands ──
// per side: fwd (upper arm swings forward), out (away from the body), twist (forearm
// turns toward the midline), bend (elbow), wrist (hand pitch), grip (finger curl),
// hold: a PROPS key + its placement in the fist. `free`: the hand that gestures in talk.
export const STANCES = {
  clipboard: { free: 'R',      // the director: clipboard to her chest, pen in the other hand
    L: { fwd: 0.32, out: -0.02, twist: 1.05, bend: 1.75, wrist: 0.1, grip: 0.85, hold: ['clipboard', [0.0, -0.03, 0.03], [0.15, Math.PI / 2, 0.0]] },
    R: { fwd: 0.4, out: 0.0, twist: 0.65, bend: 1.55, wrist: -0.2, grip: 0.9, hold: ['pen', [0.004, -0.04, 0.0], [0, 0, 0]] },
    anim: (side, t, p) => { if (side === 'R') { const tap = Math.max(0, Math.sin(t * 0.7)) ** 6; p.bend += 0.12 * tap * Math.sin(t * 14); } } },
  torch: { free: 'L',          // the guard: thumb in his belt, torch pointed at the ground
    L: { fwd: 0.18, out: 0.02, twist: 1.25, bend: 1.3, wrist: 0, grip: 0.45 },
    R: { fwd: 0.55, out: 0.12, twist: 0.1, bend: 0.55, wrist: 0.25, grip: 1, hold: ['torch', [0.0, -0.045, 0.0], [Math.PI - 0.7, 0, 0]] },
    anim: (side, t, p) => { if (side === 'R') { p.twist += 0.12 * Math.sin(t * 0.6); p.fwd += 0.05 * Math.sin(t * 0.43); } } },
  coffee: { free: 'L',         // the courier: a coffee from the café, other hand on her hip
    L: { fwd: -0.12, out: 0.75, twist: 1.6, bend: 1.35, wrist: 0.2, grip: 0.3 },
    R: { fwd: 0.3, out: 0.05, twist: 0.4, bend: 1.9, wrist: 0.0, grip: 1, hold: ['cup', [-0.026, -0.04, 0.01], [2.2, 0, 0]] },
    anim: (side, t, p) => { if (side === 'R') { const sip = Math.max(0, Math.sin(t * 0.55)) ** 10; p.bend += 0.5 * sip; p.fwd += 0.25 * sip; } } },
  crossed: { free: 'R',        // the framer: arms crossed, defensive
    L: { fwd: 0.62, out: 0.0, twist: 1.35, bend: 2.0, wrist: 0, grip: 0.6 },
    R: { fwd: 0.7, out: -0.02, twist: 1.35, bend: 1.88, wrist: 0, grip: 0.6 },
    anim: (side, t, p) => { if (side === 'L') p.fwd += 0.02 * Math.sin(t * 1.1); } },
};
const TALK_POSE = { fwd: 0.55, out: 0.12, twist: 0.25, bend: 1.45, wrist: -0.3, grip: 0.15 };

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
      [0.33, 0.05 * rB], [0.41, 0.044], [0.47, 0.037], [0.5, 0.036], [0.512, 0.001]], legCol));   // the hem ends just inside the shoe collar
    // a real shoe: heel counter, collar round the ankle, instep sloping to a round toe, on a sole
    const sg = shoeGeo();
    ft.add(new THREE.Mesh(sg.upper, shoe), new THREE.Mesh(sg.sole, soleM));
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
    J['hand' + k].add(J['grip' + k] = makeHand(s, skin));
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
    // a waist apron: canvas wrapped round the front from the belt to mid-thigh, with a pocket
    const r0 = (0.128 + 0.03 * S.belly) * B, apM = paint(S.accent ?? 0xd8c9a8, { side: THREE.DoubleSide });
    const a = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0 * 1.12, 0.26, 20, 1, true, -1.15, 2.3), apM);
    a.scale.z = 0.86; at(a, 0, -0.07, 0); J.hips.add(a);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(r0 * 1.01, 0.008, 5, 26), paint(0x8a6a52)); tie.rotation.x = Math.PI / 2; tie.scale.y = 0.86; at(tie, 0, 0.06, 0); J.hips.add(tie);
    const pk = new THREE.Mesh(rbox(0.11, 0.05, 0.012, 0.004), paint(0x8a6a52)); at(pk, 0, -0.1, r0 * 1.06 * 0.86 + 0.004); J.hips.add(pk);
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
  const armOut = 0.17 + 0.04 * (B - 1) + (S.outfit === 'coat' || S.outfit === 'dress' ? 0.1 : 0) + 0.06 * S.belly;
  // arms twist about their own length first (XZY), so a forearm can cross the body
  for (const k of ['L', 'R']) J['arm' + k].rotation.order = 'XZY';
  const stance = STANCES[S.stance] || null;
  if (stance) for (const k of ['L', 'R']) {
    const h = stance[k]?.hold; if (!h) continue;
    const prop = PROPS[h[0]](); prop.position.set(...h[1]); prop.rotation.set(...h[2]);
    J['grip' + k].add(prop);
  }
  const inst = { kind: 'folk', rig: root, J, armOut, stance, t: Math.random() * 10, wc: Math.random() * 6 };
  return inst;
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
  // arms: each side follows the person's stance (what they're doing), else a relaxed hang;
  // walking swings them; talking lifts the free hand into a gesture
  const st = inst.stance;
  for (const side of ['L', 'R']) {
    const sg = side === 'L' ? -1 : 1;
    const p = { fwd: 0.06, out: inst.armOut, twist: 0, bend: 0.25, wrist: 0, grip: 0.25, ...(st?.[side] || {}) };
    st?.anim?.(side, t, p);
    p.out += idle * 0.015 * Math.sin(t * 1.3 + sg);
    p.fwd += (side === 'L' ? 1 : -1) * armA * s;
    if (talk && st?.free === side || talk && !st && side === 'R') for (const key in TALK_POSE) {
      const g = key === 'fwd' ? TALK_POSE.fwd + 0.12 * Math.sin(t * 3.1) : key === 'bend' ? TALK_POSE.bend + 0.25 * Math.sin(t * 4.3) : TALK_POSE[key];
      p[key] += (g - p[key]) * talk;
    }
    J['arm' + side].rotation.set(-p.fwd, -sg * p.twist, sg * p.out);
    J['fore' + side].rotation.set(-p.bend, 0, 0);
    J['hand' + side].rotation.set(-p.wrist, 0, 0);
    gripHand(J['grip' + side], p.grip);
  }
  J.hips.rotation.y = 0.08 * s * k; J.spine.rotation.y = -0.1 * s * k;
  J.hips.rotation.z = idle * 0.03 * Math.sin(t * 0.45);
  J.spine.rotation.x = idle * 0.015 * Math.sin(t * 1.9);
  J.head.rotation.y = idle * 0.25 * Math.sin(t * 0.37) * Math.max(0, Math.sin(t * 0.21));
  J.head.rotation.x = 0;
  if (talk) J.head.rotation.x = talk * 0.05 * Math.sin(t * 2.7);
  return Math.abs(c) * 0.03 * k;
}
