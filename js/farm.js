// ─── THE FARM and THE ISLAND: country life on the planet's empty side ────────
// Hilltop Farm: a red gambrel-roofed barn with a hayloft, a silo, a fenced paddock with cows and
// sheep that graze and amble about, crop rows, round hay bales, a trough and a few trees.
// Gull Island: a little island out in the sea with a striped lighthouse, rocks and pines.
// Built like every other site: placed on the planet with placeOnPlanet (baked, laid on the
// ground, inked); the animals are their own small inked groups, moved each frame.
import * as THREE from 'three';
import { R, frame, yawToFace, alignToSurface, standAt, slerpDir, arc } from './world.js';
import { PAL, paint, ink } from './style.js';
import { kit, lathe, placeOnPlanet } from './buildings.js';
import { tree, pine, bush, rbox } from './props.js';

const RED = 0xb4513c, TRIM = 0xf4ecda, ROOF = 0x5d4a52, WOOD = 0x9a6a46, HAY = 0xe2c06a, EARTH = 0x9c7650;

// ── the farm, in its own frame: +z toward town (its gate), x across ──
export const FARM = { r: 8.0, PADDOCK: { x: 2.9, z: 0.9, r: 3.1 } };

function barn(K) {
  const W = 3.6, D = 4.4, H = 2.0, wall = paint(RED), trim = paint(TRIM), roof = paint(ROOF);
  K.box(W, H, D, wall, 0, H / 2, 0, 0.05);
  // gambrel roof: two pitches a side, as four long slabs over a gable of the wall colour
  const R1 = 0.55, R2 = 0.95;                                     // lower (steep) and upper (shallow) rises
  const prof = [[-W / 2 - 0.12, 0], [-W / 2 + 0.35, R1], [0, R1 + R2 * 0.55], [W / 2 - 0.35, R1], [W / 2 + 0.12, 0]];
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = prof[i], [x1, y1] = prof[i + 1], len = Math.hypot(x1 - x0, y1 - y0);
    K.box(len + 0.06, 0.09, D + 0.3, roof, (x0 + x1) / 2, H + (y0 + y1) / 2, 0, 0.03, [0, 0, Math.atan2(y1 - y0, x1 - x0)]);
  }
  // the gable ends: a pentagon of wall colour front and back, with white trim along the eaves
  const gable = new THREE.Shape(); gable.moveTo(prof[0][0] + 0.12, 0); prof.slice(1, 4).forEach(([x, y]) => gable.lineTo(x, y)); gable.lineTo(prof[4][0] - 0.12, 0); gable.closePath();
  for (const s of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(gable, { depth: 0.08, bevelEnabled: false }); g.translate(0, 0, -0.04);
    K.put(g, wall, 0, H, s * D / 2);
  }
  // big double doors in the front with the white X braces; a hayloft door above
  const fz = D / 2 + 0.03;
  K.box(1.7, 1.55, 0.06, paint(0x8e3e2e), 0, 0.78, fz, 0.02);
  for (const sx of [-0.43, 0.43]) {
    K.box(0.84, 0.07, 0.04, trim, sx, 0.08, fz + 0.04, 0.01); K.box(0.84, 0.07, 0.04, trim, sx, 1.5, fz + 0.04, 0.01);
    K.box(0.07, 1.48, 0.04, trim, sx - 0.39, 0.79, fz + 0.04, 0.01); K.box(0.07, 1.48, 0.04, trim, sx + 0.39, 0.79, fz + 0.04, 0.01);
    for (const a of [1, -1]) K.box(0.06, 1.6, 0.035, trim, sx, 0.79, fz + 0.05, 0.01, [0, 0, a * Math.atan2(0.78, 1.42)]);
  }
  K.box(0.75, 0.62, 0.06, paint(0x8e3e2e), 0, H + 0.42, fz + 0.01, 0.02);
  K.box(0.85, 0.07, 0.04, trim, 0, H + 0.76, fz + 0.04, 0.01); K.box(0.85, 0.07, 0.04, trim, 0, H + 0.1, fz + 0.04, 0.01);
  for (const s of [-1, 1]) K.box(0.07, 0.7, 0.04, trim, s * 0.39, H + 0.43, fz + 0.04, 0.01);
  // corner boards and a white band along the eaves
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(0.1, H, 0.1, trim, sx * (W / 2 + 0.01), H / 2, sz * (D / 2 + 0.01), 0.02);
  for (const sx of [-1, 1]) K.box(0.08, 0.1, D + 0.06, trim, sx * (W / 2 + 0.02), H - 0.05, 0, 0.02);
  // two small side windows a side
  for (const sx of [-1, 1]) for (const z of [-1.1, 1.0]) K.box(0.05, 0.42, 0.5, paint(0x46404e), sx * (W / 2 + 0.02), 1.2, z, 0.01);
  // a weathervane on the ridge
  K.put(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), paint(PAL.ink), 0, H + R1 + R2 * 0.55 + 0.25, 0);
  K.box(0.36, 0.12, 0.02, paint(PAL.ink), 0.05, H + R1 + R2 * 0.55 + 0.48, 0, 0.01);
  K.foot(0, 0, 2.3); K.foot(0, 1.4, 1.9); K.foot(0, -1.4, 1.9);
}

