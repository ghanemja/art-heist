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
import { buildHead, HC, sculpt, lineAt } from './faces.js';

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
  g.scale.setScalar(1.3);                 // a hand is about as long as the face
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
  pen() {                         // from the grip (z=0) to the tip (z≈0.07), aimed each frame
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.0038, 0.072, 3, 6).rotateX(Math.PI / 2).translate(0, 0, 0.028), paint(0x2a2230, { hatch: 0 }));
    g.add(m); return g;
  },
  board() {                       // lying flat: paper faces +Y, the clip at the top (+Z) edge
    const g = new THREE.Group();
    g.add(new THREE.Mesh(rbox(0.11, 0.006, 0.15, 0.003), paint(0x9a6b45)));
    const paper = new THREE.Mesh(rbox(0.095, 0.002, 0.13, 0.001), paint(0xfaf6ea)); paper.position.set(0, 0.004, -0.006); g.add(paper);
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.001, 0.0025), paint(0x8a8fa8, { hatch: 0 })); l.position.set(-0.005, 0.0055, 0.03 - i * 0.022); l.userData.noInk = true; g.add(l); }
    const clip = new THREE.Mesh(rbox(0.04, 0.012, 0.016, 0.004), paint(0xc8ccd2)); clip.position.set(0, 0.005, 0.07); g.add(clip);
    return g;
  },
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
  writing: { free: null, ik: true },   // the director: writing on a clipboard (solved by IK, see writePose)
  torch: { free: 'L',          // the guard: thumb in his belt, torch pointed at the ground
    L: { fwd: 0.04, out: 0.42, twist: 1.5, bend: 0.8, wrist: 0.2, grip: 0.4 },   // hand on the belt at his hip
    R: { fwd: 0.55, out: -0.04, twist: 0.1, bend: 0.55, wrist: 0.25, grip: 1, hold: ['torch', [0.0, -0.045, 0.0], [Math.PI - 0.7, 0, 0]] },
    anim: (side, t, p) => { if (side === 'R') { p.twist += 0.3 * Math.sin(t * 0.6); p.fwd += 0.12 * Math.sin(t * 0.43); } } },
  coffee: { free: 'L',         // the courier: a coffee from the café, other hand on her hip
    L: { fwd: -0.12, out: 0.56, twist: 1.6, bend: 1.35, wrist: 0.2, grip: 0.3 },
    R: { fwd: 0.3, out: -0.14, twist: 0.4, bend: 1.9, wrist: 0.0, grip: 1, hold: ['cup', [-0.026, -0.04, 0.01], [2.2, 0, 0]] },
    anim: (side, t, p) => { if (side === 'R') { const sip = Math.max(0, Math.sin(t * 0.55)) ** 10; p.bend += 0.5 * sip; p.fwd += 0.25 * sip; } } },
  crossed: { free: 'R',        // the framer: arms crossed, defensive
    L: { fwd: 0.62, out: -0.2, twist: 1.35, bend: 2.0, wrist: 0, grip: 0.6 },
    R: { fwd: 0.7, out: -0.22, twist: 1.35, bend: 1.88, wrist: 0, grip: 0.6 },
    anim: (side, t, p) => { if (side === 'L') p.fwd += 0.02 * Math.sin(t * 1.1); } },
};
const TALK_POSE = { fwd: 0.55, out: 0.0, twist: 0.25, bend: 1.45, wrist: -0.3, grip: 0.15 };

