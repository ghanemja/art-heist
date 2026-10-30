// ─── TOWN: reservations first, then roads, then buildings ───────────────────
// Order matters and is the whole point: every structure reserves its ground,
// THEN roads are laid around the reservations, THEN buildings fill the blocks
// the roads leave. Nothing can be built on anything.
import * as THREE from 'three';
import PLAN from './manifest.js';
import { R, llv, arc, frame, slerpDir, reserve, zoneHit, deflect, smooth, buildRoad, ROADS, onRoad,
  settle, yawToFace, radiusAt, flatten, addFloor, isWater, alignToSurface, posOn, nearestRoad } from './world.js';
import { PAL, paint, ink, blobShadow } from './style.js';
import { house, tree, pine, bush, lamp, bench, rnd, pick, rbox, lathe } from './props.js';
import { buildMuseum } from '../museum.js?v=10';
import { planHarbour, buildHarbour } from './harbour.js';
import { MAIN_STREET, buildShop, stripMall, mallDrive, station, townBlock, capeFarSide, placeOnPlanet, batchPlaced, bookLibrary, projectShop, isProjectShop } from './buildings.js';

export const TOWN_C = llv(PLAN.town.center);
const ROAD_MAJOR = 1.05, ROAD_MINOR = 0.62;
// Main Street runs along the town frame's y = 0 line, museum end → east. Its
// two rows of shops front onto it at |y| = SHOP_Y; the minor streets that
// would cut the terraces are left out, so the frontages run unbroken.
const SHOP_Y = 2.75, SHOP_D = 2.7;
const P0 = PLAN.town.pitch;
const minorCut = (axis, i, x, y) => i % 2 !== 0 && (axis === 0 || Math.abs(y) < 2 * P0 - ROAD_MAJOR);
const inShops = (x, y, pad = 0) => Math.abs(y) > SHOP_Y - 1.5 - pad && Math.abs(y) < SHOP_Y + SHOP_D + pad &&
  [...MAIN_STREET.north, ...MAIN_STREET.south].some(t => x > t.x[0] - pad && x < t.x[1] + pad);
const MALL = PLAN.town.mall;
// a direction → town-frame [x, y] (the inverse of frame(TOWN_C))
const _fwdT = new THREE.Vector3(0, 1, 0).sub(TOWN_C.clone().multiplyScalar(TOWN_C.y)).normalize();
const _sideT = new THREE.Vector3().crossVectors(_fwdT, TOWN_C).normalize();
const toTown = (d) => { const t = d.clone().divideScalar(d.dot(TOWN_C)).multiplyScalar(R); return [t.dot(_sideT), t.dot(_fwdT)]; };

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
  for (const [k, s] of Object.entries(PLAN.sites)) {
    const c = s.shift ? frame(llv(s.at), TOWN_C)(0, s.shift) : llv(s.at);
    reserve(c, s.r, 'site:' + k); flatten(c, s.r + 1);
    if (k === 'harbour') planHarbour(c, TOWN_C);          // the quay's land: a true plane, its ground kept clear
  }
  const fT = frame(TOWN_C);
  reserve(fT(MALL.zone[0], MALL.zone[1]), MALL.r, 'mall'); flatten(fT(MALL.zone[0], MALL.zone[1]), MALL.r + 2);
  // each project shop gets a wide level yard that eases out gently (its spur road arrives on the flat)
  for (const p of PLAN.projects) { reserve(llv(p.at), 4.2, 'lm:' + p.key); flatten(llv(p.at), 6.5, undefined, { blend: 7 }); }
}

