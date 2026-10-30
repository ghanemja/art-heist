// ─── THE TRAIN waiting at Central Station ────────────────────────────────────
// A little green tank engine and two carriages you can walk into: an open door on
// the platform side, benches down both walls, lamps, open windows. It doesn't go
// anywhere (the 7:40, not in service). Built in the station's own frame — along x on
// the track at STATION_TRACK.z, the doors facing the platform (+z) — and placed with
// the station's transform, so it sits on the station's straight.
// userData: floor (walkable decks), solids ([x, z, r] circles: walls, benches, the
// engine), roofMat (the carriage roofs lift away while you're inside), reader (a seat).
import * as THREE from 'three';
import { PAL, paint } from './style.js';
import { kit, lathe, signMat, upperGlass, DARK, HAND, STATION_TRACK } from './buildings.js';

export const TRAIN = { floor: 0.64, cars: [-3.55, 0.95], loco: 4.7, carL: 4.3, carW: 1.6, door: 0.9, height: 1.38 };

export function parkedTrain() {
  const K = kit(), tz = STATION_TRACK.z, F = TRAIN.floor;
  const green = paint(0x2f6b55), greenD = paint(0x24523f), cream = paint(0xf3ead7), red = paint(0xc8503a),
    gold = paint(PAL.gold), dk = DARK(), wood = paint(0xb07a4e), seatM = paint(0xa8423a), inner = paint(0xf6ead2),
    roofMat = paint(0x5d5a66, { unique: true }), lampM = paint(0xfff1c8, { emissive: 0xffd68a, hatch: 0, unique: true }),
    headM = paint(0xfff1c8, { emissive: 0xffd68a, hatch: 0 }), mountM = paint(PAL.gold, { unique: true });   // (lamps + their mounts lift off with the roof)
  const solids = [], floors = [];
  const wheel = (S, x, z, r) => {
    S.put(new THREE.CylinderGeometry(r, r, 0.07, 22), red, x, 0.25 + r, z, [Math.PI / 2, 0, 0]);
    S.put(new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.09, 12), dk, x, 0.25 + r, z, [Math.PI / 2, 0, 0]);
  };
  // ── the carriages ──
  const L = TRAIN.carL, W = TRAIN.carW, H = TRAIN.height, T = 0.06, DW = TRAIN.door;
  const winY0 = F + 0.62, winY1 = F + 1.12;
  for (const cx of TRAIN.cars) {
    const C = K.sub(cx, 0, tz);
    // running gear: two bogies, a dark underframe, the floor
    for (const bx of [-1.35, 1.35]) {
      C.box(1.0, 0.14, 1.0, dk, bx, 0.47, 0, 0.03);
      for (const wx of [-0.32, 0.32]) for (const wz of [-0.4, 0.4]) wheel(C, bx + wx, wz, 0.17);
    }
    C.box(L - 0.2, 0.1, W - 0.2, dk, 0, 0.56, 0, 0.03);
    C.box(L, 0.06, W, wood, 0, F - 0.03, 0, 0.02);
    // side walls: a cream lower panel, green piers between open windows, a green top band;
    // the door side (+z) has a doorway in the middle
    for (const sz of [-1, 1]) {
      const z = sz * (W / 2 - T / 2);
      const spans = sz > 0 ? [[-L / 2, -DW / 2], [DW / 2, L / 2]] : [[-L / 2, L / 2]];
      for (const [x0, x1] of spans) {
        const w = x1 - x0, xm = (x0 + x1) / 2;
        C.box(w, winY0 - F, T, cream, xm, (F + winY0) / 2, z, 0.02);
        C.box(w, F + H - winY1, T, green, xm, (winY1 + F + H) / 2, z, 0.02);
        const n = Math.max(1, Math.round(w / 0.75));
        for (let k = 0; k <= n; k++) C.box(0.12, winY1 - winY0, T, green, x0 + 0.06 + (w - 0.12) * k / n, (winY0 + winY1) / 2, z, 0.02);
        C.box(w, 0.04, T + 0.03, gold, xm, winY0, z, 0.012);                    // the waist line
      }
      // the walls stop the walker: a chain of small circles, the doorway left open
      for (let x = -L / 2 + 0.05; x <= L / 2 - 0.05; x += 0.18) if (!(sz > 0 && Math.abs(x) < DW / 2 + 0.05)) solids.push([cx + x, tz + sz * (W / 2 - 0.05), 0.1]);
    }
    // the doorway: a lintel, the door slid open along the outside, a brass handle, a step
    C.box(DW + 0.1, H - 1.18, T + 0.02, green, 0, F + (1.18 + H) / 2, W / 2 - T / 2, 0.02);
    C.box(DW - 0.04, 1.14, 0.04, greenD, DW - 0.02, F + 0.6, W / 2 + 0.03, 0.02);
    C.box(0.36, 0.42, 0.012, cream, DW - 0.02, F + 0.86, W / 2 + 0.056, 0.006);
    C.put(new THREE.SphereGeometry(0.025, 8, 6), gold, DW / 2 + 0.08, F + 0.6, W / 2 + 0.06);
    C.box(DW + 0.2, 0.05, 0.16, wood, 0, F - 0.03, W / 2 + 0.08, 0.015);
    // ends: full walls with a small window, gangway bellows and buffers
    for (const sx of [-1, 1]) {
      const x = sx * (L / 2 - T / 2);
      C.box(T, winY0 - F, W, cream, x, (F + winY0) / 2, 0, 0.02);
      for (const zz of [-1, 1]) C.box(T, H - 0.62, (W - 0.5) / 2, green, x, F + (0.62 + H) / 2, zz * (W + 0.5) / 4, 0.02);
      C.box(T, F + H - winY1, 0.5, green, x, (winY1 + F + H) / 2, 0, 0.02);
      C.box(0.16, 1.1, 0.7, dk, sx * (L / 2 + 0.07), F + 0.6, 0, 0.04);
      for (const bz of [-0.5, 0.5]) C.put(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 12), gold, sx * (L / 2 + 0.06), 0.62, bz, [0, 0, Math.PI / 2]);
      for (let z = -W / 2 + 0.05; z <= W / 2 - 0.05; z += 0.18) solids.push([cx + sx * (L / 2 - 0.05), tz + z, 0.1]);
    }
    // the roof: a low curved shell with an overhang (its own material: it lifts off)
    const rs = new THREE.Shape(); rs.moveTo(-W / 2 - 0.08, 0); rs.quadraticCurveTo(0, 0.42, W / 2 + 0.08, 0); rs.lineTo(W / 2 + 0.08, -0.05); rs.quadraticCurveTo(0, 0.35, -W / 2 - 0.08, -0.05);
    const roof = new THREE.ExtrudeGeometry(rs, { depth: L + 0.16, bevelEnabled: false, curveSegments: 16 });
    roof.translate(0, 0, -(L + 0.16) / 2); roof.rotateY(Math.PI / 2); roof.computeVertexNormals();
    C.put(roof, roofMat, 0, F + H + 0.02, 0);
    // inside: a cream lining, benches down both walls, a luggage rack, lamps
    for (const sz of [-1, 1]) {
      const spans = sz > 0 ? [[-L / 2 + 0.1, -DW / 2 - 0.12], [DW / 2 + 0.12, L / 2 - 0.1]] : [[-L / 2 + 0.1, L / 2 - 0.1]];
      for (const [x0, x1] of spans) {
        const w = x1 - x0, xm = (x0 + x1) / 2, z = sz * (W / 2 - T);
        C.box(w, winY0 - F - 0.02, 0.012, inner, xm, (F + winY0) / 2, z - sz * 0.012, 0.004);
        C.box(w, 0.1, 0.32, seatM, xm, F + 0.2, z - sz * 0.19, 0.04);                     // cushion
        C.box(w, 0.36, 0.08, seatM, xm, F + 0.42, z - sz * 0.05, 0.035);                 // back
        C.box(w, 0.16, 0.26, wood, xm, F + 0.08, z - sz * 0.16, 0.02);                   // base
        C.box(w, 0.025, 0.24, gold, xm, F + 1.2, z - sz * 0.14, 0.01);                   // rack
        for (let x = x0 + 0.1; x <= x1 - 0.1; x += 0.22) solids.push([cx + x, tz + sz * (W / 2 - 0.25), 0.16]);
      }
    }
    for (const lx of [-1.3, 0, 1.3]) {
      C.put(new THREE.CylinderGeometry(0.1, 0.12, 0.04, 16), mountM, lx, F + H - 0.02, 0);
      C.put(new THREE.SphereGeometry(0.075, 14, 10), lampM, lx, F + H - 0.09, 0).userData.noInk = true;
    }
    C.flat(0.42, 0.2, signMat('7:40 · not in service', { bg: '#f3ead7', fg: '#2a2230', w: 320, h: 152, font: '400 $px ' + HAND }), -0.8, winY1 + 0.12, -W / 2 + T + 0.008);
    floors.push([cx - L / 2, cx + L / 2, tz - W / 2, tz + W / 2]);
    floors.push([cx - DW / 2, cx + DW / 2, tz + W / 2 - 0.01, STATION_TRACK.platformEdge + 0.1]);   // across the gap to the platform
  }
  // ── the engine: a little green tank engine, chimney at the front (+x), cab at the back ──
  {
    const E = K.sub(TRAIN.loco, 0, tz);
    E.box(3.0, 0.16, 1.1, dk, 0, 0.58, 0, 0.03);
    for (const wx of [-0.9, 0, 0.9]) for (const wz of [-0.42, 0.42]) {
      wheel(E, wx, wz, 0.3);
      for (let k = 0; k < 3; k++) E.box(0.035, 0.5, 0.02, dk, wx, 0.55, wz + Math.sign(wz) * 0.045, 0.006, [0, 0, k * Math.PI / 3]);
    }
    for (const wz of [-0.5, 0.5]) E.box(1.9, 0.05, 0.03, gold, 0, 0.55, wz, 0.012);              // coupling rods
    // the boiler: a fat drum with gold bands, a dark smokebox at the front
    E.put(new THREE.CylinderGeometry(0.44, 0.44, 1.9, 28), green, 0.25, 1.1, 0, [0, 0, Math.PI / 2]);
    for (const bx of [-0.45, 0.2, 0.85]) E.put(new THREE.TorusGeometry(0.445, 0.025, 6, 28), gold, bx, 1.1, 0, [0, Math.PI / 2, 0]);
    E.put(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 28), dk, 1.32, 1.1, 0, [0, 0, Math.PI / 2]);
    E.put(lathe([[0.001, 0], [0.13, 0], [0.11, 0.35], [0.17, 0.55], [0.19, 0.62], [0.001, 0.62]], 18), dk, 1.2, 1.45, 0);   // chimney
    E.put(lathe([[0.001, 0], [0.19, 0], [0.17, 0.12], [0.1, 0.24], [0.001, 0.26]], 18), gold, 0.45, 1.5, 0);               // dome
    E.put(new THREE.SphereGeometry(0.11, 14, 10), headM, 1.52, 1.62, 0).userData.noInk = true;                               // headlamp
    E.box(0.14, 0.24, 1.2, red, 1.52, 0.66, 0, 0.03);                                                                    // buffer beam
    for (const bz of [-0.42, 0.42]) E.put(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 12), gold, 1.64, 0.66, bz, [0, 0, Math.PI / 2]);
    // side tanks, the cab with round windows, a curved roof
    for (const sz of [-1, 1]) E.box(1.2, 0.6, 0.22, green, 0.2, 0.95, sz * 0.5, 0.05);
    E.box(0.95, 1.25, 1.2, green, -1.0, 1.28, 0, 0.05);
    for (const sz of [-1, 1]) for (const sx of [-0.2, 0.2]) {
      E.put(new THREE.TorusGeometry(0.12, 0.025, 6, 18), gold, -1.0 + sx, 1.55, sz * 0.6);
      E.put(new THREE.CircleGeometry(0.11, 18), upperGlass(1), -1.0 + sx, 1.55, sz * 0.605, [0, sz > 0 ? 0 : Math.PI, 0]).userData.noInk = true;
    }
    const crs = new THREE.Shape(); crs.moveTo(-0.68, 0); crs.quadraticCurveTo(0, 0.28, 0.68, 0); crs.lineTo(0.68, -0.05); crs.quadraticCurveTo(0, 0.22, -0.68, -0.05);
    const croof = new THREE.ExtrudeGeometry(crs, { depth: 1.15, bevelEnabled: false, curveSegments: 14 });
    croof.translate(0, 0, -0.575); croof.rotateY(Math.PI / 2); croof.computeVertexNormals();
    E.put(croof, greenD, -1.0, 1.93, 0);
    for (const sz of [-1, 1]) E.flat(0.62, 0.16, signMat('CENTRAL', { bg: '#c8a24a', fg: '#2a2230', w: 256, h: 64, border: false, font: '400 $px ' + HAND }), 0.2, 0.98, sz * 0.615, [0, sz > 0 ? 0 : Math.PI, 0]);
    for (let x = -1.45; x <= 1.6; x += 0.2) for (const sz of [-1, 1]) solids.push([TRAIN.loco + x, tz + sz * 0.5, 0.14]);
  }
  K.g.userData.solids = solids;
  K.g.userData.roofMats = [roofMat, lampM, mountM];
  K.g.userData.floor = (x, z) => {
    for (const [x0, x1, z0, z1] of floors) if (x > x0 && x < x1 && z > z0 && z < z1) return F;
    return null;
  };
  // the reader's seat: the far bench of the second car, toward its front, facing the door side
  K.g.userData.reader = { x: TRAIN.cars[1] + 1.2, z: tz - W / 2 + 0.3 };
  // inside a carriage? (station-local x, z)
  K.g.userData.inside = (x, z) => TRAIN.cars.some(cx => Math.abs(x - cx) < L / 2 + 0.1 && Math.abs(z - tz) < W / 2 + 0.15);
  return K.g;
}