// a lock of hair: a tube through `pts`, fat near the root, tapering to a fine flicked
// end, coloured darker at the root with a sheen a third of the way down
function lock(pts, r0, base, seed = 0) {
  const curve = new THREE.CatmullRomCurve3(pts), T = 24, Rr = 8;
  const g = new THREE.TubeGeometry(curve, T, 1, Rr, false);
  const pos = g.attributes.position, c = new THREE.Vector3(), q = new THREE.Vector3();
  const col = new Float32Array(pos.count * 3), cc = new THREE.Color();
  const root = base.clone().multiplyScalar(0.7), hi = base.clone().lerp(new THREE.Color(0xbfd2ff), 0.4).offsetHSL(0, 0, 0.1);
  for (let i = 0; i < pos.count; i++) {
    const ring = Math.floor(i / (Rr + 1)), t = ring / T, a = (i % (Rr + 1)) / Rr * Math.PI * 2;
    curve.getPointAt(Math.min(1, t), c);
    const r = r0 * (0.75 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * (t > 0.7 ? Math.max(0.08, (1 - t) / 0.3) : 1);
    q.fromBufferAttribute(pos, i).sub(c).multiplyScalar(r);
    pos.setXYZ(i, c.x + q.x, c.y + q.y, c.z + q.z);
    const shine = Math.exp(-((t - 0.35) ** 2) / 0.006) * (0.5 + 0.5 * Math.sin(a * 3 + seed));
    cc.copy(base).lerp(root, Math.max(0, 0.6 - t * 3)).lerp(hi, shine * 0.8);
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, paint(0xffffff, { vertexColors: true }));
}

function bone(parent, x, y, z) { const b = new THREE.Bone(); b.position.set(x, y, z); parent.add(b); return b; }

// a smooth profile through a few control points (Catmull-Rom), so lathes read round
function smooth(pts, n = 28) {
  const c = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return c.getPoints(n).map(v => [Math.max(0.001, v.x), v.y]);
}

// a whole limb as ONE skinned tube (thigh→calf→ankle, or upper arm→forearm→wrist):
// weights blend across the knee/elbow so it bends in a soft curve, not a hinge.
// prof: [depth below the joint, radius] top to bottom; colAt(depth) → hex (sleeves, cuffs)
function limb(parent, x, y, bones, l1, l2, prof, colAt, { hem = null, inkFrom = 0.02, inkTo = 0.09 } = {}) {
  let pts = smooth(prof.map(([d, r]) => [r, -d]).reverse(), 40);
  if (hem != null) {
    // a sleeve hem: a tiny lip, and two rings 1mm apart so the colour changes crisply
    const rAt = (d) => { for (let i = 1; i < pts.length; i++) if (-pts[i][1] <= d) { const a = pts[i - 1], b = pts[i], k = (d + a[1]) / (a[1] - b[1]); return a[0] + (b[0] - a[0]) * k; } return pts[pts.length - 1][0]; };
    const r = rAt(hem);
    pts = pts.filter(([, yy]) => Math.abs(-yy - hem) > 0.008);
    pts.push([r + 0.0035, -(hem - 0.006)], [r + 0.0045, -(hem - 0.0012)], [r - 0.0015, -(hem + 0.0006)], [r - 0.001, -(hem + 0.006)]);
    pts.sort((a, b) => a[1] - b[1]);
  }
  const geo = lathe(pts, 18);
  const pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3), iw = new Float32Array(n), c = new THREE.Color();
  const ss = THREE.MathUtils.smoothstep;
  for (let i = 0; i < n; i++) {
    const d = -pos.getY(i);
    const w1 = ss(d, l1 - 0.05, l1 + 0.05), w2 = ss(d, l1 + l2 - 0.012, l1 + l2 + 0.012);
    si.set([0, 1, 2, 0], i * 4); sw.set([1 - w1, Math.max(0, w1 - w2), w2, 0], i * 4);
    c.setHex(colAt(d)); col.set([c.r, c.g, c.b], i * 3);
    iw[i] = ss(d, inkFrom, inkTo);              // no outline where the limb grows out of the body
  }
  geo.translate(x, y, 0);
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('inkW', new THREE.Float32BufferAttribute(iw, 1));
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
  const torso = new THREE.Mesh(lathe(smooth([[0.001, -0.01], [0.112, 0.0], [0.125, 0.1], [0.122, 0.17],
    [0.132, 0.25], [0.134, 0.278], [0.12, 0.31], [0.088, 0.342], [0.05, 0.362], [0.001, 0.37]], 36), 32), top);
  const TZ = 0.78 + 0.08 * S.belly;                  // torso depth
  torso.scale.set(B, 1, TZ);
  J.spine.add(torso);
  // a belly pushes FORWARD (never out to the sides, where the arms hang)
  if (S.belly > 0.05) {
    const k = 0.7 + 0.4 * S.belly;
    const bel = new THREE.Mesh(lathe(smooth([[0.001, -0.11], [0.07, -0.09], [0.11, -0.02], [0.105, 0.05], [0.06, 0.1], [0.001, 0.11]], 20), 22), top);
    bel.scale.set(0.95 * B, 0.95, 0.7 * k); at(bel, 0, 0.12, (0.02 + 0.05 * S.belly)); J.spine.add(bel);
  }
  // ── neck + head ──
  // the neck rises from the back of the shoulders and leans forward into the skull
  J.neck = joint(J.spine, 0, 0.35, -0.014);
  // the neck flares into the shoulders below and tucks up under the jaw above; its outline
  // fades out at both ends so it grows out of the body and into the head, not stuck between them
  {
    const g = lathe(smooth([[0.001, -0.035], [0.064, -0.03], [0.058, -0.008], [0.049, 0.014], [0.043, 0.035], [0.041, 0.065], [0.045, 0.095], [0.035, 0.115], [0.001, 0.12]], 30), 20);
    const P = g.attributes.position, iw = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) { const y = P.getY(i); iw[i] = THREE.MathUtils.smoothstep(y, 0.0, 0.025) * (1 - THREE.MathUtils.smoothstep(y, 0.05, 0.075)); }
    g.setAttribute('inkW', new THREE.BufferAttribute(iw, 1));
    const nk = new THREE.Mesh(g, skin); nk.rotation.x = 0.22; nk.scale.z = 0.88; at(nk, 0, 0.0, 0.014); J.neck.add(nk);
  }
  // a collar: the neckline of whatever they wear, so the neck rises out of clothes
  {
    const topM = paint(S.top);
    if (S.outfit === 'coat') {                                  // a stand-up coat collar, open at the front
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.078, 0.05, 24, 1, true, Math.PI * 0.18, Math.PI * 1.64), paint(S.top, { side: THREE.DoubleSide }));
      c.position.set(0, 0.362, -0.01); c.rotation.x = 0.12; J.spine.add(c);
    } else {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.013, 8, 26), S.outfit === 'uniform' ? topM : topM);
      ring.rotation.x = Math.PI / 2 + 0.2; ring.scale.set(1, 0.85, 1); ring.position.set(0, 0.352, -0.006); J.spine.add(ring);
      if (S.outfit === 'uniform') { const edge = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.004, 6, 26), paint(0xe4b84f)); edge.rotation.copy(ring.rotation); edge.scale.copy(ring.scale); edge.position.set(0, 0.362, -0.004); J.spine.add(edge); }
    }
  }
  J.head = joint(J.neck, 0, 0.06, 0.016);
  // the head: its own shape, features, expression and hair (faces.js)
  const head = buildHead(J, S, S.face || {}, { skin, hairM, dark });
  const onSkull = (u, v, zs, out) => { const p = head.pt(u, v, zs); return p.add(p.clone().sub(HC).normalize().multiplyScalar(out)); };
  const hs = S.hairStyle;
  if (hs === 'bun') {                 // a twisted bun high at the back, with a band
    const bun = ball(0.056, hairM, 18, 14); bun.scale.set(1, 0.9, 0.95); bun.position.copy(onSkull(0, 0.6, -1, 0.04)); J.head.add(bun);
    const twist = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 20), hairM); twist.position.copy(bun.position); twist.rotation.x = 0.9; J.head.add(twist);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 16), paint(0x8e2f3a)); band.position.copy(onSkull(0, 0.6, -1, 0.012)); band.rotation.x = 0.9; J.head.add(band);
  } else if (hs === 'pony') {         // a ponytail of flowing locks: gathered at the tie, splaying and flicking at the ends
    const root = onSkull(0, 0.3, -1, 0.01);
    const pony = J.pony = new THREE.Group(); pony.position.copy(root); J.head.add(pony);
    const down = new THREE.Vector3(0, -0.93, -0.37), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const base = new THREE.Color(S.hair ?? 0x1d1a1a);
    for (let i = -2; i <= 2; i++) {
      const sg = Math.sign(i) || (Math.random() < 0.5 ? -1 : 1), w = i * 0.006;
      const pts = [V(w, 0, 0), down.clone().multiplyScalar(0.05).add(V(i * 0.008, 0, -0.004)),
        down.clone().multiplyScalar(0.11).add(V(i * 0.016, 0, -0.008 * Math.abs(i))),
        down.clone().multiplyScalar(0.16).add(V(i * 0.026, 0, 0.004)),
        down.clone().multiplyScalar(0.185).add(V(i * 0.034 + sg * 0.01, 0.024, 0.02))];
      pony.add(lock(pts, 0.017 - Math.abs(i) * 0.0015, base, i));
    }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.008, 6, 14), paint(S.hatColor ?? 0xe0b445)); tie.rotation.x = 0.4; pony.add(tie);
  }
  // hats are made from THIS head's shape, so they sit on the skull, not on top of it
  const hatM = paint(S.hatColor ?? 0x2a2230);
  const V3 = THREE.Vector3, sh = head.shape, ssm = THREE.MathUtils.smoothstep;
  const at3 = (u, v, w) => sh(new V3(u, v, w).normalize());
  if (S.hat === 'cap') {          // a guard's peaked cap: a band fitted to the head, a wide crown, a sloped visor
    const yD = 0.4, Lx = at3(1, yD, 0).x, Fz = at3(0, yD, 1).z, Bz = at3(0, yD, -1).z, yb = at3(0, yD, 1).y;
    const rx = Lx * 1.07, rz = (Fz - Bz) / 2 * 1.08, zc = (Fz + Bz) / 2;
    const capG = new THREE.Group(); capG.position.set(0, yb, zc); capG.rotation.x = -0.1; J.head.add(capG);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.07, 32, 1, true), paint(S.hatColor ?? 0x24304a, { side: THREE.DoubleSide })); band.scale.set(rx, 1, rz); band.position.y = 0.035; capG.add(band);
    const gold = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.016, 32, 1, true), paint(0xe4b84f, { side: THREE.DoubleSide })); gold.scale.set(rx * 1.008, 1, rz * 1.008); gold.position.y = 0.022; capG.add(gold);
    const crown = new THREE.Mesh(lathe(smooth([[0.001, 0.0], [0.9, 0.0], [1.08, 0.012], [1.1, 0.03], [0.95, 0.045], [0.001, 0.047]], 16), 32), hatM);
    crown.scale.set(rx * 1.12, 1, rz * 1.2); crown.position.set(0, 0.068, 0.012); capG.add(crown);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.01, 24, 1, false, -Math.PI / 2, Math.PI), paint(0x1a1a22, { hatch: 0 }));
    visor.scale.set(rx * 0.92, 1, rz * 0.62); visor.position.set(0, 0.006, rz * 0.62); visor.rotation.x = 0.38; capG.add(visor);
    const badge = ball(0.014, paint(0xe4b84f), 10, 8); badge.scale.z = 0.5; badge.position.set(0, 0.045, rz + 0.004); capG.add(badge);
  } else if (S.hat === 'flat') {  // a tweed flat cap: hugs the skull, a flat top sloping down to the front, a short brim
    const yTop = head.top + 0.01, zF = at3(0, 0.42, 1).z;
    const g = sculpt(sh, 72, 54, { mask: (d) => d.y - lineAt(d, 0.42, 0.22, 0.0), inflate: () => 1.12,
      post: (o, d) => {
        o.z += 0.035 * Math.max(0, d.z) * ssm(d.y, 0.2, 0.85);                       // the front puffs forward over the brim
        const plane = yTop + 0.022 - 0.16 * (o.z - HC.z);                              // a flat top above the hair, sloping down to the front
        if (o.y > plane) o.y = plane + (o.y - plane) * 0.22;
      },
      color: (d, c) => { const h = Math.sign(Math.sin((d.x + Math.abs(Math.sin(d.z * 18)) * 0.06) * 90)); return c.set(S.hatColor ?? 0x5b4636).offsetHSL(0, 0, 0.01 * h); } });  // a faint herringbone
    J.head.add(new THREE.Mesh(g, paint(0xffffff, { vertexColors: true })));
    const fr = at3(0, 0.42, 1), w = at3(1, 0.42, 0).x;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.012, 22, 1, false, -Math.PI / 2, Math.PI), hatM);
    brim.scale.set(w * 0.88, 1, 0.055); brim.position.set(0, fr.y + 0.002, fr.z + 0.004); brim.rotation.x = 0.36; J.head.add(brim);
  } else if (S.hat === 'helmet') { // a cycling helmet shell over the skull: vents, a dark rim, a chin strap
    // vents and the rim are blended, not switched, so their edges are smooth curves
    const vent = (d) => ssm(-Math.sin(d.x * 21), 0.35, 0.85) * ssm(d.y, 0.32, 0.5) * (1 - ssm(Math.abs(d.x), 0.4, 0.5));
    const edge = (d) => d.y - lineAt(d, 0.3, 0.12, -0.12);
    const rimK = (d) => 1 - ssm(edge(d), 0.025, 0.075);
    const yel = new THREE.Color(S.hatColor ?? 0xe0b445), drk = new THREE.Color(0x2a2230);
    const g = sculpt(sh, 88, 66, { mask: edge, inflate: (d) => 1.17 - 0.022 * vent(d),
      color: (d, c) => c.copy(yel).lerp(drk, Math.max(vent(d), rimK(d))) });
    J.head.add(new THREE.Mesh(g, paint(0xffffff, { vertexColors: true })));
    for (const sx of [-1, 1]) {
      const pts = [[0.86, 0.14], [0.8, -0.3], [0.5, -0.74], [0.12, -0.93]].map(([u, v]) => { const d = new V3(sx * u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v))).normalize(); return sh(d).add(d.multiplyScalar(0.007)); });
      const strap = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.0035, 5, false), paint(0x2a2230, { hatch: 0 })); strap.userData.noInk = true; J.head.add(strap);
    }
  } else if (S.hat === 'beanie') {
    const g = sculpt(sh, 48, 36, { mask: (d) => d.y - lineAt(d, 0.4, 0.2, -0.1), inflate: () => 1.13 });
    J.head.add(new THREE.Mesh(g, hatM));
    J.head.add(at(ball(0.032, hatM, 10, 8), 0, head.top + 0.025, -0.01));
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
      [0.22, 0.035], [0.28, 0.028], [0.3, 0.026], [0.312, 0.001]], (d) => d < cuff ? S.top : skinHex,
      { hem: cuff, inkFrom: 0.03, inkTo: 0.1 }));
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
    for (let i = 0; i < 3; i++) { const b = ball(0.011, paint(0x2a2230, { hatch: 0 }), 8, 6); b.position.set(0.012, 0.22 - i * 0.075, 0.104); b.scale.z = 0.5; b.userData.noInk = true; J.spine.add(b); }   // coat buttons
  } else if (S.outfit === 'dress') {
    const d = new THREE.Mesh(lathe([[0.001, -0.33], [0.198, -0.32], [0.2, -0.3], [0.14, -0.05], [0.12, 0.05]], 22), top);
    d.scale.set(B, 1, 0.85); J.hips.add(d);
  } else if (S.outfit === 'apron') {  // a framer's canvas apron
    // a waist apron: canvas wrapped round the front from the belt to mid-thigh, with a pocket
    const r0 = (0.128 + 0.03 * S.belly) * B, apM = paint(S.accent ?? 0xd8c9a8, { side: THREE.DoubleSide });
    const a = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0 * 1.12, 0.26, 20, 1, true, -1.15, 2.3), apM);
    a.scale.z = 0.86; at(a, 0, -0.07, 0); J.hips.add(a);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(r0 * 1.01, 0.008, 5, 26, 2.4), paint(0x8a6a52)); tie.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.2); tie.scale.y = 0.86; at(tie, 0, 0.06, 0); J.hips.add(tie);   // the waistband wraps the front only
    const pk = new THREE.Mesh(rbox(0.11, 0.05, 0.012, 0.004), paint(0x8a6a52)); at(pk, 0, -0.1, r0 * 1.06 * 0.86 + 0.004); J.hips.add(pk);
  } else if (S.outfit === 'uniform') {
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.12 * B, 0.018, 6, 22), dark); belt.rotation.x = Math.PI / 2; belt.scale.set(1.02, TZ * 1.02, 1); at(belt, 0, 0.04, 0); J.spine.add(belt);
    const badge = ball(0.018, paint(0xe4b84f), 8, 6); at(badge, -0.06, 0.25, 0.1); J.spine.add(badge);
  } else if (S.outfit === 'vest') {   // a courier's high-vis vest
    const v = new THREE.Mesh(lathe([[0.126, -0.005], [0.136, 0.12], [0.139, 0.25], [0.138, 0.285], [0.131, 0.296]], 28)   /* ends just outside the shoulder, a clean edge */, acc);
    v.scale.set(B * 1.03, 1, TZ * 1.06); J.spine.add(v);
  } else if (S.outfit === 'cardigan') {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.012), acc); at(c, 0, 0.16, 0.098); J.spine.add(c);
  }

  root.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
  ink(root, 'fine');
  // arms hang just clear of the waist: solve the angle from this body's own widths
  const shoulderX = 0.112 * B, waistHalf = 0.125 * B, armR = 0.045 * Math.sqrt(B), drop = 0.19;
  const armOut = Math.atan2(waistHalf + armR * 0.55 - shoulderX, drop) + 0.03
    + (S.outfit === 'coat' || S.outfit === 'dress' ? 0.09 : 0);
  // arms twist about their own length first (XZY), so a forearm can cross the body
  for (const k of ['L', 'R']) J['arm' + k].rotation.order = 'XZY';
  const stance = STANCES[S.stance] || null;
  let board = null, pen = null;
  if (S.stance === 'writing') {
    board = PROPS.board(); board.position.set(-0.012, 0.13, 0.19); board.rotation.x = -0.62; J.spine.add(board);
    pen = PROPS.pen(); pen.position.set(0, -0.046, 0.004); J.handR.add(pen);
  }
  if (stance) for (const k of ['L', 'R']) {
    const h = stance[k]?.hold; if (!h) continue;
    const prop = PROPS[h[0]](); prop.position.set(...h[1]); prop.rotation.set(...h[2]);
    J['grip' + k].add(prop);
  }
  const inst = { kind: 'folk', rig: root, J, armOut, stance, board, pen, t: Math.random() * 10, wc: Math.random() * 6 };
  return inst;
}