function silo(K, x, z) {
  const s = K.sub(x, 0, z);
  s.put(lathe([[0.001, 0], [0.78, 0], [0.78, 3.9], [0.74, 4.0], [0.001, 4.0]], 28), paint(0xd8d2c4), 0, 0, 0);
  for (const y of [0.9, 1.9, 2.9]) s.put(new THREE.TorusGeometry(0.785, 0.035, 6, 28), paint(0x9c958a), 0, y, 0, [Math.PI / 2, 0, 0]);
  s.put(new THREE.SphereGeometry(0.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint(0x8e9aa4), 0, 3.98, 0);
  s.put(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8), paint(0x8e9aa4), 0, 4.85, 0);
  // a ladder up its side, toward the barn
  for (const sx of [-0.12, 0.12]) s.box(0.03, 3.7, 0.03, paint(0x6f6a64), sx, 2.0, 0.81, 0.01);
  for (let y = 0.3; y < 3.8; y += 0.3) s.box(0.24, 0.025, 0.025, paint(0x6f6a64), 0, y, 0.81, 0.008);
  K.foot(x, z, 0.85);
}

function fenceRing(K, cx, cz, r, gapAt = Math.PI / 2, gap = 0.55) {
  const wood = paint(0xc9a77e), n = Math.round(2 * Math.PI * r / 1.0);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, a2 = (i + 1) / n * Math.PI * 2;
    const inGap = (t) => Math.abs(Math.atan2(Math.sin(t - gapAt), Math.cos(t - gapAt))) < gap / 2;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!inGap(a)) K.box(0.08, 0.62, 0.08, wood, x, 0.31, z, 0.02);
    if (inGap(a) || inGap(a2) || inGap((a + a2) / 2)) continue;
    const x2 = cx + Math.cos(a2) * r, z2 = cz + Math.sin(a2) * r, len = Math.hypot(x2 - x, z2 - z), ry = -Math.atan2(z2 - z, x2 - x);
    for (const y of [0.28, 0.52]) K.box(len + 0.04, 0.06, 0.04, wood, (x + x2) / 2, y, (z + z2) / 2, 0.015, [0, ry, 0]);
  }
}

function crops(K, x0, z0, w, d) {
  const soil = paint(EARTH), leaf = paint(0x7fa25a), leaf2 = paint(0x98b86a);
  K.box(w + 0.3, 0.06, d + 0.3, paint(0x8a6a48), x0, 0.03, z0, 0.03).userData.noInk = true;
  for (let i = 0, x = x0 - w / 2 + 0.3; x <= x0 + w / 2 - 0.3; x += 0.6, i++) {
    K.box(0.34, 0.12, d, soil, x, 0.09, z0, 0.05).userData.noInk = true;
    for (let z = z0 - d / 2 + 0.25; z <= z0 + d / 2 - 0.25; z += 0.42) K.put(new THREE.SphereGeometry(0.15, 10, 7), i % 2 ? leaf : leaf2, x, 0.24, z).scale.set(1, 0.75, 1);
  }
}

function bale(K, x, z, ry) {
  const b = K.put(new THREE.CylinderGeometry(0.42, 0.42, 0.55, 18), paint(HAY), x, 0.42, z, [Math.PI / 2, ry, 0]);
  for (const s of [-1, 1]) K.put(new THREE.TorusGeometry(0.42, 0.018, 4, 18), paint(0xc9a24c), x + Math.sin(ry) * s * 0.12, 0.42, z + Math.cos(ry) * s * 0.12, [0, ry, 0]);
  return b;
}

