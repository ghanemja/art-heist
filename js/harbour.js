// ─── THE HARBOUR: a stone quay, a boathouse, a plank pier, and a little boat ──
// The harbour site sits right on the bay's bank, which drops from the land (0.45)
// to the bay floor (-1.5) inside two units — so nothing can just be set down on it.
// Instead the land behind is levelled to a true PLANE (planHarbour), a stone quay
// is built over the bank with its face straight down into the water, and the pier
// runs out from the quay on posts, plank by plank, each section laid level on the
// sea's own curve (a 7-unit pier would otherwise end a metre above the water).
//
// Layout is in the site's frame, offset to the quay's centre: (u, v) with v toward
// town; the spur road from town ends at about (u -2.1, v 2.1), so the quay stops
// short of it, the boathouse stands to the east and the crates (the story's clue)
// to the west, both clear of the walk from the road end down to the pier.
import * as THREE from 'three';
import { R, frame, flatten, reserve, alignToSurface, yawToFace, addFloor, SEA } from './world.js';
import { PAL, paint, ink } from './style.js';
import { rbox, lathe, lamp } from './props.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const OFF = [2, 2.5];                 // the quay's centre in the site frame
const LAND = 0.45;                    // the levelled land's height
const QUAY = { u0: -5, u1: 5.5, v0: -2.2, v1: 1.7, top: 0.12, foot: -2.4 };
const PIER = { u: 0.5, n: 7, w: 1.7, deck: 0.58 };     // deck height above sea level
export const HARBOUR = {
  crates: [OFF[0] - 3.3, OFF[1] - 0.9],                 // site-frame spot for the story's crates
  cratesFace: [OFF[0] - 2.8, OFF[1] + 6],               // …turned to face you as you come down from the road
  boat: [OFF[0] + 2.4, OFF[1] - 6.5],                    // moored alongside the pier, bow out to sea
};

// runs in planTown, BEFORE the planet is shaped: level the land, keep the quay's ground clear
export function planHarbour(siteDir, toward) {
  const F = frame(siteDir, toward), O = F(...OFF);
  flatten(O, 6.0, LAND, { plane: O });
  reserve(F(OFF[0] + 3.2, OFF[1]), 2.9, 'harbour-quay');
}

const wood = () => paint(0xc8a47c), woodDark = () => paint(PAL.bark), stone = () => paint(0xc9bfae), coping = () => paint(PAL.kerb);
const dark = () => paint(PAL.ink, { hatch: 0 });

// a signboard painted on a canvas
function board(text, w, h, { bg = '#f3eee4', fg = '#2a2230', font = '600 $px "Patrick Hand", cursive' } = {}) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = Math.round(512 * h / w);
  const c = cv.getContext('2d'); c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
  c.strokeStyle = fg; c.lineWidth = 6; c.strokeRect(8, 8, cv.width - 16, cv.height - 16);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  let px = Math.round(cv.height * 0.55); c.font = font.replace('$', px);
  while (c.measureText(text).width > cv.width - 50 && px > 10) { px -= 2; c.font = font.replace('$', px); }
  c.fillText(text, cv.width / 2, cv.height / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return paint(0xffffff, { map: t, hatch: 0 });
}

