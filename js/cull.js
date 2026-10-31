// ─── DRAW CULLING: skip what the planet itself hides ────────────────────────
// The camera's frustum doesn't know the planet is in the way: looking along the
// street it still takes in everyone round the far side of the world. People are
// worst — their skinned bodies are never frustum-culled (a pose can reach past the
// rest-pose bounds), so every townsperson, walker, shopper and parked car on the
// planet was drawn from anywhere (~120 draws and ~190k triangles at the station).
// Each frame, every moving thing (a top-level object that is skinned or marked
// noGround — people, cars, the boat) whose bounding sphere lies wholly behind the
// planet, as seen from the camera, is dropped from the camera's layer. Layers, not
// .visible, so nothing the game itself shows/hides is disturbed; and these things are
// never ground for the walk rays, so a raycast skipping them changes nothing.
import * as THREE from 'three';

const P = 39.2;                       // a ball safely inside the lowest ground and the sea
const HIDE = 31;                      // the layer a hidden thing is parked on
const _c = new THREE.Vector3(), _box = new THREE.Box3(), _s = new THREE.Sphere();

export function createCuller(scene, camera) {
  const roots = new Map();            // root → { r, meshes, hidden }
  let n = -1;
  function collect() {
    for (const o of scene.children) {
      if (roots.has(o)) continue;
      let skinned = false; o.traverse(q => { if (q.isSkinnedMesh) skinned = true; });
      if (!skinned && !o.userData.noGround) continue;
      // (a skinned body's own bounds are unreliable — some come out tens of units wide — so
      // a person counts as 2 round their feet; anything rigid they hold or ride is measured)
      _box.makeEmpty(); o.updateMatrixWorld(true);
      o.traverse(q => { if (q.isMesh && !q.isSkinnedMesh && !q.userData.isInk) _box.expandByObject(q); });
      let r = skinned ? 2.0 : 0;
      if (!_box.isEmpty()) { _box.getBoundingSphere(_s); r = Math.max(r, _s.radius + _s.center.distanceTo(o.position)); }
      if (!r) continue;
      r += 0.3;                                                          // round its origin (it moves)
      if (r > 8) continue;                                             // something big: leave it be
      roots.set(o, { r, hidden: false });
    }
    for (const o of roots.keys()) if (o.parent !== scene) roots.delete(o);
    n = scene.children.length;
  }
  const setHidden = (o, e, h) => {
    e.hidden = h;
    o.traverse(q => { if (q.isMesh || q.isSprite || q.isLine || q.isPoints) { if (h) q.layers.set(HIDE); else q.layers.set(0); } });
  };
  return {
    update() {
      if (scene.children.length !== n) collect();
      const e = camera.position, el = e.length();
      if (el <= P + 0.01) return;
      const alpha = Math.asin(P / el), tang = Math.sqrt(el * el - P * P);
      for (const [o, st] of roots) {
        _c.copy(o.position).sub(e);
        const d = _c.length();
        let hide = false;
        if (d > tang + st.r) {
          const theta = Math.acos(THREE.MathUtils.clamp(-_c.dot(e) / (d * el), -1, 1));
          hide = theta + Math.asin(Math.min(1, st.r / d)) < alpha;
        }
        if (hide !== st.hidden) setHidden(o, st, hide);
      }
    },
    get hiddenCount() { let k = 0; for (const s of roots.values()) if (s.hidden) k++; return k; },
    roots,
  };
}
