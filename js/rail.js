// ─── THE RAILWAY: one closed loop out of Central Station and back ───────────
// The station's own straight (buildings.js `station`, under the platform) is the
// loop's straight; from each end of it the line swings out into the countryside on
// a wide round loop away from town and comes back in at the other end — no dead end.
// The loop is laid like the roads: bent round every reserved zone (deflect), draped
// on the terrain, kept out of the water, and where it meets a road it crosses on a
// timber level crossing with a crossbuck either side.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, arc, radiusAt, surfH, deflect, isWater, onRoad, resample } from './world.js';
import { PAL, paint, ink } from './style.js';

export const RAIL = { pts: [], stationIdx: new Set() };
export function onRail(d, pad = 0) {
  for (const p of RAIL.pts) if (arc(d, p) < 0.8 + pad) return true;
  return false;
}

// a point `r` along the surface from `o`, heading along the unit tangent `t`
const expMap = (o, t, r) => o.clone().multiplyScalar(Math.cos(r / R)).addScaledVector(t, Math.sin(r / R)).normalize();

// the loop's centre line (unit dirs, ~0.5 apart, closed). `g` is the placed station;
// its track runs along local x at local z = `tz`, from x = -half to +half.
// The sea comes right up past the platform's +x end and the town side is all roads (the
// station's own road, the strip mall, the boulevard), so the loop runs out the back,
// through the fields: off the +x end it swings round tight (the shore is close) and
// heads out along the coast, crosses over the top, comes down the west side and back in
// along the straight from the −x end — crossing the landmark's spur road and the
// diagonal country road on the way. ROUTE is that path in surface coords round the
// track's middle: x along the track, z out from the station (negative = the town side).
// (the swing off the +x end runs out over the shallows on a timber trestle: see buildRailway)
const ROUTE = [[11.2, 1.3], [12.6, 4.4], [11.3, 8.1], [7.6, 10.4], [4.3, 12], [2.9, 15], [2.6, 20], [1, 25.5], [-4, 28.4],
  [-12, 29.2], [-22, 28.6], [-30, 27], [-34.5, 22], [-35, 14], [-33.5, 9], [-29.5, 6.8], [-22, 5.8], [-16, 4.3], [-11.5, 1.6]];
