// ─── LANDSCAPING: the museum's grounds, and the project shops' cobbled approaches ───
// Built in the frame of the thing they surround (the museum's, or each shop's: +Z faces
// the road, y up) and set down with placeOnPlanet(..., { sink: 0 }), so every vertex rides
// the terrain under it and the whole lot bakes to one mesh per material. Solid things
// leave K.foot markers (town.js feet() turns them into colliders).
import * as THREE from 'three';
import { PAL, paint } from './style.js';
import { rbox, lathe } from './props.js';
import { kit } from './buildings.js';
import { pondWater, spillMat, sheet } from './pondwater.js';

// a tiny seeded random, so the grounds come out the same every load
const rng = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

// ── hand-painted ground textures (tiled in metres) ──
// the cobbles' one scale: a COBBLE_TILE-metre tile of COBBLE_COURSES courses (setts 0.2 m deep),
// so every cobbled slab and lane lines up wherever two meet
export const COBBLE_TILE = 2.4, COBBLE_COURSES = 12;
function groundTex(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size, rng(size * 13 + 7));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
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
  // cobbles: hand-laid setts in running-bond courses. Courses of varied depth, stones of varied
  // length, every joint kept off the joints of the course before (no straight seams); each sett a
  // softly irregular rounded block (a noisy superellipse) in its own stone tint, domed — lit from
  // the upper left, shadowed lower right, a crescent of highlight — with a pencil line round it,
  // set in dark mortar. Seamless, and laid at one scale everywhere (COBBLE_TILE metres a tile,
  // uvs in metres in the patch's own frame), so every slab and lane shows the same stones
  const cobbleTex = groundTex(512, (c, n, R) => {
    c.fillStyle = '#5c5044'; c.fillRect(0, 0, n, n);                 // the mortar: dark, a little gritty
    for (let i = 0; i < 900; i++) { c.fillStyle = R() > 0.5 ? 'rgba(40,32,26,0.35)' : 'rgba(140,124,104,0.25)'; c.fillRect(R() * n, R() * n, 1.5, 1.5); }
    const rows = COBBLE_COURSES, J = 1.7;                              // courses; half a joint (px)
    const tints = [[34, 18, 66], [30, 14, 62], [38, 22, 68], [28, 10, 60], [42, 24, 63], [33, 7, 63], [26, 16, 57], [36, 28, 70], [31, 12, 70]];
    const stone = (x, y, w, hh) => {
      // the outline: a superellipse (rounded block), each its own squareness, wobbled a little
      const cx = x + w / 2, cy = y + hh / 2, a = w / 2 - J - R() * 0.8, b = hh / 2 - J - R() * 0.8;
      const pw = 2 / (3 + R() * 2.2), K = 14, ph = R() * 6.28, wob = 0.04 + R() * 0.05, tilt = (R() - 0.5) * 0.09;
      const pts = [];
      for (let k = 0; k < K; k++) {
        const t = (k / K) * Math.PI * 2, ct = Math.cos(t), st = Math.sin(t);
        const rr = 1 + wob * Math.sin(t * 2 + ph) + (R() - 0.5) * 0.07;
        const px = Math.sign(ct) * Math.abs(ct) ** pw * a * rr, py = Math.sign(st) * Math.abs(st) ** pw * b * rr;
        pts.push([cx + px - py * tilt, cy + py + px * tilt]);
      }
      const outline = (ox, dx = 0, dy = 0) => {                        // smooth: quadratic curves through the midpoints
        c.beginPath();
        for (let k = 0; k <= K; k++) {
          const p0 = pts[k % K], p1 = pts[(k + 1) % K], mx = (p0[0] + p1[0]) / 2 + ox + dx, my = (p0[1] + p1[1]) / 2 + dy;
          if (k === 0) c.moveTo(mx, my); else c.quadraticCurveTo(p0[0] + ox + dx, p0[1] + dy, mx, my);
        }
        c.closePath();
      };
      const [hu, sa, li] = tints[Math.floor(R() * tints.length)], dl = (R() - 0.5) * 7, dh = (R() - 0.5) * 6;
      const crescent = R(), specks = Array.from({ length: 6 }, () => [cx + (R() - 0.5) * a * 1.5, cy + (R() - 0.5) * b * 1.4, 0.6 + R() * 1.0, R() > 0.5]);
      for (const ox of [-n, 0, n]) {                                   // wrapped copies: seamless across the tile's edge
        if (x + w + ox < 0 || x + ox > n) continue;
        outline(ox);
        c.fillStyle = `hsl(${hu + dh},${sa}%,${li + dl}%)`; c.fill();
        c.save(); c.clip();
        // the dome: a soft light toward the upper left, falling into shade at the lower right
        const g = c.createRadialGradient(cx + ox - a * 0.32, cy - b * 0.38, 0, cx + ox - a * 0.1, cy - b * 0.1, Math.max(a, b) * 1.25);
        g.addColorStop(0, 'rgba(255,250,236,0.42)'); g.addColorStop(0.42, 'rgba(255,250,236,0.06)');
        g.addColorStop(0.75, 'rgba(70,52,36,0.10)'); g.addColorStop(1, 'rgba(60,44,30,0.42)');
        c.fillStyle = g; c.fillRect(x + ox - 2, y - 2, w + 4, hh + 4);
        c.lineWidth = hh * 0.2; c.strokeStyle = 'rgba(64,48,34,0.22)';  // its shaded lower-right flank
        outline(ox, hh * 0.08, hh * 0.1); c.stroke();
        for (const [sx, sy, sr, lt] of specks) { c.fillStyle = lt ? 'rgba(255,250,236,0.22)' : 'rgba(84,66,50,0.18)'; c.beginPath(); c.arc(sx + ox, sy, sr, 0, 7); c.fill(); }
        c.restore();
        if (crescent > 0.25) {                                         // a hand-drawn crescent of light on the dome
          c.strokeStyle = 'rgba(255,252,242,0.55)'; c.lineWidth = 1.6; c.lineCap = 'round';
          c.beginPath(); c.ellipse(cx + ox, cy, a * 0.68, b * 0.58, 0, Math.PI * (1.08 + crescent * 0.1), Math.PI * (1.42 + crescent * 0.12)); c.stroke();
        }
        c.strokeStyle = 'rgba(44,34,26,0.55)'; c.lineWidth = 1.3;     // the pencil line round it
        outline(ox); c.stroke();
      }
    };
    // course depths: varied, summing to the tile exactly. The first course (the canvas's top: the
    // tile's v 1 - 1/COBBLE_COURSES…1) is exactly a twelfth deep: cobbleSlab's border course of
    // long setts is that one course, mapped along the edge
    const hs = Array.from({ length: rows - 1 }, () => 0.82 + R() * 0.36), hk = (n - n / rows) / hs.reduce((s, v) => s + v, 0);
    const wrapD = (p, q) => { const d = Math.abs(p - q) % n; return Math.min(d, n - d); };
    let y = 0, prev = null, first = null;
    for (let r = 0; r < rows; r++) {
      const h = r === 0 ? n / rows : hs[r - 1] * hk;
      let best = null;
      for (let tries = 0; tries < 40; tries++) {                        // running bond: keep the joints off the last course's
        const ws = []; let sum = 0;
        while (sum < n - h * 0.8) { const w = h * (1.05 + R() * 0.95); ws.push(w); sum += w; }
        const k = n / sum, x0 = R() * n, joints = []; let x = x0;
        for (const w of ws) { joints.push(x % n); x += w * k; }
        const near = (js) => js ? Math.min(...joints.map(j => Math.min(...js.map(q => wrapD(j, q))))) : n;
        const score = Math.min(near(prev), r === rows - 1 ? near(first) : n);
        if (!best || score > best.score) best = { ws: ws.map(w => w * k), x0, joints, score };
        if (score > h * 0.38) break;
      }
      let x = best.x0;
      for (const w of best.ws) { stone(x % n, y, w, h); x += w; }
      prev = best.joints; if (r === 0) first = best.joints;
      y += h;
    }
  });
  // mulch: dark bark chips
  const mulchTex = groundTex(128, (c, n, R) => {
    c.fillStyle = '#6e4c38'; c.fillRect(0, 0, n, n);
    for (let i = 0; i < 220; i++) { c.fillStyle = ['#8a6248', '#5a3c2c', '#9a7356'][Math.floor(R() * 3)]; c.save(); c.translate(R() * n, R() * n); c.rotate(R() * 3); c.fillRect(-3, -1.2, 6 + R() * 4, 2.4); c.restore(); }
  });
  // a pool's floor: pale plaster under the water, soft pebbles and a few darker stones
  const bedTex = groundTex(128, (c, n, R) => {
    c.fillStyle = '#c9d6c8'; c.fillRect(0, 0, n, n);
    for (let i = 0; i < 90; i++) { c.fillStyle = ['rgba(120,140,128,0.35)', 'rgba(250,250,240,0.5)', 'rgba(160,150,120,0.4)'][Math.floor(R() * 3)]; c.beginPath(); c.ellipse(R() * n, R() * n, 1.5 + R() * 3, 1 + R() * 2.2, R() * 3, 0, 7); c.fill(); }
  });
  // painted bay lines: chalky white, a little worn. (It has a texture so it bakes as its own mesh
  // and keeps its polygon offset: a plain flat-colour paint is merged into the vertex-colour
  // bucket by placeOnPlanet's bake, which dropped the offset and hid the old lines under the cobbles)
  const lineTex = groundTex(64, (c, n, R) => {
    c.fillStyle = '#f6f2e8'; c.fillRect(0, 0, n, n);
    for (let i = 0; i < 40; i++) { c.fillStyle = R() > 0.5 ? 'rgba(160,150,130,0.35)' : 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(R() * n, R() * n, 1 + R() * 2.5, 0, 7); c.fill(); }
  });
  // draped surfaces, layered so where two meet the upper one always wins cleanly: the edging
  // (−2, lowest), then gravel, cobbles and a pool's floor (−3), flagstones over them (−5), painted
  // lines (−5, never on flagstones). Each also rides a few mm higher than the one it covers. Where
  // two pieces of the SAME surface overlap (a lane running into its forecourt, a path into its paved
  // ring, a flagstone cross) their textures are laid in the same metres (planar), so the overlap is invisible
  const flat = (o, tier = -3) => { const m = paint(0xffffff, { hatch: 0, side: THREE.DoubleSide, ...o }); m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = tier; return m; };
  _M = {
    line: flat({ map: lineTex }, -5),
    gravel: flat({ map: gravelTex }), flag: flat({ map: flagTex }, -5), cobble: flat({ map: cobbleTex }), bed: flat({ map: bedTex }),
    edge: (() => { const m = paint(0xb9ad95, { hatch: 0, side: THREE.DoubleSide }); m.polygonOffset = true; m.polygonOffsetFactor = m.polygonOffsetUnits = -2; return m; })(),
    stone: paint(0xd6cbb4), stoneD: paint(0xb3a68c), soil: paint(0x8a6a52, { hatch: 0 }), mulch: paint(0x7a5640, { map: mulchTex }),
    hedge: paint(0x5f8a4e), hedgeD: paint(0x4f7a44), water: paint(PAL.water, { hatch: 0 }),
    dark: paint(PAL.ink, { hatch: 0 }), glow: paint(0xfff1c8, { emissive: 0xffd98a, hatch: 0 }),
    wood: paint(PAL.bark), bronze: paint(0xb07a3e), patina: paint(0x6fa596), terracotta: paint(PAL.terracotta ?? 0xc8714f),
    flowers: [0xe8604c, 0xe1b95c, 0xf6eedb, 0xdc9e9a, 0x8f7ae8, 0xf2a07a].map(c => paint(c, { hatch: 0 })),
  };
  return _M;
}

