// ─── TOWN: reservations first, then roads, then buildings ───────────────────
// Order matters and is the whole point: every structure reserves its ground,
// THEN roads are laid around the reservations, THEN buildings fill the blocks
// the roads leave. Nothing can be built on anything.
import * as THREE from 'three';
import PLAN from './manifest.js';
import { R, llv, arc, frame, slerpDir, reserve, zoneHit, deflect, smooth, buildRoad, ROADS, onRoad,
  settle, yawToFace, radiusAt, flatten, addFloor, isWater, alignToSurface, posOn } from './world.js';
import { PAL, paint, ink, blobShadow } from './style.js';
import { house, block, tree, pine, bush, lamp, bench, rnd, pick, rbox, lathe } from './props.js';
import { buildMuseum } from '../../museum.js';

export const TOWN_C = llv(PLAN.town.center);
const ROAD_MAJOR = 1.05, ROAD_MINOR = 0.62;

// restyle a model built with standard materials into the gouache look
export function restyle(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const conv = (m) => {
      if (!m || m.isShaderMaterial || m.userData?.keep) return m;
      if (m.blending === THREE.AdditiveBlending) return m;          // light beams stay light
      const col = m.color ? m.color.getHex() : 0xffffff;
      const emiss = m.emissive && m.emissive.getHex() !== 0 ? m.emissive.getHex() : undefined;
      return paint(col, { map: m.map || undefined, opacity: m.transparent ? Math.max(0.35, m.opacity) : 1,
        side: m.side, emissive: emiss, hatch: m.map ? 0 : 1 });
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  return root;
}

// ── 1. RESERVE — runs BEFORE the planet is shaped (sites level their ground) ──
const mDir = llv(PLAN.museum.at);
const mF = frame(mDir, TOWN_C);                            // +y local = toward town
export function planTown() {
  reserve(mF(0, -0.3), 4.4, 'museum-plaza');
  reserve(mF(0, -7.0), 8.4, 'museum');
  flatten(mF(0, -6), 12, 0.45, { plane: mDir });          // the museum stands on a true plane
  for (const [k, s] of Object.entries(PLAN.sites)) { reserve(llv(s.at), s.r, 'site:' + k); flatten(llv(s.at), s.r + 1); }
  for (const p of PLAN.projects) { reserve(llv(p.at), 4.2, 'lm:' + p.key); flatten(llv(p.at), 4.4); }
}

export function buildTown(scene) {
  const out = { landmarks: [], sites: {}, museum: null, statics: [], colliders: [] };
  const solid = (d, r) => out.colliders.push({ dir: d.clone(), r });
  const add = (obj) => { scene.add(obj); out.statics.push(obj); return obj; };

  // ── 2. ROADS ───────────────────────────────────────────────────────────────
  // the boulevard: a ring round town, bent round anything reserved
  const B = PLAN.town.boulevard, ring = [];
  const fC = frame(TOWN_C);
  for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; ring.push(fC(Math.cos(a) * B, Math.sin(a) * B)); }
  deflect(ring, { closed: true });
  const ringS = smooth(ring, 2, true);
  deflect(ringS, { closed: true });                          // smoothing must not cut back into a zone
  out.boulevard = buildRoad(scene, ringS, { half: ROAD_MAJOR, closed: true });

  // downtown grid, clipped to the reservation map
  const P = PLAN.town.pitch, CAP = PLAN.town.radius, K = Math.ceil(CAP / P);
  const inTown = (x, y) => Math.hypot(x, y) <= CAP;
  const free = (x, y, half) => !zoneHit(fC(x, y), half + 0.6);
  const lines = [];                                          // each grid line as runs of free samples
  for (let axis = 0; axis < 2; axis++) {
    for (let i = -K; i <= K; i++) {
      const major = i % 2 === 0, half = major ? ROAD_MAJOR : ROAD_MINOR;
      let run = [];
      for (let j = -K * 4; j <= K * 4; j++) {
        const t = j * P / 4;
        const x = axis ? i * P : t, y = axis ? t : i * P;
        if (inTown(x, y) && free(x, y, half)) run.push(fC(x, y));
        else { if (run.length > 4) lines.push({ pts: run, half }); run = []; }
      }
      if (run.length > 4) lines.push({ pts: run, half });
    }
  }
  for (const L of lines) buildRoad(scene, L.pts, { half: L.half, dashed: L.half > 0.9 });

  // spurs: boulevard → each site / project, ending in front of it
  const spur = (target, stopShort, key) => {
    let best = out.boulevard[0];
    for (const p of out.boulevard) if (arc(p, target) < arc(best, target)) best = p;
    const total = arc(best, target);
    if (total < stopShort + 1.5) return null;
    const pts = [];
    const n = Math.max(6, Math.round(total / 1.5));
    for (let k = 0; k <= n; k++) pts.push(slerpDir(best, target, (k / n) * (1 - stopShort / total)));
    deflect(pts, { keep: i => i === 0 || i === pts.length - 1, except: z => z.key === key, clear: 1.8 });
    // smoothing rounds corners back INTO reserved ground: push the smoothed line out again
    const sm = smooth(pts, 2);
    deflect(sm, { keep: i => i === 0 || i === sm.length - 1, except: z => z.key === key, clear: 1.8 });
    return buildRoad(scene, sm, { half: 0.85, dashed: false });
  };

  // ── 3. BUILD ───────────────────────────────────────────────────────────────
  // the museum: the scene of the crime, restyled into the drawn world
  {
    const mus = buildMuseum({ lite: false, glowMats: [], artBase: '../artworks/' });
    restyle(mus.group);
    ink(mus.group, 'mid');
    settle(mus.group, mDir, 6, 0.1, yawToFace(mDir, TOWN_C));
    add(mus.group);
    // the forecourt disc stands 0.45 proud of the lawn: you walk on its paving
    addFloor(mus.group, (x, z) => Math.hypot(x, z + 0.3) < 3.38 ? 0.45 : null);
    out.museum = { ...mus, dir: mDir, frame: mF };
    for (let z = -3.4; z >= -11; z -= 2.2) for (let x = -5.6; x <= 5.6; x += 2.8) solid(mF(x, z), 1.55);
  }
  // downtown blocks: one building per block, sized to the block, towers in the middle
  // two blocks the story needs: the café (open tables) and Frame & Co. (a shop)
  const CAFE = [-1, 0], FRAMECO = [1, -1];
  out.cafeSpot = [(CAFE[0] + 0.5) * P, (CAFE[1] + 0.5) * P];
  out.vanSpot = [2 * P - 0.55, (FRAMECO[1] + 0.5) * P];
  out.vanYaw = yawToFace(fC(...out.vanSpot), fC(out.vanSpot[0], out.vanSpot[1] + 5));
  for (let i = -K; i < K; i++) for (let j = -K; j < K; j++) {
    const x = (i + 0.5) * P, y = (j + 0.5) * P;
    if (!inTown(x, y)) continue;
    if (i === CAFE[0] && j === CAFE[1]) continue;           // the café's tables go here
    const d = fC(x, y);
    const room = P - 2 * ROAD_MAJOR - 0.5;                  // a block's buildable width
    if (zoneHit(d, room * 0.75) || onRoad(d, room * 0.45)) continue;
    const rr = Math.hypot(x, y) / CAP;
    const r = rnd();
    let b;
    if (i === FRAMECO[0] && j === FRAMECO[1]) b = shopSign(block({ w: room * 0.9, d: room * 0.9, h: 3.4, color: PAL.cream }), 'FRAME & CO.', room);
    else if (r < 0.12) { b = park(); }
    else if (rr < 0.45) b = block({ w: room * 0.9, d: room * 0.9, h: 6 + rnd() * 4 });
    else if (rr < 0.8) b = block({ w: room * 0.9, d: room * 0.85, h: 3 + rnd() * 1.8 });
    else b = house({ w: room * 0.75, d: room * 0.6, h: 1.7 });
    settle(b, d, room * 0.45, 0.05, yawToFace(d, fC(x, y + 5)) + (rnd() > 0.5 ? Math.PI : 0));
    add(b);
    if (r >= 0.12) solid(d, room * 0.5);
  }
  // street lamps at junctions, trees along the boulevard verge
  for (let i = -K; i <= K; i++) for (let j = -K; j <= K; j++) {
    if ((i + j) % 2) continue;
    const x = i * P + 1.6, y = j * P + 1.6;
    if (!inTown(x, y)) continue;
    const d = fC(x, y);
    if (zoneHit(d, 0.4) || onRoad(d, 0.35)) continue;
    add(settle(lamp(), d, 0.2, 0.02));
  }
  for (let k = 0; k < out.boulevard.length; k += 7) {
    const p = out.boulevard[k], q = out.boulevard[(k + 1) % out.boulevard.length];
    const side = new THREE.Vector3().crossVectors(p, q.clone().sub(p)).normalize();
    for (const s of [-1, 1]) {
      const d = p.clone().multiplyScalar(R).addScaledVector(side, s * 2.3).normalize();
      if (zoneHit(d, 0.8) || onRoad(d, 0.7) || isWater(d)) continue;
      add(settle(rnd() > 0.35 ? tree() : bush(0.55), d, 0.5, 0.05, rnd() * 6));
      solid(d, 0.35);
    }
  }
  // project buildings, each on its own plaza, each with a spur road
  for (const p of PLAN.projects) {
    const d = llv(p.at);
    const g = landmark(p);
    settle(g, d, 3.5, 0.08, yawToFace(d, TOWN_C));
    add(g);
    solid(d, 2.1);
    out.landmarks.push({ ...p, dir: d, root: g });
    spur(d, 4.6, 'lm:' + p.key);
  }
  for (const [k, s] of Object.entries(PLAN.sites)) {
    const d = llv(s.at);
    out.sites[k] = { ...s, dir: d, frame: frame(d, TOWN_C) };
    if (k !== 'airport' && k !== 'launchpad') spur(d, s.r + 0.6, 'site:' + k);
    const g = site(k, out.sites[k].frame);
    if (g) { settle(g, d, s.r * 0.8, 0.06, yawToFace(d, TOWN_C)); add(g);
      if (g.userData.floor) addFloor(g, g.userData.floor); for (const c of g.userData.solids || []) solid(out.sites[k].frame(...c[0]), c[1]); }
  }
  // helpers the story uses to place things
  out.townAt = ([x, y]) => fC(x, y);
  out.siteAt = (k, [x, y]) => out.sites[k].frame(x, y);
  out.solid = solid;
  out.museumFrame = mF;
  // countryside: scattered clumps of trees, never on roads, water or reserved ground
  for (let c = 0; c < 26; c++) {
    const center = llv([(rnd() - 0.5) * 140, (rnd() - 0.5) * 360]);
    if (arc(center, TOWN_C) < PLAN.town.boulevard + 4) continue;
    const f = frame(center);
    const n = 3 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      const d = f((rnd() - 0.5) * 7, (rnd() - 0.5) * 7);
      if (isWater(d, -0.2) || zoneHit(d, 1) || onRoad(d, 1.2)) continue;
      add(settle(rnd() > 0.5 ? pine() : tree(), d, 0.5, 0.05, rnd() * 6));
      solid(d, 0.35);
    }
  }
  return out;
}

