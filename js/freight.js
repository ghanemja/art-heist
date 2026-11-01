// ─── THE GOODS TRAIN: farm produce to town and back ──────────────────────────
// A branch line runs off the station's loop, across the countryside, to a loading halt at
// Hilltop Farm (rail.js railBranch). A little goods train shuttles along it: it waits by
// Central Station, runs out along the loop and onto the branch, stops at the farm's halt while
// it's loaded (hay bales, crates of vegetables, milk churns), and brings them back to town,
// where it's unloaded — then out again. Its engine leads out to the farm and pushes home.
import * as THREE from 'three';
import { R, arc, yawToFace } from './world.js';
import { PAL, paint, ink } from './style.js';
import { kit, lathe, signMat, placeOnPlanet } from './buildings.js';
import { rbox } from './props.js';
import { RAIL } from './rail.js';

const GAUGE = 0.4;                                   // rail centre-lines at ±0.4 (rail.js)
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();

// ── the cars: local +z forward, y up, y = 0 on the rails' top ──
function wheels(K, zs, r = 0.17) {
  const iron = paint(0x2f2a33), hub = paint(0xb4513c);
  for (const z of zs) for (const s of [-1, 1]) {
    K.put(new THREE.CylinderGeometry(r, r, 0.07, 16), iron, s * GAUGE, r, z, [0, 0, Math.PI / 2]);
    K.put(new THREE.CylinderGeometry(r * 0.45, r * 0.45, 0.08, 10), hub, s * (GAUGE + 0.01), r, z, [0, 0, Math.PI / 2]);
  }
}
function engine() {
  const K = kit(), body = paint(0x3f6e58), dark = paint(0x2f2a33), red = paint(0xb4513c), brass = paint(PAL.gold);
  K.box(0.86, 0.14, 1.75, dark, 0, 0.36, 0, 0.03);                                       // the frame
  K.put(new THREE.CylinderGeometry(0.34, 0.34, 1.05, 22), body, 0, 0.78, 0.28, [Math.PI / 2, 0, 0]);   // boiler
  K.put(new THREE.CylinderGeometry(0.35, 0.35, 0.16, 22), dark, 0, 0.78, 0.82, [Math.PI / 2, 0, 0]);   // smokebox
  K.put(lathe([[0.001, 0], [0.09, 0], [0.08, 0.28], [0.13, 0.38], [0.001, 0.38]], 14), dark, 0, 1.08, 0.66);   // chimney
  K.put(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), brass, 0, 1.11, 0.2);          // dome
  K.box(0.9, 0.95, 0.62, body, 0, 0.9, -0.55, 0.05);                                     // the cab
  K.box(1.0, 0.07, 0.8, dark, 0, 1.41, -0.55, 0.03);                                     // its roof
  for (const s of [-1, 1]) K.box(0.05, 0.32, 0.3, paint(0x46404e), s * 0.45, 1.08, -0.5, 0.01);   // cab windows
  for (const z of [0.92, -0.92]) K.box(0.92, 0.18, 0.06, red, 0, 0.4, z, 0.02);         // buffer beams
  K.put(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), paint(0xfff1c8, { emissive: 0xffd68a, hatch: 0 }), 0, 0.62, 0.95, [Math.PI / 2, 0, 0]);   // the lamp
  wheels(K, [0.55, 0, -0.55], 0.2);
  return K.g;
}
function wagon(kind) {
  const K = kit(), wood = paint(0x9a744e), dark = paint(0x2f2a33);
  K.box(0.86, 0.12, 1.3, dark, 0, 0.34, 0, 0.03);                                         // the frame
  K.box(0.9, 0.06, 1.34, wood, 0, 0.43, 0, 0.02);                                         // the deck
  for (const z of [0.69, -0.69]) K.box(0.8, 0.14, 0.05, paint(0xb4513c), 0, 0.36, z, 0.015);
  wheels(K, [0.42, -0.42]);
  const cargo = new THREE.Group(); K.g.add(cargo);
  const C = kit(cargo);
  if (kind === 'hay') {
    for (const z of [0.31, -0.31]) { C.put(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 16), paint(0xe2c06a), 0, 0.76, z, [0, 0, Math.PI / 2]);
      for (const x of [-0.18, 0.18]) C.put(new THREE.TorusGeometry(0.3, 0.014, 4, 16), paint(0xc9a24c), x, 0.76, z, [0, Math.PI / 2, 0]); }
  } else if (kind === 'veg') {
    for (const s of [-1, 1]) K.box(0.05, 0.3, 1.3, wood, s * 0.43, 0.6, 0, 0.015);        // low sides
    const cols = [0xe0703a, 0x7fa25a, 0xc8503c, 0xe4b84f];
    [[-0.2, 0.32], [0.2, 0.32], [-0.2, -0.32], [0.2, -0.32]].forEach(([x, z], i) => {
      C.box(0.36, 0.26, 0.5, paint(0xc29a68), x, 0.6, z, 0.03);
      for (let k = 0; k < 4; k++) C.put(new THREE.SphereGeometry(0.075, 8, 6), paint(cols[i]), x - 0.08 + (k % 2) * 0.16, 0.76, z - 0.12 + Math.floor(k / 2) * 0.24).userData.noInk = true;
    });
  } else {                                                                                 // milk churns
    for (let i = 0; i < 6; i++) C.put(lathe([[0.001, 0], [0.11, 0], [0.12, 0.05], [0.12, 0.26], [0.07, 0.34], [0.07, 0.4], [0.08, 0.42], [0.001, 0.42]], 14), paint(0xd8d6d2), (i % 2 ? 0.2 : -0.2), 0.46, -0.44 + Math.floor(i / 2) * 0.44);
  }
  return { g: K.g, cargo };
}

