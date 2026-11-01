// ─── THE VANISHING GALLERY (v2) — bootstrap + loop ──────────────────────────
import * as THREE from 'three';
import { R, buildPlanet, buildSky, buildLights, buildClouds, ROADS, ZONES, JUNCTIONS, registerGround, standAt, groundAt, isWater, nearestRoad, paintRoadMarkings, buildRoadSurface, LAMPS, collectLamps } from './world.js';
import { styleTick, gpuOnly, bakeScenery } from './style.js';
import { planTown, buildTown } from './town.js';
import { createPlayer } from './player.js';
import { createGame } from './game.js';
import { createCitizens } from './citizens.js';
import { createCuller, lodPrepare } from './cull.js';
import { createPlaza } from './plaza.js';
import { createPark } from './park.js';
import { createShopInteriors, shopDoorway } from './shopinterior.js';
import { createRooms, ROOM_STYLES } from './rooms.js';
import { createCarParks, layLotsOnSheet } from './carparks.js';
import { createTelescope } from './overlook.js';
import { createNorthLife } from './north.js';
import { createMeadow } from './meadow.js';
import { buildFootpaths } from './footpaths.js';
import { createDoorCop } from './doorcop.js';
import { createMinimap } from './minimap.js';
import { audio } from './audio.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
// phones: fewer pixels, cooler GPU. That's the most it draws at: a machine that can't keep up is
// given fewer (adaptive resolution, in the loop below); ?dpr=<n> pins it (screenshots, comparisons)
const DPR_PIN = +new URLSearchParams(location.search).get('dpr') || 0;
const DPR_MAX = DPR_PIN || Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 1.75);
const DPR_MIN = DPR_PIN || Math.min(DPR_MAX, Math.max(0.8, DPR_MAX * 0.6));
renderer.setPixelRatio(DPR_MAX);
const res = { dpr: DPR_MAX, ft: [], calm: 0, last: performance.now() };   // (the adaptive resolution's state: see adaptRes)
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;          // gouache: colours as painted
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 900);

planTown();                       // reservations + levelled ground first
buildPlanet(scene);
const sky = buildSky(scene);
const lights = buildLights(scene);
const clouds = buildClouds(scene);
const town = buildTown(scene);
buildRoadSurface(scene);          // every road is laid: draw the network as one sheet (kerb returns at every junction)
layLotsOnSheet(town);             // the shops' car-park markings down onto that asphalt as drawn
buildFootpaths(scene, town);      // Lantern Park's cobbles out to the kerbs and through the meadow to the rose arbour (needs the sheet)
collectLamps([scene, ...town.shops.map(sp => sp.root)]);   // every lamp's spot, before the props are baked (the shops' own are in their frames)
// the town's loose props (trees, lamps, benches, planters…), each baked down in place to a fill
// and a hull — before anything reads the ground, so the walk rays index the baked meshes
bakeScenery(scene, new Set(scene.children));

// ── atmosphere: day ↔ night, eased (the cold open is set at night) ──
const DAY = { top: 0xbcd3dc, mid: 0xf2e6cf, low: 0xf6d9bf, hemi: 0xfff6e8, hemiI: 1.35, sunI: 1.6 };
const NIGHT = { top: 0x1f2744, mid: 0x3a3858, low: 0x574766, hemi: 0x8d97c9, hemiI: 0.55, sunI: 0.12 };
const atm = { k: 0, from: 0, to: 0, t: 0, dur: 0 };
const _c = new THREE.Color();
function applyAtmosphere(k) {
  const U = sky.material.uniforms;
  for (const n of ['top', 'mid', 'low']) U[n].value.copy(_c.setHex(DAY[n])).lerp(new THREE.Color(NIGHT[n]), k);
  lights.hemi.color.setHex(DAY.hemi).lerp(new THREE.Color(NIGHT.hemi), k);
  lights.hemi.intensity = DAY.hemiI + (NIGHT.hemiI - DAY.hemiI) * k;
  lights.sun.intensity = DAY.sunI + (NIGHT.sunI - DAY.sunI) * k;
}
const atmosphere = {
  setNight(k) { atm.k = atm.to = k; atm.dur = 0; applyAtmosphere(k); },
  fadeTo(k, secs) { atm.from = atm.k; atm.to = k; atm.t = 0; atm.dur = secs; },
};

