// ─── DRAW CULLING: skip what can't be seen ──────────────────────────────────
// The camera's frustum doesn't know the planet is in the way: looking along the
// street it still takes in everything round the far side of the world — every
// building, tree, lamp and person behind the horizon was drawn (and people are
// worst: their skinned bodies are never frustum-culled, and each is ~60–80 draws).
// Each frame, every top-level thing in the scene is checked against a ball just
// inside the ground: one whose bounding sphere lies wholly behind the planet, as seen
// from the camera, isn't drawn; nor is one smaller than a pixel or so on screen.
// People get a lighter version while they're small on screen: their little rigid
// parts (eyes, brows, buttons, studs — each its own draw, with its own ink hull) are
// skipped once a person stands less than ~45 px tall, where none of it can be seen.
// Distance LOD: every mesh also gets simpler versions of itself, made in the background after
// load (see `lodLevels`): its vertices clustered on a grid, each cluster collapsed onto one of
// its own vertices, and the triangles that fold away dropped. Only the index changes — the
// simpler versions draw from the very same vertex buffers (no extra vertex memory, the same
// smooth normals, colours and skin weights) — and one is drawn only while its grid is about
// under a pixel where the mesh's nearest point is: what goes is detail too small to see.
// Layers, not .visible, so nothing the game itself shows/hides is disturbed; hidden
// things keep their place in the scene (raycasts against the town's statics never
// test layers, so the walk rays still find the ground).
import * as THREE from 'three';
import { R } from './manifest.js';
import { QUALITY } from './quality.js';

const P = R - 0.8;                    // a ball safely inside the lowest ground and the sea
const HIDE = 31;                      // the layer a hidden thing is parked on
const MIN_PX = 1.1;                   // smaller than this radius on screen (px): not drawn
const LOD_PX = 45;                    // a person under this height on screen: no small parts
const DETAIL_TRIS = 400;              // a person's rigid part this small is a "small part"
const _c = new THREE.Vector3(), _box = new THREE.Box3(), _s = new THREE.Sphere();

