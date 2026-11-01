// ─── RAY GRID: an acceleration structure for raycasts against big static meshes ──────────
// three's Mesh.raycast tests EVERY triangle of a mesh its ray reaches (after a bounding-sphere
// and -box check). The build drops tens of thousands of short rays (standAt's walk rays, the
// road dashes, the car-park lots onto the road sheet, the footpaths) onto meshes of 10k–100k
// triangles: ~4 s of the load. Here each geometry with enough triangles gets a uniform grid
// of its triangles (by their bounding boxes, in the geometry's own space) the first time a ray
// reaches it, and a ray only tests the triangles in the cells its segment [near, far] passes
// through (a 3D DDA walk), in index order, with three's own per-triangle test — so the hits,
// their order, points, distances, normals and uvs are exactly what three would return.
// The grid is rebuilt if the position or index attribute changes (its version). Meshes that
// three draws differently from their buffers (skinned, morphed, groups of materials, a partial
// draw range, interleaved buffers) keep three's own path.
import * as THREE from 'three';

const MIN_TRIS = 192;                       // below this the plain loop is as quick
const base = THREE.Mesh.prototype._computeIntersections;
const plainVP = THREE.Mesh.prototype.getVertexPosition;
const GRIDS = new WeakMap();

function build(geo) {
  const P = geo.attributes.position.array, I = geo.index ? geo.index.array : null;
  const nt = Math.floor((I ? geo.index.count : geo.attributes.position.count) / 3);
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const n = geo.attributes.position.count;
  for (let i = 0; i < n * 3; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const ex = [x1 - x0, y1 - y0, z1 - z0], big = Math.max(...ex, 1e-6);
  // cells: about one per two triangles, sized on the two widest sides (most meshes here are flat)
  const s2 = [...ex].sort((a, b) => b - a);
  let s = Math.sqrt(Math.max(s2[0] * s2[1], big * big * 1e-6) / Math.max(1, nt / 2));
  s = Math.max(s, big / 256);
  const pad = s * 1e-3 + big * 1e-7;
  x0 -= pad; y0 -= pad; z0 -= pad;
  const nx = Math.max(1, Math.ceil((ex[0] + 2 * pad) / s)), ny = Math.max(1, Math.ceil((ex[1] + 2 * pad) / s)), nz = Math.max(1, Math.ceil((ex[2] + 2 * pad) / s));
  const NC = nx * ny * nz, inv = 1 / s;
  // each triangle's cell range, once (a triangle spanning a great many cells goes on a list
  // every ray tests instead)
  const RG = new Int32Array(nt * 6), count = new Int32Array(NC + 1), always = [];
  for (let t = 0; t < nt; t++) {
    const i0 = I ? I[t * 3] * 3 : t * 9, i1 = I ? I[t * 3 + 1] * 3 : t * 9 + 3, i2 = I ? I[t * 3 + 2] * 3 : t * 9 + 6;
    const ax = Math.min(P[i0], P[i1], P[i2]), bx = Math.max(P[i0], P[i1], P[i2]);
    const ay = Math.min(P[i0 + 1], P[i1 + 1], P[i2 + 1]), by = Math.max(P[i0 + 1], P[i1 + 1], P[i2 + 1]);
    const az = Math.min(P[i0 + 2], P[i1 + 2], P[i2 + 2]), bz = Math.max(P[i0 + 2], P[i1 + 2], P[i2 + 2]);
    let c0 = Math.floor((ax - pad - x0) * inv), c1 = Math.floor((bx + pad - x0) * inv);
    let c2 = Math.floor((ay - pad - y0) * inv), c3 = Math.floor((by + pad - y0) * inv);
    let c4 = Math.floor((az - pad - z0) * inv), c5 = Math.floor((bz + pad - z0) * inv);
    if (c0 < 0) c0 = 0; if (c1 >= nx) c1 = nx - 1; if (c2 < 0) c2 = 0; if (c3 >= ny) c3 = ny - 1; if (c4 < 0) c4 = 0; if (c5 >= nz) c5 = nz - 1;
    const o = t * 6;
    if ((c1 - c0 + 1) * (c3 - c2 + 1) * (c5 - c4 + 1) > 64) { RG[o] = -1; always.push(t); continue; }
    RG[o] = c0; RG[o + 1] = c1; RG[o + 2] = c2; RG[o + 3] = c3; RG[o + 4] = c4; RG[o + 5] = c5;
    for (let i = c0; i <= c1; i++) for (let j = c2; j <= c3; j++) for (let k = c4; k <= c5; k++) count[(i * ny + j) * nz + k + 1]++;
  }
  for (let c = 0; c < NC; c++) count[c + 1] += count[c];
  const list = new Int32Array(count[NC]), fill = count.slice(0, NC);
  for (let t = 0; t < nt; t++) {
    const o = t * 6; if (RG[o] < 0) continue;
    for (let i = RG[o]; i <= RG[o + 1]; i++) for (let j = RG[o + 2]; j <= RG[o + 3]; j++) for (let k = RG[o + 4]; k <= RG[o + 5]; k++) list[fill[(i * ny + j) * nz + k]++] = t;
  }
  return {
    pos: geo.attributes.position, pv: geo.attributes.position.version, idx: geo.index, iv: geo.index ? geo.index.version : -1,
    x0, y0, z0, s, inv, nx, ny, nz, start: count, list, always: Int32Array.from(always),
    stamp: new Uint32Array(nt), tick: 0, nt, box: [x0, y0, z0, x0 + nx * s, y0 + ny * s, z0 + nz * s],
  };
}

// (a geometry whose buffers keep changing — something animated — is left to three's loop: a grid
// rebuilt for every ray would cost more than it saves)
const CHANGING = new WeakSet();
// (and only for a geometry rays keep reaching: building one costs about as much as ~20 rays
// through three's loop, which gives the same answer)
const RAYS = new WeakMap(), WARM = 6;
export const raygridStats = { builds: 0, ms: 0, tris: 0 };
function gridOf(geo) {
  let G = GRIDS.get(geo);
  if (!G) { const n = (RAYS.get(geo) || 0) + 1; RAYS.set(geo, n); if (n < WARM) return null; }
  if (!G || G.pos !== geo.attributes.position || G.pv !== geo.attributes.position.version || G.idx !== geo.index || G.iv !== (geo.index ? geo.index.version : -1)) {
    if (G && (G.rebuilt = (G.rebuilt || 0) + 1) > 2) { CHANGING.add(geo); GRIDS.delete(geo); return null; }
    const t = performance.now(), was = G?.rebuilt || 0;
    G = build(geo); G.rebuilt = was; GRIDS.set(geo, G);
    raygridStats.builds++; raygridStats.ms += performance.now() - t; raygridStats.tris += G.nt;
  }
  return G;
}

const _w = new THREE.Vector3(), _l = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _cand = [];
// the triangles in the cells the local ray passes through for t in [t0, t1]: into _cand, sorted
function gather(G, O, D, t0, t1) {
  _cand.length = 0;
  // clip to the grid's box
  const B = G.box, o = [O.x, O.y, O.z], d = [D.x, D.y, D.z];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < B[a] || o[a] > B[a + 3]) return; continue; }
    let ta = (B[a] - o[a]) / d[a], tb = (B[a + 3] - o[a]) / d[a];
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
  }
  if (t0 > t1) return;
  if (++G.tick === 0xffffffff) { G.stamp.fill(0); G.tick = 1; }
  const tk = G.tick, st = G.stamp;
  for (const t of G.always) { st[t] = tk; _cand.push(t); }
  // 3D DDA from the clipped entry point
  const n = [G.nx, G.ny, G.nz], g0 = [G.x0, G.y0, G.z0], s = G.s;
  const c = [0, 0, 0], step = [0, 0, 0], tMax = [0, 0, 0], tDel = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const p = o[a] + d[a] * t0;
    c[a] = Math.min(n[a] - 1, Math.max(0, Math.floor((p - g0[a]) / s)));
    if (d[a] > 1e-12) { step[a] = 1; tMax[a] = (g0[a] + (c[a] + 1) * s - o[a]) / d[a]; tDel[a] = s / d[a]; }
    else if (d[a] < -1e-12) { step[a] = -1; tMax[a] = (g0[a] + c[a] * s - o[a]) / d[a]; tDel[a] = -s / d[a]; }
    else { step[a] = 0; tMax[a] = Infinity; tDel[a] = Infinity; }
  }
  const { start, list, ny, nz } = G;
  for (let guard = 0; guard < 100000; guard++) {
    const cell = (c[0] * ny + c[1]) * nz + c[2];
    for (let q = start[cell], e = start[cell + 1]; q < e; q++) { const t = list[q]; if (st[t] !== tk) { st[t] = tk; _cand.push(t); } }
    // next cell: the axis whose boundary comes first
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    if (tMax[a] > t1) break;
    c[a] += step[a]; if (c[a] < 0 || c[a] >= n[a]) break;
    tMax[a] += tDel[a];
  }
  _cand.sort((a, b) => a - b);
}