registerGround([scene]);          // everything static drawn so far is walkable ground (people come after)
paintRoadMarkings(scene);        // centre lines last: they need every road (and the drawn ground)
const mf = town.museum.frame;
const player = createPlayer(scene, camera, town.colliders, mf(0.8, 3.4), mf(0, -6));
const game = createGame({ scene, camera, town, player, atmosphere, renderer });
registerGround([scene]);          // again, now the case's props (café deck, booth…) are down too
const citizens = createCitizens({ scene, town, game, player, camera });   // bystanders, streamed in after the title is up
const plaza = createPlaza({ scene, town, game, player });                  // Maple Plaza: parked cars, shoppers in and out
const park = createPark({ scene, town, game, player });                    // Lantern Park: strollers, a reader, a coffee
const northLife = createNorthLife({ scene, town, game, player });          // the club's players, the swimmer, the golfer, the Close's neighbours
createCarParks({ scene, town });                                         // the project shops' car parks: a parked car each
// the wildflower meadow across the road from Lantern Park: run through it, the flowers squash and spring back
const meadow = createMeadow({ scene, town, player, camera });
// the project shops' living rooms: E at the front door fades you in (the shopfront lifts away)
const shopInside = createShopInteriors(scene, town.landmarks.filter((l) => l.upper && !ROOM_STYLES.has(l.style)), { player, game, colliders: town.colliders });
// YarnFlow, Borrowed Eyes and QR Compass open into whole rooms (rooms.js): E at the front door.
// The museum's front door is an E prompt on the forecourt: inside is the crime scene.
const rooms = createRooms({ scene, camera, player, game });
for (const o of [lights.hemi, lights.sun, sky]) o.layers.enable(2);       // the rooms are drawn on layer 2
for (const lm of town.landmarks.filter((l) => ROOM_STYLES.has(l.style))) {
  lm.noLift = true;                                                    // (no cutaway: you go through to the room)
  const door = shopDoorway(lm, town.colliders);                        // (the doorway is shut: only E takes you in)
  game.doors.push({ dir: door.at, r: 1.3, label: `go inside ${lm.name}`, act: () => rooms.enter({ key: lm.style, out: door.out }) });
}
const museumDoor = { dir: mf(0, -1.75), r: 1.3, label: 'go inside the museum', act: () => rooms.enter({ key: 'museum', out: () => {
  const dir = mf(0, -1.0);
  return { dir, heading: mf(0, 2).sub(dir).projectOnPlane(dir).normalize() };
} }) };
game.doors.push(museumDoor);
// the museum's open front door: a constable beside it waves you in, with a speech bubble (doorcop.js)
const doorCop = createDoorCop({ scene, town, game, player, camera, rooms });
game.doors.push({ dir: doorCop.dir, r: 1.6, label: 'go inside the museum', act: museumDoor.act });   // (E by him goes in too)
const telescope = createTelescope({ town, game, player, camera });   // the Summit Overlook's telescope: E for a look at the town
// compile every shader up front, so nothing hitches the first time it comes into view
try { renderer.compile(scene, camera); } catch { /* compiled lazily instead */ }
lodPrepare(scene);                // (the distance LOD holds on to what it needs from the arrays gpuOnly lets go)
gpuOnly(scene, renderer, camera); // the world is built: what only the GPU reads leaves the JS heap once uploaded
for (const it of game.items) if (it.kind === 'person') it.obj.position.setLength(standAt(it.obj.position.clone().normalize()));
const culler = createCuller(scene, camera, { avatar: player.root, renderer });
window.__R = R;
window.__v2 = { res, culler, rooms, scene, camera, renderer, town, player, game, citizens, plaza, park, ROADS, ZONES, JUNCTIONS, LAMPS, northLife };
window.__v2.meadow = meadow;
window.__v2.shopInside = shopInside;
// the corner mini map (and the big map behind it): where you are, and tap a place to travel there on foot
const minimap = createMinimap({ town, player, game, rooms });
window.__v2.minimap = minimap;

// ── adaptive resolution: the frame rate is what you feel. Every ~second the median frame time
// is checked; well short of 60 fps (a GPU struggling with the pixels) it draws at a lower pixel
// ratio, a step at a time down to DPR_MIN; running smoothly for a while, it steps back up.
// (Median, so a one-off hitch — a room building behind a fade — doesn't count. The distance LOD
// reads the ratio too: fewer pixels, coarser far meshes.)
function adaptRes() {
  const now = performance.now(), ms = now - res.last; res.last = now;
  if (DPR_PIN || document.hidden || ms > 250) return;              // (a background tab / a deliberate stall: not a measure)
  res.ft.push(ms); if (res.ft.length < 60) return;
  const med = res.ft.sort((a, b) => a - b)[30]; res.ft.length = 0;
  let to = res.dpr;
  if (med > 21 && res.dpr > DPR_MIN) { to = Math.max(DPR_MIN, res.dpr - 0.15); res.calm = -12; }   // (slow: down now; no stepping back up for ~12 s)
  else if (med < 17.5) { if (++res.calm >= 6 && res.dpr < DPR_MAX) { to = Math.min(DPR_MAX, res.dpr + 0.1); res.calm = 0; } }
  else res.calm = Math.min(res.calm, 0);
  if (to !== res.dpr) { res.dpr = +to.toFixed(2); renderer.setPixelRatio(res.dpr); }
}