// ── the farm's halt: a timber loading platform beside the track's end, a buffer stop,
// crates and churns waiting, a lamp and the name board. Local +z along the track, toward the end ──
function haltModel() {
  const K = kit(), wood = paint(0x9a744e), stone = paint(0xb7ab98), dark = paint(0x2f2a33);
  K.box(1.4, 0.42, 4.6, stone, 1.45, 0.21, -2.0, 0.05);                                   // the platform
  K.box(1.5, 0.06, 4.7, wood, 1.45, 0.45, -2.0, 0.02);
  // the buffer stop at the line's end
  K.box(1.0, 0.5, 0.18, wood, 0, 0.45, 0.45, 0.03);
  for (const s of [-1, 1]) { K.put(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10), dark, s * 0.32, 0.5, 0.32, [Math.PI / 2, 0, 0]); K.box(0.08, 0.6, 0.6, dark, s * 0.4, 0.3, 0.7, 0.02, [0.55, 0, 0]); }
  // goods waiting: crates and churns, a sack barrow
  for (const [x, z] of [[1.7, -0.8], [1.25, -1.1], [1.75, -1.4]]) K.box(0.38, 0.3, 0.38, paint(0xc29a68), x, 0.63, z, 0.03);
  for (const z of [-2.6, -2.9, -3.2]) K.put(lathe([[0.001, 0], [0.11, 0], [0.12, 0.05], [0.12, 0.26], [0.07, 0.34], [0.07, 0.4], [0.08, 0.42], [0.001, 0.42]], 14), paint(0xd8d6d2), 1.85, 0.48, z);
  // the name board on two posts, and a lamp
  for (const z of [-3.6, -2.3]) K.box(0.06, 1.0, 0.06, dark, 2.1, 0.98, z, 0.015);
  K.box(0.06, 0.34, 1.5, paint(PAL.ink), 2.1, 1.38, -2.95, 0.02);
  K.flat(1.4, 0.26, signMat('Hilltop Farm', { w: 512, h: 96 }), 2.06, 1.38, -2.95, [0, -Math.PI / 2, 0]);
  K.box(0.05, 1.6, 0.05, dark, 1.0, 1.25, -4.1, 0.015);
  K.put(new THREE.SphereGeometry(0.11, 10, 8), paint(0xfff1c8, { emissive: 0xffd68a, hatch: 0 }), 1.0, 2.1, -4.1);
  K.foot(1.45, -2.0, 0.9); K.foot(1.45, -0.5, 0.75); K.foot(1.45, -3.5, 0.75); K.foot(0, 0.45, 0.5);
  return K.g;
}

