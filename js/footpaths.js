// ─── FOOTPATHS: Lantern Park's cobbles, carried out of the park to somewhere ───
// The park's ring round the pond and its four paths out used to stop dead on the lawn. Now they
// are one cobbled network that goes somewhere: the east and north paths run on to road 11's
// kerb, and so does the south one, curving round to meet it square. Each ends in a little
// bell-mouth apron that tucks under the kerb (a dropped kerb). The west path becomes the
// MEADOW TRAIL. It winds out across the grass and up through the wildflowers (meadow.js keeps
// its planting off it) to a ROSE ARBOUR in the middle of the meadow (buildings.js roseArbour):
// a round paved terrace with benches either side of the path. From there it bends back east to
// road 11, where a painted zebra crossing takes you over to Maple Plaza's pavement. A short
// cobbled apron crosses the verge on that side and tucks under the pavement's edge.
//
// One surface: the whole network is meshed from a 2D signed distance field (the ring, the
// paths as capsule chains, the terrace, the aprons) joined with a smooth minimum. So every
// join is a fillet, with no patch laid on a patch: nothing overlaps and nothing z-fights. The
// field is clipped off the roads (it stops 4 cm in under the kerb band). The field lives on an
// azimuthal-equidistant chart round the park (park-local x, z in metres). It is cut by marching
// triangles on a fine grid, like the road sheet (world.js buildRoadSurface). Inside the edge,
// the field takes the shared cobble texture laid in metres. A border course of long setts runs
// round every edge, its u the arclength along that edge. A skirt drops from the edge into the
// ground, so no edge shows daylight on a slope. It is all one mesh in one material: one draw.
//
// Heights: on the park lawn the cobbles sit where the old ones did (1.2 cm over the lawn). Off
// it, they lie 1.6 cm over the planet as drawn. Near a kerb they rise to meet the kerb band's
// underside. The zebra's stripes are paint draped on the road sheet (no change to ROADS: cars
// still follow the road).
import * as THREE from 'three';
import { R, ROADS, PADS, ZONES, padDist, closestOnRoad, radiusAt, drawnGroundAt, SHEET, arc, yawToFace } from './world.js';
import { groundsMats, COBBLE_TILE, COBBLE_COURSES } from './grounds.js';
import { paint } from './style.js';
import { PARK, ARBOUR, roseArbour, placeOnPlanet } from './buildings.js';

const H = 0.08;                 // the marching grid's pitch (m)
const K_SMIN = 0.6;             // the fillet: smooth-min blend width where two paths meet
const BORDER = 0.12;            // the border course's depth
const TUCK = 0.24;              // a path stops this far out from the carriageway's edge (the kerb band is 0.28)
const LIFT_OUT = 0.016, LIFT_PARK = 0.022, UNDER = 0.012;
const smin = (a, b, k = K_SMIN) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

