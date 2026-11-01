// ─── UNDER THE POOL'S SURFACE: the real body, seen through the water ──────────
// The country club's pool is not a hole in the ground (the terrain is too coarse to dig one):
// its basin is traced in the water's fragment shader (north.js POOL_FS), so anything below the
// surface is really under the terrain and hidden. A swimmer's legs and arms used to be faked
// there as capsules (a tube for the trunk, one long tube for both legs). Now the swimmer's own
// meshes are drawn again, through the water:
//   1. the water is drawn after every other solid thing (renderOrder POOL) and writes the far
//      depth, so across the pool's surface nothing is "in front" of a body under it any more;
//   2. each swimmer has a twin of every mesh (same geometry, same skeleton: the stroke, the kick,
//      the knees all show), drawn next (SUB), clipped to below the surface and tinted like the
//      water — bluer the deeper it goes;
//   3. the surface's own depth is written back (REST), so the rim, splashes and anything see-through
//      drawn later sit in front of / behind the water as before.
import * as THREE from 'three';

const POOL = 10, FAR = 11, SUB = 12, REST = 13;

// set up the water mesh for it (once): its draw order, the far depth, the depth written back.
// (A shader that writes gl_FragDepth is depth-TESTED with what it writes, so the water can't push
// the depth back itself: it marks its pixels in the stencil, and a second pass over the same
// surface sets the far depth on just those)
export function poolDepth(water) {
  const m = water.material;
  water.renderOrder = POOL;
  Object.assign(m, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
  const pass = (frag, o) => {
    const p = new THREE.Mesh(water.geometry, new THREE.ShaderMaterial({
      vertexShader: m.vertexShader, fragmentShader: frag, uniforms: { uTime: m.uniforms.uTime }, colorWrite: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, ...o,
    }));
    p.userData.noInk = true; p.userData.poolPass = true; p.frustumCulled = water.frustumCulled; p.raycast = () => {};
    water.add(p);
    return p;
  };
  // 2. the far depth where the water was drawn
  pass('void main() { gl_FragColor = vec4(0.0); gl_FragDepth = 1.0; }', { depthFunc: THREE.AlwaysDepth, stencilZPass: THREE.KeepStencilOp }).renderOrder = FAR;
  // 4. (after the bodies) the surface's depth back, and the stencil cleared
  pass('void main() { gl_FragColor = vec4(0.0); }', { stencilZPass: THREE.ZeroStencilOp, stencilFail: THREE.KeepStencilOp }).renderOrder = REST;
}

// the twin of a person `root` under the surface of `water`. Returns { group of twins, set(on) }.
export function submerge(root, water) {
  const U = water.material.uniforms;
  const toPool = { value: new THREE.Matrix4() };
  const mats = new Map(), twins = [];
  const matFor = (src) => {
    if (mats.has(src)) return mats.get(src);
    const mat = new THREE.MeshBasicMaterial({ color: src.color ? src.color.clone() : 0xffffff, map: src.map || null, side: src.side ?? THREE.FrontSide, vertexColors: !!src.vertexColors });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uToPool: toPool, uLight: U.uLight, cDeep: U.cDeep, cTint: U.cTint });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uToPool; varying float vPoolY;')
        .replace('#include <project_vertex>', '#include <project_vertex>\n  vPoolY = (uToPool * modelMatrix * vec4(transformed, 1.0)).y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLight; uniform vec3 cDeep, cTint; varying float vPoolY;')
        .replace('void main() {', 'void main() {\n  if (vPoolY > -0.008) discard;')        // (above the surface: the body itself shows)
        .replace('#include <opaque_fragment>', /* glsl */`#include <opaque_fragment>
  { float d = -vPoolY;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, cDeep, clamp(d / 0.9, 0.0, 0.5));   // deeper, bluer (as the pool's floor)
    gl_FragColor.rgb = mix(gl_FragColor.rgb, cTint, 0.24) * uLight; }`);
    };
    mat.customProgramCacheKey = () => 'submerged';
    mats.set(src, mat);
    return mat;
  };
  const meshes = [];
  root.traverse((m) => { if (m.isMesh && !m.userData.isInk && !m.userData.submerged && !Array.isArray(m.material) && !m.material.transparent) meshes.push(m); });
  for (const m of meshes) {
    const mat = matFor(m.material);
    let t;
    if (m.isSkinnedMesh) {
      t = new THREE.SkinnedMesh(m.geometry, mat); t.bindMode = m.bindMode; t.bind(m.skeleton, m.bindMatrix);
      // its bounds, handed over: computing them reads every vertex, and gpuOnly (cull.js) lets the
      // arrays go once they're uploaded
      const g = m.geometry, has = g.attributes.position?.array?.length > 0;
      if (!m.boundingSphere && has) m.computeBoundingSphere();
      if (!m.boundingBox && has) m.computeBoundingBox();
      if (!g.boundingSphere && has) g.computeBoundingSphere();
      t.boundingSphere = (m.boundingSphere || g.boundingSphere || new THREE.Sphere(new THREE.Vector3(), 1.5)).clone();
      t.boundingBox = (m.boundingBox || g.boundingBox || new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(3, 3, 3))).clone();
    }
    else t = new THREE.Mesh(m.geometry, mat);
    t.renderOrder = SUB; t.frustumCulled = false; t.userData.submerged = true; t.userData.noInk = true;
    t.raycast = () => {};                                  // (never ground to stand on, never a thing to click)
    m.add(t); twins.push(t);
  }
  let on = true;
  return {
    twins,
    // each frame, while shown: the pool's frame (the surface is its y = 0)
    update() { if (on) toPool.value.copy(water.matrixWorld).invert(); },
    set(v) { on = !!v; for (const t of twins) t.visible = on; if (on) toPool.value.copy(water.matrixWorld).invert(); },
  };
}