// a hand-lettered sign over a shop's awning
function shopSign(g, text, room) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#2a2230'; c.fillRect(0, 0, 512, 128);
  c.fillStyle = '#f6eedb'; c.font = '700 64px "Patrick Hand", "Comic Sans MS", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(room * 0.8, room * 0.2), paint(0xffffff, { map: t, hatch: 0 }));
  sign.position.set(0, 1.62, room * 0.45 + 0.08); sign.userData.noInk = true;
  g.add(sign);
  return g;
}

// ── the story's sites: a station and a harbour you can actually stand in ──
function site(kind, F) {
  const g = new THREE.Group();
  const m = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  if (kind === 'station') {
    m(rbox(9, 0.5, 3.2, 0.12), paint(PAL.kerb), 0, 0.25, -1.2);                        // platform
    for (let x = -3.6; x <= 3.6; x += 2.4) m(rbox(0.16, 2.4, 0.16, 0.05), paint(PAL.ink, { hatch: 0 }), x, 1.7, -0.2);
    const roof = m(rbox(9.4, 0.16, 2.6, 0.06), paint(PAL.roofGreen), 0, 2.95, -0.9); roof.rotation.x = 0.08;
    m(rbox(3.4, 2.6, 2.4, 0.15), paint(PAL.terracotta), 0, 1.55, -3.6);                // the hall
    m(rbox(1.0, 1.5, 0.12, 0.05), paint(PAL.bark), 0, 1.0, -2.37);
    const clock = m(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 24).rotateX(Math.PI / 2), paint(0xfffaf0), 0, 2.4, -2.36);
    g.add(new THREE.Mesh(rbox(0.04, 0.3, 0.02, 0.01), paint(PAL.ink, { hatch: 0 })).translateY(2.47).translateZ(-2.3));
    g.userData.solids = [[[0, -3.6], 2.0]];
    g.userData.floor = (x, z) => Math.abs(x) < 4.5 && Math.abs(z + 1.2) < 1.6 ? 0.5 : null;
    void clock;
  } else if (kind === 'harbour') {
    const wood = paint(PAL.bark), deck = paint(0xc8a47c);
    m(rbox(2.2, 0.16, 7.5, 0.05), deck, 0, 0.45, -3.2);                                  // the pier, out over the bay
    for (let z = 0; z >= -6.8; z -= 1.7) for (const x of [-0.95, 0.95]) m(lathe([[0.001, -1.5], [0.12, -1.5], [0.12, 0.5], [0.001, 0.55]], 10), wood, x, 0.3, z);
    m(rbox(3.0, 2.0, 2.4, 0.15), paint(PAL.dusty), -3.4, 1.0, 0.8);                      // the boathouse
    const r2 = new THREE.Mesh(lathe([[0.001, 0], [2.2, 0], [0.001, 1.0]], 4), paint(PAL.roofRed));
    r2.position.set(-3.4, 2.0, 0.8); r2.rotation.y = Math.PI / 4; r2.scale.set(1, 1, 0.8); g.add(r2);
    for (const z of [-2, -5]) m(lathe([[0.001, 0], [0.16, 0], [0.12, 0.3], [0.18, 0.36], [0.001, 0.4]], 12), paint(PAL.ink, { hatch: 0 }), 0.85, 0.53, z);
    g.userData.solids = [[[-3.4, 0.8], 1.7]];
  } else return null;
  return ink(g, 'mid');
}

