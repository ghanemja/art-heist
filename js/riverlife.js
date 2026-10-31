// ─── THE RIVERBEND'S WATER AND ITS LIFE ─────────────────────────────────────
// The river and its two lakes are carved into the terrain (world.js addRiver/addLake), and
// the planet's one sea sheet used to cover them in a flat opaque blue. Here:
//   • a depth-only MASK over the water stops the sea sheet drawing there (it draws after the
//     mask), so the carved bed shows — sand at the edges, pebbles, a dark channel down the
//     middle (world.js paints it);
//   • over it, a transparent SURFACE: clear in the shallows, deepening to teal, its ripple
//     strokes, caustic shimmer and foam flecks carried downstream along the river (faster in
//     the middle), still in the lakes; a pale lip at the shore; plop rings where a frog lands;
//   • lily pads (some in flower) in the slow edges and the lakes, bobbing; fish under the
//     surface (holding against the current, circling the lakes, darting now and then); frogs
//     on pads that hop from pad to pad with a plop and croak low now and then.
// Only what's near the player moves (createRiverLife).
import * as THREE from 'three';
import { R, arc, slerpDir, surfH, isWater, alignToSurface, yawToFace, frame } from './world.js';
import { paint, ink } from './style.js';

const SURF = 0.005, LAKE_SURF = 0.003;     // the river's surface sits a hair above the lakes' (see the mask)
const rng = (seed) => { let s = seed % 2147483646 + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

const WATER_VS = /* glsl */`
  attribute vec2 aUV; attribute float aFlow, aDepth;
  varying vec2 vUV; varying float vFlow, vDepth; varying vec3 vW;
  void main() {
    vUV = aUV; vFlow = aFlow; vDepth = aDepth;
    vW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);   // (exactly as the mask projects it: no depth fight)
  }`;
const WATER_FS = /* glsl */`
  uniform float uTime, uLight, uHalf; uniform vec4 uRip[4];
  uniform vec3 cShallow, cDeep, cFoam;
  varying vec2 vUV; varying float vFlow, vDepth; varying vec3 vW;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float lat = vUV.y / uHalf;                                     // across the river, −1…1
    float sp = vFlow * 0.6 * (1.0 - 0.75 * lat * lat);             // the current: fastest mid-stream
    vec2 q = vec2(vUV.x - uTime * sp, vUV.y);
    float d = clamp(vDepth / 0.9, 0.0, 1.0);
    vec3 col = mix(cShallow, cDeep, smoothstep(0.05, 0.9, d));
    float a = mix(0.3, 0.8, smoothstep(0.0, 0.7, d));            // (enough to soften the bed's toon shadow bands)
    // ripple strokes, riding the current (drifting slowly on the lakes)
    float w = sin(q.x * 5.0 + 1.6 * sin(q.y * 3.0 + uTime * 0.8) + uTime * 0.6) * sin(q.y * 6.0 - uTime * 0.7 + 1.3 * sin(q.x * 2.5));
    float strokes = smoothstep(0.86, 0.97, w) * mix(0.45, 1.0, vFlow);
    // flecks of foam carried downstream
    vec2 g = q * vec2(1.3, 2.6), id = floor(g), f = fract(g) - 0.5;
    float fleck = vFlow * step(0.84, hash(id)) * smoothstep(0.11, 0.04, length(f - (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.6));
    // caustic shimmer over the shallows
    float c = sin(q.x * 7.0 + 2.0 * sin(q.y * 5.0 + uTime)) * sin(q.y * 8.0 - uTime * 1.2 + 2.0 * sin(q.x * 4.0));
    col = mix(col, cFoam, smoothstep(0.75, 0.95, c) * 0.3 * (1.0 - d));
    float shore = smoothstep(0.07, 0.0, vDepth);                   // a pale lip where it laps the bank
    float ring = 0.0;                                              // plop rings
    for (int i = 0; i < 4; i++) {
      float age = uTime - uRip[i].w;
      if (age > 0.0 && age < 2.4) { float dd = length(vW - uRip[i].xyz); ring += smoothstep(0.045, 0.0, abs(dd - 0.08 - age * 0.5)) * (1.0 - age / 2.4); }
    }
    float foam = clamp(strokes * 0.5 + fleck * 0.9 + shore * 0.55 + ring, 0.0, 1.0);
    col = mix(col, cFoam, foam);
    a = max(a, foam * 0.85);
    gl_FragColor = vec4(col * uLight, a);
    #include <colorspace_fragment>
  }`;

// ── the water: one mesh (the river's ribbon, then the lakes' discs) drawn twice ──
export function buildRiverWater(scene, P, lakes, half, bridgeAt) {
  const pos = [], uv = [], flow = [], depth = [], idx = [];
  const vert = (d, r, u, v, f) => { const k = pos.length / 3; pos.push(...d.clone().multiplyScalar(R + r).toArray()); uv.push(u, v); flow.push(f); depth.push(Math.max(0, -surfH(d))); return k; };
  // the river: across its whole carve, from just inside one lake to just inside the other
  const inLake = (p) => lakes.some(L => arc(p, L.c) < L.r - 0.7);
  const pts = P.filter(p => !inLake(p));
  const L = 10; let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += arc(pts[i - 1], pts[i]);
    const p = pts[i], tan = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).projectOnPlane(p).normalize();
    const lat = new THREE.Vector3().crossVectors(p, tan).normalize();
    for (let j = 0; j <= L; j++) { const o = (j / L * 2 - 1) * half; vert(p.clone().multiplyScalar(R).addScaledVector(lat, o).normalize(), SURF, s, o, 1); }
    if (i) for (let j = 0; j < L; j++) { const a = (i - 1) * (L + 1) + j, b = a + L + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  // the lakes (after the river: where they overlap, the mask keeps only the river's, higher, surface)
  for (const lk of lakes) {
    const f = frame(lk.c), NA = 48, NR = 8, c0 = vert(lk.c, LAKE_SURF, 0, 0, 0);
    for (let r = 1; r <= NR; r++) for (let k = 0; k < NA; k++) {
      const a = k / NA * Math.PI * 2, x = Math.cos(a) * lk.r * r / NR, z = Math.sin(a) * lk.r * r / NR;
      vert(f(x, z), LAKE_SURF, x, z, 0);
    }
    for (let k = 0; k < NA; k++) idx.push(c0, c0 + 1 + (k + 1) % NA, c0 + 1 + k);
    for (let r = 1; r < NR; r++) for (let k = 0; k < NA; k++) { const a = c0 + 1 + (r - 1) * NA + k, b = c0 + 1 + (r - 1) * NA + (k + 1) % NA; idx.push(a, b, a + NA, b, b + NA, a + NA); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aUV', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  // (winding: both sides drawn, the camera may look at it from any side of the planet)
  const mask = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  mask.renderOrder = 1;
  const C = (hex) => ({ value: new THREE.Color(hex) });
  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    // each pixel takes the water once: on a bend the ribbon folds over itself, and blending twice
    // drew dark streaks there
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    uniforms: { uTime: { value: 0 }, uLight: { value: 1 }, uHalf: { value: half }, uRip: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 0, -99)) },
      cShallow: C(0xa6e2dc), cDeep: C(0x3f97a4), cFoam: C(0xf6fbf6) },
  });
  const surf = new THREE.Mesh(g, mat);
  for (const m of [mask, surf]) { m.userData.noInk = true; m.userData.noGround = true; m.raycast = () => {}; m.frustumCulled = true; scene.add(m); }
  // the sea sheet draws after the mask, so where the mask lies it never covers the riverbed
  const sea = scene.getObjectByName('sea'); if (sea) sea.renderOrder = 2;
  let hemi = null;
  surf.onBeforeRender = (r, sc) => {
    mat.uniforms.uTime.value = performance.now() / 1000;
    if (hemi === null) { hemi = false; sc.traverse(o => { if (o.isHemisphereLight && !hemi) hemi = o; }); }
    if (hemi) mat.uniforms.uLight.value = Math.min(1, Math.max(0.35, hemi.intensity / 1.35));
  };
  return { surf, P: pts, lakes, half, bridgeAt, uRip: mat.uniforms.uRip.value, time: () => mat.uniforms.uTime.value };
}