// the boathouse: teal weatherboard, cream corners, a pitched red roof with an overhang,
// big boat doors to the water, a round gable window, a sign and a lifebuoy
function boathouse() {
  const g = new THREE.Group(), m = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  const W = 2.8, D = 2.4, H = 1.8, teal = paint(PAL.teal), cream = paint(PAL.cream);
  m(rbox(W, H, D, 0.06), teal, 0, H / 2, 0);
  for (let y = 0.35; y < H - 0.1; y += 0.32) for (const s of [-1, 1]) m(rbox(W + 0.02, 0.025, 0.02, 0.008), paint(0x6a9d92), 0, y, s * (D / 2 + 0.005));   // weatherboard lines
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m(rbox(0.12, H + 0.02, 0.12, 0.03), cream, sx * W / 2, H / 2, sz * D / 2);
  m(rbox(W + 0.14, 0.12, D + 0.14, 0.03), cream, 0, 0.06, 0);                                 // plinth
  // gable infill front and back, then the two roof slabs
  const tri = new THREE.Shape(); tri.moveTo(-W / 2, 0); tri.lineTo(W / 2, 0); tri.lineTo(0, 0.85); tri.closePath();
  const gab = new THREE.ExtrudeGeometry(tri, { depth: 0.08, bevelEnabled: false }); gab.translate(0, 0, -0.04);
  for (const s of [-1, 1]) m(gab, teal, 0, H, s * (D / 2 - 0.04));
  const run = 1.6, rise = 0.88, a = Math.atan2(rise, run), len = Math.hypot(run, rise) + 0.12;
  for (const s of [-1, 1]) { const r = m(rbox(len, 0.09, D + 0.5, 0.03), paint(PAL.roofRed), s * run / 2, H + rise / 2 + 0.06, 0); r.rotation.z = -s * a; }
  m(rbox(0.12, 0.12, D + 0.55, 0.04), paint(0x8f4430), 0, H + rise + 0.06, 0);               // ridge
  // the water side (-z): boat doors, a sign over them, a round window in the gable, a lifebuoy
  const fz = -D / 2 - 0.02;
  m(rbox(1.5, 1.32, 0.06, 0.02), cream, 0, 0.72, fz);
  for (const s of [-1, 1]) m(rbox(0.68, 1.22, 0.06, 0.02), woodDark(), s * 0.36, 0.7, fz - 0.03);
  for (const s of [-1, 1]) { const br = m(rbox(0.06, 1.3, 0.04, 0.01), paint(0x6e4c36), s * 0.36, 0.7, fz - 0.07); br.rotation.z = s * 0.5; }
  m(new THREE.PlaneGeometry(1.5, 0.34), board('THE HARBOUR · BOATS', 1.5, 0.34), 0, 1.56, fz - 0.035).rotation.y = Math.PI;
  m(new THREE.TorusGeometry(0.2, 0.05, 8, 20), cream, 0, H + 0.36, fz - 0.03);
  m(new THREE.CircleGeometry(0.19, 20), paint(0xfff1c8, { emissive: 0xffd98a, hatch: 0 }), 0, H + 0.36, fz - 0.02).rotation.y = Math.PI;
  m(new THREE.TorusGeometry(0.2, 0.065, 10, 24), paint(PAL.accent), 1.05, 0.95, fz - 0.06);
  for (let k = 0; k < 4; k++) { const q = m(new THREE.TorusGeometry(0.2, 0.068, 10, 6, Math.PI / 4), paint(0xf6eedb), 1.05, 0.95, fz - 0.06); q.rotation.z = k * Math.PI / 2 + Math.PI / 8; }
  // a window down each side
  for (const s of [-1, 1]) { m(rbox(0.06, 0.62, 0.72, 0.02), cream, s * (W / 2 + 0.02), 1.0, 0.2); m(new THREE.PlaneGeometry(0.56, 0.48), paint(0xfff1c8, { emissive: 0xffd98a, hatch: 0 }), s * (W / 2 + 0.055), 1.0, 0.2).rotation.y = s * Math.PI / 2; }
  return g;
}

// one pier section (1 unit long): planks across, two stringers, posts down into the bay
function pierSection(i, last) {
  const g = new THREE.Group(), m = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  const W = PIER.w, wd = wood(), wk = woodDark();
  for (let k = 0; k < 3; k++) {
    const p = m(rbox(W, 0.09, 0.3, 0.025), wd, ((i * 7 + k * 3) % 5 - 2) * 0.012, -0.045, -0.335 + k * 0.335);
    p.rotation.y = ((i * 5 + k) % 3 - 1) * 0.012;
  }
  for (const s of [-1, 1]) m(rbox(0.12, 0.14, 1.02, 0.03), wk, s * (W / 2 - 0.16), -0.16, 0);
  if (i % 2 === 0 || last) for (const s of [-1, 1]) {
    const top = last ? 0.32 : 0.0;          // the far end: two mooring posts stand proud of the deck
    m(lathe([[0.001, -2.7], [0.1, -2.7], [0.1, top], [0.07, top + 0.04], [0.001, top + 0.05]], 10), wk, s * (W / 2 + 0.02), 0, last ? -0.38 : 0);
  }
  return g;
}

