// ─── SEE-THROUGH POND WATER, A FOUNTAIN'S SPILL, AND KOI ────────────────────
// For small built pools (the museum's sculpture garden): the river and lakes' water
// (riverlife.js) is a carved bed under a mask, too big a machine for a basin. Here:
//   • pondWater(): a see-through toon paint, lit like everything else, so the basin's floor
//     shows through — clearer at the middle, deeper teal toward the walls, a gentle drift of
//     ripple strokes and caustic shimmer, rings spreading from where a fountain's spill lands
//     and a lip of foam round it. Drawn in the pool's own level frame (its uvs, laid in metres
//     before the grounds are bent onto the planet), animated by the ink clock: no per-frame JS.
//   • spillMat(): the falling sheets and the jet — pale, streaked water running down them.
//   • addKoi(): a few koi circling under the surface — one mesh, swum in its vertex shader.
// Everything here is noInk (water has no outline) and never ground to stand on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paint, inkUniforms } from './style.js';
import { drawnGroundAt, alignToSurface } from './world.js';

// a 1×1 white map: it keeps the uvs (baking drops them from a material without a map)
let _white = null;
const white = () => _white || (_white = Object.assign(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), { needsUpdate: true, colorSpace: THREE.SRGBColorSpace }));

// the water of a round pool centred (cx, cz) in uv metres, radius r; `land` lists the radii where
// spilling water lands (rings spread out from each, a foam lip on it)
export function pondWater({ cx = 0, cz = 0, r = 1.5, land = [], shallow = 0x8fd3cb, deep = 0x3f97a4, opacity = 0.42 } = {}) {
  const m = paint(shallow, { hatch: 0, opacity, map: white(), unique: true });
  m.depthWrite = false;                     // (the basin floor and anything under it always shows)
  m.userData.noGround = true;
  const L = [...land, 0, 0, 0].slice(0, 3);
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, rr) => {
    base(sh, rr);
    Object.assign(sh.uniforms, { uTime: inkUniforms.uTime, uC: { value: new THREE.Vector2(cx, cz) }, uR: { value: r },
      uLand: { value: new THREE.Vector3(...L) }, cDeep: { value: new THREE.Color(deep) }, cFoam: { value: new THREE.Color(0xf4fbf6) } });
    sh.vertexShader = 'varying vec2 vPondUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vPondUv = uv;');
    sh.fragmentShader = 'uniform float uTime, uR; uniform vec2 uC; uniform vec3 uLand, cDeep, cFoam; varying vec2 vPondUv;\n' +
      'float pBand(float w, float lo, float hi) { float aa = fwidth(w); return smoothstep(lo - aa, hi + aa, w); }\n' +
      sh.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
  {
    vec2 q = vPondUv - uC; float d = length(q), t = uTime;
    float wall = smoothstep(uR - 0.45, uR, d);                         // deeper-looking toward the walls
    diffuseColor.rgb = mix(diffuseColor.rgb, cDeep, 0.15 + 0.5 * wall);
    // a slow drift of ripple strokes, and caustic shimmer over the floor
    float w = sin(q.x * 9.0 + 1.7 * sin(q.y * 6.0 + t * 0.9) + t * 0.8) * sin(q.y * 10.0 - t * 0.7 + 1.3 * sin(q.x * 5.0));
    float strokes = pBand(w, 0.83, 0.95);
    float c = sin(q.x * 13.0 + 2.0 * sin(q.y * 9.0 + t * 1.1)) * sin(q.y * 14.0 - t * 1.3 + 2.0 * sin(q.x * 7.0));
    float caus = pBand(c, 0.72, 0.93) * (1.0 - wall);
    // rings spreading from where the spill lands, and the foam lip on that line
    float rings = 0.0, foam = 0.0;
    for (int i = 0; i < 3; i++) {
      float L = uLand[i]; if (L <= 0.0) continue;
      float k = d - L;
      foam += smoothstep(0.06, 0.0, abs(k)) * (0.75 + 0.25 * sin(atan(q.y, q.x) * 23.0 + t * 5.0));
      if (k > 0.0) rings += pBand(sin(k * 26.0 - t * 3.2), 0.7, 0.9) * exp(-k * 2.2);
    }
    float lip = smoothstep(0.05, 0.0, abs(d - uR + 0.03));             // a pale line where it laps the wall
    float f = clamp(strokes * 0.4 + caus * 0.22 + rings * 0.5 + foam * 0.85 + lip * 0.5, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, cFoam, f);
    diffuseColor.a = clamp(diffuseColor.a + 0.18 * wall + f * 0.45, 0.0, 0.92);
  }`);
  };
  m.customProgramCacheKey = () => 'pondwater';
  return m;
}

// falling water: pale streaks running down a sheet (its uv v runs from the lip, 0, down to where it
// lands, 1), thinning to nothing where it meets the water below
export function spillMat() {
  const m = paint(0xd8f1ef, { hatch: 0, opacity: 0.55, map: white(), unique: true, side: THREE.DoubleSide });
  m.depthWrite = false;
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, rr) => {
    base(sh, rr);
    sh.uniforms.uTime = inkUniforms.uTime;
    sh.vertexShader = 'varying vec2 vSpUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vSpUv = uv;');
    sh.fragmentShader = 'uniform float uTime; varying vec2 vSpUv;\n' + sh.fragmentShader.replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
  {
    float u = vSpUv.x * 64.0, v = vSpUv.y;
    float lane = fract(sin(floor(u) * 91.7) * 437.5);                  // each strand its own pace
    float run = fract(v * 3.0 - uTime * (1.4 + 0.8 * lane) + lane * 7.0);
    float streak = smoothstep(0.0, 0.3, run) * smoothstep(0.95, 0.5, run) * smoothstep(0.32, 0.08, abs(fract(u) - 0.5));
    float glint = smoothstep(0.75, 1.0, run) * 0.5;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), streak * 0.55);
    diffuseColor.a = (0.16 + 0.42 * streak + glint * 0.12) * smoothstep(1.0, 0.82, v) * smoothstep(0.0, 0.05, v);
  }`);
  };
  m.customProgramCacheKey = () => 'pondspill';
  return m;
}
// a lathe that keeps its uvs (props.js lathe() drops them): the spill sheets
export function sheet(pts, seg = 40) {
  return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
}

