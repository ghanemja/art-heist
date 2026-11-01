// ─── THE SHOPS' CAR PARKS: a parked car in each, and paved for your own ──────
// YarnFlow, Borrowed Eyes and QR Compass each have a little car park beside them
// (buildings.js shopLot, placed in the shop's own frame by town.js). Here: one car
// parked nose-in in a bay of each — a level frame with the car seated on its four
// tyres, solid — and the lot and its apron count as paved (LOTS), so the road assist
// lets your own car turn off the spur and park.
import * as THREE from 'three';
import { standAt, alignToSurface, yawToFace, LOTS, SHEET } from './world.js';
import { buildCar, fitToGround } from './player.js';
import { SHOP_LOT } from './buildings.js';

// the lots' painted bays, wheel stops and arrow onto the asphalt as DRAWN: the road sheet drapes
// over the highest ground near each point (+ its lift), not the terrain the markings were laid
// on, so they hovered (a few cm, and a whole unit where a lot's corner hangs over a bank). Run
// once the sheet is laid, before anything bakes or reads the ground (main.js). The sheet's
// height under each (x, z) of the lot is read along the lot's own up on a 0.15 grid; every
// vertex (fill and ink hull alike) moves up or down to sit that far over it, as it sat over the
// terrain it was conformed to (userData.lift).
export function layLotsOnSheet(town) {
  const L = SHOP_LOT, rc = new THREE.Raycaster(), v = new THREE.Vector3(), o = new THREE.Vector3(), dn = new THREE.Vector3();
  for (const lm of town.landmarks) {
    const g = lm.lot?.root, lift = g?.userData.lift;
    if (!lift) continue;
    g.updateMatrixWorld(true);
    const M = g.matrixWorld, inv = M.clone().invert(), c = g.position;
    const sheet = SHEET.meshes.filter(m => { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); return m.geometry.boundingSphere.center.distanceTo(c) < m.geometry.boundingSphere.radius + 12; });
    dn.set(0, -1, 0).transformDirection(M);
    const meshes = []; g.traverse(m => { if (m.isMesh) meshes.push(m); });
    const box = new THREE.Box3(), mm = new THREE.Matrix4();
    for (const m of meshes) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(mm.multiplyMatrices(inv, m.matrixWorld))); }
    const S = 0.15, x0 = box.min.x - S, z0 = box.min.z - S, nx = Math.ceil((box.max.x - x0) / S) + 2, nz = Math.ceil((box.max.z - z0) / S) + 2;
    const grid = new Float32Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = x0 + i * S, z = z0 + k * S, was = lift(x, z) + L.top;   // (where it is now: kept on a miss)
      rc.set(o.set(x, was + 1.5, z).applyMatrix4(M), dn); rc.far = 4;
      const h = rc.intersectObjects(sheet, false)[0];
      grid[i * nz + k] = h ? v.copy(h.point).applyMatrix4(inv).y + 0.035 - was : 0;
    }
    const at = (x, z) => {
      const fx = Math.min(nx - 1.001, Math.max(0, (x - x0) / S)), fz = Math.min(nz - 1.001, Math.max(0, (z - z0) / S));
      const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, w = fz - k;
      return (grid[i * nz + k] * (1 - u) + grid[(i + 1) * nz + k] * u) * (1 - w) + (grid[i * nz + k + 1] * (1 - u) + grid[(i + 1) * nz + k + 1] * u) * w;
    };
    const done = new Set();
    for (const m of meshes) {
      if (done.has(m.geometry)) continue; done.add(m.geometry);
      const P = m.geometry.attributes.position, toG = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), back = toG.clone().invert();
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(toG);
        v.y += at(v.x, v.z);
        v.applyMatrix4(back); P.setXYZ(i, v.x, v.y, v.z);
      }
      P.needsUpdate = true; m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox();
    }
  }
}

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
        return (x > L.x0 - 0.1 && x < L.x1 && p.z > L.z0 && p.z < L.z1) || (x > -1.0 && x <= L.x0 && p.z > L.apron[0] - 0.8 && p.z < L.apron[1] + 0.3); }); }   // (over the spur's end too: turning in isn't held at the kerb)
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
