// ─── THE PLAYER: the critic, on foot or at the wheel ────────────────────────
// Movement is eased (accelerate, glide, settle), turning is smoothed, and the
// camera trails on a spring and leads where you're heading — the "feel" layer
// most adventure games live or die by. On foot, controls are camera-relative;
// in the jeep, they're throttle + steer.
import * as THREE from 'three';
import { R, radiusAt, groundAt, isWater, arc } from './world.js';
import { PAL, paint, ink, blobShadow } from './style.js';
import { rbox, lathe } from './props.js';
import { loadHuman, makeHuman, pose, sit, LOOKS } from './human.js';

const UP = new THREE.Vector3(0, 1, 0);
const MODES = {
  walk: { max: 3.4, accel: 9, turn: 10, camD: 5.6, camH: 2.2, look: 0.95, radius: 0.3, follow: 0.8 },
  jeep: { max: 11, accel: 6, turn: 2.4, camD: 9.5, camH: 3.6, look: 1.2, radius: 0.8, follow: 3.0 },
};

// ── the car: a little vintage roadster. The body is its side silhouette —
// rounded deck, long bonnet, a nose, two wheel arches — extruded across its
// width with a deep bevel, so every edge is soft and the arches are real cut-outs.
function buildCar() {
  const g = new THREE.Group();
  const body = paint(0xd9573f), cream = paint(0xf1e4c6), chrome = paint(0xe6e0d2, { hatch: 0 });
  const dark = paint(0x2a2230, { hatch: 0 }), seatM = paint(0xb07a52), cab = paint(0x3b2f3a, { hatch: 0 });
  const m = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  const WR = 0.33, WZ = 0.86, AR = 0.47;                       // wheel radius, axle offset, arch radius (before bevel)
  const sh = new THREE.Shape();
  sh.moveTo(-1.28, 0.3);
  sh.quadraticCurveTo(-1.42, 0.33, -1.4, 0.56);                // rear bumper bulge
  sh.quadraticCurveTo(-1.36, 0.82, -1.02, 0.84);               // round rear deck
  sh.lineTo(0.34, 0.84);                                       // the cockpit sill
  sh.quadraticCurveTo(1.0, 0.83, 1.22, 0.7);                   // long bonnet
  sh.quadraticCurveTo(1.43, 0.62, 1.4, 0.42);                  // the nose
  sh.quadraticCurveTo(1.38, 0.3, 1.3, 0.29);
  sh.absarc(WZ, WR, AR, -0.12, Math.PI + 0.12, false);         // front arch
  sh.absarc(-WZ, WR, AR, -0.12, Math.PI + 0.12, false);        // rear arch
  sh.lineTo(-1.28, 0.3);
  const D = 1.12;
  const bodyGeo = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.1, bevelSegments: 5, curveSegments: 28 });
  bodyGeo.translate(0, 0, -D / 2).rotateY(-Math.PI / 2);
  bodyGeo.deleteAttribute('uv');
  m(bodyGeo, body);
  // the open cockpit, seats and a steering wheel
  m(rbox(1.08, 0.05, 1.12, 0.03), cab, 0, 0.93, -0.24);
  for (const x of [-0.3, 0.3]) {
    const back = m(rbox(0.46, 0.44, 0.14, 0.07), seatM, x, 1.1, -0.62); back.rotation.x = -0.18;
    m(rbox(0.46, 0.08, 0.4, 0.04), seatM, x, 0.96, -0.42);
  }
  const wheel = m(new THREE.TorusGeometry(0.13, 0.02, 6, 20), dark, 0.3, 1.08, 0.12); wheel.rotation.x = -0.9;
  // windshield: chrome frame + pale glass, leaning back
  const ws = new THREE.Group(); ws.position.set(0, 0.94, 0.38); ws.rotation.x = -0.32; g.add(ws);
  ws.add(new THREE.Mesh(rbox(1.12, 0.36, 0.03, 0.012), paint(0xcfe6ea, { opacity: 0.55, hatch: 0 })).translateY(0.2));
  ws.add(new THREE.Mesh(rbox(1.18, 0.04, 0.05, 0.02), chrome).translateY(0.39));
  for (const x of [-0.58, 0.58]) ws.add(new THREE.Mesh(rbox(0.05, 0.42, 0.05, 0.02), chrome).translateX(x).translateY(0.19));
  // the face: round lamps on the wings, a cream grille, chrome bumpers
  for (const x of [-0.46, 0.46]) {
    const lamp = m(lathe([[0.001, 0], [0.12, 0], [0.12, 0.05], [0.09, 0.09], [0.001, 0.1]], 16), chrome, x, 0.66, 1.3); lamp.rotation.x = Math.PI / 2;
    const glass = m(new THREE.SphereGeometry(0.095, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint(0xfff1c8, { emissive: 0xffe2a0, hatch: 0 }), x, 0.66, 1.39); glass.rotation.x = Math.PI / 2;
    m(rbox(0.16, 0.08, 0.05, 0.02), paint(0xe2483a, { emissive: 0x7a1710, hatch: 0 }), x, 0.6, -1.5);   // tail lamps
  }
  m(rbox(0.5, 0.2, 0.06, 0.05), cream, 0, 0.46, 1.47);
  for (let i = -2; i <= 2; i++) m(rbox(0.02, 0.14, 0.02, 0.008), dark, i * 0.08, 0.46, 1.5);
  m(rbox(1.5, 0.1, 0.12, 0.05), chrome, 0, 0.3, 1.5);
  m(rbox(1.5, 0.1, 0.12, 0.05), chrome, 0, 0.3, -1.52);
  // wheels: fat rounded tyres, whitewalls, domed hubcaps
  const tyre = lathe([[0.2, -0.11], [0.3, -0.11], [WR, -0.07], [WR + 0.005, 0], [WR, 0.07], [0.3, 0.11], [0.2, 0.11]], 22);
  tyre.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-0.6, WZ], [0.6, WZ], [-0.6, -WZ], [0.6, -WZ]]) {
    const w = m(tyre, dark, x, WR, z);
    const s = Math.sign(x);
    const wall = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.035, 6, 22).rotateY(Math.PI / 2), cream); wall.position.x = s * 0.1; w.add(wall);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-s * Math.PI / 2), chrome); hub.position.x = s * 0.09; w.add(hub);
    wheels.push(w);
  }
  g.add(blobShadow(1.0, 1.6));
  g.userData.wheels = wheels;
  return ink(g, 'mid');
}

