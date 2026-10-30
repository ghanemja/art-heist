// ─── THE PLAYER: the critic, on foot or at the wheel ────────────────────────
// Movement is eased (accelerate, glide, settle), turning is smoothed, and the
// camera trails on a spring and leads where you're heading — the "feel" layer
// most adventure games live or die by. On foot, controls are camera-relative;
// in the jeep, they're throttle + steer.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { R, SEA, radiusAt, groundAt, standAt, footing, isWater, arc, nearestRoad, slerpDir, LOTS } from './world.js';
import { buildBoat, createWake } from './harbour.js';
import { PAL, paint, ink, blobShadow } from './style.js';
import { rbox, lathe } from './props.js';
import { loadHuman, makeHuman, pose, sit, LOOKS, HUMAN_SCALE } from './human.js';

const UP = new THREE.Vector3(0, 1, 0);
const MODES = {
  walk: { max: 3.4, accel: 9, turn: 10, camD: 5.6, camH: 2.2, look: 0.88, radius: 0.3, follow: 1.4 },
  jeep: { max: 11, accel: 6, turn: 2.4, camD: 9.5, camH: 3.6, look: 1.2, radius: 0.8, follow: 3.0 },
  boat: { max: 5.5, accel: 2.2, turn: 1.5, camD: 8.0, camH: 3.0, look: 0.9, radius: 0.7, follow: 2.2 },
};

// ── the car: a little vintage roadster. The body is its side silhouette —
// rounded deck, long bonnet, a nose, two wheel arches — extruded across its
// width with a deep bevel, so every edge is soft and the arches are real cut-outs.
// ── a wheel, axle along X; side +1 = its outer face looks to +X ──
const RUBBER = paint(0x2b2730), WALL = paint(0x3c3742, { hatch: 0 }), RIM = paint(0xc9ccd2, { hatch: 0 }), RIMD = paint(0x8f939c, { hatch: 0 });
let _tyreGeo = null;
function tyreGeo() {
  if (_tyreGeo) return _tyreGeo;
  // profile (radius, across the tread), sampled finely over the tread so it can be cut
  const prof = [[0.2, -0.104], [0.262, -0.112], [0.302, -0.103], [0.327, -0.082], [0.338, -0.06], [0.341, -0.035], [0.342, -0.016], [0.342, -0.006],
    [0.342, 0.006], [0.342, 0.016], [0.341, 0.035], [0.338, 0.06], [0.327, 0.082], [0.302, 0.103], [0.262, 0.112], [0.2, 0.104]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 72);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const w = mergeVertices(g, 1e-5), P = w.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z);
    if (r < 0.325 || Math.abs(y) > 0.088) continue;
    const a = Math.atan2(z, x), side = Math.sign(y) || 1;
    // staggered tread blocks either side of a centre groove
    const block = Math.cos(a * 26 + side * 0.6) > -0.2 ? 0.0 : -0.011;
    const groove = Math.abs(y) < 0.011 ? -0.013 : 0;
    const nr = r + block + groove;
    P.setX(i, x / r * nr); P.setZ(i, z / r * nr);
  }
  w.computeVertexNormals();
  return (_tyreGeo = w);
}
function makeWheel(side) {
  const W = new THREE.Group();                         // spins about X (rotation.x)
  const A = new THREE.Group(); A.rotation.z = -side * Math.PI / 2; W.add(A);   // lathe axis Y → X, outer face (+Y) to `side`
  A.add(new THREE.Mesh(tyreGeo(), RUBBER));
  // raised sidewall ring + a few raised lettering blocks round it
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.272, 0.006, 6, 48), WALL); ring.rotation.x = Math.PI / 2; ring.position.y = 0.106; A.add(ring);
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; const b = new THREE.Mesh(rbox(0.035, 0.004, 0.012, 0.002), WALL); b.position.set(Math.cos(a) * 0.243, 0.108, Math.sin(a) * 0.243); b.rotation.y = -a; A.add(b); }
  // the rim: a dish sunk into the tyre, a polished lip, five spokes, lug nuts, a cap
  A.add(new THREE.Mesh(lathe([[0.001, 0.03], [0.06, 0.03], [0.17, 0.05], [0.198, 0.075], [0.21, 0.09], [0.204, 0.098], [0.19, 0.088], [0.17, 0.068]], 36), RIM));
  A.add(new THREE.Mesh(lathe([[0.001, 0.07], [0.055, 0.072], [0.06, 0.085], [0.035, 0.1], [0.001, 0.102]], 24), RIM));
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2, sp = new THREE.Mesh(rbox(0.12, 0.022, 0.034, 0.01), RIM);
    sp.position.set(Math.cos(a) * 0.115, 0.073, Math.sin(a) * 0.115); sp.rotation.y = -a; A.add(sp);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6), RIMD);
    nut.position.set(Math.cos(a + 0.63) * 0.048, 0.09, Math.sin(a + 0.63) * 0.048); A.add(nut);
  }
  return W;
}