// ── the run: the train's path is the loop from beside Central Station to the junction, then the branch ──
export function createFreight(scene, { branch, loopTop, add, solid }) {
  const L = RAIL.pts, n = L.length, ji = branch.junction, step = branch.out;
  // walk back from the junction (against the way the branch leaves) to the station's straight,
  // and start a little clear of the platform's end
  const back = []; let i = ji;
  for (let k = 0; k < n && !RAIL.stationIdx.has(i); k++) { back.push(i); i = (i - step + n) % n; }
  const loopIdx = back.reverse().slice(Math.min(6, Math.max(0, back.length - 2)));        // (6 samples ≈ 3 units clear of the platform)
  const pts = [...loopIdx.map(k => L[k]), ...branch.pts.slice(1)];
  const top = [...loopIdx.map(k => loopTop[k]), ...branch.topR.slice(1)];
  const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + arc(pts[k - 1], pts[k]));
  const total = cum[cum.length - 1];
  // a point on the rails at distance s along the path
  const at = (s, out) => {
    s = Math.max(0, Math.min(total, s));
    let lo = 0, hi = cum.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
    const f = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    out.copy(pts[lo]).lerp(pts[hi], f).normalize().multiplyScalar(top[lo] + (top[hi] - top[lo]) * f);
    return out;
  };

  // the halt at the far end, facing on along the line
  const endD = pts[pts.length - 1], ahead = endD.clone().multiplyScalar(R).add(endD.clone().sub(pts[pts.length - 3]).projectOnPlane(endD).normalize()).normalize();
  const halt = add(placeOnPlanet(haltModel(), endD, yawToFace(endD, ahead), { weight: 'mid', sink: 0.02 }));
  halt.updateWorldMatrix(true, false);
  for (const [x, z, r] of halt.userData.foots || []) solid(halt.localToWorld(new THREE.Vector3(x, 0, z)).normalize(), r);

  // the train: engine first (toward the farm), then the wagons
  const cars = [{ g: engine(), len: 1.9 }, { ...wagon('hay'), len: 1.42 }, { ...wagon('veg'), len: 1.42 }, { ...wagon('milk'), len: 1.42 }];
  let off = 0;
  for (const c of cars) { c.off = off + c.len / 2; off += c.len + 0.12; ink(c.g, 'fine'); scene.add(c.g); }
  const LEN = off;
  const S0 = LEN + 0.3, S1 = total - 1.2;                 // its stops: by the station (all of it on the loop), at the buffer
  const st = { s: S0, v: 0, phase: 'town', wait: 4, loaded: false };
  const VMAX = 3.0, ACC = 0.9;
  const setCargo = (on) => { st.loaded = on; for (const c of cars) if (c.cargo) c.cargo.visible = on; };
  setCargo(false);
  const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
  const pose = () => {
    for (const c of cars) {
      const s = st.s - c.off;
      at(s, _p); at(s + 0.35, _q); at(s - 0.35, _f);
      _f.subVectors(_q, _f).normalize();                     // forward (toward the farm)
      _u.copy(_p).normalize(); _r.crossVectors(_u, _f).normalize(); _f.crossVectors(_r, _u).normalize();
      _m.makeBasis(_r, _u, _f); c.g.quaternion.setFromRotationMatrix(_m);       // (x = up × forward: a right-handed frame)
      c.g.position.copy(_p);
    }
  };
  pose();
  return {
    cars, halt, length: total, get state() { return { ...st }; },
    update(dt) {
      dt = Math.min(dt, 0.1);
      if (st.phase === 'town' || st.phase === 'farm') {
        st.wait -= dt;
        if (st.phase === 'farm' && !st.loaded && st.wait < 3) setCargo(true);       // loaded at the farm…
        if (st.phase === 'town' && st.loaded && st.wait < 3) setCargo(false);       // …unloaded in town
        if (st.wait <= 0) st.phase = st.phase === 'town' ? 'out' : 'home';
        return;
      }
      const goal = st.phase === 'out' ? S1 : S0, dir = Math.sign(goal - st.s), left = Math.abs(goal - st.s);
      const vStop = Math.sqrt(2 * ACC * left);               // brake to stop right at the goal
      st.v = Math.min(VMAX, st.v + ACC * dt, vStop);
      st.s += dir * Math.max(0.05, st.v) * dt;
      if ((dir > 0 && st.s >= goal) || (dir < 0 && st.s <= goal) || left < 0.02) {
        st.s = goal; st.v = 0; st.phase = st.phase === 'out' ? 'farm' : 'town'; st.wait = 7;
      }
      pose();
    },
  };
}
