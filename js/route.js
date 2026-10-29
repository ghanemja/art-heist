// ─── ROUTE GUIDE: while you drive, a map in the corner and arrows on the road ───
// The roads are a graph (each road's centre-line samples, joined where roads meet);
// the way to your lead is found along it (Dijkstra), drawn on a heading-up minimap,
// and laid ahead of the car as glowing chevrons you can follow without looking away.
import * as THREE from 'three';
import { R, ROADS, arc, standAt } from './world.js';
import { PAL, paint } from './style.js';

let GR = null;
function graph() {
  const n = ROADS.reduce((a, r) => a + r.pts.length, 0);
  if (GR && GR.n === n) return GR;
  const pts = [], road = [], adj = [];
  const link = (a, b) => { const w = arc(pts[a], pts[b]); adj[a].push(b, w); adj[b].push(a, w); };
  ROADS.forEach((rd, ri) => {
    const base = pts.length;
    for (const p of rd.pts) { pts.push(p); road.push(ri); adj.push([]); }
    for (let i = 1; i < rd.pts.length; i++) link(base + i - 1, base + i);
    if (rd.closed) link(base + rd.pts.length - 1, base);
  });
  // junctions: samples of different roads within reach of each other are joined
  const C = 1.4, cells = new Map(), key = (p) => `${Math.floor(p.x * R / C)},${Math.floor(p.y * R / C)},${Math.floor(p.z * R / C)}`;
  pts.forEach((p, i) => { const k = key(p); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); });
  pts.forEach((p, i) => {
    const cx = Math.floor(p.x * R / C), cy = Math.floor(p.y * R / C), cz = Math.floor(p.z * R / C);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
        if (j <= i || road[j] === road[i]) continue;
        if (arc(p, pts[j]) < Math.max(ROADS[road[i]].half, ROADS[road[j]].half) + 0.3) link(i, j);
      }
    }
  });
  return (GR = { n, pts, adj });
}
function nearestNode(g, d) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < g.pts.length; i++) { const a = g.pts[i].distanceToSquared(d); if (a < bd) { bd = a; best = i; } }
  return best;
}
// the way along the roads, as a list of directions (from you to the lead)
export function findRoute(from, to) {
  const g = graph(), s = nearestNode(g, from), t = nearestNode(g, to);
  const N = g.pts.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const heap = [[0, s]]; dist[s] = 0;
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [dd, u] = pop(); if (done[u]) continue; done[u] = 1; if (u === t) break;
    const a = g.adj[u];
    for (let k = 0; k < a.length; k += 2) { const v = a[k], nd = dd + a[k + 1]; if (nd < dist[v]) { dist[v] = nd; prev[v] = u; push([nd, v]); } }
  }
  if (!done[t]) return null;
  const path = []; for (let u = t; u !== -1; u = prev[u]) path.push(g.pts[u]);
  return path.reverse();
}

