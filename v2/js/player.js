// ─── THE PLAYER: the critic, on foot or at the wheel ────────────────────────
// Movement is eased (accelerate, glide, settle), turning is smoothed, and the
// camera trails on a spring and leads where you're heading — the "feel" layer
// most adventure games live or die by. On foot, controls are camera-relative;
// in the jeep, they're throttle + steer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { R, radiusAt, isWater, arc } from './world.js';
import { PAL, paint, ink, blobShadow } from './style.js';
import { rbox, lathe } from './props.js';
import { restyle } from './town.js';

const UP = new THREE.Vector3(0, 1, 0);
const MODES = {
  walk: { max: 4.2, accel: 9, turn: 10, camD: 7.2, camH: 3.4, look: 1.0, radius: 0.35 },
  jeep: { max: 11, accel: 6, turn: 2.4, camD: 10.5, camH: 4.6, look: 1.2, radius: 0.8 },
};

// ── the jeep: soft, rounded, ink-lined — a toy you'd want to drive ──
function buildJeep() {
  const g = new THREE.Group();
  const body = paint(PAL.accent), dark = paint(PAL.ink, { hatch: 0 }), cream = paint(PAL.kerb);
  const m = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  m(rbox(1.5, 0.55, 2.4, 0.22, 3), body, 0, 0.62, 0);                    // tub
  m(rbox(1.36, 0.22, 0.9, 0.1, 2), body, 0, 0.98, 0.72);                  // bonnet
  m(rbox(1.3, 0.08, 0.6, 0.04), paint(0xcfe6ea, { opacity: 0.7, hatch: 0 }), 0, 1.22, 0.28).rotation.x = -0.5;
  for (const s of [-1, 1]) {
    m(lathe([[0.001, 0], [0.12, 0], [0.12, 0.04], [0.001, 0.05]], 14), paint(0xfff1c8, { emissive: 0xffe2a0, hatch: 0 }), s * 0.45, 0.78, 1.21).rotation.x = Math.PI / 2;
    m(rbox(0.1, 0.52, 0.1, 0.04), dark, s * 0.6, 1.25, -0.42);           // roll bar posts
  }
  m(rbox(1.3, 0.1, 0.1, 0.04), dark, 0, 1.52, -0.42);
  for (const s of [-1, 1]) m(rbox(0.5, 0.4, 0.5, 0.12), cream, s * 0.36, 1.0, -0.1);   // seats
  m(rbox(1.5, 0.14, 0.14, 0.06), cream, 0, 0.38, 1.24);                  // bumpers
  m(rbox(1.5, 0.14, 0.14, 0.06), cream, 0, 0.38, -1.24);
  const tyre = lathe([[0.18, -0.12], [0.33, -0.12], [0.36, -0.06], [0.36, 0.06], [0.33, 0.12], [0.18, 0.12]], 18);
  tyre.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-0.78, 0.78], [0.78, 0.78], [-0.78, -0.8], [0.78, -0.8]]) {
    const w = m(tyre, dark, x, 0.36, z);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 12).rotateZ(Math.PI / 2), cream);
    w.add(hub); wheels.push(w);
  }
  const spare = m(tyre, dark, 0, 0.8, -1.35); spare.rotation.y = Math.PI / 2;
  g.add(blobShadow(1.0, 1.5));
  g.userData.wheels = wheels;
  return ink(g, 'mid');
}