export function buildTown(scene) {
  const out = { landmarks: [], sites: {}, museum: null, statics: [], colliders: [] };
  const solid = (d, r) => out.colliders.push({ dir: d.clone(), r });
  // street furniture baked into a placed building (benches, lamp posts, planters,
  // post boxes…) left [x, z, r] footprints in its userData.foots (buildings.js `foot`)
  const feet = (g) => { g.updateWorldMatrix(true, false); for (const [x, z, r] of g.userData.foots || []) solid(g.localToWorld(new THREE.Vector3(x, 0, z)).normalize(), r); };
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
  // streets keep 0.6 clear of reserved ground — except the museum plaza, the paved
  // forecourt Main Street is meant to arrive at (0.6 there cuts its last junction)
  const free = (x, y, half) => !zoneHit(fC(x, y), half + 0.6, z => z.key === 'museum-plaza') && !zoneHit(fC(x, y), half + 0.3);
  const lines = [];                                          // each grid line as runs of free samples
  for (let axis = 0; axis < 2; axis++) {
    for (let i = -K; i <= K; i++) {
      const major = i % 2 === 0, half = major ? ROAD_MAJOR : ROAD_MINOR;
      let run = [];
      for (let j = -K * 4; j <= K * 4; j++) {
        const t = j * P / 4;
        const x = axis ? i * P : t, y = axis ? t : i * P;
        if (inTown(x, y) && free(x, y, half) && !minorCut(axis, i, x, y)) run.push(fC(x, y));
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
  // every spur is laid NOW, with the rest of the roads, so the onRoad() checks of
  // everything built after (blocks, lamps, the verge trees and bushes) see them —
  // laid later, a spur ran straight over the verge planting it crossed
  for (const p of PLAN.projects) spur(llv(p.at), p.style === 'library' ? 4.6 : 3.7, 'lm:' + p.key);   // shops: up to the stoop
  for (const [k, s] of Object.entries(PLAN.sites))
    if (k !== 'airport') spur(llv(s.at), s.stop ?? s.r + 0.6, 'site:' + k);   // Cape Far Side: the long road round the planet

  // ── 3. BUILD ───────────────────────────────────────────────────────────────
  // the museum: the scene of the crime, restyled into the drawn world
  {
    const mus = buildMuseum({ lite: false, glowMats: [], artBase: './artworks/', openDoor: true });
    restyle(mus.group);
    ink(mus.group, 'mid');
    settle(mus.group, mDir, 6, 0.1, yawToFace(mDir, TOWN_C));
    add(mus.group);
    // the forecourt disc stands 0.45 proud of the lawn: you walk on its paving
    addFloor(mus.group, (x, z) => Math.hypot(x, z + 0.3) < 3.38 ? 0.45 : null);
    out.museum = { ...mus, dir: mDir, frame: mF };
    for (let z = -3.4; z >= -11; z -= 2.2) for (let x = -5.6; x <= 5.6; x += 2.8) solid(mF(x, z), 1.55);
  }
  // ── Main Street: two terraces of shops facing each other across y = 0 ──
  // Units are laid by true arc length along each frontage, so neighbours meet
  // wall to wall, and each is bent onto the planet where it stands.
  out.shops = [];
  const terrace = (t, side) => {                      // side +1: north row (faces −y); −1: south row
    const Y = side * SHOP_Y, N = 60, cum = [0];
    let prev = fC(t.x[0], Y);
    for (let k = 1; k <= N; k++) { const q = fC(t.x[0] + (t.x[1] - t.x[0]) * k / N, Y); cum.push(cum[k - 1] + arc(prev, q)); prev = q; }
    const sc = cum[N] / t.shops.reduce((a, sp) => a + sp.w, 0);
    let acc = 0;
    t.shops.forEach((spec, i) => {
      const w = spec.w * sc, mid = acc + w / 2; acc += w;
      let k = 1; while (k < N && cum[k] < mid) k++;
      const x = t.x[0] + (t.x[1] - t.x[0]) * (k - 1 + (mid - cum[k - 1]) / (cum[k] - cum[k - 1])) / N;
      // local +x runs with frame +x on the north side and against it on the south;
      // the end units carry the pavement round to the side-street kerb
      const lo = i === 0, hi = i === t.shops.length - 1;
      const pave = side > 0 ? [lo ? 0.26 : 0, hi ? 0.26 : 0] : [hi ? 0.26 : 0, lo ? 0.26 : 0];
      const d = fC(x, Y);
      const g = placeOnPlanet(buildShop({ ...spec, w, pave }), d, yawToFace(d, fC(x, 0)), { inked: false });
      out.shops.push({ ...spec, dir: d, root: g });
      feet(g);
      addFloor(g, (lx, lz) => lz > -0.05 && lz < 1.42 && lx > -w / 2 - pave[0] && lx < w / 2 + pave[1] ? 0.07 : null);
      const depth = spec.special === 'library' ? 3.0 : 2.4, n = Math.max(1, Math.round(w / 2));
      for (let c = 0; c < n; c++) solid(fC(x - w / 2 + (c + 0.5) * w / n, side * (SHOP_Y + depth / 2)), Math.min(1.2, Math.max(w / n, depth) / 2 + 0.05));
      if (spec.kind === 'cafe') out.cafeSpot = [x, side * (SHOP_Y - 0.72)];
    });
  };
  for (const t of MAIN_STREET.north) terrace(t, 1);
  for (const t of MAIN_STREET.south) terrace(t, -1);
  // Frame & Co.'s van, in the side street at the corner by the shop (0.35 further into the
  // street than it first was, so its flank clears the corner shop)
  out.vanSpot = [2 * P - 0.2, -(0.5) * P];
  out.vanYaw = yawToFace(fC(...out.vanSpot), fC(out.vanSpot[0], out.vanSpot[1] + 5));
  add(batchPlaced(out.shops.map(sp => sp.root)));      // the shops stay as frames for their floors
  // Main Street's lamps stand at the kerb; bunting is strung across the street
  for (const t of [...MAIN_STREET.north, ...MAIN_STREET.south]) {
    const n = Math.max(1, Math.round((t.x[1] - t.x[0]) / 2.8)), s = MAIN_STREET.north.includes(t) ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const x = t.x[0] + (t.x[1] - t.x[0]) * (k + 0.5) / n, y = s * (SHOP_Y - 1.2);
      if (out.cafeSpot && Math.abs(x - out.cafeSpot[0]) < 1.2 && Math.sign(out.cafeSpot[1]) === s) continue;
      add(settle(lamp(), fC(x, y), 0.2, 0.02));
      solid(fC(x, y), 0.15);
    }
  }
  for (const x of [-4.4, 4.4, -7.2, 7.2, 1.6, -1.6]) add(bunting(fC, x, SHOP_Y));
  // the story's shopfronts: the café (tables out front) and Frame & Co. (the van)
  // downtown behind Main Street: one building per block, towers in the middle
  for (let i = -K; i < K; i++) for (let j = -K; j < K; j++) {
    const x = (i + 0.5) * P, y = (j + 0.5) * P;
    if (!inTown(x, y) || j === 0 || j === -1) continue;   // Main Street's rows are the terraces
    const d = fC(x, y);
    const room = P - 2 * ROAD_MAJOR - 0.5;                  // a block's buildable width
    if (zoneHit(d, room * 0.75) || onRoad(d, room * 0.45) || inShops(x, y, room * 0.45)) continue;
    const rr = Math.hypot(x, y) / CAP;
    const r = rnd();
    let b;
    if (r < 0.12) { b = park(P / 2 - ROAD_MAJOR - 0.15); }   // clear of the road on every side
    else if (rr < 0.45) b = townBlock({ w: room * 0.9, d: room * 0.9, h: 6 + rnd() * 4 });
    else if (rr < 0.8) b = townBlock({ w: room * 0.9, d: room * 0.85, h: 3.1 + rnd() * 1.7 });
    else b = house({ w: room * 0.92, d: room * 0.76, h: 1.7 });
    // every block faces a street on purpose: the rows behind Main Street turn their backs to
    // the backs of its shops (fronts outward), the next row faces back across the street at
    // them, and so on — fronts face fronts across each street, backs face backs
    const n = j > 0 ? j : -1 - j, away = Math.sign(y) || 1;
    const faceY = n % 2 ? away : -away;
    const pb = add(placeOnPlanet(b, d, yawToFace(d, fC(x, y + 5 * faceY)), { weight: rr < 0.45 ? 'heavy' : 'mid' }));
    if (r >= 0.12) solid(d, room * 0.5);
    else feet(pb);                                            // a park: its tree and bench stop you
  }
  // street lamps at junctions, trees along the boulevard verge
  for (let i = -K; i <= K; i++) for (let j = -K; j <= K; j++) {
    if ((i + j) % 2) continue;
    const x = i * P + 1.6, y = j * P + 1.6;
    if (!inTown(x, y) || inShops(x, y, 0.5)) continue;
    const d = fC(x, y);
    if (zoneHit(d, 0.4) || onRoad(d, 0.35)) continue;
    add(settle(lamp(), d, 0.2, 0.02));
    solid(d, 0.15);
  }
  // Maple Plaza: the strip mall out past the boulevard, its lot opening onto it
  {
    const d = fC(...MALL.at), yaw = yawToFace(d, fC(MALL.at[0] - 10, MALL.at[1]));
    const g = add(placeOnPlanet(stripMall(), d, yaw));
    out.mall = { dir: d, root: g };
    // the drive, built to the boulevard's real carriageway edge: for each x across it, walk out
    // from the lot (in the mall's frame) to where the road's surface begins
    { g.updateWorldMatrix(true, false);
      const { lotEnd } = g.userData.mall, v = new THREE.Vector3();
      const past = (x, z) => { const nr = nearestRoad(g.localToWorld(v.set(x, 0, z)).normalize()); return nr && nr.dist <= nr.half; };
      const edgeZ = (x) => {
        let lo = lotEnd, hi = lotEnd + 6;
        if (!past(x, hi)) return lotEnd + 2.2;                    // no road found: a short apron
        for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (past(x, m)) hi = m; else lo = m; }
        return hi;
      };
      add(placeOnPlanet(mallDrive(edgeZ, lotEnd), d, yaw, { inked: false })); }
    addFloor(g, g.userData.floor); feet(g);
    for (let k = -2; k <= 2; k++) solid(fC(MALL.at[0] + 1.5, MALL.at[1] + k * 2.3), 1.3);
    for (const k of [-1, 1]) solid(fC(MALL.at[0] + 1.5, MALL.at[1] + k * 5.1), 0.8);
  }
  for (let k = 0; k < out.boulevard.length; k += 7) {
    const p = out.boulevard[k], q = out.boulevard[(k + 1) % out.boulevard.length];
    const side = new THREE.Vector3().crossVectors(p, q.clone().sub(p)).normalize();
    for (const s of [-1, 1]) {
      const d = p.clone().multiplyScalar(R).addScaledVector(side, s * 2.3).normalize();
      // a tree's crown reaches ~1.1 from its trunk: keep it from hanging over any carriageway
      const isTree = rnd() > 0.35;
      if (zoneHit(d, 0.8) || onRoad(d, isTree ? 1.15 : 0.7) || isWater(d) || inShops(...toTown(d), 0.6)) continue;
      add(settle(isTree ? tree() : bush(0.55), d, 0.5, 0.05, rnd() * 6));
      solid(d, 0.35);
    }
  }
  // project buildings, each on its own plaza, each with a spur road
  for (const p of PLAN.projects) {
    const d = llv(p.at);
    if (isProjectShop(p.style)) {
      // a walk-in shop: the base (floor, low walls, the inside, props) and the upper part (walls
      // above the waist, shopfront, sign, roof), placed at the same spot; the upper part hides
      // while you're inside (tickShops)
      const S = projectShop(p.style), yaw = yawToFace(d, TOWN_C);
      const base = add(placeOnPlanet(S.base, d, yaw, { weight: 'mid' })), upper = add(placeOnPlanet(S.upper, d, yaw, { weight: 'mid' }));
      addFloor(base, S.floor);
      for (const [x, z, r] of S.walls) solid(base.localToWorld(new THREE.Vector3(x, 0, z)).normalize(), r);
      out.landmarks.push({ ...p, dir: d, root: base, upper, inside: S.inside });
      continue;
    }
    const g = landmark(p);
    settle(g, d, 3.5, 0.08, yawToFace(d, TOWN_C));
    add(g);
    solid(d, 2.1);
    out.landmarks.push({ ...p, dir: d, root: g });
  }
  for (const [k, s] of Object.entries(PLAN.sites)) {
    const d = llv(s.at);
    out.sites[k] = { ...s, dir: d, frame: frame(d, TOWN_C) };
    if (k === 'launchpad') {
      const g = add(placeOnPlanet(capeFarSide(), d, yawToFace(d, TOWN_C), { weight: 'mid' }));
      addFloor(g, g.userData.floor); feet(g);
      for (const [[x, z], r] of g.userData.solids) solid(g.localToWorld(new THREE.Vector3(x, 0, z)).normalize(), r);
      // the story places its moving parts in the site's own frame
      out.cape = { dir: d, root: g, at: (x, z) => g.localToWorld(new THREE.Vector3(x, 0, z)).normalize() };
      continue;
    }
    if (k === 'station') {
      const g = add(placeOnPlanet(station(), d, yawToFace(d, TOWN_C)));
      addFloor(g, g.userData.floor); feet(g);
      // the station's footprint is in its own local frame (x is mirrored in the site frame)
      for (const [[x, z], r] of g.userData.solids) solid(out.sites[k].frame(-x, z), r);
      continue;
    }
    if (k === 'harbour') {
      out.harbour = buildHarbour(d, TOWN_C, add, solid);
      continue;
    }
    const g = site(k, out.sites[k].frame);
    if (g) { settle(g, d, s.r * 0.8, 0.06, yawToFace(d, TOWN_C)); add(g);
      if (g.userData.floor) addFloor(g, g.userData.floor); for (const c of g.userData.solids || []) solid(out.sites[k].frame(...c[0]), c[1]); }
  }
  // helpers the story uses to place things
  out.townAt = ([x, y]) => fC(x, y);
  out.toTown = toTown;
  out.dirC = TOWN_C;
  out.axes = { side: _sideT, fwd: _fwdT };
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
  // walk into a project shop and its upper walls and roof lift away, so you see in
  const _sp = new THREE.Vector3();
  out.tickShops = (dir) => {
    for (const lm of out.landmarks) {
      if (!lm.upper) continue;
      if (arc(dir, lm.dir) > 6) { lm.upper.visible = true; continue; }
      lm.root.worldToLocal(_sp.copy(dir).multiplyScalar(R));
      lm.upper.visible = !lm.inside(_sp.x, _sp.z);
    }
  };
  return out;
}

// ── the story's other sites: nothing modelled here any more (the harbour is harbour.js;
// Central Station and Cape Far Side are buildings.js) ──
function site() { return null; }

// bunting strung across Main Street from facade to facade, sagging in the middle
function bunting(fC, x, Y) {
  const g = new THREE.Group(), N = 24, line = [], flags = [[], [], [], []];
  const at = (t) => { const d = fC(x, Y - 2 * Y * t); return d.multiplyScalar(radiusAt(d) + 3.75 - 0.45 * Math.sin(Math.PI * t)); };
  for (let k = 0; k <= N; k++) line.push(at(k / N));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(line), 32, 0.012, 4), paint(PAL.ink, { hatch: 0 })));
  for (let k = 1; k < 14; k++) {
    const t = k / 14, p = at(t), tan = at(t + 0.01).sub(at(t - 0.01)).normalize(), up = p.clone().normalize();
    flags[k % 4].push(...p.clone().addScaledVector(tan, -0.09).toArray(), ...p.clone().addScaledVector(tan, 0.09).toArray(), ...p.clone().addScaledVector(up, -0.2).toArray());
  }
  flags.forEach((f, i) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(f, 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, paint([PAL.accent, PAL.gold, PAL.teal, 0xf6eedb][i], { side: THREE.DoubleSide }));
    m.userData.noInk = true; g.add(m);
  });
  return g;
}

