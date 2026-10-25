// ─── PEOPLE: the critic's rig (the player), plus the townsfolk (folk.js) ───
// critic.glb is built from flat colour materials (beret, hair, skin, sweater,
// jeans, shoe, sole), so one rig, re-coloured, gives the whole cast at the
// right human scale. Poses are written in the MODEL's axes (+X forward,
// +Y up, +Z to the right) and converted per bone at load, so a "swing forward"
// is a swing forward whatever way each bone happens to be rolled.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { paint, ink, blobShadow } from './style.js';
import { makeFolk, poseFolk } from './folk.js';

export const HUMAN_SCALE = 0.13;           // ≈1.2 units tall
const FOOT = 4.593;                        // model units from the origin down to the soles

let _glb = null;
export function loadHuman() {
  if (!_glb) _glb = new Promise((res, rej) => new GLTFLoader().load('../models/critic.glb', (g) => { fixColors(g.scene); res(g); }, undefined, rej));
  return _glb;
}

// critic.glb authoring bug (fixed the same way in the original game): the hands
// are baked into the JEANS mesh (so they render blue) and the nape hair into the
// SWEATER mesh (grey). Repaint just the verts those bones drive with the right
// colour as vertex colours; clones share the geometry, so this runs once.
const REPAINT = { jeans: { bones: ['handL', 'handR'], to: 'skin' }, sweater: { bones: ['head'], to: 'hair' } };
function fixColors(root) {
  const colOf = {};
  root.traverse(o => { if (o.material?.name) colOf[o.material.name] = o.material.color; });
  root.traverse(o => {
    if (!o.isSkinnedMesh) return;
    const rule = REPAINT[o.material.name], tgt = rule && colOf[rule.to];
    const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!tgt || !si) return;
    const pick = new Set();
    o.skeleton.bones.forEach((b, i) => { if (rule.bones.includes(b.name.replace(/\./g, ''))) pick.add(i); });
    // the model already carries baked vertex colours (COLOR_0); keep them, and
    // fold the material colour in so these two meshes can drop it (absolute colours)
    const n = g.attributes.position.count, col = new Float32Array(n * 3), bc = o.material.color, old = g.attributes.color;
    for (let v = 0; v < n; v++) {
      let w = 0; for (let k = 0; k < 4; k++) if (pick.has(si.getComponent(v, k))) w += sw.getComponent(v, k);
      const c = w > 0.5 ? tgt : bc;
      const f = (i) => old ? old.getComponent(v, i) : 1;
      col[v * 3] = c.r * f(0); col[v * 3 + 1] = c.g * f(1); col[v * 3 + 2] = c.b * f(2);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.userData.absColor = true;
  });
}