export function buildFootpaths(scene, town) {
  const park = town.park, root = park.root;
  root.updateMatrixWorld(true);
  // ── the chart: park-local (x, z) ↔ a direction, distances true along every ray from the centre ──
  const c0 = root.getWorldPosition(new THREE.Vector3()).normalize();
  const ex = new THREE.Vector3().setFromMatrixColumn(root.matrixWorld, 0).projectOnPlane(c0).normalize();
  const ez = new THREE.Vector3().setFromMatrixColumn(root.matrixWorld, 2).projectOnPlane(c0);
  ez.addScaledVector(ex, -ez.dot(ex)).normalize();
  const D = (x, z, out = new THREE.Vector3()) => {
    const r = Math.hypot(x, z); if (r < 1e-9) return out.copy(c0);
    const t = r / R, s = Math.sin(t) / r;
    return out.copy(c0).multiplyScalar(Math.cos(t)).addScaledVector(ex, x * s).addScaledVector(ez, z * s);
  };
  const Lc = (d) => {
    const X = d.dot(ex), Z = d.dot(ez), s = Math.hypot(X, Z); if (s < 1e-12) return [0, 0];
    const r = Math.atan2(s, d.dot(c0)) * R; return [X / s * r, Z / s * r];
  };
  // ── the roads (and car-park pads) near enough to matter ──
  const near = ROADS.map((rd, i) => i).filter(i => { const rd = ROADS[i]; if (rd.deck) return false;
    return rd.disc ? arc(rd.disc.c, c0) < 32 : rd.pts.some(p => arc(p, c0) < 32); });
  const pads = PADS.filter(P => arc(P.c, c0) < 32);
  const roadAt = (d) => {                 // signed distance past the carriageway's edge, and the road
    let best = 1e9, bi = -1, bc = null;
    for (const i of near) {
      const rd = ROADS[i], c = closestOnRoad(d, rd), s = c.dist - (rd.disc ? rd.disc.r : rd.half);
      if (s < best) { best = s; bi = i; bc = c; }
    }
    for (const P of pads) best = Math.min(best, padDist(P, d));
    return { s: best, i: bi, c: bc };
  };
  // the road sheet's drawn height along a direction (null off the sheet)
  const rc = new THREE.Raycaster(), _o = new THREE.Vector3(), _n = new THREE.Vector3();
  const sheetH = (d) => {
    rc.set(_o.copy(d).multiplyScalar(R + 4), _n.copy(d).negate()); rc.far = 8;
    const h = rc.intersectObjects(SHEET.meshes, false)[0];
    return h ? R + 4 - h.distance : null;
  };
  // the kerb band's top at its outer edge, opposite the point d
  const kerbTop = (d, rr) => {
    if (!rr.c || !rr.c.p) return null;
    const rd = ROADS[rr.i], P = rr.c.p.clone().multiplyScalar(R), V = d.clone().multiplyScalar(R);
    const u = V.sub(P).projectOnPlane(rr.c.p); if (u.lengthSq() < 1e-10) return null;
    const k = P.addScaledVector(u.normalize(), (rd.disc ? rd.disc.r : rd.half) + 0.265).normalize();
    return sheetH(k);
  };

  // ── the layout (park-local metres; +z toward town) ──
  const { RING, PATH } = PARK, HW = PATH / 2, IN = RING + 0.5, EDGE = 4.75;
  // a kerb to run a path to: the nearest point of the nearest road's centre line to `guide`, its
  // side normal (pointing back toward the guide) and half-width
  const kerbAt = (gx, gz) => {
    const rr = roadAt(D(gx, gz)), rd = ROADS[rr.i];
    const p = Lc(rr.c.p), q = Lc(rr.c.p.clone().multiplyScalar(R).addScaledVector(rr.c.tan, 0.3).normalize());
    let tx = q[0] - p[0], tz = q[1] - p[1]; const tl = Math.hypot(tx, tz); tx /= tl; tz /= tl;
    let nx = -tz, nz = tx; if (nx * (gx - p[0]) + nz * (gz - p[1]) < 0) { nx = -nx; nz = -nz; }
    return { p, t: [tx, tz], n: [nx, nz], half: rd.half, road: rr.i };
  };
  const off = (k, a, b = 0) => [k.p[0] + k.n[0] * a + k.t[0] * b, k.p[1] + k.n[1] * a + k.t[1] * b];
  // a path's run-in to a kerb: square on for the last stretch, then into the road (clipped there)
  const runIn = (k, w) => [[...off(k, k.half + 1.0), w], [...off(k, k.half + 0.45), w], [...off(k, k.half - 0.3), w]];
  // the bell-mouth: a disc clipped by the road, so it flares evenly either side even on a bend
  const apron = (k) => ({ a: off(k, k.half + 0.2), b: off(k, k.half + 0.2), r: 0.5 });
  const kE = kerbAt(5.6, 0), kN = kerbAt(0, 4.9), kS = kerbAt(0.3, -8.6), kX = kerbAt(-3.6, 14.6);
  // an arm that leaves the park straight along its axis, then bends (an arc of radius `rad`) onto
  // a straight run square to the kerb: the corner is where the axis meets that run's line
  const bendTo = (ax, az, k, rad) => {
    const sx = Math.abs(k.n[0]) > 1e-6 && ax === 0 ? (0 - k.p[0]) / k.n[0] : (0 - k.p[1]) / k.n[1];
    const C = off(k, sx);
    return fillet([[ax * IN, az * IN], [ax * EDGE * 0.9, az * EDGE * 0.9], C, off(k, k.half - 0.3)], rad).map(([x, z]) => [x, z, HW]);
  };
  const A = { x: -9.07, z: 13.25 };                  // the rose arbour: the meadow's middle
  const chains = [
    [[IN, 0, HW], [EDGE, 0, HW], ...runIn(kE, HW)],                                        // east, straight to the kerb
    bendTo(0, 1, kN, 1.4),                                                                // north, easing round square to the kerb
    bendTo(0, -1, kS, 0.85),                                                              // south, bending east to meet the road square
    // the meadow trail: west out of the park, winding up through the flowers to the arbour, then
    // on round and back east to the crossing
    [[-IN, 0, HW], [-EDGE, 0, HW], [-6.0, 0.4, 0.32], [-7.1, 1.7, 0.32], [-7.6, 3.6, 0.33], [-7.25, 5.6, 0.33], [-7.5, 7.6, 0.34],
      [-8.2, 9.6, 0.34], [-8.75, 11.5, 0.34], [A.x, A.z, 0.34], [-9.38, 14.95, 0.34], [-9.2, 15.9, 0.34], [-8.3, 16.45, 0.33],
      [-6.7, 16.45, 0.33], [-5.2, 15.7, 0.32], ...runIn(kX, 0.32)],
  ].map((c) => sampleChain(c.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 0.05)));
  const discs = [{ x: A.x, z: A.z, r: 1.42 }];
  const caps = [apron(kE), apron(kN), apron(kS), apron(kX)];
  const fieldMain = (x, z) => {
    let f = Math.abs(Math.hypot(x, z) - RING) - HW;
    for (const ch of chains) f = smin(f, chainDist(ch, x, z));
    for (const c of discs) f = smin(f, Math.hypot(x - c.x, z - c.z) - c.r);
    for (const c of caps) f = smin(f, segDist(x, z, c.a, c.b) - c.r, 0.35);
    return f;
  };

  // the far side of the crossing: across the verge to Maple Plaza's pavement, if there's one there
  // (scan out from the far kerb for the first raised paving past a strip of grass)
  let far = null;
  {
    const nx = -kX.n[0], nz = -kX.n[1];
    let grass = false;
    for (let s = kX.half + 0.3; s < kX.half + 1.6; s += 0.04) {
      const x = kX.p[0] + nx * s, z = kX.p[1] + nz * s, d = D(x, z), g = drawnGroundAt(d);
      const top = standTop(d, g);
      if (top - g < 0.015) grass = true;
      else if (grass && top - g > 0.03) { far = { s0: kX.half + 0.28, s1: s, kerb: null, pave: top }; break; }
    }
    if (far) {
      const kd = D(kX.p[0] + nx * (kX.half + 0.265), kX.p[1] + nz * (kX.half + 0.265));
      far.kerb = sheetH(kd);
      far.a = [kX.p[0] + nx * (kX.half - 0.3), kX.p[1] + nz * (kX.half - 0.3)];
      far.b = [kX.p[0] + nx * (far.s1 + 0.12), kX.p[1] + nz * (far.s1 + 0.12)];
      far.n = [nx, nz];
      if (far.kerb == null) far = null;
    }
  }
  // (the pavement's top under a direction: the highest thing drawn there, from the town's statics)
  function standTop(d, g) {
    rc.set(_o.copy(d).multiplyScalar(R + 4), _n.copy(d).negate()); rc.far = 8;
    let best = g;
    for (const h of rc.intersectObjects(town.statics.filter(o => o.position.distanceTo(_o) < 30), true)) {
      if (h.object.userData.isInk || !h.face) continue;
      const r = R + 4 - h.distance; if (r < g + 0.2 && r > best) best = r;
    }
    return best;
  }
  // (it stops at the edge of any reserved ground it meets: the pavement's own zone, the mall's)
  const zonesNear = ZONES.filter(zz => zz.key !== 'park' && zz.key !== 'meadow' && arc(zz.dir, c0) < 34);
  const zoneGap = (x, z) => { const d = D(x, z); let m = 1e9; for (const zz of zonesNear) m = Math.min(m, arc(d, zz.dir) - zz.r); return m; };
  const fieldFar = far ? (x, z) => Math.max(segDist(x, z, far.a, far.b) - 0.42, 0.01 - zoneGap(x, z)) : null;

  // ── heights ──
  // on the lawn: 1 cm over it; off it: 1.6 cm over the planet as drawn (the step at the lawn's edge
  // is half a centimetre, spread over one grid cell). Near a kerb they rise toward the kerb band, but
  // never more than 2 cm off the ground (a kerb on a slope stands proud, as kerbs do)
  const heightMain = (x, z, d, rr) => {
    const g = drawnGroundAt(d);
    let h = Math.hypot(x, z) < EDGE + 0.05 ? radiusAt(d) + LIFT_PARK : g + LIFT_OUT;
    if (rr.s < 1.0) {
      const kt = kerbTop(d, rr);
      if (kt != null) h = Math.max(h, Math.min(kt - UNDER - 0.07 * Math.max(0, rr.s - 0.28), g + 0.02));
    }
    return h;
  };
  // ── mesh it ──
  const out = { pos: [], uv: [], nrm: [], idx: [], keyN: [] };
  const lines = [];
  const pieces = [{ field: fieldMain, height: heightMain, tag: 'main' }];
  if (fieldFar) pieces.push({ field: fieldFar, height: heightMain, tag: 'far' });
  const stats = { tris: 0, loops: 0 };
  for (const pc of pieces) meshField(pc, out, stats, { D, roadAt, chains, far });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  geo.setIndex(out.idx); geo.computeBoundingSphere(); geo.computeBoundingBox();
  // the shared cobbles, a step behind the road sheet in depth (it must win where the kerb band
  // laps over a path's end), still in front of the lawns and the planet
  const mat = paint(0xffffff, { hatch: 0, side: THREE.DoubleSide, unique: true, map: groundsMats().cobble.map });
  mat.polygonOffset = true; mat.polygonOffsetFactor = mat.polygonOffsetUnits = -1;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'footpaths'; mesh.userData.noInk = true;
  const group = new THREE.Group(); group.name = 'footpaths'; group.add(mesh);
  scene.add(group);

  // ── the zebra crossing: white bars painted on the road sheet ──
  const zebra = paintZebra(kX, D, sheetH);
  if (zebra) group.add(zebra);

  // ── the rose arbour on its terrace ──
  const ad = D(A.x, A.z), aim = D(A.x - 0.18, A.z + 1);       // its axis along the trail through it
  const arbour = placeOnPlanet(roseArbour(), ad, yawToFace(ad, aim), { weight: 'fine', sink: 0, drawn: true });
  scene.add(arbour); town.statics.push(arbour);
  arbour.updateWorldMatrix(true, false);
  for (const [x, z, r] of arbour.userData.foots || []) town.colliders.push({ dir: arbour.localToWorld(new THREE.Vector3(x, 0, z)).normalize(), r, soft: false });

  // ── what other systems ask: is this direction on a path? (the meadow keeps its plants off) ──
  for (const ch of chains) lines.push(ch.filter((_, i) => i % 4 === 0 || i === ch.length - 1).map(([x, z]) => D(x, z)));
  if (far) lines.push([D(...far.a), D(...far.b)]);
  const reach = 30;
  const on = (d, pad = 0) => {
    if (arc(d, c0) > reach) return false;
    const [x, z] = Lc(d);
    let f = fieldMain(x, z);
    if (fieldFar) f = Math.min(f, fieldFar(x, z));
    return f < pad && roadAt(d).s > TUCK - pad;
  };
  town.footpaths = { kerbs: { kE, kN, kS, kX }, on, lines, group, mesh, arbour, zebra, chart: { D, L: Lc }, stats, far: far && { s0: far.s0, s1: far.s1, kerb: far.kerb, pave: far.pave, b: far.b }, arbourAt: ad };
  return town.footpaths;
}

