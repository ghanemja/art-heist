// ─── THE ROUNDABOUT: where the boulevard, the Riverbend bridge road and YarnFlow's road meet ───
// It used to be three T junctions a car's length apart and a country lane curling round the
// grass between them: a wedge of leftover ground in the middle of town's north-west corner.
// Now the boulevard opens there into a circular carriageway (a closed road: world.js draws its
// kerbs and returns like any other), and every road that meets it — the boulevard's two ends,
// the bridge road, YarnFlow's road — arrives square and radial onto its middle line (meetSquare /
// spur() leave a ring the way they leave any road). In the middle: a grass dome inside a low
// stone kerb, a ring of flowers, and a sculpture — a ball of yarn with a crochet hook through it,
// a nod to YarnFlow across the road.
//
// planRoundabout() picks the spot on the boulevard's planned line (PLAN.town.roundabout) before
// any road is laid; town.js lays the ring first, then the boulevard opened round it
// (openThrough), reserves the island, and builds it (buildIsland) once the roads exist.
import * as THREE from 'three';
import { R, arc, frame, slerpDir, resample, smooth, alignToSurface, drawnGroundAt, reserve } from './world.js';
import { PAL, paint, ink } from './style.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lathe } from './props.js';
import { placeOnPlanet } from './buildings.js';
import { growPlants, plantsOf, C } from './plants.js';

// spec: { at: [lat, lon] near the boulevard, ring: centre-line radius, half: carriageway half-width,
// out: how far the centre sits off the boulevard's line, away from town (into the grass it fills) }
export function planRoundabout(blvd, spec, townC, llv) {
  const want = llv(spec.at);
  let p0 = blvd[0]; for (const p of blvd) if (arc(p, want) < arc(p0, want)) p0 = p;
  const away = p0.clone().sub(townC.clone().multiplyScalar(townC.dot(p0) / p0.dot(p0))).projectOnPlane(p0).normalize();
  const c = p0.clone().multiplyScalar(R).addScaledVector(away, spec.out || 0).normalize();
  const f = frame(c, townC), pts = [];
  const N = Math.max(24, Math.round(2 * Math.PI * spec.ring / 0.6));
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; pts.push(f(Math.cos(a) * spec.ring, Math.sin(a) * spec.ring)); }
  // the island: the dome inside the ring's inner kerb band (world.js KERB 0.28) — reserved, so
  // nothing else is built on it and later roads bend round it
  const island = spec.ring - spec.half - 0.28;
  return { c, r: spec.ring, half: spec.half, island, pts, f };
}
export function reserveIsland(rb) { reserve(rb.c, rb.island + 0.15, 'roundabout'); }

// the boulevard (a closed ring of samples) opened where it runs through the roundabout: the
// samples inside the circle go, the rest run from one crossing round to the other, each end
// exactly on the ring's middle line (buildRoad then brings each in square to it)
export function openThrough(loop, rb) {
  const P = resample(loop, 0.6, true), n = P.length;
  const inside = P.map(p => arc(p, rb.c) < rb.r);
  let k0 = inside.findIndex((v, i) => v && !inside[(i - 1 + n) % n]);           // first sample of the inside run
  if (k0 < 0) return null;
  let k1 = k0; while (inside[(k1 + 1) % n]) k1 = (k1 + 1) % n;                    // its last
  const cross = (a, b) => { let lo = a, hi = b; for (let it = 0; it < 30; it++) { const m = slerpDir(lo, hi, 0.5); if (arc(m, rb.c) < rb.r) hi = m; else lo = m; } return hi; };
  const out = [];
  out.push(cross(P[(k1 + 1) % n], P[k1]));
  for (let i = (k1 + 1) % n; i !== k0; i = (i + 1) % n) if (!inside[i]) out.push(P[i]);
  out.push(cross(P[(k0 - 1 + n) % n], P[k0]));
  return out;
}

