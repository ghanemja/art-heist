// ─── THE PLANET: shaped terrain, painted ground, water, sky, light ──────────
// Plus the shared surface helpers and the RESERVATION MAP: every structure
// reserves its ground before any road is laid, roads bend around reserved
// ground, and nothing may be built on anything (see CLAUDE.md).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import PLAN, { R } from './manifest.js';
import { PAL, paint, ink } from './style.js';
export { R };

const UP = new THREE.Vector3(0, 1, 0);
export const ll = (lat, lon) => {
  const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
  return new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(a), Math.cos(a) * Math.sin(b)).normalize();
};
export const llv = (p) => ll(p[0], p[1]);
export const arc = (a, b) => a.angleTo(b) * R;                 // world-unit distance along the surface
const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ── terrain: features from the plan, gentle hills in between ──
const T = PLAN.terrain;
const F = {
  plateau: { d: llv(T.plateau.at), r: T.plateau.r },
  sea: { d: llv(T.sea.at), r: T.sea.r, depth: T.sea.depth },
  bay: { d: llv(T.bay.at), r: T.bay.r, depth: T.bay.depth },
  mtn: { d: llv(T.mountain.at), r: T.mountain.r, h: T.mountain.height },
};
export const SEA = 0.0;                                         // sea level above R
const LAND = 0.45;                                              // the plateau's level
const extraFlats = [];                                          // {d, r, h} — sites level their own ground
// plane: a tangent point (unit dir). Then the ground is levelled to a true flat PLANE
// touching the planet there, not a curved shell: on a radius-40 planet a 14-unit
// building's edges would otherwise sit ~0.6 above the ground (floating, looking slanted).
export function flatten(d, r, h = LAND, { plane = null } = {}) { extraFlats.push({ d: d.clone(), r, h, plane: plane?.clone() }); }

export function surfH(d) {
  // rolling hills: three soft, incommensurate waves
  let h = LAND + T.hills * (
    Math.sin(d.x * 2.1 + 0.7) * Math.sin(d.y * 1.7 + 2.2) * 0.9 +
    Math.sin(d.z * 3.3 + 1.1) * Math.sin(d.x * 2.9 + 0.4) * 0.6 +
    Math.sin(d.y * 4.6 + 0.9) * 0.35);
  // the mountain
  const dm = arc(d, F.mtn.d);
  if (dm < F.mtn.r) { const k = 1 - dm / F.mtn.r; h += F.mtn.h * k * k * (3 - 2 * k); }
  // level ground for town and every site that asked for it
  const dp = arc(d, F.plateau.d);
  h += (LAND - h) * (1 - ss(F.plateau.r, F.plateau.r + 7, dp));
  for (const f of extraFlats) {
    const df = arc(d, f.d);
    if (df < f.r + 6) {
      const target = f.plane ? (R + f.h) / Math.max(0.5, d.dot(f.plane)) - R : f.h;
      h += (target - h) * (1 - ss(f.r, f.r + 5, df));
    }
  }
  // water last: the sea and its bay carve below everything
  for (const w of [F.sea, F.bay]) {
    const dw = arc(d, w.d);
    if (dw < w.r) h += (-w.depth - h) * (1 - ss(w.r * 0.7, w.r, dw));
  }
  return h;
}
export const radiusAt = (d) => R + Math.max(surfH(d), SEA);
export const posOn = (d, lift = 0) => d.clone().multiplyScalar(radiusAt(d) + lift);
export const isWater = (d, m = 0.05) => surfH(d) < SEA - m;
export function alignToSurface(obj, d, yaw = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d);
  if (yaw) q.premultiply(new THREE.Quaternion().setFromAxisAngle(d, yaw));
  obj.quaternion.copy(q);
}
export function yawToFace(d, target) {
  const q0 = new THREE.Quaternion().setFromUnitVectors(UP, d);
  const v0 = new THREE.Vector3(0, 0, 1).applyQuaternion(q0);
  const f = target.clone().sub(d.clone().multiplyScalar(d.dot(target))).normalize();
  const c = new THREE.Vector3().crossVectors(v0, f);
  return Math.atan2(c.dot(d), v0.dot(f));
}
// a local frame at d: x east-ish, y = forward toward `toward` (or north)
export function frame(d, toward = null) {
  const fwd = (toward ? toward.clone() : UP.clone()).sub(d.clone().multiplyScalar(d.dot(toward || UP)));
  if (fwd.lengthSq() < 1e-8) fwd.set(1, 0, 0).sub(d.clone().multiplyScalar(d.x));
  fwd.normalize();
  const side = new THREE.Vector3().crossVectors(fwd, d).normalize();
  return (x, y) => d.clone().multiplyScalar(R).addScaledVector(side, x).addScaledVector(fwd, y).normalize();
}
export function slerpDir(a, b, t) {
  const th = a.angleTo(b); if (th < 1e-6) return a.clone();
  const s = Math.sin(th);
  return a.clone().multiplyScalar(Math.sin((1 - t) * th) / s).addScaledVector(b, Math.sin(t * th) / s).normalize();
}
// sit a thing on the LOWEST ground under its footprint, a touch sunk
// ── floors: raised things you can stand on (the museum forecourt, platforms) ──
// each is an object on the planet plus a test in its local frame → the floor's
// local height there, or null. groundAt() is the terrain or the highest floor.
export const FLOORS = [];
// a building laid onto the terrain (buildings.js `conform`) sets userData.conform
// to its sink: its floor heights are then read above the ground under the point
export function addFloor(obj, test) { obj.updateWorldMatrix(true, false); FLOORS.push({ obj, test, inv: obj.matrixWorld.clone().invert(), dir: obj.position.clone().normalize(), reach: 12, conform: obj.userData.conform }); }
const _fp = new THREE.Vector3();
export function groundAt(d) {
  let r = radiusAt(d);
  for (const f of FLOORS) {
    if (f.dir.dot(d) < 0.95) continue;
    _fp.copy(d).multiplyScalar(r).applyMatrix4(f.inv);
    const y = f.test(_fp.x, _fp.z);
    if (y != null) r = Math.max(r, f.conform != null ? radiusAt(d) + y - f.conform : f.obj.position.length() + y);
  }
  return r;
}