// ── little creatures ──
function fishMesh(col) {
  const g = new THREE.Group(), body = paint(col), fin = paint(new THREE.Color(col).multiplyScalar(0.8).getHex());
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), body); b.scale.set(0.55, 0.6, 1.6); g.add(b);
  const tail = new THREE.Group(); tail.position.z = -0.085; g.add(tail);
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.07, 3), fin); t.rotation.x = Math.PI / 2; t.scale.set(1, 1, 0.35); t.position.z = -0.03; tail.add(t);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 3), fin); top.position.set(0, 0.035, 0); top.scale.set(0.4, 1, 1.4); g.add(top);
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), paint(0x2a2230, { hatch: 0 })); e.position.set(s * 0.028, 0.012, 0.06); g.add(e); }
  g.userData.tail = tail;
  ink(g, 'fine');
  g.traverse(o => { o.userData.noGround = true; });
  return g;
}
function frogMesh(i) {
  const g = new THREE.Group(), skin = paint([0x6aa84f, 0x7fb35a, 0x5f9a5a][i % 3]), belly = paint(0xe6e2a8), dark = paint(0x2a2230, { hatch: 0 });
  const body = new THREE.Group(); g.add(body);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), skin); b.scale.set(1, 0.62, 1.15); b.position.y = 0.045; body.add(b);
  const throat = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), belly); throat.scale.set(1, 0.7, 0.8); throat.position.set(0, 0.03, 0.055); body.add(throat);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), skin); eye.position.set(s * 0.035, 0.09, 0.045); body.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), dark); pup.position.set(s * 0.04, 0.097, 0.061); body.add(pup);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.06, 3, 6), skin); leg.position.set(s * 0.065, 0.025, -0.03); leg.rotation.set(0.3, 0, s * 1.2); body.add(leg);
    const fl = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.035, 3, 6), skin); fl.position.set(s * 0.04, 0.02, 0.06); fl.rotation.x = 0.5; body.add(fl);
  }
  g.userData.body = body; g.userData.throat = throat;
  ink(g, 'fine');
  g.traverse(o => { o.userData.noGround = true; });
  return g;
}

