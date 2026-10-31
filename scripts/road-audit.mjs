// Road-network audit for the main app (js/). Opens the game headless, walks ROADS and the drawn
// road surfaces, and reports:
//   ends      every open road end: joined (inside another carriageway), bulb (a turning circle),
//             lot (a car park / drive), dropoff (at a destination's forecourt), or DEAD
//   offset    an end that stops near another road but not on it, or ends well off its centre line
//   skew      a T junction whose joining road arrives more than 20° off square
//   kinks     centre-line stretches tighter than a 2.5-unit radius (or a zig-zag)
//   surface   rasterised top-down round every junction/end from the DRAWN meshes:
//             sharp concave kerb corners (no fillet / a step), grass or kerb slivers inside the
//             asphalt (a strip under ~0.3 wide, hard ground on both sides and most of the way round), asphalt drawn twice (overlapping patches: seams and z-fighting)
// and saves two planning maps (whole planet, town) as PNGs plus the numbers as JSON.
//
//   python3 -m http.server 8141 &   node scripts/road-audit.mjs --port 8141 --out /some/dir --tag before
//
// Needs Playwright (not a dependency: uses a global install). Chromium runs with SwiftShader.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '8141'), OUT = arg('out', '.'), TAG = arg('tag', 'audit');
mkdirSync(OUT, { recursive: true });

const b = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'commit', timeout: 0 });
await p.waitForFunction(() => window.__v2, null, { timeout: 0, polling: 1000 });