// ── koi: a few fish circling round the pool's centre under the surface. Built at their orbits in
// the pool's own frame; each fish's vertex colours carry its data (r: phase round the circle, g:
// orbit radius / 4, b: which colouring), and the vertex shader swims it round and wags its tail ──
const KOI = [0xf08a3c, 0xf4efe4, 0xe9b949, 0xe0603a];
function koiMat() {
  const m = paint(0xffffff, { vertexColors: true, unique: true });
  const base = m.onBeforeCompile;
  const swim = /* glsl */`
    float kPh = color.r * 6.28318, kOrb = color.g * 4.0;
    float kTh = kPh + uTime * (0.32 + 0.18 * fract(color.r * 7.31)) + 0.35 * sin(uTime * 0.45 + kPh * 3.0);
    float kC = cos(kTh), kS = sin(kTh);`;
  m.onBeforeCompile = (sh, rr) => {
    base(sh, rr);
    sh.uniforms.uTime = inkUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  {' + swim + '\n    objectNormal.xz = vec2(objectNormal.x * kC - objectNormal.z * kS, objectNormal.x * kS + objectNormal.z * kC); }')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  {' + swim + /* glsl */`
    vec2 rel = vec2(transformed.x - kOrb, transformed.z);          // the fish's own frame: head +z
    rel.x += sin(uTime * 7.0 + kPh * 5.0) * 0.45 * max(0.0, -rel.y - 0.01);    // the tail wags
    rel.x += kOrb;
    transformed.xz = vec2(rel.x * kC - rel.y * kS, rel.x * kS + rel.y * kC); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', /* glsl */`
  { float b = vColor.b; diffuseColor.rgb = b < 0.25 ? vec3(${hex(KOI[0])}) : b < 0.5 ? vec3(${hex(KOI[1])}) : b < 0.75 ? vec3(${hex(KOI[2])}) : vec3(${hex(KOI[3])}); }`);
  };
  m.customProgramCacheKey = () => 'koi';
  return m;
}
const hex = (h) => { const c = new THREE.Color(h).convertSRGBToLinear(); return `${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)}`; };
// one fish (≈0.2 long, head +z) at (orb, 0, 0), its data in its vertex colours
function fish(orb, phase, kind) {
  const parts = [];
  const body = new THREE.SphereGeometry(0.035, 14, 10); body.scale(0.8, 0.55, 2.6); parts.push(body);
  const tail = new THREE.SphereGeometry(0.03, 10, 6); tail.scale(1.1, 0.25, 0.9); tail.translate(0, 0, -0.105); parts.push(tail);
  for (const s of [-1, 1]) { const f = new THREE.SphereGeometry(0.018, 8, 6); f.scale(1.3, 0.2, 0.8); f.translate(s * 0.03, -0.006, 0.02); parts.push(f); }
  const out = [];
  for (const g of parts) {
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = phase; col[i * 3 + 1] = orb / 4; col[i * 3 + 2] = (kind + 0.5) / 4; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv');
    g.translate(orb, 0, 0); out.push(g);
  }
  return out;
}
// add the koi of a placed grounds group's pond (userData.pond: { x, z, depth, fish: [[orbit, phase], …] })
export function addKoi(scene, g) {
  const P = g.userData.pond; if (!P?.fish?.length) return null;
  const geo = mergeGeometries(P.fish.flatMap(([orb, ph], i) => fish(orb, ph, i % KOI.length)));
  geo.computeBoundingSphere(); geo.boundingSphere.radius += 0.3;
  const m = new THREE.Mesh(geo, koiMat());
  const d = g.localToWorld(new THREE.Vector3(P.x, 0, P.z)).normalize();
  m.position.copy(d).multiplyScalar(drawnGroundAt(d) + P.depth);
  alignToSurface(m, d);
  m.userData.noInk = true; m.userData.noGround = true; m.raycast = () => {};
  scene.add(m);
  return m;
}
