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
// lawn: paint the levelled ground (and its easing) grass however high it stands — see inLawn()
export function flatten(d, r, h = LAND, { plane = null, blend = null, lawn = false } = {}) { extraFlats.push({ d: d.clone(), r, h, plane: plane?.clone(), blend, lawn }); }

// rivers and lakes carved like the sea (after everything else): isWater sees them, and the sea
// sheet (one sphere at sea level) shows through wherever the ground dips under it.
// addRiver: a polyline of directions, `half` = the carve's outer half-width (banks included);
// addLake: a round pool. Each keeps a bounding cap so far-off points skip it cheaply.
const WATERS = [];
export function addRiver(pts, half = 2.4, depth = 0.9) {
  const P = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const n = Math.max(1, Math.ceil(arc(pts[i], pts[i + 1]) / 0.45));
    for (let k = 0; k < n; k++) P.push(slerpDir(pts[i], pts[i + 1], k / n));
  }
  P.push(pts[pts.length - 1].clone());
  const c = P.reduce((a, p) => a.add(p), new THREE.Vector3()).normalize();
  const reach = Math.max(...P.map(p => p.angleTo(c))) + (half + 0.5) / R;
  const xyz = new Float32Array(P.length * 3); P.forEach((p, i) => xyz.set([p.x, p.y, p.z], i * 3));
  WATERS.push({ kind: 'river', pts: P, xyz, half, depth, c, cosReach: Math.cos(reach) });
  return P;
}
export function addLake(d, r, depth = 1.0) { WATERS.push({ kind: 'lake', c: d.clone().normalize(), r, depth, cosReach: Math.cos((r + 0.5) / R) }); }
export const RIVERS = WATERS;
// in a river's or lake's carve (its bed and banks)
export function inFreshWater(d) {
  for (const w of WATERS) if (d.dot(w.c) >= w.cosReach && waterDist(w, d) < (w.kind === 'lake' ? w.r : w.half)) return true;
  return false;
}
function waterDist(w, d) {                                       // world units to the water's middle
  if (w.kind === 'lake') return arc(d, w.c);
  let best = -2; const X = w.xyz;
  for (let i = 0; i < X.length; i += 3) { const t = d.x * X[i] + d.y * X[i + 1] + d.z * X[i + 2]; if (t > best) best = t; }
  return Math.acos(Math.min(1, best)) * R;
}

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
    const df = arc(d, f.d), blend = f.blend ?? (f.plane ? 9 : 5);
    if (df < f.r + blend + 1) {
      // a plane rises off the sphere as you leave its tangent point: past its edge it holds the
      // edge's height while it eases out (it used to keep climbing there, and threw up a ~5-high
      // ridge round the museum — the steep hill the project roads ran over)
      // (the plane's height is measured from ITS tangent point, not the flat's centre — they
      // differ for the museum, and measuring from the centre lifted the forecourt's lawn over its paving)
      const pd = df <= f.r || !f.plane ? d : slerpDir(f.d, d, f.r / df);
      const target = f.plane ? (R + f.h) / Math.max(0.5, pd.dot(f.plane)) - R : f.h;
      h += (target - h) * (1 - ss(f.r, f.r + blend, df));
    }
  }
  // water last: the sea and its bay carve below everything
  for (const w of [F.sea, F.bay]) {
    const dw = arc(d, w.d);
    if (dw < w.r) h += (-w.depth - h) * (1 - ss(w.r * 0.7, w.r, dw));
  }
  for (const w of WATERS) {
    if (d.dot(w.c) < w.cosReach) continue;
    const dw = waterDist(w, d), r = w.kind === 'lake' ? w.r : w.half;
    if (dw < r) h += (-w.depth - h) * (1 - ss(r * 0.5, r, dw));
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
// every lamp in the world, once the town is built (collectLamps): { dir, kind } — kind 'street'
// (props lamp()), 'post' (a building's lampPost) or 'low' (the grounds' bollard lamps). Lamps
// leave a marker (userData.lampMark) that bake() keeps as userData.lamps [x, z, kind]; the dev
// check (?lamps=1) reads this to keep every lamp off the carriageways and clear of doors
export const LAMPS = [];
export function collectLamps(roots) {
  const v = new THREE.Vector3();
  for (const r of roots) {
    r.updateMatrixWorld(true);
    r.traverse(o => {
      if (o.userData.lampMark) LAMPS.push({ dir: o.getWorldPosition(v).clone().normalize(), kind: o.userData.lampMark });
      for (const [x, z, kind] of o.userData.lamps || []) LAMPS.push({ dir: o.localToWorld(v.set(x, 0, z)).clone().normalize(), kind });
    });
  }
  return LAMPS;
}
// paved ground a car may drive off the road onto (car parks and their drives): (dir) => bool.
// Inside one, the car's keep-to-the-road assist lets go (player.js keepOnRoad)
export const LOTS = [];
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
// Camera blockers: solid volumes the follow camera may neither sit in nor look through (a
// shop's walls and roof). The walk colliders are discs too small to stop the camera (it only
// minds those of r ≥ 0.5), so standing on a shop's stoop facing out used to park the camera
// inside its back wall: a black screen. Each is a box in a placed object's own frame.
const _camBlocks = [], _cbq = new THREE.Vector3();
export function addCamBlock(obj, min, max) {
  obj.updateWorldMatrix(true, false);
  const box = new THREE.Box3(min.clone(), max.clone());
  const c = box.getCenter(new THREE.Vector3()).applyMatrix4(obj.matrixWorld);
  _camBlocks.push({ inv: obj.matrixWorld.clone().invert(), box, c, r: box.getSize(new THREE.Vector3()).length() / 2 });
}
// the blockers within `range` of world point p (that p itself isn't inside: from in there, they're no wall)
export function camBlocksNear(p, range, pad = 0) {
  return _camBlocks.filter(b => b.c.distanceTo(p) < b.r + range && !camBlocked(p, pad, [b]));
}
export function camBlocked(p, pad = 0, list = _camBlocks) {
  for (const b of list) {
    _cbq.copy(p).applyMatrix4(b.inv);
    if (_cbq.x > b.box.min.x - pad && _cbq.x < b.box.max.x + pad && _cbq.y > b.box.min.y - pad && _cbq.y < b.box.max.y + pad
      && _cbq.z > b.box.min.z - pad && _cbq.z < b.box.max.z + pad) return true;
  }
  return false;
}
const STEP_UP = 0.45;                                   // how far above the base ground a walkable surface may be
// the ground never moves, so each ~0.2-unit patch of the planet is measured once and cached
const _standCache = new Map(), CELL = 0.2;
export function standAt(d) {
  if (!_ground.meshes.length) return groundAt(d) + roadLift(d);
  const k = Math.round(d.x * R / CELL) + ',' + Math.round(d.y * R / CELL) + ',' + Math.round(d.z * R / CELL);
  let v = _standCache.get(k);
  if (v === undefined) {                                // measured at the cell's centre, so a cell that
    _cc.set(Math.round(d.x * R / CELL), Math.round(d.y * R / CELL), Math.round(d.z * R / CELL)).normalize();
    v = measureStand(_cc); _standCache.set(k, v);       // straddles a step reads the same whoever asks first
  }
  return v;
}
const _cc = new THREE.Vector3();
// ── footing: where a walker's FEET are, not just her centre ──
// Her shoes stride ~0.25 past her centre, so sampling only the centre leaves a
// foot inside a step's riser while she still stands on the ground below it.
// footing() reads a small ring round her. A raised FLOOR (addFloor: the museum
// forecourt, a platform, a pavement) that a foot reaches lifts her as soon as the
// shoe lands on it, if it is within a step of `ref` (her current height); one
// higher than that is a riser she can't climb, returned as `wall` (unit tangent
// toward it) so the walker stops at it instead of standing inside it. Small rises
// (kerbs, road ribbons) count too; other drawn bits (a window sill, a bench seat,
// a buffer stop) only count under her centre, as before.
export const STEP_CLIMB = STEP_UP + 0.1;               // a little slack: a 0.46 platform edge is still a step
const SMALL_RISE = 0.12;
const _fa = new THREE.Vector3(), _fb = new THREE.Vector3(), _fp2 = new THREE.Vector3(), _fo = new THREE.Vector3();
export function footing(d, ref = null, reach = 0.26, N = 8) {
  const c = standAt(d), gc = groundAt(d);
  if (ref == null) ref = c;
  _fa.set(0, 1, 0); if (Math.abs(d.y) > 0.9) _fa.set(1, 0, 0);
  _fa.cross(d).normalize(); _fb.crossVectors(d, _fa);
  let top = c, wall = null;
  for (let k = 0; k < N; k++) {
    const a = k / N * Math.PI * 2;
    _fo.copy(_fa).multiplyScalar(Math.cos(a)).addScaledVector(_fb, Math.sin(a));
    _fp2.copy(d).multiplyScalar(R).addScaledVector(_fo, reach).normalize();
    const g = groundAt(_fp2);
    if (g > ref + STEP_CLIMB) { (wall ??= new THREE.Vector3()).add(_fo); continue; }
    const h = standAt(_fp2);
    if (h > top && (g > gc + SMALL_RISE || h < c + SMALL_RISE)) top = h;
  }
  if (wall && wall.lengthSq() < 1e-8) wall.copy(_fo);   // walled in all round: any direction will do
  return { r: top, wall: wall && wall.normalize() };
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
// ── no plant on a road, a rail or a bridge deck (the deck is in ROADS): r = the plant's own
// footprint; the kerb strip and a little more are kept clear. Other systems (the railway)
// add their own tests with addBlocker ──
const BLOCKERS = [];
export function addBlocker(f) { BLOCKERS.push(f); }
export function decoBlocked(d, r = 0.3) { return onRoad(d, r + 0.4) || BLOCKERS.some(f => f(d, r)); }
// drop every plant (userData.deco) inside `root` that stands on a road or rail, and the walker's
// footprint markers placed with it; returns how many went. `root` must be placed (world matrices)
export function pruneDeco(root) {
  root.updateMatrixWorld(true);
  const gone = [], w = new THREE.Vector3();
  root.traverse(o => { if (o !== root && o.userData.deco && !gone.some(g => isAncestor(g, o))) { o.getWorldPosition(w); if (decoBlocked(w.clone().normalize(), o.userData.deco)) gone.push(o); } });
  for (const o of gone) {
    const par = o.parent; if (!par) continue;
    for (const f of [...par.children]) if (f.userData.foot && f.position.distanceTo(o.position) < 0.3) par.remove(f);
    par.remove(o);
  }
  return gone.length;
}
const isAncestor = (a, o) => { for (let q = o.parent; q; q = q.parent) if (q === a) return true; return false; };
export function onRoad(d, pad = 0) {
  for (const P of PADS) if (padDist(P, d) < pad) return true;
  for (const rd of ROADS) {
    if (rd.disc) { if (arc(d, rd.disc.c) < rd.disc.r + pad) return true; continue; }
    for (const p of rd.pts) if (arc(d, p) < rd.half + pad) return true;
  }
  // …and the kerb returns swept round each junction's corners (the drawn sheet's fillets). The
  // blend is no distance, so only the sheet itself (and its kerb band) is tested here: a fillet
  // reaches at most FILLET/4 past the nearer road, which a bigger pad above already covers
  const fp = Math.min(pad, KERB + 0.02);
  for (const J of JUNCTIONS) {
    if (arc(d, J.d) > 4.5) continue;
    const A = ROADS[J.a], B = ROADS[J.b]; if (A.deck || B.deck) continue;
    const da = closestOnRoad(d, A).dist - (A.disc ? A.disc.r : A.half), db = closestOnRoad(d, B).dist - (B.disc ? B.disc.r : B.half);
    if (smin(da, db) < fp) return true;
  }
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

// ── ROADS AS A PLANNED NETWORK ───────────────────────────────────────────────────────────
// Every road is laid with buildRoad(): its centre line is resampled and FAIRED (no bend
// tighter than RMIN, so no straight-segment zig-zags), and an end that stops on or near a road
// already laid is brought in to meet it SQUARE, on its middle line (a proper T). A road told
// to (`bulb`) ends in a turning circle. Where roads meet is noted in JUNCTIONS.
// Nothing is drawn per road: once every road exists, buildRoadSurface() draws the whole
// network as ONE continuous sheet — asphalt, a pale kerb band and a skirt down into the
// ground — from a distance field over the planet: each road a capsule of its half-width,
// joined at every junction by a smooth minimum, so kerbs sweep round each corner in a curve
// (a kerb-return fillet) instead of two strips crossing with square ends. A side road's field
// stops just inside the road it meets, so the far kerb runs on unbroken. No patches lie on
// patches (no seams, no z-fighting), and it is a handful of draws for the whole planet.
const roadMat = paint(0xffffff, { hatch: 0, vertexColors: true, side: THREE.DoubleSide, unique: true });
const dashMat = paint(PAL.dash, { hatch: 0, side: THREE.DoubleSide, unique: true });
// the sheet draws in front of any paving it meets flush (a car park's bell-mouth), the dashes in front of the sheet
roadMat.polygonOffset = true; roadMat.polygonOffsetFactor = -2; roadMat.polygonOffsetUnits = -2;
dashMat.polygonOffset = true; dashMat.polygonOffsetFactor = -3; dashMat.polygonOffsetUnits = -3;
export const JUNCTIONS = [];
// PADS: paved rectangles drawn into the same sheet (a car park and its apron): centre c (unit
// dir), tangent axes e1/e2 (unit), half-sizes hx/hz along them, corner radius r. Each blends into
// any road (or pad) it touches with the same kerb return as a junction — one surface, one kerb
export const PADS = [];
export function addPad(c, e1, e2, hx, hz, r = 0.3) { PADS.push({ c: c.clone().normalize(), e1: e1.clone().normalize(), e2: e2.clone().normalize(), hx, hz, r }); }
const _pq = new THREE.Vector3();
export function padDist(P, d) {                    // world units outside the pad (negative inside)
  _pq.copy(d).multiplyScalar(R).addScaledVector(P.c, -R);
  const qx = Math.abs(_pq.dot(P.e1)) - P.hx + P.r, qz = Math.abs(_pq.dot(P.e2)) - P.hz + P.r;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - P.r;
}          // { d, a, b, kind: 'T' (a's end `end` meets b) | 'C' (end to end) | 'X' (crossing) }
const RMIN = 2.6;                     // the tightest bend a centre line may take (world units)
const KERB = 0.28;                    // the kerb band's width outside the carriageway
const FILLET = 1.7;                   // the smooth-min blend at junctions: kerb returns of ~1.4 radius
const smin = (a, b, k = FILLET) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
// the highest ground within a road sample's reach, + the carriageway's lift (as the sheet drapes it)
const _rt1 = new THREE.Vector3(), _rt2 = new THREE.Vector3(), _rtq = new THREE.Vector3();
function roadTop(dir) {
  _rt1.crossVectors(dir, Math.abs(dir.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize(); _rt2.crossVectors(dir, _rt1);
  let r = radiusAt(dir);
  for (const [u, v] of [[0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.42, 0.42], [-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42]])
    r = Math.max(r, radiusAt(_rtq.copy(dir).multiplyScalar(R).addScaledVector(_rt1, u).addScaledVector(_rt2, v).normalize()));
  return r + 0.06;
}
// resample a polyline so samples are ~step units apart
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
// the nearest point of a road's centre line to d: { dist (world units), p (dir), tan (unit), i, t }
const _ca = new THREE.Vector3(), _cb = new THREE.Vector3(), _cx = new THREE.Vector3(), _cab = new THREE.Vector3();
export function closestOnRoad(d, rd) {
  if (rd.disc) { const a = arc(d, rd.disc.c); return { dist: a, p: rd.disc.c, tan: null, i: 0, t: 0, disc: true }; }
  const P = rd.pts, n = P.length, segs = rd.closed ? n : n - 1;
  _cx.copy(d).multiplyScalar(R);
  let bd = 1e18, bi = 0, bt = 0;
  for (let i = 0; i < segs; i++) {
    const a = P[i], b = P[(i + 1) % n];
    if (a.dot(d) < 0.95 && b.dot(d) < 0.95) continue;               // both > ~12 units off
    _ca.copy(a).multiplyScalar(R); _cab.copy(b).multiplyScalar(R).sub(_ca);
    const t = Math.max(0, Math.min(1, _cb.copy(_cx).sub(_ca).dot(_cab) / Math.max(1e-12, _cab.lengthSq())));
    const q = _ca.addScaledVector(_cab, t).distanceToSquared(_cx);
    if (q < bd) { bd = q; bi = i; bt = t; }
  }
  if (bd > 1e17) return { dist: 1e9, p: null, tan: null, i: -1, t: 0 };
  const a = P[bi], b = P[(bi + 1) % n], p = slerpDir(a, b, bt);
  return { dist: Math.sqrt(bd), p, tan: b.clone().sub(a).projectOnPlane(p).normalize(), i: bi, t: bt };
}
// a closed road whose ring is no wider than its half-width is a disc (a turning circle)
function discOf(pts, half) {
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).normalize();
  let m = 0; for (const p of pts) m = Math.max(m, arc(p, c));
  return m <= half + 0.05 ? { c, r: m + half } : null;
}
// how tight the bend at m is: the radius of the arc through a → m → c (world units)
function bendRadius(a, m, c) {
  _ca.copy(m).sub(a); _cb.copy(c).sub(m);
  const th = _ca.angleTo(_cb); if (th < 1e-6) return Infinity;
  return (_ca.length() + _cb.length()) * R / 2 / th;
}
// ease every bend tighter than rmin: a point on a too-tight bend slides toward the chord of its
// neighbours, a little at a time, so the turn spreads over its neighbours into an arc (fixed ends stay)
function fair(pts, closed, rmin = RMIN, fixed = 1) {
  const n = pts.length; if (n < 4) return pts;
  for (let it = 0; it < 120; it++) {
    let moved = false;
    for (let i = closed ? 0 : fixed; i < (closed ? n : n - fixed); i++) {
      const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
      if (bendRadius(a, pts[i], c) >= rmin) continue;
      pts[i] = pts[i].clone().lerp(a.clone().add(c).normalize(), 0.5).normalize(); moved = true;
    }
    if (!moved) break;
  }
  return pts;
}
// a point `s` world units along a polyline from one end (e = 0: from the start, 1: from the end)
function alongFrom(pts, e, s) {
  const n = pts.length; let acc = 0;
  for (let k = 0; k < n - 1; k++) {
    const a = e ? pts[n - 1 - k] : pts[k], b = e ? pts[n - 2 - k] : pts[k + 1], l = arc(a, b);
    if (acc + l >= s) return { d: slerpDir(a, b, (s - acc) / Math.max(1e-9, l)), k: e ? n - 2 - k : k + 1 };
    acc += l;
  }
  return null;
}
// bring an open road's end in to meet the road it stops on or near: square to it, ending on its
// middle line. A shallow merge (< 30°) or a run onto another road's END (a continuation, the
// bridge deck) is left as it is. The new end is a cubic curve from a point well back along the
// road, tangent to it there, arriving along the other road's normal, then a short straight.
function meetSquare(pts, e, half, zonesOk) {
  const n = pts.length; if (n < 3) return pts;
  const E = e ? pts[n - 1] : pts[0];
  let best = null;
  for (const o of ROADS) {
    if (o.deck || o.disc) continue;
    const q = closestOnRoad(E, o);
    if (q.dist < o.half + 0.6 && (!best || q.dist - o.half < best.q.dist - best.o.half)) best = { o, q };
  }
  if (!best) return pts;
  const { o, q } = best, oi = ROADS.indexOf(o);
  if (!o.closed) {                                                     // on (or past) its end: a continuation
    const L = o.pts.length;
    if (arc(q.p, o.pts[0]) < 1.2 || arc(q.p, o.pts[L - 1]) < 1.2) return pts;
  }
  const back = alongFrom(pts, e, 2.0); if (!back) return pts;
  const out = E.clone().sub(back.d).projectOnPlane(E).normalize();
  const ang = Math.acos(Math.min(1, Math.abs(out.dot(q.tan)))) * 180 / Math.PI;     // 90 = square
  if (ang < 8) return pts;                                             // running on along it
  if (ang > 84 && q.dist < 0.25) { const p2 = pts.slice(); p2[e ? n - 1 : 0] = q.p.clone(); return p2; }
  const at = (base, v, s) => base.clone().multiplyScalar(R).addScaledVector(v, s).normalize();
  const total = (() => { let s = 0; for (let k = 1; k < n; k++) s += arc(pts[k - 1], pts[k]); return s; })();
  const straight = o.half + 1.2;
  const turn = (90 - ang) * Math.PI / 180 + 0.2;
  // the junction may slide along the other road the way this one is heading (a road that leaves at
  // a shallow angle meets it square a little further on, its curve staying near where it ran)
  const slideDir0 = out.dot(q.tan) < 0 ? 1 : -1;                       // along o's sample order
  const along = (s0) => {                                              // a point s0 along o from q (−: the other way), with its tangent
    const P = o.pts, N = P.length, slideDir = s0 < 0 ? -slideDir0 : slideDir0; let i = q.i, left = Math.abs(s0), cur = q.p;
    while (left > 1e-6) {
      const j = slideDir > 0 ? i + 1 : i;                              // the next sample that way
      if (!o.closed && (j < 0 || j >= N)) return null;
      const nxt = P[((j % N) + N) % N], l = arc(cur, nxt);
      if (l >= left) { cur = slerpDir(cur, nxt, left / l); left = 0; break; }
      left -= l; cur = nxt; i = slideDir > 0 ? j : j - 1;
    }
    const c = closestOnRoad(cur, o); return { p: c.p, tan: c.tan };
  };
  for (const slide of [0, 1.5, 3, 4.5, 6, -1.5, -3]) {
    const J = slide ? along(slide) : { p: q.p, tan: q.tan }; if (!J) break;
    // (never slid up against another junction on that road: two T's a car's length apart)
    if (slide && JUNCTIONS.some(K => (K.a === oi || K.b === oi) && arc(K.d, J.p) < 4)) continue;
    const Q = J.p, nrm = new THREE.Vector3().crossVectors(Q, J.tan).normalize();
    if (nrm.dot(back.d.clone().sub(Q)) < 0) nrm.negate();             // pointing back up the side road
    const A = at(Q, nrm, straight);
    // the longest easing that keeps out of reserved ground (a long one first: the gentlest curve)
    for (const f of [1, 0.75, 0.55]) {
      const Lb = Math.min(total * 0.6, straight + Math.max(2.4, RMIN * turn * 1.6) * f + Math.abs(slide) * 0.5);
      const B = alongFrom(pts, e, Lb); if (!B || Lb < straight + 1.0) return pts;
      const Bn = alongFrom(pts, e, Lb + 0.6) || B;
      const tB = B.d.clone().sub(Bn.d).projectOnPlane(B.d).normalize();   // heading toward the end
      const P0 = B.d.clone().multiplyScalar(R), P3 = A.clone().multiplyScalar(R), L3 = P0.distanceTo(P3) / 3;
      const P1 = P0.clone().addScaledVector(tB, L3), P2 = P3.clone().addScaledVector(nrm, L3);
      const curve = [];
      const m = Math.max(4, Math.round(P0.distanceTo(P3) / 0.3));
      for (let k = 1; k <= m; k++) {
        const t = k / m, u = 1 - t;
        curve.push(P0.clone().multiplyScalar(u * u * u).addScaledVector(P1, 3 * u * u * t).addScaledVector(P2, 3 * u * t * t).addScaledVector(P3, t * t * t).normalize());
      }
      const ns = Math.max(2, Math.round(straight / 0.3));
      for (let k = 1; k <= ns; k++) curve.push(slerpDir(A, Q, k / ns));
      if (!zonesOk(curve)) continue;
      // (and never doubling back over the other road: the curve stays on this road's side of it)
      if (curve.slice(0, -ns).some(d => closestOnRoad(d, o).dist < o.half + 0.4)) continue;
      const keep = e ? pts.slice(0, B.k) : pts.slice(B.k + 1).reverse();
      const res = [...keep, ...curve];                                 // (built start → end)
      return e ? res : res.reverse();
    }
  }
  return pts;
}
// a turning circle at a road's end: a disc that reaches just past the end, set back if it would
// cut into reserved ground
function turningCircle(pts, e, half, r = 1.6) {
  for (const sb of [r - 0.35, r + 0.2, r + 0.8, r + 1.5]) {
    const c = alongFrom(pts, e, sb); if (!c) break;
    if (!zoneHit(c.d, r + 0.1)) return { c: c.d, r, sb };
  }
  const c = alongFrom(pts, e, r - 0.35) || { d: e ? pts[pts.length - 1] : pts[0] };
  return { c: c.d, r: Math.max(half + 0.4, 1.3), sb: r - 0.35 };
}
// the polyline with the last `s` world units trimmed off end e (it then ends exactly there)
function trimEnd(pts, e, s) {
  const P = e ? pts.slice() : pts.slice().reverse();
  let left = s;
  while (P.length > 2) {
    const l = arc(P[P.length - 2], P[P.length - 1]);
    if (l > left) { P[P.length - 1] = slerpDir(P[P.length - 1], P[P.length - 2], left / l); break; }
    left -= l; P.pop();
  }
  return e ? P : P.reverse();
}
// note where road `idx` meets the roads already laid (and where their ends meet it)
function noteJunctions(idx) {
  const rd = ROADS[idx], has = (a, b) => JUNCTIONS.some(J => (J.a === a && J.b === b) || (J.a === b && J.b === a));
  const inside = (d, o) => closestOnRoad(d, o).dist < (o.disc ? o.disc.r : o.half) - 0.02;
  const endKind = (d, o) => {
    if (o.disc || o.closed) return 'T';
    const L = o.pts.length, q = closestOnRoad(d, o);
    return arc(q.p, o.pts[0]) < 1.0 || arc(q.p, o.pts[L - 1]) < 1.0 ? 'C' : 'T';
  };
  const ends = (r) => r.closed ? [] : [0, 1];
  for (const e of ends(rd)) {
    const E = e ? rd.pts[rd.pts.length - 1] : rd.pts[0];
    let best = null, bd = 1e9;
    ROADS.forEach((o, j) => { if (j === idx) return; const q = closestOnRoad(E, o); if (q.dist < (o.disc ? o.disc.r : o.half) - 0.02 && q.dist < bd) { bd = q.dist; best = j; } });
    if (best != null) JUNCTIONS.push({ d: E.clone(), a: idx, end: e, b: best, kind: endKind(E, ROADS[best]) });
  }
  ROADS.forEach((o, j) => {
    if (j === idx) return;
    for (const e of ends(o)) {
      const E = e ? o.pts[o.pts.length - 1] : o.pts[0];
      if (inside(E, rd) && !JUNCTIONS.some(J => J.a === j && J.end === e)) JUNCTIONS.push({ d: E.clone(), a: j, end: e, b: idx, kind: endKind(E, rd) });
    }
  });
  if (rd.disc) return;
  // crossings: the middle of this road passing through another one
  const P = rd.pts, n = P.length;
  ROADS.forEach((o, j) => {
    if (j === idx || o.disc || o.deck || has(idx, j)) return;
    for (let k = 0; k < n; k++) {
      if (!rd.closed && (arc(P[k], P[0]) < rd.half + 1 || arc(P[k], P[n - 1]) < rd.half + 1)) continue;
      const q = closestOnRoad(P[k], o);
      if (q.dist > Math.min(o.half, rd.half) * 0.5) continue;
      const t = P[Math.min(n - 1, k + 1)].clone().sub(P[Math.max(0, k - 1)]).normalize();
      if (Math.abs(t.dot(q.tan)) > 0.8) continue;
      JUNCTIONS.push({ d: q.p.clone(), a: idx, b: j, kind: 'X' });
      return;
    }
  });
}
// lay a road: pts = centre-line directions. Options: half (half-width), closed, dashed,
// bulb ('start' | 'end' | 'both': a turning circle there), deck (drawn by its own structure),
// meet (false: leave the ends exactly where given), except (zones its curve may enter)
export function buildRoad(scene, pts, { half = 1.1, closed = false, dashed = true, bulb = null, meet = true, except = null, square = null } = {}) {
  pts = resample(pts, 0.6, closed);
  let disc = closed ? discOf(pts, half) : null;
  if (!disc) {
    fair(pts, closed);
    if (!closed && meet) {
      // a reshaped end may not cut into reserved ground (its own destination aside)
      const zonesOk = (cv) => cv.every(d => !zoneHit(d, half * 0.5, except));
      for (const e of [0, 1]) pts = meetSquare(pts, e, half, zonesOk);
      pts = fair(resample(pts, 0.6), false);
    }
  }
  // a turning circle: the road runs on to its middle (a circle set back from reserved ground
  // would otherwise leave the road's last stretch poking out past it)
  const circles = [];
  if (bulb && !closed) for (const e of bulb === 'both' ? [0, 1] : [bulb === 'start' ? 0 : 1]) {
    const tc = turningCircle(pts, e, half);
    if (tc.sb > 0.05) pts = trimEnd(pts, e, tc.sb);
    circles.push(tc);
  }
  // square: 'end' (or 'start'): that end is cut off square, not rounded — it runs a lap under paving
  // (a forecourt's front edge), so a round end would show past it
  const rd = { pts, half, closed, dashed: dashed && half > 0.8 && !disc, disc, square };
  ROADS.push(rd);
  noteJunctions(ROADS.length - 1);
  for (const tc of circles) {
    const ring = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, f = frame(tc.c); ring.push(f(Math.cos(a) * tc.r / 2, Math.sin(a) * tc.r / 2)); }
    ROADS.push({ pts: ring, half: tc.r / 2, closed: true, dashed: false, disc: { c: tc.c, r: tc.r }, bulb: true });
    noteJunctions(ROADS.length - 1);
  }
  return pts;
}

// ── the drawn network: one sheet from the distance field (see above) ──
// The planet is gridded as a cube (six faces, each a gnomonic grid of ~0.25-unit cells, so their
// shared edges meet point for point); only cells near a road are visited. Each cell is split in
// two triangles and each triangle clipped to the carriageway (field < 0) and the kerb band
// (0 … KERB); a point where the boundary crosses a grid edge is computed once from that edge,
// so neighbouring triangles — and the asphalt and the kerb — share it exactly (no cracks).
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(([x, y, z]) => {
  const nn = new THREE.Vector3(x, y, z), ax = x ? 1 : 0;
  return { n: nn, a: ax ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0), b: z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1) };
});
export function buildRoadSurface(scene) {
  const NG = Math.round(2 * R / 0.25), N1 = NG + 1;
  // ── the field's pieces: each road's centre line (a side road's stopped just inside the road it
  // meets), discs, and which pairs blend where ──
  const lines = ROADS.map((rd) => (rd.deck || rd.disc) ? null : rd.pts.slice());
  const cut = (i, e, b) => {                    // stop road i's end e just inside road b's near edge
    const P = lines[i]; if (!P || P.length < 3) return;
    const o = ROADS[b], lim = (o.disc ? o.disc.r : o.half) - 0.15;
    const dd = (d) => closestOnRoad(d, o).dist;
    const n = P.length; let k = e ? n - 1 : 0; const st = e ? -1 : 1;
    if (dd(P[k]) >= lim) return;
    while (k + st >= 0 && k + st < n && dd(P[k + st]) < lim) k += st;
    if (k + st < 0 || k + st >= n || Math.abs(k - (e ? n - 1 : 0)) > n - 3) return;
    let lo = P[k + st], hi = P[k];                                     // lo outside, hi inside
    for (let it = 0; it < 18; it++) { const m = slerpDir(lo, hi, 0.5); if (dd(m) < lim) hi = m; else lo = m; }
    lines[i] = e ? [...P.slice(0, k), hi] : [hi, ...P.slice(k + 1)];
  };
  for (const J of JUNCTIONS) if (J.kind === 'T' && !ROADS[J.b].deck) cut(J.a, J.end, J.b);
  const blends = JUNCTIONS.filter(J => !ROADS[J.a].deck && !ROADS[J.b].deck).map(J => ({ d: J.d, a: J.a, b: J.b,
    reach: Math.cos(((ROADS[J.a].disc?.r ?? ROADS[J.a].half) + (ROADS[J.b].disc?.r ?? ROADS[J.b].half) + FILLET + 1.2) / R) }));
  // segments into a coarse spatial hash (3D cells of 2 units)
  const HC = 2, segs = [], hash = new Map();
  const hk = (x, y, z) => ((Math.floor(x / HC) + 64) * 128 + (Math.floor(y / HC) + 64)) * 128 + (Math.floor(z / HC) + 64);
  // (the field matters out to the kerb band plus a fillet's reach: smin never sits more than
  // FILLET/4 under the nearer road's distance; the hash keeps every segment within a blend's reach)
  const REACH = KERB + FILLET * 0.25 + 0.15, HPAD = KERB + FILLET + 0.25;
  const addSeg = (s) => {
    const id = segs.length; segs.push(s);
    const pad = s.h + HPAD;
    const lo = [Math.min(s.ax, s.bx) - pad, Math.min(s.ay, s.by) - pad, Math.min(s.az, s.bz) - pad];
    const hi = [Math.max(s.ax, s.bx) + pad, Math.max(s.ay, s.by) + pad, Math.max(s.az, s.bz) + pad];
    for (let x = Math.floor(lo[0] / HC); x <= Math.floor(hi[0] / HC); x++) for (let y = Math.floor(lo[1] / HC); y <= Math.floor(hi[1] / HC); y++) for (let z = Math.floor(lo[2] / HC); z <= Math.floor(hi[2] / HC); z++) {
      const k = ((x + 64) * 128 + (y + 64)) * 128 + (z + 64); let a = hash.get(k); if (!a) hash.set(k, a = []); a.push(id);
    }
  };
  ROADS.forEach((rd, i) => {
    if (rd.deck) return;
    if (rd.disc) { const c = rd.disc.c.clone().multiplyScalar(R); addSeg({ road: i, h: rd.disc.r, ax: c.x, ay: c.y, az: c.z, bx: c.x, by: c.y, bz: c.z }); return; }
    const P = lines[i], n = P.length, m = rd.closed ? n : n - 1;
    for (let k = 0; k < m; k++) { const a = P[k], b = P[(k + 1) % n]; addSeg({ road: i, h: rd.half, ax: a.x * R, ay: a.y * R, az: a.z * R, bx: b.x * R, by: b.y * R, bz: b.z * R,
      fa: !rd.closed && k === 0 && rd.square === 'start', fb: !rd.closed && k === m - 1 && rd.square === 'end' }); }
  });
  // the pads: each its own piece, blended with every road and pad it touches
  PADS.forEach((P, k) => {
    const c = P.c.clone().multiplyScalar(R), i = ROADS.length + k;
    addSeg({ road: i, h: Math.hypot(P.hx, P.hz), ax: c.x, ay: c.y, az: c.z, bx: c.x, by: c.y, bz: c.z, pad: P });
    const reach = Math.cos((Math.hypot(P.hx, P.hz) + 1.2 + FILLET + 1.5) / R);
    ROADS.forEach((rd, j) => {
      if (rd.deck) return;
      const touches = rd.disc ? padDist(P, rd.disc.c) < rd.disc.r + 0.3 : rd.pts.some(q => padDist(P, q) < rd.half + 0.3);
      if (touches) blends.push({ d: P.c, a: j, b: i, reach });
    });
    PADS.forEach((Q, m) => { if (m < k && padDist(P, Q.c) < Math.hypot(Q.hx, Q.hz) + 0.3) blends.push({ d: P.c, a: ROADS.length + m, b: i, reach }); });
  });
  const dRoad = new Float64Array(ROADS.length + PADS.length).fill(1e9), touched = [];
  const field = (v) => {                                              // v: unit dir → signed distance to the carriageway's edge
    const x = v.x * R, y = v.y * R, z = v.z * R, list = hash.get(hk(x, y, z));
    if (!list) return 1e9;
    for (const id of list) {
      const s = segs[id];
      const abx = s.bx - s.ax, aby = s.by - s.ay, abz = s.bz - s.az, l2 = abx * abx + aby * aby + abz * abz;
      const t0 = l2 > 1e-12 ? ((x - s.ax) * abx + (y - s.ay) * aby + (z - s.az) * abz) / l2 : 0, t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
      const dx = x - s.ax - abx * t, dy = y - s.ay - aby * t, dz = z - s.az - abz * t;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz) - s.h;
      if (s.pad) d = padDist(s.pad, v);
      else if ((s.fb && t0 > 1) || (s.fa && t0 < 0)) {                     // a square end: a box past it, not a round cap
        const over = (t0 > 1 ? t0 - 1 : -t0) * Math.sqrt(l2), ex = x - s.ax - abx * t0, ey = y - s.ay - aby * t0, ez = z - s.az - abz * t0;
        d = Math.max(Math.sqrt(ex * ex + ey * ey + ez * ez) - s.h, over);
      }
      if (dRoad[s.road] === 1e9) touched.push(s.road);
      if (d < dRoad[s.road]) dRoad[s.road] = d;
    }
    let f = 1e9; for (const r of touched) if (dRoad[r] < f) f = dRoad[r];
    for (const B of blends) if (v.dot(B.d) > B.reach && dRoad[B.a] < 1e8 && dRoad[B.b] < 1e8) f = Math.min(f, smin(dRoad[B.a], dRoad[B.b]));
    for (const r of touched) dRoad[r] = 1e9; touched.length = 0;
    return f;
  };
  // ── the cells to visit: every cell within reach of a road (index-space boxes round samples
  // along every segment; a box that spills over a face's edge is marked on that face too) ──
  const cells = new Set(), CS = R * 2 / NG;
  const faceOf = (v) => { let f = 0, m = -2; for (let k = 0; k < 6; k++) { const dd = v.dot(FACES[k].n); if (dd > m) { m = dd; f = k; } } return f; };
  const _m1 = new THREE.Vector3(), _m2 = new THREE.Vector3(), _mq = new THREE.Vector3();
  const markAround = (c, rr) => {
    _m1.crossVectors(c, Math.abs(c.y) < 0.9 ? UP : new THREE.Vector3(1, 0, 0)).normalize(); _m2.crossVectors(c, _m1);
    const fs = new Set([faceOf(c)]);
    for (let a = 0; a < 8; a++) fs.add(faceOf(_mq.copy(c).multiplyScalar(R).addScaledVector(_m1, Math.cos(a * Math.PI / 4) * rr * 1.45).addScaledVector(_m2, Math.sin(a * Math.PI / 4) * rr * 1.45).normalize()));
    for (const f of fs) {
      const F = FACES[f], m = c.dot(F.n); if (m < 0.3) continue;
      const u = c.dot(F.a) / m, w = c.dot(F.b) / m, q = 1 + u * u + w * w;
      const ri = Math.ceil(rr / (CS * Math.sqrt(1 + w * w) / q)) + 1, rj = Math.ceil(rr / (CS * Math.sqrt(1 + u * u) / q)) + 1;
      const ic = Math.floor((u + 1) / 2 * NG), jc = Math.floor((w + 1) / 2 * NG);
      for (let j = Math.max(0, jc - rj); j <= Math.min(NG - 1, jc + rj); j++)
        for (let i = Math.max(0, ic - ri); i <= Math.min(NG - 1, ic + ri); i++) cells.add((f * NG + j) * NG + i);
    }
  };
  for (const s of segs) {
    const A = new THREE.Vector3(s.ax, s.ay, s.az), B = new THREE.Vector3(s.bx, s.by, s.bz), L = A.distanceTo(B), rr = s.h + REACH + 0.15;
    const steps = Math.max(1, Math.ceil(L / 0.5));
    for (let q = 0; q <= steps; q++) markAround(A.clone().lerp(B, q / steps).normalize(), rr);
  }
  // ── grid vertices: direction, field, draped height, bare ground ──
  const GV = new Map();
  const gdir = (f, i, j) => { const F = FACES[f]; return F.n.clone().addScaledVector(F.a, -1 + 2 * i / NG).addScaledVector(F.b, -1 + 2 * j / NG).normalize(); };
  const ground = new Map();
  const gRad = (f, i, j) => { const k = (f * N1 + j) * N1 + i; let r = ground.get(k); if (r === undefined) ground.set(k, r = radiusAt(gdir(f, i, j))); return r; };
  const gv = (f, i, j) => {
    const k = (f * N1 + j) * N1 + i; let o = GV.get(k);
    if (o) return o;
    const d = gdir(f, i, j);
    // the sheet lies on the highest ground within ~0.5 (two cells), as the old ribbons did: on a
    // concave slope it never dips under the planet's own flat triangles
    let h = gRad(f, i, j);
    for (const [di, dj] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii <= NG && jj <= NG) h = Math.max(h, gRad(f, ii, jj)); }
    GV.set(k, o = { id: k, d, s: field(d), h, g: gRad(f, i, j) });
    return o;
  };
  // ── clip and emit ──
  const pos = [], col = [], idx = [], skirt = [], vmap = new Map();
  const C_ROAD = new THREE.Color(PAL.road), C_KERB = new THREE.Color(PAL.kerb), C_SIDE = new THREE.Color(PAL.kerb).multiplyScalar(0.78);
  const lift = (s, cls) => cls ? 0.06 - 0.02 * Math.min(1, Math.max(0, s / KERB)) : 0.06;
  const emit = (P, cls) => {                                          // P: a clip point; cls 0 road, 1 kerb
    const key = P.key + '|' + cls; let id = vmap.get(key);
    if (id !== undefined) return id;
    id = pos.length / 3; vmap.set(key, id);
    const r = P.h + lift(P.s, cls);
    pos.push(P.d.x * r, P.d.y * r, P.d.z * r);
    const c = cls ? C_KERB : C_ROAD; col.push(c.r, c.g, c.b);
    return id;
  };
  // a point at `level` on the grid edge between vertices g1 and g2 (canonical: lower id first)
  const onEdge = (g1, g2, level) => {
    if (g1.id > g2.id) [g1, g2] = [g2, g1];
    const t = (level - g1.s) / (g2.s - g1.s);
    return { key: g1.id + ':' + g2.id + ':' + level, e: [g1, g2], s: level, t,
      d: g1.d.clone().lerp(g2.d, t).normalize(), h: g1.h + (g2.h - g1.h) * t, g: g1.g + (g2.g - g1.g) * t };
  };
  const gpt = (g) => ({ key: 'g' + g.id, e: null, v: g, s: g.s, d: g.d, h: g.h, g: g.g });
  const edgeOf = (P, Q) => {                                          // the grid edge a polygon edge lies on
    const ep = P.e || null, eq = Q.e || null;
    if (P.v && Q.v) return [P.v, Q.v];
    if (P.v && eq && (eq[0] === P.v || eq[1] === P.v)) return eq;
    if (Q.v && ep && (ep[0] === Q.v || ep[1] === Q.v)) return ep;
    if (ep && eq && ep[0] === eq[0] && ep[1] === eq[1]) return ep;
    return null;
  };
  // Sutherland–Hodgman against one level: keep the side where (s − level) · sign < 0
  const clip = (poly, level, sign, contour) => {
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const P = poly[k], Q = poly[(k + 1) % poly.length];
      const pin = (P.s - level) * sign < 0, qin = (Q.s - level) * sign < 0;
      if (pin) out.push(P);
      if (pin !== qin) {
        const e = edgeOf(P, Q);
        let X;
        if (e) X = onEdge(e[0], e[1], level);
        else { const t = (level - P.s) / (Q.s - P.s); X = { key: P.key + '~' + Q.key + ':' + level, e: null, s: level, d: P.d.clone().lerp(Q.d, t).normalize(), h: P.h + (Q.h - P.h) * t, g: P.g + (Q.g - P.g) * t }; }
        out.push(X); if (contour) contour.push(X);
      }
    }
    return out;
  };
  const part = [];                                                  // per triangle: 2 asphalt, 1 kerb, 0 skirt (for dev audits)
  const fan = (poly, cls) => { if (poly.length < 3) return; const ids = poly.map(P => emit(P, cls)); for (let k = 1; k < ids.length - 1; k++) { idx.push(ids[0], ids[k], ids[k + 1]); part.push(cls ? 1 : 2); } };
  const tri = (A, B, C) => {
    if (A.s >= KERB && B.s >= KERB && C.s >= KERB) return;
    const T = [gpt(A), gpt(B), gpt(C)];
    if (A.s < 0 && B.s < 0 && C.s < 0) { fan(T, 0); return; }
    fan(clip(T, 0, 1), 0);
    const k1 = clip(T, 0, -1), contour = [];
    const k2 = clip(k1, KERB, 1, contour);
    fan(k2, 1);
    if (contour.length === 2) skirt.push(contour[0], contour[1]);
  };
  for (const c of cells) {
    const i = c % NG, j = Math.floor(c / NG) % NG, f = Math.floor(c / (NG * NG));
    const a = gv(f, i, j), b = gv(f, i + 1, j), cc = gv(f, i + 1, j + 1), d = gv(f, i, j + 1);
    tri(a, b, cc); tri(a, cc, d);
  }
  // the skirt: from the kerb's outer edge down into the ground, so the sheet never shows a gap under its edge
  for (let k = 0; k < skirt.length; k += 2) {
    const P = skirt[k], Q = skirt[k + 1], base = pos.length / 3;
    for (const X of [P, Q]) { const top = X.h + lift(KERB, 1), bot = Math.min(X.g, X.h) - 0.06; pos.push(X.d.x * top, X.d.y * top, X.d.z * top, X.d.x * bot, X.d.y * bot, X.d.z * bot); }
    for (let q = 0; q < 4; q++) col.push(C_SIDE.r, C_SIDE.g, C_SIDE.b);
    idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3); part.push(0, 0);
  }
  // every triangle wound to face up (out from the planet): the sheet is double-sided, and a
  // back-facing triangle has its normal turned over in the shader — drawn dark
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * pos[a] + ny * pos[a + 1] + nz * pos[a + 2] < 0) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
  }
  // normals over the whole sheet at once (no shading seams where it is split up)
  const all = new THREE.BufferGeometry();
  all.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); all.setIndex(idx); all.computeVertexNormals();
  const nor = all.attributes.normal.array;
  // split into ~16-unit chunks, so the culler can skip what is over the horizon
  const CH = 16, chunks = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const k = hk((pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3 * HC / CH, (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3 * HC / CH, (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3 * HC / CH);
    let L = chunks.get(k); if (!L) chunks.set(k, L = { v: [], p: [] }); L.v.push(a, b, c); L.p.push(part[t / 3]);
  }
  const meshes = [];
  for (const { v: L, p: parts } of chunks.values()) {
    const remap = new Map(), P = [], Nn = [], Cc = [], I = [];
    for (const v of L) {
      let id = remap.get(v);
      if (id === undefined) { id = P.length / 3; remap.set(v, id); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); Nn.push(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]); Cc.push(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]); }
      I.push(id);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.setIndex(I); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, roadMat);
    m.name = 'roads'; m.userData.noInk = true; m.userData.roadPart = 'sheet'; m.userData.triPart = Uint8Array.from(parts);
    scene.add(m); meshes.push(m);
  }
  SHEET.meshes = meshes;
  return meshes;
}
export const SHEET = { meshes: [] };