// the critic keeps her own colours; everyone else is their own person (folk.js)
export const LOOKS = {
  critic: {},
  vivi: { folk: true, skin: 'olive', hair: 0x2b1d1a, hairStyle: 'bun', glasses: true, stance: 'writing', top: 0x8e2f3a, outfit: 'coat', accent: 0xf3ead7,
    bottom: 0x2a2230, shoes: 0x6e2a2e, height: 1.05, build: 0.94,
    // the director: an oval face, worried brows, a tight anxious mouth, lashes, glasses, a sleek bun with a centre part
    face: { shape: { jaw: 0.25, chin: 0.45, cheeks: 0.25, long: 0.35, skull: 0.5, brow: 0.35 }, nose: 'straight', noseSize: 0.85, mouth: 'worried',
      eyes: 'round', brows: 'worried', browW: 0.8, lashes: true, glasses: true, hair: 'bun', blush: 0.7 } },
  otto: { folk: true, skin: 'rose', hair: 0x9a9490, hairStyle: 'crop', hat: 'cap', hatColor: 0x24304a, stance: 'torch', top: 0x3a4a68, outfit: 'uniform',
    bottom: 0x262c3c, shoes: 0x1e1a1c, sole: 0x6a5e54, height: 0.98, build: 1.16, belly: 0.8,
    // the night guard: a round, jowly face, heavy-lidded sleepy eyes, bushy grey brows, a big button nose, ruddy cheeks
    face: { shape: { jaw: 0.85, chin: 0.3, cheeks: 0.95, long: -0.25, skull: 0.4, brow: 0.6 }, nose: 'button', noseSize: 1.35, mouth: 'flat',
      eyes: 'sleepy', brows: 'heavy', browW: 1.6, browColor: 0x9a9490, hair: 'sides', blush: 1.3, blushColor: 0xe0806e } },
  pia: { folk: true, skin: 'brown', hair: 0x1d1a1a, hairStyle: 'pony', hat: 'helmet', hatColor: 0xe0b445, stance: 'coffee', top: 0x3f8f88, sleeve: 'short',
    outfit: 'vest', accent: 0xd6e04c, bottom: 0x3b4a5e, shoes: 0xe9e2d0, height: 0.95, build: 0.9,
    // the courier: a heart-shaped face, bright eyes, raised brows, a snub nose and a big grin
    face: { shape: { jaw: 0.15, chin: 0.6, cheeks: 0.6, long: 0.0, skull: 0.55, brow: 0.4 }, nose: 'snub', noseSize: 0.95, mouth: 'grin',
      eyes: 'round', eyeSize: 1.1, brows: 'raised', lashes: true, hair: 'pony', blush: 0.8, blushColor: 0xc86a5a } },
  rex: { folk: true, skin: 'fair', hair: 0x7a4a2a, hairStyle: 'crop', beard: true, stance: 'crossed', hat: 'flat', hatColor: 0x5b4636, top: 0x6f8a6a,
    outfit: 'apron', accent: 0xd8c9a8, bottom: 0x4a3a2c, height: 1.02, build: 1.08, belly: 0.4,
    // the framer (and suspect): a square jaw, a Roman nose, narrowed eyes, one brow up, a smirk in a trimmed beard
    face: { shape: { jaw: 1.0, chin: 0.85, cheeks: 0.35, long: 0.15, skull: 0.6, brow: 0.85 }, nose: 'roman', noseSize: 1.0, mouth: 'smirk',
      eyes: 'narrow', browsL: 'frown', browsR: 'raised', browW: 1.3, hair: 'crop', beard: true, blush: 0 } },
};

const AX = { fwd: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), side: new THREE.Vector3(0, 0, 1) };
const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion();

// build one person from the loaded glb: re-coloured, toon-painted, inked
export function makeHuman(glb, look = {}) {
  const rig = skeletonClone(glb.scene);
  rig.traverse(o => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material, name = m.name;
    o.material = o.geometry.userData.absColor ? paint(0xffffff, { vertexColors: true })
      : paint(look[name] ?? m.color.getHex(), { vertexColors: !!o.geometry.attributes.color });
  });
  ink(rig, 'fine');
  const s = HUMAN_SCALE * (look.height ?? 1);
  rig.scale.set(s * (look.width ?? 1), s, s * (look.width ?? 1));
  rig.position.y = FOOT * s;
  rig.rotation.y = -Math.PI / 2;            // the model faces +X → turn it to +Z
  // each bone's bind rotation relative to the rig root, to convert model-space turns
  const inst = { rig, bones: {}, bind: {}, bw: {}, wc: Math.random() * 6, t: Math.random() * 10 };
  let root = null; rig.traverse(o => { if (o.name === 'CriticRig') root = o; });
  root = root || rig;
  root.updateWorldMatrix(true, true);
  // (decompose, not setFromRotationMatrix: the world matrices carry the 0.13 scale)
  const _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const worldQ = (o) => { const q = new THREE.Quaternion(); o.matrixWorld.decompose(_p, q, _s); return q; };
  const rootInv = worldQ(root).invert();
  rig.traverse(o => {
    if (!o.isBone) return;
    const k = o.name.replace(/\./g, '');
    inst.bones[k] = o; inst.bind[k] = o.quaternion.clone();
    inst.bw[k] = rootInv.clone().multiply(worldQ(o));
  });
  return inst;
}

// turn bone `n` by angle `a` about a MODEL axis, through its own joint
function turn(inst, n, axis, a) {
  const b = inst.bones[n]; if (!b || !a) return;
  const bw = inst.bw[n];
  _qa.setFromAxisAngle(axis, a);
  _q.copy(bw).invert().multiply(_qa).multiply(bw);     // Bw⁻¹ · Q · Bw
  b.quaternion.multiply(_q);
}

const BONES = ['hips', 'spine1', 'spine2', 'neck', 'head', 'upperlegL', 'lowerlegL', 'upperlegR', 'lowerlegR',
  'upperarmL', 'lowerarmL', 'upperarmR', 'lowerarmR', 'footL', 'footR'];