// the harbour, built round the site; add(obj) puts things in the world, solid(dir, r) blocks walking
export function buildHarbour(siteDir, toward, add, solid) {
  const F = frame(siteDir, toward), P = (u, v) => F(OFF[0] + u, OFF[1] + v);
  const O = P(0, 0);
  const g = new THREE.Group();
  g.position.copy(O).multiplyScalar(R + LAND);
  alignToSurface(g, O, yawToFace(O, toward));
  g.updateMatrixWorld(true);
  // site (u, v) → this group's local (x, z): measured, so the frame's handedness can't bite
  const L = (u, v) => g.worldToLocal(P(u, v).multiplyScalar(R + LAND));
  const at = (o, u, v, y = 0) => { const p = L(u, v); o.position.set(p.x, y, p.z); g.add(o); return o; };
  const m = (geo, mat, u, v, y) => at(new THREE.Mesh(geo, mat), u, v, y);
  const Q = QUAY, qw = Q.u1 - Q.u0, qd = Q.v1 - Q.v0, qu = (Q.u0 + Q.u1) / 2, qv = (Q.v0 + Q.v1) / 2;
  // the quay: a stone block from the bay floor up to the paving, its face straight down into the water
  m(rbox(qw, Q.top - 0.06 - Q.foot, qd, 0.08), stone(), qu, qv, (Q.foot + Q.top - 0.06) / 2);
  m(rbox(qw + 0.12, 0.1, qd + 0.12, 0.035), coping(), qu, qv, Q.top - 0.05);
  // a darker stone course along the face, just above the water
  m(rbox(qw + 0.02, 0.12, 0.06, 0.03), paint(0xa99e8c), qu, Q.v0 - 0.0, -0.32);
  // bollards along the edge, a lamp by the pier head, two barrels by the boathouse
  for (const u of [-4.4, -2.4, 2.0, 4.7]) m(lathe([[0.001, 0], [0.13, 0], [0.13, 0.05], [0.08, 0.1], [0.08, 0.3], [0.12, 0.36], [0.1, 0.42], [0.001, 0.43]], 12), dark(), u, Q.v0 + 0.3, Q.top);
  for (const [u, v] of [[5.0, -1.45], [5.15, -0.9]]) m(lathe([[0.001, 0], [0.2, 0], [0.24, 0.12], [0.25, 0.3], [0.24, 0.48], [0.2, 0.6], [0.001, 0.6]], 14), paint(0x9a6a46), u, v, Q.top);
  // the boathouse, its boat doors to the water
  const bh = at(boathouse(), 3.6, 0.2, Q.top);
  bh.rotation.y = Math.atan2(L(3.6, 1).x - L(3.6, 0).x, L(3.6, 1).z - L(3.6, 0).z);   // its back (+z) toward town
  ink(g, 'mid');
  at(lamp(), -0.85, Q.v0 + 0.45, Q.top);                  // (inked already: added after)
  add(g);
  // walkable paving: the quay is flat, the planet curves away under it — the top's height
  // in this frame, measured from the planet's centre, rises with distance from the middle
  const qx0 = Math.min(L(Q.u0, 0).x, L(Q.u1, 0).x), qx1 = Math.max(L(Q.u0, 0).x, L(Q.u1, 0).x);
  const qz0 = Math.min(L(0, Q.v0).z, L(0, Q.v1).z), qz1 = Math.max(L(0, Q.v0).z, L(0, Q.v1).z);
  addFloor(g, (x, z) => x > qx0 && x < qx1 && z > qz0 && z < qz1 ? Q.top + (x * x + z * z) / (2 * (R + LAND)) : null);
  solid(P(3.6, 0.2), 1.55);
  solid(P(5.05, -1.2), 0.45);
  // the pier: sections laid out from the quay's face over the water, each level on the sea
  const shore = P(PIER.u, 40);
  for (let i = 0; i < PIER.n; i++) {
    const d = P(PIER.u, Q.v0 - 0.5 - i);
    const s = pierSection(i, i === PIER.n - 1);
    s.position.copy(d).multiplyScalar(R + SEA + PIER.deck);
    alignToSurface(s, d, yawToFace(d, shore));
    ink(s, 'fine'); add(s);
    addFloor(s, (x, z) => Math.abs(x) < PIER.w / 2 && Math.abs(z) < 0.52 ? 0 : null);
  }
  return { root: g, boat: P(...HARBOUR.boat.map((n, k) => n - OFF[k])), boatFace: P(HARBOUR.boat[0] - OFF[0], -30) };
}