// the boulevard as one loop again, round the roundabout: from one end along the ring (the short
// way) to the other. The cyclists ride it, and it bounds "the main town" (citizens.js)
export function loopThrough(open, rb) {
  const A = open[open.length - 1], B = open[0];
  const f = rb.f, ang = (d) => { const v = d.clone().multiplyScalar(R).sub(rb.c.clone().multiplyScalar(R)); return Math.atan2(v.dot(f(0, 1).sub(rb.c)), v.dot(f(1, 0).sub(rb.c))); };
  const a0 = ang(A); let da = ang(B) - a0;
  while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const m = Math.max(3, Math.round(Math.abs(da) * rb.r / 0.6)), arcPts = [];
  // points on the circle by angle, in the ring's own frame (f(x, y) is a direction at x, y units)
  for (let k = 1; k < m; k++) { const a = a0 + da * k / m; arcPts.push(rb.f(Math.cos(a) * rb.r, Math.sin(a) * rb.r)); }
  return smooth([...open, ...arcPts], 3, true);
}

// ── the island ──
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
// painted turf: a mottled green with darker clumps, light patches and short blade strokes in
// three greens, a few clover leaves and specks of daisy — reads as a full, mown lawn, not flat paint
const TURF_TILE = 1.6;                                   // metres per tile
let _turf = null;
function turfTex() {
  if (_turf) return _turf;
  const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n;
  const c = cv.getContext('2d'), R = rng(5303);
  c.fillStyle = '#a9c27f'; c.fillRect(0, 0, n, n);
  // wrapped draw: everything near an edge is drawn again on the far side, so the tile repeats seamlessly
  const wrap = (fn, x, y, r) => { for (const dx of [-n, 0, n]) for (const dy of [-n, 0, n]) if (x + dx > -r && x + dx < n + r && y + dy > -r && y + dy < n + r) fn(x + dx, y + dy); };
  // soft clumps, darker and lighter
  for (let i = 0; i < 70; i++) {
    const x = R() * n, y = R() * n, r = 10 + R() * 26, dark = R() > 0.45;
    c.fillStyle = dark ? 'rgba(110,150,84,0.28)' : 'rgba(205,220,150,0.22)';
    wrap((X, Y) => { c.beginPath(); c.ellipse(X, Y, r, r * (0.6 + R() * 0.4), R() * 3, 0, 7); c.fill(); }, x, y, r);
  }
  // blade strokes: short curved ticks, mostly upright, in three greens
  const greens = ['#7fa55a', '#94b867', '#b8cf86', '#6c9450'];
  c.lineCap = 'round';
  for (let i = 0; i < 1500; i++) {
    const x = R() * n, y = R() * n, l = 4 + R() * 6, a = -Math.PI / 2 + (R() - 0.5) * 0.9, bend = (R() - 0.5) * 3;
    c.strokeStyle = greens[Math.floor(R() * greens.length)]; c.lineWidth = 1 + R() * 1.2;
    wrap((X, Y) => { c.beginPath(); c.moveTo(X, Y); c.quadraticCurveTo(X + bend, Y + Math.sin(a) * l * 0.5, X + Math.cos(a) * l + bend, Y + Math.sin(a) * l); c.stroke(); }, x, y, 12);
  }
  // clover leaves and daisy specks
  for (let i = 0; i < 26; i++) {
    const x = R() * n, y = R() * n;
    c.fillStyle = '#6f9a54';
    wrap((X, Y) => { for (let k = 0; k < 3; k++) { const a = k * 2.09 + R(); c.beginPath(); c.arc(X + Math.cos(a) * 2.6, Y + Math.sin(a) * 2.6, 2.4, 0, 7); c.fill(); } }, x, y, 6);
  }
  for (let i = 0; i < 18; i++) {
    const x = R() * n, y = R() * n;
    wrap((X, Y) => { c.fillStyle = '#f6eedb'; c.beginPath(); c.arc(X, Y, 1.8, 0, 7); c.fill(); c.fillStyle = '#e9a93a'; c.beginPath(); c.arc(X, Y, 0.8, 0, 7); c.fill(); }, x, y, 3);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return (_turf = t);
}
const STONE = 0xcfc3ad, STONE_TOP = 0xe9e0cc;
const BRONZE = 0x9a6a3e, YARN = 0xe07a8e, YARN_D = 0xc75f74, WOOD = 0xc89a5e;
const DOME_H = 0.42;                                     // the grass dome's rise at the middle
// the dome's height above its rim at radius r (0 … rIn): a soft cap, flat-ish on top
const domeY = (r, rIn) => { const t = Math.min(1, r / rIn); return 0.12 + DOME_H * (1 - t * t) * (1 - 0.35 * t * t); };

// a ball of yarn: a sphere wound with raised strands (tubes round great circles at many tilts),
// one loose end trailing down, a crochet hook pushed through it at a jaunty angle
function yarnSculpture() {
  const g = new THREE.Group();
  const r = 0.36;
  const yarn = paint(YARN), yarnD = paint(YARN_D), hook = paint(BRONZE), handle = paint(WOOD);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 22), yarn); ball.position.y = r; g.add(ball);
  // the winding: bands of strands, each a ring round the ball at its own tilt
  const rng = (() => { let s = 4711; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
  const strands = [[], []];
  for (let k = 0; k < 11; k++) {
    const tilt = new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    for (let j = -1; j <= 1; j++) {
      const pts = [], rr = r * 1.006, off = j * 0.045;
      for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, s = Math.sqrt(Math.max(0, rr * rr - off * off)); pts.push(new THREE.Vector3(Math.cos(a) * s, off, Math.sin(a) * s).applyEuler(tilt)); }
      strands[k % 3 ? 0 : 1].push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.012, 5, true));
    }
  }
  strands.forEach((geos, i) => { const t = new THREE.Mesh(mergeGeometries(geos, false), i ? yarnD : yarn); t.position.y = r; t.userData.noInk = true; g.add(t); });
  // the loose end: off the ball's side, curling down over the plinth's top and over its edge
  { const pts = [[0.3, r + 0.14, 0.17], [0.4, r - 0.05, 0.22], [0.42, 0.06, 0.18], [0.34, 0.012, 0.0], [0.24, 0.012, -0.22], [0.12, 0.012, -0.3], [0.0, 0.01, -0.36]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.02, 6, false), yarnD)); }
  // the hook: a long shaft in through the top of the ball, its throat and barb above, a flat grip
  { const h = new THREE.Group();
    const L = 1.25, sr = 0.032;
    h.add(new THREE.Mesh(lathe([[0.001, -0.02], [sr * 0.7, 0], [sr, 0.06], [sr, L - 0.16], [sr * 0.9, L - 0.1], [sr * 0.75, L - 0.04], [0.001, L]], 14), hook));
    // the hooked tip: a small curl back down off the top of the shaft
    const tip = []; for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI * 1.15; tip.push(new THREE.Vector3(-0.045 + Math.cos(a) * 0.045, L - 0.03 + Math.sin(a) * 0.05, 0)); }
    h.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tip), 16, sr * 0.65, 8, false), hook));
    // the thumb rest: a flattened lozenge a third of the way up
    const grip = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), handle); grip.scale.set(0.06, 0.16, 0.022); grip.position.y = L * 0.42; h.add(grip);
    h.position.set(-0.05, r * 0.9, 0.02); h.rotation.set(0.1, 0.4, 0.42);
    g.add(h); }
  return g;
}