export function createGuide({ scene, player }) {
  // ── the chevrons: gold arrows lying on the road ahead, a dark one under each as its ink ──
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.42); shape.lineTo(0.42, 0); shape.lineTo(0.26, 0); shape.lineTo(0, 0.26); shape.lineTo(-0.26, 0); shape.lineTo(-0.42, 0); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);          // lying flat, pointing along -z… so flip:
  geo.rotateY(Math.PI);                                                        // …pointing along +z (forward)
  const geoInk = geo.clone().scale(1.22, 1, 1.22).translate(0, -0.005, -0.03);
  const gold = paint(PAL.gold, { emissive: 0x6a4a10, hatch: 0 }), inkM = paint(PAL.ink, { hatch: 0 });
  for (const m of [gold, inkM]) { m.side = THREE.DoubleSide; m.polygonOffset = true; m.polygonOffsetFactor = -4; m.polygonOffsetUnits = -4; }
  const chev = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group(); g.userData.noGround = true;
    const a = new THREE.Mesh(geoInk, inkM), b = new THREE.Mesh(geo, gold); a.userData.noInk = b.userData.noInk = true;
    g.add(a, b); g.scale.setScalar(1.5); g.visible = false; scene.add(g); chev.push(g);
  }

  // ── the minimap: heading-up, roads round you, the route in red, your lead or an arrow to it ──
  const cv = document.getElementById('minimap'), c = cv.getContext('2d'), W = cv.width, H = cv.height;
  let route = null, routeT = 0, routeTo = null, drawT = 0, shown = false;
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

  function project(d, up, f, r, sc) {
    _v.copy(d).sub(up).multiplyScalar(R);
    return [W / 2 + _v.dot(r) * sc, H / 2 + 12 - _v.dot(f) * sc];
  }
  function draw(target, label) {
    const up = player.st.dir, f = _f.copy(player.st.heading).addScaledVector(up, -player.st.heading.dot(up)).normalize(), r = _r.crossVectors(f, up);
    const RANGE = 26, sc = (W / 2 - 8) / RANGE;
    c.clearRect(0, 0, W, H);
    c.save(); c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 4, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#a9c48a'; c.fillRect(0, 0, W, H);
    c.lineCap = c.lineJoin = 'round';
    for (const rd of ROADS) {                                       // the roads round you
      c.strokeStyle = '#efe5cf'; c.lineWidth = Math.max(3, (rd.half * 2 + 0.5) * sc);
      c.beginPath(); let pen = false;
      const P = rd.closed ? [...rd.pts, rd.pts[0]] : rd.pts;
      for (const p of P) {
        if (arc(up, p) > RANGE * 1.4) { pen = false; continue; }
        const [x, y] = project(p, up, f, r, sc);
        if (pen) c.lineTo(x, y); else { c.moveTo(x, y); pen = true; }
      }
      c.stroke(); c.strokeStyle = '#8a8392'; c.lineWidth = Math.max(2, rd.half * 2 * sc); c.stroke();
    }
    if (route) {                                                     // the way, in red
      c.strokeStyle = '#e8604c'; c.lineWidth = 5; c.beginPath(); let pen = false;
      for (const p of route) {
        if (arc(up, p) > RANGE * 1.4) { if (pen) break; continue; }
        const [x, y] = project(p, up, f, r, sc);
        if (pen) c.lineTo(x, y); else { c.moveTo(x, y); pen = true; }
      }
      c.stroke();
    }
    c.restore();
    // the lead: a pin if it's on the map, else an arrow on the rim
    if (target) {
      const dist = arc(up, target);
      const [x, y] = project(target, up, f, r, sc), dx = x - W / 2, dy = y - H / 2 - 12, rr = Math.hypot(dx, dy);
      if (rr < W / 2 - 16 && dist < RANGE * 1.2) {
        c.fillStyle = '#e8604c'; c.strokeStyle = '#2a2230'; c.lineWidth = 2.5;
        c.beginPath(); c.arc(x, y - 8, 7, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x - 5, y - 4); c.lineTo(x, y + 4); c.lineTo(x + 5, y - 4); c.fill();
      } else {
        // which way it lies along the ground (works across the planet too)
        const tv = _v.copy(target).addScaledVector(up, -target.dot(up)), a = Math.atan2(-tv.dot(f), tv.dot(r));
        const ex = W / 2 + Math.cos(a) * (W / 2 - 16), ey = H / 2 + Math.sin(a) * (H / 2 - 16);
        c.save(); c.translate(ex, ey); c.rotate(a); c.fillStyle = '#e8604c'; c.strokeStyle = '#2a2230'; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(11, 0); c.lineTo(-7, -8); c.lineTo(-3, 0); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke(); c.restore();
      }
    }
    // you: an arrow in the middle, always pointing up (the map turns with you)
    c.save(); c.translate(W / 2, H / 2 + 12); c.fillStyle = '#e1b95c'; c.strokeStyle = '#2a2230'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 4); c.lineTo(-8, 8); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.strokeStyle = '#2a2230'; c.lineWidth = 3; c.beginPath(); c.arc(W / 2, H / 2, W / 2 - 4, 0, Math.PI * 2); c.stroke();
    const lab = document.getElementById('minimapLab');
    lab.innerHTML = target ? `<b>${label}</b> · ${Math.round(arc(up, target) * 1.5)} m` : 'no lead right now';
  }

  // lay the chevrons ahead of you along the route, spaced out, pulsing gently
  function layChevrons(t) {
    if (!route || route.length < 2) { chev.forEach(m => (m.visible = false)); return; }
    const here = player.st.dir;
    let k0 = 0, bd = 1e9;
    for (let i = 0; i < Math.min(route.length, 80); i++) { const a = route[i].distanceToSquared(here); if (a < bd) { bd = a; k0 = i; } }
    let acc = 0, want = 4, ci = 0;
    for (let i = k0; i < route.length - 1 && ci < chev.length; i++) {
      const a = route[i], b = route[i + 1], seg = arc(a, b);
      while (acc + seg >= want && ci < chev.length) {
        const s = (want - acc) / seg, d = a.clone().lerp(b, s).normalize();
        const fw = b.clone().sub(a); fw.addScaledVector(d, -fw.dot(d)).normalize();
        const side = new THREE.Vector3().crossVectors(d, fw);      // x = side, y = up, z = forward
        _m.makeBasis(side, d, fw); _q.setFromRotationMatrix(_m);
        const m = chev[ci]; m.visible = true;
        m.position.copy(d).multiplyScalar(standAt(d) + 0.06); m.quaternion.copy(_q);
        m.scale.setScalar(1.35 + 0.15 * Math.sin(t * 3 - ci * 0.8));
        ci++; want += 4.5;
      }
      acc += seg;
    }
    for (; ci < chev.length; ci++) chev[ci].visible = false;
  }

  return {
    update(dt, t, target) {
      const driving = player.st.mode === 'jeep' && !!target && arc(player.st.dir, target.dir) > target.near + 2;
      if (driving !== shown) { shown = driving; document.getElementById('minimapBox').classList.toggle('hide', !driving); if (!driving) chev.forEach(m => (m.visible = false)); }
      if (!driving) return;
      routeT -= dt;
      if (routeT <= 0 || routeTo !== target.dir) { routeT = 1.2; routeTo = target.dir; route = findRoute(player.st.dir, target.dir); }
      layChevrons(t);
      drawT -= dt; if (drawT <= 0) { drawT = 0.1; draw(target.dir, target.label); }
    },
  };
}