// set a car body down on its FOUR contact patches: pitch and roll it to the ground
// under the wheels and lift it so no tyre is ever below the surface. `body` is the
// car's own group (rotated/raised within its parent, whose frame is up = local +Y).
const WHEEL_AT = [[-0.6, 0.86], [0.6, 0.86], [-0.6, -0.86], [0.6, -0.86]];
const _wp = new THREE.Vector3(), _wq = new THREE.Quaternion();
export function fitToGround(body, frameObj, k = 1) {
  frameObj.updateWorldMatrix(true, false);
  const g = WHEEL_AT.map(([x, z]) => {
    _wp.set(x, 0, z).applyMatrix4(frameObj.matrixWorld);
    return standAt(_wp.clone().normalize()) - _wp.length();          // ground height under this wheel, in the car's frame
  });
  const front = (g[0] + g[1]) / 2, back = (g[2] + g[3]) / 2, left = (g[0] + g[2]) / 2, right = (g[1] + g[3]) / 2;
  const pitch = -Math.atan2(front - back, 2 * 0.86), roll = Math.atan2(right - left, 1.2);
  const mean = (front + back) / 2;
  let lift = 0;                                                      // no wheel left below its ground
  WHEEL_AT.forEach(([x, z], i) => { const pred = mean - z * Math.sin(pitch) + x * Math.sin(roll); lift = Math.max(lift, g[i] - pred); });
  const y = mean + lift;
  body.position.y += (y - body.position.y) * k;
  body.rotation.x += (pitch - body.rotation.x) * k;
  body.rotation.z += (roll - body.rotation.z) * k;
}

export function buildCar(o = {}) {
  const g = new THREE.Group();
  const body = paint(o.body ?? 0xd9573f), cream = paint(0xf1e4c6), chrome = paint(0xe6e0d2, { hatch: 0 });
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
  // wheels: real tyres — rounded rubber with tread blocks and a centre groove, raised
  // sidewall lettering, a dished silver rim with five spokes, lug nuts and a centre cap
  const wheels = [];
  for (const [x, z] of [[-0.6, WZ], [0.6, WZ], [-0.6, -WZ], [0.6, -WZ]]) {
    const w = makeWheel(Math.sign(x)); w.position.set(x, WR + 0.01, z); g.add(w);
    wheels.push(w);
  }
  g.add(blobShadow(1.0, 1.6));
  g.userData.wheels = wheels;
  if (o.police) {                                     // a light bar over the windshield + a door badge
    const bar = new THREE.Group(); bar.position.set(0, 1.45, 0.3); g.add(bar);
    bar.add(new THREE.Mesh(rbox(0.9, 0.06, 0.18, 0.02), dark));
    const red = new THREE.Mesh(rbox(0.36, 0.12, 0.16, 0.04), paint(0xe2483a, { emissive: 0x7a1710, unique: true })); red.position.x = -0.24; bar.add(red);
    const blue = new THREE.Mesh(rbox(0.36, 0.12, 0.16, 0.04), paint(0x3f6fd8, { emissive: 0x16306a, unique: true })); blue.position.x = 0.24; bar.add(blue);
    for (const x of [-0.5, 0.5]) { const p = new THREE.Mesh(rbox(0.03, 0.5, 0.03, 0.01), chrome); p.position.set(x, -0.25, 0); bar.add(p); }
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), paint(0xe4b84f, { hatch: 0 })); b.position.set(s * 0.71, 0.6, 0.05); b.rotation.y = s * Math.PI / 2; g.add(b); }
    g.userData.lights = [red.material, blue.material];
  }
  return ink(g, 'mid');
}