// three's checkGeometryIntersection / checkIntersection, verbatim in effect
const _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _vC = new THREE.Vector3(), _pt = new THREE.Vector3(), _pw = new THREE.Vector3();
const _uA = new THREE.Vector2(), _uB = new THREE.Vector2(), _uC = new THREE.Vector2();
const _nA = new THREE.Vector3(), _nB = new THREE.Vector3(), _nC = new THREE.Vector3();
function hit(object, material, raycaster, ray, uv, uv1, normal, a, b, c) {
  const pos = object.geometry.attributes.position;
  _vA.fromBufferAttribute(pos, a); _vB.fromBufferAttribute(pos, b); _vC.fromBufferAttribute(pos, c);
  const ok = material.side === THREE.BackSide ? ray.intersectTriangle(_vC, _vB, _vA, true, _pt) : ray.intersectTriangle(_vA, _vB, _vC, material.side === THREE.FrontSide, _pt);
  if (ok === null) return null;
  _pw.copy(_pt).applyMatrix4(object.matrixWorld);
  const distance = raycaster.ray.origin.distanceTo(_pw);
  if (distance < raycaster.near || distance > raycaster.far) return null;
  const I = { distance, point: _pw.clone(), object };
  if (uv) { _uA.fromBufferAttribute(uv, a); _uB.fromBufferAttribute(uv, b); _uC.fromBufferAttribute(uv, c); I.uv = THREE.Triangle.getInterpolation(_pt, _vA, _vB, _vC, _uA, _uB, _uC, new THREE.Vector2()); }
  if (uv1) { _uA.fromBufferAttribute(uv1, a); _uB.fromBufferAttribute(uv1, b); _uC.fromBufferAttribute(uv1, c); I.uv1 = THREE.Triangle.getInterpolation(_pt, _vA, _vB, _vC, _uA, _uB, _uC, new THREE.Vector2()); I.uv2 = I.uv1; }
  if (normal) {
    _nA.fromBufferAttribute(normal, a); _nB.fromBufferAttribute(normal, b); _nC.fromBufferAttribute(normal, c);
    I.normal = THREE.Triangle.getInterpolation(_pt, _vA, _vB, _vC, _nA, _nB, _nC, new THREE.Vector3());
    if (I.normal.dot(ray.direction) > 0) I.normal.multiplyScalar(-1);
  }
  const face = { a, b, c, normal: new THREE.Vector3(), materialIndex: 0 };
  THREE.Triangle.getNormal(_vA, _vB, _vC, face.normal);
  I.face = face;
  return I;
}