export function settle(obj, d, half = 1, sink = 0.05, yaw = 0) {
  let r = groundAt(d);
  const f = frame(d);
  for (const [x, y] of [[half, 0], [-half, 0], [0, half], [0, -half], [half * .7, half * .7], [-half * .7, -half * .7]])
    r = Math.min(r, groundAt(f(x, y)));
  obj.position.copy(d).multiplyScalar(r - sink);
  alignToSurface(obj, d, yaw);
  return obj;
}

// ── the reservation map ──
export const ZONES = [];
export function reserve(d, r, key) { ZONES.push({ dir: d.clone().normalize(), r, key }); }
export function zoneHit(d, pad = 0, except = null) {
  for (const z of ZONES) { if (except && except(z)) continue; if (arc(d, z.dir) < z.r + pad) return z; }
  return null;
}
// push polyline samples out of reserved ground, relax, and let the zones have the last word
export function deflect(pts, { closed = false, clear = 1.6, keep = () => false, except = null } = {}) {
  const n = pts.length;
  const push = () => {
    let moved = false;
    for (let i = 0; i < n; i++) {
      if (keep(i)) continue;
      for (const z of ZONES) {
        if (except && except(z)) continue;
        const a = pts[i].angleTo(z.dir), want = (z.r + clear) / R;
        if (a >= want) continue;
        const perp = pts[i].clone().sub(z.dir.clone().multiplyScalar(z.dir.dot(pts[i])));
        if (perp.lengthSq() < 1e-10) perp.set(1, 0, 0);
        perp.normalize();
        pts[i] = z.dir.clone().multiplyScalar(Math.cos(want)).addScaledVector(perp, Math.sin(want)).normalize();
        moved = true;
      }
    }
    return moved;
  };
  for (let pass = 0; pass < 10; pass++) {
    if (!push()) break;
    const out = pts.map(p => p.clone());
    for (let i = 0; i < n; i++) {
      if (keep(i) || (!closed && (i === 0 || i === n - 1))) continue;
      out[i] = pts[i].clone().multiplyScalar(2).add(pts[(i - 1 + n) % n]).add(pts[(i + 1) % n]).normalize();
    }
    for (let i = 0; i < n; i++) pts[i] = out[i];
  }
  push();
  return pts;
}
export function smooth(pts, passes = 3, closed = false) {
  for (let p = 0; p < passes; p++) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) { out.push(pts[i]); continue; }
      out.push(pts[i].clone().multiplyScalar(2).add(pts[(i - 1 + n) % n]).add(pts[(i + 1) % n]).normalize());
    }
    pts = out;
  }
  return pts;
}