// a flat ribbon down a smoothed polyline [[x, z], ...] at height y, its texture tiled in metres
// (`planar`: uvs straight from x, z — as lay() maps them — so a cobbled lane running into a
// cobbled slab shows the very same stones where they overlap: one surface, no seam, no fight)
function strip(K, pts, half, mat, y, tile = 1, closed = false, planar = false) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
  const L = curve.getLength(), n = Math.max(2, Math.ceil(L / 0.3));
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = closed ? (i % n) / n : i / n, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    const sx = -tg.z, sz = tg.x;                                   // across the path, in xz
    for (const s of [-1, 1]) {
      const X = p.x + sx * half * s, Z = p.z + sz * half * s;
      pos.push(X, y, Z);
      if (planar) uv.push(X / tile, Z / tile); else uv.push((s * half) / tile, (i / n) * L / tile);
    }
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = K.put(g, mat); m.userData.noInk = true;
  return curve;
}
// a path: the walking surface and, a hair below and a touch wider, a stone edging line
function path(K, pts, half, mat, y = 0.01, tile = 1, worldUV = false) {
  const M = mats();
  strip(K, pts, half + 0.07, M.edge, y - 0.008, tile);
  return strip(K, pts, half, mat, y, tile, false, worldUV);
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
// ── cobbles, shared by every cobbled place (shop forecourts, Makers' Row, any later one) ──
// a cobbled slab: a flat shape (drawn in (x, -z), as for lay()) at the one cobble scale, framed by
// a border course of long setts (`border` m wide) laid along its edge — fanning round the curves —
// and the field inside it. One surface: the field is the shape inset by the border, the border
// a ring between the two outlines sharing the field's edge vertices, so nothing overlaps (no
// fight) and nothing gaps; both one material, so one draw. The border is the texture's first
// course (exactly 1/COBBLE_COURSES deep) run along the edge: its setts are border/0.2 times the
// field's, closing seamlessly round the loop
export function cobbleSlab(K, shape, curveSegs = 12, { border = 0.34 } = {}) {
  const mat = mats().cobble;
  if (!border) return lay(K, new THREE.ShapeGeometry(shape, curveSegs), mat, 0, 0.01, 0, COBBLE_TILE);
  // the outline as drawn (lines keep their exact corners), as a ccw loop without repeats
  let O = shape.extractPoints(curveSegs).shape.map(p => [p.x, p.y]);
  O = O.filter((p, i) => { const q = O[(i + 1) % O.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
  let area = 0; for (let i = 0; i < O.length; i++) { const a = O[i], b = O[(i + 1) % O.length]; area += a[0] * b[1] - b[0] * a[1]; }
  if (area < 0) O.reverse();
  // the inner outline: each point moved in by the border (mitred, so straight edges stay parallel)
  const N = O.length, I = O.map((p, i) => {
    const a = O[(i + N - 1) % N], b = O[(i + 1) % N];
    const n1 = [-(p[1] - a[1]), p[0] - a[0]], n2 = [-(b[1] - p[1]), b[0] - p[0]];      // inward (left of a ccw loop)
    const l1 = Math.hypot(...n1), l2 = Math.hypot(...n2);
    const mx = n1[0] / l1 + n2[0] / l2, my = n1[1] / l1 + n2[1] / l2, ml = Math.hypot(mx, my) || 1;
    const k = border / Math.max(0.35, (mx / ml) * (n1[0] / l1) + (my / ml) * (n1[1] / l1));
    return [p[0] + mx / ml * k, p[1] + my / ml * k];
  });
  // the field: the inset shape, mapped like every other cobbled surface
  lay(K, new THREE.ShapeGeometry(new THREE.Shape(I.map(([x, y]) => new THREE.Vector2(x, y)))), mat, 0, 0.01, 0, COBBLE_TILE);
  // the border ring: u along the edge (a whole number of tiles round the loop), v across one course
  const S = [0]; for (let i = 1; i <= N; i++) S.push(S[i - 1] + Math.hypot(O[i % N][0] - O[i - 1][0], O[i % N][1] - O[i - 1][1]));
  const T = border * COBBLE_COURSES, ku = Math.max(1, Math.round(S[N] / T)) / S[N];
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const o = O[i % N], q = I[i % N];
    pos.push(o[0], o[1], 0, q[0], q[1], 0);
    uv.push(S[i] * ku, 1, S[i] * ku, 1 - 1 / COBBLE_COURSES);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.rotateX(-Math.PI / 2); g.computeVertexNormals();
  const m = K.put(g, mat, 0, 0.01, 0); m.userData.noInk = true;
  return m;
}
// a cobbled lane down a polyline, mapped like the slabs so where it runs into one they match
export function cobbleLane(K, pts, half) {
  return strip(K, pts, half, mats().cobble, 0.01, COBBLE_TILE, false, true);
}
// a kerb of long dressed stones along a dense polyline [[x, z], ...] (a slab's outline, a
// lane's side): low, bevelled, laid end to end with a hairline joint, each stone as long as
// the line stays straight under it (shorter round the curves). skip(x, z) leaves gaps (the
// shopfront, a road's mouth). All one material (the grounds' pale stone), inked like the rest.
export function kerbRun(K, pts, { skip = () => false, closed = false, seed = 5 } = {}) {
  const M = mats(), R = rng(seed * 7717 + 3);
  const W = 0.2, H = 0.1, Y = 0.025, GAP = 0.035, DEV = 0.018;
  const P = closed ? pts.concat([pts[0]]) : pts;
  const runs = []; let cur = [];
  for (const p of P) { if (skip(p[0], p[1])) { if (cur.length > 1) runs.push(cur); cur = []; } else cur.push(p); }
  if (cur.length > 1) runs.push(cur);
  if (closed && runs.length > 1 && !skip(...pts[0])) {             // a loop cut by gaps: join its two ends
    const last = runs.pop(); runs[0] = last.concat(runs[0].slice(1));
  }
  const stone = (a, b, end0, end1) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 0.12) return;
    const g0 = end0 ? 0 : GAP / 2, g1 = end1 ? 0 : GAP / 2, len = L - g0 - g1;
    const ux = dx / L, uz = dz / L, c = (g0 + len / 2);
    K.box(len, H, W, M.stone, a[0] + ux * c, Y, a[1] + uz * c, 0.03, [0, Math.atan2(-dz, dx), 0]);
  };
  for (const run of runs) {
    // resample evenly, then grow each stone along the run while it stays straight
    const q = [run[0]];
    for (let i = 1; i < run.length; i++) {
      const [x0, z0] = run[i - 1], [x1, z1] = run[i], d = Math.hypot(x1 - x0, z1 - z0), k = Math.max(1, Math.ceil(d / 0.05));
      for (let j = 1; j <= k; j++) q.push([x0 + (x1 - x0) * j / k, z0 + (z1 - z0) * j / k]);
    }
    let i = 0;
    while (i < q.length - 1) {
      const want = 0.6 + R() * 0.06;                                  // even dressed stones (a touch of hand-cut variety)
      let j = i + 1, len = 0;
      for (; j < q.length; j++) {
        len += Math.hypot(q[j][0] - q[j - 1][0], q[j][1] - q[j - 1][1]);
        const ax = q[i][0], az = q[i][1], bx = q[j][0], bz = q[j][1], L = Math.hypot(bx - ax, bz - az) || 1;
        let dev = 0;
        for (let m = i + 1; m < j; m++) dev = Math.max(dev, Math.abs((q[m][0] - ax) * (bz - az) - (q[m][1] - az) * (bx - ax)) / L);
        if (dev > DEV) { j--; break; }
        if (len >= want) break;
      }
      j = Math.min(Math.max(j, i + 1), q.length - 1);
      // don't leave a stub at the run's end: take it into this stone if it's short
      let rest = 0; for (let m = j + 1; m < q.length; m++) rest += Math.hypot(q[m][0] - q[m - 1][0], q[m][1] - q[m - 1][1]);
      if (rest > 0 && rest < 0.25) {
        const ax = q[i][0], az = q[i][1], bx = q[q.length - 1][0], bz = q[q.length - 1][1], L = Math.hypot(bx - ax, bz - az) || 1;
        let dev = 0; for (let m = i + 1; m < q.length - 1; m++) dev = Math.max(dev, Math.abs((q[m][0] - ax) * (bz - az) - (q[m][1] - az) * (bx - ax)) / L);
        if (dev < DEV * 1.5) j = q.length - 1;
      }
      stone(q[i], q[j], i === 0, j === q.length - 1);
      i = j;
    }
  }
}
// a low lamp on a post, knee to waist high (the grounds' lamps, not the street's)
function bollard(K, x, z, h = 0.9) {
  const M = mats();
  K.put(lathe([[0.001, 0], [0.09, 0], [0.09, 0.05], [0.05, 0.1], [0.04, h - 0.08], [0.07, h - 0.04], [0.001, h]], 10), M.dark, x, 0, z);
  K.put(lathe([[0.001, 0], [0.07, 0.01], [0.09, 0.1], [0.06, 0.2], [0.001, 0.22]], 12), M.glow, x, h, z);
  K.put(lathe([[0.001, 0], [0.11, 0], [0.03, 0.07], [0.001, 0.1]], 12), M.dark, x, h + 0.2, z);
  K.foot(x, z, 0.1).userData.lampMark = 'low';
}
// a bench's footprint: three circles down its length (it's 1.2 long, 0.38 deep), for the
// colliders and for the placement check — one round one stuck out 0.25 in front of the seat
const benchFoot = (x, z, ry) => [-0.42, 0, 0.42].map(u => [x + u * Math.cos(ry), z - u * Math.sin(ry), 0.22]);
function gardenBench(K, x, z, ry) {
  const M = mats(), s = K.sub(x, 0, z, ry);
  s.box(1.2, 0.07, 0.38, M.wood, 0, 0.42, 0, 0.025);
  s.box(1.2, 0.28, 0.06, M.wood, 0, 0.63, -0.17, 0.025, [-0.12, 0, 0]);
  for (const sx of [-0.52, 0.52]) s.box(0.06, 0.46, 0.36, M.dark, sx, 0.19, 0, 0.02);
  for (const [fx, fz, r] of benchFoot(x, z, ry)) K.foot(fx, fz, r);
}
// ── planting: plants are listed (plants.js grows them on the drawn ground after placement,
// merged per colour, nodding in the breeze). A bed is filled in layers — tall at the back,
// low at the front, something spilling over the edge — from a harmonious palette ──
const PALETTES = [
  { tall: ['cosmos', 'spikes'], mid: ['tulip', 'bloom'], low: ['daisy', 'trail'], c: [0xd8508a, 0xf2a0b4, 0xf6eedb], spike: 0x9c8ad8 },   // pinks and lavender
  { tall: ['spikes', 'grass'], mid: ['tulip', 'mound'], low: ['daisy', 'trail'], c: [0xf2c14e, 0xf29a4a, 0xf6eedb], spike: 0x6676d6 },    // gold, orange and blue salvia
  { tall: ['cosmos', 'grass'], mid: ['bloom', 'tulip'], low: ['daisy', 'trail'], c: [0xe8604c, 0xf27a6a, 0xf6eedb], spike: 0xe8604c },    // reds and corals
  { tall: ['spikes', 'cosmos'], mid: ['mound', 'tulip'], low: ['trail', 'daisy'], c: [0x8f7ae8, 0xf6eedb, 0xf2a0b4], spike: 0x9c8ad8 },  // violets and whites
];
function plant(K, k, x, z, o = {}) { (K.g.userData.plants ||= []).push({ k, x, z, ...o }); }
// fill a rectangle (w × d, its back at −z unless `front` says which way the path is) at height y
function fillBed(K, x, z, w, d, R, y, { pal = PALETTES[Math.floor(R() * PALETTES.length)], front = [0, 1], edge = true } = {}) {
  const [fx, fz] = front, ax = fz, az = -fx;                     // along the bed: perpendicular to the front
  const at = (u, v) => [x + ax * u + fx * v, z + az * u + fz * v];    // u along, v toward the front
  const L = Math.abs(ax) > 0.5 ? w : d, D = Math.abs(ax) > 0.5 ? d : w;
  const rows = [[-D / 2 + 0.16, pal.tall, 1.45], [0, pal.mid, 1.4], [D / 2 - 0.14, pal.low, 1.3]];
  for (const [v, kinds, sc] of rows) {
    if (D < 0.7 && v === 0) continue;
    const n = Math.max(3, Math.round(L / (kinds === pal.mid ? 0.24 : 0.17)));
    for (let i = 0; i < n; i++) {
      const u = -L / 2 + (i + 0.5) * L / n + (R() - 0.5) * 0.08, k = kinds[(i + Math.floor(R() * 2)) % kinds.length];
      const [px, pz] = at(u, v + (R() - 0.5) * 0.08);
      const c = k === 'spikes' ? pal.spike : pal.c[Math.floor(R() * pal.c.length)];
      plant(K, k, px, pz, { y, s: sc * (0.85 + R() * 0.3), c: k === 'mound' || k === 'grass' ? undefined : c, ry: k === 'trail' ? Math.atan2(fx, fz) + (R() - 0.5) * 0.6 : undefined });
    }
  }
  if (edge) for (let i = 0, n = Math.max(2, Math.round(L / 0.3)); i < n; i++) {   // a clipped box edge along the front
    const [px, pz] = at(-L / 2 + (i + 0.5) * L / n, D / 2 + 0.02);
    plant(K, 'boxBall', px, pz, { y, s: 1 });
  }
}
// a flower bed: a stone kerb (round or rounded-square), mulch, and layered planting
function flowerBed(K, x, z, w, d, R, { round = false, kerb = true, front = [0, 1] } = {}) {
  const M = mats();
  if (round) {
    const r = w / 2;
    if (kerb) K.put(lathe([[r - 0.06, -0.05], [r + 0.04, -0.05], [r + 0.04, 0.16], [r - 0.06, 0.16]], 28), M.stone, x, 0, z);
    K.put(lathe([[0.001, 0.1], [r - 0.06, 0.1], [r - 0.08, 0.15], [0.001, 0.16]], 28), M.mulch, x, 0, z);
    const pal = PALETTES[Math.floor(R() * PALETTES.length)];
    plant(K, R() > 0.5 ? 'bloom' : 'grass', x, z, { y: 0.15, s: 1.1 });
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28, rr = r * 0.62; plant(K, pal.low[i % 2], x + Math.sin(a) * rr, z + Math.cos(a) * rr, { y: 0.15, c: pal.c[i % pal.c.length], ry: a }); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28 + 0.6, rr = r * 0.34; plant(K, pal.mid[i % 2], x + Math.sin(a) * rr, z + Math.cos(a) * rr, { y: 0.15, c: pal.c[(i + 1) % pal.c.length] }); }
    return;
  }
  if (kerb) K.box(w + 0.1, 0.2, d + 0.1, M.stone, x, 0.06, z, 0.04);
  K.box(w - 0.04, 0.06, d - 0.04, M.mulch, x, 0.15, z, 0.02);
  fillBed(K, x, z, w - 0.1, d - 0.1, R, 0.18, { front, edge: false });
}
// a square bed planted as a little island: a feature plant in the middle, rings round it
function islandBed(K, x, z, w, R) {
  const M = mats(), pal = PALETTES[Math.floor(R() * PALETTES.length)];
  K.box(w + 0.1, 0.2, w + 0.1, M.stone, x, 0.06, z, 0.04);
  K.box(w - 0.04, 0.06, w - 0.04, M.mulch, x, 0.15, z, 0.02);
  plant(K, R() > 0.5 ? 'spikes' : 'grass', x, z, { y: 0.18, s: 1.3, c: pal.spike });
  const h = w / 2 - 0.16;
  for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) plant(K, pal.tall[(u + v + 2) / 2 % 2], x + u * h * 0.55, z + v * h * 0.55, { y: 0.18, c: pal.tall[(u + v + 2) / 2 % 2] === 'spikes' ? pal.spike : pal.c[(u + 1) / 2], s: 1.15 });
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28 + 0.4; plant(K, pal.low[i % 2], x + Math.sin(a) * h, z + Math.cos(a) * h, { y: 0.18, c: pal.c[i % pal.c.length], ry: a, s: 1.25 }); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + 1.2; plant(K, pal.mid[i % 2] === 'bloom' || pal.mid[i % 2] === 'mound' ? 'tulip' : pal.mid[i % 2], x + Math.sin(a) * h * 0.5, z + Math.cos(a) * h * 0.5, { y: 0.18, c: pal.c[(i + 2) % pal.c.length], s: 1.3 }); }
}
// a trough planter (stone box, mulch, planted, something trailing over the front)
function trough(K, x, z, R, { w = 0.62, d = 0.62, h = 0.56, front = [0, 1] } = {}) {
  const M = mats();
  K.box(w, h, d, M.stone, x, h / 2 - 0.06, z, 0.06);
  K.box(w - 0.1, 0.05, d - 0.1, M.mulch, x, h - 0.07, z, 0.02);
  const pal = PALETTES[Math.floor(R() * PALETTES.length)];
  plant(K, pal.mid[0] === 'mound' ? 'grass' : 'bloom', x - front[0] * 0.08, z - front[1] * 0.08, { y: h - 0.06, s: 0.75 });
  for (const s2 of [-1, 1]) plant(K, 'trail', x + front[0] * (d / 2 - 0.08) + front[1] * s2 * 0.13, z + front[1] * (d / 2 - 0.08) - front[0] * s2 * 0.13, { y: h - 0.06, s: 0.9, c: pal.c[0], ry: Math.atan2(front[0], front[1]) });
  plant(K, 'tulip', x + front[1] * 0.16, z - front[0] * 0.16, { y: h - 0.06, s: 0.85, c: pal.c[1] });
  plant(K, 'tulip', x - front[1] * 0.16, z + front[0] * 0.16, { y: h - 0.06, s: 0.85, c: pal.c[2] });
  K.foot(x, z, Math.max(w, d) / 2 + 0.05);
}
// a clipped hedge along a run of points [[x, z], …] (the line its middle follows, sampled off a
// path's edge): a rounded profile — sides leaning in a touch to a soft top — swept along the
// smoothed line, domed down at both ends, its foot sunk below the ground. It leaves colliders
// down its length, so she walks beside it, never on it. Returns its footprint circles
function hedgeRun(K, pts, h = 0.45, w = 0.34, { feet = true } = {}) {
  const M = mats(), hw = w / 2, tw = hw * 0.9, rc = 0.12, FOOT = -0.13;
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const L = curve.getLength(), n = Math.max(2, Math.ceil(L / 0.1));
  const prof = [[hw, FOOT], [hw * 0.99, h * 0.35]];
  for (let k = 0; k <= 5; k++) { const a = k / 5 * Math.PI / 2; prof.push([tw - rc + rc * Math.cos(a), h - rc + rc * Math.sin(a)]); }
  for (let k = 0; k <= 5; k++) { const a = Math.PI / 2 + k / 5 * Math.PI / 2; prof.push([-tw + rc + rc * Math.cos(a), h - rc + rc * Math.sin(a)]); }
  prof.push([-hw * 0.99, h * 0.35], [-hw, FOOT]);
  const P = prof.length, pos = [], idx = [];
  // rings: [point, tangent, width scale, height scale] — the start cap (tip first), the body, the end cap
  const rings = [], CAP = 5, ring = (t, back, a) => {
    const p = curve.getPointAt(t), tg = curve.getTangentAt(t);
    rings.push([p.clone().addScaledVector(tg, back * hw * Math.sin(a)), tg, Math.cos(a), Math.sqrt(Math.cos(a))]);
  };
  for (let k = CAP; k >= 1; k--) ring(0, -1, k / CAP * Math.PI / 2 * 0.94);
  for (let i = 0; i <= n; i++) ring(i / n, 0, 0);
  for (let k = 1; k <= CAP; k++) ring(1, 1, k / CAP * Math.PI / 2 * 0.94);
  for (const [p, tg, f, hs] of rings) {
    const sx = -tg.z, sz = tg.x;
    for (const [u, v] of prof) pos.push(p.x + sx * u * f, FOOT + (v - FOOT) * hs, p.z + sz * u * f);
  }
  for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k + 1 < P; k++) {
    const a = r * P + k, b = a + P;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // close each tip with a fan to its middle
  for (const [r, fwd] of [[0, false], [rings.length - 1, true]]) {
    const c = pos.length / 3, [p, , , hs] = rings[r];
    pos.push(p.x, FOOT + (h * 0.5 - FOOT) * hs, p.z);
    for (let k = 0; k + 1 < P; k++) fwd ? idx.push(r * P + k, c, r * P + k + 1) : idx.push(r * P + k, r * P + k + 1, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  K.put(g, M.hedge);
  const foot = [];
  for (let i = 0, m = Math.max(1, Math.round(L / 0.3)); i <= m; i++) { const p = curve.getPointAt(i / m); foot.push([p.x, p.z, hw + 0.03]); if (feet) K.foot(p.x, p.z, hw + 0.03); }
  return foot;
}
// a straight clipped hedge from (x0, z0) to (x1, z1): the same swept, smooth profile (its caller
// lays its own colliders)
function hedge(K, x0, z0, x1, z1, h = 0.45, w = 0.34) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5));
  return hedgeRun(K, Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n]), h, w, { feet: false });
}
// everything in the grounds but the paving is a prop she can't stand on (a hedge top, a bench
// seat, a planter rim, a pool rim, a kerb stone): walkable() lists the paving
function solidify(K, ...walkable) {
  const walk = new Set([mats().gravel, mats().flag, mats().cobble, mats().edge, mats().line, ...walkable]);
  K.g.traverse(o => { if (o.isMesh && !walk.has(o.material)) o.userData.noGround = true; });
}
// a tree: a mix of kinds (blossom, birch, autumn maple, cypress, a round shade tree)
const TREES = ['blossom', 'maple', 'birch', 'shade', 'cypress', 'blossom', 'maple', 'birch'];
let _treeN = 0;
function specimen(K, x, z, s, R, kind = null) {
  plant(K, kind ?? TREES[(_treeN++ + Math.floor(R() * 3)) % TREES.length], x, z, { s: s * 1.05 });
  K.foot(x, z, 0.3);
}
// a shrub on the lawn: a mounding shrub or a flowering bush, a grass clump beside it
function shrub(K, x, z, R) {
  plant(K, R() > 0.45 ? 'bloom' : 'mound', x, z, { s: 1.1 + R() * 0.4 });
  if (R() > 0.4) plant(K, 'grass', x + 0.38, z + 0.15, { s: 0.9 });
}
// clipped topiary in a stone pot: a cone, a spiral or a ball on a stem
function topiary(K, x, z, s = 1, kind = 'spiral') {
  const M = mats();
  K.put(lathe([[0.001, -0.05], [0.24, -0.05], [0.28, 0.3], [0.31, 0.34], [0.001, 0.34]], 16).scale(s, s, s), M.stone, x, 0, z);
  plant(K, kind, x, z, { y: 0.3 * s, s });
  K.foot(x, z, 0.3 * s);
}