// ── the boat: a little motor launch — a rounded white hull with a red rubbing strake,
// a wooden deck, a striped canopy on four posts, a bench, a wheel and an outboard.
// Local frame: +z is the bow, y = 0 the waterline.
export function buildBoat() {
  const g = new THREE.Group(), m = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  const Lh = 2.5, Wh = 1.15, keel = -0.22, gun = 0.34;
  // the hull: a subdivided box bent into shape — tapered to a bow, a rounded bilge, rocker forward
  const box = new THREE.BoxGeometry(1, 1, 1, 6, 4, 14);
  const p = box.attributes.position;
  const sheer = (t) => gun + 0.13 * Math.max(0, t / 0.5) ** 2;        // the gunwale rises toward the bow
  const width = (t) => t > 0 ? Math.sqrt(Math.max(0.0, 1 - (t / 0.5) ** 2.4)) : 1 - 0.18 * (-t / 0.5) ** 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + 0.5, t = p.getZ(i);           // y 0 (keel) … 1 (gunwale)
    const bot = keel + 0.24 * Math.max(0, t / 0.5) ** 2;               // rocker: the bottom sweeps up to the bow
    const ws = width(t) * (0.42 + 0.58 * Math.sin(Math.min(1, y * 1.15) * Math.PI / 2));   // round bilge
    p.setXYZ(i, x * Wh * ws, bot + (sheer(t) - bot) * y, t * Lh);
  }
  box.deleteAttribute('uv'); box.deleteAttribute('normal');
  const hullGeo = mergeVertices(box, 1e-4); hullGeo.computeVertexNormals();
  m(hullGeo, paint(0xf6f1e6));
  // the rubbing strake: a red tube along both gunwales round the bow
  const pts = [];
  for (let k = 0; k <= 24; k++) { const t = -0.5 + k / 24; pts.push(new THREE.Vector3(Wh / 2 * width(t) + 0.02, sheer(t) - 0.05, t * Lh)); }
  const half = new THREE.CatmullRomCurve3(pts);
  for (const s of [-1, 1]) { const tb = m(new THREE.TubeGeometry(half, 40, 0.04, 6), paint(PAL.accent)); tb.scale.x = s; }
  // the deck inlay: a wooden plate following the hull's outline, just above the gunwale
  const sh = new THREE.Shape();
  for (let k = 0; k <= 20; k++) { const t = -0.5 + k / 20; const v = [Wh / 2 * width(t) - 0.08, t * Lh]; k ? sh.lineTo(...v) : sh.moveTo(...v); }
  for (let k = 20; k >= 0; k--) { const t = -0.5 + k / 20; sh.lineTo(-(Wh / 2 * width(t) - 0.08), t * Lh); }
  const deck = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }); deck.rotateX(Math.PI / 2); deck.translate(0, gun + 0.035, 0);
  const dk = m(deck, paint(0xc8a47c)); dk.userData.noInk = true;
  // bench, wheel console, outboard motor
  m(rbox(0.9, 0.1, 0.36, 0.03), paint(PAL.bark), 0, gun + 0.2, -0.45);
  for (const s of [-1, 1]) m(rbox(0.06, 0.18, 0.3, 0.02), paint(PAL.bark), s * 0.38, gun + 0.1, -0.45);
  m(rbox(0.5, 0.36, 0.26, 0.05), paint(PAL.teal), 0, gun + 0.2, 0.32);
  const wheel = m(new THREE.TorusGeometry(0.12, 0.02, 6, 16), paint(0x3b2f3a, { hatch: 0 }), 0, gun + 0.46, 0.2); wheel.rotation.x = -0.6;
  m(rbox(0.3, 0.38, 0.32, 0.08), paint(0x3b2f3a, { hatch: 0 }), 0, gun + 0.18, -1.32);
  m(rbox(0.08, 0.5, 0.1, 0.03), paint(0x3b2f3a, { hatch: 0 }), 0, gun - 0.25, -1.4);
  // the canopy: red and cream stripes on four slim posts
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 16;
  { const c = cv.getContext('2d'); for (let k = 0; k < 8; k++) { c.fillStyle = k % 2 ? '#f3ead7' : '#e8604c'; c.fillRect(k * 16, 0, 16, 16); } }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  for (const sx of [-1, 1]) for (const z of [-0.78, 0.42]) m(new THREE.CylinderGeometry(0.022, 0.022, 1.12, 6), paint(0xe6e0d2, { hatch: 0 }), sx * 0.44, gun + 0.6, z);
  const top = m(rbox(1.02, 0.06, 1.38, 0.03), paint(0xffffff, { map: tex }), 0, gun + 1.18, -0.18);
  for (const z of [-0.88, 0.52]) m(rbox(1.04, 0.1, 0.03, 0.01), paint(PAL.accent), 0, gun + 1.12, z);
  // a pennant on the bow
  m(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), paint(0xe6e0d2, { hatch: 0 }), 0, gun + 0.38, 1.08);
  const fl = new THREE.BufferGeometry(); fl.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.14, 0, 0, -0.07, -0.24], 3)); fl.computeVertexNormals();
  const flag = m(fl, paint(PAL.gold, { side: THREE.DoubleSide }), 0, gun + 0.62, 1.08); flag.userData.noInk = true;
  g.userData.seatY = gun + 0.25; g.userData.seatZ = -0.45;
  g.userData.flag = flag;
  return ink(g, 'mid');
}

