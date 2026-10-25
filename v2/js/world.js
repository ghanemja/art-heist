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
export function addFloor(obj, test) { obj.updateWorldMatrix(true, false); FLOORS.push({ obj, test, inv: obj.matrixWorld.clone().invert(), dir: obj.position.clone().normalize(), reach: 12 }); }
const _fp = new THREE.Vector3();
export function groundAt(d) {
  let r = radiusAt(d);
  for (const f of FLOORS) {
    if (f.dir.dot(d) < 0.95) continue;
    _fp.copy(d).multiplyScalar(r).applyMatrix4(f.inv);
    const y = f.test(_fp.x, _fp.z);
    if (y != null) r = Math.max(r, f.obj.position.length() + y);
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
export const standAt = (d) => groundAt(d) + roadLift(d);
export function onRoad(d, pad = 0) {
  for (const rd of ROADS) for (const p of rd.pts) if (arc(d, p) < rd.half + pad) return true;
  return false;
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
  const pos = [], idx = [], lat = new THREE.Vector3();
  const n = pts.length, N = closed ? n + 1 : n;
  for (let k = 0; k < N; k++) {
    const i = k % n;
    const d = pts[i], dn = pts[closed ? (i + 1) % n : Math.min(i + 1, n - 1)], dp = pts[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
    const tang = dn.clone().sub(dp).normalize();
    lat.crossVectors(d, tang).normalize();
    const r = radiusAt(d) + lift;
    const c = d.clone().multiplyScalar(r);
    pos.push(...c.clone().addScaledVector(lat, half).toArray(), ...c.clone().addScaledVector(lat, -half).toArray());
  }
  for (let k = 0; k < N - 1; k++) {
    if (dashed && (k % 3) !== 0) continue;
    const a = k * 2, b = a + 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
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
  ROADS.push({ pts, half });
  const g = new THREE.Group();
  g.add(ribbon(pts, half + 0.28, 0.035, closed, kerbMat));
  g.add(ribbon(pts, half, 0.05, closed, roadMat));
  if (dashed && half > 0.8) g.add(ribbon(pts, 0.07, 0.065, closed, dashMat, true));
  scene.add(g);
  return pts;
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
