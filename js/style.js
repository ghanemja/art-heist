// ─── THE HAND-DRAWN LOOK ─────────────────────────────────────────────────────
// One style, applied to everything, in a single render pass:
//   • gouache fills: flat cel bands (light / mid / shadow), never glossy
//   • paper: a fixed grain + a soft pencil hatch that only bites in shadow
//   • ink: outlines of constant on-screen width (like a real pen), with a
//     gentle wobble redrawn a few times a second — alive, not shimmering
// No environment maps, no specular, no shadow maps: shapes are read from
// their ink and their cel bands, the way an illustrator would draw them.
import * as THREE from 'three';

// ── palette: muted gouache on warm paper ──
export const PAL = {
  paper: 0xf3ead7, ink: 0x2a2230,
  grass: 0xb4c58f, grassDeep: 0x93ad74, meadow: 0xc9d39a,
  sand: 0xead7ad, earth: 0xd9c29a, rock: 0xb8ab98, snow: 0xf6f1e6,
  water: 0x8fc3c9, waterDeep: 0x6fa6b4,
  road: 0x8a8392, kerb: 0xefe5cf, dash: 0xf6eedb,
  cream: 0xf1e4c8, terracotta: 0xd58b63, dusty: 0x93abc0, sage: 0xa8b994,
  mustard: 0xe1b95c, rose: 0xdc9e9a, lilac: 0xb7a3c6, teal: 0x7fb3a8,
  roofRed: 0xb85a3e, roofSlate: 0x6f7d92, roofGreen: 0x6f9a7c,
  leaf: 0x86a868, leafLight: 0xa5c27f, bark: 0x8a6448,
  accent: 0xe8604c, gold: 0xe4b84f,
};

// ── a 3-band toon ramp: shadow / mid / light, hard edges between them ──
const ramp = (a, b, c) => {
  const d = new Uint8Array([a, b, c]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
};
const RAMP = ramp(105, 175, 255);
// a gentler ramp for skin and hair: the default mid band darkens a light skin tone to the
// colour of her hair (her chin read as hair), and blotches a pale bob with dark patches
const RAMP_SOFT = ramp(196, 228, 255);

// paper grain + hatching, injected at the very end of every fill shader. It
// works in SCREEN space (like ink on a page) so it never swims on a surface.
const PAPER_GLSL = /* glsl */`
  {
    vec2 fc = gl_FragCoord.xy;
    // grain: two octaves of cheap hash noise, very low contrast
    float g1 = fract(sin(dot(floor(fc / 2.0), vec2(12.9898, 78.233))) * 43758.5453);
    float g2 = fract(sin(dot(floor(fc / 7.0), vec2(39.346, 11.135))) * 24634.6345);
    float grain = (g1 - 0.5) * 0.035 + (g2 - 0.5) * 0.025;
    // how lit is this pixel compared to its own pigment? (the cel band)
    float lumC = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
    float lumD = max(1e-3, dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)));
    float shade = clamp(lumC / lumD, 0.0, 1.5);
    // pencil hatch: diagonal strokes, only in the shadow band, broken up so
    // it reads hand-made rather than a ruled pattern
    float diag = fract((fc.x + fc.y) / 6.0);
    float brk = step(0.35, fract(sin(floor((fc.x - fc.y) / 23.0) * 91.7) * 4375.85));
    float hatch = step(0.82, diag) * brk * (1.0 - smoothstep(0.45, 0.62, shade));
    gl_FragColor.rgb *= 1.0 + grain;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.78, hatch * uHatch);
    // gouache: lift the darks a touch so shadows stay coloured, never black
    gl_FragColor.rgb = gl_FragColor.rgb * 0.94 + diffuseColor.rgb * 0.06;
  }
`;

const _matCache = new Map();
// paint(color, { hatch, flat, map, side, opacity }) → shared gouache material
export function paint(color, o = {}) {
  const key = [color, o.hatch ?? 1, o.map?.uuid, o.side, o.opacity, o.emissive, o.vertexColors, o.soft ? 's' : ''].join('|');
  if (_matCache.has(key) && !o.unique) return _matCache.get(key);
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: o.soft ? RAMP_SOFT : RAMP, map: o.map || null, side: o.side ?? THREE.FrontSide,
    transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
    vertexColors: !!o.vertexColors,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissive ? 1 : 0,
  });
  m.userData.hatch = o.hatch ?? 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHatch = { value: m.userData.hatch };
    sh.fragmentShader = 'uniform float uHatch;\n' + sh.fragmentShader
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + PAPER_GLSL);
  };
  m.customProgramCacheKey = () => 'paper' + (m.userData.hatch > 0 ? 'h' : '');
  if (!o.unique) _matCache.set(key, m);
  return m;
}