// ── distance LOD ──
// grid sizes (world units) of the simpler versions: each is used once its grid, seen at the mesh's
// nearest point, is under LOD_TOL pixels (√3 × grid: the furthest a vertex can move)
const LOD_CELLS = [0.003, 0.0065, 0.014, 0.03, 0.065, 0.14];
const LOD_TOL = 1.0;                  // px (device pixels): a vertex moved less than this (the worst case) can't be seen
// light mode (quality.js): a coarser LOD (QUALITY.lodTol px) where nothing's inked — the line is
// under 2 px wide, so a coarser shape under a drawn line would eat it — and no ink on what's small on screen — a thing under QUALITY.inkPx radius (CSS px) draws no hull,
// and a big static's merged ink isn't drawn where a patch's width (CHUNK) would be under QUALITY.inkPatchPx
// on screen at its nearest point (its fill still is)
const tol = (bare) => (bare ? QUALITY.lodTol : LOD_TOL);   // (bare: light mode, and no ink drawn on it)
let LOD_NOW = /[?&]lodnow=1/.test(globalThis.location?.search || '');     // (dev: ?lodnow=1, or culler.lodNow = true, rebuilds a patched mesh the moment it changes — to compare)
const LOD_MIN_TRIS = 240;             // a mesh smaller than this isn't worth simplifying
const LOD_KEEP = 0.8;                 // a version is kept only if it's at most this share of the last one
const LOD_KEEP_PATCHED = 0.7;         // (a patched mesh keeps every version in the JS heap — it rebuilds from them: fewer, further apart)
const _cap = new WeakMap();           // geometry → its arrays, held from before they're let go (gpuOnly)
const _lod = new WeakMap();           // geometry → [{ cw, geo }] its simpler versions, finest first ([]: none; null: pending)
const _scale = new WeakMap();         // geometry → world units per geometry unit (the first mesh seen drawing it)
const _queue = [];                    // geometries waiting for their versions
const _freeArr = function () { this.array = null; };
const PRIME = 30;                     // the layer prime() draws on
const _primeMat = new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }' });
function _rayHi(raycaster, hits) {
  const g = this.geometry; this.geometry = g.userData.lodOf || g;
  try { THREE.Mesh.prototype.raycast.call(this, raycaster, hits); } finally { this.geometry = g; }
}
function lodable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine || Array.isArray(o.material)) return false;
  const g = o.geometry; if (!g || g.groups?.length || g.drawRange.count !== Infinity || g.morphAttributes?.position) return false;
  const P = g.attributes.position;
  if (!P || P.isInterleavedBufferAttribute || P.itemSize !== 3 || P.usage !== THREE.StaticDrawUsage) return false;
  if (o.material?.map) return false;                                 // (a textured part's uv seams would smear)
  return true;
}
// capture(geometry): hold its arrays now — gpuOnly lets the JS copies go once they're on the GPU
function capture(g) {
  if (_cap.has(g) || _lod.has(g)) return;
  const P = g.attributes.position, I = g.index, n = P.count;
  if (!P.array || (I && !I.array) || !(P.array instanceof Float32Array)) return;
  const tris = (I ? I.count : n) / 3; if (tris < LOD_MIN_TRIS) { _lod.set(g, []); return; }
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, RT = g.attributes.aRoot;
  if (SI && (!SI.array || !SW?.array || SI.isInterleavedBufferAttribute || SW.isInterleavedBufferAttribute)) return;
  if (RT && (!RT.array || RT.isInterleavedBufferAttribute)) return;
  if (!g.boundingSphere) g.computeBoundingSphere();
  if (!g.boundingBox) g.computeBoundingBox();
  _cap.set(g, { P: P.array, I: I ? I.array : null, n, SI: SI ? SI.array : null, SW: SW ? SW.array : null, RT: RT?.array || null, RS: RT?.itemSize || 0 });
  _lod.set(g, null);                  // (pending)
  _queue.push(g);
}
// lodPrepare(root): capture every mesh's arrays under root (before gpuOnly lets them go)
export function lodPrepare(root) { root.traverse(o => { if (lodable(o)) capture(o.geometry); }); }
// world units per unit of a mesh's geometry
function unitOf(m, root) {
  const ws = m.getWorldScale(new THREE.Vector3()), k = Math.max(ws.x, ws.y, ws.z);
  if (!m.isSkinnedMesh) return k;
  // (skinned: its vertices are in the frame it was bound in. Where two of its bones are now, in the
  // world, against where they stood in that frame, says how big a unit of it is)
  const sk = m.skeleton, bones = sk?.bones || [];
  if (bones.length > 1) {
    const bi = m.bindMatrixInverse, M = new THREE.Matrix4(), pg = bones.map((b, i) => new THREE.Vector3().setFromMatrixPosition(M.copy(sk.boneInverses[i]).invert().premultiply(bi)));
    const pw = bones.map(b => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
    let best = 0, a = 0, c = 0;
    for (let i = 1; i < bones.length; i++) { const d = pg[i].distanceTo(pg[0]); if (d > best) { best = d; c = i; } }
    if (best > 1e-6) { const w = pw[c].distanceTo(pw[a]); if (w > 0) return w / best; }
  }
  return Math.max(...root.getWorldScale(new THREE.Vector3()).toArray());
}
// the simpler versions of one geometry: for each grid, every vertex the index uses joins its
// cell (and, skinned, its main bone's; in the meadow, its own plant's) — the cell's vertex nearest
// the cell's middle stands for it, and a triangle whose corners land on fewer than three is dropped
function lodLevels(g) {
  const c = _cap.get(g); _cap.delete(g);
  if (!c) return [];
  const scale = _scale.get(g) || 1;
  const { P, I, n, SI, SW, RT, RS } = c;
  const ni = I ? I.length : n, at = I ? (k) => I[k] : (k) => k;
  const used = new Uint8Array(n); for (let k = 0; k < ni; k++) used[at(k)] = 1;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) if (used[i]) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  if (!(x1 >= x0)) return [];
  // a vertex's group: skinned, the bone that moves it most; meadow, its plant (by its root)
  const grp = new Uint32Array(n);
  if (SI) for (let i = 0; i < n; i++) { let b = 0, w = -1; for (let k = 0; k < 4; k++) if (SW[i * 4 + k] > w) { w = SW[i * 4 + k]; b = SI[i * 4 + k]; } grp[i] = b + 1; }
  else if (RT) for (let i = 0; i < n; i++) { let h = 0; for (let k = 0; k < RS; k++) h = (h * 31 + Math.round(RT[i * RS + k] * 400)) | 0; grp[i] = (h >>> 0) % 4093 + 1; }
  const levels = [], cl = new Int32Array(n), rep = new Int32Array(n);
  let last = ni / 3;
  const IDX = n > 65535 ? Uint32Array : Uint16Array;
  // a big static thing (a street of shops, a garden's planting) is split into patches ~CHUNK across,
  // each choosing its own version: the near end of a street stays whole while its far end simplifies
  const ch = _chunky.has(g) ? chunksOf(g, P, I, ni, scale, IDX) : null;
  const hiOrder = ch ? ch.hi : null, order = hiOrder ? (k) => hiOrder[k] : at;
  for (const cw of LOD_CELLS) {
    const cell = cw / scale;
    if (Math.max(x1 - x0, y1 - y0, z1 - z0) / cell > 2e9) continue;            // (too fine a grid for this big a thing)
    const nc = cellIds(P, used, n, x0, y0, z0, cell, grp, cl);
    const sum = new Float64Array(nc * 4);
    for (let i = 0; i < n; i++) if (used[i]) { const q = cl[i] * 4; sum[q] += P[i * 3]; sum[q + 1] += P[i * 3 + 1]; sum[q + 2] += P[i * 3 + 2]; sum[q + 3]++; }
    const best = new Float64Array(nc).fill(Infinity), who = new Int32Array(nc);
    for (let i = 0; i < n; i++) if (used[i]) { const q = cl[i] * 4, m = sum[q + 3], j = cl[i];
      const d = (P[i * 3] - sum[q] / m) ** 2 + (P[i * 3 + 1] - sum[q + 1] / m) ** 2 + (P[i * 3 + 2] - sum[q + 2] / m) ** 2;
      if (d < best[j]) { best[j] = d; who[j] = i; } }
    for (let i = 0; i < n; i++) if (used[i]) rep[i] = who[cl[i]];
    const out = new IDX(ni); let k = 0;
    const off = ch ? new Uint32Array(ch.n + 1) : null;
    for (let t = 0, c = 0; t < ni; t += 3) {
      if (ch) while (t >= ch.off[c + 1]) off[++c] = k;
      const a = rep[order(t)], b = rep[order(t + 1)], d = rep[order(t + 2)];
      if (a !== b && b !== d && a !== d) { out[k++] = a; out[k++] = b; out[k++] = d; }
    }
    if (k / 3 > (ch ? LOD_KEEP_PATCHED : LOD_KEEP) * last) continue;
    if (ch) {
      for (let c = 0; c < ch.n; c++) if (ch.off[c + 1] >= ni) { for (let j = c + 1; j <= ch.n; j++) off[j] = k; break; }
      off[ch.n] = k;
      ch.lv.push({ cw, arr: out.slice(0, k), off });
      last = k / 3;
      if (last < 16) break;
      continue;
    }
    const lo = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) lo.setAttribute(name, a);
    lo.setIndex(new THREE.BufferAttribute(out.slice(0, k), 1));
    if (_rayless.has(g)) lo.index.onUpload(_freeArr);              // (nothing reads it but the GPU: see _rayless)
    lo.boundingSphere = g.boundingSphere; lo.boundingBox = g.boundingBox;
    lo.userData.lodOf = g;
    levels.push({ cw, geo: lo });
    last = k / 3;
    if (last < 16) break;
  }
  if (ch) return ch;                                                  // (even with no simpler version: its patches still drop out of view)
  return levels;
}
// cellIds: each used vertex's cell (+ group) → a dense id in cl[]; returns how many cells
let _hk = new Int32Array(0), _hv = new Int32Array(0);
function cellIds(P, used, n, x0, y0, z0, cell, grp, cl) {
  let size = 1024; while (size < n * 2) size <<= 1;
  if (_hv.length < size) { _hk = new Int32Array(size * 4); _hv = new Int32Array(size); }
  const mask = size - 1, hk = _hk, hv = _hv; hv.fill(-1, 0, size);
  let nc = 0;
  for (let i = 0; i < n; i++) {
    if (!used[i]) continue;
    const a = Math.floor((P[i * 3] - x0) / cell), b = Math.floor((P[i * 3 + 1] - y0) / cell), c = Math.floor((P[i * 3 + 2] - z0) / cell), g = grp[i];
    let j = (Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791) ^ Math.imul(g, 40503)) & mask;
    for (;;) {
      const v = hv[j];
      if (v < 0) { hv[j] = nc; hk[j * 4] = a; hk[j * 4 + 1] = b; hk[j * 4 + 2] = c; hk[j * 4 + 3] = g; cl[i] = nc++; break; }
      if (hk[j * 4] === a && hk[j * 4 + 1] === b && hk[j * 4 + 2] === c && hk[j * 4 + 3] === g) { cl[i] = v; break; }
      j = (j + 1) & mask;
    }
  }
  return nc;
}
// the patches of a big static mesh: its triangles sorted by the patch their middle falls in (the
// index itself is reordered — the same triangles, so the ground rays that read it see no change),
// with each patch's ball
const CHUNK = 2.0;
const _chunky = new WeakSet();
const _wide = new WeakSet();          // (the planet and the sea: patches three times as wide — thousands fewer to test each frame)
const _keepOrder = new WeakSet();     // (a mesh that labels its triangles by their order — the road sheet's triPart — keeps its index as it is)
// geometries whose meshes never raycast through what they draw (a hull, a static thing whose
// ground rays go through gpuOnly's copy, people and cars — never ground, and the talk camera reads
// the whole shape): their simpler versions' indices leave the JS heap once on the GPU (see prime)
const _rayless = new WeakSet();        // geometries drawn by a big static mesh (set when it's collected)
function chunksOf(g, P, I, ni, scale, IDX) {
  const cell = CHUNK * (_wide.has(g) ? 3 : 1) / scale, nt = ni / 3, at = I ? (k) => I[k] : (k) => k;
  const ids = new Map(), tc = new Uint32Array(nt); let nch = 0;
  for (let t = 0; t < nt; t++) {
    const a = at(t * 3) * 3, b = at(t * 3 + 1) * 3, c = at(t * 3 + 2) * 3;
    const key = (Math.floor((P[a] + P[b] + P[c]) / 3 / cell) + 4096) * 67108864 + (Math.floor((P[a + 1] + P[b + 1] + P[c + 1]) / 3 / cell) + 4096) * 8192 + (Math.floor((P[a + 2] + P[b + 2] + P[c + 2]) / 3 / cell) + 4096);
    let id = ids.get(key); if (id === undefined) { id = nch++; ids.set(key, id); }
    tc[t] = id;
  }
  const off = new Uint32Array(nch + 1);
  for (let t = 0; t < nt; t++) off[tc[t] + 1] += 3;
  for (let c = 0; c < nch; c++) off[c + 1] += off[c];
  const hs = new IDX(ni), fillAt = off.slice(0, nch);
  for (let t = 0; t < nt; t++) { const w = fillAt[tc[t]]; hs[w] = at(t * 3); hs[w + 1] = at(t * 3 + 1); hs[w + 2] = at(t * 3 + 2); fillAt[tc[t]] += 3; }
  // each patch's ball, in the geometry's own frame
  const B = new Float32Array(nch * 6).fill(Infinity); for (let c = 0; c < nch; c++) { B[c * 6 + 3] = B[c * 6 + 4] = B[c * 6 + 5] = -Infinity; }
  for (let c = 0; c < nch; c++) for (let k = off[c]; k < off[c + 1]; k++) { const v = hs[k] * 3;
    for (let j = 0; j < 3; j++) { if (P[v + j] < B[c * 6 + j]) B[c * 6 + j] = P[v + j]; if (P[v + j] > B[c * 6 + 3 + j]) B[c * 6 + 3 + j] = P[v + j]; } }
  const C = new Float32Array(nch * 4);
  for (let c = 0; c < nch; c++) {
    const x = (B[c * 6] + B[c * 6 + 3]) / 2, y = (B[c * 6 + 1] + B[c * 6 + 4]) / 2, z = (B[c * 6 + 2] + B[c * 6 + 5]) / 2; let r2 = 0;
    for (let k = off[c]; k < off[c + 1]; k++) { const v = hs[k] * 3; r2 = Math.max(r2, (P[v] - x) ** 2 + (P[v + 1] - y) ** 2 + (P[v + 2] - z) ** 2); }
    C[c * 4] = x; C[c * 4 + 1] = y; C[c * 4 + 2] = z; C[c * 4 + 3] = Math.sqrt(r2);
  }
  // (the whole version is drawn from the mesh's own index, reordered — unless that was let go)
  let hi = hs;
  if (I && g.index?.array === I && !_keepOrder.has(g)) { I.set(hs); hi = I; }
  return { chunked: true, n: nch, C, hi, off, lv: [] };
}