// the plinth: a stepped stone base, a drum, a moulded cap; a bronze plaque on the front
function plinth() {
  const g = new THREE.Group(), st = paint(STONE), top = paint(STONE_TOP), br = paint(BRONZE);
  g.add(new THREE.Mesh(lathe([[0.001, -0.2], [0.5, -0.2], [0.5, 0.06], [0.47, 0.1], [0.38, 0.1], [0.38, 0.14], [0.001, 0.14]], 32), top));
  g.add(new THREE.Mesh(lathe([[0.001, 0.12], [0.32, 0.12], [0.3, 0.16], [0.28, 0.2], [0.27, 0.62], [0.29, 0.66], [0.34, 0.69], [0.35, 0.74], [0.001, 0.74]], 32), st));
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.02), br);
  plaque.position.set(0, 0.42, 0.272); g.add(plaque);
  return g;
}

// the island as a group in its own frame (y up, at the ground): kerb, dome, flowers
function islandGroup(rIn) {
  const g = new THREE.Group();
  // the low stone kerb: a rounded ring standing 0.16 proud, its face meeting the road's kerb band
  const k0 = rIn, kw = 0.2;
  // (profile bottom → top, outside first, as a lathe wants it: its faces then look outward)
  g.add(new THREE.Mesh(lathe([[k0 - kw, -0.12], [k0 + 0.01, -0.12], [k0, 0.15], [k0 - 0.03, 0.18], [k0 - kw + 0.03, 0.18], [k0 - kw, 0.15], [k0 - kw, 0.1]], 72), paint(STONE)));
  // the grass dome inside it: rises softly to the middle
  const prof = [];
  for (let i = 0; i <= 12; i++) { const r = (k0 - kw + 0.02) * (1 - i / 12); prof.push([Math.max(0.001, r), domeY(r, k0 - kw)]); }
  prof.unshift([k0 - kw + 0.02, 0.0]);
  // (a lathe of its own, keeping UVs: planar, in metres, for the painted turf)
  const dome = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 64);
  { const p = dome.attributes.position, uv = dome.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / TURF_TILE, p.getZ(i) / TURF_TILE); }
  dome.computeVertexNormals();
  g.add(new THREE.Mesh(dome, paint(0xffffff, { map: turfTex(), hatch: 0.4 })));
  // flowers: a ring of mixed bedding round the dome's shoulder, low box balls inside the kerb,
  // a few spikes of lavender between them
  const P = plantsOf(g), rD = k0 - kw;
  const kinds = ['tulip', 'daisy', 'tulip', 'cosmos', 'daisy', 'spikes'];
  let n = 0;
  for (const [rr, cnt, scale] of [[rD - 0.32, 30, 1.0], [rD - 0.62, 22, 1.05]]) for (let i = 0; i < cnt; i++) {
    const a = (i + (rr < rD - 0.5 ? 0.5 : 0)) / cnt * Math.PI * 2;
    const k = kinds[(i + n) % kinds.length];
    P.push({ k, x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: domeY(rr, rD) - 0.03, s: scale * (0.9 + 0.2 * ((i * 37) % 7) / 7) });
    n++;
  }
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2 + 0.17, rr = rD - 0.1; P.push({ k: 'boxBall', x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: domeY(rr, rD) - 0.02, s: 1.1 }); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.4, rr = 0.75; P.push({ k: 'bloom', x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: domeY(rr, rD) - 0.04, s: 0.8 }); }
  // the turf filled out: short grass tufts and low leafy cushions scattered between the beds
  // (golden-angle spiral, so they spread evenly without lining up), clear of the plinth's foot
  const T = rng(911);
  for (let i = 0; i < 70; i++) {
    const rr = 0.6 + (rD - 0.25 - 0.6) * Math.sqrt((i + 0.5) / 70), a = i * 2.39996 + T() * 0.3;
    const tuft = i % 3 !== 2;
    P.push({ k: tuft ? 'grass' : 'mound', x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: domeY(rr, rD) - 0.02,
      s: tuft ? 0.32 + T() * 0.14 : 0.38 + T() * 0.12, c: tuft ? (T() > 0.5 ? C.grassD : C.leafL) : (T() > 0.5 ? C.leaf : C.leafD) });
  }
  return g;
}

