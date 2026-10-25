// ─── PEOPLE: everyone in town is drawn from the same rigged body ────────────
// critic.glb is built from flat colour materials (beret, hair, skin, sweater,
// jeans, shoe, sole), so one rig, re-coloured, gives the whole cast at the
// right human scale. Poses are written in the MODEL's axes (+X forward,
// +Y up, +Z to the right) and converted per bone at load, so a "swing forward"
// is a swing forward whatever way each bone happens to be rolled.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { paint, ink, blobShadow } from './style.js';

export const HUMAN_SCALE = 0.13;           // ≈1.2 units tall
const FOOT = 4.593;                        // model units from the origin down to the soles

let _glb = null;
export function loadHuman() {
  if (!_glb) _glb = new Promise((res, rej) => new GLTFLoader().load('../models/critic.glb', res, undefined, rej));
  return _glb;
}

// colours by material name; anything left out keeps the critic's own
export const LOOKS = {
  critic: {},
  vivi: { hair: 0x2b1d1a, beret: 0x2b1d1a, skin: 0xc68b62, sweater: 0xb8443a, jeans: 0x3a3340, shoe: 0x2a2230, height: 1.03 },
  otto: { hair: 0x9a9490, beret: 0x24304a, skin: 0xe6c3a5, sweater: 0x33435f, jeans: 0x2a3040, width: 1.12 },
  pia: { hair: 0x1d1a1a, beret: 0xe0b445, skin: 0x8d5a3b, sweater: 0x3f8f88, jeans: 0x3b4a5e, sole: 0xe0b445, height: 0.96 },
  rex: { hair: 0x7a4a2a, beret: 0x5b4636, skin: 0xe0b48e, sweater: 0xc9953a, jeans: 0x5a4636, width: 1.06 },
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
    o.material = paint(look[name] ?? m.color.getHex(), { hatch: 1 });
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