// ── centre lines, painted once every road exists ──
// Straight dashes at an even spacing along each road's length (never bent round a
// sample corner). None inside a junction: a dash stops well short of where another road's
// carriageway (and its kerb return) begins, and where two roads run on top of each other only
// the first-built one is painted — so lines never double up, kink or form L shapes. All of
// them are one mesh.
export function paintRoadMarkings(scene) {
  const DASH = 0.8, GAP = 1.1, W = 0.07;
  const near = (d, i, tang) => {
    for (let j = 0; j < ROADS.length; j++) {
      if (j === i) continue;
      const o = ROADS[j];
      if (o.disc) { if (arc(d, o.disc.c) < o.disc.r + 1.0) return true; continue; }
      for (let k = 0; k < o.pts.length; k++) {
        if (arc(d, o.pts[k]) >= o.half + 1.1) continue;                 // clear of its kerb return
        const ot = o.pts[Math.min(k + 1, o.pts.length - 1)].clone().sub(o.pts[Math.max(k - 1, 0)]).normalize();
        if (j < i || Math.abs(ot.dot(tang)) < 0.9) return true;          // a crossing, or an earlier road on the same line
      }
    }
    return false;
  };
  const pos = [], idx = [];
  ROADS.forEach((rd, i) => {
    if (!rd.dashed) return;
    const P = rd.closed ? [...rd.pts, rd.pts[0]] : rd.pts;
    const cum = [0]; for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + arc(P[k - 1], P[k]));
    const total = cum[cum.length - 1];
    const at = (s) => { let k = 1; while (k < cum.length - 1 && cum[k] < s) k++; const t = (s - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]); return slerpDir(P[k - 1], P[k], THREE.MathUtils.clamp(t, 0, 1)); };
    for (let s = GAP / 2; s + DASH < total - GAP / 2; s += DASH + GAP) {
      const c = at(s + DASH / 2), a = at(s), b = at(s + DASH);
      const tang = b.clone().sub(a).normalize();
      if (near(c, i, tang) || near(a, i, tang) || near(b, i, tang)) continue;
      const lat = new THREE.Vector3().crossVectors(c, tang).normalize();
      const base = pos.length / 3;
      for (let u = 0; u <= 6; u++) {                           // a straight dash, draped in 6 steps along its length
        const along = (u / 6 - 0.5) * DASH;
        for (const sx of [-1, 1]) {
          const d = c.clone().multiplyScalar(R).addScaledVector(tang, along).addScaledVector(lat, sx * W).normalize();
          // never below the road's own top (the sheet's drape + its 0.06 lift): a ray slipping
          // through a seam to the grass sank one corner and notched the dash
          pos.push(...d.multiplyScalar(Math.max(standAt(d), roadTop(d)) + 0.016).toArray());
        }
      }
      for (let u = 0; u < 6; u++) { const q = base + u * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
  });
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, dashMat); m.userData.noInk = true; m.userData.noGround = true; m.userData.roadPart = 'dash'; m.name = 'road-dashes';
  scene.add(m);
  return m;
}

