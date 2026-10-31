// ─── LANDSCAPING: the museum's grounds, and the project shops' cobbled approaches ───
// Built in the frame of the thing they surround (the museum's, or each shop's: +Z faces
// the road, y up) and set down with placeOnPlanet(..., { sink: 0 }), so every vertex rides
// the terrain under it and the whole lot bakes to one mesh per material. Solid things
// leave K.foot markers (town.js feet() turns them into colliders).
import * as THREE from 'three';
import { PAL, paint } from './style.js';
import { tree, bush, rbox, lathe } from './props.js';
import { kit } from './buildings.js';

// a tiny seeded random, so the grounds come out the same every load
const rng = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

// ── hand-painted ground textures (tiled in metres) ──
function groundTex(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size, rng(size * 13 + 7));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
let _M = null;
function mats() {
  if (_M) return _M;
  // gravel: a warm sand with soft speckles
  const gravelTex = groundTex(128, (c, n, R) => {
    c.fillStyle = '#e4d5b2'; c.fillRect(0, 0, n, n);
    for (let i = 0; i < 260; i++) { c.fillStyle = R() > 0.5 ? 'rgba(150,120,85,0.35)' : 'rgba(255,248,230,0.55)'; c.beginPath(); c.arc(R() * n, R() * n, 1 + R() * 2.2, 0, 7); c.fill(); }
  });
  // flagstones: irregular pale slabs with dark joints
  const flagTex = groundTex(256, (c, n, R) => {
    c.fillStyle = '#8f8270'; c.fillRect(0, 0, n, n);
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      let x = -R() * 40;
      while (x < n) {
        const w = 50 + R() * 50, y = r * n / rows;
        c.fillStyle = ['#d9cdb5', '#cfc1a6', '#e2d7c2', '#c8b99c'][Math.floor(R() * 4)];
        c.beginPath(); c.roundRect(x + 3, y + 3, w - 6, n / rows - 6, 9); c.fill();
        x += w;
      }
    }
  });
  // cobbles: rows of rounded setts, each shaded a little differently, with a highlight
  const cobbleTex = groundTex(256, (c, n, R) => {
    c.fillStyle = '#6f6656'; c.fillRect(0, 0, n, n);
    const rows = 8, h = n / rows;
    for (let r = 0; r < rows; r++) {
      let x = (r % 2) * -h * 0.5;
      while (x < n + h) {
        const w = h * (0.8 + R() * 0.45), tone = Math.floor(170 + R() * 50);
        c.fillStyle = `rgb(${tone + 12},${tone + 2},${tone - 18})`;
        c.beginPath(); c.roundRect(x + 2.5, r * h + 2.5, w - 5, h - 5, h * 0.35); c.fill();
        c.fillStyle = 'rgba(255,250,235,0.35)';
        c.beginPath(); c.ellipse(x + w * 0.4, r * h + h * 0.35, w * 0.22, h * 0.14, 0, 0, 7); c.fill();
        x += w;
      }
    }
  });
  const flat = (o) => { const m = paint(0xffffff, { hatch: 0, side: THREE.DoubleSide, ...o }); m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = -3; return m; };
  _M = {
    gravel: flat({ map: gravelTex }), flag: flat({ map: flagTex }), cobble: flat({ map: cobbleTex }),
    edge: (() => { const m = paint(0xb9ad95, { hatch: 0, side: THREE.DoubleSide }); m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = -2; return m; })(),
    stone: paint(0xd6cbb4), stoneD: paint(0xb3a68c), soil: paint(0x8a6a52, { hatch: 0 }),
    hedge: paint(0x5f8a4e), hedgeD: paint(0x4f7a44), water: paint(PAL.water, { hatch: 0 }),
    dark: paint(PAL.ink, { hatch: 0 }), glow: paint(0xfff1c8, { emissive: 0xffd98a, hatch: 0 }),
    wood: paint(PAL.bark), bronze: paint(0xb07a3e), patina: paint(0x6fa596), terracotta: paint(PAL.terracotta ?? 0xc8714f),
    flowers: [0xe8604c, 0xe1b95c, 0xf6eedb, 0xdc9e9a, 0x8f7ae8, 0xf2a07a].map(c => paint(c, { hatch: 0 })),
  };
  return _M;
}

