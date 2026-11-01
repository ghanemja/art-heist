// ─── THE CONSTABLE AT THE MUSEUM'S OPEN DOOR ─────────────────────────────────
// Players walked past the great bronze doors thinking they were shut. Now one leaf
// stands open (museum.js, `openDoor`) and a young constable keeps the door: on the top
// step beside it, thumb in his belt, glancing about. When you come up he turns to you,
// waves you in with his free hand, and a hand-drawn bubble over him says you can go in.
// He isn't one of the case's people (no talk, no clues): E here is the door's prompt.
import * as THREE from 'three';
import { person, pose } from './human.js';
import { gripHand } from './folk.js';
import { arc } from './world.js';

// his own person: a lanky, eager young constable — a long freckled face, ginger crop under
// the peaked cap, raised brows and a big helpful grin (not the room's two officers, not Otto)
export const DOOR_COP = {
  folk: true, skin: 'fair', hair: 0xb5652f, hairStyle: 'crop', hat: 'cap', hatColor: 0x1f2a44, stance: 'door',
  top: 0x2c3a5a, outfit: 'uniform', bottom: 0x1e2433, shoes: 0x161416, sole: 0x4a4246, height: 1.04, build: 0.92,
  face: { shape: { jaw: 0.4, chin: 0.75, cheeks: 0.3, long: 0.5, skull: 0.5, brow: 0.45 }, nose: 'straight', noseSize: 1.0, mouth: 'grin',
    eyes: 'round', eyeSize: 1.05, brows: 'raised', browW: 1.0, browColor: 0x9a4a22, hair: 'crop', blush: 1.0, blushColor: 0xe0907a },
};
const LINES = [
  'Crime scene\'s this way, detective — go on in.',
  'You can go inside. Just don\'t touch anything!',
];
// where he stands, museum-local: on the top step, west of the doorway (the open leaf's side),
// between the door surround and the first column — clear of the door, Vivi and the E spot
const SPOT = new THREE.Vector3(-1.2, 0.66, -3.28);
const YAW = 0.28;                     // turned a little in toward the forecourt's middle
const NEAR = 7.0, FAR = 7.6;          // the bubble: on inside NEAR, off past FAR

export function createDoorCop({ scene, town, game, player, camera, rooms }) {
  const mus = town.museum.group; mus.updateMatrixWorld(true);
  const obj = person(DOOR_COP);
  obj.position.copy(mus.localToWorld(SPOT.clone()));
  obj.quaternion.copy(mus.getWorldQuaternion(new THREE.Quaternion())).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), YAW));
  obj.visible = false;                // not in the cold open's night shots: he comes on with the day's play
  scene.add(obj);
  const dir = obj.position.clone().normalize();
  town.solid(dir, 0.35, true);
  const inst = obj.userData.human, J = inst.J, turnG = obj.userData.turn;

  // the bubble, in the bump/bystander bubbles' layer (hand-drawn paper, index.html .bub.cop)
  let layer = document.getElementById('bubbles');
  if (!layer) { layer = document.createElement('div'); layer.id = 'bubbles'; document.body.appendChild(layer); }
  const el = document.createElement('div');
  el.className = 'bub sk cop'; el.setAttribute('role', 'status'); el.style.opacity = '0';
  layer.appendChild(el);
  let on = false, line = 0, lineT = 0, wave = 0, op = 0;
  const say = (i) => { el.textContent = LINES[i % LINES.length]; };
  say(0);

  const _p = new THREE.Vector3(), _l = new THREE.Vector3(), _up = new THREE.Vector3();
  const lerp = THREE.MathUtils.lerp;
  function update(dt) {
    const G = game.G, st = G.state;
    obj.visible = st === 'play' || st === 'epilogue';
    const inside = !!(rooms?.inside || G.room);
    if (!obj.visible || inside) { op = 0; el.style.opacity = '0'; on = false; return; }
    const d = arc(player.st.dir, dir);
    const free = st === 'play' && !G.ui && !game.phone.busy && player.st.mode === 'walk';
    const want = free && (on ? d < FAR : d < NEAR);
    if (want && !on) { line = (line + 1) % LINES.length; say(line); lineT = 0; }
    on = want;
    if (on) { lineT += dt; if (lineT > 5.5) { lineT = 0; line = (line + 1) % LINES.length; say(line); } }
    // ── his idle life (breathing, weight shift, glances: poseFolk), then turn to you and wave you in ──
    pose(inst, dt, 0, { talk: 0 });
    wave += ((on ? 1 : 0) - wave) * (1 - Math.exp(-3 * dt));
    const l = obj.worldToLocal(_l.copy(player.root.position));
    const toYou = Math.atan2(l.x, l.z);
    const target = on ? THREE.MathUtils.clamp(toYou, -0.7, 0.7) : 0.12 * Math.sin(inst.t * 0.17);
    let dd = target - turnG.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
    turnG.rotation.y += dd * (1 - Math.exp(-3 * dt));
    if (J.neck) J.neck.rotation.y = 0;
    if (wave > 0.01) {
      const w = wave, t = inst.t;
      // head on you (what the body didn't turn)
      const rest = THREE.MathUtils.clamp(toYou - turnG.rotation.y, -0.8, 0.8);
      if (J.neck) J.neck.rotation.y = rest * 0.25 * w;
      J.head.rotation.y = lerp(J.head.rotation.y, rest * 0.75, w);
      J.head.rotation.x = lerp(J.head.rotation.x, -0.05, w);
      // the free hand (his R joint, on the doorway's side): out toward the door, elbow soft, palm
      // open and turned up, in a "this way, in you go" sweep every couple of seconds
      const sweep = Math.pow(Math.max(0, Math.sin(t * 2.2)), 2);
      const fwd = 0.55 - 0.3 * sweep, out = 0.62 + 0.18 * sweep, bend = 0.95 - 0.45 * sweep;
      J.armR.rotation.set(lerp(J.armR.rotation.x, -fwd, w), lerp(J.armR.rotation.y, -0.2, w), lerp(J.armR.rotation.z, out + inst.armOut, w));
      J.foreR.rotation.set(lerp(J.foreR.rotation.x, -bend, w), 0, 0);
      J.handR.rotation.set(lerp(J.handR.rotation.x, -0.25, w), 0, 0);
      gripHand(J.gripR, lerp(0.35, 0.08, w));
      J.head.rotation.y += w * sweep * 0.35;
    }
    // ── the bubble, over his head ──
    op += ((on ? 1 : 0) - op) * (1 - Math.exp(-8 * dt));
    _up.copy(obj.position).normalize();
    _p.copy(obj.position).addScaledVector(_up, 1.42).project(camera);
    const vis = _p.z < 1 && Math.abs(_p.x) < 1.05 && Math.abs(_p.y) < 1.05;
    el.style.opacity = vis ? op.toFixed(3) : '0';
    if (op > 0.01 && vis) {
      // kept on screen (a phone is narrow): the bubble slides in from the edge, its tail still on him
      const x = (_p.x * 0.5 + 0.5) * innerWidth, half = (el.offsetWidth || 200) / 2;
      const cx = Math.min(Math.max(x, half + 8), innerWidth - half - 8);
      el.style.setProperty('--tail', `${Math.max(-half + 20, Math.min(half - 20, x - cx)).toFixed(1)}px`);
      el.style.transform = `translate(${cx.toFixed(1)}px, ${((-_p.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%, calc(-100% - 14px)) rotate(${(-1.5 + Math.sin(lineT * 1.7) * 0.6).toFixed(2)}deg)`;
    }
  }
  return { obj, el, update, dir };
}