// ── the field's pieces ──
// a chain: control points [x, z, halfWidth] → a dense centripetal Catmull-Rom polyline, the half
// width eased along it; with a bounding box per run of segments (so far chains cost nothing)
function sampleChain(ctrl) {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const pts = [], m = ctrl.length - 1;
  for (let k = 0; k < m; k++) {                                    // ~0.1 apart along each span
    const n = Math.max(2, Math.ceil(Math.hypot(ctrl[k + 1][0] - ctrl[k][0], ctrl[k + 1][1] - ctrl[k][1]) / 0.1));
    for (let i = 0; i < n || (k === m - 1 && i === n); i++) {
      const u = i / n, p = curve.getPoint((k + u) / m);
      pts.push([p.x, p.z, ctrl[k][2] + (ctrl[k + 1][2] - ctrl[k][2]) * u]);
    }
  }
  const boxes = [];
  for (let i = 0; i < pts.length - 1; i += 12) {
    const seg = pts.slice(i, Math.min(pts.length, i + 13));
    boxes.push({ i0: i, i1: Math.min(pts.length - 1, i + 12),
      x0: Math.min(...seg.map(p => p[0])), x1: Math.max(...seg.map(p => p[0])), z0: Math.min(...seg.map(p => p[1])), z1: Math.max(...seg.map(p => p[1])) });
  }
  pts.boxes = boxes;
  return pts;
}
// a polyline [[x, z], ...] with each inner corner rounded off by an arc of radius rad (less where
// the legs are too short for it), sampled densely
function fillet(P, rad) {
  const out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const A = P[i - 1], C = P[i], B = P[i + 1];
    const l1 = Math.hypot(A[0] - C[0], A[1] - C[1]), l2 = Math.hypot(B[0] - C[0], B[1] - C[1]);
    const u1 = [(A[0] - C[0]) / l1, (A[1] - C[1]) / l1], u2 = [(B[0] - C[0]) / l2, (B[1] - C[1]) / l2];
    const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));
    if (th > Math.PI - 0.02) { out.push(C); continue; }                    // (straight on: no corner)
    let t = rad / Math.tan(th / 2); t = Math.min(t, 0.48 * l1, 0.48 * l2);
    const r = t * Math.tan(th / 2), bx = u1[0] + u2[0], bz = u1[1] + u2[1], bl = Math.hypot(bx, bz);
    const O = [C[0] + bx / bl * r / Math.sin(th / 2), C[1] + bz / bl * r / Math.sin(th / 2)];
    const T1 = [C[0] + u1[0] * t, C[1] + u1[1] * t], T2 = [C[0] + u2[0] * t, C[1] + u2[1] * t];
    let a1 = Math.atan2(T1[1] - O[1], T1[0] - O[0]), a2 = Math.atan2(T2[1] - O[1], T2[0] - O[0]);
    while (a2 - a1 > Math.PI) a2 -= 2 * Math.PI; while (a1 - a2 > Math.PI) a2 += 2 * Math.PI;
    const n = Math.max(3, Math.ceil(Math.abs(a2 - a1) * r / 0.15));
    for (let j = 0; j <= n; j++) { const a = a1 + (a2 - a1) * j / n; out.push([O[0] + Math.cos(a) * r, O[1] + Math.sin(a) * r]); }
  }
  out.push(P[P.length - 1]);
  return out;
}
function chainDist(ch, x, z) {
  let best = 1e9;
  for (const b of ch.boxes) {
    const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
    if (Math.hypot(dx, dz) - 0.5 > best) continue;
    for (let i = b.i0; i < b.i1; i++) {
      const a = ch[i], c = ch[i + 1], abx = c[0] - a[0], abz = c[1] - a[1], l2 = abx * abx + abz * abz;
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / l2)) : 0;
      const d = Math.hypot(x - a[0] - abx * t, z - a[1] - abz * t) - (a[2] + (c[2] - a[2]) * t);
      if (d < best) best = d;
    }
  }
  return best;
}
function segDist(x, z, a, b) {
  const abx = b[0] - a[0], abz = b[1] - a[1], l2 = abx * abx + abz * abz;
  const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - a[0]) * abx + (z - a[1]) * abz) / l2)) : 0;
  return Math.hypot(x - a[0] - abx * t, z - a[1] - abz * t);
}