export function createPlayer(scene, camera, colliders, startDir, startToward) {
  const root = new THREE.Group();            // positioned on the planet each frame
  const squash = new THREE.Group();          // squash & stretch lives here
  root.add(squash);
  scene.add(root);
  const bodies = { walk: new THREE.Group(), jeep: buildCar() };
  for (const b of Object.values(bodies)) { squash.add(b); b.visible = false; }
  const critic = { inst: null };
  // a simple stand-in until the model streams in (never visible for long)
  const stub = new THREE.Group();
  stub.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 4, 10), paint(PAL.lilac)).translateY(0.5));
  ink(stub, 'fine'); bodies.walk.add(stub); bodies.walk.add(blobShadow(0.3));
  loadHuman().then((glb) => {
    critic.inst = makeHuman(glb, LOOKS.critic);
    stub.removeFromParent();
    bodies.walk.add(critic.inst.rig);
    // the critic also drives the jeep
    const rider = makeHuman(glb, LOOKS.critic);
    sit(rider);
    const seat = new THREE.Group(); seat.position.set(0.3, 0.42, -0.36); seat.add(rider.rig);
    bodies.jeep.add(seat);
  });

  const st = {
    mode: 'walk', dir: startDir.clone(), heading: null, speed: 0, steer: 0,
    camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), camFwd: null, camYaw: 0, camPitch: 0, camInit: false, dragT: 9,
    keys: new Set(), enabled: true, squashK: 0, gr: 0,
  };
  st.heading = startToward.clone().sub(st.dir.clone().multiplyScalar(st.dir.dot(startToward))).normalize();
  st.camFwd = st.heading.clone();
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
      st.camYaw -= (e.clientX - lx) * 0.006; st.camPitch = Math.max(-0.3, Math.min(0.9, st.camPitch + (e.clientY - ly) * 0.004));
      st.dragT = 0;
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
    // the camera keeps its own facing, carried over the curve of the planet;
    // walking is relative to it, and it never chases your turns (no spiralling)
    st.camFwd.projectOnPlane(up);
    if (st.camFwd.lengthSq() < 1e-6) st.camFwd.copy(st.heading);
    st.camFwd.normalize();
    if (st.camYaw) { st.camFwd.applyAxisAngle(up, st.camYaw); st.camYaw = 0; }
    st.dragT += dt;
    _f.copy(st.camFwd);
    _r.crossVectors(_f, up).normalize();
    let target = 0;
    if (st.enabled) {
      if (st.mode === 'walk') {
        const ix = (key('KeyD', 'ArrowRight') ? 1 : 0) - (key('KeyA', 'ArrowLeft') ? 1 : 0);
        const iy = (key('KeyW', 'ArrowUp') ? 1 : 0) - (key('KeyS', 'ArrowDown') ? 1 : 0);
        if (ix || iy) {
          _w.copy(_f).multiplyScalar(iy).addScaledVector(_r, ix).normalize();
          // turn smoothly toward the input direction (by angle, so a U-turn can't collapse)
          const da = Math.atan2(_r.clone().crossVectors(st.heading, _w).dot(up), st.heading.dot(_w));
          st.heading.applyAxisAngle(up, da * (1 - Math.exp(-M.turn * dt))).normalize();
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
    // place + orient: on the terrain, or on whatever floor you're standing on
    const gr = groundAt(st.dir);
    if (!st.gr) st.gr = gr;
    st.gr += (gr - st.gr) * (1 - Math.exp(-16 * dt));         // step up/down, don't pop
    root.position.copy(st.dir).multiplyScalar(st.gr);
    _r.crossVectors(st.heading, st.dir).normalize();
    _m.makeBasis(_r.negate(), st.dir, st.heading);
    root.quaternion.setFromRotationMatrix(_m);
    // squash on acceleration; the walk itself comes from the rig
    const acc = (st.speed - prevSpeed) / Math.max(dt, 1e-3);
    st.squashK += (THREE.MathUtils.clamp(acc / 40, -0.08, 0.08) - st.squashK) * (1 - Math.exp(-10 * dt));
    squash.scale.set(1 + st.squashK * 0.5, 1 - st.squashK, 1 + st.squashK * 0.5);
    let bob = 0;
    if (st.mode === 'walk' && critic.inst) {
      const sp = Math.max(0, st.speed);
      bob = pose(critic.inst, dt, Math.min(1, sp / M.max), { run: THREE.MathUtils.clamp((sp - M.max) / (M.max * 0.6), 0, 1) });
    }
    squash.position.y = bob;
    if (st.mode === 'jeep') for (const w of bodies.jeep.userData.wheels) w.rotation.x += st.speed * dt / 0.36;

    // ── camera ──
    // trails on a spring. On foot it only eases round behind you while you walk
    // forward-ish (never while strafing or backing up); in the jeep it's a chase cam.
    const ang = Math.atan2(_w.crossVectors(st.camFwd, st.heading).dot(up), st.camFwd.dot(st.heading));
    const moving = Math.min(1, Math.abs(st.speed) / 2);
    const follow = st.mode === 'jeep' ? M.follow * moving
      : (st.dragT > 1.2 ? M.follow * moving * Math.max(0, Math.cos(ang)) : 0);
    if (follow) st.camFwd.applyAxisAngle(up, ang * (1 - Math.exp(-follow * dt)));
    // never look through a building: swing to the nearest clear angle,
    // pull in if that fails, and rise over your shoulder as a last resort
    const lead = Math.min(1, Math.abs(st.speed) / M.max);
    const head = root.position.clone().addScaledVector(up, M.look);
    const camAt = (yaw) => root.position.clone()
      .addScaledVector(st.camFwd.clone().applyAxisAngle(up, yaw), -M.camD * (1 + st.camPitch * 0.25))
      .addScaledVector(up, M.camH + st.camPitch * 4.5);
    const near = colliders.filter(c => c.r >= 0.5 && arc(st.dir, c.dir) < c.r + M.camD + 2);
    const reach = (w) => {
      for (let i = 1; i <= 10; i++) {
        const p = head.clone().lerp(w, i / 10).normalize();
        if (near.some(c => arc(p, c.dir) < c.r + 0.4)) return (i - 1.5) / 10;
      }
      return 1;
    };
    if (reach(camAt(0)) < 1) {
      for (const o of [0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.3, -1.3, 1.8, -1.8]) {
        if (reach(camAt(o)) >= 1) { st.camFwd.applyAxisAngle(up, o * (1 - Math.exp(-3 * dt))); break; }
      }
    }
    const want = camAt(0);
    const f = reach(want);
    if (f >= 0.4 && f < 1) want.copy(head).lerp(want, f).addScaledVector(up, (1 - f) * 1.0);
    else if (f < 0.4) {
      const back = want.clone().sub(head).projectOnPlane(up).setLength(M.camD * 0.3);
      want.copy(head).add(back).addScaledVector(up, M.camD * 0.9);
    }
    const look = head.clone().addScaledVector(st.heading, 1.6 * lead);
    if (!st.camInit) { st.camPos.copy(want); st.camLook.copy(look); st.camInit = true; }
    const pullIn = want.distanceTo(head) < st.camPos.distanceTo(head) - 0.3;
    st.camPos.lerp(want, 1 - Math.exp(-(pullIn ? 10 : 5) * dt));
    st.camLook.lerp(look, 1 - Math.exp(-8 * dt));
    // keep the eye above ground
    const cr = st.camPos.length(), cg = groundAt(st.camPos.clone().normalize()) + 0.8;
    if (cr < cg) st.camPos.setLength(cg);
    camera.position.copy(st.camPos);
    camera.up.copy(up);
    camera.lookAt(st.camLook);
    if (st.camHook) st.camHook(camera, root);          // dev: fixed shots for screenshots
  }
  return { st, update, setMode, root, bodies };
}