export function farmModel() {
  const K = kit();
  barn(K.sub(-2.7, 0, -2.2));
  silo(K, -0.1, -3.9);
  fenceRing(K, FARM.PADDOCK.x, FARM.PADDOCK.z, FARM.PADDOCK.r, Math.PI * 0.9);
  // a trough and a little lean-to shelter in the paddock
  K.box(1.0, 0.3, 0.38, paint(WOOD), FARM.PADDOCK.x + 1.2, 0.15, FARM.PADDOCK.z - 1.8, 0.04);
  K.box(0.86, 0.04, 0.26, paint(0x6f9fae), FARM.PADDOCK.x + 1.2, 0.29, FARM.PADDOCK.z - 1.8, 0.01).userData.noInk = true;
  K.foot(FARM.PADDOCK.x + 1.2, FARM.PADDOCK.z - 1.8, 0.45);
  crops(K, -3.0, 3.0, 3.6, 3.0);
  for (const [x, z, ry] of [[-0.6, -1.0, 0.3], [-0.2, 0.1, 1.2], [-0.9, 0.6, 2.1], [-5.3, -0.4, 0.8]]) { bale(K, x, z, ry); K.foot(x, z, 0.45); }
  // a few trees and bushes round the edge
  for (const [x, z, s] of [[-5.6, -3.6, 1.0], [5.9, -2.6, 0.9], [-5.8, 2.8, 0.85], [6.1, 3.6, 1.05]]) { const t = tree({ s }); t.position.set(x, 0, z); K.g.add(t); }
  for (const [x, z] of [[-4.6, -5.4], [3.0, -4.9], [5.2, -0.8]]) { const b = bush(0.5); b.position.set(x, 0, z); K.g.add(b); }
  return K.g;
}

// ── the animals: simple rounded cows and woolly sheep, each its own small group ──
function cow(seed) {
  const g = new THREE.Group(), body = paint(0xf3eee4), spot = paint(0x2f2a33), pink = paint(0xe2a49a), horn = paint(0xe8dcc4);
  const r = (k) => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * k; };
  const torso = new THREE.Mesh(rbox(0.46, 0.44, 1.05, 0.18), body); torso.position.y = 0.62; g.add(torso);
  for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.13 + r(0.07), 10, 8), spot); p.scale.set(0.35, 0.9, 1.1); p.position.set((i % 2 ? 1 : -1) * 0.225, 0.62 + r(0.14) - 0.04, -0.35 + r(0.7)); g.add(p); }
  const head = new THREE.Group(); head.position.set(0, 0.78, 0.55); g.add(head);
  const skull = new THREE.Mesh(rbox(0.26, 0.26, 0.36, 0.09), body); skull.position.set(0, 0, 0.14); head.add(skull);
  const muz = new THREE.Mesh(rbox(0.24, 0.16, 0.14, 0.06), pink); muz.position.set(0, -0.06, 0.34); head.add(muz);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), body); ear.scale.set(1.6, 0.6, 0.9); ear.position.set(s * 0.17, 0.08, 0.06); head.add(ear);
    const h = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 6), horn); h.position.set(s * 0.09, 0.16, 0.06); h.rotation.z = -s * 0.5; head.add(h);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 5), spot); eye.position.set(s * 0.12, 0.04, 0.22); eye.userData.noInk = true; head.add(eye);
  }
  const legs = [];
  for (const [x, z] of [[-0.15, 0.36], [0.15, 0.36], [-0.15, -0.36], [0.15, -0.36]]) {
    const L = new THREE.Group(); L.position.set(x, 0.46, z); g.add(L);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.46, 8), body); m.position.y = -0.23; L.add(m);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.06, 8), spot); hoof.position.y = -0.44; L.add(hoof);
    legs.push(L);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.42, 5), body); tail.position.set(0, 0.62, -0.56); tail.rotation.x = 0.25; g.add(tail);
  ink(g, 'fine');
  return { g, head, legs, tail, len: 1.1, speed: 0.22, graze: -0.75 };
}
function sheep(seed) {
  const g = new THREE.Group(), wool = paint(0xf4efe3), face = paint(0x3a3238);
  const r = (k) => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647) * k; };
  const fleece = new THREE.Group(); fleece.position.y = 0.42; g.add(fleece);
  for (let i = 0; i < 9; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.17 + r(0.05), 10, 8), wool); p.position.set(-0.12 + r(0.24), -0.05 + r(0.12), -0.24 + (i / 8) * 0.48); fleece.add(p); }
  const head = new THREE.Group(); head.position.set(0, 0.5, 0.32); g.add(head);
  const sk = new THREE.Mesh(rbox(0.15, 0.17, 0.24, 0.06), face); sk.position.set(0, 0, 0.08); head.add(sk);
  const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), wool); tuft.position.set(0, 0.09, 0.02); head.add(tuft);
  for (const s of [-1, 1]) { const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), face); ear.scale.set(1.8, 0.5, 0.8); ear.position.set(s * 0.11, 0.03, 0.02); head.add(ear); }
  const legs = [];
  for (const [x, z] of [[-0.09, 0.17], [0.09, 0.17], [-0.09, -0.17], [0.09, -0.17]]) {
    const L = new THREE.Group(); L.position.set(x, 0.3, z); g.add(L);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.3, 6), face); m.position.y = -0.15; L.add(m); legs.push(L);
  }
  ink(g, 'fine');
  return { g, head, legs, tail: null, len: 0.6, speed: 0.18, graze: -0.6 };
}

