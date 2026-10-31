// ─── LANTERN PARK'S LIFE: strollers round the pond, a reader on a bench ─────────
// The park (buildings.js parkGarden, placed in town.js) hands over its ring path's radius and
// its benches in its own frame (userData.park). Here:
//   • three strollers walk the cobbled ring round the pond, each their own pace and way round,
//     stopping now and then to look at the water; they stop for you, the car bumps them;
//   • a woman reads on one of the benches (the seated 'reading' stance), turning the pages;
//   • a man with a coffee stands at the pond's rim, looking at the spout.
// Their own people (AGENTS.md): own build, face, hair, outfit, the critic's scale. Only drawn
// and animated while you're near.
//   • the pond's water: see-through, so the basin floor and the coins on it show, gently moving
//     (ripple strokes, rings spreading from the spout, caustic shimmer, a pale lip at the rim).
import * as THREE from 'three';
import { arc, standAt, alignToSurface, yawToFace } from './world.js';
import { person } from './human.js';
import { poseFolk, FOLK_SCALE } from './folk.js';

// ── the pond's water: one transparent disc over the basin (buildings.js parkGarden lays the floor
// and the coins), riding the same ground the placed park was laid on so it sits level under the
// rim's lip, well clear of the floor (no fighting). Its look follows the river's (riverlife.js) ──
const POND_VS = /* glsl */`
  varying vec2 vL; varying vec3 vW;
  void main() {
    vL = position.xz;
    vW = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const POND_FS = /* glsl */`
  uniform float uTime, uLight, uR; uniform vec3 cShallow, cDeep, cFoam;
  varying vec2 vL; varying vec3 vW;
  float band(float w, float lo, float hi) { float aa = fwidth(w); return smoothstep(lo - aa, hi + aa, w); }
  void main() {
    float d = length(vL), rr = d / uR;
    vec3 up = normalize(vW), V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - clamp(dot(V, up), 0.0, 1.0), 3.0);
    vec3 col = mix(cShallow, cDeep, 0.35 + 0.3 * fres);
    float a = 0.22 + 0.55 * fres;                                  // clear from above, more tint at a glance
    // slow ripple strokes drifting over the water
    float w = sin(vL.x * 9.0 + 1.5 * sin(vL.y * 6.0 + uTime * 0.7) + uTime * 0.8) * sin(vL.y * 10.0 - uTime * 0.6 + 1.2 * sin(vL.x * 5.0));
    float strokes = band(w, 0.86, 0.97);
    // rings spreading out from where the spout's drops fall, fading as they go
    float ring = band(sin(d * 22.0 - uTime * 2.2), 0.93, 0.99) * exp(-d * 1.4) * smoothstep(0.24, 0.32, d);
    // caustic shimmer
    float c = sin(vL.x * 14.0 + 2.0 * sin(vL.y * 9.0 + uTime)) * sin(vL.y * 13.0 - uTime * 1.1 + 2.0 * sin(vL.x * 7.0));
    col = mix(col, cFoam, band(c, 0.78, 0.96) * 0.22);
    float lip = smoothstep(0.92, 1.0, rr);                         // a pale lip where it laps the stone
    float foam = clamp(strokes * 0.4 + ring * 0.55 + lip * 0.5, 0.0, 1.0);
    col = mix(col, cFoam, foam);
    a = max(a, foam * 0.75);
    gl_FragColor = vec4(col * uLight, a);
    #include <colorspace_fragment>
  }`;
function pondWater(root, pond) {
  const lift = root.userData.lift || (() => 0), NA = 64, NR = 8, pos = [0, pond.y + lift(0, 0), 0], idx = [];
  for (let r = 1; r <= NR; r++) for (let k = 0; k < NA; k++) {
    const a = k / NA * Math.PI * 2, x = Math.sin(a) * pond.r * r / NR, z = Math.cos(a) * pond.r * r / NR;
    pos.push(x, pond.y + lift(x, z), z);
  }
  for (let k = 0; k < NA; k++) idx.push(0, 1 + k, 1 + (k + 1) % NA);
  for (let r = 1; r < NR; r++) for (let k = 0; k < NA; k++) {
    const a = 1 + (r - 1) * NA + k, b = 1 + (r - 1) * NA + (k + 1) % NA;
    idx.push(a, a + NA, b, b, a + NA, b + NA);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeBoundingSphere();
  const C = (hex) => ({ value: new THREE.Color(hex) });
  const mat = new THREE.ShaderMaterial({
    vertexShader: POND_VS, fragmentShader: POND_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uLight: { value: 1 }, uR: { value: pond.r }, cShallow: C(0xa6e2dc), cDeep: C(0x3f97a4), cFoam: C(0xf6fbf6) },
  });
  const m = new THREE.Mesh(g, mat);
  m.userData.noInk = true; m.userData.noGround = true; m.raycast = () => {};
  let hemi = null;
  m.onBeforeRender = (r, sc) => {
    mat.uniforms.uTime.value = performance.now() / 1000;
    if (hemi === null) { hemi = false; sc.traverse(o => { if (o.isHemisphereLight && !hemi) hemi = o; }); }
    if (hemi) mat.uniforms.uLight.value = Math.min(1, Math.max(0.35, hemi.intensity / 1.35));   // darker at night
  };
  root.add(m);
  return m;
}

// sitting on a seat `h` above the floor: the hips come down until the seat of the trousers rests
// on it, the thighs tilt down from there just enough for the shins to stand straight with the
// soles flat on the floor (folk.js's seated pose is drawn for one seat height; benches differ)
function sitAt(inst, h, look) {
  const J = inst.J, k = (look.height ?? 1) * FOLK_SCALE, B = look.build ?? 1;
  const hip = h / k + 0.0744 * B;                     // (the pelvis reaches 0.0744·build below the hip joint)
  const tilt = Math.asin(Math.max(-0.3, Math.min(0.6, (hip - 0.295) / 0.27)));   // shin + shoe 0.295, thigh 0.27 (rig units)
  J.hips.position.y = hip;
  J.thighL.rotation.set(-(Math.PI / 2 - tilt), 0, -0.06); J.thighR.rotation.set(-(Math.PI / 2 - tilt), 0, 0.06);
  J.shinL.rotation.x = J.shinR.rotation.x = Math.PI / 2 - tilt;
}

const NEAR = 22;
const STROLLERS = [
  { id: 'mo', pitch: 160, line: 'I was COUNTING DUCKS!', start: 0.0, way: 1, speed: 0.55,
    look: { folk: true, skin: 'tan', hair: 0x2a1d17, hairStyle: 'crop', top: 0x5f8f4c, sleeve: 'short', bottom: 0xd8cab0, shoes: 0x6a4a3a,
      height: 1.04, build: 1.0, hat: 'cap', hatColor: 0xe1b95c,
      face: { shape: { jaw: 0.6, chin: 0.4, cheeks: 0.4, long: 0.2, skull: 0.5, brow: 0.55 }, nose: 'straight', noseSize: 1.05, eyes: 'round', brows: 'flat', hair: 'sides', blush: 0.25 } } },
  { id: 'bea', pitch: 390, line: 'My constitutional!', start: 0.4, way: -1, speed: 0.42,
    look: { folk: true, skin: 'rose', hair: 0xe8e2d6, hairStyle: 'bun', outfit: 'coat', top: 0xdc9e9a, accent: 0xf6eedb, bottom: 0x4a4458, shoes: 0x3a2a30,
      height: 0.92, build: 0.92, glasses: true,
      face: { shape: { jaw: 0.3, chin: 0.45, cheeks: 0.5, long: 0.3, skull: 0.5, brow: 0.4 }, nose: 'roman', noseSize: 1.0, eyes: 'round', brows: 'raised', glasses: true, hair: 'bun', blush: 0.6 } } },
  { id: 'rafi', pitch: 230, line: 'I was ON A RUN!', start: 0.7, way: 1, speed: 0.75,
    look: { folk: true, skin: 'deep', hair: 0x1d1716, hairStyle: 'curls', top: 0xe8604c, sleeve: 'short', bottom: 0x2f3f55, shoes: 0xf1ece0,
      height: 1.0, build: 0.9,
      face: { shape: { jaw: 0.45, chin: 0.5, cheeks: 0.45, long: 0.1, skull: 0.5, brow: 0.45 }, nose: 'round', noseSize: 1.0, eyes: 'round', brows: 'flat', hair: 'crop', blush: 0.3 } } },
];
// (face.hair must be a faces.js HAIR key: 'bob' and 'curls' aren't, and drew these two bald)
const READER = { skin: 'olive', hair: 0x6a3b22, hairStyle: 'bob', outfit: 'cardigan', top: 0x8f7ae8, accent: 0xf6eedb, bottom: 0x3e6b52, shoes: 0x6e2a2e,
  height: 0.96, build: 0.95, stance: 'reading', folk: true,
  face: { shape: { jaw: 0.3, chin: 0.5, cheeks: 0.45, long: 0.15, skull: 0.5, brow: 0.4 }, nose: 'snub', noseSize: 0.95, eyes: 'round', brows: 'raised', lashes: true, hair: 'fringe', blush: 0.5 } };
const SIPPER = { skin: 'rose', hair: 0x8a5a3a, hairStyle: 'crop', beard: true, top: 0x3f5872, outfit: 'coat', accent: 0xd8cab0, bottom: 0x5a5048, shoes: 0x3a2a30,
  height: 1.06, build: 1.05, belly: 0.3, stance: 'coffee', folk: true,
  face: { shape: { jaw: 0.65, chin: 0.35, cheeks: 0.4, long: 0.25, skull: 0.55, brow: 0.6 }, nose: 'straight', noseSize: 1.1, eyes: 'round', brows: 'flat', hair: 'crop', blush: 0.2 } };

export function createPark({ scene, town, game, player }) {
  const P = town.park;
  if (!P) return { update() {} };
  const root = P.root; root.updateWorldMatrix(true, false);
  const L = (x, z) => root.localToWorld(new THREE.Vector3(x, 0, z)).normalize();
  const onRing = (t, r = P.ring) => L(Math.sin(t * Math.PI * 2) * r, Math.cos(t * Math.PI * 2) * r);
  const people = [];

  // the strollers: a position round the ring (t, 0–1), sometimes a pause looking at the pond
  for (const S of STROLLERS) {
    const obj = person(S.look); scene.add(obj);
    const s = { ...S, obj, t: S.start, wait: 0, paused: false, dir: onRing(S.start).clone(), walking: true };
    game.bumps.add(obj, { pitch: S.pitch, line: S.line, home: () => s.dir.clone(), onAway: () => { s.paused = true; }, onBack: () => { s.paused = false; } });
    people.push(s);
  }
  if (P.pond) pondWater(root, P.pond);
  // the reader, on the first bench: her seat on its slats, her soles on the lawn, facing the pond.
  // (Placed from the park's own ground, not standAt: that finds the bench seat under her and
  // she floated a seat's height above it)
  const lift = root.userData.lift || (() => 0);
  {
    const b = P.benches[0], obj = person(READER);
    const x = b.x + Math.sin(b.a) * 0.04, z = b.z + Math.cos(b.a) * 0.04;     // a little back from the seat's middle
    const d = L(x, z), h = obj.userData.human;
    obj.position.copy(root.localToWorld(new THREE.Vector3(x, lift(x, z) + (P.lawnY ?? 0.04), z)));
    alignToSurface(obj, d, yawToFace(d, L(0, 0)));
    scene.add(obj);
    const seat = (P.seatY ?? 0.46) - (P.lawnY ?? 0.04);
    if (h) { poseFolk(h, 0, 0); sitAt(h, seat, READER); }
    people.push({ obj, dir: d, still: true, seat });
  }
  // the man with the coffee, at the pond's rim between two paths, looking at the spout
  {
    const a = Math.PI * 0.62, d = L(Math.sin(a) * 1.85, Math.cos(a) * 1.85), obj = person(SIPPER);
    obj.position.copy(d).multiplyScalar(standAt(d));
    alignToSurface(obj, d, yawToFace(d, L(0, 0)));
    scene.add(obj);
    const s = { obj, dir: d, still: true };
    game.bumps.add(obj, { pitch: 170, line: 'My FLAT WHITE!', home: () => d.clone() });
    people.push(s);
  }

  function step(s, dt) {
    s.t = (s.t + s.way * s.speed * dt / (2 * Math.PI * P.ring) + 1) % 1;   // speed in units/s round the ring
    const d = onRing(s.t), ahead = onRing(s.t + s.way * 0.02);
    s.dir.copy(d);
    s.obj.position.copy(d).multiplyScalar(standAt(d));
    alignToSurface(s.obj, d, yawToFace(d, ahead));
  }
  for (const s of people) if (!s.still) step(s, 0);

  return {
    list: people,
    update(dt) {
      const cold = game.G.state === 'cold';
      const here = player.st.dir;
      for (const s of people) {
        const busy = game.bumps.busy?.(s.obj), far = arc(here, s.dir) > NEAR;
        s.obj.visible = !cold && (!far || busy);
        if (cold || far || busy || s.paused) continue;
        const h = s.obj.userData.human;
        if (s.still) { if (h) { poseFolk(h, dt, 0); if (s.seat) sitAt(h, s.seat, READER); } continue; }
        if (s.wait > 0) {                                  // a moment at the water
          s.wait -= dt;
          if (s.wait <= 0) { s.wait = 0; s.next = 6 + Math.random() * 8; }
          alignToSurface(s.obj, s.dir, yawToFace(s.dir, L(0, 0)));
          if (h) poseFolk(h, dt, 0);
          continue;
        }
        if (player.st.mode === 'walk' && arc(here, s.dir) < 1.1) { if (h) poseFolk(h, dt, 0); continue; }   // let you pass
        s.next = (s.next ?? 4 + Math.random() * 6) - dt;
        if (s.next <= 0) { s.wait = 2.5 + Math.random() * 3; continue; }
        step(s, dt);
        if (h) poseFolk(h, dt, Math.min(1, s.speed / 0.75));
      }
    },
  };
}
