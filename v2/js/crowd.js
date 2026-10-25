// ─── TOWNSFOLK OUT WALKING ──────────────────────────────────────────────────
// A few people doing their rounds of Main Street: along one pavement, across
// the road, back along the other. Each is their own person (AGENTS.md): their
// own build, face, hair and outfit, the critic's scale, shoes on the ground.
// While walking their arms swing; Sam carries a coffee from the café.
import * as THREE from 'three';
import { standAt, alignToSurface, yawToFace, arc, slerpDir } from './world.js';
import { person } from './human.js';
import { poseFolk } from './folk.js';

export const WALKERS = {
  mabel: { name: 'Mabel', pitch: 330, line: 'In MY day we drove on the ROAD.',
    look: { folk: true, skin: 'fair', hair: 0xd6d0c8, hairStyle: 'bun', outfit: 'cardigan', top: 0x9a7fb0, accent: 0xf3ead7,
      bottom: 0x55505e, shoes: 0x6a4a3a, height: 0.95, build: 1.0, belly: 0.3, glasses: true,
      // a retired teacher: a round soft face, raised grey brows, glasses, a neat grey bun
      face: { shape: { jaw: 0.5, chin: 0.35, cheeks: 0.85, long: -0.1, skull: 0.5, brow: 0.4 }, nose: 'button', noseSize: 1.05,
        eyes: 'round', brows: 'raised', browColor: 0xb8b0a8, glasses: true, hair: 'bun', blush: 1.0 } } },
  sam: { name: 'Sam', pitch: 200, line: 'My COFFEE!',
    look: { folk: true, skin: 'tan', hair: 0x2a1d17, hairStyle: 'crop', stance: 'coffee', top: 0xe1b95c, sleeve: 'long',
      bottom: 0x3f5872, shoes: 0xf1ece0, height: 1.04, build: 0.95,
      // a student: a long face, a straight nose, a big grin under a messy fringe
      face: { shape: { jaw: 0.4, chin: 0.5, cheeks: 0.3, long: 0.3, skull: 0.55, brow: 0.5 }, nose: 'straight', noseSize: 1.0,
        mouth: 'grin', eyes: 'round', brows: 'flat', hair: 'fringe', blush: 0.4 } } },
  dot: { name: 'Dot', pitch: 420, line: 'Who taught YOU to drive?!',
    look: { folk: true, skin: 'deep', hair: 0x1d1716, hairStyle: 'pony', outfit: 'dress', top: 0xdc9e9a, bottom: 0xdc9e9a,
      hat: 'beanie', hatColor: 0x7fb3a8, shoes: 0x3a2a30, height: 0.97, build: 0.92,
      // a heart-shaped face, a snub nose, bright eyes with lashes, a ponytail under a beanie
      face: { shape: { jaw: 0.2, chin: 0.55, cheeks: 0.5, long: 0.1, skull: 0.5, brow: 0.35 }, nose: 'snub', noseSize: 0.9,
        eyes: 'round', eyeSize: 1.05, brows: 'raised', lashes: true, hair: 'pony', blush: 0.6, blushColor: 0x9a4a3a } } },
};

// loops in the town frame: along a pavement, across Main Street, back along the other
const ROUTES = {
  mabel: { pts: [[2.5, 1.85], [6.7, 1.85], [6.7, -1.85], [2.5, -1.85]], at: 0.1, speed: 0.95 },
  sam: { pts: [[6.7, -1.85], [2.5, -1.85], [2.5, 1.85], [6.7, 1.85]], at: 0.55, speed: 1.25 },
  dot: { pts: [[-7.55, 1.8], [-7.55, -1.8], [-4.4, -1.8], [-4.4, 1.8]], at: 0.3, speed: 1.1 },
};

export function buildWalkers(scene, town) {
  const list = [];
  for (const [id, W] of Object.entries(WALKERS)) {
    const R = ROUTES[id];
    const pts = R.pts.map(p => town.townAt(p));
    const segs = pts.map((p, i) => arc(p, pts[(i + 1) % pts.length]));
    const len = segs.reduce((a, b) => a + b, 0);
    const obj = person(W.look);
    scene.add(obj);
    const w = { id, name: W.name, obj, pts, segs, len, s: R.at * len, speed: R.speed, dir: pts[0].clone(), paused: false };
    place(w, 0);
    list.push(w);
  }
  return list;
}
// where along its loop a walker is: the direction there, and which way it's going
function at(w, s) {
  s = ((s % w.len) + w.len) % w.len;
  for (let i = 0; i < w.segs.length; i++) {
    if (s <= w.segs[i]) {
      const a = w.pts[i], b = w.pts[(i + 1) % w.pts.length];
      return { d: slerpDir(a, b, s / w.segs[i]), next: b };
    }
    s -= w.segs[i];
  }
  return { d: w.pts[0].clone(), next: w.pts[1] };
}
function place(w, dt) {
  const { d, next } = at(w, w.s);
  w.dir.copy(d);
  w.obj.position.copy(d).multiplyScalar(standAt(d));
  alignToSurface(w.obj, d, yawToFace(d, next));
  const h = w.obj.userData.human;
  if (h) poseFolk(h, dt, 0.55);
}
// a walker's spot on the loop (where to walk back to after being knocked over)
export const walkerHome = (w) => at(w, w.s).d;
export function tickWalkers(list, dt) {
  for (const w of list) {
    if (w.paused) continue;
    w.s += w.speed * dt;
    place(w, dt);
  }
}