// a flat ribbon down a smoothed polyline [[x, z], ...] at height y, its texture tiled in metres
function strip(K, pts, half, mat, y, tile = 1, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
  const L = curve.getLength(), n = Math.max(2, Math.ceil(L / 0.3));
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = closed ? (i % n) / n : i / n, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    const sx = -tg.z, sz = tg.x;                                   // across the path, in xz
    for (const s of [-1, 1]) { pos.push(p.x + sx * half * s, y, p.z + sz * half * s); uv.push((s * half) / tile, (i / n) * L / tile); }
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = K.put(g, mat); m.userData.noInk = true;
  return curve;
}
// a path: the walking surface and, a hair below and a touch wider, a stone edging line
function path(K, pts, half, mat, y = 0.07, tile = 1) {
  const M = mats();
  strip(K, pts, half + 0.07, M.edge, y - 0.008, tile);
  return strip(K, pts, half, mat, y, tile);
}
// a flat shape lying in xz at height y, with uvs in metres (so a texture tiles like the paths')
function lay(K, geo, mat, x, y, z, tile = 1) {
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, uv = [];
  for (let i = 0; i < p.count; i++) uv.push((p.getX(i) + x) / tile, (p.getZ(i) + z) / tile);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = K.put(geo, mat, x, y, z); m.userData.noInk = true;
  return m;
}
// a low lamp on a post, knee to waist high (the grounds' lamps, not the street's)
function bollard(K, x, z, h = 0.9) {
  const M = mats();
  K.put(lathe([[0.001, 0], [0.09, 0], [0.09, 0.05], [0.05, 0.1], [0.04, h - 0.08], [0.07, h - 0.04], [0.001, h]], 10), M.dark, x, 0, z);
  K.put(lathe([[0.001, 0], [0.07, 0.01], [0.09, 0.1], [0.06, 0.2], [0.001, 0.22]], 12), M.glow, x, h, z);
  K.put(lathe([[0.001, 0], [0.11, 0], [0.03, 0.07], [0.001, 0.1]], 12), M.dark, x, h + 0.2, z);
  K.foot(x, z, 0.1);
}
function gardenBench(K, x, z, ry) {
  const M = mats(), s = K.sub(x, 0, z, ry);
  s.box(1.2, 0.07, 0.38, M.wood, 0, 0.42, 0, 0.025);
  s.box(1.2, 0.28, 0.06, M.wood, 0, 0.63, -0.17, 0.025, [-0.12, 0, 0]);
  for (const sx of [-0.52, 0.52]) s.box(0.06, 0.42, 0.36, M.dark, sx, 0.21, 0, 0.02);
  K.foot(x, z, 0.45);
}
// a flower bed: a stone kerb (round or rounded-square), soil, dots of colour and a little bush
function flowerBed(K, x, z, w, d, R, { round = false, bushS = 0.3, kerb = true } = {}) {
  const M = mats();
  if (round) {
    const r = w / 2;
    if (kerb) K.put(lathe([[r - 0.06, 0], [r + 0.04, 0], [r + 0.04, 0.16], [r - 0.06, 0.16]], 28), M.stone, x, 0, z);
    K.put(lathe([[0.001, 0.1], [r - 0.06, 0.1], [r - 0.08, 0.15], [0.001, 0.16]], 28), M.soil, x, 0, z);
  } else {
    if (kerb) K.box(w + 0.1, 0.16, d + 0.1, M.stone, x, 0.08, z, 0.04);
    K.box(w - 0.04, 0.06, d - 0.04, M.soil, x, 0.15, z, 0.02);
  }
  const n = Math.round(w * d * 14);
  for (let f = 0; f < n; f++) {
    const fx = (R() - 0.5) * (w - 0.2), fz = (R() - 0.5) * (d - 0.2);
    if (round && Math.hypot(fx, fz) > w / 2 - 0.12) continue;
    K.put(new THREE.SphereGeometry(0.055 + R() * 0.02, 8, 6), M.flowers[Math.floor(R() * M.flowers.length)], x + fx, 0.21 + R() * 0.05, z + fz);
  }
  if (bushS) { const b = bush(bushS); b.position.set(x, 0.15, z); K.g.add(b); }
}
// a clipped hedge along a straight run (a rounded box, its top a touch darker)
function hedge(K, x0, z0, x1, z1, h = 0.45, w = 0.34) {
  const M = mats(), L = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
  K.put(rbox(w, h, L, 0.13, 3), M.hedge, (x0 + x1) / 2, h / 2, (z0 + z1) / 2, [0, a, 0]);
}
function specimen(K, x, z, s, R) {
  const t = tree({ s }); t.position.set(x, 0, z); t.rotation.y = R() * 6; K.g.add(t);
  K.foot(x, z, 0.3);
}
// a clipped cone of box, in a stone pot
function topiary(K, x, z, s = 1) {
  const M = mats();
  K.put(lathe([[0.001, 0], [0.24, 0], [0.28, 0.3], [0.31, 0.34], [0.001, 0.34]], 16).scale(s, s, s), M.stone, x, 0, z);
  K.put(lathe([[0.001, 0.3], [0.3, 0.38], [0.26, 0.7], [0.14, 1.05], [0.04, 1.25], [0.001, 1.28]], 16).scale(s, s, s), M.hedgeD, x, 0, z);
  K.foot(x, z, 0.3 * s);
}