// k: 0 standing … 1 full walk. talk: 0…1 a little hand gesture while speaking
export function pose(inst, dt, k, { talk = 0, run = 0 } = {}) {
  if (inst.kind === 'folk') return poseFolk(inst, dt, k, { talk });
  if (!inst.bones.hips) return 0;
  inst.t += dt;
  inst.wc += dt * (5.6 + 2.4 * run) * (0.35 + 0.9 * k);
  const s = Math.sin(inst.wc), c = Math.cos(inst.wc);
  for (const n of BONES) if (inst.bones[n]) inst.bones[n].quaternion.copy(inst.bind[n]);
  const { fwd, up, side } = AX;
  const leg = (0.48 + 0.18 * run) * k, arm = (0.42 + 0.2 * run) * k;
  // legs swing forward/back about the side axis; the knee folds on the way through
  turn(inst, 'upperlegL', side, leg * s);
  turn(inst, 'upperlegR', side, -leg * s);
  turn(inst, 'lowerlegL', side, -(0.9 + 0.3 * run) * k * Math.max(0, -c));
  turn(inst, 'lowerlegR', side, -(0.9 + 0.3 * run) * k * Math.max(0, c));
  turn(inst, 'footL', side, 0.25 * k * Math.max(0, c));
  turn(inst, 'footR', side, 0.25 * k * Math.max(0, -c));
  // arms counter-swing, elbows soft and a touch forward, hands in from the hips
  turn(inst, 'upperarmL', side, -arm * s);
  turn(inst, 'upperarmR', side, arm * s);
  turn(inst, 'lowerarmL', side, 0.22 + 0.25 * k + 0.1 * run);
  turn(inst, 'lowerarmR', side, 0.22 + 0.25 * k + 0.1 * run);
  turn(inst, 'upperarmL', fwd, -0.07);
  turn(inst, 'upperarmR', fwd, 0.07);
  // the body: hips twist with the stride, shoulders against them; a lean when running
  turn(inst, 'hips', up, 0.09 * s * k);
  turn(inst, 'spine2', up, -0.12 * s * k);
  turn(inst, 'spine1', side, -0.12 * run * k);
  // standing: breathe, shift weight, glance about
  const idle = 1 - k, t = inst.t;
  turn(inst, 'spine2', side, idle * 0.02 * Math.sin(t * 1.9));
  turn(inst, 'hips', fwd, idle * 0.03 * Math.sin(t * 0.45));
  turn(inst, 'head', up, idle * 0.22 * Math.sin(t * 0.37) * Math.max(0, Math.sin(t * 0.21)));
  // talking: the right hand comes up and turns over with the words
  if (talk) {
    turn(inst, 'upperarmR', side, talk * (0.55 + 0.12 * Math.sin(t * 3.1)));
    turn(inst, 'lowerarmR', side, talk * (0.9 + 0.2 * Math.sin(t * 4.3)));
    turn(inst, 'head', side, talk * 0.06 * Math.sin(t * 2.7));
  }
  // a step's bob: lowest as the feet pass
  return Math.abs(c) * 0.035 * k;
}

// a person standing somewhere: returns a group now, fills in when the rig loads
export function person(look) {
  const g = new THREE.Group();
  const turnG = new THREE.Group(); g.add(turnG);
  g.add(blobShadow(0.3));
  g.userData.turn = turnG;
  if (look.folk) {
    const inst = makeFolk(look);
    turnG.add(inst.rig);
    g.userData.human = inst;
    return g;
  }
  loadHuman().then(glb => {
    const inst = makeHuman(glb, look);
    turnG.add(inst.rig);
    g.userData.human = inst;
  });
  return g;
}

// sitting (the jeep's driver): thighs forward, shins down, hands on the wheel
export function sit(inst) {
  if (!inst.bones.hips) return;
  for (const n of BONES) if (inst.bones[n]) inst.bones[n].quaternion.copy(inst.bind[n]);
  const { fwd, side } = AX;
  for (const n of ['upperlegL', 'upperlegR']) turn(inst, n, side, 1.45);
  for (const n of ['lowerlegL', 'lowerlegR']) turn(inst, n, side, -1.35);
  for (const n of ['upperarmL', 'upperarmR']) turn(inst, n, side, 0.75);
  for (const n of ['lowerarmL', 'lowerarmR']) turn(inst, n, side, 0.6);
  turn(inst, 'upperarmL', fwd, 0.12); turn(inst, 'upperarmR', fwd, -0.12);
}