function eligible(mesh) {
  const g = mesh.geometry, p = g.attributes.position;
  if (!p || !p.array || p.isInterleavedBufferAttribute || p.itemSize !== 3 || Array.isArray(mesh.material)) return false;
  if (mesh.isSkinnedMesh || mesh.getVertexPosition !== plainVP || g.morphAttributes.position) return false;
  if (g.index && (!g.index.array || g.index.isInterleavedBufferAttribute)) return false;
  const n = g.index ? g.index.count : p.count;
  if (n < MIN_TRIS * 3 || g.drawRange.start !== 0 || g.drawRange.count < n) return false;
  return true;
}

THREE.Mesh.prototype._computeIntersections = function (raycaster, intersects, rayLocal) {
  if (!eligible(this) || CHANGING.has(this.geometry)) return base.call(this, raycaster, intersects, rayLocal);
  const G = gridOf(this.geometry), geo = this.geometry;
  if (!G) return base.call(this, raycaster, intersects, rayLocal);
  // the segment [near, far] of the world ray, in the local ray's parameter
  _inv.copy(this.matrixWorld).invert();
  const O = rayLocal.origin, D = rayLocal.direction;
  let t0 = -Infinity, t1 = Infinity;
  if (raycaster.near > 0) t0 = _l.copy(raycaster.ray.at(raycaster.near, _w)).applyMatrix4(_inv).sub(O).dot(D);
  if (Number.isFinite(raycaster.far)) t1 = _l.copy(raycaster.ray.at(raycaster.far, _w)).applyMatrix4(_inv).sub(O).dot(D);
  // (a little slack either way: the exact near/far test is three's own, per hit)
  const sl = G.s * 0.01; t0 = Math.max(0, t0) - sl; t1 += sl;
  gather(G, O, D, t0, t1);
  const I = geo.index ? geo.index.array : null, uv = geo.attributes.uv, uv1 = geo.attributes.uv1, normal = geo.attributes.normal;
  for (const t of _cand) {
    const a = I ? I[t * 3] : t * 3, b = I ? I[t * 3 + 1] : t * 3 + 1, c = I ? I[t * 3 + 2] : t * 3 + 2;
    const h = hit(this, this.material, raycaster, rayLocal, uv, uv1, normal, a, b, c);
    if (h) { h.faceIndex = t; intersects.push(h); }
  }
};
// (dev: ?raygrid=0 turns it off for a comparison)
if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('raygrid') === '0') THREE.Mesh.prototype._computeIntersections = base;
THREE.Mesh.prototype._computeIntersections.base = base;
if (typeof window !== 'undefined') window.__raygrid = raygridStats;   // (for a check against three's own)