const NEAR = 22;
export function createRiverLife({ scene, water, player, game, audio }) {
  if (!water) return { update() {} };
  const R0 = rng(8181), { P, lakes, half, bridgeAt } = water;
  const nearBridge = (d) => bridgeAt && arc(d, bridgeAt) < 4.5;
  // ── lily pads: in the lakes, and in the slow water along the river's edges ──
  const pads = [];
  const tryPad = (d) => { if (!isWater(d, 0.06) || surfH(d) < -1.1 || nearBridge(d) || pads.some(p => arc(p.d, d) < 0.42)) return; pads.push({ d, s: 0.75 + R0() * 0.5, rot: R0() * 6.28, ph: R0() * 6.28, flower: R0() < 0.35 ? (R0() < 0.5 ? 0xf0a6c0 : 0xf6f1e6) : null }); };
  for (const lk of lakes) { const f = frame(lk.c); for (let k = 0; k < 30; k++) { const a = R0() * 6.28, r = lk.r * (0.2 + R0() * 0.55); tryPad(f(Math.cos(a) * r, Math.sin(a) * r)); } }
  for (let i = 2; i < P.length - 2; i += 6) {
    if (R0() < 0.3) continue;
    const p = P[i], tan = P[i + 1].clone().sub(P[i - 1]).projectOnPlane(p).normalize(), lat = new THREE.Vector3().crossVectors(p, tan).normalize();
    const side = R0() < 0.5 ? -1 : 1;
    for (let k = 0; k < 1 + Math.floor(R0() * 3); k++) tryPad(p.clone().multiplyScalar(R).addScaledVector(lat, side * half * (0.42 + R0() * 0.2)).addScaledVector(tan, (R0() - 0.5) * 0.9).normalize());
  }
  const padGeo = new THREE.CircleGeometry(0.2, 16, 0.28, Math.PI * 2 - 0.56); padGeo.rotateX(-Math.PI / 2);
  const padMesh = new THREE.InstancedMesh(padGeo, paint(0x6f9a5a, { hatch: 0 }), pads.length);
  const flowers = pads.filter(p => p.flower);
  const flowerGeo = new THREE.ConeGeometry(0.05, 0.06, 6, 1, true); flowerGeo.translate(0, 0.03, 0); flowerGeo.rotateX(Math.PI);  // a little cup of petals, open side up
  flowerGeo.translate(0, 0.06, 0);
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, paint(0xffffff, { side: THREE.DoubleSide, hatch: 0 }), Math.max(1, flowers.length));
  flowers.forEach((p, k) => flowerMesh.setColorAt(k, new THREE.Color(p.flower)));
  for (const m of [padMesh, flowerMesh]) { m.frustumCulled = false; m.userData.noInk = true; m.userData.noGround = true; m.raycast = () => {}; scene.add(m); }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _o = new THREE.Object3D();
  const padAt = (p, t) => p.d.clone().multiplyScalar(R + 0.014 + 0.008 * Math.sin(t * 1.3 + p.ph));
  const placePad = (p, k, t) => {
    _o.position.copy(padAt(p, t)); alignToSurface(_o, p.d, p.rot + 0.08 * Math.sin(t * 0.6 + p.ph)); _o.scale.setScalar(p.s); _o.updateMatrix();
    padMesh.setMatrixAt(k, _o.matrix);
    if (p.fi != null) { _o.scale.setScalar(p.s * 0.9); _o.updateMatrix(); flowerMesh.setMatrixAt(p.fi, _o.matrix); }
  };
  flowers.forEach((p, k) => { p.fi = k; });
  pads.forEach((p, k) => placePad(p, k, 0));
  padMesh.instanceMatrix.needsUpdate = true; flowerMesh.instanceMatrix.needsUpdate = true;

  // ── fish: two circling each lake, three holding in the river's channel ──
  const fish = [];
  const COLS = [0xf08a3c, 0xc9d3dc, 0xf2c14e, 0xe8604c];
  lakes.forEach((lk, li) => { for (let k = 0; k < 2; k++) fish.push({ kind: 'lake', lk, a: R0() * 6.28, r: lk.r * (0.3 + 0.2 * k), w: (0.35 + R0() * 0.25) * (k ? -1 : 1), obj: fishMesh(COLS[(li * 2 + k) % 4]) }); });
  for (const t of [0.22, 0.48, 0.78]) {
    const i = Math.floor(P.length * t), p = P[i];
    if (nearBridge(p)) continue;
    fish.push({ kind: 'river', home: p, i, off: (R0() - 0.5) * 0.6, along: 0, dart: 0, ph: R0() * 6, obj: fishMesh(COLS[Math.floor(R0() * 4)]) });
  }
  for (const f of fish) { scene.add(f.obj); f.dir = (f.home || f.lk.c).clone(); }
  const riverPoint = (i, along, off) => {
    const k = Math.max(1, Math.min(P.length - 2, i)), p = P[k], tan = P[k + 1].clone().sub(P[k - 1]).projectOnPlane(p).normalize();
    const lat = new THREE.Vector3().crossVectors(p, tan).normalize();
    return { d: p.clone().multiplyScalar(R).addScaledVector(tan, along).addScaledVector(lat, off).normalize(), tan };
  };

  // ── frogs: on pads, hopping now and then to a pad nearby, croaking low ──
  const frogs = [];
  const padsSorted = pads.map((p, k) => ({ p, k }));
  for (let n = 0; n < 4 && padsSorted.length > 1; n++) {
    const start = padsSorted[Math.floor(R0() * padsSorted.length)];
    if (frogs.some(f => f.pad === start.k)) continue;
    const obj = frogMesh(n); scene.add(obj);
    frogs.push({ obj, pad: start.k, hop: null, wait: 3 + R0() * 8, croak: 5 + R0() * 12, puff: 0, yaw: R0() * 6.28 });
  }
  let rip = 0;
  const plop = (d) => { const v = water.uRip[rip++ % 4]; v.set(...d.clone().multiplyScalar(R).toArray(), water.time()); };

  return {
    update(dt) {
      const t = water.time(), here = player.st.dir, cold = game.G.state === 'cold';
      // pads near you bob
      let any = false;
      pads.forEach((p, k) => { if (arc(here, p.d) < NEAR) { placePad(p, k, t); any = true; } });
      if (any) { padMesh.instanceMatrix.needsUpdate = true; flowerMesh.instanceMatrix.needsUpdate = true; }
      for (const f of fish) {
        const near = arc(here, f.dir) < NEAR; f.obj.visible = near && !cold; if (!f.obj.visible) continue;
        let d, fwd;
        if (f.kind === 'lake') {
          if (Math.random() < dt * 0.15) f.burst = 1.2;                          // a dart
          f.burst = Math.max(0, (f.burst || 0) - dt);
          f.a += f.w * dt * (1 + 2.5 * f.burst) / Math.max(0.5, f.r);
          const fr = frame(f.lk.c); d = fr(Math.cos(f.a) * f.r, Math.sin(f.a) * f.r);
          fwd = fr(Math.cos(f.a + Math.sign(f.w) * 0.1) * f.r, Math.sin(f.a + Math.sign(f.w) * 0.1) * f.r);
        } else {                                                                 // holding against the current, now and then darting off and back
          if (f.dart <= 0 && Math.random() < dt * 0.12) f.dart = 1.6, f.dartTo = (Math.random() - 0.5) * 2.4;
          if (f.dart > 0) { f.dart -= dt; f.along += (f.dartTo - f.along) * (1 - Math.exp(-4 * dt)); } else f.along *= 1 - Math.min(1, 0.6 * dt);
          const q = riverPoint(f.i, f.along, f.off + 0.12 * Math.sin(t * 0.7 + f.ph));
          d = q.d; fwd = d.clone().multiplyScalar(R).addScaledVector(q.tan, -1).normalize();   // nose upstream (the river runs west → east)
        }
        f.dir.copy(d);
        f.obj.position.copy(d).multiplyScalar(R - 0.26 + 0.03 * Math.sin(t * 1.1 + (f.ph || f.a)));
        alignToSurface(f.obj, d, yawToFace(d, fwd));
        f.obj.userData.tail.rotation.y = 0.5 * Math.sin(t * (f.burst || f.dart > 0 ? 18 : 8));
      }
      for (const fr of frogs) {
        const p = pads[fr.pad], near = arc(here, p.d) < NEAR;
        fr.obj.visible = !cold && (near || fr.hop); if (!fr.obj.visible) continue;
        if (fr.hop) {                                                             // mid-hop: an arc to the next pad
          fr.hop.k = Math.min(1, fr.hop.k + dt / 0.55);
          const a = padAt(pads[fr.hop.from], t), b = padAt(pads[fr.hop.to], t), dd = slerpDir(a.clone().normalize(), b.clone().normalize(), fr.hop.k);
          fr.obj.position.copy(dd).multiplyScalar(a.length() + (b.length() - a.length()) * fr.hop.k + 0.32 * Math.sin(Math.PI * fr.hop.k));
          alignToSurface(fr.obj, dd, fr.yaw);
          if (fr.hop.k >= 1) { fr.pad = fr.hop.to; plop(pads[fr.pad].d); fr.hop = null; fr.wait = 5 + Math.random() * 9; }
          continue;
        }
        fr.obj.position.copy(padAt(p, t)).addScaledVector(p.d, 0.004);
        alignToSurface(fr.obj, p.d, fr.yaw);
        fr.wait -= dt; fr.croak -= dt;
        if (fr.croak <= 0) { fr.croak = 8 + Math.random() * 14; fr.puff = 0.6; if (arc(here, p.d) < 9) audio?.croak?.(); }
        fr.puff = Math.max(0, fr.puff - dt);
        fr.obj.userData.throat.scale.set(1 + fr.puff, 0.7 + fr.puff, 0.8 + fr.puff * 0.8);
        if (fr.wait <= 0) {                                                       // to a pad within a hop, not taken by another frog
          const to = pads.map((q, k) => ({ q, k })).filter(({ q, k }) => k !== fr.pad && arc(q.d, p.d) < 1.4 && !frogs.some(o => o.pad === k)).sort(() => Math.random() - 0.5)[0];
          if (to) { fr.hop = { from: fr.pad, to: to.k, k: 0 }; fr.yaw = yawToFace(p.d, to.q.d); plop(p.d); }
          else fr.wait = 4;
        }
      }
    },
  };
}