// ── roads: every carriageway's centre-line samples, so nothing builds on one ──
export const ROADS = [];          // {pts, half}
// the painted road ribbons sit a hair above the ground: people stand ON them
const ROAD_TOP = 0.05, KERB_TOP = 0.035;
export function roadLift(d) {
  let lift = 0;
  for (const rd of ROADS) for (const p of rd.pts) {
    const a = arc(d, p);
    if (a < rd.half) return ROAD_TOP;
    if (a < rd.half + 0.28) lift = KERB_TOP;
  }
  return lift;
}
// …but the truth is what's DRAWN: forecourts, plazas, roads laid over slopes and
// bent buildings' floors can sit a few cm above the numbers above. Once the town is
// built, registerGround() indexes the static meshes; standAt then drops a short ray
// onto them and stands on the highest upward-facing surface just above the base ground.
const _ground = { meshes: [], spheres: [] };
const _rc = new THREE.Raycaster(), _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
export function registerGround(roots) {
  _ground.meshes.length = 0; _ground.spheres.length = 0; _standCache.clear();
  const walk = (o) => {                                   // skip whole subtrees that move (people, cars)
    if (o.userData.noGround) return;
    visit(o); for (const c of o.children) walk(c);
  };
  const visit = (o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.isInk || o.userData.noGround) return;
    if (o.name === 'planet' || o.name === 'sea' || !o.geometry?.attributes?.position) return;
    if (o.material?.transparent || o.material?.blending === THREE.AdditiveBlending) return;
    o.updateWorldMatrix(true, false);
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const sph = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
    if (sph.radius > 60) return;
    _ground.meshes.push(o); _ground.spheres.push(sph);
  };
  for (const root of roots) walk(root);
}
const STEP_UP = 0.45;                                   // how far above the base ground a walkable surface may be
// the ground never moves, so each ~0.2-unit patch of the planet is measured once and cached
const _standCache = new Map(), CELL = 0.2;
export function standAt(d) {
  if (!_ground.meshes.length) return groundAt(d) + roadLift(d);
  const k = Math.round(d.x * R / CELL) + ',' + Math.round(d.y * R / CELL) + ',' + Math.round(d.z * R / CELL);
  let v = _standCache.get(k);
  if (v === undefined) { v = measureStand(d); _standCache.set(k, v); }
  return v;
}
function measureStand(d) {
  const base = groundAt(d) + roadLift(d);
  _rd.copy(d).negate(); _ro.copy(d).multiplyScalar(base + STEP_UP + 0.05);
  const near = [];
  for (let i = 0; i < _ground.meshes.length; i++) {
    const s = _ground.spheres[i];
    if (_rc.ray.set(_ro, _rd), _rc.ray.distanceSqToPoint(s.center) <= s.radius * s.radius) near.push(_ground.meshes[i]);
  }
  if (!near.length) return base;
  _rc.set(_ro, _rd); _rc.near = 0; _rc.far = STEP_UP + 0.15;
  let best = base;
  for (const h of _rc.intersectObjects(near, false)) {
    if (!h.face) continue;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    let up = n.dot(d);
    if (h.object.material?.side === THREE.DoubleSide) up = Math.abs(up);   // ribbons are drawn from both sides
    if (up < 0.6) continue;                             // walls and undersides don't count
    const r = h.point.length();
    if (r > best && r < base + STEP_UP) best = r;
  }
  return best;
}
export function onRoad(d, pad = 0) {
  for (const rd of ROADS) for (const p of rd.pts) if (arc(d, p) < rd.half + pad) return true;
  return false;
}
// the nearest road to a direction: which carriageway, how far from its centre
// line, which way it runs there. The car uses it to stay on the road. All the
// centre-line samples are packed once (after the town is built) for speed.
let _rp = null, _rn = 0;
export function nearestRoad(d) {
  const n = ROADS.reduce((a, r) => a + r.pts.length, 0);
  if (!_rp || _rn !== n) {
    _rp = { xyz: new Float32Array(n * 3), half: new Float32Array(n), road: new Int32Array(n), idx: new Int32Array(n) };
    let k = 0;
    ROADS.forEach((r, ri) => r.pts.forEach((p, pi) => { _rp.xyz.set([p.x, p.y, p.z], k * 3); _rp.half[k] = r.half; _rp.road[k] = ri; _rp.idx[k] = pi; k++; }));
    _rn = n;
  }
  // the road whose edge is nearest (most inside): minimise distance − half-width
  let best = -1, bestEx = 1e9, bestA = 0;
  const { xyz, half } = _rp;
  for (let k = 0; k < n; k++) {
    const dot = d.x * xyz[k * 3] + d.y * xyz[k * 3 + 1] + d.z * xyz[k * 3 + 2];
    if (dot < 0.97) continue;                                   // > ~10 units away
    const a = Math.acos(Math.min(1, dot)) * R, ex = a - half[k];
    if (ex < bestEx) { bestEx = ex; best = k; bestA = a; }
  }
  if (best < 0) return null;
  const rd = ROADS[_rp.road[best]], i = _rp.idx[best], P = rd.pts;
  const p = P[i], a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
  const tangent = b.clone().sub(a).projectOnPlane(p).normalize();
  return { point: p, dist: bestA, half: rd.half, tangent };
}

