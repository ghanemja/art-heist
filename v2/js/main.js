// ─── THE VANISHING GALLERY (v2) — bootstrap + loop ──────────────────────────
import * as THREE from 'three';
import { buildPlanet, buildSky, buildLights, buildClouds, ROADS, ZONES } from './world.js';
import { styleTick } from './style.js';
import { planTown, buildTown } from './town.js';
import { createPlayer } from './player.js';
import { createGame } from './game.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
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

const mf = town.museum.frame;
const player = createPlayer(scene, camera, town.colliders, mf(0.8, 3.4), mf(0, -6));
const game = createGame({ scene, camera, town, player, atmosphere, renderer });
window.__v2 = { scene, camera, renderer, town, player, game, ROADS, ZONES };

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (atm.dur > 0) {
    atm.t = Math.min(1, atm.t + dt / atm.dur);
    atm.k = atm.from + (atm.to - atm.from) * atm.t * atm.t * (3 - 2 * atm.t);
    applyAtmosphere(atm.k);
    if (atm.t >= 1) atm.dur = 0;
  }
  town.museum.tick(t, 1 - atm.k);
  if (!game.update(dt, t)) player.update(dt, t);
  for (const c of clouds.children) c.rotateY(c.userData.spin * dt);
  sky.position.copy(camera.position); sky.material.uniforms.upv.value.copy(camera.up);
  styleTick(t, renderer.domElement.width, renderer.domElement.height);
  renderer.render(scene, camera);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
applyAtmosphere(0);
loop();
