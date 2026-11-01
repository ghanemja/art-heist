// ─── THE MEADOW: wildflowers across the street from Lantern Park, to run through ───
// A patch of the plants.js flowers (tulips, daisies, poppies, cosmos, cornflowers, buttercups,
// lavender and salvia spikes, ornamental grass, clover, broad leaves) on the open grass on the
// far side of the road past the park. It's an irregular blob whose edge thins out into the lawn;
// kinds and colours come in drifts (clumps), with grass, clover and daisies filling between.
//
// Stomping: every plant keeps its root as a vertex attribute, and the vertex shader is handed the
// critic's recent trail (a live point plus a ring of dropped ones, each with the time she was
// there). A plant within ~0.6 of a point lies over, away from it, flat to the ground; once she's
// past it springs back up with a little overshoot and wobble (~0.8 s). The car flattens a wider
// swathe. No per-plant JS: the whole meadow is ONE fill mesh (colours per vertex) + ONE ink hull,
// two draws. No colliders: you walk straight through.
//
// Run (not walk) through it and a hand-lettered "stomp!" pops up by her feet now and then.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import PLAN from './manifest.js';
import { R, llv, frame, reserve, zoneHit, decoBlocked, drawnGroundAt, isWater, LOTS, arc } from './world.js';
import { paint, inkUniforms } from './style.js';
import { C, BREEZE } from './plants.js';
import { sfxOut } from './audio.js';

const rng = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };

// ── where: across the road on the park's west side, on the long wedge of lawn between that road
// and the cul-de-sac road, round the little stone cairn and the lawn's trees (Lantern Park's own
// placed frame, +z toward town). It used to sit further south, on the open hillside straight
// across from the park (x −11.9, z 0.3, rot −0.12); moved up onto this lawn by request, its long
// axis turned to run along the wedge, clear of both kerbs. The frame() helper's side axis is the
// placed frame's −x.
const SPOT = { x: -9.76, z: 14.25, a: 3.3, b: 5.2, rot: 0.18, reserveR: 3.6 };
function meadowFrame() {
  const T = llv(PLAN.town.center), p = llv(PLAN.park.at), f = frame(p, T);
  const c = f(-SPOT.x, SPOT.z);
  const ex = f(-SPOT.x - 1, SPOT.z).sub(c), ez = f(-SPOT.x, SPOT.z + 1).sub(c);
  const u = ex.projectOnPlane(c).normalize(), v = ez.projectOnPlane(c).normalize();
  const cr = Math.cos(SPOT.rot), sr = Math.sin(SPOT.rot);
  const U = u.clone().multiplyScalar(cr).addScaledVector(v, -sr), V = u.clone().multiplyScalar(sr).addScaledVector(v, cr);
  // a point at (x, z) metres along the meadow's own axes; and back
  const at = (x, z) => c.clone().multiplyScalar(R).addScaledVector(U, x).addScaledVector(V, z).normalize();
  const local = (d) => { const w = d.clone().normalize().multiplyScalar(R); return [w.dot(U), w.dot(V), d.clone().normalize().dot(c)]; };
  return { c, U, V, at, local };
}
// where the meadow is (its middle, a direction): footpaths.js sets the rose arbour there
export const meadowCentre = () => meadowFrame().c;
// the blob's edge: a wobbly ellipse; rho < 1 inside (it thins from ~0.6 out to ~1.12)
const LOBES = [[2, 0.16, 0.7], [3, 0.11, 2.1], [5, 0.07, 4.0], [7, 0.04, 1.3]];
function rhoAt(x, z) {
  const th = Math.atan2(z / SPOT.b, x / SPOT.a);
  let k = 1; for (const [n, amp, ph] of LOBES) k += amp * Math.sin(n * th + ph);
  return Math.hypot(x / SPOT.a, z / SPOT.b) / k;
}