// what the sound needs to know about where she is: what's underfoot, how near the water.
// (sampled a few times a second — the road and water lookups aren't free)
const ear = { t: 0, surface: 'grass', water: 0 };
const _eu = new THREE.Vector3(), _ea = new THREE.Vector3(), _eb = new THREE.Vector3(), _ed = new THREE.Vector3();
function listen(dt) {
  const st = player.st;
  if ((ear.t -= dt) <= 0) {
    ear.t = 0.2;
    const d = st.dir;
    if (rooms.inside) ear.surface = 'wood';
    else {
      const nr = nearestRoad(d);
      ear.surface = nr && nr.dist < nr.half + 0.15 ? 'hard' : standAt(d) > groundAt(d) + 0.03 ? 'wood' : 'grass';
    }
    // the sea (or a river, a lake): the share of a ring of points round her that's water, nearer counting more
    _eu.copy(d).normalize(); _ea.set(0, 1, 0).cross(_eu); if (_ea.lengthSq() < 1e-4) _ea.set(1, 0, 0).cross(_eu); _ea.normalize(); _eb.crossVectors(_eu, _ea);
    let wsum = 0, n = 0;
    for (const [r, k] of [[2.5, 1], [5, 0.6], [8, 0.3]]) for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + r;
      _ed.copy(_eu).addScaledVector(_ea, Math.cos(a) * r / R).addScaledVector(_eb, Math.sin(a) * r / R).normalize();
      if (isWater(_ed)) wsum += k; n += k;
    }
    ear.water = Math.min(1, 1.6 * wsum / n);
  }
  audio.tick(dt, { night: atm.k, mode: st.mode, speed: st.speed, wc: player.critic.inst?.wc, surface: ear.surface, water: ear.water, inside: rooms.inside });
}

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  adaptRes();
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (atm.dur > 0) {
    atm.t = Math.min(1, atm.t + dt / atm.dur);
    atm.k = atm.from + (atm.to - atm.from) * atm.t * atm.t * (3 - 2 * atm.t);
    applyAtmosphere(atm.k);
    if (atm.t >= 1) atm.dur = 0;
  }
  town.museum.tick(t, 1 - atm.k);
  telescope?.update(dt);
  doorCop.update(dt);
  if (!game.update(dt, t)) { if (!rooms.update(dt, t)) player.update(dt, t); }
  listen(dt);                                    // the world's sounds: footsteps, engine, birds, the sea
  town.tickShops(player.st.dir);                 // inside a project shop: its upper walls lift away
  // inside a carriage of the parked train: its roof lifts off and the camera rises to look in
  if (town.train) {
    const st = player.st, inT = st.mode === 'walk' && town.train.inside(st.dir);
    for (const r of town.train.roofs) r.visible = !inT;
    if (inT) { if (st.prePitch == null) st.prePitch = st.camPitch; st.camPitch += (0.85 - st.camPitch) * (1 - Math.exp(-3 * dt)); }
    else if (st.prePitch != null) { st.camPitch += (st.prePitch - st.camPitch) * (1 - Math.exp(-3 * dt)); if (Math.abs(st.camPitch - st.prePitch) < 0.01) st.prePitch = null; }
  }
  if (!rooms.inside) {                           // (inside a room the street isn't drawn: its crowds wait)
    citizens.update(dt);
    plaza.update(dt);
    park.update(dt);
    northLife.update(dt);
    town.farm?.update(dt, player.st.dir);          // the farm's cows and sheep amble and graze
    town.freight?.update(dt);                      // the goods train: farm produce to town and back
    shopInside.update(dt, t, player);
  }
  if (!rooms.inside) meadow.update(dt);          // the meadow's stomp trail + "stomp!" words
  minimap.update(dt);                            // (a 2D canvas, redrawn a few times a second)
  for (const c of clouds.children) c.rotateY(c.userData.spin * dt);
  sky.position.copy(camera.position); sky.material.uniforms.upv.value.copy(camera.up);
  styleTick(t, renderer.domElement.width, renderer.domElement.height);
  if (!rooms.inside) culler.update();                                // people and cars round the far side of the planet aren't drawn
  renderer.render(scene, camera);
  game.afterRender?.();                              // the phone's camera grabs the frame here
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
applyAtmosphere(0);
loop();