// ── marching triangles over one piece's field: the cobbles' top (field + border course) and skirt ──
function meshField({ field, height, tag }, out, stats, { D, roadAt }) {
  // the box to cover: where the field is under ~0.2 (found on a coarse pass)
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let x = -40; x <= 40; x += 0.4) for (let z = -40; z <= 40; z += 0.4) {
    if (Math.hypot(x, z) > 32) continue;
    if (field(x, z) < 0.45) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  }
  if (x0 > x1) return;
  x0 -= 0.6; z0 -= 0.6; x1 += 0.6; z1 += 0.6;
  const NX = Math.ceil((x1 - x0) / H) + 1, NZ = Math.ceil((z1 - z0) / H) + 1;
  // grid vertices: the field (clipped off the roads), lazily their direction, height and road
  const S = new Float32Array(NX * NZ).fill(NaN), G = new Map();
  const sAt = (i, k) => {
    const id = i * NZ + k; let s = S[id];
    if (Number.isNaN(s)) {
      const x = x0 + i * H, z = z0 + k * H;
      s = field(x, z);
      if (s < 0.3) s = Math.max(s, TUCK - roadAt(D(x, z)).s);
      S[id] = s;
    }
    return s;
  };
  const gv = (i, k) => {
    const id = i * NZ + k; let o = G.get(id);
    if (o) return o;
    const x = x0 + i * H, z = z0 + k * H, d = D(x, z);
    o = { id: tag + id, s: sAt(i, k), x, z, d, h: height(x, z, d, roadAt(d)), g: drawnGroundAt(d) };
    G.set(id, o); return o;
  };
  const onEdge = (A, B, level) => {
    if (A.id > B.id) [A, B] = [B, A];
    const t = (level - A.s) / (B.s - A.s);
    return { key: A.id + ':' + B.id + ':' + level, e: [A, B], s: level, x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t,
      d: A.d.clone().lerp(B.d, t).normalize(), h: A.h + (B.h - A.h) * t, g: A.g + (B.g - A.g) * t };
  };
  const gpt = (A) => ({ key: 'g' + A.id, e: null, v: A, s: A.s, x: A.x, z: A.z, d: A.d, h: A.h, g: A.g });
  const edgeOf = (P, Q) => {
    if (P.v && Q.v) return [P.v, Q.v];
    if (P.v && Q.e && (Q.e[0] === P.v || Q.e[1] === P.v)) return Q.e;
    if (Q.v && P.e && (P.e[0] === Q.v || P.e[1] === Q.v)) return P.e;
    if (P.e && Q.e && P.e[0] === Q.e[0] && P.e[1] === Q.e[1]) return P.e;
    return null;
  };
  const clip = (poly, level, sign, contour) => {
    const res = [];
    for (let k = 0; k < poly.length; k++) {
      const P = poly[k], Q = poly[(k + 1) % poly.length];
      const pin = (P.s - level) * sign < 0, qin = (Q.s - level) * sign < 0;
      if (pin) res.push(P);
      if (pin !== qin) {
        const e = edgeOf(P, Q); let X;
        if (e) X = onEdge(e[0], e[1], level);
        else { const t = (level - P.s) / (Q.s - P.s); X = { key: P.key + '~' + Q.key + ':' + level, e: null, s: level, x: P.x + (Q.x - P.x) * t, z: P.z + (Q.z - P.z) * t, d: P.d.clone().lerp(Q.d, t).normalize(), h: P.h + (Q.h - P.h) * t, g: P.g + (Q.g - P.g) * t }; }
        res.push(X); if (contour) contour.push(X);
      }
    }
    return res;
  };
  // pass 1: the clipped polygons, and the edge contour's pieces
  const polys = [], segs = [];
  const tri = (A, B, C) => {
    if (A.s >= 0 && B.s >= 0 && C.s >= 0) return;
    const T = [gpt(A), gpt(B), gpt(C)];
    const inner = clip(T, -BORDER, 1);
    if (inner.length >= 3) polys.push({ p: inner, cls: 0 });
    const contour = [], inside = clip(T, 0, 1, contour);
    const band = clip(inside, -BORDER, -1);
    if (band.length >= 3) polys.push({ p: band, cls: 1 });
    if (contour.length === 2) segs.push({ a: contour[0], b: contour[1], inside });
  };
  for (let i = 0; i < NX - 1; i++) for (let k = 0; k < NZ - 1; k++) {
    if (sAt(i, k) > 0.25 && sAt(i + 1, k) > 0.25 && sAt(i, k + 1) > 0.25 && sAt(i + 1, k + 1) > 0.25) continue;
    const a = gv(i, k), b = gv(i + 1, k), c = gv(i + 1, k + 1), d = gv(i, k + 1);
    tri(a, b, c); tri(a, c, d);
  }
  // pass 2: chain the contour into loops, each measured, for the border course's u
  const byKey = new Map();
  segs.forEach((sg, n) => { for (const P of [sg.a, sg.b]) { let l = byKey.get(P.key); if (!l) byKey.set(P.key, l = []); l.push(n); } });
  const used = new Uint8Array(segs.length), loops = [];
  for (let s0 = 0; s0 < segs.length; s0++) {
    if (used[s0]) continue;
    const pts = [segs[s0].a, segs[s0].b]; used[s0] = 1;
    for (;;) {                                                    // walk on from the last point
      const last = pts[pts.length - 1], nx = (byKey.get(last.key) || []).find(n => !used[n]);
      if (nx === undefined) break;
      used[nx] = 1; pts.push(segs[nx].a.key === last.key ? segs[nx].b : segs[nx].a);
    }
    const S = [0]; for (let i = 1; i < pts.length; i++) S.push(S[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    const L = S[S.length - 1], tiles = Math.max(1, Math.round(L / (BORDER * COBBLE_COURSES)));
    loops.push({ pts, S, L, tiles, ku: tiles / Math.max(1e-6, L) });
  }
  stats.loops += loops.length;
  // the contour's pieces in a hash, for the nearest point of the edge to any border vertex
  const HC = 0.25, hash = new Map(), hk = (x, z) => Math.floor(x / HC) * 100003 + Math.floor(z / HC);
  loops.forEach((lp, li) => { for (let i = 0; i < lp.pts.length - 1; i++) {
    const a = lp.pts[i], b = lp.pts[i + 1], k = hk((a.x + b.x) / 2, (a.z + b.z) / 2);
    let l = hash.get(k); if (!l) hash.set(k, l = []); l.push([li, i]);
  } });
  const uOf = (P) => {
    let best = 1e9, bu = 0, bl = 0;
    const cx = Math.floor(P.x / HC), cz = Math.floor(P.z / HC);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [li, si] of hash.get((cx + i) * 100003 + cz + j) || []) {
      const lp = loops[li], a = lp.pts[si], b = lp.pts[si + 1], abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz;
      const t = l2 > 1e-12 ? Math.max(0, Math.min(1, ((P.x - a.x) * abx + (P.z - a.z) * abz) / l2)) : 0;
      const dd = Math.hypot(P.x - a.x - abx * t, P.z - a.z - abz * t);
      if (dd < best) { best = dd; bl = li; bu = (lp.S[si] + Math.sqrt(l2) * t) * lp.ku; }
    }
    return { u: bu, loop: bl };
  };
  // pass 3: emit. The field's uvs are in metres on the chart; the border's run along the edge
  const { pos, uv, nrm, idx, keyN } = out, vmap = new Map(), nAcc = new Map();
  const base = pos.length / 3;
  const emit = (P, cls, u = 0, wrapKey = '') => {
    const key = P.key + '|' + cls + wrapKey; let id = vmap.get(key);
    if (id !== undefined) return id;
    id = pos.length / 3; vmap.set(key, id);
    pos.push(P.d.x * P.h, P.d.y * P.h, P.d.z * P.h);
    if (cls === 0) uv.push(P.x / COBBLE_TILE, P.z / COBBLE_TILE);
    else if (cls === 1) uv.push(u, 1 + Math.max(-BORDER, Math.min(0, P.s)) / (BORDER * COBBLE_COURSES));
    else uv.push(u, cls === 2 ? 1 : 1 - 0.3 / COBBLE_COURSES);
    keyN.push(cls < 2 ? P.key : null);
    nrm.push(P.d.x, P.d.y, P.d.z);
    return id;
  };
  const up = (a, b, c) => {                                       // wind a triangle to face out from the planet
    const A = a * 3, B = b * 3, C = c * 3;
    const ux = pos[B] - pos[A], uy = pos[B + 1] - pos[A + 1], uz = pos[B + 2] - pos[A + 2];
    const vx = pos[C] - pos[A], vy = pos[C + 1] - pos[A + 1], vz = pos[C + 2] - pos[A + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    return nx * pos[A] + ny * pos[A + 1] + nz * pos[A + 2] >= 0 ? [a, b, c, nx, ny, nz] : [a, c, b, -nx, -ny, -nz];
  };
  const face = (a, b, c, acc = true) => {
    const [p, q, r, nx, ny, nz] = up(a, b, c); idx.push(p, q, r); stats.tris++;
    if (!acc) return;
    for (const v of [p, q, r]) { const k = keyN[v]; let n = nAcc.get(k); if (!n) nAcc.set(k, n = [0, 0, 0]); n[0] += nx; n[1] += ny; n[2] += nz; }
  };
  for (const { p, cls } of polys) {
    if (cls === 0) { const ids = p.map(P => emit(P, 0)); for (let k = 1; k < ids.length - 1; k++) face(ids[0], ids[k], ids[k + 1]); continue; }
    const us = p.map(uOf), L0 = loops[us[0].loop];
    let lo = Infinity, hi = -Infinity; for (const o of us) { lo = Math.min(lo, o.u); hi = Math.max(hi, o.u); }
    const wrap = hi - lo > L0.tiles / 2;                          // across the loop's start: lift the low end by a lap
    const ids = p.map((P, k) => { let u = us[k].u; const w = wrap && u < L0.tiles / 2; if (w) u += L0.tiles; return emit(P, 1, u, w ? '#w' : ''); });
    for (let k = 1; k < ids.length - 1; k++) face(ids[0], ids[k], ids[k + 1]);
  }
  // the normals: every top vertex the average of the faces round its spot (field and border alike)
  for (let v = base; v < pos.length / 3; v++) {
    const n = nAcc.get(keyN[v]); if (!n) continue;
    const l = Math.hypot(n[0], n[1], n[2]) || 1; nrm[v * 3] = n[0] / l; nrm[v * 3 + 1] = n[1] / l; nrm[v * 3 + 2] = n[2] / l;
  }
  // the skirt: from the edge down into the ground, turned to face outward
  for (const lp of loops) for (let i = 0; i < lp.pts.length - 1; i++) {
    const P = lp.pts[i], Q = lp.pts[i + 1], uP = lp.S[i] * lp.ku, uQ = lp.S[i + 1] * lp.ku;
    const b0 = pos.length / 3;
    for (const [X, u] of [[P, uP], [Q, uQ]]) {
      const bot = Math.min(X.h - 0.025, X.g - 0.02);
      pos.push(X.d.x * X.h, X.d.y * X.h, X.d.z * X.h, X.d.x * bot, X.d.y * bot, X.d.z * bot);
      uv.push(u, 1, u, 1 - 0.3 / COBBLE_COURSES); keyN.push(null, null);
      nrm.push(X.d.x, X.d.y, X.d.z, X.d.x, X.d.y, X.d.z);
    }
    // outward: away from the path's side of the edge (the field rises outward)
    const mx = (P.x + Q.x) / 2, mz = (P.z + Q.z) / 2, tx = Q.x - P.x, tz = Q.z - P.z;
    const ox = tz, oz = -tx;                                      // one side of the edge, on the chart
    const ahead = field(mx + ox * 0.5, mz + oz * 0.5) > field(mx - ox * 0.5, mz - oz * 0.5);   // is that side outside?
    const M = D(mx, mz), O = D(mx + (ahead ? ox : -ox) * 0.2, mz + (ahead ? oz : -oz) * 0.2).sub(M);
    const A = new THREE.Vector3(pos[b0 * 3], pos[b0 * 3 + 1], pos[b0 * 3 + 2]), B2 = new THREE.Vector3(pos[b0 * 3 + 3], pos[b0 * 3 + 4], pos[b0 * 3 + 5]), C = new THREE.Vector3(pos[b0 * 3 + 6], pos[b0 * 3 + 7], pos[b0 * 3 + 8]);
    const fn = B2.sub(A).cross(C.sub(A));
    if (fn.dot(O) >= 0) idx.push(b0, b0 + 1, b0 + 2, b0 + 2, b0 + 1, b0 + 3); else idx.push(b0, b0 + 2, b0 + 1, b0 + 2, b0 + 3, b0 + 1);
    stats.tris += 2;
  }
}

// ── the zebra: bars along the road, spaced across it, draped on the road sheet ──
function paintZebra(k, D, sheetH) {
  const BAR = 0.2, GAP = 0.17, LEN = 0.95, N = 4, span = N * BAR + (N - 1) * GAP;
  const pos = [], idx = [];
  for (let b = 0; b < N; b++) {
    const s0 = -span / 2 + b * (BAR + GAP);
    const base = pos.length / 3;
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 2; j++) {
      const along = (i / 6 - 0.5) * LEN, across = s0 + BAR * j / 2;
      const x = k.p[0] + k.t[0] * along + k.n[0] * across, z = k.p[1] + k.t[1] * along + k.n[1] * across;
      const d = D(x, z), h = sheetH(d); if (h == null) return null;
      pos.push(d.x * (h + 0.012), d.y * (h + 0.012), d.z * (h + 0.012));
    }
    for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { const a = base + i * 3 + j; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  // face out from the planet
  const p = g.attributes.position, I = g.index.array;
  for (let t = 0; t < I.length; t += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, I[t]), b = new THREE.Vector3().fromBufferAttribute(p, I[t + 1]), c = new THREE.Vector3().fromBufferAttribute(p, I[t + 2]);
    if (b.sub(a).cross(c.sub(a)).dot(a) < 0) { const q = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = q; }
  }
  g.computeVertexNormals();
  const uv = []; for (let i = 0; i < p.count; i++) uv.push((i % 3) / 2, Math.floor(i / 3) / 6);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const m = new THREE.Mesh(g, groundsMats().line);
  m.name = 'zebra'; m.userData.noInk = true; m.userData.noGround = true; m.userData.roadPart = 'zebra';
  return m;
}