// a road ribbon laid ON the terrain, with a pale kerb underlay and a dashed
// centre line for the wide ones — painted, not modelled
const roadMat = paint(PAL.road, { hatch: 0 });
const kerbMat = paint(PAL.kerb, { hatch: 0 });
const dashMat = paint(PAL.dash, { hatch: 0 });
for (const m of [roadMat, kerbMat, dashMat]) { m.polygonOffset = true; m.side = THREE.DoubleSide; }
roadMat.polygonOffsetFactor = -2; roadMat.polygonOffsetUnits = -2;
kerbMat.polygonOffsetFactor = -1; kerbMat.polygonOffsetUnits = -1;
dashMat.polygonOffsetFactor = -3; dashMat.polygonOffsetUnits = -3;
function ribbon(pts, half, lift, closed, mat, dashed = false) {
  // Draped ACROSS its width too: one height per cross-section tilted the strip
  // on a side-slope (the museum's levelled plane), so grass bit through one
  // edge and the other floated. Each vertex sits on the highest ground near it,
  // which also keeps it above the planet mesh's flat triangles on concave ground.
  const pos = [], idx = [], lat = new THREE.Vector3(), a1 = new THREE.Vector3(), a2 = new THREE.Vector3(), q = new THREE.Vector3();
  const n = pts.length, N = closed ? n + 1 : n;
  const L = dashed ? 1 : Math.max(2, Math.ceil((half * 2) / 0.45));
  const drape = (dir) => {
    a1.crossVectors(dir, Math.abs(dir.y) < 0.9 ? UP : lat).normalize(); a2.crossVectors(dir, a1);
    let r = radiusAt(dir);
    for (const [u, v] of [[0.38, 0], [-0.38, 0], [0, 0.38], [0, -0.38]]) r = Math.max(r, radiusAt(q.copy(dir).multiplyScalar(R).addScaledVector(a1, u).addScaledVector(a2, v).normalize()));
    return r;
  };
  for (let k = 0; k < N; k++) {
    const i = k % n;
    const d = pts[i], dn = pts[closed ? (i + 1) % n : Math.min(i + 1, n - 1)], dp = pts[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
    const tang = dn.clone().sub(dp).normalize();
    lat.crossVectors(d, tang).normalize();
    for (let j = 0; j <= L; j++) {
      const dir = d.clone().multiplyScalar(R).addScaledVector(lat, half - (2 * half * j) / L).normalize();
      pos.push(...dir.multiplyScalar(drape(dir.clone()) + lift).toArray());
    }
  }
  for (let k = 0; k < N - 1; k++) {
    if (dashed && (k % 3) !== 0) continue;
    for (let j = 0; j < L; j++) {
      const a = k * (L + 1) + j, b = a + L + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.userData.noInk = true;
  return m;
}
// resample a polyline so samples are ~step units apart (ribbons stay smooth)
export function resample(pts, step = 0.6, closed = false) {
  const out = [];
  const n = pts.length, segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const k = Math.max(1, Math.round(arc(a, b) / step));
    for (let j = 0; j < k; j++) out.push(slerpDir(a, b, j / k));
  }
  if (!closed) out.push(pts[n - 1].clone());
  return out;
}
export function buildRoad(scene, pts, { half = 1.1, closed = false, dashed = true } = {}) {
  pts = resample(pts, 0.6, closed);
  const g = new THREE.Group();
  ROADS.push({ pts, half, closed, dashed: dashed && half > 0.8, group: g });
  g.add(ribbon(pts, half + 0.28, 0.035, closed, kerbMat));
  g.add(ribbon(pts, half, 0.05, closed, roadMat));
  scene.add(g);
  return pts;
}

// ── centre lines, painted once every road exists ──
// Straight dashes at an even spacing along each road's length (never bent round a
// sample corner). None inside a junction: a dash is dropped where another road's
// carriageway crosses it, and where two roads run on top of each other only the
// first-built one is painted — so lines never double up, kink or form L shapes.
export function paintRoadMarkings() {
  const DASH = 0.8, GAP = 1.1, W = 0.07;
  const near = (d, i, tang) => {
    for (let j = 0; j < ROADS.length; j++) {
      if (j === i) continue;
      const o = ROADS[j];
      for (let k = 0; k < o.pts.length; k++) {
        if (arc(d, o.pts[k]) >= o.half + 0.35) continue;              // arc() is already in world units
        const ot = o.pts[Math.min(k + 1, o.pts.length - 1)].clone().sub(o.pts[Math.max(k - 1, 0)]).normalize();
        if (j < i || Math.abs(ot.dot(tang)) < 0.9) return true;          // a crossing, or an earlier road on the same line
      }
    }
    return false;
  };
  ROADS.forEach((rd, i) => {
    if (!rd.dashed) return;
    const P = rd.closed ? [...rd.pts, rd.pts[0]] : rd.pts;
    const cum = [0]; for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + arc(P[k - 1], P[k]));
    const total = cum[cum.length - 1];
    const at = (s) => { let k = 1; while (k < cum.length - 1 && cum[k] < s) k++; const t = (s - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]); return slerpDir(P[k - 1], P[k], THREE.MathUtils.clamp(t, 0, 1)); };
    const pos = [], idx = [];
    for (let s = GAP / 2; s + DASH < total - GAP / 2; s += DASH + GAP) {
      const c = at(s + DASH / 2), a = at(s), b = at(s + DASH);
      const tang = b.clone().sub(a).normalize();
      if (near(c, i, tang) || near(a, i, tang) || near(b, i, tang)) continue;
      const lat = new THREE.Vector3().crossVectors(c, tang).normalize();
      const base = pos.length / 3;
      for (let u = 0; u <= 3; u++) {                           // a straight dash, draped in 3 steps along its length
        const along = (u / 3 - 0.5) * DASH;
        for (const sx of [-1, 1]) {
          const d = c.clone().multiplyScalar(R).addScaledVector(tang, along).addScaledVector(lat, sx * W).normalize();
          pos.push(...d.multiplyScalar(standAt(d) + 0.014).toArray());
        }
      }
      for (let u = 0; u < 3; u++) { const q = base + u * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, dashMat); m.userData.noInk = true; m.userData.noGround = true;
    rd.group.add(m);
  });
}

// ── the planet mesh: painted in posterized bands with a watercolour wobble ──
export function buildPlanet(scene) {
  let g = mergeVertices(new THREE.IcosahedronGeometry(R, 56));
  const p = g.attributes.position, v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3), c = new THREE.Color(), tmp = new THREE.Color();
  const C = (hex) => new THREE.Color(hex);
  const sand = C(PAL.sand), meadow = C(PAL.meadow), grass = C(PAL.grass), deep = C(PAL.grassDeep),
    rock = C(PAL.rock), snow = C(PAL.snow), earth = C(PAL.earth), bed = C(PAL.waterDeep);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const h = surfH(v);
    const r = R + h;
    p.setXYZ(i, v.x * r, v.y * r, v.z * r);
    // a slow watercolour wash decides meadow vs grass, posterized into bands
    const wash = Math.sin(v.x * 7.1 + 1.3) * Math.sin(v.z * 6.3 + 0.2) + Math.sin(v.y * 9.7) * 0.5;
    if (h < SEA - 0.05) c.copy(bed);
    else if (h < SEA + 0.22) c.copy(sand);
    else if (h > 2.6) c.copy(snow);
    else if (h > 1.4) c.copy(rock).lerp(earth, wash > 0 ? 0.3 : 0);
    else c.copy(wash > 0.45 ? meadow : wash < -0.5 ? deep : grass);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, paint(0xffffff, { vertexColors: true, hatch: 0.6 }));
  mesh.userData.noInk = true;          // the ground's edge is the horizon; ink it with the rim below
  mesh.name = 'planet';
  scene.add(mesh);
  // the sea: one flat sheet of gouache, slightly translucent at the shore
  const sea = new THREE.Mesh(new THREE.IcosahedronGeometry(R + SEA, 24), paint(PAL.water, { hatch: 0.4 }));
  sea.userData.noInk = true; sea.name = 'sea';
  scene.add(sea);
  // a single ink rim around the whole planet: the horizon line of the drawing
  const rim = new THREE.Mesh(new THREE.IcosahedronGeometry(R + 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  rim.visible = false;
  return { mesh, sea };
}

// ── sky: a soft watercolour wash behind everything (no stars, no bloom) ──
export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0xbcd3dc) }, mid: { value: new THREE.Color(0xf2e6cf) }, low: { value: new THREE.Color(0xf6d9bf) }, upv: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    // the gradient follows the camera's own "up" — on a tiny planet, up is wherever you stand
    fragmentShader: `uniform vec3 top, mid, low, upv; varying vec3 vP;
      void main(){
        float y = dot(normalize(vP), upv) + 0.08;
        vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.7, y)) : mix(mid, low, smoothstep(0.0, -0.6, y));
        // paper tooth on the sky too
        vec2 fc = gl_FragCoord.xy;
        float g = fract(sin(dot(floor(fc / 2.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
        gl_FragColor = vec4(c * (1.0 + g * 0.03), 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.userData.noInk = true; sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

export function buildLights(scene) {
  const hemi = new THREE.HemisphereLight(0xfff6e8, 0xb7a9a0, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
  sun.position.set(60, 80, 50);
  scene.add(sun);
  return { hemi, sun };
}

// drawn clouds: flat puffs with ink, drifting slowly round the planet
export function buildClouds(scene, n = 9, rand = Math.random) {
  const group = new THREE.Group();
  const mat = paint(0xfffaf0, { hatch: 0 });
  for (let i = 0; i < n; i++) {
    const piv = new THREE.Group();
    const cl = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < puffs; k++) {
      const s = 1.1 + rand() * 1.1;
      const p = new THREE.Mesh(new THREE.SphereGeometry(s, 14, 10), mat);
      p.position.set((k - puffs / 2) * 1.5, rand() * 0.5, rand() * 0.6);
      p.scale.y = 0.55;
      cl.add(p);
    }
    ink(cl, 'fine');
    cl.position.y = R + 9 + rand() * 4;
    piv.add(cl);
    piv.rotation.set(rand() * Math.PI, rand() * Math.PI * 2, rand() * Math.PI);
    piv.userData.spin = 0.006 + rand() * 0.01;
    group.add(piv);
  }
  scene.add(group);
  return group;
}