// the farm: placed, with its animals (call update each frame)
export function buildFarm(dir, toward, add, solid, scene) {
  const yaw = yawToFace(dir, toward);
  const g = add(placeOnPlanet(farmModel(), dir, yaw, { weight: 'mid', sink: 0.02 }));
  g.updateWorldMatrix(true, false);
  for (const [x, z, r] of g.userData.foots || []) solid(g.localToWorld(new THREE.Vector3(x, 0, z)).normalize(), r);
  // a direction from the farm's frame (the placed group's local x, z)
  const F = (x, z) => g.localToWorld(new THREE.Vector3(x, 0, z)).normalize();
  const P = FARM.PADDOCK, centre = F(P.x, P.z);
  // the fence: solid posts all round, so she walks in through the gate
  for (let a = 0; a < Math.PI * 2; a += 0.28) if (Math.abs(Math.atan2(Math.sin(a - Math.PI * 0.9), Math.cos(a - Math.PI * 0.9))) > 0.35) solid(F(P.x + Math.cos(a) * P.r, P.z + Math.sin(a) * P.r), 0.18);
  const herd = [];
  const spots = [[0.9, 0.2], [-1.0, -0.6], [0.2, 1.3], [-0.6, 1.0], [1.2, -1.0], [-1.4, 0.5]];
  spots.forEach(([x, z], i) => {
    const a = i < 3 ? cow(11 + i * 37) : sheep(91 + i * 53);
    scene.add(a.g);
    herd.push({ ...a, x, z, h: i * 1.7, goal: null, wait: 1 + i * 0.7, t: Math.random() * 10, step: 0 });
  });
  const lim = P.r - 0.8, _d = new THREE.Vector3(), _f = new THREE.Vector3();
  const place = (A) => {
    _d.copy(F(P.x + A.x, P.z + A.z));
    A.g.position.copy(_d).multiplyScalar(standAt(_d));
    // heading: along the farm frame's (x, z) by A.h
    _f.copy(F(P.x + A.x + Math.sin(A.h), P.z + A.z + Math.cos(A.h))).sub(_d);
    alignToSurface(A.g, _d, 0);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(A.g.quaternion);
    const t = _f.projectOnPlane(_d).normalize();
    const ang = Math.atan2(fwd.clone().cross(t).dot(_d), fwd.dot(t));
    A.g.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(_d, ang));
  };
  herd.forEach(place);
  return {
    root: g, dir, herd,
    // ambling and grazing: each picks a spot in the paddock, walks to it, grazes a while
    update(dt, nearDir) {
      if (nearDir && arc(nearDir, centre) > 26) return;            // (nobody to see it)
      for (const A of herd) {
        A.t += dt;
        if (A.goal) {
          const dx = A.goal[0] - A.x, dz = A.goal[1] - A.z, dist = Math.hypot(dx, dz);
          const want = Math.atan2(dx, dz); let dh = Math.atan2(Math.sin(want - A.h), Math.cos(want - A.h));
          A.h += THREE.MathUtils.clamp(dh, -1.2 * dt, 1.2 * dt);
          if (Math.abs(dh) < 0.6) { const s = Math.min(dist, A.speed * dt); A.x += Math.sin(A.h) * s; A.z += Math.cos(A.h) * s; A.step += s / A.len * 9; }
          if (dist < 0.08) { A.goal = null; A.wait = 3 + Math.random() * 6; }
          A.head.rotation.x += (0.05 - A.head.rotation.x) * Math.min(1, dt * 3);
        } else {
          A.wait -= dt;
          // grazing: head down, a slow nibble
          A.head.rotation.x += (-A.graze - 0.1 * Math.sin(A.t * 3) - A.head.rotation.x) * Math.min(1, dt * 2.5);
          if (A.wait <= 0) {
            for (let k = 0; k < 8; k++) {
              const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * lim, gx = Math.cos(a) * rr, gz = Math.sin(a) * rr;
              if (herd.every(B => B === A || Math.hypot((B.goal ? B.goal[0] : B.x) - gx, (B.goal ? B.goal[1] : B.z) - gz) > 0.9)) { A.goal = [gx, gz]; break; }
            }
            if (!A.goal) A.wait = 2;
          }
        }
        const sw = A.goal ? Math.sin(A.step) * 0.45 : 0;
        A.legs.forEach((L, i) => { L.rotation.x += ((i === 0 || i === 3 ? sw : -sw) - L.rotation.x) * Math.min(1, dt * 10); });
        if (A.tail) A.tail.rotation.z = Math.sin(A.t * 2.2) * 0.25;
        place(A);
      }
    },
  };
}

