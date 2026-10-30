// ─── PAINTED PORTRAITS: faces and clue sketches for the UI (no emoji) ────────
// Each person's own 3D head — same toon paint, same ink — is rendered once,
// small, in a three-quarter view, then finished on a canvas like a little
// gouache study: a wash of colour behind, a ragged brushed oval, a pencil ring.
// Clues get the same treatment from their actual props.
import * as THREE from 'three';
import { inkUniforms } from './style.js';
import { makeFolk, poseFolk, FOLK_SCALE } from './folk.js';

const SIZE = 256;
let _rt = null, _scene = null;
function stage() {
  if (_scene) return _scene;
  _scene = new THREE.Scene();
  _scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb7a9a0, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(2, 3, 2.5); _scene.add(sun);
  _rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
  _rt.texture.colorSpace = THREE.SRGBColorSpace;
  return _scene;
}

// render `obj` from `cam` into a canvas (transparent background)
function snap(renderer, obj, cam) {
  const scene = stage();
  scene.add(obj);
  const prevRes = inkUniforms.uRes.value.clone(), prevRT = renderer.getRenderTarget(), prevClear = renderer.getClearAlpha();
  inkUniforms.uRes.value.set(SIZE, SIZE);
  renderer.setRenderTarget(_rt);
  renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(_rt, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prevRT); renderer.setClearAlpha(prevClear);
  inkUniforms.uRes.value.copy(prevRes);
  scene.remove(obj);
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const c = cv.getContext('2d'), img = c.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);   // flip
  c.putImageData(img, 0, 0);
  return cv;
}

// a seeded wobble so every frame is hand-made but stable
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// finish a render as a painted study: wash, ragged oval, the figure, a pencil ring
function frame(fig, wash, seed) {
  const r = rng(seed * 97 + 13);
  const cv = document.createElement('canvas'); cv.width = cv.height = SIZE;
  const c = cv.getContext('2d');
  const blob = (rad, jit) => {
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = i / 40 * Math.PI * 2, k = rad * (1 + (r() - 0.5) * jit);
      const x = SIZE / 2 + Math.cos(a) * k, y = SIZE / 2 + Math.sin(a) * k * 1.04;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
  };
  // a few translucent layers of wash, like gouache going down
  for (let l = 0; l < 4; l++) {
    blob(SIZE * (0.47 - l * 0.02), 0.07);
    c.fillStyle = wash.replace('A', String(0.32 + l * 0.12)); c.fill();
  }
  // the figure, clipped to the oval
  c.save(); blob(SIZE * 0.46, 0.035); c.clip(); c.drawImage(fig, 0, 0); c.restore();
  // pencil ring, drawn twice and not quite closed
  c.strokeStyle = 'rgba(42,34,48,0.75)'; c.lineCap = 'round';
  for (let p = 0; p < 2; p++) {
    c.lineWidth = p ? 1.2 : 2.6; c.beginPath();
    const a0 = r() * 6.28, rad = SIZE * (0.465 + p * 0.012);
    for (let i = 0; i <= 44; i++) {
      const a = a0 + i / 44 * Math.PI * 1.94, k = rad * (1 + (r() - 0.5) * 0.02);
      const x = SIZE / 2 + Math.cos(a) * k, y = SIZE / 2 + Math.sin(a) * k * 1.04;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
  }
  return cv.toDataURL('image/png');
}

const WASH = {
  vivi: 'rgba(232,96,76,A)', otto: 'rgba(120,150,190,A)', pia: 'rgba(214,224,76,A)', rex: 'rgba(201,149,58,A)',
  editor: 'rgba(170,160,190,A)', clue: 'rgba(228,184,79,A)',
};

// people: build their own head fresh, pose it neutral, three-quarter view
export function paintPeople(renderer, looks) {
  const out = {};
  let seed = 1;
  for (const [id, look] of Object.entries(looks)) {
    if (!look.folk) continue;
    const inst = makeFolk({ ...look, stance: null });
    poseFolk(inst, 0, 0, {});
    inst.J.head.rotation.set(0.04, 0.12, 0);
    inst.rig.updateMatrixWorld(true);
    const head = inst.J.head.getWorldPosition(new THREE.Vector3());
    // frame the whole head (hair, hat) with a little shoulder, three-quarter view
    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 20);
    // (offsets drawn for a full-size folk body: they shrink with the town's scale)
    const k = FOLK_SCALE * (look.height ?? 1);
    const at = head.clone().add(new THREE.Vector3(0, 0.1 * k, 0));
    cam.position.copy(at).add(new THREE.Vector3(0.3, 0.05, 0.74).multiplyScalar(k));
    cam.lookAt(at);
    out[id] = frame(snap(renderer, inst.rig, cam), WASH[id] || WASH.clue, seed++);
  }
  return out;
}

// clues: the prop itself, fitted and seen from a little above
export function paintThings(renderer, things) {
  const out = {};
  let seed = 40;
  for (const [id, obj] of Object.entries(things)) {
    if (!obj) continue;
    const o = obj.clone(true);
    o.position.set(0, 0, 0); o.quaternion.identity(); o.scale.setScalar(1);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3();
    o.traverse(m => { if (m.isMesh && !m.userData.isInk && m.geometry) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); } });
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 200);
    const dir = new THREE.Vector3(0.75, 0.62, 1).normalize();
    cam.position.copy(sph.center).addScaledVector(dir, sph.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 0.92);
    cam.lookAt(sph.center);
    out[id] = frame(snap(renderer, o, cam), WASH.clue, seed++);
  }
  return out;
}