// ── the shoulder straps, traced over HER shoulders: for each strap, slice the
// sweater + neck at the strap's x and walk round that slice from the top of the
// pack, over the shoulder and down the chest, keeping a strap's thickness off the
// cloth; then ease out round the ribs to a buckle. Built in the pack's frame,
// which is the body's frame shifted onto the spine.
const STRAP = { x: 0.118, pts: [[0.9, 0.12, -0.005], [1, 0.163, 0.03], [1, 0.188, 0.07], [0.97, 0.181, 0.113], [0.92, 0.145, 0.146], [0.87, 0.08, 0.156], [0.85, 0.0, 0.157]] };
function fitStraps(bp, rig) {
  rig.updateMatrixWorld(true); bp.updateMatrixWorld(true);
  const pts = [], v = new THREE.Vector3(), inv = bp.matrixWorld.clone().invert();
  rig.traverse(o => {
    if (!o.isSkinnedMesh || o.userData.part !== 'sweater') return;
    const P = o.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) { o.getVertexPosition(i, v); pts.push(o.localToWorld(v.clone()).applyMatrix4(inv)); }
  });
  const strapM = paint(0x8a6448), brass = paint(0xe4b84f), out = new THREE.Group(), T = 0.016;
  for (const s of [-1, 1]) {
    // a fixed strap, laid on her measured body (in the pack's frame: back of the sweater
    // z≈0.05, chest z≈0.13–0.15, turtleneck to |x|≈0.12 and y≈0.235, shoulder just outside)
    const sx = s * STRAP.x;
    const path = STRAP.pts.map(([fx, y, z]) => new THREE.Vector3(sx * fx, y, z));
    const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal', 0.5);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.012, 6), strapM);
    out.add(tube);
    const end = path[path.length - 1];
    const buckle = new THREE.Mesh(rbox(0.03, 0.022, 0.01, 0.004), brass); buckle.position.copy(end).add(new THREE.Vector3(0, 0, 0.006)); out.add(buckle);
  }
  bp.add(ink(out, 'fine'));                 // ink only the new parts (the pack already has its outline)
}