// ── the DRAWN ground: the planet mesh's own surface along a direction. radiusAt is the exact
// terrain, but the mesh cuts straight across it between its vertices (~0.75 apart) — where the
// ground curves hard (a levelled site's edge easing into the hills) the drawn ground sits a
// little below it, and anything laid on radiusAt there hovers. Landscaping lays onto this. ──
let DG = null;
function indexDrawnGround(geo) {
  const pos = geo.attributes.position, idx = geo.index, P = Float32Array.from(pos.array), CELL = 0.02, buckets = new Map();
  const n = idx ? idx.count / 3 : pos.count / 3, tri = new Uint32Array(n * 3);
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) tri[t * 3 + k] = idx ? idx.getX(t * 3 + k) : t * 3 + k;
  for (let t = 0; t < n; t++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { const i = tri[t * 3 + k] * 3; x += P[i]; y += P[i + 1]; z += P[i + 2]; }
    const l = Math.hypot(x, y, z), key = `${Math.floor(x / l / CELL)},${Math.floor(y / l / CELL)},${Math.floor(z / l / CELL)}`;
    let a = buckets.get(key); if (!a) buckets.set(key, a = []); a.push(t);
  }
  DG = { P, tri, buckets, CELL };
}
export function drawnGroundAt(d) {
  if (!DG) return radiusAt(d);
  const { P, tri, buckets, CELL } = DG, l = d.length(), dx = d.x / l, dy = d.y / l, dz = d.z / l;
  const fx = Math.floor(dx / CELL), fy = Math.floor(dy / CELL), fz = Math.floor(dz / CELL);
  let best = -1;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    const arr = buckets.get(`${fx + i},${fy + j},${fz + k}`); if (!arr) continue;
    for (const t of arr) {                     // a ray from the centre through the triangle (Möller–Trumbore)
      const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
      const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
      const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz; if (Math.abs(det) < 1e-12) continue;
      const tx = -P[a], ty = -P[a + 1], tz = -P[a + 2];
      const u = (tx * px + ty * py + tz * pz) / det; if (u < -1e-6 || u > 1 + 1e-6) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const w = (dx * qx + dy * qy + dz * qz) / det; if (w < -1e-6 || u + w > 1 + 1e-6) continue;
      const r = (e2x * qx + e2y * qy + e2z * qz) / det; if (r > best) best = r;
    }
  }
  return best > 0 ? best : radiusAt(d);
}