// ── INK: inverted hull pushed out in CLIP space, so the stroke is the same
// width in pixels near or far (a pen, not a shell). Weight varies slowly along
// the line and the whole drawing is re-traced ~4×/s by a tiny amount.
export const inkUniforms = {
  uTime: { value: 0 },
  uRes: { value: new THREE.Vector2(1280, 800) },
  uWidth: { value: 1.7 },                    // px at weight 1
};
function makeInk(weight = 1, color = PAL.ink) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { ...inkUniforms, uWeight: { value: weight }, uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`
      uniform float uTime, uWidth, uWeight; uniform vec2 uRes;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 nv = normalize(normalMatrix * normal);
        vec2 n2 = normalize((projectionMatrix * vec4(nv, 0.0)).xy + 1e-5);
        float tick = floor(uTime * 4.0);
        // weight swells/thins slowly along the stroke (low-frequency, per area)
        float along = h(floor(position * 2.5) + 0.37);
        float boil = h(position * 7.0 + tick) - 0.5;
        float w = uWidth * uWeight * (0.8 + 0.45 * along + 0.12 * boil);
        clip.xy += n2 * w * 2.0 / uRes * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  });
}
const INK = { heavy: makeInk(1.25), mid: makeInk(1.0), fine: makeInk(0.7) };
// the same stroke, faded per vertex by an `inkW` attribute (no line where one part grows out of another)
const INK_FADE = {};
function fadeInk(weight) {
  if (INK_FADE[weight]) return INK_FADE[weight];
  const m = (INK[weight] || INK.mid).clone();
  m.uniforms = { ...inkUniforms, uWeight: (INK[weight] || INK.mid).uniforms.uWeight, uColor: (INK[weight] || INK.mid).uniforms.uColor };
  m.vertexShader = m.vertexShader.replace('uniform float uTime,', 'attribute float inkW;\n      uniform float uTime,')
    .replace('float w = uWidth * uWeight *', 'float w = inkW * uWidth * uWeight *');
  return (INK_FADE[weight] = m);
}

// ink(obj): give every mesh under obj its outline. Hull reuses the mesh's own
// geometry (no copy), so the cost is one extra draw per inked mesh.
export function ink(root, weight = 'mid') {
  const mat = INK[weight] || INK.mid;
  const list = [];
  root.traverse(o => {
    if (!o.isMesh || o.userData.noInk || o.userData.isInk || o.userData.gpSkip) return;
    if (o.material?.blending === THREE.AdditiveBlending || o.material?.transparent && (o.material.opacity ?? 1) < 0.5) return;
    if (!o.geometry?.attributes?.normal) return;
    list.push(o);
  });
  for (const o of list) {
    const line = new THREE.Mesh(o.geometry, o.geometry.attributes.inkW ? fadeInk(weight) : mat);
    line.userData.isInk = true;
    line.raycast = () => {};
    line.renderOrder = -1;
    if (o.isSkinnedMesh) {                       // a skinned hull must skin too
      // (a geometry with an `inkW` attribute fades its stroke per vertex — limbs use it so
      // no line is drawn where an arm or leg grows out of the body)
      const sk = new THREE.SkinnedMesh(o.geometry, skinnedInk(weight, !!o.geometry.attributes.inkW));
      sk.bind(o.skeleton, o.bindMatrix);
      sk.userData.isInk = true; sk.raycast = () => {}; sk.frustumCulled = false;
      o.parent.add(sk);
      sk.position.copy(o.position); sk.quaternion.copy(o.quaternion); sk.scale.copy(o.scale);
      continue;
    }
    o.add(line);
  }
  return root;
}
const _skinInk = {};
function skinnedInk(weight, fade = false) {
  const key = weight + (fade ? ':fade' : '');
  if (_skinInk[key]) return _skinInk[key];
  const base = INK[weight] || INK.mid;
  const m = base.clone();
  m.uniforms = { ...inkUniforms, uWeight: base.uniforms.uWeight, uColor: base.uniforms.uColor };
  m.vertexShader = base.vertexShader
    .replace('void main() {', '#include <common>\n#include <skinning_pars_vertex>\nvoid main() {\n#include <skinbase_vertex>\n#include <begin_vertex>\n#include <skinning_vertex>\nvec3 beginN = normal;\n#include <beginnormal_vertex>\n#include <skinnormal_vertex>')
    .replace('vec4(position, 1.0)', 'vec4(transformed, 1.0)')
    .replace('normalize(normalMatrix * normal)', 'normalize(normalMatrix * objectNormal)')
    .replace('floor(position * 2.5)', 'floor(transformed * 2.5)').replace('position * 7.0', 'transformed * 7.0');
  if (fade) m.vertexShader = m.vertexShader
    .replace('uniform float uTime,', 'attribute float inkW;\n      uniform float uTime,')
    .replace('float w = uWidth * uWeight *', 'float w = inkW * uWidth * uWeight *');
  _skinInk[key] = m;
  return m;
}

// ── a soft contact shadow: a dark wash under things instead of shadow maps ──
const _blobTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 4, 32, 32, 31);
  g.addColorStop(0, 'rgba(60,40,70,0.42)'); g.addColorStop(0.6, 'rgba(60,40,70,0.18)'); g.addColorStop(1, 'rgba(60,40,70,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv); return t;
})();
const _blobMat = new THREE.MeshBasicMaterial({ map: _blobTex, transparent: true, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const _blobGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
export function blobShadow(rx, rz = rx) {
  const m = new THREE.Mesh(_blobGeo, _blobMat);
  m.scale.set(rx, 1, rz); m.position.y = 0.02; m.userData.noInk = true; m.raycast = () => {};
  return m;
}

// tick: advance the ink boil + keep strokes pixel-true after a resize
export function styleTick(t, w, h) {
  inkUniforms.uTime.value = t;
  inkUniforms.uRes.value.set(w, h);
}