// ── the island: a lighthouse on a rocky islet ──
function lighthouse(K) {
  const white = paint(0xf4efe4), red = paint(0xc8503c), dark = paint(0x3d3742), glass = paint(0xfbe7a0, { hatch: 0, emissive: 0x5a4a10 });
  // the base: a stone plinth, then the tapering tower in white and red bands
  K.put(lathe([[0.001, 0], [1.0, 0], [1.0, 0.35], [0.9, 0.42], [0.001, 0.42]], 28), paint(0xb7ab98), 0, 0, 0);
  const H = 4.4, r0 = 0.72, r1 = 0.46, bands = 5;
  for (let i = 0; i < bands; i++) {
    const y0 = 0.42 + H * i / bands, y1 = 0.42 + H * (i + 1) / bands, a = r0 + (r1 - r0) * i / bands, b = r0 + (r1 - r0) * (i + 1) / bands;
    K.put(lathe([[0.001, 0], [a, 0], [b, y1 - y0], [0.001, y1 - y0]], 24), i % 2 ? red : white, 0, y0, 0);
  }
  const top = 0.42 + H;
  K.put(lathe([[0.001, 0], [0.72, 0], [0.72, 0.1], [0.001, 0.1]], 24), dark, 0, top, 0);           // the gallery
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; K.box(0.03, 0.34, 0.03, dark, Math.cos(a) * 0.68, top + 0.27, Math.sin(a) * 0.68, 0.008); }
  K.put(new THREE.TorusGeometry(0.68, 0.022, 4, 28), dark, 0, top + 0.44, 0, [Math.PI / 2, 0, 0]);
  K.put(new THREE.CylinderGeometry(0.4, 0.4, 0.62, 16), glass, 0, top + 0.41, 0).userData.noInk = true;   // the lamp room
  K.put(new THREE.ConeGeometry(0.52, 0.5, 16), red, 0, top + 0.97, 0);
  K.put(new THREE.SphereGeometry(0.07, 8, 6), dark, 0, top + 1.25, 0);
  // a door and two little windows up the tower
  K.box(0.36, 0.62, 0.06, paint(0x5a4038), 0, 0.73, r0 - 0.02, 0.02);
  for (const y of [2.2, 3.6]) K.box(0.18, 0.26, 0.04, paint(0x46404e), 0, y, r0 + (r1 - r0) * ((y - 0.42) / H) - 0.005, 0.012);   // (on the tower's taper)
  K.foot(0, 0, 1.05);
}
export function islandModel() {
  const K = kit();
  lighthouse(K.sub(0, 0, 0));
  const rock = paint(PAL.rock);
  for (const [x, z, s] of [[3.2, 0.9, 0.5], [-2.9, 1.8, 0.38], [1.6, -3.1, 0.44], [-3.3, -1.2, 0.32]]) K.put(new THREE.DodecahedronGeometry(s, 1), rock, x, s * 0.45, z).scale.set(1, 0.7, 1.2);
  for (const [x, z, s] of [[-2.6, -2.7, 0.8], [3.0, 2.6, 0.7], [-1.0, 3.4, 0.6]]) { const p = pine({ s }); p.position.set(x, 0, z); K.g.add(p); }
  return K.g;
}
export function buildIsland(dir, toward, add, solid) {
  const g = add(placeOnPlanet(islandModel(), dir, yawToFace(dir, toward), { weight: 'mid', sink: 0.03 }));
  g.updateWorldMatrix(true, false);
  for (const [x, z, r] of g.userData.foots || []) solid(g.localToWorld(new THREE.Vector3(x, 0, z)).normalize(), r);
  return { root: g, dir };
}