// ── the museum's grounds (museum frame: the building spans x ±6.8, z −2.4…−11.6 with its
// stylobate; the forecourt disc is r 3.3 round (0, −0.3); roads run past both sides,
// close at the front, opening out behind) ──
export function museumGrounds({ ok = () => true } = {}) {
  const K = kit(), M = mats(), R = rng(5153);
  // optional pieces go where ok() says the world is free (no road, water, or a project shop
  // and its approach) and they don't overlap each other; the first free candidate wins
  const placed = [];
  const free = (x, z, r) => !placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + r + 0.15) && ok(x, z, r);
  const onWalk = (x, z, r) => (Math.abs(Math.abs(x) - 8.75) < 0.6 + r && z < -2 && z > -12.6) || (Math.abs(z + 13.0) < 0.6 + r && Math.abs(x) < 8.6);
  const spot = (x, z, r) => !onWalk(x, z, r) && !(Math.abs(x) < 7.2 + r && z > -12.1 - r && z < -2.2 + r) && free(x, z, r);
  const pick = (cands, r) => { for (const [x, z] of cands) if (spot(x, z, r)) { placed.push([x, z, r]); return [x, z]; } return null; };
  // gravel walks from the side pavements round both wings, meeting behind the building
  // either side of the service ramp (x ±0.8, z −11.4…−14.1)
  path(K, [[-7.35, -1.3], [-8.05, -2.7], [-8.55, -4.6], [-8.55, -10.3], [-8.0, -12.4], [-5.6, -13.0], [-1.55, -13.0]], 0.42, M.gravel, 0.07, 1.2);
  path(K, [[8.55, -2.25], [8.95, -4.3], [9.0, -10.4], [8.5, -12.45], [5.6, -13.0], [1.55, -13.0]], 0.42, M.gravel, 0.07, 1.2);
  // box hedges along the walks' road side; a flower strip under the east wing's windows
  hedge(K, -9.12, -4.7, -9.12, -10.1);
  hedge(K, 9.67, -4.5, 9.67, -10.3);
  flowerBed(K, 8.05, -5.0, 0.55, 2.4, R, { bushS: 0 });
  flowerBed(K, 8.05, -9.4, 0.55, 2.0, R, { bushS: 0 });
  // low lamps along the walks, a bench on the east lawn
  for (const [x, z] of [[-7.95, -5.0], [-7.95, -10.6], [10.15, -5.6], [10.15, -9.4], [-4.2, -12.3], [4.2, -12.3]]) if (ok(x, z, 0.1)) bollard(K, x, z);
  if (ok(10.45, -8.6, 0.5)) { gardenBench(K, 10.45, -8.6, -Math.PI / 2); placed.push([10.45, -8.6, 0.5]); }
  // a flagstone path from the back walk out to a garden (cx, cz), stopping r short of its centre
  const spurTo = (cx, cz, r) => {
    const sx = Math.abs(cx) < 1.8 ? Math.sign(cx || 1) * 1.8 : Math.max(-5.4, Math.min(5.4, cx)), sz = -13.0;
    const L = Math.hypot(cx - sx, cz - sz); if (L < r + 0.3) return Math.atan2(sx - cx, sz - cz);
    const ux = (cx - sx) / L, uz = (cz - sz) / L;
    path(K, [[sx, sz - 0.2], [sx + ux * (L - r) * 0.5, sz + uz * (L - r) * 0.5], [cx - ux * (r - 0.15), cz - uz * (r - 0.15)]], 0.38, M.flag, 0.07, 1.4);
    return Math.atan2(-ux, -uz);                    // the garden's mouth: toward the walk
  };

  // ── behind: a sculpture garden round an ornamental pool ──
  const PR = 1.5, OUT = PR + 2.2;                   // pool radius, and the garden's reach
  const pool = pick([[6.2, -18.2], [5.0, -19.2], [3.8, -20.0], [7.6, -16.6], [2.4, -21.0], [-3.6, -18.0]], OUT);
  if (pool) {
    const [PX, PZ] = pool;
    const mouth = spurTo(PX, PZ, PR + 1.3);
    lay(K, new THREE.RingGeometry(PR + 0.55, PR + 1.3, 64, 1), M.edge, PX, 0.062, PZ, 1.4);
    lay(K, new THREE.RingGeometry(PR + 0.62, PR + 1.23, 64, 1), M.flag, PX, 0.07, PZ, 1.4);
    K.put(lathe([[PR - 0.04, 0], [PR + 0.24, 0], [PR + 0.26, 0.26], [PR + 0.14, 0.32], [PR - 0.05, 0.3], [PR - 0.06, 0.05]], 56), M.stone, PX, 0, PZ);
    lay(K, new THREE.CircleGeometry(PR, 48), M.water, PX, 0.2, PZ);
    K.put(lathe([[0.001, 0], [0.3, 0], [0.32, 0.16], [0.16, 0.26], [0.12, 0.62], [0.28, 0.7], [0.001, 0.74]], 18), M.stone, PX, 0.15, PZ);
    for (let k = 0; k < 6; k++) {                                       // the jet's splash
      const a = k / 6 * Math.PI * 2;
      K.put(new THREE.SphereGeometry(0.07, 8, 6), paint(0xd8eef0, { hatch: 0 }), PX + Math.sin(a) * 0.2, 0.84 + (k % 2) * 0.07, PZ + Math.cos(a) * 0.2).userData.noInk = true;
    }
    for (let k = 0; k < 6; k++) {                                        // lily pads
      const a = R() * Math.PI * 2, r = 0.55 + R() * 0.7;
      const g = new THREE.CircleGeometry(0.13 + R() * 0.05, 12, 0.3, Math.PI * 2 - 0.6); g.rotateZ(R() * 6);
      lay(K, g, paint(0x6f9a5a, { hatch: 0 }), PX + Math.sin(a) * r, 0.21, PZ + Math.cos(a) * r);
    }
    K.foot(PX, PZ, PR + 0.3);
    // three sculptures on plinths round the far side of the ring, benches and topiary either side
    const plinth = (x, z) => { K.box(0.62, 0.6, 0.62, M.stone, x, 0.3, z, 0.05); K.box(0.74, 0.08, 0.74, M.stoneD, x, 0.64, z, 0.03); K.foot(x, z, 0.45); };
    const ring = PR + 1.85, at = (a) => [PX + Math.sin(a) * ring, PZ + Math.cos(a) * ring];
    { const [x, z] = at(mouth + 1.4); plinth(x, z);                          // three balanced pebbles
      for (const [y, r] of [[0.84, 0.24], [1.14, 0.19], [1.38, 0.13]]) K.put(new THREE.SphereGeometry(r, 16, 12).scale(1.25, 0.72, 1), M.stoneD, x + (y - 1.1) * 0.12, y, z); }
    { const [x, z] = at(mouth + Math.PI); plinth(x, z);                      // a bronze ring, on edge
      K.put(new THREE.TorusGeometry(0.32, 0.085, 12, 32), M.bronze, x, 1.02, z, [0, mouth, 0]); }
    { const [x, z] = at(mouth - 1.4); plinth(x, z);                          // a patina head, gazing at the pool
      K.put(lathe([[0.001, 0], [0.15, 0], [0.12, 0.12], [0.08, 0.2], [0.001, 0.22]], 16), M.patina, x, 0.68, z);
      K.put(new THREE.SphereGeometry(0.22, 18, 14).scale(0.85, 1.1, 0.95), M.patina, x, 1.06, z); }
    for (const da of [2.3, -2.3]) { const a = mouth + da, x = PX + Math.sin(a) * (PR + 1.75), z = PZ + Math.cos(a) * (PR + 1.75); gardenBench(K, x, z, a + Math.PI); }
    for (const da of [0.6, -0.6]) { const a = mouth + da; topiary(K, PX + Math.sin(a) * (PR + 1.7), PZ + Math.cos(a) * (PR + 1.7), 0.85); }
  }

  // ── behind: a rose garden, four beds round a flagstone cross ──
  const ROSE = 2.4;
  const rose = pick([[-4.45, -16.9], [-3.4, -17.8], [3.2, -17.6], [-2.2, -19.4], [2.0, -21.6], [8.6, -15.4], [-5.6, -15.8]], ROSE);
  if (rose) {
    const [GX, GZ] = rose;
    spurTo(GX, GZ, 1.95);
    path(K, [[GX, GZ + 1.95], [GX, GZ - 1.95]], 0.34, M.flag, 0.07, 1.4);
    path(K, [[GX - 1.95, GZ], [GX + 1.95, GZ]], 0.34, M.flag, 0.07, 1.4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const bx = GX + sx * 1.1, bz = GZ + sz * 1.1;
      flowerBed(K, bx, bz, 1.25, 1.25, R, { bushS: 0.34 });
      K.foot(bx, bz, 0.68);
    }
  }
  // trees round the back lawn and the east lawn, wherever they fit
  let n = 0;
  for (const [x, z, s] of [[10.85, -9.95, 0.7], [11.8, -11.3, 0.9], [12.0, -15.0, 0.85], [3.4, -20.4, 0.95], [-5.4, -19.5, 0.75], [-1.9, -21.2, 0.8], [1.2, -23.0, 0.9], [9.6, -19.6, 0.8], [-2.6, -15.6, 0.7]]) {
    if (n >= 6 || !spot(x, z, 0.8)) continue;
    specimen(K, x, z, s, R); placed.push([x, z, 0.8]); n++;
  }
  K.g.userData.keep = placed;                       // what it took ([x, z, r]): the shops' planting keeps off it
  return K.g;
}

