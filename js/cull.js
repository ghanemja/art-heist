// ─── DRAW CULLING: skip what can't be seen ──────────────────────────────────
// The camera's frustum doesn't know the planet is in the way: looking along the
// street it still takes in everything round the far side of the world — every
// building, tree, lamp and person behind the horizon was drawn (and people are
// worst: their skinned bodies are never frustum-culled, and each is ~60–80 draws).
// Each frame, every top-level thing in the scene is checked against a ball just
// inside the ground: one whose bounding sphere lies wholly behind the planet, as seen
// from the camera, isn't drawn; nor is one smaller than a pixel or so on screen.
// People get a lighter version while they're small on screen: their little rigid
// parts (eyes, brows, buttons, studs — each its own draw, with its own ink hull) are
// skipped once a person stands less than ~45 px tall, where none of it can be seen.
// Layers, not .visible, so nothing the game itself shows/hides is disturbed; hidden
// things keep their place in the scene (raycasts against the town's statics never
// test layers, so the walk rays still find the ground).
import * as THREE from 'three';

const P = 39.2;                       // a ball safely inside the lowest ground and the sea
const HIDE = 31;                      // the layer a hidden thing is parked on
const MIN_PX = 1.1;                   // smaller than this radius on screen (px): not drawn
const LOD_PX = 45;                    // a person under this height on screen: no small parts
const DETAIL_TRIS = 400;              // a person's rigid part this small is a "small part"
const _c = new THREE.Vector3(), _box = new THREE.Box3(), _s = new THREE.Sphere();

export function createCuller(scene, camera) {
  const roots = new Map();            // root → { r, off (local), person, detail, hidden, lod }
  let n = -1;
  function collect() {
    for (const o of scene.children) {
      if (roots.has(o)) continue;
      let meshes = 0, skinned = false;
      o.traverse(q => { if (q.isMesh || q.isSprite) meshes++; if (q.isSkinnedMesh) skinned = true; });
      if (!meshes) continue;
      o.updateMatrixWorld(true);
      const person = skinned && !!(o.userData.human || o.userData.noGround);
      let r, off;
      if (skinned) {
        // (a skinned body's own bounds are unreliable — some come out tens of units wide — so
        // a person is a ball round their middle; anything rigid they hold or ride is measured)
        _box.makeEmpty();
        o.traverse(q => { if (q.isMesh && !q.isSkinnedMesh && !q.userData.isInk) _box.expandByObject(q); });
        r = 1.2; off = new THREE.Vector3(0, 0.6, 0);
        if (!_box.isEmpty()) { _box.getBoundingSphere(_s); r = Math.max(r, _s.radius + _s.center.distanceTo(o.position)); off.set(0, 0, 0); }
      } else {
        _box.setFromObject(o);
        if (_box.isEmpty()) continue;
        _box.getBoundingSphere(_s);
        r = _s.radius;
        // the sphere's centre in the root's own frame, so a thing that moves (a car, the rocket) carries it
        off = o.worldToLocal(_s.center.clone());
        const sc = o.getWorldScale(new THREE.Vector3());
        off.multiply(sc);
      }
      if (!(r > 0) || r > 30) continue;                                // the planet, the sea, the sky: always drawn
      r += 0.3;
      // a person's small parts, for the lighter version
      const detail = [];
      if (person) o.traverse(q => {
        if (!q.isMesh || q.isSkinnedMesh || q.userData.isInk) return;
        const g = q.geometry, tris = (g.index ? g.index.count : g.attributes.position?.count || 0) / 3;
        if (tris < DETAIL_TRIS) { detail.push(q); for (const k of q.children) if (k.userData.isInk) detail.push(k); }
      });
      roots.set(o, { r, off, person, detail: new Set(detail), hidden: false, lod: false });
    }
    for (const o of roots.keys()) if (o.parent !== scene) roots.delete(o);
    n = scene.children.length;
  }
  const apply = (o, st) => {
    o.traverse(q => {
      if (!(q.isMesh || q.isSprite || q.isLine || q.isPoints)) return;
      q.layers.set(st.hidden || (st.lod && st.detail.has(q)) ? HIDE : 0);
    });
  };
  return {
    update() {
      if (scene.children.length !== n) collect();
      const e = camera.position, el = e.length();
      const f = (innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const behindOK = el > P + 0.01;
      const alpha = behindOK ? Math.asin(P / el) : 0, tang = behindOK ? Math.sqrt(el * el - P * P) : 0;
      for (const [o, st] of roots) {
        _c.copy(st.off).applyQuaternion(o.quaternion).add(o.position).sub(e);          // (top-level: its own transform is its world one)
        const d = Math.max(1e-3, _c.length());
        let hide = st.r / d * f < MIN_PX;                                // too small to see
        if (!hide && behindOK && d > tang + st.r) {                       // behind the planet
          const theta = Math.acos(THREE.MathUtils.clamp(-_c.dot(e) / (d * el), -1, 1));
          hide = theta + Math.asin(Math.min(1, st.r / d)) < alpha;
        }
        const lod = st.person && 1.2 / d * f < LOD_PX;
        if (hide !== st.hidden || lod !== st.lod) { st.hidden = hide; st.lod = lod; apply(o, st); }
      }
    },
    get hiddenCount() { let k = 0; for (const s of roots.values()) if (s.hidden) k++; return k; },
    roots,
  };
}