// The meadow's ground goes into the reservation map once the town is built: it's ground cover,
// not a building, so the lawn's trees already standing there stay (the flowers grow round them)
// and the roads keep their line; anything placed after (and ?audit) keeps off it.
// ── lean geometry, in a plant's own frame (y up from its root) ──
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
function stem(h, r, bend, ang, seg = 3) {
  const pts = []; for (let i = 0; i <= 3; i++) { const t = i / 3; pts.push(V3(Math.sin(ang) * bend * t * t, h * t, Math.cos(ang) * bend * t * t)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 4, false);
}
const stemTop = (h, bend, ang) => V3(Math.sin(ang) * bend, h, Math.cos(ang) * bend);
function leaf(len, wid, ang, tilt, y = 0, thick = 0.01) {
  const g = new THREE.SphereGeometry(1, 5, 4).scale(wid, len / 2, thick).translate(0, len / 2, 0);
  g.rotateX(tilt); g.rotateY(ang); g.translate(0, y, 0); return g;
}
function lathe(pts, seg) { return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg); }
const _ico0 = new THREE.IcosahedronGeometry(1, 0), _ico1 = new THREE.IcosahedronGeometry(1, 1);
const ball = (r, p, sy = 1, hi = false) => (hi ? _ico1 : _ico0).clone().scale(r, r * sy, r).translate(p.x, p.y, p.z);
// a flower head as one closed lens whose rim is scalloped into n petals (the ink draws them):
// cup lifts the rim, depth cuts between petals, sharp > 1 makes pointed petals (cornflower)
function head(n, rad, { cup = 0.2, depth = 0.45, sharp = 0.7, thick = 0.008, per = 4, tilt = 0.25 } = {}) {
  const K = n * per, pos = [0, thick, 0, 0, -thick, 0], idx = [];
  for (let i = 0; i < K; i++) {
    const th = i / K * Math.PI * 2, lobe = Math.pow(Math.abs(Math.cos(th * n / 2)), sharp);
    const r = rad * (1 - depth + depth * lobe);
    pos.push(Math.cos(th) * r, cup * rad * (r / rad) ** 2, Math.sin(th) * r);
  }
  for (let i = 0; i < K; i++) { const a = 2 + i, b = 2 + (i + 1) % K; idx.push(0, b, a, 1, a, b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals(); g.rotateX(tilt);
  return g;
}
function grassBlade(len, wid, ang, arch) {
  const pos = [], idx = [], N = 4;
  for (let i = 0; i <= N; i++) {
    const t = i / N, w = wid * (1 - t * 0.92), out = arch * t * t * len, up = len * (t - 0.35 * arch * t * t);
    pos.push(-w / 2, up, out, w / 2, up, out);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals(); g.rotateY(ang); return g;
}
const at = (g, p, tilt = 0.25) => g.rotateX(tilt).translate(p.x, p.y, p.z);

// ── colours (the plants.js paint box, plus a few wildflower ones) ──
const W = { ...C, poppy: 0xe2493a, poppyO: 0xf08a3c, corn: 0x5a72d8, cornD: 0x34408a, butter: 0xf4cf3e, dark: 0x3a2a30,
  salviaB: 0x6a5fd0, salviaR: 0xd8507a, clover: 0x5f9450, cloverW: 0xf1ead8, cloverP: 0xe2a2c4 };

// ── the plants: each pushes (colour, geometry) through out(); s = size, col = its drift's colour ──
const KINDS = {
  tulip(R, out, s, col) {
    const h = (0.3 + R() * 0.12) * s, ang = R() * 6, top = stemTop(h, 0.03 * s, ang);
    out(W.stem, stem(h, 0.011 * s, 0.03 * s, ang));
    out(col, lathe([[0.001, 0], [0.04, 0.012], [0.054, 0.05], [0.046, 0.092], [0.03, 0.108], [0.001, 0.07]].map(([x, y]) => [x * s, y * s]), 6).translate(top.x, top.y - 0.01 * s, top.z));
    out(W.leaf, leaf(0.2 * s, 0.035 * s, ang + 1.2, 0.35));
    if (R() > 0.65) out(W.leafD, leaf(0.17 * s, 0.03 * s, ang + 4.1, 0.45));
  },
  daisy(R, out, s, col) {
    const h = (0.18 + R() * 0.1) * s, ang = R() * 6, top = stemTop(h, 0.03 * s, ang);
    out(W.stem, stem(h, 0.008 * s, 0.03 * s, ang));
    out(col, at(head(11, 0.06 * s, { cup: 0.12, depth: 0.5, sharp: 0.5, per: 3 }), top));
    out(W.centre, ball(0.02 * s, V3(top.x, top.y + 0.012 * s, top.z), 0.6));
    out(W.leaf, leaf(0.1 * s, 0.03 * s, ang + 2, 0.9));
  },
  poppy(R, out, s, col) {
    const h = (0.4 + R() * 0.16) * s, ang = R() * 6, top = stemTop(h, 0.06 * s, ang);
    out(W.stem, stem(h, 0.008 * s, 0.06 * s, ang));
    out(col, at(head(4, 0.07 * s, { cup: 0.55, depth: 0.28, sharp: 0.6, per: 6, thick: 0.01 }), top, 0.3));
    out(W.dark, ball(0.018 * s, V3(top.x, top.y + 0.02 * s, top.z), 0.7));
    out(W.leafL, leaf(0.12 * s, 0.025 * s, ang + 2.4, 0.8));
  },
  cosmos(R, out, s, col) {
    const h = (0.45 + R() * 0.16) * s, ang = R() * 6, top = stemTop(h, 0.07 * s, ang);
    out(W.stem, stem(h, 0.008 * s, 0.07 * s, ang));
    out(col, at(head(8, 0.075 * s, { cup: 0.2, depth: 0.38, sharp: 0.55, per: 4 }), top, 0.35));
    out(W.centre, ball(0.02 * s, V3(top.x, top.y + 0.012 * s, top.z), 0.6));
    out(W.leafL, leaf(0.12 * s, 0.018 * s, ang + 1, 0.7, h * 0.35));
  },
  cornflower(R, out, s, col) {
    const h = (0.26 + R() * 0.12) * s, ang = R() * 6, top = stemTop(h, 0.04 * s, ang);
    out(W.stem, stem(h, 0.007 * s, 0.04 * s, ang));
    out(col, at(head(9, 0.045 * s, { cup: 0.45, depth: 0.55, sharp: 2.2, per: 3, thick: 0.012 }), top, 0.2));
    out(W.cornD, ball(0.014 * s, V3(top.x, top.y + 0.014 * s, top.z), 0.8));
    out(W.leafL, leaf(0.11 * s, 0.014 * s, ang + 2.2, 0.6));
  },
  buttercup(R, out, s, col) {
    for (let i = 0; i < 2; i++) {
      const h = (0.13 + R() * 0.08) * s, ang = R() * 6, top = stemTop(h, 0.05 * s, ang);
      out(W.stem, stem(h, 0.006 * s, 0.05 * s, ang));
      out(col, at(head(5, 0.03 * s, { cup: 0.7, depth: 0.2, sharp: 0.6, per: 4, thick: 0.008 }), top, 0.15));
    }
    out(W.leaf, leaf(0.07 * s, 0.035 * s, R() * 6, 1.15, 0.005));
  },
  spikes(R, out, s, col) {
    const n = R() < 0.35 ? 3 : 2;
    for (let i = 0; i < 2; i++) out(i ? W.leaf : W.leafD, leaf(0.11 * s, 0.028 * s, i * 2.6 + R(), 0.85));
    for (let i = 0; i < n; i++) {
      const ang = i / n * 6.28 + R() * 0.6, lean = (0.04 + R() * 0.06) * s, h = (0.3 + R() * 0.14) * s;
      out(W.stem, stem(h * 0.62, 0.006 * s, lean * 0.4, ang));
      // the flowering spike: a bumpy taper (whorls of little florets), leaning with the stem
      const pr = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pr.push([(0.001 + (0.024 - 0.016 * t) * (k % 2 ? 1 : 0.6) * (k === 0 || k === 6 ? 0.2 : 1)) * s, h * (0.55 + 0.45 * t)]); }
      const g = lathe(pr, 5), base = stemTop(h * 0.62, lean * 0.4, ang);
      g.translate(0, -h * 0.55, 0); g.rotateX(Math.cos(ang) * lean / h * 1.2); g.rotateZ(-Math.sin(ang) * lean / h * 1.2);
      out(col, g.translate(base.x, base.y - 0.01 * s, base.z));
    }
  },
  grass(R, out, s, col) {
    const n = 5 + Math.floor(R() * 4);
    for (let i = 0; i < n; i++) out(R() > 0.4 ? col : W.grassG, grassBlade((0.26 + R() * 0.2) * s, 0.028 * s, R() * 6.28, 0.5 + R() * 0.55));
  },
  clover(R, out, s, col) {
    for (let k = 0; k < 2; k++) {
      // a trefoil on its own little stalk, its leaflets held just off the lawn
      const a = R() * 6, d = 0.03 * s, cx = Math.sin(a) * d, cz = Math.cos(a) * d, y = (0.03 + R() * 0.02) * s;
      out(W.stem, stem(y, 0.004 * s, d, a, 2));
      for (let j = 0; j < 3; j++) {
        const b = j * 2.09 + R() * 0.3;
        out(W.clover, new THREE.SphereGeometry(1, 5, 3).scale(0.022 * s, 0.006 * s, 0.022 * s).translate(Math.sin(b) * 0.02 * s + cx, y, Math.cos(b) * 0.02 * s + cz));
      }
    }
    if (col !== W.clover) { const h = (0.08 + R() * 0.04) * s, ang = R() * 6, top = stemTop(h, 0.02 * s, ang); out(W.stem, stem(h, 0.005 * s, 0.02 * s, ang, 2)); out(col, ball(0.022 * s, top, 0.9, true)); }
  },
  leafy(R, out, s) {
    const n = 3 + Math.floor(R() * 2), a0 = R() * 6;
    for (let i = 0; i < n; i++) out(i % 2 ? W.leaf : W.leafD, leaf((0.15 + R() * 0.07) * s, (0.05 + R() * 0.02) * s, a0 + i * 6.28 / n + R() * 0.4, 0.75 + R() * 0.3));
  },
};
// how hard each kind nods in the breeze at its top, and its height (for the weight curve)
const SWAY = { tulip: [0.05, 0.42], daisy: [0.045, 0.3], poppy: [0.08, 0.55], cosmos: [0.08, 0.6], cornflower: [0.06, 0.38],
  buttercup: [0.04, 0.2], spikes: [0.06, 0.45], grass: [0.09, 0.42], clover: [0.01, 0.12], leafy: [0.02, 0.2] };
// how stiff each kind is (a higher number springs back faster)
const STIFF = { tulip: 1.0, daisy: 1.15, poppy: 0.85, cosmos: 0.8, cornflower: 1.0, buttercup: 1.25, spikes: 0.95, grass: 0.9, clover: 1.4, leafy: 1.2 };

// the drifts: kind + colour(s), and how likely a clump of each is
const DRIFTS = [
  [6, 'tulip', [W.red]], [3, 'tulip', [W.yellow]], [3, 'tulip', [W.pink, W.white]], [2, 'tulip', [W.coral, W.purple]],
  [6, 'daisy', [W.white]], [2, 'daisy', [W.pink, W.white]],
  [5, 'poppy', [W.poppy]], [2, 'poppy', [W.poppyO, W.poppy]],
  [4, 'cosmos', [W.magenta, W.pink, W.white]],
  [4, 'cornflower', [W.corn]], [4, 'buttercup', [W.butter]],
  [4, 'spikes', [W.lav]], [2, 'spikes', [W.salviaB]], [2, 'spikes', [W.salviaR]],
  [3, 'grass', [W.grass]], [2, 'clover', [W.cloverW, W.cloverP]],
];
const pickW = (R, list) => { let t = R() * list.reduce((a, e) => a + e[0], 0); for (const e of list) if ((t -= e[0]) <= 0) return e; return list[0]; };

// ── the shader: breeze + stomp, shared by the fill and the ink ──
const FOOT_R = 0.68;                                 // how far round her feet the flowers go down
const NT = 24;                                       // trail points (0–1 live, the rest a ring)
const U = {
  uTrailP: { value: Array.from({ length: NT }, () => new THREE.Vector4(0, 0, 0, 0)) },   // xyz on the ground, w radius (0: unused)
  uTrailT: { value: new Float32Array(NT) },          // when she was there
  uNow: { value: 0 }, uLive: { value: 0 },
  uHeading: { value: new THREE.Vector3(1, 0, 0) },
};
const STOMP = BREEZE + /* glsl */`
  attribute vec4 aRoot;
  uniform vec4 uTrailP[${NT}];
  uniform float uTrailT[${NT}];
  uniform float uNow, uLive;
  uniform vec3 uHeading;
  // how flat a plant is, age seconds after a foot came down by it: held a beat, then a spring
  // back up that overshoots and wobbles out (stiff = this plant's own spring)
  float stompSpring(float age, float stiff) {
    float a = age - 0.22;
    if (a < 0.0) return 1.0;
    a *= stiff;
    if (a > 1.4) return 0.0;
    return exp(-a * 4.4) * cos(a * 10.0);
  }
  // bend p (and its normal) about the plant's root: over, away from whatever stepped nearest
  vec3 stomp(vec3 p, inout vec3 n) {
    if (uLive < 0.5) return p;
    vec3 root = aRoot.xyz, up = normalize(root);
    float s = 0.0; vec3 dir = uHeading;
    for (int i = 0; i < ${NT}; i++) {
      vec4 P = uTrailP[i];
      if (P.w <= 0.0) continue;
      vec3 dv = root - P.xyz; dv -= up * dot(dv, up);
      float d = length(dv);
      float f = 1.0 - smoothstep(P.w * 0.42, P.w, d);
      if (f <= 0.0) continue;
      float v = f * stompSpring(uNow - uTrailT[i], aRoot.w);
      if (abs(v) > abs(s)) { s = v; dir = d > 1e-3 ? dv / d : uHeading; }
    }
    if (abs(s) < 1e-3) return p;
    vec3 ax = normalize(cross(up, dir));
    float ang = s * 1.42, c = cos(ang), sn = sin(ang);
    vec3 v = p - root;
    v = v * c + cross(ax, v) * sn + ax * dot(ax, v) * (1.0 - c);
    n = n * c + cross(ax, n) * sn + ax * dot(ax, n) * (1.0 - c);
    v -= up * dot(v, up) * 0.22 * max(s, 0.0);               // squashed a little, too
    float h = dot(v, up), fl = 0.006 + 0.01 * fract(dot(root, vec3(7.1, 3.3, 5.7)));
    if (h < fl) v += up * (fl - h);                         // pressed onto the ground, never into it
    return root + v;
  }`;

let _fill = null, _ink = null;
function fillMat() {
  if (_fill) return _fill;
  const m = paint(0xffffff, { vertexColors: true, unique: true, soft: true });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    Object.assign(sh.uniforms, U, { uTime: inkUniforms.uTime });
    sh.vertexShader = STOMP + '\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  vec3 _stompP = stomp(position, objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = _stompP + breeze(_stompP) * clamp(1.0 - length(_stompP - position) * 4.0, 0.0, 1.0);');
  };
  m.customProgramCacheKey = () => 'meadow' + (m.userData.hatch > 0 ? 'h' : '');
  return (_fill = m);
}
function inkMat() {
  if (_ink) return _ink;
  return (_ink = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { ...inkUniforms, ...U, uWeight: { value: 0.62 }, uColor: { value: new THREE.Color(0x2a2230) } },
    vertexShader: STOMP + /* glsl */`
      uniform float uWidth, uWeight; uniform vec2 uRes;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      void main() {
        vec3 nrm = normal;
        vec3 sp = stomp(position, nrm);
        vec3 pos = sp + breeze(sp) * clamp(1.0 - length(sp - position) * 4.0, 0.0, 1.0);
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        vec3 nv = normalize(normalMatrix * nrm);
        vec2 n2 = normalize((projectionMatrix * vec4(nv, 0.0)).xy + 1e-5);
        float tick = floor(uTime * 4.0);
        float along = h(floor(position * 2.5) + 0.37);
        float boil = h(position * 7.0 + tick) - 0.5;
        float w = uWidth * uWeight * (0.8 + 0.45 * along + 0.12 * boil);
        clip.xy += n2 * w * 2.0 / uRes * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  }));
}

// ── "stomp!": hand-lettered pops by her feet (the bump bubbles' layer and lettering) ──
function stompLayer() {
  if (!document.getElementById('stompCss')) {
    const st = document.createElement('style'); st.id = 'stompCss';
    st.textContent = `.stomp { position: absolute; left: 0; top: 0; white-space: nowrap; pointer-events: none; font-family: 'Caveat', cursive; font-weight: 700;
      font-size: 34px; line-height: 1; color: var(--accent, #e8604c); letter-spacing: .01em; will-change: transform, opacity;
      text-shadow: 2px 2px 0 var(--paper, #f6efdf), -2px 2px 0 var(--paper, #f6efdf), 2px -2px 0 var(--paper, #f6efdf), -2px -2px 0 var(--paper, #f6efdf), 0 3px 0 rgba(42,34,48,.85); }`;
    document.head.appendChild(st);
  }
  let el = document.getElementById('bubbles');
  if (!el) { el = document.createElement('div'); el.id = 'bubbles'; document.body.appendChild(el); }
  return el;
}
// a soft rustle: a short breath of low-passed noise (no tone, nothing ringing)
let _noise = null;
function rustle(vol = 0.05) {
  const a = sfxOut(); if (!a) return;
  const { ac, out } = a, t = ac.currentTime;
  if (!_noise) { const n = ac.sampleRate * 0.4; _noise = ac.createBuffer(1, n, ac.sampleRate); const ch = _noise.getChannelData(0); let b = 0; for (let i = 0; i < n; i++) { b = b * 0.6 + (Math.random() * 2 - 1) * 0.4; ch[i] = b; } }
  const src = ac.createBufferSource(); src.buffer = _noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.4;
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out); src.start(t, Math.random() * 0.05); src.stop(t + 0.34);
}

// ── build ──
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _UP = V3(0, 1, 0), _one = V3(1, 1, 1), _col = new THREE.Color();
export function createMeadow({ scene, town, player, camera, seed = 11 }) {
  const F = meadowFrame(), Rn = rng(seed * 7919 + 3);
  reserve(F.c, SPOT.reserveR, 'meadow');
  const solids = (town.colliders || []).filter((c) => arc(c.dir, F.c) < 12);
  const ok = (d, r) => !decoBlocked(d, r) && !isWater(d, -0.05) && !LOTS.some((f) => f(d))
    && !zoneHit(d, r, (z) => z.key === 'meadow') && !solids.some((c) => arc(d, c.dir) < c.r + r + 0.12)
    && !town.footpaths?.on(d, r + 0.1);                     // (the flowers part round the cobbled trail: footpaths.js)
  // drift centres inside the blob
  const clumps = [];
  for (let tries = 0; clumps.length < 28 && tries < 400; tries++) {
    const x = (Rn() * 2 - 1) * SPOT.a, z = (Rn() * 2 - 1) * SPOT.b;
    if (rhoAt(x, z) > 0.92) continue;
    const [, kind, cols] = clumps.length < DRIFTS.length ? DRIFTS[clumps.length] : pickW(Rn, DRIFTS);   // every drift once, then by liking
    clumps.push({ x, z, r: 0.45 + Rn() * 0.6, kind, cols });
  }
  // the plants: a jittered grid, kept by the edge's thinning; each joins a nearby drift or fills
  const plants = [], STEP = 0.2;
  for (let x = -SPOT.a * 1.2; x <= SPOT.a * 1.2; x += STEP) for (let z = -SPOT.b * 1.2; z <= SPOT.b * 1.2; z += STEP) {
    const px = x + (Rn() - 0.5) * STEP * 0.9, pz = z + (Rn() - 0.5) * STEP * 0.9, rho = rhoAt(px, pz);
    const keep = 1 - THREE.MathUtils.smoothstep(rho, 0.55, 1.12);
    if (Rn() > keep * 0.62) continue;                       // (a touch denser than it was: the trail and the arbour's terrace take its middle)
    let best = null, bw = 0;
    for (const c of clumps) { const d = Math.hypot(px - c.x, pz - c.z) / c.r; if (d < 1.25) { const w = (1.25 - d) * (0.6 + Rn()); if (w > bw) { bw = w; best = c; } } }
    let kind, col;
    if (best && Rn() < 0.82) { kind = best.kind; col = best.cols[Math.floor(Rn() * best.cols.length)]; }
    else {                                                     // the lawn between drifts
      const f = Rn();
      if (f < 0.42) { kind = 'grass'; col = W.grass; } else if (f < 0.6) { kind = 'clover'; col = Rn() < 0.6 ? W.clover : W.cloverW; }
      else if (f < 0.74) { kind = 'leafy'; col = W.leaf; } else if (f < 0.9) { kind = 'daisy'; col = W.white; } else { kind = 'buttercup'; col = W.butter; }
    }
    const d = F.at(px, pz), foot = { grass: 0.12, leafy: 0.12, clover: 0.08 }[kind] ?? 0.08;
    if (!ok(d, foot)) continue;
    const edge = THREE.MathUtils.smoothstep(rho, 0.7, 1.1);
    plants.push({ d, kind, col, s: (0.95 + Rn() * 0.3) * (1 - 0.25 * edge) });
  }
  // grow them: every plant on the drawn ground, standing up along it, merged into one mesh
  const parts = [];
  for (const p of plants) {
    const gr = drawnGroundAt(p.d), base = p.d.clone().multiplyScalar(gr - 0.008);
    _q.setFromUnitVectors(_UP, p.d); _q2.setFromAxisAngle(_UP, Rn() * 6.28);
    _m.compose(base, _q.clone().multiply(_q2), _one);
    const [top, H] = SWAY[p.kind], s = p.s, stiff = (STIFF[p.kind] ?? 1) * (0.85 + Rn() * 0.3);
    const pr = rng(Math.floor(Rn() * 2147483000) + 1);
    const tint = 0.93 + Rn() * 0.12;
    KINDS[p.kind](pr, (hex, g) => {
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      if (!g.index) { const n = g.attributes.position.count; g.setIndex([...Array(n).keys()]); }
      const pos = g.attributes.position, n = pos.count;
      const sw = new Float32Array(n), cl = new Float32Array(n * 3), rt = new Float32Array(n * 4);
      _col.setHex(hex).multiplyScalar(tint);
      for (let i = 0; i < n; i++) {
        const t = Math.max(0, pos.getY(i)) / (H * s);
        sw[i] = top * Math.min(1.4, t * t * 1.2 + t * 0.2);
        cl[i * 3] = _col.r; cl[i * 3 + 1] = _col.g; cl[i * 3 + 2] = _col.b;
        rt[i * 4] = base.x; rt[i * 4 + 1] = base.y; rt[i * 4 + 2] = base.z; rt[i * 4 + 3] = stiff;
      }
      g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
      g.setAttribute('aRoot', new THREE.BufferAttribute(rt, 4));
      g.applyMatrix4(_m);
      parts.push(g);
    }, s, p.col);
  }
  const geo = mergeGeometries(parts, false);
  geo.computeBoundingSphere(); geo.computeBoundingBox();
  geo.boundingSphere.radius += 0.6;                        // (room for a nod in the breeze)
  const root = new THREE.Group(); root.name = 'meadow';
  const fill = new THREE.Mesh(geo, fillMat()); fill.userData.noInk = true; fill.raycast = () => {};
  const line = new THREE.Mesh(geo, inkMat()); line.userData.isInk = true; line.renderOrder = -1; line.raycast = () => {};
  root.add(fill, line);
  scene.add(root);

  // ── the trail, and the "stomp!" words ──
  const P = U.uTrailP.value, T = U.uTrailT.value;
  let ring = 2, last = null, lastCar = null, wordT = 0, rustleT = 0, now = 0;
  const layer = stompLayer(), words = [], pool = [];
  const _g = new THREE.Vector3(), _v = new THREE.Vector3(), _f = new THREE.Vector3();
  const onGround = (d, out) => out.copy(d).multiplyScalar(drawnGroundAt(d));
  const push = (pt, r) => { P[ring].set(pt.x, pt.y, pt.z, r); T[ring] = now; ring = ring + 1 >= NT ? 2 : ring + 1; };
  const inMeadow = (d, pad = 0) => { if (arc(d, F.c) > SPOT.b * 1.4 + pad) return false; const [x, z] = F.local(d); return rhoAt(x, z) < 1.05 + pad * 0.3; };
  function word(d) {
    const el = pool.pop() || layer.appendChild(Object.assign(document.createElement('div'), { className: 'stomp' }));
    el.textContent = Math.random() < 0.82 ? 'stomp!' : (Math.random() < 0.5 ? 'stomp stomp!' : 'STOMP!');
    el.style.opacity = '0';
    const side = new THREE.Vector3().crossVectors(d, player.st.heading).normalize();
    words.push({ el, at: onGround(d, new THREE.Vector3()).addScaledVector(side, (Math.random() - 0.5) * 0.9).addScaledVector(player.st.heading, 0.35), t: 0, rot: (Math.random() - 0.5) * 22, dx: (Math.random() - 0.5) * 30 });
  }
  function update(dt) {
    now += dt; U.uNow.value = now;                       // (game time, from dt: a slow frame slows the spring with her)
    const st = player.st, near = arc(st.dir, F.c) < SPOT.b * 2.2 + 4;
    if (!near) { if (U.uLive.value) { U.uLive.value = 0; for (const p of P) p.w = 0; } }
    else {
      U.uLive.value = 1;
      if (st.heading) U.uHeading.value.copy(st.heading);
      const car = st.mode === 'jeep', boat = st.mode === 'boat';
      const d = car ? player.root.position.clone().normalize() : st.dir;
      onGround(d, _g);
      if (boat) { P[0].w = P[1].w = 0; }
      else if (car) {                                       // the car: a wide swathe, front and back wheels
        const hd = st.heading;
        P[0].set(_g.x + hd.x * 0.95, _g.y + hd.y * 0.95, _g.z + hd.z * 0.95, 1.05); T[0] = now;
        P[1].set(_g.x - hd.x * 0.95, _g.y - hd.y * 0.95, _g.z - hd.z * 0.95, 1.05); T[1] = now;
        if (!lastCar || lastCar.distanceTo(_g) > 0.55) { push(_g, 1.25); lastCar = _g.clone(); }
        last = null;
      } else {
        P[0].set(_g.x, _g.y, _g.z, FOOT_R); T[0] = now; P[1].w = 0;
        if (!last || last.distanceTo(_g) > 0.26) { push(_g, FOOT_R); last = _g.clone(); }
        lastCar = null;
      }
      // running through the flowers: a "stomp!" now and then, and a rustle underfoot
      const sp = Math.abs(st.speed || 0), inside = !boat && inMeadow(d);
      wordT -= dt; rustleT -= dt;
      if (inside && st.mode === 'walk' && sp > 3.9 && wordT <= 0) { word(d); rustle(0.07); wordT = 0.55 + Math.random() * 0.2; rustleT = 0.3; }
      else if (inside && sp > 1.2 && rustleT <= 0) { rustle(car ? 0.06 : 0.035); rustleT = car ? 0.25 : 0.42; }
    }
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i]; w.t += dt;
      if (w.t > 0.85) { w.el.style.opacity = '0'; pool.push(w.el); words.splice(i, 1); continue; }
      const up = _f.copy(w.at).normalize();
      _v.copy(w.at).addScaledVector(up, 0.2 + w.t * 0.75).project(camera);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      const k = w.t / 0.85;
      const pop = w.t < 0.12 ? 0.3 + w.t / 0.12 * 1.0 : w.t < 0.24 ? 1.3 - (w.t - 0.12) / 0.12 * 0.38 : 0.92 + 0.08 * Math.min(1, (w.t - 0.24) / 0.1);
      w.el.style.opacity = vis ? String(Math.min(1, w.t * 14, (0.85 - w.t) / 0.3)) : '0';
      w.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * innerWidth + w.dx * k).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%, -100%) rotate(${(w.rot + Math.sin(w.t * 16) * 4).toFixed(1)}deg) scale(${pop.toFixed(3)})`;
    }
  }
  const stats = { plants: plants.length, tris: geo.index.count / 3, verts: geo.attributes.position.count };
  return { root, update, plants, stats, frame: F, rhoAt, inMeadow, uniforms: U, time: () => now };
}