// a small park: lawn, a tree, a bench
function park() {
  const g = new THREE.Group();
  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.55, 0.12, 24), paint(PAL.grass));
  lawn.position.y = 0.06; g.add(lawn);
  const t = tree({ s: 1.0 }); t.position.set(-0.4, 0.1, 0.2); g.add(t);
  const b = bench(); b.position.set(0.5, 0.1, -0.5); b.rotation.y = 0.6; g.add(b);
  return ink(g, 'fine');
}

// ── project landmarks: soft, characterful buildings on a round plaza ──
function landmark(p) {
  const g = new THREE.Group();
  const col = { library: PAL.terracotta, dome: PAL.lilac, tower: PAL.dusty, lighthouse: PAL.cream, arch: PAL.teal }[p.style] ?? PAL.cream;
  // plaza
  const plaza = new THREE.Mesh(lathe([[0.001, 0], [3.0, 0], [3.05, 0.08], [3.0, 0.16], [0.001, 0.16]], 40), paint(PAL.kerb));
  g.add(plaza);
  const body = paint(col), trim = paint(PAL.cream), dark = paint(PAL.ink, { hatch: 0 });
  const m = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  if (p.style === 'library') {
    m(rbox(3.4, 2.2, 2.4, 0.15), body, 0, 1.25, 0);
    const roof = new THREE.Mesh(lathe([[0.001, 0], [2.3, 0], [2.0, 0.3], [0.001, 1.2]], 4), paint(PAL.roofRed));
    roof.position.y = 2.35; roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.75); g.add(roof);
    for (let i = 0; i < 3; i++) for (let b = 0; b < 6; b++)
      m(rbox(0.22, 0.42, 0.1, 0.03), paint([PAL.accent, PAL.dusty, PAL.mustard, PAL.teal, PAL.rose][(i + b) % 5]), -0.8 + b * 0.32, 0.95 + i * 0.6, 1.22);
  } else if (p.style === 'dome') {
    m(lathe([[0.001, 0], [1.9, 0], [1.9, 1.0], [2.0, 1.1], [1.75, 1.2], [0.001, 1.2]], 32), trim, 0, 0.16, 0);
    m(new THREE.SphereGeometry(1.75, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, 1.35, 0);
    m(lathe([[0.001, 0], [0.28, 0], [0.22, 0.4], [0.001, 0.7]], 16), paint(PAL.gold), 0, 3.05, 0);
  } else if (p.style === 'tower') {
    m(lathe([[0.001, 0], [1.2, 0], [1.1, 0.4], [0.95, 3.6], [1.05, 3.75], [0.001, 3.75]], 28), body, 0, 0.16, 0);
    m(lathe([[0.001, 0], [1.15, 0], [0.6, 0.9], [0.001, 1.2]], 28), paint(PAL.roofSlate), 0, 3.9, 0);
  } else if (p.style === 'lighthouse') {
    m(lathe([[0.001, 0], [1.1, 0], [0.75, 4.2], [0.85, 4.3], [0.001, 4.3]], 28), body, 0, 0.16, 0);
    for (let i = 0; i < 2; i++) m(lathe([[1.06 - i * 0.16, 0], [0.98 - i * 0.16, 0.5]], 28), paint(PAL.accent), 0, 1.1 + i * 1.5, 0);
    m(new THREE.CylinderGeometry(0.55, 0.55, 0.6, 20), paint(0xfff1c8, { emissive: 0xffd98a, hatch: 0 }), 0, 4.75, 0);
    m(lathe([[0.001, 0], [0.75, 0], [0.001, 0.7]], 20), dark, 0, 5.05, 0);
  } else {   // arch
    for (const s of [-1, 1]) m(rbox(0.8, 3.2, 1.0, 0.18), body, s * 1.1, 1.75, 0);
    const a = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.42, 14, 28, Math.PI), body);
    a.position.y = 3.3; g.add(a);
  }
  m(rbox(0.7, 1.1, 0.12, 0.05), paint(PAL.bark), 0, 0.7, p.style === 'arch' ? -0.6 : (p.style === 'library' ? 1.22 : 1.75));
  g.add(blobShadow(3.2));
  return ink(g, 'heavy');
}