export function railLoop(g, { tz, half }) {
  g.updateMatrixWorld(true);
  const L = (x, z) => g.localToWorld(new THREE.Vector3(x, 0, z)).normalize();
  const mid = L(0, tz);
  // tangent axes at the track's middle: ex along the track, ez away from the station (−z local)
  const ex = L(1, tz).sub(mid).projectOnPlane(mid).normalize();
  const ez = L(0, tz - 1).sub(mid).projectOnPlane(mid).normalize();
  const at = (x, z) => {                     // surface coords (x along, z out) → direction
    const r = Math.hypot(x, z); if (r < 1e-6) return mid.clone();
    return expMap(mid, ex.clone().multiplyScalar(x / r).addScaledVector(ez, z / r).normalize(), r);
  };
  // the straight (kept as is) …
  const pts = [], keep = new Set();
  for (let x = -half; x <= half + 1e-6; x += 0.5) { keep.add(pts.length); pts.push(L(x, tz)); }
  // … then the loop: a smooth curve leaving the +x end along the track, round ROUTE, and
  // arriving back at the −x end along it (points on the straight steer both ends)
  const ctl = [[half - 3, 0], [half, 0], [half + 1.5, 0], ...ROUTE, [-half - 1.5, 0], [-half, 0], [-half + 3, 0]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(ctl, false, 'centripetal');
  const all = curve.getSpacedPoints(Math.round(curve.getLength() / 0.5));
  // only the part from the +x end round to the −x end
  let i0 = 0, i1 = all.length - 1;
  while (i0 < all.length && !(all[i0].x >= half + 0.35)) i0++;
  while (i1 > 0 && !(all[i1].x <= -half - 0.35 && Math.abs(all[i1].z) < 0.3)) i1--;
  for (let k = i0 + 1; k < i1; k++) pts.push(at(all[k].x, all[k].z));
  // in order: the straight −x → +x, then the loop from the +x end round to −x
  const straight = pts.slice(0, keep.size), loop = pts;
  const keepIdx = (i) => i < straight.length;
  // out of every reserved zone (the station's own reservation excepted), then relax the
  // corners where the ring meets the straight, keeping the straight exactly where it is
  for (let pass = 0; pass < 4; pass++) {
    deflect(loop, { closed: true, clear: 2.2, keep: keepIdx, except: z => z.key === 'site:station' });
    for (let s = 0; s < 2; s++) {
      const out = loop.map(p => p.clone());
      for (let i = 0; i < loop.length; i++) {
        if (keepIdx(i)) continue;
        const n = loop.length;
        out[i] = loop[i].clone().multiplyScalar(2).add(loop[(i - 1 + n) % n]).add(loop[(i + 1) % n]).normalize();
      }
      for (let i = 0; i < loop.length; i++) loop[i] = out[i];
    }
  }
  deflect(loop, { closed: true, clear: 2.2, keep: keepIdx, except: z => z.key === 'site:station' });
  const fin = resample(loop, 0.5, true);
  // which samples are the station's own straight (drawn by the station model)
  const sIdx = new Set();
  const a = L(-half + 0.05, tz), b = L(half - 0.05, tz), span = arc(a, b);
  fin.forEach((p, i) => { if (Math.abs(arc(p, a) + arc(p, b) - span) < 0.05) sIdx.add(i); });
  RAIL.pts = fin; RAIL.stationIdx = sIdx;
  return { pts: fin, wet: fin.filter(p => isWater(p, -0.05)).length, station: sIdx };
}

// ── the track itself, draped on the ground ──
const BALLAST = 0xb8ab98, RAILC = 0x8d8996, SINK = 0.04;
const _up = new THREE.Vector3(), _q = new THREE.Vector3();
// ground height across the line: the highest of a few samples (like the road ribbons)
function groundR(d) {
  let r = radiusAt(d);
  for (const [u, v] of [[0.35, 0], [-0.35, 0]]) {
    _q.copy(d).multiplyScalar(R);
    const t = new THREE.Vector3(1, 0, 0).projectOnPlane(d).normalize(), s = new THREE.Vector3().crossVectors(d, t);
    r = Math.max(r, radiusAt(_q.addScaledVector(t, u).addScaledVector(s, v).normalize()));
  }
  return r;
}
export function buildRailway(scene) {
  const P = RAIL.pts, n = P.length, skip = RAIL.stationIdx;
  const frames = P.map((d, i) => {
    const t = P[(i + 1) % n].clone().sub(P[(i - 1 + n) % n]).projectOnPlane(d).normalize();
    const s = new THREE.Vector3().crossVectors(t, d).normalize();      // lateral (right of travel)
    return { d, t, s };
  });
  // the trestle: wherever the line (or its bank) would be in the water, and a couple of
  // samples either side, it rides a timber deck held level with the shore
  const wetI = P.map((d, i) => [0, 0.9, -0.9].some(u => isWater(d.clone().multiplyScalar(R).addScaledVector(frames[i].s, u).normalize(), -0.12)));
  const bridge = P.map((_, i) => [-2, -1, 0, 1, 2].some(k => wetI[(i + k + n) % n]));
  const DECK = R + 0.45;
  // a point: lateral offset u, height y above the ground under it (or above the deck)
  const pt = (i, u, y) => {
    const { d, s } = frames[i];
    const dir = d.clone().multiplyScalar(R).addScaledVector(s, u).normalize();
    const base = bridge[i] ? Math.max(groundR(dir), DECK) : groundR(dir);
    return dir.multiplyScalar(base - SINK + y);
  };
  const live = (i) => !skip.has(i) || !skip.has((i + 1) % n);           // segment i→i+1 drawn here
  const onDeck = (i) => bridge[i] && bridge[(i + 1) % n];
  const crossing = P.map(d => onRoad(d, 0.35));
  // ballast: a low trapezoid bank
  const prof = [[-0.8, -0.02], [-0.62, 0.12], [0.62, 0.12], [0.8, -0.02]];
  const strip = (profile, keep = () => true) => {
    const pos = [], idx = [], m = profile.length;
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (!live(i) || !keep(i)) continue;
      const j = (i + 1) % n, base = v;
      for (const k of [i, j]) for (const [u, y] of profile) { pos.push(...pt(k, u, y).toArray()); v++; }
      for (let q = 0; q < m - 1; q++) { const a0 = base + q, b0 = base + m + q; idx.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); }   // facing up / out
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return mergeNormals(g);
  };
  const group = new THREE.Group(); group.name = 'railway';
  const ballast = new THREE.Mesh(strip(prof, i => !onDeck(i)), paint(BALLAST));
  ballast.userData.noInk = true; group.add(ballast);
  // the trestle: a plank deck, and bents of two posts down to the sea bed, braced, every ~1.4
  const wood = paint(0x9a744e);
  if (bridge.some(Boolean)) {
    const deck = new THREE.Mesh(strip([[-0.78, 0.12], [0.78, 0.12]], onDeck), wood);
    deck.userData.noInk = true; group.add(deck);                          // the boards (an inked hull would swallow a flat deck)
    for (const u of [-0.78, 0.78]) group.add(new THREE.Mesh(strip([[u, 0.0], [u, 0.13]], onDeck), wood));   // its edge beams
    const bents = [], m5 = new THREE.Matrix4();
    let gone = 0;
    for (let i = 0; i < n; i++) {
      if (!onDeck(i)) continue;
      gone += arc(P[i], P[(i + 1) % n]); if (gone < 1.4) continue; gone = 0;
      const { d, t, s } = frames[i], top = pt(i, 0, 0.02).length();
      for (const u of [-0.58, 0.58]) {
        const dir = d.clone().multiplyScalar(R).addScaledVector(s, u).normalize(), bed = R + Math.min(surfH(dir), 0) - 0.3;
        const len = top - bed;
        const post = new THREE.CylinderGeometry(0.07, 0.08, len, 8).translate(0, -len / 2, 0);
        bents.push(post.applyMatrix4(m5.makeBasis(t, dir, s).setPosition(dir.clone().multiplyScalar(top))));
      }
      const c = pt(i, 0, -0.04), up = c.clone().normalize();
      bents.push(new THREE.BoxGeometry(0.14, 0.1, 1.5).applyMatrix4(m5.makeBasis(t, up, s).setPosition(c)));
      const bc = c.clone().addScaledVector(up, -0.42);
      bents.push(new THREE.BoxGeometry(0.06, 0.06, 1.25).rotateX(0.55).applyMatrix4(m5.makeBasis(t, up, s).setPosition(bc)));
    }
    if (bents.length) group.add(new THREE.Mesh(mergeGeometries(bents), wood));
  }
  // the rails: a slim box section each side
  for (const s of [-1, 1]) {
    const u = s * 0.4, w = 0.035;
    group.add(new THREE.Mesh(strip([[u - w, 0.17], [u - w, 0.25], [u + w, 0.25], [u + w, 0.17]]), paint(RAILC)));
  }
  // sleepers, every 0.42
  const sl = [], box = new THREE.BoxGeometry(0.16, 0.06, 1.2), m4 = new THREE.Matrix4();
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (!live(i)) continue;
    acc += arc(P[i], P[(i + 1) % n]);
    if (acc < 0.42) continue;
    acc = 0;
    const { t, s } = frames[i];
    const c = pt(i, 0, 0.14), up = c.clone().normalize();
    m4.makeBasis(t, up, s).setPosition(c);
    sl.push(box.clone().applyMatrix4(m4));
  }
  group.add(new THREE.Mesh(mergeGeometries(sl), paint(PAL.bark)));
  // level crossings: timber boards over the track where a road crosses, a crossbuck each side
  const boards = [], posts = [], xs = [];
  let run = null;
  for (let i = 0; i < n; i++) {
    if (crossing[i] && live(i)) { if (!run) run = [i]; else run.push(i); }
    else if (run) { xs.push(run); run = null; }
  }
  if (run) xs.push(run);
  const plank = new THREE.BoxGeometry(0.5, 0.05, 1.6);
  for (const r of xs) {
    for (let k = r[0] - 1; k <= r[r.length - 1] + 1; k++) {
      const i = (k + n) % n, { t, s } = frames[i];
      const c = pt(i, 0, 0.22), up = c.clone().normalize();
      boards.push(plank.clone().applyMatrix4(m4.makeBasis(t, up, s).setPosition(c)));
    }
    // crossbucks: on the road's verge, diagonally opposite, facing the traffic
    for (const [end, side] of [[r[0] - 3, 1], [r[r.length - 1] + 3, -1]]) {
      const i = (end + n) % n, { t, s } = frames[i];
      const base = pt(i, side * 1.25, 0), up = base.clone().normalize();
      const M = new THREE.Matrix4().makeBasis(s, up, t.clone().negate()).setPosition(base);
      const post = new THREE.CylinderGeometry(0.04, 0.05, 1.5, 8).translate(0, 0.75, 0);
      posts.push({ geo: post.applyMatrix4(M), mat: 'post' });
      for (const a of [0.7, -0.7]) {
        const arm = new THREE.BoxGeometry(0.75, 0.12, 0.03).rotateZ(a).translate(0, 1.32, 0.05);
        posts.push({ geo: arm.applyMatrix4(M), mat: 'arm' });
      }
    }
  }
  if (boards.length) group.add(new THREE.Mesh(mergeGeometries(boards), paint(0x9a744e)));
  const byMat = { post: [], arm: [] };
  for (const p of posts) byMat[p.mat].push(p.geo);
  if (byMat.post.length) group.add(new THREE.Mesh(mergeGeometries(byMat.post), paint(PAL.ink, { hatch: 0 })));
  if (byMat.arm.length) group.add(new THREE.Mesh(mergeGeometries(byMat.arm), paint(0xf6eedb)));
  for (const m of group.children) m.geometry.computeBoundingSphere();
  ink(group, 'fine');
  scene.add(group);
  return { group, crossings: xs.length };
}
// smooth normals across shared positions (each segment repeats its end ring)
function mergeNormals(g) {
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal, key = (i) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  const acc = new Map();
  for (let i = 0; i < pos.count; i++) { const k = key(i); const a = acc.get(k) || [0, 0, 0]; a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); acc.set(k, a); }
  for (let i = 0; i < pos.count; i++) { const a = acc.get(key(i)), l = Math.hypot(...a) || 1; nor.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
  return g;
}