// ── the museum's grounds (museum frame: the building spans x ±6.8, z −2.4…−11.6 with its
// stylobate; the forecourt disc is r 3.3 round (0, −0.3); roads run past both sides,
// close at the front, opening out behind) ──
export function museumGrounds({ ok = () => true, pool: poolAt = null } = {}) {
  const K = kit(), M = mats(), R = rng(5153);
  // optional pieces go where ok() says the world is free (no road, water, or a project shop
  // and its approach) and they don't overlap each other; the first free candidate wins
  const placed = [];
  const free = (x, z, r) => !placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + r + 0.15) && ok(x, z, r);
  const onWalk = (x, z, r) => (Math.abs(Math.abs(x) - 8.6) < 0.6 + r && z < -2 && z > -12.6) || (Math.abs(z + 13.0) < 0.6 + r && Math.abs(x) < 8.6);
  const spot = (x, z, r) => !onWalk(x, z, r) && !(Math.abs(x) < 7.2 + r && z > -12.1 - r && z < -2.2 + r) && free(x, z, r);
  const pick = (cands, r) => { for (const [x, z] of cands) if (spot(x, z, r)) { placed.push([x, z, r]); return [x, z]; } return null; };
  // the walk-side furniture and hedges keep out of each other: every footprint is a few circles
  // ([x, z, r]), checked against all the others before it's built (a lamp stood in a bench once)
  const fp = [];
  const fits = (cs, gap = 0.08) => cs.every(([x, z, r]) => fp.every(([a, b, c]) => Math.hypot(a - x, b - z) >= r + c + gap));
  const claim = (cs) => { fp.push(...cs); placed.push(...cs); };
  // gravel walks from the side pavements round both wings, meeting behind the building
  // either side of the service ramp (x ±0.8, z −11.4…−14.1)
  const walks = [
    path(K, [[-7.35, -1.3], [-7.9, -2.7], [-8.25, -4.6], [-8.25, -10.3], [-7.85, -12.4], [-5.6, -13.0], [-1.55, -13.0]], 0.42, M.gravel, 0.01, 1.2),
    path(K, [[8.55, -2.25], [8.95, -4.3], [9.0, -10.4], [8.5, -12.45], [5.6, -13.0], [1.55, -13.0]], 0.42, M.gravel, 0.01, 1.2),
  ];
  // a walk sampled every ~0.25: its middle, and the way out (away from the building's middle)
  const along = (curve) => {
    const L = curve.getLength(), n = Math.ceil(L / 0.25), out = [];
    for (let i = 0; i <= n; i++) {
      const p = curve.getPointAt(i / n), tg = curve.getTangentAt(i / n);
      let nx = -tg.z, nz = tg.x;
      if (Math.hypot(p.x + nx, p.z + 7 + nz) < Math.hypot(p.x - nx, p.z + 7 - nz)) { nx = -nx; nz = -nz; }
      out.push({ s: i * L / n, x: p.x, z: p.z, nx, nz });
    }
    return out;
  };
  const W = walks.map(along);
  const nearestOn = (S, z) => S.reduce((b, q) => (Math.abs(q.z - z) < Math.abs(b.z - z) ? q : b));
  // flower strips under the east wing's windows, planted tall at the wall, low at the walk
  for (const [x, z, d] of [[8.05, -5.0, 2.4], [8.05, -9.4, 2.0]]) {
    flowerBed(K, x, z, 0.7, d, R, { front: [1, 0] });
    const cs = [-1, 0, 1].map(k => [x, z + k * (d / 2 - 0.4), 0.4]); claim(cs);
    for (const [fx, fz, r] of cs) K.foot(fx, fz, r);
  }
  // low lamps on the walks' verges — the west's on the building side, the east's on the road side
  // (where its hedge runs: a lamp breaks the hedge) — and a bench on the east verge facing the
  // walk, set into its hedge; each slides along the walk until its footprint is clear
  const verge = (S, z, side, off, r, use) => {
    const q0 = nearestOn(S, z), i0 = S.indexOf(q0);
    for (const di of [0, 2, -2, 4, -4, 6, -6]) {
      const q = S[i0 + di]; if (!q) continue;
      const x = q.x + q.nx * off * side, zz = q.z + q.nz * off * side;
      if (!ok(x, zz, r) || !use(x, zz, q)) continue;
      return true;
    }
    return false;
  };
  const lamp = (x, z) => { if (!fits([[x, z, 0.12]])) return false; bollard(K, x, z); claim([[x, z, 0.12]]); return true; };
  for (const z of [-5.0, -10.6]) verge(W[0], z, -1, 0.66, 0.12, lamp);
  for (const z of [-5.6, -9.9]) verge(W[1], z, 1, 0.66, 0.12, lamp);
  for (const [x, z] of [[-4.2, -12.3], [4.2, -12.3]]) if (ok(x, z, 0.1)) lamp(x, z);
  verge(W[1], -7.8, 1, 0.78, 0.6, (x, z, q) => {
    const ry = Math.atan2(-q.nx, -q.nz), cs = benchFoot(x, z, ry);
    if (!fits(cs)) return false;
    gardenBench(K, x, z, ry); claim(cs); return true;
  });
  // box hedges down each side of the museum, between the walk and the road, curving with the
  // walk: a steady 1.25 out from its middle (a strip of lawn in front, where the lamps and the bench
  // stand backed by the hedge) round the walk's bends — and drawn in toward it wherever the road
  // swings closer (found by stepping out from the walk till the road is near), never onto its
  // verge. Smoothed, broken round anything in its way, rounded off at its ends
  const HW = 0.17, S_MIN = 0.42 + 0.07 + 0.06 + HW, S_CAP = 1.25;
  for (const S of W) {
    const offs = S.map(q => {
      if (q.s < 1.0 || q.z > -1.8 || q.z < -12.9) return null;    // the walk's mouth stays open; the sides only
      let o = S_MIN; if (!ok(q.x + q.nx * o, q.z + q.nz * o, HW + 0.05)) return null;
      while (o < S_CAP + 0.03 && ok(q.x + q.nx * (o + 0.05), q.z + q.nz * (o + 0.05), HW + 0.05)) o += 0.05;
      return { road: o + 0.05, o: Math.min(o, S_CAP) };
    });
    // runs of samples, their offsets eased along (so the hedge bends with the road, not in steps)
    const runs = []; let cur = [];
    offs.forEach((v, i) => { if (v) cur.push(i); else { if (cur.length) runs.push(cur); cur = []; } });
    if (cur.length) runs.push(cur);
    for (const run of runs) {
      const sm = run.map((i, k) => {
        let a = 0, c = 0; for (let j = Math.max(0, k - 3); j <= Math.min(run.length - 1, k + 3); j++) { a += offs[run[j]].o; c++; }
        return Math.max(S_MIN, Math.min(a / c, offs[i].road - 0.03));
      });
      let pts = [];
      const flush = () => { if (pts.length >= 5) claim(hedgeRun(K, pts)); pts = []; };
      run.forEach((i, k) => {
        const q = S[i], x = q.x + q.nx * sm[k], z = q.z + q.nz * sm[k];
        if (fits([[x, z, HW]], 0.05)) pts.push([x, z]); else flush();
      });
      flush();
    }
  }
  // a flagstone path from the back walk out to a garden (cx, cz), stopping r short of its centre
  // (it starts inside the walk's gravel and runs over it: flagstones lie above gravel)
  const spurTo = (cx, cz, r) => {
    const sx = Math.abs(cx) < 1.8 ? Math.sign(cx || 1) * 1.8 : Math.max(-5.4, Math.min(5.4, cx)), sz = -13.0;
    const L = Math.hypot(cx - sx, cz - sz); if (L < r + 0.3) return Math.atan2(sx - cx, sz - cz);
    const ux = (cx - sx) / L, uz = (cz - sz) / L;
    path(K, [[sx, sz - 0.2], [sx + ux * (L - r) * 0.5, sz + uz * (L - r) * 0.5], [cx - ux * (r - 0.15), cz - uz * (r - 0.15)]], 0.38, M.flag, 0.014, 1.4, true);
    return Math.atan2(-ux, -uz);                    // the garden's mouth: toward the walk
  };

  // ── behind: a sculpture garden round an ornamental pool ──
  const PR = 1.5, OUT = PR + 2.2;                   // pool radius, and the garden's reach
  // (its spot comes from town.js planMuseumGarden, which levelled a terrace for it there)
  const pool = poolAt && free(poolAt[0], poolAt[1], OUT - 0.4) ? (placed.push([poolAt[0], poolAt[1], OUT]), poolAt) : null;
  if (pool) {
    const [PX, PZ] = pool;
    const mouth = spurTo(PX, PZ, PR + 1.3);
    // a flagstone ring round it (the path from the walk runs into it: same flagstones, same metres)
    lay(K, new THREE.RingGeometry(PR + 0.55, PR + 1.3, 64, 1), M.edge, PX, 0.002, PZ, 1.4);
    lay(K, new THREE.RingGeometry(PR + 0.62, PR + 1.23, 64, 1), M.flag, PX, 0.014, PZ, 1.4);
    // the basin: a rolled stone rim, and a pebbled floor 0.19 under the water — you see it through
    // the water, and the two are far enough apart that they never fight
    K.put(lathe([[PR - 0.05, 0], [PR + 0.24, 0], [PR + 0.25, 0.2], [PR + 0.235, 0.27], [PR + 0.18, 0.318], [PR + 0.07, 0.335], [PR - 0.02, 0.322], [PR - 0.065, 0.285], [PR - 0.075, 0.05], [PR - 0.06, 0]], 72), M.stone, PX, 0, PZ);
    lay(K, new THREE.CircleGeometry(PR - 0.05, 56), M.bed, PX, 0.012, PZ, 0.8);
    // the water (see-through, rippling; rings spread where the fountain's water falls in) …
    const water = pondWater({ cx: PX, cz: PZ, r: PR - 0.06, land: [0.22, 0.4, 0.69] });
    lay(K, new THREE.RingGeometry(0.12, PR - 0.06, 72, 6), water, PX, 0.2, PZ, 1);
    fountain(K, PX, PZ, water);
    for (let k = 0; k < 5; k++) {                                         // a few lily pads, off the fountain's splash
      const a = k / 5 * Math.PI * 2 + R() * 0.8, r = 0.95 + R() * 0.3;
      const g = new THREE.CircleGeometry(0.12 + R() * 0.05, 18, 0.3, Math.PI * 2 - 0.6); g.rotateZ(R() * 6);
      lay(K, g, paint(0x6f9a5a, { hatch: 0 }), PX + Math.sin(a) * r, 0.207, PZ + Math.cos(a) * r);
    }
    // … and koi circling under it (pondwater.js addKoi swims them, once the grounds are placed)
    K.g.userData.pond = { x: PX, z: PZ, depth: 0.1, fish: [[0.86, 0.0], [1.08, 0.33], [0.97, 0.58], [1.16, 0.8]] };
    K.foot(PX, PZ, PR + 0.3);
    // three sculptures on plinths round the far side of the ring, benches and topiary either side
    const plinth = (x, z) => { K.box(0.62, 0.66, 0.62, M.stone, x, 0.27, z, 0.05); K.box(0.74, 0.08, 0.74, M.stoneD, x, 0.64, z, 0.03); K.foot(x, z, 0.45); };
    const ring = PR + 1.85, at = (a) => [PX + Math.sin(a) * ring, PZ + Math.cos(a) * ring];
    { const [x, z] = at(mouth + 1.4); plinth(x, z);                          // three balanced pebbles
      for (const [y, r] of [[0.84, 0.24], [1.14, 0.19], [1.38, 0.13]]) K.put(new THREE.SphereGeometry(r, 24, 16).scale(1.25, 0.72, 1), M.stoneD, x + (y - 1.1) * 0.12, y, z); }
    { const [x, z] = at(mouth + Math.PI); plinth(x, z);                      // a bronze ring, on edge
      K.put(new THREE.TorusGeometry(0.32, 0.085, 16, 48), M.bronze, x, 1.02, z, [0, mouth, 0]); }
    { const [x, z] = at(mouth - 1.4); plinth(x, z);                          // a patina head, gazing at the pool
      K.put(lathe([[0.001, 0], [0.15, 0], [0.12, 0.12], [0.08, 0.2], [0.001, 0.22]], 24), M.patina, x, 0.68, z);
      K.put(new THREE.SphereGeometry(0.22, 24, 18).scale(0.85, 1.1, 0.95), M.patina, x, 1.06, z); }
    for (const da of [2.3, -2.3]) { const a = mouth + da, x = PX + Math.sin(a) * (PR + 1.75), z = PZ + Math.cos(a) * (PR + 1.75); gardenBench(K, x, z, a + Math.PI); }
    for (const da of [0.6, -0.6]) { const a = mouth + da; topiary(K, PX + Math.sin(a) * (PR + 1.7), PZ + Math.cos(a) * (PR + 1.7), 0.85, da > 0 ? 'spiral' : 'cone'); }
  }

  // (the four-bed garden square that used to sit behind here is now Makers' Row's centrepiece)
  // trees round the back lawn and the east lawn, wherever they fit
  let n = 0;
  for (const [x, z, s] of [[10.85, -9.95, 0.7], [11.8, -11.3, 0.9], [12.0, -15.0, 0.85], [3.4, -20.4, 0.95], [-5.4, -19.5, 0.75], [-1.9, -21.2, 0.8], [1.2, -23.0, 0.9], [9.6, -19.6, 0.8], [-2.6, -15.6, 0.7]]) {
    if (n >= 6 || !spot(x, z, 0.8)) continue;
    specimen(K, x, z, s, R); placed.push([x, z, 0.8]); n++;
  }
  solidify(K);
  K.g.userData.keep = placed;                       // what it took ([x, z, r]): the shops' planting keeps off it
  return K.g;
}
// a tiered fountain in a pool's middle (x, z; the basin floor at 0, the water at 0.2): a smooth
// turned stone stem and two bowls, each brimming and spilling a thin sheet of water over its lip
// into the one below, a jet rising from the finial and falling back in an umbrella
const softProfile = (pts, k = 4) => {           // a Catmull-Rom pass over a lathe profile: round, not faceted
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(c => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out.map(([r, y]) => [Math.max(0.001, r), y]);
};
function fountain(K, x, z, water) {
  const M = mats(), spill = spillMat();
  K.put(lathe(softProfile([
    [0.001, 0], [0.36, 0], [0.37, 0.05], [0.31, 0.1], [0.19, 0.17], [0.13, 0.28], [0.11, 0.4],    // foot and stem
    [0.15, 0.45], [0.36, 0.5], [0.55, 0.57], [0.61, 0.62], [0.6, 0.65], [0.55, 0.65],            // the lower bowl, its lip
    [0.45, 0.6], [0.25, 0.575], [0.1, 0.58], [0.075, 0.66], [0.07, 0.8],                         // its hollow, the upper stem
    [0.12, 0.85], [0.25, 0.885], [0.335, 0.94], [0.35, 0.97], [0.31, 0.975], [0.2, 0.94], [0.07, 0.94],   // the upper bowl
    [0.05, 0.99], [0.05, 1.03], [0.075, 1.07], [0.045, 1.11], [0.001, 1.125],                    // the finial
  ]), 48), M.stone, x, 0, z);
  // the bowls brim with the pool's water
  lay(K, new THREE.CircleGeometry(0.56, 48), water, x, 0.632, z, 1);
  lay(K, new THREE.CircleGeometry(0.315, 40), water, x, 0.958, z, 1);
  // the falling water: over each lip and down, and the jet (noInk: water has no outline)
  for (const pts of [
    [[0.607, 0.648], [0.64, 0.61], [0.66, 0.5], [0.677, 0.36], [0.69, 0.2]],                     // lower bowl → pool
    [[0.352, 0.972], [0.375, 0.93], [0.388, 0.82], [0.396, 0.71], [0.4, 0.632]],                 // upper bowl → lower bowl
    [[0.012, 1.11], [0.016, 1.19], [0.028, 1.25], [0.06, 1.275], [0.11, 1.25], [0.16, 1.17], [0.2, 1.06], [0.22, 0.958]],    // the jet
  ]) K.put(sheet(softProfile(pts, 3), 48), spill, x, 0, z).userData.noInk = true;
}

// ── where a spur road meets a paved edge (a project shop's forecourt, Makers' Row's court).
// The spur (town.js) runs right up to the paving's front edge, centred on it, and MOUTH_LAP in
// under it: the entrance is the road itself (exact frame conversions: town.js placeFrame). The
// kerb stops either side of the carriageway + its kerb bands, and a stone return, set along the
// road, turns the road's kerbs into it ──
export const MOUTH_LAP = 0.08;     // a spur ends this far in under the paving's front edge (no gap, no seam)
export const SPUR_HALF = 0.85;     // a spur's carriageway half-width (town.js spur(): buildRoad half)
export const MOUTH_KERB = SPUR_HALF + 0.28;   // ...+ its kerb band (world.js buildRoad)
// the road's end (ex, ez) at the outline (front points: z > zMin) -> { mouth } when it reaches the
// edge. Else (fallback: the spur couldn't reach) a cobbled lane out to it, laneHalf wide, with a
// kerb down each side from where it leaves the slab (inSlab) to where the road begins -> { lane }
function roadMouth(K, outline, ex, ez, { zMin, laneHalf, inSlab, seed, mid = 0.4 }) {
  if (ex == null) return { mouth: null, lane: null };
  let best = outline[0];
  for (const p of outline) if (p[1] > zMin && Math.hypot(p[0] - ex, p[1] - ez) < Math.hypot(best[0] - ex, best[1] - ez)) best = p;
  const L = Math.hypot(ex - best[0], ez - best[1]);
  if (L < MOUTH_LAP + 0.4) return { mouth: { x: ex, z: best[1] }, lane: null };
  const dx = (ex - best[0]) / L, dz = (ez - best[1]) / L;
  cobbleLane(K, [[best[0] - dx * 0.8, best[1] - dz * 0.8], [best[0] + dx * L * mid, best[1] + dz * L * mid], [ex + dx * 0.5, ez + dz * 0.5]], laneHalf);
  for (const s of [-1, 1]) {
    const side = [], o = laneHalf + 0.02;
    for (let t = -0.8; t <= L + 0.001; t += 0.1) side.push([best[0] + dx * t - dz * o * s, best[1] + dz * t + dx * o * s]);
    kerbRun(K, side, { seed: seed + s, skip: (x, z) => inSlab(x, z) || (x - ex) * dx + (z - ez) * dz > -0.05 });
  }
  return { mouth: null, lane: { ax: best[0], az: best[1], ex, ez, dx, dz } };
}
// the slab's kerb (kerbRun round its outline, skip(x, z) leaving gaps), stopping at the road's
// mouth on its front edge (z1) with a return stone either side
function mouthKerb(K, outline, { seed, skip, mouth, z1 }) {
  kerbRun(K, outline, { closed: true, seed, skip: (x, z) => skip(x, z) || (mouth && z > z1 - 0.6 && Math.abs(x - mouth.x) < MOUTH_KERB + 0.2) });
  if (mouth) for (const s of [-1, 1]) K.box(0.2, 0.1, 0.42, mats().stone, mouth.x + s * (MOUTH_KERB + 0.1), 0.025, mouth.z + 0.02, 0.03);
}

// ── a project shop's cobbled approach (shop frame: the shop spans x ±2.8, z ±2.3, its door
// and stoop at +z). A cobbled forecourt across the front, its spur road running onto the
// middle of its front edge (ex, ez — or none; see roadMouth), edging stones, planters, a lamp and a
// bench, and planting round the shop. ok(x, z, r) says a spot is free in the world (no
// road, water or anything solid); `shop` is the shop's raw groups, so nothing lands on
// its own props outside ──
export const APPROACH_STOP = 6.2;          // (old: the spur stopped this far from the shop's centre — still the stop for a shop with its own car park)
export const APPROACH_Z1 = 5.1;            // the forecourt's front edge (shop z): its spur runs onto it here, at x 0
// (lot: the side, ±1, a car park lies on — the forecourt stops short of it there)
export function shopApproach({ ex = null, ez = null, ok = () => true, shop = [], seed = 1, lot = 0 } = {}) {
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
  const FX = 3.45, Z0 = 2.3, Z1 = APPROACH_Z1, CR = 1.5;
  const FP = lot > 0 ? 2.75 : FX, FN = lot < 0 ? 2.75 : FX;   // its +x / −x reach (short of a car park)
  const sh = new THREE.Shape();                    // drawn in (x, -z): lay() turns it flat
  sh.moveTo(-FN, -Z0); sh.lineTo(FP, -Z0); sh.lineTo(FP, -(Z1 - CR)); sh.quadraticCurveTo(FP, -Z1, FP - CR, -Z1);
  sh.lineTo(-FN + CR, -Z1); sh.quadraticCurveTo(-FN, -Z1, -FN, -(Z1 - CR)); sh.closePath();
  const outline = sh.getSpacedPoints(80).map(p => [p.x, -p.y]);
  cobbleSlab(K, sh, 12);
  // the mouth: the spur (town.js) now runs right onto the forecourt's front edge, centred, and
  // MOUTH_LAP in under it — the road itself is the entrance. It used to stop ~1 short on the
  // grass with a cobble lane patched across the gap (wider than the road, off its line, lapping
  // the forecourt). The lane (mapped like the forecourt, kerbed) is only a fallback now
  const LH = 0.98;
  const { mouth, lane } = roadMouth(K, outline, ex, ez, { zMin: Z0 + 0.4, laneHalf: LH, mid: 0.35, seed: seed * 3,
    inSlab: (x, z) => x < FP + 0.1 && x > -FN - 0.1 && z < Z1 + 0.1 });
  const nearLane = (x, z, r) => {
    if (!lane) return false;
    const qx = lane.ex - lane.ax, qz = lane.ez - lane.az, t = Math.max(0, Math.min(1, ((x - lane.ax) * qx + (z - lane.az) * qz) / (qx * qx + qz * qz)));
    return Math.hypot(x - lane.ax - qx * t, z - lane.az - qz * t) < r;
  };
  // paving test (forecourt or lane), for keeping plants off it
  function inPaving(x, z, r) {
    if (x < FP + r && x > -FN - r && z > Z0 - r && z < Z1 + r) return true;
    if (lane) {
      const qx = lane.ex - lane.ax, qz = lane.ez - lane.az, t = Math.max(0, Math.min(1, ((x - lane.ax) * qx + (z - lane.az) * qz) / (qx * qx + qz * qz)));
      if (Math.hypot(x - lane.ax - qx * t, z - lane.az - qz * t) < 1.05 + r) return true;
    }
    return false;
  }
  // a kerb of long dressed stones round the forecourt's outer edge (not along the shopfront,
  // not across the road's mouth or the lane's)
  mouthKerb(K, outline, { seed, mouth, z1: Z1, skip: (x, z) => z < Z0 + 0.15 || nearLane(x, z, LH + 0.08) });
  // planters at the forecourt's back corners, a lamp and a bench on it
  const planter = (x, z) => { trough(K, x, z, R, { front: [0, 1] }); take(x, z, 0.4); };
  for (const s of [-1, 1]) for (const [x, z] of [[s * 3.05, 2.85], [s * 2.95, 4.35]]) if (clear(x, z, 0.4, { onPlaza: true })) { planter(x, z); break; }
  const laneSide = lane ? Math.sign(lane.ax || 1) : mouth ? -1 : 1;     // (a mouth: the lamp and bench keep the sides they stood on)
  for (const [x, z] of [[laneSide * -2.3, 4.75], [laneSide * 2.3, 4.75], [laneSide * -1.8, 4.75]]) if (clear(x, z, 0.12, { onPlaza: true })) { bollard(K, x, z, 1.15); take(x, z, 0.12); break; }
  for (const [x, z] of [[laneSide * 1.75, 4.5], [laneSide * -1.75, 4.5]]) if (clear(x, z, 0.62, { onPlaza: true })) { gardenBench(K, x, z, Math.PI); take(x, z, 0.62); break; }   // (0.62: its whole length)
  // planting round the shop: trees at the sides and back, bushes and a bed or two
  let trees = 0;
  for (const [x, z, s] of [[-4.5, -1.2, 0.85], [4.5, -1.4, 0.8], [-3.6, -3.6, 0.95], [3.8, -3.5, 0.85], [0.4, -4.3, 1.0], [-4.9, 1.5, 0.75], [4.9, 1.3, 0.8], [-1.9, -4.4, 0.8]]) {
    if (trees >= 5 || !clear(x, z, 0.8)) continue;
    specimen(K, x, z, s, R); take(x, z, 0.8); trees++;
  }
  for (const [x, z] of [[-3.75, 1.9], [3.75, 1.9], [-3.6, 0.2], [3.6, 0.2], [-2.6, -3.0], [2.6, -3.0]]) {
    if (!clear(x, z, 0.4)) continue;
    shrub(K, x, z, R); take(x, z, 0.4);
  }
  for (const [x, z, w, d] of [[-4.2, 3.4, 0.9, 1.3], [4.2, 3.4, 0.9, 1.3]]) {
    if (!clear(x, z, 0.75)) continue;
    flowerBed(K, x, z, w, d, R, { front: [-Math.sign(x), 0] }); K.foot(x, z, 0.65); take(x, z, 0.75);
  }
  solidify(K);
  return K.g;
}

// ── Makers' Row: Behavior Search and Borrowed Eyes side by side, sharing a small parking court
// (row frame, like a shop's: +z toward the road, the shops at x ±ROW_X, z 0, their fronts at
// z 2.3). Laid out as one intentional place, seen from above (road at the top):
//
//        road ═══╗  ╔═══
//   hedge ▒▒▒▒▒▒ ║  ║ ▒▒▒▒▒▒ hedge        z 11.2  the court's mouth (the spur runs onto it)
//      ▒ │bay│bay│ aisle │bay│bay│ ▒
//      ▒ │bay│bay│  3.0  │bay│bay│ ▒        6 nose-in bays (3 a side, 2.1 × 3.25), sett lines,
//      ▒ │bay│bay│       │bay│bay│ ▒        a wheel stop at each bay's head, the hedge beyond
//   ─────kerb──────────────────────kerb─── z 4.0   one kerb line the whole width
//   ▓▓ pavement (flagstones) past both doors ▓▓   z 2.3…4.0, lamps on its kerb side
//   [ Behavior Search ] pocket [ Borrowed Eyes ]  z −2.3…2.3: bench, planter, tree on axis
//
// The road comes in on the axis of a central aisle; the aisle ends at the pavement, looking
// straight into the pocket between the shops (a bench under a tree), so the axis has an end.
// Beside the court, in front of each shop, a lawn with two planted beds along the kerb (the
// four-bed garden square that used to float in the middle of the cobbles), a tree and shrubs.
// Kerbs/edging all round; hedges close the court's sides and front; the terrain under the whole
// site is painted grass (world.js inLawn, flatten { lawn } in town.js). userData.row.bays tells
// plaza.js where to park cars: each bay's car centre and the way its nose points ──
export const ROW_X = 6.0;          // Behavior Search's ramp and drop rig stand 1.7 out from its walls: room for them in the gap
export const ROW_MOUTH_LAP = MOUTH_LAP, ROW_ROAD_HALF = SPUR_HALF;   // (the row's, as the shops': see roadMouth)
export const ROW = {
  half: 4.9,                       // the court's half-width (cobbles x ±4.9)…
  z0: 4.0, z1: 11.2,               // …from the pavement's kerb to its mouth on the road (7.2 deep)
  pave: [2.3, 4.0],                // the pavement along both shopfronts (the doors' stoops stand on it, to z 3.1)
  paveHalf: 9.2,                   // …running past both shops' outer walls (x ±9.0: they stand at ±6.2 as placed)
  aisle: 1.5,                      // the central aisle's half-width (3.0, on the road's axis)
  bayX: 4.75, bayZ: [4.3, 10.6], bayW: 2.1,   // bays from the aisle out to x ±4.75, three a side
  // the site: what town.js reserves (circle round row-local (0, cz)) and levels (a true plane)
  site: { cz: 4.0, reserve: 9.4, levelZ: 2.8, level: 11.0, blend: 6 },
};
// bs: which side (±1, row x) Behavior Search stands on — its drop rig stands in the pocket there
export function makersRow({ ex = null, ez = null, ok = () => true, seed = 3, bs = 1 } = {}) {
  const K = kit(), M = mats(), R = rng(seed * 104729);
  const H = ROW.half, Z0 = ROW.z0, Z1 = ROW.z1, CR = 1.0, [P0, P1] = ROW.pave, PH = ROW.paveHalf;
  const kerb = (x0, z0, x1, z1, sd = 1) => kerbRun(K, [[x0, z0], [x1, z1]], { seed: seed * 11 + sd });   // a straight run of the shared kerb

  // ── the court: one cobbled slab, its road-side corners rounded ──
  const sh = new THREE.Shape();                    // drawn in (x, -z): lay() turns it flat
  sh.moveTo(-H, -Z0); sh.lineTo(H, -Z0); sh.lineTo(H, -(Z1 - CR)); sh.quadraticCurveTo(H, -Z1, H - CR, -Z1);
  sh.lineTo(-H + CR, -Z1); sh.quadraticCurveTo(-H, -Z1, -H, -(Z1 - CR)); sh.closePath();
  const outline = sh.getSpacedPoints(96).map(p => [p.x, -p.y]);
  cobbleSlab(K, sh, 12);

  // ── the pavement: flagstones along both shopfronts, widening back into the pocket between the
  // shops (one shape, so no two pavings overlap and fight). It meets the court at the kerb line ──
  const GAP = ROW_X - 2.8 + 0.15, PB = -0.5;          // the pocket: (near enough) wall to wall between the shops, back to z −0.5
  const pv = new THREE.Shape();
  pv.moveTo(-PH, -P0); pv.lineTo(-GAP, -P0); pv.lineTo(-GAP, -PB); pv.lineTo(GAP, -PB); pv.lineTo(GAP, -P0);
  pv.lineTo(PH, -P0); pv.lineTo(PH, -P1); pv.lineTo(-PH, -P1); pv.closePath();
  lay(K, new THREE.ShapeGeometry(pv), M.flag, 0, 0.01, 0, 1.4);

  // ── bays: three a side, nose-in toward the hedge, off the central aisle. Sett lines (painted
  // pale, wide enough to read from above) between the bays, a wheel stop at each bay's head ──
  const line = M.line;
  const A = ROW.aisle, BX = ROW.bayX, [BZ0, BZ1] = ROW.bayZ, BW = ROW.bayW, bays = [];
  const STOP = BX - 0.3;                                // the wheel stop's centre, across the bay's head
  for (const s of [-1, 1]) {
    const len = BX - A - 0.1;                             // each divider: from just off the aisle to the bay's head
    for (let k = 0; k <= 3; k++) lay(K, new THREE.PlaneGeometry(len, 0.13), line, s * (A + 0.1 + len / 2), 0.014, BZ0 + k * BW);
    for (let k = 0; k < 3; k++) {
      const bz = BZ0 + (k + 0.5) * BW;
      K.put(rbox(0.2, 0.16, 1.2, 0.05, 1), M.stoneD, s * STOP, 0.03, bz);
      // the car's centre: its nose (1.42 ahead) just short of the stop's inner face
      bays.push({ x: s * (STOP - 0.1 - 0.12 - 1.42), z: bz, fx: s, fz: 0, side: s });
    }
  }
  // a short pale stop-line across the aisle where it meets the kerb (the aisle's head)
  lay(K, new THREE.PlaneGeometry(2 * A - 0.2, 0.13), line, 0, 0.014, Z0 + 0.35);

  // ── kerbs and edging ──
  // one kerb line the whole width between the pavement and the court/lawns
  kerb(-PH - 0.1, Z0, PH + 0.1, Z0, 1);
  // the pavement's outer ends, and the pocket's back edge
  for (const s of [-1, 1]) kerb(s * PH, P0, s * PH, Z0 - 0.1, 2 + s);
  kerb(-GAP, PB, GAP, PB, 4);
  // round the court's sides and front, stopping either side of the road's mouth. The spur
  // (town.js) runs right up to the front edge and ROW_MOUTH_LAP under it, so the entrance is the
  // road itself; the edging stops either side of the carriageway + its kerb bands, and a stone
  // return, set along the road, turns the road's kerbs into it
  const { mouth, lane } = roadMouth(K, outline, ex, ez, { zMin: Z0 + 1, laneHalf: 1.35, seed: seed * 5,
    inSlab: (x, z) => Math.abs(x) < H + 0.1 && z < Z1 + 0.1 });
  const MH = MOUTH_KERB + 0.08;                  // (the road's carriageway + kerb band, + half a return stone: where the hedge starts from)
  mouthKerb(K, outline, { seed, mouth, z1: Z1, skip: (x, z) => z < Z0 + 0.2   // (the kerb line above does the court's back edge)
    || (lane && Math.hypot(x - lane.ax, z - lane.az) < 1.45) });

  // ── hedges: low clipped box closing the court's sides (behind the wheel stops) and its front
  // either side of the mouth, each solid (feet every half metre) ──
  const hedgeRun = (x0, z0, x1, z1) => {
    hedge(K, x0, z0, x1, z1, 0.55, 0.38);
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 0.45));
    for (let i = 0; i <= n; i++) K.foot(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, 0.22);
  };
  const HX = H + 0.42, HZ = Z1 + 0.42;
  for (const s of [-1, 1]) {
    hedgeRun(s * HX, Z0 + 0.75, s * HX, Z1 - CR);                   // the side, up to where the corner turns
    if (!mouth || Math.abs(mouth.x) < 0.5) hedgeRun(s * (MH + 0.55), HZ, s * (H - CR + 0.1), HZ);   // the front, from the mouth's kerb out
    plant(K, 'mound', s * (H - 0.05), Z1 + 0.3, { s: 1.5 });         // a mounding shrub turning the corner
    K.foot(s * (H - 0.05), Z1 + 0.3, 0.3);
  }

  // ── the pavement: lamps on its kerb side (the street rule), framing the aisle's head and at its
  // two ends; nothing else on it, so it stays a clear walk past both doors ──
  for (const x of [-(A + 0.4), A + 0.4, -(PH - 0.35), PH - 0.35]) bollard(K, x, Z0 - 0.25, 1.2);

  // ── the pocket between the shops, on the aisle's axis: a bench facing the court under a tree,
  // a planter beside it (Behavior Search's drop rig stands on the pocket's other side) ──
  gardenBench(K, 0, 0.55, 0);
  const placed = [[0, 0.55, 0.7], [0, -1.3, 0.8]];
  specimen(K, 0, -1.3, 0.95, R, 'blossom');
  if (ok(-bs * 1.25, 0.55, 0.36)) { trough(K, -bs * 1.25, 0.55, R, { front: [0, 1] }); placed.push([-bs * 1.25, 0.55, 0.36]); }

  // ── the lawns in front of each shop, beside the court: the four planted beds as two pairs
  // along the kerb, a tree further out and shrubs; anything the world says is taken is skipped ──
  const take = (x, z, r) => { if (!ok(x, z, r) || placed.some(([a, b, c]) => Math.hypot(a - x, b - z) < c + r + 0.1)) return false; placed.push([x, z, r]); return true; };
  for (const s of [-1, 1]) for (const x of [6.35, 7.95]) {
    const bx = s * x, bz = Z0 + 1.05;
    if (!take(bx, bz, 0.7)) continue;
    islandBed(K, bx, bz, 1.2, R);
    K.foot(bx, bz, 0.66);
  }
  for (const [x, z, s] of [[-7.4, 7.6, 0.95], [7.4, 7.7, 0.9], [-6.3, 10.6, 0.8], [6.3, 10.7, 0.85],
    [-10.2, -1.0, 0.9], [10.2, -1.2, 0.85], [-7.4, -3.8, 1.0], [-2.6, -3.5, 0.85], [2.6, -3.5, 0.95], [7.6, -3.7, 0.9], [-10.4, 3.4, 0.8], [10.4, 3.6, 0.8]])
    if (take(x, z, 0.8)) specimen(K, x, z, s, R);
  for (const [x, z] of [[-8.7, 9.4], [8.7, 9.4], [-6.0, 8.6], [6.0, 8.6], [-9.0, 6.2], [9.0, 6.2], [-4.6, 12.3], [4.6, 12.3]]) if (take(x, z, 0.4)) shrub(K, x, z, R);
  K.g.userData.row = { bays, half: H, z0: Z0, z1: Z1, aisle: A };
  solidify(K);
  return K.g;
}
// (dev: the grounding check reads which materials are draped surfaces / water)
export function groundsMats() { return mats(); }
