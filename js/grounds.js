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
export function museumGrounds() {
  const K = kit(), M = mats(), R = rng(5153);
  // gravel walks from the side pavements round both wings, meeting behind the building
  // either side of the service ramp (x ±0.8, z −11.4…−14.1)
  path(K, [[-7.35, -1.3], [-8.05, -2.7], [-8.55, -4.6], [-8.55, -10.3], [-8.0, -12.4], [-5.6, -13.0], [-1.55, -13.0]], 0.42, M.gravel, 0.07, 1.2);
  path(K, [[8.55, -2.25], [8.95, -4.3], [9.0, -10.4], [8.5, -12.45], [5.6, -13.0], [1.55, -13.0]], 0.42, M.gravel, 0.07, 1.2);
  // box hedges along the walks' road side; a flower strip under the east wing's windows
  hedge(K, -9.12, -4.7, -9.12, -10.1);
  hedge(K, 9.67, -4.5, 9.67, -10.3);
  flowerBed(K, 8.05, -5.0, 0.55, 2.4, R, { bushS: 0 });
  flowerBed(K, 8.05, -9.4, 0.55, 2.0, R, { bushS: 0 });
  // low lamps along the walks
  for (const [x, z] of [[-7.95, -5.0], [-7.95, -10.6], [10.15, -5.6], [10.15, -9.4], [-4.2, -12.3], [4.2, -12.3]]) bollard(K, x, z);
  // the east lawn: two specimen trees between the walk and the road, a bench under them
  specimen(K, 10.85, -9.95, 0.7, R);
  specimen(K, 11.8, -11.3, 0.9, R);
  gardenBench(K, 10.45, -8.6, -Math.PI / 2);

  // ── behind, east: a sculpture garden round an ornamental pool ──
  const PX = 7.4, PZ = -17.2, PR = 1.8;
  path(K, [[8.35, -12.75], [7.95, -13.6], [PX, -14.3]], 0.42, M.flag, 0.07, 1.4);           // down from the walk
  lay(K, new THREE.RingGeometry(PR + 0.75, PR + 1.55, 64, 1), M.edge, PX, 0.062, PZ, 1.4);
  lay(K, new THREE.RingGeometry(PR + 0.82, PR + 1.48, 64, 1), M.flag, PX, 0.07, PZ, 1.4);
  K.put(lathe([[PR - 0.04, 0], [PR + 0.24, 0], [PR + 0.26, 0.26], [PR + 0.14, 0.32], [PR - 0.05, 0.3], [PR - 0.06, 0.05]], 56), M.stone, PX, 0, PZ);
  lay(K, new THREE.CircleGeometry(PR, 48), M.water, PX, 0.2, PZ);
  K.put(lathe([[0.001, 0], [0.3, 0], [0.32, 0.16], [0.16, 0.26], [0.12, 0.62], [0.28, 0.7], [0.001, 0.74]], 18), M.stone, PX, 0.15, PZ);
  for (let k = 0; k < 6; k++) {                                         // the jet's splash
    const a = k / 6 * Math.PI * 2;
    K.put(new THREE.SphereGeometry(0.07, 8, 6), paint(0xd8eef0, { hatch: 0 }), PX + Math.sin(a) * 0.2, 0.84 + (k % 2) * 0.07, PZ + Math.cos(a) * 0.2).userData.noInk = true;
  }
  for (let k = 0; k < 7; k++) {                                          // lily pads
    const a = R() * Math.PI * 2, r = 0.6 + R() * 0.9;
    const g = new THREE.CircleGeometry(0.14 + R() * 0.06, 12, 0.3, Math.PI * 2 - 0.6); g.rotateZ(R() * 6);
    lay(K, g, paint(0x6f9a5a, { hatch: 0 }), PX + Math.sin(a) * r, 0.21, PZ + Math.cos(a) * r);
  }
  K.foot(PX, PZ, PR + 0.3);
  // three sculptures on plinths round the outside of the ring, two benches facing the water
  const plinth = (x, z) => { K.box(0.7, 0.62, 0.7, M.stone, x, 0.31, z, 0.05); K.box(0.82, 0.08, 0.82, M.stoneD, x, 0.66, z, 0.03); K.foot(x, z, 0.5); };
  const ring = PR + 2.25;
  const at = (a) => [PX + Math.sin(a) * ring, PZ + Math.cos(a) * ring];
  { const [x, z] = at(0.95); plinth(x, z);                                  // three balanced pebbles
    for (const [y, r] of [[0.86, 0.26], [1.18, 0.2], [1.44, 0.14]]) K.put(new THREE.SphereGeometry(r, 16, 12).scale(1.25, 0.72, 1), M.stoneD, x + (y - 1.1) * 0.12, y, z); }
  { const [x, z] = at(2.4); plinth(x, z);                                   // a bronze ring, on edge
    K.put(new THREE.TorusGeometry(0.34, 0.09, 12, 32), M.bronze, x, 1.06, z, [0, 0.6, 0]); }
  { const [x, z] = at(-2.2); plinth(x, z);                                  // a patina head, gazing at the pool
    K.put(lathe([[0.001, 0], [0.16, 0], [0.13, 0.12], [0.09, 0.2], [0.001, 0.22]], 16), M.patina, x, 0.7, z);
    K.put(new THREE.SphereGeometry(0.24, 18, 14).scale(0.85, 1.1, 0.95), M.patina, x, 1.1, z); }
  for (const a of [-0.75, 3.75]) { const [x, z] = [PX + Math.sin(a) * (PR + 2.15), PZ + Math.cos(a) * (PR + 2.15)]; gardenBench(K, x, z, a + Math.PI); }
  for (const a of [Math.PI / 2, -Math.PI / 2]) { const [x, z] = [PX + Math.sin(a) * (PR + 1.95), PZ + Math.cos(a) * (PR + 1.95)]; topiary(K, x, z, 0.9); }
  bollard(K, PX - 0.75, PZ + PR + 1.75); bollard(K, PX + 0.75, PZ + PR + 1.75);

  // ── behind, west: a rose garden, four beds round a flagstone cross ──
  const GX = -4.45, GZ = -16.9;
  path(K, [[-4.45, -13.35], [GX, GZ], [GX, -19.6]], 0.36, M.flag, 0.07, 1.4);
  path(K, [[-6.7, GZ], [-2.25, GZ]], 0.36, M.flag, 0.07, 1.4);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const bx = GX + sx * 1.15, bz = GZ + sz * 1.15;
    flowerBed(K, bx, bz, 1.35, 1.35, R, { bushS: 0.36 });
    K.foot(bx, bz, 0.72);
  }
  gardenBench(K, GX, -20.15, 0);
  // more trees round the back lawn
  specimen(K, 12.0, -15.0, 0.85, R);
  specimen(K, 3.4, -20.4, 0.95, R);
  specimen(K, -5.4, -19.5, 0.75, R);
  specimen(K, -1.9, -21.2, 0.8, R);
  return K.g;
}