const res = await p.evaluate(async () => {
  const THREE = await import('three');
  const W = await import('./js/world.js');
  const { ROADS, LOTS, ZONES, R, arc } = W;
  const V = window.__v2, TOWN_C = V.town.boulevard ? null : null;
  const P = (d) => d.clone().normalize();
  // distance (world units) from d to a road's centre line (segments; closed roads wrap)
  const segDist = (d, a, b) => {
    const A = a.clone().multiplyScalar(R), B = b.clone().multiplyScalar(R), X = d.clone().multiplyScalar(R);
    const ab = B.clone().sub(A), t = Math.max(0, Math.min(1, X.clone().sub(A).dot(ab) / Math.max(1e-9, ab.lengthSq())));
    return { dist: X.distanceTo(A.addScaledVector(ab, t)), t };
  };
  const roadDist = (d, rd) => {
    if (rd.disc) return { dist: arc(d, rd.disc.c) - rd.disc.r + rd.half, i: 0, t: 0 };
    let best = { dist: 1e9, i: 0 };
    const n = rd.pts.length, segs = rd.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      if (arc(d, rd.pts[i]) > 8) { i += 3; continue; }
      const s = segDist(d, rd.pts[i], rd.pts[(i + 1) % n]); if (s.dist < best.dist) best = { dist: s.dist, i, t: s.t };
    }
    return best;
  };
  const tangentAt = (rd, i) => { const n = rd.pts.length; const a = rd.pts[Math.max(0, i - 1)], c = rd.pts[Math.min(n - 1, i + 2)]; return c.clone().sub(a).normalize(); };
  const isDeck = (rd) => rd.deck || (!rd.disc && rd.group && !rd.group.children.some(c => c.userData.roadPart));
  const roads = ROADS.map((rd, i) => ({ rd, i }));
  // ── 1. ends ──
  const ends = [];
  for (const { rd, i } of roads) {
    if (rd.closed || rd.pts.length < 2) continue;
    for (const e of [0, 1]) {
      const n = rd.pts.length, E = e ? rd.pts[n - 1] : rd.pts[0];
      // the road's own heading at its end, over its last ~2 units, pointing out of the road
      let k = e ? n - 1 : 0, s = 0; const step = e ? -1 : 1;
      while (s < 2 && k + step >= 0 && k + step < n) { s += arc(rd.pts[k], rd.pts[k + step]); k += step; }
      const out = E.clone().sub(rd.pts[k]).normalize();
      let kind = 'dead', info = {};
      let join = null;
      for (const o of roads) {
        if (o.i === i) continue;
        const q = roadDist(E, o.rd);
        if (q.dist < o.rd.half - 0.05 && (!join || q.dist < join.dist)) join = { ...q, o };
      }
      let near = null;
      if (!join) for (const o of roads) {
        if (o.i === i) continue;
        const q = roadDist(E, o.rd);
        if (q.dist < o.rd.half + 2.5 && (!near || q.dist < near.dist)) near = { ...q, o };
      }
      const discAt = ROADS.find(o => o.disc && arc(o.disc.c, E) < o.disc.r + 0.2);
      if (discAt) kind = 'bulb';
      else if (join) {
        kind = 'joined';
        const o = join.o.rd, ti = join.i, tn = tangentAt(o, ti);
        const oEnd = !o.closed && (ti <= 1 || ti >= o.pts.length - 3);
        const ang = Math.acos(Math.min(1, Math.abs(out.dot(tn)))) * 180 / Math.PI;   // 90 = square
        info = { target: join.o.i, offCentre: +join.dist.toFixed(2), angle: +ang.toFixed(1), continuation: oEnd || o.half < 0.7 && o.closed && false };
        if (oEnd) info.continuation = true;
        // the end's square corners: do they poke out of the road they meet?
        const lat = new THREE.Vector3().crossVectors(E, out).normalize(); let poke = 0;
        for (const sx of [-1, 1]) { const c = E.clone().multiplyScalar(R).addScaledVector(lat, sx * rd.half).normalize(); let inside = false; for (const oo of roads) { if (oo.i === i) continue; if (roadDist(c, oo.rd).dist < oo.rd.half) inside = true; } if (!inside) poke++; }
        info.pokingCorners = poke;
      } else if (LOTS.some(f => f(E)) || LOTS.some(f => f(E.clone().multiplyScalar(R).addScaledVector(out, 0.9).normalize()))) kind = 'lot';
      else if (isDeck(rd)) kind = 'deck';
      else {
        const z = ZONES.find(z => arc(E, z.dir) < z.r + 3.2 && /^(site|lm|museum|north|lot|mall|park)/.test(z.key));
        if (z) { kind = 'dropoff'; info.zone = z.key; }
      }
      if (near) info.near = { target: near.o.i, gap: +(near.dist - near.o.rd.half).toFixed(2) };
      ends.push({ road: i, end: e, kind, half: rd.half, n: rd.pts.length, at: E.toArray().map(v => +v.toFixed(4)), out: out.toArray(), ...info });
    }
  }
  const dead = ends.filter(e => e.kind === 'dead');
  const offset = ends.filter(e => (e.kind !== 'joined' && e.near && e.near.gap < 2.5 && e.kind !== 'bulb') || (e.kind === 'joined' && !e.continuation && e.offCentre > 0.45));
  const skew = ends.filter(e => e.kind === 'joined' && !e.continuation && e.angle < 70);
  const poke = ends.filter(e => e.kind === 'joined' && e.pokingCorners > 0);
  // ── 2. kinks ──
  const kinks = [];
  for (const { rd, i } of roads) {
    if (isDeck(rd)) continue;
    const pts = rd.pts, n = pts.length;
    if (rd.closed && n > 4) { const c = pts.reduce((a, q) => a.add(q), new THREE.Vector3()).normalize(); if (arc(pts[0], c) < rd.half + 0.2) continue; }   // a disc (turning circle)
    const segs = rd.closed ? n : n - 1; let run = null;
    for (let k = 1; k < segs; k++) {
      const a = pts[(k - 1) % n], m = pts[k % n], c = pts[(k + 1) % n];
      const t1 = m.clone().sub(a), t2 = c.clone().sub(m); const l1 = t1.length() * R, l2 = t2.length() * R;
      if (l1 < 1e-4 || l2 < 1e-4) continue;
      const th = t1.angleTo(t2), rad = ((l1 + l2) / 2) / Math.max(1e-6, th);
      if (rad < 2.5) { if (!run) kinks.push(run = { road: i, at: m.toArray(), minR: rad, deg: th * 57.3 }); else { run.minR = Math.min(run.minR, rad); run.deg = Math.max(run.deg, th * 57.3); } }
      else run = null;
    }
  }
  // ── 3. the drawn surface round every end (top-down raster of the road meshes) ──
  const parts = [];
  V.scene.traverse(o => { if (o.isMesh && o.userData.roadPart && o.visible !== false) parts.push(o); });
  const tris = await Promise.all(parts.map(async o => {
    o.updateWorldMatrix(true, false);
    const g = o.geometry, pos = g.attributes.position, idx = g.index, m = o.matrixWorld, v = new THREE.Vector3();
    const wp = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(m); wp[k * 3] = v.x; wp[k * 3 + 1] = v.y; wp[k * 3 + 2] = v.z; }
    let tp = null;                                   // per-triangle part (the one-sheet surface: by vertex colour)
    const count = idx ? idx.count : pos.count;
    if (o.userData.roadPart === 'sheet') tp = o.userData.triPart;
    return { o, part: o.userData.roadPart, tp, wp, idx: idx ? idx.array : null, count };
  }));
  const sites = [];
  for (const e of ends) { const d = new THREE.Vector3(...e.at); if (!sites.some(s => arc(s.d, d) < 1.5)) sites.push({ d, e }); }
  const CS = 0.06, HALFW = 4.5, NG = Math.round(2 * HALFW / CS);
  let sharp = 0, sliver = 0, overlapArea = 0, kerbIn = 0;
  const siteRes = [];
  for (const s of sites) {
    const c = s.d.clone().multiplyScalar(R), up = s.d;
    const e1 = new THREE.Vector3().crossVectors(up, Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize(), e2 = new THREE.Vector3().crossVectors(up, e1);
    const top = new Uint8Array(NG * NG), cover = new Uint8Array(NG * NG), owner = new Int32Array(NG * NG).fill(-1);
    const L = (x, y, z) => { const dx = x - c.x, dy = y - c.y, dz = z - c.z; return [(dx * e1.x + dy * e1.y + dz * e1.z), (dx * e2.x + dy * e2.y + dz * e2.z)]; };
    tris.forEach((T, ti) => {
      const pr0 = T.part === 'road' ? 2 : T.part === 'kerb' ? 1 : T.part === 'sheet' ? 3 : 0; if (!pr0) return;
      const stamp = new Uint8Array(pr0 >= 2 ? NG * NG : 0);
      for (let t = 0; t < T.count; t += 3) {
        const pr = T.tp ? T.tp[t / 3] : pr0; if (!pr) continue;
        const ia = T.idx ? T.idx[t] : t, ib = T.idx ? T.idx[t + 1] : t + 1, ic = T.idx ? T.idx[t + 2] : t + 2;
        const ax = T.wp[ia * 3], ay = T.wp[ia * 3 + 1], az = T.wp[ia * 3 + 2];
        if ((ax - c.x) ** 2 + (ay - c.y) ** 2 + (az - c.z) ** 2 > 49) continue;
        const A = L(ax, ay, az), B = L(T.wp[ib * 3], T.wp[ib * 3 + 1], T.wp[ib * 3 + 2]), C = L(T.wp[ic * 3], T.wp[ic * 3 + 1], T.wp[ic * 3 + 2]);
        const x0 = Math.max(0, Math.floor((Math.min(A[0], B[0], C[0]) + HALFW) / CS)), x1 = Math.min(NG - 1, Math.ceil((Math.max(A[0], B[0], C[0]) + HALFW) / CS));
        const y0 = Math.max(0, Math.floor((Math.min(A[1], B[1], C[1]) + HALFW) / CS)), y1 = Math.min(NG - 1, Math.ceil((Math.max(A[1], B[1], C[1]) + HALFW) / CS));
        const den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1]); if (Math.abs(den) < 1e-12) continue;
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
          const px = gx * CS - HALFW + CS / 2, py = gy * CS - HALFW + CS / 2;
          const w1 = ((B[1] - C[1]) * (px - C[0]) + (C[0] - B[0]) * (py - C[1])) / den, w2 = ((C[1] - A[1]) * (px - C[0]) + (A[0] - C[0]) * (py - C[1])) / den;
          if (w1 < -1e-6 || w2 < -1e-6 || w1 + w2 > 1 + 1e-6) continue;
          const k = gy * NG + gx;
          if (pr > top[k]) top[k] = pr;
          if (pr === 2 && !stamp[k]) { stamp[k] = 1; if (owner[k] !== ti) { cover[k]++; owner[k] = ti; } }
        }
      }
    });
    // paved by a car park / drive counts as hard ground too
    const dirAt = (gx, gy) => c.clone().addScaledVector(e1, gx * CS - HALFW + CS / 2).addScaledVector(e2, gy * CS - HALFW + CS / 2).normalize();
    const hard = new Uint8Array(NG * NG);
    for (let k = 0; k < NG * NG; k++) hard[k] = top[k] === 2 ? 1 : 0;
    const lotsHere = LOTS.filter(f => { for (let a = 0; a < 6.3; a += 0.5) for (const rr of [0, 2, 4, 6]) if (f(c.clone().addScaledVector(e1, Math.cos(a) * rr).addScaledVector(e2, Math.sin(a) * rr).normalize())) return true; return false; });
    if (lotsHere.length) for (let gy = 0; gy < NG; gy++) for (let gx = 0; gx < NG; gx++) {
      const k = gy * NG + gx; if (hard[k]) continue;
      if (lotsHere.some(f => f(dirAt(gx, gy)))) hard[k] = 2;
    }
    const H = (gx, gy) => gx < 0 || gy < 0 || gx >= NG || gy >= NG ? 0 : hard[gy * NG + gx];
    const r = Math.round(0.45 / CS), disk = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) disk.push([dx, dy]);
    const flagS = new Uint8Array(NG * NG), flagV = new Uint8Array(NG * NG), flagK = new Uint8Array(NG * NG);
    const sv = Math.round(0.3 / CS);
    const inner = (gx, gy) => gx > r + sv && gy > r + sv && gx < NG - r - sv && gy < NG - r - sv;
    for (let gy = 0; gy < NG; gy++) for (let gx = 0; gx < NG; gx++) {
      const k = gy * NG + gx;
      if (cover[k] > 1) overlapArea += CS * CS;
      if (hard[k] || !inner(gx, gy)) continue;
      // a sliver: grass close between hard ground on both opposite sides (the kerb band itself is no sliver)
      if (top[k] === 0)
      for (const [ax, ay] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        let a = false, bb = false;
        for (let s2 = 1; s2 <= sv; s2++) { if (H(gx + ax * s2, gy + ay * s2)) a = true; if (H(gx - ax * s2, gy - ay * s2)) bb = true; }
        if (a && bb) { let f = 0; for (const [dx, dy] of disk) if (H(gx + dx, gy + dy)) f++; if (f / disk.length > 0.5) flagV[k] = 1; break; }
      }
      if (H(gx + 1, gy) || H(gx - 1, gy) || H(gx, gy + 1) || H(gx, gy - 1)) {
        let f = 0; for (const [dx, dy] of disk) if (H(gx + dx, gy + dy)) f++;
        if (f / disk.length > 0.66) flagS[k] = 1;
      }
      if (top[k] === 1) { let f = 0; for (const [dx, dy] of disk) if (H(gx + dx, gy + dy)) f++; if (f / disk.length > 0.8) flagK[k] = 1; }
    }
    const clusters = (flag) => { const seen = new Uint8Array(NG * NG); let n = 0; const pts = [];
      for (let k = 0; k < NG * NG; k++) { if (!flag[k] || seen[k]) continue; n++; const st = [k]; seen[k] = 1; let cnt = 0, sx = 0, sy = 0;
        while (st.length) { const q = st.pop(); cnt++; const qx = q % NG, qy = (q / NG) | 0; sx += qx; sy += qy;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const x = qx + dx, y = qy + dy; if (x < 0 || y < 0 || x >= NG || y >= NG) continue; const kk = y * NG + x; if (flag[kk] && !seen[kk]) { seen[kk] = 1; st.push(kk); } } }
        pts.push(dirAt(sx / cnt, sy / cnt).toArray()); }
      return pts; };
    const cs = clusters(flagS), cv = clusters(flagV), ck = clusters(flagK);
    sharp += cs.length; sliver += cv.length; kerbIn += ck.length;
    siteRes.push({ at: s.d.toArray(), road: s.e.road, sharp: cs, sliver: cv, kerbIn: ck });
  }
  // overlap area counted once per site window: windows can overlap each other, so report it per
  // site total (comparable before/after, not an absolute area)
  // ── 4. the planning maps ──
  const TC = V.town.museum ? (await import('./js/town.js')).TOWN_C : null;
  const maps = {};
  const club = ZONES.find(z => z.key === 'north:club'), close = ZONES.find(z => z.key === 'north:close');
  const northC = club && close ? club.dir.clone().add(close.dir).normalize() : null;
  for (const [name, span, px, cen] of [['planet', 126, 1800, TC], ['town', 34, 1800, TC], ['north', 13, 1600, northC]]) {
    if (!cen) continue;
  const centre = cen.clone();
  const ce1 = new THREE.Vector3().crossVectors(centre, new THREE.Vector3(0, 0, 1)).normalize(), ce2 = new THREE.Vector3().crossVectors(centre, ce1);
  const proj = (d) => { const a = d.angleTo(centre); if (a < 1e-6) return [0, 0]; const t = d.clone().sub(centre.clone().multiplyScalar(d.dot(centre))).normalize(); return [t.dot(ce1) * a * R, t.dot(ce2) * a * R]; };
    const cv = document.createElement('canvas'); cv.width = cv.height = px; const g = cv.getContext('2d');
    const S = px / (2 * span), X = (q) => px / 2 + q[0] * S, Y = (q) => px / 2 - q[1] * S;
    g.fillStyle = '#eef0e4'; g.fillRect(0, 0, px, px);
    // water
    g.fillStyle = '#bcd6e6';
    const stepw = span / 180;
    for (let y = -span; y < span; y += stepw * 1.5) for (let x = -span; x < span; x += stepw * 1.5) {
      const rr = Math.hypot(x, y) / R; if (rr > Math.PI) continue;
      const t = ce1.clone().multiplyScalar(x).add(ce2.clone().multiplyScalar(y)).normalize();
      const d = centre.clone().multiplyScalar(Math.cos(rr)).addScaledVector(t, Math.sin(rr));
      if (W.isWater(d)) g.fillRect(X([x, y]), Y([x, y]), stepw * 1.5 * S + 1, stepw * 1.5 * S + 1);
    }
    // reserved ground
    for (const z of ZONES) { const q = proj(z.dir); g.beginPath(); g.arc(X(q), Y(q), z.r * S, 0, Math.PI * 2); g.fillStyle = 'rgba(214,190,150,0.35)'; g.fill(); g.strokeStyle = 'rgba(150,120,80,0.7)'; g.lineWidth = 1; g.stroke();
      if (name !== 'planet' || z.r > 3) { g.fillStyle = '#7a6a50'; g.font = `${name !== 'planet' ? 15 : 11}px sans-serif`; g.fillText(z.key, X(q) - 20, Y(q)); } }
    // colliders (buildings, props)
    g.fillStyle = 'rgba(90,80,90,0.45)';
    for (const c of V.town.colliders || []) { if (c.soft) continue; const q = proj(c.dir); g.beginPath(); g.arc(X(q), Y(q), Math.max(1, c.r * S), 0, Math.PI * 2); g.fill(); }
    // the drawn road surfaces
    for (const T of tris) {
      g.fillStyle = T.part === 'road' ? '#6d6676' : T.part === 'kerb' ? '#e9dcc0' : '#ffffff';
      if (T.part === 'dash') continue;
      for (let t = 0; t < T.count; t += 3) {
        if (T.tp) { if (!T.tp[t / 3]) continue; g.fillStyle = T.tp[t / 3] === 2 ? '#6d6676' : '#e9dcc0'; }
        const q = [0, 1, 2].map(j => { const ii = T.idx ? T.idx[t + j] : t + j; return proj(new THREE.Vector3(T.wp[ii * 3], T.wp[ii * 3 + 1], T.wp[ii * 3 + 2]).normalize()); });
        if (Math.abs(q[0][0]) > span + 5 || Math.abs(q[0][1]) > span + 5) continue;
        g.beginPath(); g.moveTo(X(q[0]), Y(q[0])); g.lineTo(X(q[1]), Y(q[1])); g.lineTo(X(q[2]), Y(q[2])); g.closePath(); g.fill();
      }
    }
    // kerb on top drawn first, so re-draw asphalt over kerbs (old ribbons: asphalt wins)
    for (const T of tris) { if (T.part !== 'road') continue; g.fillStyle = '#6d6676';
      for (let t = 0; t < T.count; t += 3) { const q = [0, 1, 2].map(j => { const ii = T.idx ? T.idx[t + j] : t + j; return proj(new THREE.Vector3(T.wp[ii * 3], T.wp[ii * 3 + 1], T.wp[ii * 3 + 2]).normalize()); });
        if (Math.abs(q[0][0]) > span + 5 || Math.abs(q[0][1]) > span + 5) continue; g.beginPath(); g.moveTo(X(q[0]), Y(q[0])); g.lineTo(X(q[1]), Y(q[1])); g.lineTo(X(q[2]), Y(q[2])); g.closePath(); g.fill(); } }
    // centre lines + road numbers
    ROADS.forEach((rd, i) => { g.strokeStyle = isDeck(rd) ? '#a0522d' : 'rgba(255,255,255,0.7)'; g.lineWidth = isDeck(rd) ? 3 : 1; g.beginPath();
      rd.pts.forEach((q, k) => { const pq = proj(q); k ? g.lineTo(X(pq), Y(pq)) : g.moveTo(X(pq), Y(pq)); }); if (rd.closed) g.closePath(); g.stroke();
      const mq = proj(rd.pts[Math.floor(rd.pts.length / 2)]); g.fillStyle = '#20304a'; g.font = `bold ${name !== 'planet' ? 16 : 12}px sans-serif`; g.fillText('#' + i, X(mq) + 4, Y(mq) - 4); });
    // findings
    const dot = (d, col, rad) => { const q = proj(new THREE.Vector3(...d)); g.beginPath(); g.arc(X(q), Y(q), rad, 0, Math.PI * 2); g.strokeStyle = col; g.lineWidth = 3; g.stroke(); };
    const KC = { joined: '#2e9d4f', bulb: '#2a6fd6', lot: '#2a6fd6', dropoff: '#2a6fd6', deck: '#2a6fd6', dead: '#e02020' };
    for (const e of ends) dot(e.at, KC[e.kind], name !== 'planet' ? 9 : 6);
    for (const e of skew) dot(e.at, '#ff8c00', name !== 'planet' ? 14 : 10);
    for (const e of offset) dot(e.at, '#ff8c00', name !== 'planet' ? 18 : 12);
    for (const k of kinks) dot(k.at, '#c000c0', name !== 'planet' ? 7 : 5);
    for (const s of siteRes) { for (const q of s.sharp) dot(q, '#000', 4); for (const q of s.sliver) dot(q, '#ff00aa', 4); }
    g.fillStyle = '#222'; g.font = 'bold 22px sans-serif';
    g.fillText(`roads ${ROADS.length} · dead ${dead.length} · offset ${offset.length} · skew ${skew.length} · kinks ${kinks.length} · sharp corners ${sharp} · slivers ${sliver}`, 16, 30);
    g.font = '15px sans-serif'; g.fillText('green: joined end · blue: bulb/lot/drop-off/deck · red: DEAD END · orange: offset/skew · purple: kink · black: sharp kerb corner · pink: sliver', 16, 54);
    maps[name] = cv.toDataURL('image/png');
  }
  const meshes = parts.length; let triCount = 0; for (const T of tris) triCount += T.count / 3;
  return { counts: { roads: ROADS.length, ends: ends.length, dead: dead.length, offset: offset.length, skew: skew.length, pokingStubs: poke.length, kinks: kinks.length,
    sharpCorners: sharp, slivers: sliver, kerbInsideAsphalt: kerbIn, overlapArea: +overlapArea.toFixed(1), roadMeshes: meshes, roadTris: triCount },
    ends, kinks, sites: siteRes.filter(s => s.sharp.length || s.sliver.length || s.kerbIn.length).map(s => ({ road: s.road, at: s.at.map(v => +v.toFixed(4)), sharp: s.sharp.length, sliver: s.sliver.length, kerbIn: s.kerbIn.length })), maps };
});
for (const [k, v] of Object.entries(res.maps)) writeFileSync(`${OUT}/${TAG}-map-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
delete res.maps;
res.errors = errs;
writeFileSync(`${OUT}/${TAG}-audit.json`, JSON.stringify(res, null, 1));
console.log(JSON.stringify(res.counts));
for (const e of res.ends) if (e.kind === 'dead' || (e.kind === 'joined' && !e.continuation && (e.angle < 70 || e.offCentre > 0.45)) || (e.near && e.kind !== 'joined' && e.near.gap < 2.5)) console.log('end', JSON.stringify(e));
for (const k of res.kinks) console.log('kink road', k.road, 'R', k.minR.toFixed(2), 'deg', k.deg.toFixed(1));
for (const s of res.sites) console.log('site', JSON.stringify(s));
if (errs.length) console.log('ERRORS', errs);
await b.close();