// set the island down and the sculpture on it; returns { root, statue, plants, dir }
export function buildIsland(scene, rb, { add, solid, faceTo }) {
  const yaw = 0;
  const raw = islandGroup(rb.island);
  const g = add(placeOnPlanet(raw, rb.c, yaw, { weight: 'fine', sink: 0, drawn: true }));
  const plants = growPlants(scene, g, { seed: 41 });
  // the sculpture stands plumb on the dome's crown, its plinth's foot sunk into the turf
  const s = new THREE.Group();
  s.add(plinth());
  const y = yarnSculpture(); y.position.y = 0.74; s.add(y);
  ink(s, 'mid');
  const top = drawnGroundAt(rb.c) + domeY(0, rb.island - 0.2);
  s.position.copy(rb.c).multiplyScalar(top - 0.06);
  alignToSurface(s, rb.c, 0);
  // the plaque faces whoever comes in off the boulevard from town
  if (faceTo) { const q = s.quaternion.clone(), v = new THREE.Vector3(0, 0, 1).applyQuaternion(q), w = faceTo.clone().projectOnPlane(rb.c).normalize(), u = v.projectOnPlane(rb.c).normalize();
    s.rotateY(Math.atan2(new THREE.Vector3().crossVectors(u, w).dot(rb.c), u.dot(w))); }
  add(s);
  solid(rb.c, 0.55);                                      // the plinth: walkers and the car stop at it
  return { root: g, statue: s, plants, dir: rb.c.clone() };
}