// ── the critic's little backpack (the phone lives in it): a rounded mustard
// pack, a red flap with a brass clasp, a front pocket, straps over the shoulders
function buildBackpack() {
  const g = new THREE.Group();
  const body = paint(0xe1b95c), flap = paint(0xc7533e), strap = paint(0x8a6448), brass = paint(0xe4b84f);
  const m = (geo, mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  m(rbox(0.24, 0.27, 0.12, 0.05), body, 0, 0, -0.06);
  const f = m(rbox(0.25, 0.12, 0.135, 0.045), flap, 0, 0.085, -0.065); f.rotation.x = 0.05;
  m(rbox(0.06, 0.04, 0.02, 0.01), brass, 0, 0.04, -0.135);
  m(rbox(0.16, 0.1, 0.05, 0.025), body, 0, -0.07, -0.135);                  // front pocket
  m(rbox(0.17, 0.025, 0.055, 0.01), flap, 0, -0.025, -0.135);
  const phone = m(rbox(0.05, 0.085, 0.012, 0.006), paint(0x2a2230, { hatch: 0 }), 0.135, 0.03, -0.05);   // the phone, peeking out of the side pocket
  phone.rotation.z = -0.15;
  m(rbox(0.035, 0.07, 0.05, 0.012), body, 0.13, -0.02, -0.05);
  // (the shoulder straps are traced over her real shoulders once she's loaded: see fitStraps)
  m(new THREE.TorusGeometry(0.03, 0.008, 6, 14), brass, 0, 0.15, -0.04).rotation.x = Math.PI / 2;   // the carry loop
  return ink(g, 'fine');
}

export function createPlayer(scene, camera, colliders, startDir, startToward) {
  const root = new THREE.Group();            // positioned on the planet each frame
  const squash = new THREE.Group();          // squash & stretch lives here
  root.add(squash);
  root.userData.noGround = true;
  scene.add(root);
  const bodies = { walk: new THREE.Group(), jeep: buildCar(), boat: buildBoat() };
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
    // the backpack rides on her upper spine: placed in the body's frame (behind the
    // shoulder blades, facing back) and parented to the bone so it sways with her
    const spine = critic.inst.bones?.spine2;
    if (spine) {
      root.updateMatrixWorld(true);
      const bp = buildBackpack();
      const bw = new THREE.Vector3(), bq = new THREE.Quaternion(), bs = new THREE.Vector3();
      spine.matrixWorld.decompose(bw, bq, bs);
      // (the pack and its straps were drawn for her at scale 0.13: they shrink with her)
      const K = HUMAN_SCALE * (LOOKS.critic.height ?? 1) / 0.13;
      const at = bodies.walk.worldToLocal(bw.clone()).add(new THREE.Vector3(0, -0.02, -0.11).multiplyScalar(K));
      const world = bodies.walk.localToWorld(at);
      bp.position.copy(spine.worldToLocal(world));
      const wq = new THREE.Quaternion(); bodies.walk.getWorldQuaternion(wq);
      bp.quaternion.copy(bq.clone().invert().multiply(wq));
      bp.scale.setScalar(K / bs.x);
      spine.add(bp);
      critic.backpack = bp;
      fitStraps(bp, critic.inst.rig);
    }
    // the critic also drives the jeep
    const rider = makeHuman(glb, LOOKS.critic);
    sit(rider);
    // (her hips sit 0.565·HUMAN_SCALE/0.13 above the rig's origin: lift the seat so they stay on the
    // cushion, and slide it a touch forward so her shorter arms reach the wheel)
    const seat = new THREE.Group(); seat.position.set(0.3, 0.42 + 0.565 * (1 - HUMAN_SCALE * (LOOKS.critic.height ?? 1) / 0.13), -0.31 + 0.04); seat.add(rider.rig);
    bodies.jeep.add(seat);
    // …and steers the boat, on its bench behind the wheel
    const skipper = makeHuman(glb, LOOKS.critic);
    sit(skipper);
    const bench = new THREE.Group(); bench.position.set(0, 0, bodies.boat.userData.seatZ + 0.04); bench.add(skipper.rig);
    bodies.boat.add(bench);
    // set her hips on the bench: measured off the posed rig, not guessed
    const hips = skipper.bones?.hips;
    if (hips) { bodies.boat.updateMatrixWorld(true); const hy = bodies.boat.worldToLocal(hips.getWorldPosition(new THREE.Vector3())).y; bench.position.y = bodies.boat.userData.seatY + 0.06 - hy; }
  });
  const wake = createWake(scene);

  const st = {
    mode: 'walk', dir: startDir.clone(), heading: null, speed: 0, steer: 0,
    camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), camFwd: null, camYaw: 0, camPitch: 0, camInit: false, dragT: 9,
    keys: new Set(), enabled: true, squashK: 0, gr: 0,
    zoom: 1, zoomT: 1, recenter: 0, stick: { x: 0, y: 0 },
  };
  st.heading = startToward.clone().sub(st.dir.clone().multiplyScalar(st.dir.dot(startToward))).normalize();
  st.camFwd = st.heading.clone();
  bodies.walk.visible = true;

  addEventListener('keydown', e => { st.keys.add(e.code); if (e.code === 'KeyC') st.recenter = 0.7; });
  addEventListener('keyup', e => st.keys.delete(e.code));
  addEventListener('blur', () => st.keys.clear());
  // drag to look around (orbit the camera about the player); scroll or pinch to zoom
  {
    const ptrs = new Map();
    let pinch0 = 0;
    const zoomBy = (k) => { st.zoomT = THREE.MathUtils.clamp(st.zoomT * k, 0.5, 1.9); };
    addEventListener('pointerdown', e => {
      if (e.target.tagName !== 'CANVAS' || !st.playing) return;   // no look-around until play starts: you open facing the museum
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
    });
    const up = (e) => { ptrs.delete(e.pointerId); pinch0 = 0; };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      if (ptrs.size === 2) {                                     // two fingers: pinch to zoom
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0) zoomBy(pinch0 / Math.max(1, d));
        pinch0 = d;
        return;
      }
      st.camYaw -= (e.clientX - p.x) * 0.006; st.camPitch = Math.max(-0.3, Math.min(1.0, st.camPitch + (e.clientY - p.y) * 0.004));
      st.dragT = 0; st.recenter = 0;
      p.x = e.clientX; p.y = e.clientY;
    });
    addEventListener('wheel', e => { if (e.target.tagName === 'CANVAS' && st.playing) { zoomBy(Math.exp(e.deltaY * 0.0012)); e.preventDefault(); } }, { passive: false });
  }
  // touch: a thumb stick, bottom-left — walks (push it all the way to run) and drives
  // (up/down = throttle/brake, left/right = steer). It only shows once someone touches.
  const stickEl = document.createElement('div');
  stickEl.id = 'stick'; stickEl.className = 'ui'; stickEl.innerHTML = '<i></i>';
  document.body.appendChild(stickEl);
  {
    const knob = stickEl.firstChild, R0 = 46;
    let id = null, cx = 0, cy = 0;
    const set = (x, y) => {
      let dx = x - cx, dy = y - cy; const L = Math.hypot(dx, dy);
      if (L > R0) { dx *= R0 / L; dy *= R0 / L; }
      st.stick.x = dx / R0; st.stick.y = -dy / R0;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    stickEl.addEventListener('pointerdown', e => {
      if (id !== null) return;
      id = e.pointerId; stickEl.setPointerCapture(id);
      const r = stickEl.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      set(e.clientX, e.clientY); e.preventDefault();
    });
    stickEl.addEventListener('pointermove', e => { if (e.pointerId === id) set(e.clientX, e.clientY); });
    const end = e => { if (e.pointerId !== id) return; id = null; st.stick.x = st.stick.y = 0; knob.style.transform = ''; };
    stickEl.addEventListener('pointerup', end); stickEl.addEventListener('pointercancel', end);
    addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  }
  const key = (...c) => c.some(k => st.keys.has(k));
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4();

  // ── the car stays on the road: it slides along the kerb instead of leaving
  // it, and when you're not steering it eases into line with the road. You can
  // always turn off at a junction — the assist never pulls more than ~50°.
  // (Get in off-road and it's free until it finds a road, then it's held.)
  function keepOnRoad(dt) {
    if (LOTS.some(inLot => inLot(st.dir))) { st.roadLock = false; return; }   // in a car park: free to manoeuvre
    const nr = nearestRoad(st.dir);
    if (!nr) { st.roadLock = false; return; }
    const lim = nr.half * 0.75 + 0.1;
    const tg = nr.tangent.clone(); if (tg.dot(st.heading) < 0) tg.negate();
    if (nr.dist <= lim) st.roadLock = true;
    else if (st.roadLock || nr.dist < lim + 1.2) {
      st.dir.copy(slerpDir(nr.point, st.dir, lim / nr.dist));
      st.heading.lerp(tg, 0.2).normalize();                  // scrape along the edge
      st.speed *= 0.985;
      st.roadLock = true;
    }
    if (st.roadLock && Math.abs(st.steerIn || 0) < 0.2 && Math.abs(st.speed) > 0.5 && st.heading.angleTo(tg) < 0.9)
      st.heading.lerp(tg, 1 - Math.exp(-1.8 * dt)).normalize();
  }

  function setMode(m) {
    st.mode = m;
    st.roadLock = false;
    for (const [k, b] of Object.entries(bodies)) b.visible = k === m;
    st.speed *= 0.3;
    st.grT = null;                           // a new footing: stepping out of the boat onto the pier isn't a wall
    st.camInit = false;                      // cut to the new framing rather than swinging over the roof
  }

  // the boat keeps to open water: deep enough under its middle and its bow (or stern, going
  // astern), clear of the pier and the quay (floors over the water), its sides too
  function afloat(d, dirn) {
    const sd = new THREE.Vector3().crossVectors(st.heading, d).normalize();
    const at = (fwd, side) => d.clone().multiplyScalar(R).addScaledVector(st.heading, fwd).addScaledVector(sd, side).normalize();
    for (const p of [d, at(1.25 * dirn, 0), at(0.3, 0.6), at(0.3, -0.6), at(-0.9, 0.55), at(-0.9, -0.55)])
      if (!isWater(p, 0.25) || groundAt(p) > R + SEA + 0.1) return false;
    return true;
  }

  function update(dt, t) {
    const M = MODES[st.mode];
    stickEl.classList.toggle('on', !!(st.enabled && st.playing));
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
        let ix = (key('KeyD', 'ArrowRight') ? 1 : 0) - (key('KeyA', 'ArrowLeft') ? 1 : 0);
        let iy = (key('KeyW', 'ArrowUp') ? 1 : 0) - (key('KeyS', 'ArrowDown') ? 1 : 0);
        const sm = Math.hypot(st.stick.x, st.stick.y);
        if (!ix && !iy && sm > 0.2) { ix = st.stick.x; iy = st.stick.y; }
        if (ix || iy) {
          _w.copy(_f).multiplyScalar(iy).addScaledVector(_r, ix).normalize();
          // turn smoothly toward the input direction (by angle, so a U-turn can't collapse)
          const da = Math.atan2(_r.clone().crossVectors(st.heading, _w).dot(up), st.heading.dot(_w));
          st.heading.applyAxisAngle(up, da * (1 - Math.exp(-M.turn * dt))).normalize();
          target = M.max * (key('ShiftLeft', 'ShiftRight') || sm > 0.95 ? 1.6 : sm > 0.2 ? Math.min(1, sm / 0.8) : 1);
        }
      } else {
        let thr = (key('KeyW', 'ArrowUp') ? 1 : 0) - (key('KeyS', 'ArrowDown') ? 0.6 : 0);
        let steer = (key('KeyD', 'ArrowRight') ? 1 : 0) - (key('KeyA', 'ArrowLeft') ? 1 : 0);
        const sy = Math.abs(st.stick.y) > 0.2 ? st.stick.y : 0, sx = Math.abs(st.stick.x) > 0.15 ? st.stick.x : 0;
        if (!thr && sy) thr = sy > 0 ? sy : sy * 0.6;
        if (!steer && sx) steer = sx;
        st.steerIn = steer;
        target = thr * M.max;
        st.steer += (steer - st.steer) * (1 - Math.exp(-8 * dt));
        // (a boat turns a little even when nearly still — it can always steer off the pier or the bank)
        const turnRate = M.turn * st.steer * Math.min(1, (Math.abs(st.speed) + (st.mode === 'boat' ? 1.2 : 0)) / 3) * Math.sign(st.speed || 1);
        st.heading.applyAxisAngle(up, -turnRate * dt);
      }
    }
    const prevSpeed = st.speed;
    st.speed += (target - st.speed) * (1 - Math.exp(-(target ? M.accel : M.accel * 1.4) * dt / Math.max(1, M.max / 4)));
    if (Math.abs(st.speed) < 0.02 && !target) st.speed = 0;
    // move along the great circle
    const step = st.speed * dt;
    if (step) {
      const was = st.dir.clone();
      const nd = st.dir.clone().multiplyScalar(R).addScaledVector(st.heading, step).normalize();
      if (st.mode === 'boat' ? afloat(nd, Math.sign(step)) : !isWater(nd, 0.1) || groundAt(nd) > R + SEA + 0.2 && standAt(nd) > R + SEA + 0.2) {   // (a pier is a floor over the water: her footing must be on it too)
        st.dir.copy(nd);
      } else st.speed *= 0.3;
      if (st.mode === 'jeep') keepOnRoad(dt);
      // collide: slide out of every footprint (the car ploughs past lamps and
      // people — people get knocked flying instead, see bump.js)
      for (const c of colliders) {
        if (st.mode !== 'walk' && c.r < 0.4 || st.mode === 'walk' && c.carOnly) continue;   // carOnly: the parked train's bulk (she walks in through its door)
        const a = arc(st.dir, c.dir), lim = c.r + M.radius;
        if (a >= lim || a < 1e-5) continue;
        const perp = st.dir.clone().sub(c.dir.clone().multiplyScalar(c.dir.dot(st.dir))).normalize();
        const w = lim / R;
        st.dir.copy(c.dir).multiplyScalar(Math.cos(w)).addScaledVector(perp, Math.sin(w)).normalize();
        st.speed *= 0.92;
      }
      // the jeep is long: its nose collides too
      if (st.mode === 'jeep') for (const c of colliders) {
        if (c.r < 0.4) continue;
        const nose = st.dir.clone().multiplyScalar(R).addScaledVector(st.heading, 0.9).normalize();
        const a = arc(nose, c.dir), lim = c.r + 0.55;
        if (a >= lim || a < 1e-5) continue;
        const push = c.dir.clone().sub(nose).projectOnPlane(st.dir).normalize().multiplyScalar(-(lim - a));
        st.dir.multiplyScalar(R).add(push).normalize();
        st.speed *= 0.5;
      }
      // a riser taller than a step (a forecourt edge on a slope, a plinth) stops her
      // feet like a wall: she slides along it, and never stands with a shoe inside it
      if (st.mode === 'walk' && st.grT != null) {
        const f = footing(st.dir, st.grT);
        if (f.wall) {
          const mv = st.dir.clone().sub(was).multiplyScalar(R), into = mv.dot(f.wall);
          if (into > 0) {
            mv.addScaledVector(f.wall, -into);
            const slid = was.clone().multiplyScalar(R).add(mv).normalize();
            const wasWalled = footing(was, st.grT).wall;
            st.dir.copy(footing(slid, st.grT).wall && !wasWalled ? was : slid);
            st.speed *= 0.9;
          }
        }
      }
    }
    st.heading.sub(st.dir.clone().multiplyScalar(st.heading.dot(st.dir))).normalize();
    // place + orient: on the terrain, or on whatever floor you're standing on
    // terrain, floors, or the road ribbon; on foot, under any of her feet (she steps up
    // as a shoe lands on the step, not once her middle is over it)
    const gr = st.mode === 'walk' ? footing(st.dir, st.grT ?? null).r : st.mode === 'boat' ? R + SEA : standAt(st.dir);
    st.grT = gr;
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
    if (st.mode === 'jeep') {
      for (const w of bodies.jeep.userData.wheels) w.rotation.x += st.speed * dt / 0.35;
      fitToGround(bodies.jeep, root, 1 - Math.exp(-14 * dt));       // all four tyres on the road
    } else { bodies.jeep.position.y = 0; bodies.jeep.rotation.x = bodies.jeep.rotation.z = 0; }
    // the boat bobs and rolls on the swell, leans into its turns, lifts its bow under power
    if (st.mode === 'boat') {
      const B = bodies.boat, k = Math.min(1, Math.abs(st.speed) / M.max);
      B.position.y = 0.035 * Math.sin(t * 1.7) + 0.015 * Math.sin(t * 2.9 + 1);
      B.rotation.z = 0.04 * Math.sin(t * 1.3) + st.steer * 0.07 * k;
      B.rotation.x = 0.025 * Math.sin(t * 1.1 + 0.5) - 0.06 * k * Math.sign(st.speed);
      B.userData.flag.rotation.y = 0.3 * Math.sin(t * 6) + 0.4 * k;
    }
    wake.update(dt, st.mode === 'boat' && Math.abs(st.speed) > 0.8,
      st.dir.clone().multiplyScalar(R + SEA + 0.02).addScaledVector(st.heading, -1.3 * Math.sign(st.speed || 1)), st.dir, st.speed, st.heading);

    // ── camera ──
    // trails on a spring. On foot it only eases round behind you while you walk
    // forward-ish (never while strafing or backing up); in the jeep it's a chase cam.
    // (walking sideways it still drifts round a little, so circling a building
    // doesn't leave you facing the camera; backing up never swings it). C snaps behind you.
    const ang = Math.atan2(_w.crossVectors(st.camFwd, st.heading).dot(up), st.camFwd.dot(st.heading));
    const moving = Math.min(1, Math.abs(st.speed) / 2), ca = Math.cos(ang);
    let follow = st.mode !== 'walk' ? M.follow * moving
      : (st.dragT > 1.2 ? M.follow * moving * (ca > 0 ? 0.35 + 0.65 * ca : ca > -0.35 ? 0.25 : 0) : 0);
    if (st.recenter > 0) { st.recenter -= dt; follow = Math.max(follow, 7); }
    if (follow) st.camFwd.applyAxisAngle(up, ang * (1 - Math.exp(-follow * dt)));
    st.zoom += (st.zoomT - st.zoom) * (1 - Math.exp(-8 * dt));
    const camD = M.camD * st.zoom, camH = M.camH * (0.55 + 0.45 * st.zoom);
    // never look through a building: swing to the nearest clear angle,
    // pull in if that fails, and rise over your shoulder as a last resort
    // COMFORT: the camera never follows the body's small bumps. Its anchor takes her
    // position across the ground exactly, but her height only through a slow spring
    // (steps, kerbs, the walk's bob never jolt the view)
    const rr = root.position.length();
    if (!st.anchorR || !st.camInit) st.anchorR = rr;            // a cut starts fresh
    st.anchorR += (rr - st.anchorR) * (1 - Math.exp(-3.5 * dt));
    const anchor = st.dir.clone().multiplyScalar(st.anchorR);
    const lead = Math.min(1, Math.abs(st.speed) / M.max);
    const head = anchor.clone().addScaledVector(up, M.look);
    const camAt = (yaw) => anchor.clone()
      .addScaledVector(st.camFwd.clone().applyAxisAngle(up, yaw), -camD * (1 + st.camPitch * 0.25))
      .addScaledVector(up, camH + st.camPitch * 4.5 * st.zoom);
    const near = colliders.filter(c => c.r >= 0.5 && !c.carOnly && arc(st.dir, c.dir) < c.r + camD + 2);
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
    // still blocked: come in only so far, and rise over the obstacle instead —
    // diving in close leaves you staring into the car's cockpit or the back of your head
    const want = camAt(0);
    // the blocked-view pull-in eases (the check works in 10% steps: snapping to them popped)
    const f0 = reach(want);
    if (st.reachS == null || !st.camInit) st.reachS = f0;
    st.reachS += (f0 - st.reachS) * (1 - Math.exp(-(f0 < st.reachS ? 8 : 4) * dt));
    const f = st.reachS;
    if (f < 0.999) {
      const keep = Math.max(f, st.mode !== 'walk' ? 0.6 : 0.4);
      want.lerpVectors(head, want, keep).addScaledVector(up, (1 - f) * (st.mode !== 'walk' ? 4.5 : 2.4));
    }
    // look a little ahead of where you're going — the lead itself on a slow spring, so a
    // quick turn doesn't whip the view round
    if (!st.leadV) st.leadV = new THREE.Vector3();
    st.leadV.lerp(st.heading.clone().multiplyScalar(1.6 * lead), 1 - Math.exp(-4 * dt));
    const look = head.clone().add(st.leadV);
    if (!st.camInit) { st.camPos.copy(want); st.camLook.copy(look); st.camInit = true; }
    const pullIn = want.distanceTo(head) < st.camPos.distanceTo(head) - 0.3;
    // while you drag the view it answers your hand straight away; otherwise it trails softly
    const dragging = st.dragT < 0.25;
    st.camPos.lerp(want, 1 - Math.exp(-(dragging ? 14 : pullIn ? 10 : 5) * dt));
    st.camLook.lerp(look, 1 - Math.exp(-(dragging ? 14 : 8) * dt));
    // keep the eye above ground
    const cr = st.camPos.length(), cg = groundAt(st.camPos.clone().normalize()) + 0.8;
    if (cr < cg) st.camPos.setLength(cg);
    camera.position.copy(st.camPos);
    camera.up.copy(up);
    camera.lookAt(st.camLook);
    if (st.camHook) st.camHook(camera, root);          // dev: fixed shots for screenshots
  }
  return { st, update, setMode, root, bodies, critic, fitToGround };
}