// ── the procedural walk (the baked clip was broken; see the original game) ──
const WALK = { cadence: 6.2, legFwd: 0.5, knee: 0.85, arm: 0.4, elbowBase: 0.35, elbowSwing: 0.15, armOut: 0.18, hipRoll: 0.05, torsoTwist: 0.06 };
const WALK_BONES = ['hips', 'spine1', 'upperlegL', 'lowerlegL', 'upperlegR', 'lowerlegR', 'upperarmL', 'lowerarmL', 'upperarmR', 'lowerarmR'];
const _gq = new THREE.Quaternion(), _gax = new THREE.Vector3();
function procWalk(inst, dt, k) {
  const pb = inst.bones, bq = inst.bind; if (!pb.hips) return;
  inst.wc = (inst.wc || 0) + dt * WALK.cadence * (0.4 + 0.9 * k);
  const s = Math.sin(inst.wc), sO = Math.sin(inst.wc + Math.PI);
  for (const nm of WALK_BONES) if (pb[nm]) pb[nm].quaternion.copy(bq[nm]);
  const rot = (n, ax, a) => { const b = pb[n]; if (!b || !a) return; _gax.set(...ax); _gq.setFromAxisAngle(_gax, a); b.quaternion.multiply(_gq); };
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  rot('upperlegL', X, -WALK.legFwd * s * k); rot('upperlegR', X, -WALK.legFwd * sO * k);
  rot('lowerlegL', X, WALK.knee * Math.max(0, sO) * k); rot('lowerlegR', X, WALK.knee * Math.max(0, s) * k);
  rot('upperarmL', X, WALK.arm * sO * k); rot('upperarmR', X, WALK.arm * s * k);
  rot('upperarmL', Z, -WALK.armOut); rot('upperarmR', Z, WALK.armOut);
  rot('lowerarmL', X, -(WALK.elbowBase + WALK.elbowSwing * k)); rot('lowerarmR', X, -(WALK.elbowBase + WALK.elbowSwing * k));
  rot('hips', Z, WALK.hipRoll * s * k); rot('spine1', Y, WALK.torsoTwist * s * k);
}