// foam: a small pool of flat white rings left behind the boat (fade and spread)
export function createWake(scene) {
  const geo = new THREE.RingGeometry(0.22, 0.34, 20); geo.rotateX(-Math.PI / 2);
  const pool = [];
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xf6f1e6, transparent: true, opacity: 0, depthWrite: false });
    const r = new THREE.Mesh(geo, mat); r.visible = false; r.userData.noInk = true; r.userData.noGround = true; r.raycast = () => {};
    scene.add(r); pool.push({ m: r, t: 1 });
  }
  let k = 0, acc = 0;
  return {
    update(dt, on, pos, up, speed, heading) {
      acc += dt;
      if (on && acc > 0.16) {
        acc = 0; const w = pool[k = (k + 1) % pool.length];
        w.t = 0; w.m.visible = true; w.m.position.copy(pos);
        const side = new THREE.Vector3().crossVectors(up, heading).normalize();          // ellipses lie across the boat's track
        w.m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, heading));
        w.k = Math.min(1, Math.abs(speed) / 5);
      }
      for (const w of pool) {
        if (!w.m.visible) continue;
        w.t += dt / 1.6;
        if (w.t >= 1) { w.m.visible = false; continue; }
        w.m.scale.set(0.8 + w.t * 2.2, 1, 0.6 + w.t * 1.4);
        w.m.material.opacity = 0.45 * (1 - w.t) ** 1.5 * (0.4 + 0.6 * (w.k ?? 1));
      }
    },
  };
}