// a small park: lawn, a tree, a bench, all of it inside r (the block's clear radius:
// a 1.55 lawn and a full-size tree spilled half a unit onto the streets round a 4.4 block)
function park(r = 1.1) {
  const g = new THREE.Group(), k = r / 1.1;
  const lawn = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.05, r, 0.12, 24), paint(PAL.grass));
  lawn.position.y = 0.06; g.add(lawn);
  // seen from the street (the park's front, +z): the tree on the left, the bench to its right,
  // facing the street
  const t = tree({ s: 0.85 * k }); t.position.set(-0.3 * k, 0.1, -0.15 * k); g.add(t);
  const b = bench(); b.position.set(0.35 * k, 0.1, 0.35 * k); b.rotation.y = 0; g.add(b);
  // footprints the walker can't pass (collected by bake into userData.foots)
  const foot = (x, z, r) => { const o = new THREE.Object3D(); o.position.set(x, 0, z); o.userData.foot = r; g.add(o); };
  foot(-0.3 * k, -0.15 * k, 0.2);
  for (const fx of [-0.4, 0, 0.4]) foot(0.35 * k + fx, 0.35 * k, 0.2);
  return ink(g, 'fine');
}

// ── the library: the bookcase building on a round plaza (the project shops are buildings.js projectShop) ──
function landmark(p) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(lathe([[0.001, 0], [3.0, 0], [3.05, 0.08], [3.0, 0.16], [0.001, 0.16]], 40), paint(PAL.kerb)));
  const lib = bookLibrary(); lib.position.y = 0.14; g.add(lib);
  g.add(blobShadow(3.2));
  return ink(g, 'heavy');
}