// ── the planet mesh: painted in posterized bands with a watercolour wobble ──
// the ground's paint at a point (direction v, height h): the planet's own bands, and a river or
// lake bed a smooth sand → pebble → deep gradient by depth. Shared by the planet and the fine
// riverbed mesh (riverlife.js) so their colours meet without a seam
const _GC = {}, GC = (hex) => (_GC[hex] ??= new THREE.Color(hex));
export function groundColour(v, h, c, fresh = h < SEA + 0.02 && inFreshWater(v)) {
  const wash = Math.sin(v.x * 7.1 + 1.3) * Math.sin(v.z * 6.3 + 0.2) + Math.sin(v.y * 9.7) * 0.5;   // a slow watercolour wash, posterized into bands
  if (fresh) {
    const dd = -h;
    return c.copy(GC(PAL.sand)).lerp(GC(0xbfae84), ss(0.02, 0.35, dd)).lerp(GC(0x8fa38e), ss(0.4, 0.85, dd));
  }
  if (h < SEA - 0.05) return c.copy(GC(PAL.waterDeep));
  if (h < SEA + 0.22) return c.copy(GC(PAL.sand));
  if (h > 1.4 && !inLawn(v, wash)) {
    if (h > 2.6) return c.copy(GC(PAL.snow));
    return c.copy(GC(PAL.rock)).lerp(GC(PAL.earth), wash > 0 ? 0.3 : 0);
  }
  return c.copy(GC(wash > 0.45 ? PAL.meadow : wash < -0.5 ? PAL.grassDeep : PAL.grass));
}
// A levelled site that asked for a lawn (flatten { lawn: true }) is painted grass however high
// it stands. The bands above go by height alone (over 1.4 is rock/earth, over 2.6 snow), and a
// site levelled to a true PLANE on a hilltop sits high: Makers' Row's plane touches the planet at
// ~1.2 and rises off the sphere toward its rim (~2.9 at r 11), so its whole yard and easing ring
// came out bare beige "earth" round the car park. Opt-in, so no other site changes. The lawn
// reaches into the easing ring by a wash-wobbled amount, so where it meets the natural hillside's
// colour the edge is soft and irregular, not a drawn circle.
function inLawn(v, wash) {
  for (const f of extraFlats) {
    if (!f.lawn) continue;
    const blend = f.blend ?? (f.plane ? 9 : 5);
    if (arc(v, f.d) < f.r + blend * (0.72 + 0.14 * wash)) return true;
  }
  return false;
}
export let groundMaterial = null;
export function buildPlanet(scene) {
  let g = mergeVertices(new THREE.IcosahedronGeometry(R, 56));
  const p = g.attributes.position, v = new THREE.Vector3();
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const h = surfH(v), fresh = h < SEA + 0.02 && inFreshWater(v);
    // under a river or lake the coarse planet sinks well out of sight: the fine bed mesh
    // (riverlife.js) is the bed you see — the planet's big triangles showed through the clear
    // water as starbursts and jagged blotches
    const r = R + h - (fresh ? 1.6 : 0);
    p.setXYZ(i, v.x * r, v.y * r, v.z * r);
    groundColour(v, h, c, fresh);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, groundMaterial = paint(0xffffff, { vertexColors: true, hatch: 0.6 }));
  mesh.userData.noInk = true;          // the ground's edge is the horizon; ink it with the rim below
  mesh.name = 'planet';
  indexDrawnGround(g);
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