// ── a project shop's cobbled approach (shop frame: the shop spans x ±2.8, z ±2.3, its door
// and stoop at +z). A cobbled forecourt across the front, a cobbled lane from it out to
// where the spur road now stops (ex, ez — or none), edging stones, planters, a lamp and a
// bench, and planting round the shop. ok(x, z, r) says a spot is free in the world (no
// road, water or anything solid); `shop` is the shop's raw groups, so nothing lands on
// its own props outside ──
export const APPROACH_STOP = 6.2;          // the spur stops this far from the shop's centre
export function shopApproach({ ex = null, ez = null, ok = () => true, shop = [], seed = 1 } = {}) {
  const K = kit(), M = mats(), R = rng(7919 * seed + 11);
  // the shop's own outside props, as occupied half-metre cells
  const busy = new Set(), v = new THREE.Vector3();
  for (const g of shop) {
    g.updateMatrixWorld(true);
    g.traverse(m => {
      if (!m.isMesh) return;
      const P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i += 3) {
        v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld);
        if (Math.abs(v.x) < 3.0 && v.z > -2.5 && v.z < 2.5) continue;
        busy.add(`${Math.round(v.x * 2)},${Math.round(v.z * 2)}`);
      }
    });
  }
  const placed = [];
  const clear = (x, z, r, { onPlaza = false } = {}) => {
    for (let i = Math.round((x - r) * 2); i <= Math.round((x + r) * 2); i++)
      for (let k = Math.round((z - r) * 2); k <= Math.round((z + r) * 2); k++) if (busy.has(`${i},${k}`)) return false;
    if (Math.abs(x) < 3.0 + r && z > -2.5 - r && z < 2.5 + r) return false;                 // the shop itself
    if (!onPlaza && inPaving(x, z, r)) return false;
    if (placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + r + 0.1)) return false;
    return ok(x, z, r);
  };
  const take = (x, z, r) => placed.push([x, z, r]);

  // the forecourt: a cobbled apron across the shopfront, rounded at its outer corners
  const FX = 3.45, Z0 = 2.3, Z1 = 5.1, CR = 1.5;
  const sh = new THREE.Shape();                    // drawn in (x, -z): lay() turns it flat
  sh.moveTo(-FX, -Z0); sh.lineTo(FX, -Z0); sh.lineTo(FX, -(Z1 - CR)); sh.quadraticCurveTo(FX, -Z1, FX - CR, -Z1);
  sh.lineTo(-FX + CR, -Z1); sh.quadraticCurveTo(-FX, -Z1, -FX, -(Z1 - CR)); sh.closePath();
  const outline = sh.getSpacedPoints(80).map(p => [p.x, -p.y]);
  lay(K, new THREE.ShapeGeometry(sh, 12), M.cobble, 0, 0.055, 0, 1.1);
  // the lane: from the forecourt's edge nearest the road's end, out to just under it
  let lane = null;
  if (ex != null) {
    let best = outline[0];
    for (const p of outline) if (p[1] > Z0 + 0.4 && Math.hypot(p[0] - ex, p[1] - ez) < Math.hypot(best[0] - ex, best[1] - ez)) best = p;
    const L = Math.hypot(ex - best[0], ez - best[1]);
    if (L > 0.5) {
      const dx = (ex - best[0]) / L, dz = (ez - best[1]) / L;
      const a = [best[0] - dx * 0.8, best[1] - dz * 0.8], e = [ex + dx * 0.5, ez + dz * 0.5];
      const pts = [a, [best[0] + dx * L * 0.35, best[1] + dz * L * 0.35], e];
      strip(K, pts, 1.05, M.edge, 0.047, 1.1);
      strip(K, pts, 0.98, M.cobble, 0.055, 1.1);
      lane = { ax: best[0], az: best[1], ex, ez };
    }
  }
  // paving test (forecourt or lane), for keeping plants off it
  function inPaving(x, z, r) {
    if (Math.abs(x) < FX + r && z > Z0 - r && z < Z1 + r) return true;
    if (lane) {
      const qx = lane.ex - lane.ax, qz = lane.ez - lane.az, t = Math.max(0, Math.min(1, ((x - lane.ax) * qx + (z - lane.az) * qz) / (qx * qx + qz * qz)));
      if (Math.hypot(x - lane.ax - qx * t, z - lane.az - qz * t) < 1.05 + r) return true;
    }
    return false;
  }
  // edging stones round the forecourt's outer edge (not along the shopfront, not across the lane)
  for (let i = 0; i < outline.length; i += 2) {
    const [x, z] = outline[i], [nx, nz] = outline[(i + 1) % outline.length];
    if (z < Z0 + 0.15) continue;
    if (lane && Math.hypot(x - lane.ax, z - lane.az) < 1.15) continue;
    K.put(rbox(0.28, 0.1, 0.16, 0.04, 1), M.stoneD, x, 0.07, z, [0, Math.atan2(nx - x, nz - z), 0]);
  }
  // planters at the forecourt's back corners, a lamp and a bench on it
  const planter = (x, z) => {
    K.box(0.62, 0.5, 0.62, M.stone, x, 0.25, z, 0.06);
    K.box(0.52, 0.06, 0.52, M.soil, x, 0.5, z, 0.02);
    for (let f = 0; f < 7; f++) K.put(new THREE.SphereGeometry(0.06, 8, 6), M.flowers[Math.floor(R() * M.flowers.length)], x + (R() - 0.5) * 0.4, 0.57 + R() * 0.05, z + (R() - 0.5) * 0.4);
    const b = bush(0.24); b.position.set(x, 0.5, z); K.g.add(b);
    K.foot(x, z, 0.4); take(x, z, 0.4);
  };
  for (const s of [-1, 1]) for (const [x, z] of [[s * 3.05, 2.85], [s * 2.95, 4.35]]) if (clear(x, z, 0.4, { onPlaza: true })) { planter(x, z); break; }
  const laneSide = lane ? Math.sign(lane.ax || 1) : 1;
  for (const [x, z] of [[laneSide * -2.3, 4.75], [laneSide * 2.3, 4.75], [laneSide * -1.8, 4.75]]) if (clear(x, z, 0.12, { onPlaza: true })) { bollard(K, x, z, 1.15); take(x, z, 0.12); break; }
  for (const [x, z] of [[laneSide * 1.75, 4.5], [laneSide * -1.75, 4.5]]) if (clear(x, z, 0.5, { onPlaza: true })) { gardenBench(K, x, z, Math.PI); take(x, z, 0.5); break; }
  // planting round the shop: trees at the sides and back, bushes and a bed or two
  let trees = 0;
  for (const [x, z, s] of [[-4.5, -1.2, 0.85], [4.5, -1.4, 0.8], [-3.6, -3.6, 0.95], [3.8, -3.5, 0.85], [0.4, -4.3, 1.0], [-4.9, 1.5, 0.75], [4.9, 1.3, 0.8], [-1.9, -4.4, 0.8]]) {
    if (trees >= 5 || !clear(x, z, 0.8)) continue;
    specimen(K, x, z, s, R); take(x, z, 0.8); trees++;
  }
  for (const [x, z] of [[-3.75, 1.9], [3.75, 1.9], [-3.6, 0.2], [3.6, 0.2], [-2.6, -3.0], [2.6, -3.0]]) {
    if (!clear(x, z, 0.4)) continue;
    const b = bush(0.36 + R() * 0.12); b.position.set(x, 0, z); b.rotation.y = R() * 6; K.g.add(b); take(x, z, 0.4);
  }
  for (const [x, z, w, d] of [[-4.2, 3.4, 0.9, 1.3], [4.2, 3.4, 0.9, 1.3]]) {
    if (!clear(x, z, 0.75)) continue;
    flowerBed(K, x, z, w, d, R, { bushS: 0.26 }); K.foot(x, z, 0.65); take(x, z, 0.75);
  }
  return K.g;
}