export function createPlayer(scene, camera, colliders, startDir, startToward) {
  const root = new THREE.Group();            // positioned on the planet each frame
  const squash = new THREE.Group();          // squash & stretch lives here
  root.add(squash);
  scene.add(root);
  const bodies = { walk: new THREE.Group(), jeep: buildJeep() };
  for (const b of Object.values(bodies)) { squash.add(b); b.visible = false; }
  const critic = { bones: {}, bind: {}, ready: false };
  // a simple stand-in until the model streams in (never visible for long)
  const stub = new THREE.Group();
  stub.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.7, 4, 10), paint(PAL.lilac)).translateY(0.6));
  ink(stub, 'fine'); bodies.walk.add(stub); bodies.walk.add(blobShadow(0.38));
  new GLTFLoader().load('../models/critic.glb', (glb) => {
    const rig = skeletonClone(glb.scene);
    restyle(rig);
    rig.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    ink(rig, 'fine');
    rig.scale.setScalar(0.13);
    rig.position.y = 4.593 * 0.13;
    rig.rotation.y = -Math.PI / 2;           // model faces +X → turn to +Z
    rig.traverse(o => { if (o.isBone) { const k = o.name.replace(/\./g, ''); critic.bones[k] = o; critic.bind[k] = o.quaternion.clone(); } });
    stub.removeFromParent();
    bodies.walk.add(rig);
    // the critic also rides in the jeep
    const rider = skeletonClone(glb.scene);
    restyle(rider); ink(rider, 'fine');
    rider.scale.setScalar(0.11); rider.rotation.y = -Math.PI / 2;
    rider.position.set(0.32, 0.9, -0.1);
    bodies.jeep.add(rider);
    critic.ready = true;
  });

  const st = {
    mode: 'walk', dir: startDir.clone(), heading: null, speed: 0, steer: 0,
    camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), camYaw: 0, camDodge: 0, camPitch: 0, camInit: false,
    keys: new Set(), enabled: true, squashK: 0,
  };
  st.heading = startToward.clone().sub(st.dir.clone().multiplyScalar(st.dir.dot(startToward))).normalize();
  bodies.walk.visible = true;

  addEventListener('keydown', e => st.keys.add(e.code));
  addEventListener('keyup', e => st.keys.delete(e.code));
  addEventListener('blur', () => st.keys.clear());
  // drag to look around (orbit the camera about the player)
  {
    let drag = false, lx = 0, ly = 0;
    addEventListener('pointerdown', e => { if (e.target.tagName === 'CANVAS') { drag = true; lx = e.clientX; ly = e.clientY; } });
    addEventListener('pointerup', () => { drag = false; });
    addEventListener('pointermove', e => {
      if (!drag) return;
      st.camYaw -= (e.clientX - lx) * 0.006; st.camPitch = Math.max(-0.25, Math.min(0.9, st.camPitch + (e.clientY - ly) * 0.004));
      lx = e.clientX; ly = e.clientY;
    });
  }
  const key = (...c) => c.some(k => st.keys.has(k));
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4();

  function setMode(m) {
    st.mode = m;
    for (const [k, b] of Object.entries(bodies)) b.visible = k === m;
    st.speed *= 0.3;
  }

  function update(dt, t) {
    const M = MODES[st.mode];
    const up = st.dir;
    // camera basis projected on the ground plane
    _f.copy(st.camLook).sub(camera.position); _f.sub(up.clone().multiplyScalar(_f.dot(up)));
    if (_f.lengthSq() < 1e-6) _f.copy(st.heading);
    _f.normalize();
    _r.crossVectors(_f, up).normalize();
    let target = 0;
    if (st.enabled) {
      if (st.mode === 'walk') {
        const ix = (key('KeyD', 'ArrowRight') ? 1 : 0) - (key('KeyA', 'ArrowLeft') ? 1 : 0);
        const iy = (key('KeyW', 'ArrowUp') ? 1 : 0) - (key('KeyS', 'ArrowDown') ? 1 : 0);
        if (ix || iy) {
          _w.copy(_f).multiplyScalar(iy).addScaledVector(_r, ix).normalize();
          // turn smoothly toward the input direction
          st.heading.lerp(_w, 1 - Math.exp(-M.turn * dt)).normalize();
          target = M.max * (key('ShiftLeft', 'ShiftRight') ? 1.6 : 1);
        }
      } else {
        const thr = (key('KeyW', 'ArrowUp') ? 1 : 0) - (key('KeyS', 'ArrowDown') ? 0.6 : 0);
        const steer = (key('KeyD', 'ArrowRight') ? 1 : 0) - (key('KeyA', 'ArrowLeft') ? 1 : 0);
        target = thr * M.max;
        st.steer += (steer - st.steer) * (1 - Math.exp(-8 * dt));
        const turnRate = M.turn * st.steer * Math.min(1, Math.abs(st.speed) / 3) * Math.sign(st.speed || 1);
        st.heading.applyAxisAngle(up, -turnRate * dt);
      }
    }
    const prevSpeed = st.speed;
    st.speed += (target - st.speed) * (1 - Math.exp(-(target ? M.accel : M.accel * 1.4) * dt / Math.max(1, M.max / 4)));
    if (Math.abs(st.speed) < 0.02 && !target) st.speed = 0;
    // move along the great circle
    const step = st.speed * dt;
    if (step) {
      const nd = st.dir.clone().multiplyScalar(R).addScaledVector(st.heading, step).normalize();
      if (!isWater(nd, 0.1)) {
        st.dir.copy(nd);
      } else st.speed *= 0.3;
      // collide: slide out of every footprint
      for (const c of colliders) {
        const a = arc(st.dir, c.dir), lim = c.r + M.radius;
        if (a >= lim || a < 1e-5) continue;
        const perp = st.dir.clone().sub(c.dir.clone().multiplyScalar(c.dir.dot(st.dir))).normalize();
        const w = lim / R;
        st.dir.copy(c.dir).multiplyScalar(Math.cos(w)).addScaledVector(perp, Math.sin(w)).normalize();
        st.speed *= 0.92;
      }
      // the jeep is long: its nose collides too
      if (st.mode === 'jeep') for (const c of colliders) {
        const nose = st.dir.clone().multiplyScalar(R).addScaledVector(st.heading, 0.9).normalize();
        const a = arc(nose, c.dir), lim = c.r + 0.55;
        if (a >= lim || a < 1e-5) continue;
        const push = c.dir.clone().sub(nose).projectOnPlane(st.dir).normalize().multiplyScalar(-(lim - a));
        st.dir.multiplyScalar(R).add(push).normalize();
        st.speed *= 0.5;
      }
    }
    st.heading.sub(st.dir.clone().multiplyScalar(st.heading.dot(st.dir))).normalize();
    // place + orient
    const gr = radiusAt(st.dir);
    root.position.copy(st.dir).multiplyScalar(gr);
    _r.crossVectors(st.heading, st.dir).normalize();
    _m.makeBasis(_r.negate(), st.dir, st.heading);
    root.quaternion.setFromRotationMatrix(_m);
    // squash on acceleration, a tiny bob while walking
    const acc = (st.speed - prevSpeed) / Math.max(dt, 1e-3);
    st.squashK += (THREE.MathUtils.clamp(acc / 30, -0.12, 0.12) - st.squashK) * (1 - Math.exp(-10 * dt));
    const bob = st.mode === 'walk' ? Math.abs(Math.sin((critic.wc || 0))) * 0.05 * Math.min(1, st.speed / 3) : 0;
    squash.scale.set(1 + st.squashK * 0.5, 1 - st.squashK, 1 + st.squashK * 0.5);
    squash.position.y = bob;
    if (st.mode === 'walk' && critic.ready) procWalk(critic, dt, Math.min(1, st.speed / M.max));
    if (st.mode === 'jeep') for (const w of bodies.jeep.userData.wheels) w.rotation.x += st.speed * dt / 0.36;
    // ── camera: a spring that trails behind and leads into the turn ──
    // it never looks through a building: if the line from your head is blocked,
    // it swings round to the nearest clear angle, and only pulls in as a last resort
    const lead = Math.min(1, Math.abs(st.speed) / M.max);
    const head = root.position.clone().addScaledVector(up, M.look);
    const camAt = (yaw) => root.position.clone()
      .addScaledVector(st.heading.clone().applyAxisAngle(up, yaw), -M.camD * (1 + st.camPitch * 0.2))
      .addScaledVector(up, M.camH + st.camPitch * 5);
    const near = colliders.filter(c => c.r >= 0.5 && arc(st.dir, c.dir) < c.r + M.camD + 2);
    const reach = (w) => {
      for (let i = 1; i <= 10; i++) {
        const p = head.clone().lerp(w, i / 10).normalize();
        if (near.some(c => arc(p, c.dir) < c.r + 0.4)) return (i - 1.5) / 10;
      }
      return 1;
    };
    let best = null;
    for (const o of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.9, -1.9, 2.5, -2.5, Math.PI]) {
      const r = reach(camAt(st.camYaw + st.camDodge + o));
      if (r >= 1) { best = o; break; }
    }
    if (best !== null) st.camDodge += best * (1 - Math.exp(-4 * dt));
    else st.camDodge *= Math.exp(-1 * dt);
    // drift back behind you, but only while the way back is clear too
    if (best === 0 && st.camDodge && reach(camAt(st.camYaw + st.camDodge * 0.8)) >= 1) st.camDodge *= Math.exp(-0.6 * dt);
    const want = camAt(st.camYaw + st.camDodge);
    const f = reach(want);
    if (f >= 0.4 && f < 1) want.copy(head).lerp(want, f).addScaledVector(up, (1 - f) * 1.2);
    else if (f < 0.4) {
      // boxed in: rise up and look down over your shoulder rather than into your head
      const back = want.clone().sub(head).projectOnPlane(up).setLength(M.camD * 0.3);
      want.copy(head).add(back).addScaledVector(up, M.camD * 0.9);
    }
    const look = root.position.clone().addScaledVector(up, M.look).addScaledVector(st.heading, 2.2 * lead);
    if (!st.camInit) { st.camPos.copy(want); st.camLook.copy(look); st.camInit = true; }
    const pullIn = want.distanceTo(head) < st.camPos.distanceTo(head) - 0.3;
    st.camPos.lerp(want, 1 - Math.exp(-(pullIn ? 10 : 3.2) * dt));
    st.camLook.lerp(look, 1 - Math.exp(-6 * dt));
    // keep the eye above ground
    const cr = st.camPos.length(), cg = radiusAt(st.camPos.clone().normalize()) + 1.2;
    if (cr < cg) st.camPos.setLength(cg);
    camera.position.copy(st.camPos);
    camera.up.copy(up);
    camera.lookAt(st.camLook);
    st.camYaw *= Math.exp(-0.6 * dt);      // the camera drifts back behind you
  }
  return { st, update, setMode, root, bodies };
}
