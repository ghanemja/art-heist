// ─── THE SHOPS' CAR PARKS: a parked car in each, and paved for your own ──────
// YarnFlow, Borrowed Eyes and QR Compass each have a little car park beside them
// (buildings.js shopLot, placed in the shop's own frame by town.js). Here: one car
// parked nose-in in a bay of each — a level frame with the car seated on its four
// tyres, solid — and the lot and its apron count as paved (LOTS), so the road assist
// lets your own car turn off the spur and park.
import * as THREE from 'three';
import { standAt, alignToSurface, yawToFace, LOTS } from './world.js';
import { buildCar, fitToGround } from './player.js';
import { SHOP_LOT } from './buildings.js';

const PARKED = { yarn: [0, 0xdc9e9a], eyes: [1, 0x6f9a7c], qr: [0, 0xe1b95c] };     // bay, body colour

export function createCarParks({ scene, town }) {
  const L = SHOP_LOT;
  for (const lm of town.landmarks) {
    if (!lm.lot) continue;
    const root = lm.lot.root, s = lm.lot.side;
    root.updateWorldMatrix(true, false);
    const at = (x, z) => root.localToWorld(new THREE.Vector3(x, 0, z)).normalize();
    { const inv = root.matrixWorld.clone().invert(), p = new THREE.Vector3(), r = root.position.length();
      LOTS.push((d) => { p.copy(d).multiplyScalar(r).applyMatrix4(inv); const x = s * p.x;
        return (x > L.x0 - 0.1 && x < L.x1 && p.z > L.z0 && p.z < L.z1) || (x > -1.0 && x <= L.x0 && p.z > L.apron[0] - 0.2 && p.z < L.apron[1] + 0.3); }); }   // (over the spur's end too: turning in isn't held at the kerb)
    const spec = PARKED[lm.style];
    if (!spec) continue;
    // nose in: the car's +z toward the lot's outer kerb, its bumper short of the wheel stop
    const z = L.bays[spec[0]], cx = s * (L.x1 - 0.2 - 0.35 - 0.08 - 1.45), d = at(cx, z);
    const frame = new THREE.Group(), body = buildCar({ body: spec[1] });
    frame.add(body); frame.userData.noGround = true;
    frame.position.copy(d).multiplyScalar(standAt(d));
    alignToSurface(frame, d, yawToFace(d, at(cx + s * 3, z)));
    scene.add(frame);
    fitToGround(body, frame);
    frame.updateWorldMatrix(true, false);
    for (const dz of [-0.6, 0.6]) town.colliders.push({ dir: frame.localToWorld(new THREE.Vector3(0, 0, dz)).normalize(), r: 0.75 });
  }
}