// poses: k 0 standing … 1 walking; talk 0..1 raises a hand
// ── two-bone IK: put the fist (grip centre) at `target` (spine frame), elbow toward `pole` ──
const UA = 0.16, FA = 0.15 + 0.046;                          // upper arm, forearm + wrist→fist
const _m4 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
function ikArm(J, side, target, pole) {
  const S0 = J['arm' + side].position;
  const D = target.clone().sub(S0);
  const d = THREE.MathUtils.clamp(D.length(), Math.abs(UA - FA) + 0.005, UA + FA - 0.002);
  D.normalize();
  const A = Math.acos(THREE.MathUtils.clamp((UA * UA + d * d - FA * FA) / (2 * UA * d), -1, 1));
  const bend = Math.PI - Math.acos(THREE.MathUtils.clamp((UA * UA + FA * FA - d * d) / (2 * UA * FA), -1, 1));
  const p = pole.clone().addScaledVector(D, -pole.dot(D)).normalize();
  const u = D.clone().multiplyScalar(Math.cos(A)).addScaledVector(p, Math.sin(A));      // upper arm direction
  _y.copy(u).negate();                                                                   // the limb hangs along −Y
  _z.copy(D).addScaledVector(u, -D.dot(u)).normalize();                                  // the forearm folds toward +Z
  _x.crossVectors(_y, _z);
  J['arm' + side].quaternion.setFromRotationMatrix(_m4.makeBasis(_x, _y, _z));
  J['fore' + side].rotation.set(-bend, 0, 0);
}
// the director writing: board held at the waist, tilted to her face; her pen moves along
// the lines, she pauses now and then to look up — and stops to look at you when you talk
const _bp = new THREE.Vector3(), _bn = new THREE.Vector3(), _tip = new THREE.Vector3();
function writePose(inst, t, talk) {
  const { J, board, pen } = inst;
  if (!board) return;
  const cycle = t % 9, pause = THREE.MathUtils.smoothstep(cycle, 6.6, 7.0) * (1 - THREE.MathUtils.smoothstep(cycle, 8.4, 8.8));
  const lift = Math.max(pause, talk);
  // where the pen is on the page (board-local): lines written left → right, top → bottom
  const w = (t * 0.55) % 5, line = Math.floor(w), along = w - line;
  _bp.set(-0.032 + along * 0.06 + 0.002 * Math.sin(t * 31), 0.006, 0.03 - line * 0.022);
  board.updateMatrix();
  const toSpine = board.matrix;
  const tip = _bp.clone().applyMatrix4(toSpine);
  _bn.set(0, 1, 0).applyQuaternion(board.quaternion);                                   // the paper's normal
  // right fist sits above and toward her from the tip; lifts off when she pauses
  const fist = tip.clone().addScaledVector(_bn, 0.05 + 0.04 * lift).add(new THREE.Vector3(0.022, 0, -0.026));
  ikArm(J, 'R', fist, new THREE.Vector3(0.6, -0.8, -0.2));
  // left fist under the board's left edge, holding it
  const hold = new THREE.Vector3(-0.058, 0, -0.01).applyMatrix4(toSpine).addScaledVector(_bn, -0.02);
  ikArm(J, 'L', hold, new THREE.Vector3(-0.6, -0.8, -0.2));
  J.handR.rotation.set(-0.5, 0, 0.2); J.handL.rotation.set(-0.9, 0.3, 0);
  gripHand(J.gripR, 0.9); gripHand(J.gripL, 0.7);
  // the pen points at the page (or lifts away)
  if (pen) {
    pen.parent.updateWorldMatrix(true, false);
    J.spine.updateWorldMatrix(true, false);
    _tip.copy(tip).addScaledVector(_bn, 0.03 * lift).applyMatrix4(J.spine.matrixWorld);
    pen.lookAt(_tip);
  }
  // head bowed over the page; looks up when she pauses or you talk
  J.neck.rotation.x = 0.16 * (1 - lift);
  J.head.rotation.x = 0.4 * (1 - lift) + J.head.rotation.x * lift;
  if (lift) J.head.rotation.y *= 1 - lift * 0.3;
}