export function createCuller(scene, camera, { avatar = null, renderer = null } = {}) {
  const roots = new Map();            // root → { r, off (local), person, detail, hidden, lod }
  let n = -1;
  function collect() {
    for (const o of scene.children) {
      if (roots.has(o)) continue;
      let meshes = 0, skinned = false;
      o.traverse(q => { if (q.isMesh || q.isSprite) meshes++; if (q.isSkinnedMesh) skinned = true; });
      if (!meshes) continue;
      let onMain = false; o.traverse(q => { if ((q.isMesh || q.isSprite) && q.layers.isEnabled(0)) onMain = true; });
      if (!onMain) continue;                                             // (the rooms draw on their own layer: not ours)
      o.updateMatrixWorld(true);
      const person = skinned && !!(o.userData.human || o.userData.noGround);
      let r, off;
      if (skinned) {
        // (a skinned body's own bounds are unreliable — some come out tens of units wide — so
        // a person is a ball round their middle; anything rigid they hold or ride is measured)
        _box.makeEmpty();
        o.traverse(q => { if (q.isMesh && !q.isSkinnedMesh && !q.userData.isInk) _box.expandByObject(q); });
        r = 1.2; off = new THREE.Vector3(0, 0.6, 0);
        if (!_box.isEmpty()) { _box.getBoundingSphere(_s); r = Math.max(r, _s.radius + _s.center.distanceTo(o.position)); off.set(0, 0, 0); }
      } else {
        _box.setFromObject(o);
        if (_box.isEmpty()) continue;
        _box.getBoundingSphere(_s);
        r = _s.radius;
        // the sphere's centre in the root's own frame, so a thing that moves (a car, the rocket) carries it
        off = o.worldToLocal(_s.center.clone());
        const sc = o.getWorldScale(new THREE.Vector3());
        off.multiply(sc);
      }
      if (!(r > 0) || r > 90) continue;                                // the sky: always drawn
      // (the planet and the sea: always drawn, but by patches — most of the ground is round
      // behind the horizon or out of view)
      const huge = r > 30;
      r += 0.3;
      // a person's small parts, for the lighter version
      const detail = [];
      if (person) o.traverse(q => {
        if (!q.isMesh || q.isSkinnedMesh || q.userData.isInk) return;
        const g = q.geometry, tris = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
        if (tris < DETAIL_TRIS) { detail.push(q); for (const k of q.children) if (k.userData.isInk) detail.push(k); }
      });
      // its meshes' simpler versions (made in the background), and which one each is drawing
      const lods = [];
      if (o !== avatar) o.traverse(q => {
        if (!lodable(q)) return;
        capture(q.geometry);
        if (!_lod.has(q.geometry) || _lod.get(q.geometry)?.length === 0) return;
        if (!_scale.has(q.geometry)) _scale.set(q.geometry, unitOf(q, o));
        const ws = q.getWorldScale(new THREE.Vector3());
        // (a big thing that never moves: by patches. Its index is rebuilt now and then, so only one
        // whose ground rays go through their own copy — gpuOnly's — or that takes none)
        const big = !q.isSkinnedMesh && !person && !o.userData.noGround && _lod.get(q.geometry) === null &&
          q.geometry.boundingSphere.radius * Math.max(ws.x, ws.y, ws.z) > CHUNK * 0.9 && (q.geometry.index ? q.geometry.index.count : q.geometry.attributes.position.count) >= 3000;
        if (big) _chunky.add(q.geometry);
        if (q.userData.triPart) _keepOrder.add(q.geometry);
        if (huge) _wide.add(q.geometry);
        if (huge && !_chunky.has(q.geometry)) return;
        if (_lod.get(q.geometry) === null) { if (q.raycast !== THREE.Mesh.prototype.raycast || o.userData.noGround) _rayless.add(q.geometry); else _rayless.delete(q.geometry); }
        lods.push({ m: q, hi: q.geometry, cur: -1, levels: null, dead: false, ws: Math.max(ws.x, ws.y, ws.z), skin: q.isSkinnedMesh || person, ink: !!q.userData.isInk });
      });
      roots.set(o, { r, off, person, skinned, huge, detail: new Set(detail), hidden: false, lod: false, thin: false, lods });
    }
    for (const o of roots.keys()) if (o.parent !== scene) roots.delete(o);
    n = scene.children.length;
  }
  const apply = (o, st) => {
    o.traverse(q => {
      if (!(q.isMesh || q.isSprite || q.isLine || q.isPoints)) return;
      if (q.userData._lay == null) q.userData._lay = q.layers.mask;              // its own layers, to give back
      q.layers.mask = st.hidden || (st.lod && st.detail.has(q)) || (st.thin && q.userData.isInk) ? 1 << HIDE : q.userData._lay;
    });
  };
  // each mesh draws the coarsest version whose grid is under LOD_TOL px at its nearest point
  // (a person: their whole ball — a skinned body's own bounds can't be trusted). A little slack
  // before stepping coarser, so a mesh on the edge doesn't flick between two.
  const _w = new THREE.Vector3();
  // a patched mesh: each patch its own version (or none, round behind the planet); when any
  // patch changes, its index is put together again from the patches' own runs
  function pickChunks(L, ch, eye, fd, hz) {
    const m = L.m, n = ch.n;
    // (each patch's ball in the world — again whenever the mesh has moved: the rocket lifts off)
    if (!L.mw || !L.mw.equals(m.matrixWorld)) {
      if (!L.wc) L.wc = new Float32Array(n * 4);
      L.mw = (L.mw || new THREE.Matrix4()).copy(m.matrixWorld);
      for (let c = 0; c < n; c++) { _w.set(ch.C[c * 4], ch.C[c * 4 + 1], ch.C[c * 4 + 2]).applyMatrix4(m.matrixWorld); L.wc[c * 4] = _w.x; L.wc[c * 4 + 1] = _w.y; L.wc[c * 4 + 2] = _w.z; L.wc[c * 4 + 3] = ch.C[c * 4 + 3] * L.ws; }
    }
    if (!L.dyn) {
      L.cc = new Int8Array(n).fill(-9); L.built = new Int8Array(n).fill(-2);
      const dyn = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(L.hi.attributes)) dyn.setAttribute(name, a);
      dyn.setIndex(new THREE.BufferAttribute(new ch.hi.constructor(ch.hi.length), 1).setUsage(THREE.DynamicDrawUsage));   // (full size from the start: the GPU buffer is made to it)
      dyn.boundingSphere = L.hi.boundingSphere; dyn.boundingBox = L.hi.boundingBox; dyn.userData.lodOf = L.hi;
      L.dyn = dyn; m.geometry = dyn;
      if (m.raycast === THREE.Mesh.prototype.raycast) m.raycast = _rayHi;   // (its rays read its whole shape: the patches' index comes and goes)
    }
    const W = L.wc, cc = L.cc, lv = ch.lv; let dirty = false, urgent = cc[0] === -9 || LOD_NOW || hz.jump;
    for (let c = 0; c < n; c++) {
      _w.set(W[c * 4] - eye.x, W[c * 4 + 1] - eye.y, W[c * 4 + 2] - eye.z);
      const d = Math.max(1e-3, _w.length()), r = W[c * 4 + 3];
      let k;
      _s.center.set(W[c * 4], W[c * 4 + 1], W[c * 4 + 2]); _s.radius = r;
      if (hz.ok && d > hz.tang + r && Math.acos(THREE.MathUtils.clamp(-_w.dot(eye) / (d * hz.el), -1, 1)) + Math.asin(Math.min(1, r / d)) < hz.alpha) k = -2;   // behind the planet
      else if (!(cc[c] === -2 ? hz.near : hz.wide).intersectsSphere(_s)) k = -2;    // out of view (shown a little before it comes in, kept a little after)
      else {
        // (light mode: past where a patch's width is under inkPatchPx on screen — by distance: a patch's
        // own size says nothing — its ink isn't drawn, and its fill may be coarser)
        const bare = QUALITY.low && CHUNK * hz.f / Math.max(d - r, 0.05) < (L.bare?.[c] ? QUALITY.inkPatchPx * 1.15 : QUALITY.inkPatchPx);
        if (QUALITY.low) (L.bare ||= new Uint8Array(n))[c] = bare ? 1 : 0;
        if (bare && L.ink) k = -2;
        else {
          const px = 1.7320508 * fd / Math.max(d - r, 0.05); k = -1;
          for (let i = lv.length - 1; i >= 0; i--) if (lv[i].cw * px <= (i > cc[c] ? tol(bare) / 1.15 : tol(bare))) { k = i; break; }
        }
      }
      if (k !== cc[c]) { cc[c] = k; dirty = true; }
      // (a patch in the view itself that the index doesn't hold yet can't wait; everything else —
      // one leaving, one just past the edge, a change of version — waits its turn: see rebuild)
      if (k !== -2 && L.built[c] === -2 && hz.view.intersectsSphere(_s)) urgent = true;
    }
    if (!dirty && !(urgent && L.queued)) return;
    if (urgent) rebuild(L, ch); else if (!L.queued) { L.queued = true; L.ch = ch; _later.push(L); }
  }
  // put a patched mesh's index together again from its patches' runs
  function rebuild(L, ch) {
    const cc = L.cc, lv = ch.lv, n = ch.n;
    L.queued = false; L.built.set(cc);
    const ia = L.dyn.index;
    let any = false; for (let c = 0; c < n && !any; c++) if (cc[c] !== -2) any = true;
    // (nothing of it in view: no new index — it'd wait in the heap till drawn — and not drawn at
    // all, not even as an empty call)
    if (!any) { L.dyn.setDrawRange(0, 0); if (!L.off) { L.off = true; if (L.m.userData._lay == null) L.m.userData._lay = L.m.layers.mask; L.m.layers.mask = 1 << HIDE; } return; }
    if (L.off) { L.off = false; L.m.layers.mask = L.m.userData._lay; }
    const out = new ch.hi.constructor(ch.hi.length); let w = 0;
    for (let c = 0; c < n; c++) {
      const k = cc[c]; if (k === -2) continue;
      const src = k < 0 ? ch.hi : lv[k].arr, of = k < 0 ? ch.off : lv[k].off;
      out.set(src.subarray(of[c], of[c + 1]), w); w += of[c + 1] - of[c];
    }
    ia.array = out; ia.needsUpdate = true; ia.onUpload(_freeArr);       // (the GPU's alone: the next change builds a fresh one)
    L.dyn.setDrawRange(0, w);
  }
  function pick(st, dRoot, eye, fd, hz) {
    for (const L of st.lods) {
      if (L.dead) continue;
      const m = L.m;
      if (m.geometry !== L.hi && m.geometry.userData.lodOf !== L.hi) { L.dead = true; continue; }   // (the game gave it another shape: hands off)
      let levels = L.levels;
      if (!levels) { levels = _lod.get(L.hi); if (!levels) continue; L.levels = levels; }
      if (levels.chunked) { pickChunks(L, levels, eye, fd, hz); continue; }
      if (!levels.length) continue;
      let dn;
      if (L.skin) dn = dRoot - st.r;
      else { const bs = L.hi.boundingSphere; _w.copy(bs.center).applyMatrix4(m.matrixWorld); dn = _w.distanceTo(eye) - bs.radius * L.ws; }
      const px = 1.7320508 * fd / Math.max(dn, 0.05);                 // px per world unit of grid
      let k = -1;
      for (let i = levels.length - 1; i >= 0; i--) if (levels[i].cw * px <= (i > L.cur ? tol(st.thin) / 1.15 : tol(st.thin))) { k = i; break; }
      if (k !== L.cur) { L.cur = k; m.geometry = k < 0 ? L.hi : levels[k].geo; }
    }
  }
  // the background work: a few milliseconds at a time between frames, until every queued
  // geometry has its simpler versions (and has let go of the arrays it held for them)
  // (a slice is ~6 ms at a smooth frame rate; on a machine struggling to draw, a share of its
  // frame time, so the work still finishes in a few seconds)
  let busy = false, lastT = 0, frameMs = 16;
  // the horizon, and the view a little wider than the camera's (patches just out of it are kept ready)
  const hz = { ok: false, alpha: 0, tang: 0, el: 0, view: new THREE.Frustum(), near: new THREE.Frustum(), wide: new THREE.Frustum() }, _pm = new THREE.Matrix4();
  // patched meshes whose patches changed but nothing new came into view: a couple rebuilt a frame
  // (turning on the spot used to rebuild every patched mesh in sight, every frame)
  const _later = [];
  function work() {
    if (busy || !_queue.length) return;
    busy = true;
    // (in the browser's idle time between frames, as much as it offers; if none comes within 0.1 s
    // — a machine flat out drawing — a slice anyway, so the work still gets done)
    const later = window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 100 }) : (f) => setTimeout(f, 0);
    const step = (dl) => {
      const t0 = performance.now();
      const budget = dl && !dl.didTimeout ? Math.max(3, dl.timeRemaining()) : Math.min(60, Math.max(6, 0.3 * frameMs));
      while (_queue.length && performance.now() - t0 < budget) {
        const g = _queue.shift();
        if (_scale.has(g)) _lod.set(g, lodLevels(g)); else { _cap.delete(g); _lod.set(g, []); }   // (nothing of ours draws it: the rooms)
      }
      if (_queue.length) later(step); else { busy = false; _hk = new Int32Array(0); _hv = new Int32Array(0); primeK = 0; }
    };
    later(step);
  }
  // prime: once the versions are made, each is sent to the GPU now (one frame per version, with
  // every material hidden: the renderer uploads what it gathers, draws nothing), so the ones
  // whose indices only the GPU needs let go of them now, not whenever first drawn
  let primeK = -1;
  function prime() {
    if (!renderer || primeK < 0) return;
    const k = primeK++, swapped = [];
    for (const st of roots.values()) for (const L of st.lods) {
      const lv = L.levels || _lod.get(L.hi);
      if (L.dead || !lv || lv.chunked || !(lv.length > k)) continue;
      const ix = lv[k].geo.index; if (!ix.array || ix.onUploadCallback !== _freeArr) continue;
      swapped.push([L.m, L.m.geometry, L.m.layers.mask, L.m.frustumCulled]);
      L.m.geometry = lv[k].geo; L.m.layers.set(PRIME); L.m.frustumCulled = false;
    }
    if (!swapped.length) { primeK = -1; return; }
    // (an index is only sent up when it's drawn: these are, with a shader that puts every vertex
    // outside the view — nothing reaches the screen — and nothing else on the camera's layer)
    const lay = camera.layers.mask, over = scene.overrideMaterial;
    camera.layers.set(PRIME); scene.overrideMaterial = _primeMat;
    try { renderer.render(scene, camera); }
    finally {
      scene.overrideMaterial = over; camera.layers.mask = lay;
      for (const [m, g, l, fc] of swapped) { m.geometry = g; m.layers.mask = l; m.frustumCulled = fc; }
    }
  }
  return {
    update() {
      if (scene.children.length !== n) collect();
      const e = camera.position, el = e.length();
      const f = (innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const fd = f * (renderer ? renderer.getPixelRatio() : Math.min(devicePixelRatio || 1, 1.75));   // (in device pixels, as drawn: the adaptive resolution's)
      const behindOK = el > P + 0.01;
      const alpha = behindOK ? Math.asin(P / el) : 0, tang = behindOK ? Math.sqrt(el * el - P * P) : 0;
      hz.f = f; hz.ok = behindOK; hz.alpha = alpha; hz.tang = tang; hz.el = el;
      camera.updateMatrixWorld();
      // (a cut — the talk camera, a teleport — puts everything right at once; only a steady turn
      // or walk spreads its rebuilds over the next frames)
      hz.jump = !hz.lastQ || hz.lastP.distanceToSquared(e) > 2.25 || hz.lastQ.angleTo(camera.quaternion) > 0.35;
      (hz.lastP ||= new THREE.Vector3()).copy(e); (hz.lastQ ||= new THREE.Quaternion()).copy(camera.quaternion);
      for (const [fr, k] of [[hz.view, 1.05], [hz.near, 1.3], [hz.wide, 1.6]]) {
        const t = camera.near * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * k, w = t * camera.aspect;
        _pm.makePerspective(-w, w, t, -t, camera.near, camera.far).multiply(camera.matrixWorldInverse);
        fr.setFromProjectionMatrix(_pm);
      }
      for (const [o, st] of roots) {
        _c.copy(st.off).applyQuaternion(o.quaternion).add(o.position).sub(e);          // (top-level: its own transform is its world one)
        const d = Math.max(1e-3, _c.length());
        if (st.huge) { if (st.lods.length) pick(st, d, e, fd, hz); continue; }
        let hide = st.r / d * f < MIN_PX;                                // too small to see
        if (!hide && behindOK && d > tang + st.r) {                       // behind the planet
          const theta = Math.acos(THREE.MathUtils.clamp(-_c.dot(e) / (d * el), -1, 1));
          hide = theta + Math.asin(Math.min(1, st.r / d)) < alpha;
        }
        // a person out of view: their skinned body is never frustum-culled by the renderer (its
        // bounds can't be trusted), so the whole of them is drawn behind the camera too — their
        // ball says when they're out (a little past the edge of the view, back a little before it)
        if (!hide && st.skinned) { _s.center.copy(_c).add(e); _s.radius = st.r; hide = !(st.hidden ? hz.near : hz.wide).intersectsSphere(_s); }
        const lod = st.person && 1.2 / d * f < LOD_PX;
        const thin = QUALITY.low && st.r / d * f < (st.thin ? QUALITY.inkPx * 1.15 : QUALITY.inkPx);   // (light mode: small on screen, no ink)
        if (hide !== st.hidden || lod !== st.lod || thin !== st.thin) { st.hidden = hide; st.lod = lod; st.thin = thin; apply(o, st); }
        if (!hide && st.lods.length) pick(st, d, e, fd, hz);
      }
      const now = performance.now(); if (lastT) frameMs += (Math.min(1000, now - lastT) - frameMs) * 0.2; lastT = now;
      for (let k = 0; (hz.jump || k < 2) && _later.length; k++) { const L = _later.shift(); if (L.queued && !L.dead) rebuild(L, L.ch); }
      work();
      prime();
    },
    set lodNow(v) { LOD_NOW = !!v; },
    get lodPending() { return _queue.length + (primeK >= 0 ? 1 : 0); },
    get hiddenCount() { let k = 0; for (const s of roots.values()) if (s.hidden) k++; return k; },
    roots,
  };
}
