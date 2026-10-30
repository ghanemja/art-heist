// ─── LANTERN PARK'S LIFE: strollers round the pond, a reader on a bench ─────────
// The park (buildings.js parkGarden, placed in town.js) hands over its ring path's radius and
// its benches in its own frame (userData.park). Here:
//   • three strollers walk the gravel ring round the pond, each their own pace and way round,
//     stopping now and then to look at the water; they stop for you, the car bumps them;
//   • a woman reads on one of the benches (the seated 'reading' stance), turning the pages;
//   • a man with a coffee stands at the pond's rim, looking at the spout.
// Their own people (AGENTS.md): own build, face, hair, outfit, the critic's scale. Only drawn
// and animated while you're near.
import * as THREE from 'three';
import { arc, standAt, alignToSurface, yawToFace } from './world.js';
import { person } from './human.js';
import { poseFolk } from './folk.js';

const NEAR = 22;
const STROLLERS = [
  { id: 'mo', pitch: 160, line: 'I was COUNTING DUCKS!', start: 0.0, way: 1, speed: 0.55,
    look: { folk: true, skin: 'tan', hair: 0x2a1d17, hairStyle: 'crop', top: 0x5f8f4c, sleeve: 'short', bottom: 0xd8cab0, shoes: 0x6a4a3a,
      height: 1.04, build: 1.0, hat: 'cap', hatColor: 0xe1b95c,
      face: { shape: { jaw: 0.6, chin: 0.4, cheeks: 0.4, long: 0.2, skull: 0.5, brow: 0.55 }, nose: 'straight', noseSize: 1.05, eyes: 'round', brows: 'flat', blush: 0.25 } } },
  { id: 'bea', pitch: 390, line: 'My constitutional!', start: 0.4, way: -1, speed: 0.42,
    look: { folk: true, skin: 'rose', hair: 0xe8e2d6, hairStyle: 'bun', outfit: 'coat', top: 0xdc9e9a, accent: 0xf6eedb, bottom: 0x4a4458, shoes: 0x3a2a30,
      height: 0.92, build: 0.92, glasses: true,
      face: { shape: { jaw: 0.3, chin: 0.45, cheeks: 0.5, long: 0.3, skull: 0.5, brow: 0.4 }, nose: 'roman', noseSize: 1.0, eyes: 'round', brows: 'raised', glasses: true, blush: 0.6 } } },
  { id: 'rafi', pitch: 230, line: 'I was ON A RUN!', start: 0.7, way: 1, speed: 0.75,
    look: { folk: true, skin: 'deep', hair: 0x1d1716, hairStyle: 'curls', top: 0xe8604c, sleeve: 'short', bottom: 0x2f3f55, shoes: 0xf1ece0,
      height: 1.0, build: 0.9,
      face: { shape: { jaw: 0.45, chin: 0.5, cheeks: 0.45, long: 0.1, skull: 0.5, brow: 0.45 }, nose: 'round', noseSize: 1.0, eyes: 'round', brows: 'flat', hair: 'curls', blush: 0.3 } } },
];
const READER = { skin: 'olive', hair: 0x6a3b22, hairStyle: 'bob', outfit: 'cardigan', top: 0x8f7ae8, accent: 0xf6eedb, bottom: 0x3e6b52, shoes: 0x6e2a2e,
  height: 0.96, build: 0.95, stance: 'reading', folk: true,
  face: { shape: { jaw: 0.3, chin: 0.5, cheeks: 0.45, long: 0.15, skull: 0.5, brow: 0.4 }, nose: 'snub', noseSize: 0.95, eyes: 'round', brows: 'raised', lashes: true, hair: 'bob', blush: 0.5 } };
const SIPPER = { skin: 'rose', hair: 0x8a5a3a, hairStyle: 'crop', beard: true, top: 0x3f5872, outfit: 'coat', accent: 0xd8cab0, bottom: 0x5a5048, shoes: 0x3a2a30,
  height: 1.06, build: 1.05, belly: 0.3, stance: 'coffee', folk: true,
  face: { shape: { jaw: 0.65, chin: 0.35, cheeks: 0.4, long: 0.25, skull: 0.55, brow: 0.6 }, nose: 'straight', noseSize: 1.1, eyes: 'round', brows: 'flat', blush: 0.2 } };

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
  // the reader, on the first bench (her hips on its seat), facing the pond
  {
    const b = P.benches[0], obj = person(READER);
    const d = L(b.x - Math.sin(b.a) * 0.06, b.z - Math.cos(b.a) * 0.06);
    obj.position.copy(d).multiplyScalar(standAt(d) + 0.17);
    alignToSurface(obj, d, yawToFace(d, L(0, 0)));
    scene.add(obj);
    people.push({ obj, dir: d, still: true });
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
        if (s.still) { if (h) poseFolk(h, dt, 0); continue; }
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