export function poseFolk(inst, dt, k, { talk = 0 } = {}) {
  const J = inst.J;
  inst.t += dt; inst.wc += dt * 5.6 * (0.35 + 0.9 * k);
  const s = Math.sin(inst.wc), c = Math.cos(inst.wc), t = inst.t, idle = 1 - k;
  const legA = 0.48 * k, armA = 0.4 * k;
  // forward is +Z: a negative X rotation swings a hanging limb forward
  J.thighL.rotation.x = -legA * s; J.thighR.rotation.x = legA * s;
  // the knee folds on the forward swing (the left thigh travels forward while c > 0)
  J.shinL.rotation.x = 0.9 * k * Math.max(0, c); J.shinR.rotation.x = 0.9 * k * Math.max(0, -c);
  // arms: each side follows the person's stance (what they're doing), else a relaxed hang;
  // walking swings them; talking lifts the free hand into a gesture
  const st = inst.stance;
  for (const side of ['L', 'R']) {
    if (st?.ik) break;                                        // arms solved by IK below
    const sg = side === 'L' ? -1 : 1;
    const p = { fwd: 0.06, out: 0, twist: 0, bend: 0.25, wrist: 0, grip: 0.25, ...(st?.[side] || {}) };
    p.out += inst.armOut;                                     // stance `out` is relative to this body's clearance
    st?.anim?.(side, t, p);
    p.out += idle * 0.015 * Math.sin(t * 1.3 + sg);
    p.fwd += (side === 'L' ? 1 : -1) * armA * s;
    if (talk && st?.free === side || talk && !st && side === 'R') for (const key in TALK_POSE) {
      const g = key === 'fwd' ? TALK_POSE.fwd + 0.12 * Math.sin(t * 3.1) : key === 'bend' ? TALK_POSE.bend + 0.25 * Math.sin(t * 4.3)
        : key === 'out' ? TALK_POSE.out + inst.armOut : TALK_POSE[key];
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
  if (J.pony) {                                              // the ponytail swings, more when moving
    J.pony.rotation.z = (0.07 + 0.12 * k) * Math.sin(t * 1.6 + 0.4) + 0.05 * k * s;
    J.pony.rotation.x = 0.05 * Math.sin(t * 1.15) - 0.1 * k;
  }
  if (st?.ik) writePose(inst, t, talk);
  return Math.abs(c) * 0.03 * k;
}
