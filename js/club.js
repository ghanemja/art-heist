// ─── THE COUNTRY CLUB'S ACTIVITIES: a swim in the pool, a bucket of balls at the range ───
// Both start from an E prompt (game.doors) and take her over while they run: G.ui is
// 'activity' and G.activity holds { act, exit } (game.js forwards E and Esc to them), her own
// walking is switched off (player.st.enabled) and the camera is ours (player.st.camHook).
//   • the pool: E at the edge → she steps in and swims breaststroke, steered like walking
//     (camera-relative, slower), held inside the kidney; the pool's shader draws her body under
//     the surface and the rings round her. E (or Esc) → she climbs out onto the deck.
//   • the range: E at a free bay → she addresses a ball on the mat, the camera behind her looking
//     down the range. Hold E / Space / the mouse (a "swing" button on touch) to wind up — a power
//     meter fills and falls back — and let go to hit. The ball flies, lands and bounces on the
//     ground; the yards it carried (read off the yardage boards) float where it landed, and a
//     hand-lettered word for the shot. Ten balls at most (one instanced pair of draws).
// Created by createNorthLife (north.js), which calls update() after the player's own update.
import * as THREE from 'three';
import { R, radiusAt } from './world.js';
import { paint, ink, PAL } from './style.js';
import { swimPose, swingPose } from './human.js';
import { sfxOut } from './audio.js';

const CSS = `
  body.club-on #hint { display: none; }
  #clubAct { left: 50%; bottom: 74px; transform: translateX(-50%) rotate(-1deg); font: inherit; font-size: 22px; padding: 6px 18px; background: #fffaf0; color: var(--ink); cursor: pointer; }
  #clubAct kbd, #clubRange kbd { font-family: inherit; border: 2px solid var(--ink); border-radius: 6px; padding: 0 7px; margin-right: 6px; background: var(--gold); }
  body.touch #clubAct { bottom: 170px; font-size: 24px; padding: 10px 22px; } body.touch #clubAct kbd, body.touch #clubRange kbd { display: none; }
  #clubRange { left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
  #clubRange .row { display: flex; gap: 12px; align-items: center; pointer-events: auto; }
  #clubRange .meter { position: relative; width: min(260px, 52vw); height: 30px; padding: 0; overflow: hidden; transform: rotate(-0.8deg); }
  #clubRange .meter i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: repeating-linear-gradient(-55deg, var(--gold) 0 9px, #f0c95e 9px 15px); border-right: 2.5px solid var(--ink); }
  #clubRange .meter s { position: absolute; top: 0; bottom: 0; left: 78%; width: 13%; background: rgba(232,96,76,.22); border-left: 2px dashed var(--ink2); border-right: 2px dashed var(--ink2); }
  #clubRange .meter b { position: absolute; inset: 0; text-align: center; font-family: 'Caveat', cursive; font-size: 23px; line-height: 27px; font-weight: 700; }
  #clubRange button { font: inherit; font-size: 19px; padding: 5px 16px; color: var(--ink); background: #fffaf0; cursor: pointer; }
  #clubRange .swing { display: none; background: var(--gold); font-size: 22px; padding: 10px 26px; }
  body.touch #clubRange .swing { display: block; } body.touch #clubRange .help { display: none; }
  #clubRange .help { font-size: 17px; color: var(--ink2); background: rgba(246,239,223,.85); border-radius: var(--sketch); padding: 1px 12px; }
  #clubWord { left: 50%; top: 26%; transform: translate(-50%, -50%) rotate(-7deg) scale(1); font-family: 'Caveat', cursive; font-weight: 700; font-size: clamp(52px, 9vw, 100px);
    color: var(--accent); text-shadow: 3px 3px 0 var(--paper), -2px -2px 0 var(--paper), 2px -2px 0 var(--paper), -2px 2px 0 var(--paper), 5px 6px 0 rgba(42,34,48,.5);
    pointer-events: none; transition: opacity .35s ease, transform .35s ease; white-space: nowrap; }
  #clubWord.hide { transform: translate(-50%, -50%) rotate(-7deg) scale(0.6); }
  #clubYds { left: 0; top: 0; padding: 0 12px; font-family: 'Caveat', cursive; font-weight: 700; font-size: 27px; pointer-events: none; white-space: nowrap; background: #fffaf0; transition: opacity .3s ease; }
  #clubYds::after { content: ''; position: absolute; left: 50%; bottom: -16px; width: 2.5px; height: 14px; background: var(--ink); }
`;

export function createClubPlay({ scene, game, player, club, range, poolIn, poolEdge, poolTh, swimmerAt }) {
  const G = game.G, st = player.st;
  const $ = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); const el = d.firstChild; document.body.appendChild(el); return el; };
  const show = (el, on = true) => el.classList.toggle('hide', !on);
  { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
  const actBtn = $('<button id="clubAct" class="ui sk hide"><kbd>E</kbd><span>get out</span></button>');
  const rangeUI = $(`<div id="clubRange" class="ui hide">
      <div class="row"><div class="meter sk"><s></s><i></i><b>power</b></div><button class="sk swing">swing</button><button class="sk done"><kbd>Esc</kbd>done</button></div>
      <div class="help">hold <kbd>E</kbd> or <kbd>Space</kbd> to wind up — let go to hit</div></div>`);
  const meterI = rangeUI.querySelector('.meter i'), meterB = rangeUI.querySelector('.meter b');
  const wordEl = $('<div id="clubWord" class="ui hide"></div>');
  const ydsEl = $('<div id="clubYds" class="ui sk hide"></div>');
  for (const el of [actBtn, rangeUI, wordEl, ydsEl]) el.classList.add('fade');

  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), DOWN = new THREE.Vector3(0, -1, 0);
  // a held key's repeats must not climb her straight back out (or in): only a fresh press acts
  let keyRepeat = false;
  addEventListener('keydown', (e) => { keyRepeat = e.repeat; }, true);
  addEventListener('pointerdown', () => { keyRepeat = false; }, true);

  let mode = null;                                 // null | 'swim' | 'range'
  const ease = (x) => x * x * (3 - 2 * x);
  const critic = () => player.critic.inst;
  const walkBody = player.bodies.walk;
  // her blob shadow and backpack stay on the deck while she swims
  const extras = (on) => { for (const c of walkBody.children) if (c !== critic()?.rig) c.visible = on; if (player.critic.backpack) player.critic.backpack.visible = on; };

  function begin(m, act, exit) {
    mode = m; G.ui = 'activity'; G.activity = { act, exit }; document.body.classList.add('club-on');
    st.enabled = false; st.speed = 0; st.camHook = camHook; camI = false;
  }
  function end() {
    mode = null; document.body.classList.remove('club-on'); walkBody.rotation.set(0, 0, 0); walkBody.position.set(0, 0, 0); extras(true);
    st.stickOn = false; show(actBtn, false); show(rangeUI, false);
    if (G.ui === 'activity') { G.ui = null; G.activity = null; st.enabled = true; }
    if (st.camHook === camHook) st.camHook = null;
    if (camera && fov0 != null) { camera.fov = fov0; camera.updateProjectionMatrix(); }
    st.camInit = false; st.gr = 0;
  }

  // ── the camera: eased toward a wanted eye and target, set after the player's own ──
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), wantPos: new THREE.Vector3(), wantLook: new THREE.Vector3() };
  let camI = false, camera = null, fov0 = null;
  function camHook(c) {
    camera = c;
    if (fov0 == null) fov0 = c.fov;
    const fw = mode === 'range' ? 68 : fov0;       // a wider lens in the tight bay
    if (Math.abs(c.fov - fw) > 0.05) { c.fov += (fw - c.fov) * 0.15; c.updateProjectionMatrix(); }
    if (!camI) return;                             // (until the first update has worked out a shot)
    c.position.copy(cam.pos); c.up.copy(cam.pos).normalize(); c.lookAt(cam.look);
  }
  const camEase = (dt, kp = 4, kl = 6) => {
    if (!camI) {                                   // swimming: ease over from the walking camera; the range: a cut
      if (camera && mode === 'swim') { cam.pos.copy(camera.position); camera.getWorldDirection(_v); cam.look.copy(camera.position).addScaledVector(_v, cam.pos.distanceTo(cam.wantLook)); }
      else { cam.pos.copy(cam.wantPos); cam.look.copy(cam.wantLook); }
      camI = true;
    }
    cam.pos.lerp(cam.wantPos, 1 - Math.exp(-kp * dt)); cam.look.lerp(cam.wantLook, 1 - Math.exp(-kl * dt));
  };

  // ── sound: soft and low (filtered noise), never a ring ──
  function splash(vol = 0.12, len = 0.35, cut = 900) {
    const o = sfxOut(); if (!o) return;
    const { ac, out } = o, t = ac.currentTime, n = Math.floor(ac.sampleRate * len), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.2);
    const src = ac.createBufferSource(); src.buffer = buf;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(cut, t); lp.frequency.exponentialRampToValueAtTime(cut * 0.35, t + len);
    const g = ac.createGain(); g.gain.value = vol;
    src.connect(lp); lp.connect(g); g.connect(out); src.start(t);
  }
  function thock() {                               // the club meeting the ball: a short low knock
    const o = sfxOut(); if (!o) return;
    const { ac, out } = o, t = ac.currentTime, g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const os = ac.createOscillator(); os.type = 'triangle'; os.frequency.setValueAtTime(240, t); os.frequency.exponentialRampToValueAtTime(110, t + 0.1);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    os.connect(lp); lp.connect(g); g.connect(out); os.start(t); os.stop(t + 0.14);
  }

  // ════════════════════════ THE POOL ════════════════════════
  const cr = club.root, P = club.pool, water = club.water, U = water?.material.uniforms;
  // pool-local (x, z: from the pool's centre, in the club's frame) ↔ directions on the planet
  const toPool = (dir) => { cr.worldToLocal(_v.copy(dir).multiplyScalar(R)); return [_v.x - P.x, _v.z - P.z]; };
  const fromPool = (x, z, out = new THREE.Vector3()) => cr.localToWorld(out.set(P.x + x, 0, P.z + z)).normalize();
  const thOf = poolTh;                             // the angle round the kidney that poolEdge takes
  const surfR = (dir) => radiusAt(dir) + 0.03;     // the water lies 0.03 over the ground there (north.js)
  const IN = -0.2;                                 // she keeps this far inside the coping
  const swim = { k: 0, c: 0, v: 0, tr: 0, dirn: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), splashT: 0 };
  const doorDir = new THREE.Vector3();
  game.doors.push({
    get dir() {                                    // the nearest point of the pool's edge to her
      const [x, z] = toPool(st.dir), [ex, ez] = poolEdge(thOf(x, z), 0.15);
      return fromPool(ex, ez, doorDir);
    },
    r: 0.8, label: 'swim',
    act: () => { if (!keyRepeat && !mode && G.state === 'play') startSwim(); },
  });
  function startSwim() {
    begin('swim', () => { if (!keyRepeat && swim.dirn === 0) climbOut(); }, () => { if (swim.dirn === 0) climbOut(); });
    // step in at the nearest edge: from where she stands to a point just inside the coping
    const [x, z] = toPool(st.dir), th = thOf(x, z), [ix, iz] = poolEdge(th, -0.45);
    swim.from.copy(st.dir); fromPool(ix, iz, swim.to);
    swim.tr = 0; swim.dirn = 1; swim.k = 0; swim.v = 0; swim.c = 0.5;
    st.heading.copy(swim.to).sub(swim.from).projectOnPlane(st.dir).normalize();
    st.camFwd.copy(st.heading);
    extras(false); st.stickOn = true;
    actBtn.lastChild.textContent = 'get out'; show(actBtn);
    splash(0.18, 0.6, 1100);
  }
  function climbOut() {
    const [x, z] = toPool(st.dir), th = thOf(x, z), [ox, oz] = poolEdge(th, 0.3);
    swim.from.copy(st.dir); fromPool(ox, oz, swim.to);
    swim.dirn = -1; swim.tr = 1;
    st.heading.copy(swim.to).sub(swim.from).projectOnPlane(st.dir).normalize();
    show(actBtn, false);
    splash(0.1, 0.4, 800);
  }
  // her shoulders → feet, for the pool's shader (its body-under-the-surface and rings)
  const _j1 = new THREE.Vector3(), _j2 = new THREE.Vector3();
  const shoulderMid = (out) => { const b = critic().bones; return out.copy(b.upperarmL.getWorldPosition(_j1)).add(b.upperarmR.getWorldPosition(_j2)).multiplyScalar(0.5); };
  const feetMid = (out) => { const b = critic().bones; return out.copy(b.footL.getWorldPosition(_j1)).add(b.footR.getWorldPosition(_j2)).multiplyScalar(0.5); };
  const keyDown = (...c) => c.some(k => st.keys.has(k));
  function updateSwim(dt, t) {
    const inst = critic(); if (!inst?.bones?.head) return;
    const up = st.dir;
    // steering: like walking — relative to the camera's facing, which trails her heading
    let ix = (keyDown('KeyD', 'ArrowRight') ? 1 : 0) - (keyDown('KeyA', 'ArrowLeft') ? 1 : 0);
    let iy = (keyDown('KeyW', 'ArrowUp') ? 1 : 0) - (keyDown('KeyS', 'ArrowDown') ? 1 : 0);
    const sm = Math.hypot(st.stick.x, st.stick.y);
    if (!ix && !iy && sm > 0.2) { ix = st.stick.x; iy = st.stick.y; }
    st.camFwd.projectOnPlane(up).normalize();
    const f = st.camFwd, r = _w.crossVectors(f, up).normalize();
    let want = 0;
    if (swim.dirn === 0 && (ix || iy)) {
      _v.copy(f).multiplyScalar(iy).addScaledVector(r, ix).normalize();
      const da = Math.atan2(_a.crossVectors(st.heading, _v).dot(up), st.heading.dot(_v));
      st.heading.applyAxisAngle(up, da * (1 - Math.exp(-3.2 * dt))).normalize();
      want = 0.95 * (sm > 0.2 ? Math.min(1, sm / 0.8) : 1);
    }
    swim.k += ((want ? 1 : 0) - swim.k) * (1 - Math.exp(-2.5 * dt));
    swim.c = (swim.c + dt * (0.32 + 0.38 * swim.k)) % 1;
    // the stroke pushes her on: fastest just after the kick, gliding after
    const surge = swim.k > 0.05 ? 0.45 + 1.1 * Math.max(0, Math.sin((swim.c - 0.55) * Math.PI * 2)) : 0;
    swim.v += (want * surge - swim.v) * (1 - Math.exp(-3 * dt));
    if (swim.dirn === 0 && swim.v > 1e-3) {
      const nd = _a.copy(st.dir).multiplyScalar(R).addScaledVector(st.heading, swim.v * dt).normalize();
      let [x, z] = toPool(nd);
      if (!poolIn(x, z, IN)) { const [ex, ez] = poolEdge(thOf(x, z), IN); x = ex; z = ez; swim.v *= 0.5; }
      // the swimmer doing lengths: she keeps her lane, and so does the critic — no swimming through her
      const o = swimmerAt?.();
      if (o) { const dx = x - o[0], dz = z - o[1], d = Math.hypot(dx, dz); if (d < 0.46) { x = o[0] + dx / (d || 1) * 0.46; z = o[1] + dz / (d || 1) * 0.46; } }
      if (poolIn(x, z, IN)) fromPool(x, z, st.dir);
      st.heading.projectOnPlane(st.dir).normalize();
    }
    // the camera's facing eases round behind her while she swims forward
    if (swim.v > 0.05) { const ang = Math.atan2(_a.crossVectors(st.camFwd, st.heading).dot(up), st.camFwd.dot(st.heading)); if (Math.cos(ang) > -0.3) st.camFwd.applyAxisAngle(up, ang * (1 - Math.exp(-1.2 * dt))); }
    // stepping in / climbing out
    let tr = 1;
    if (swim.dirn) {
      const goingIn = swim.dirn > 0;
      swim.tr += swim.dirn * dt / (goingIn ? 0.75 : 0.85);
      if (!goingIn && swim.tr <= 0) { finishSwim(); return; }
      tr = ease(Math.min(1, Math.max(0, swim.tr)));
      st.dir.copy(swim.from).lerp(swim.to, goingIn ? tr : 1 - tr).normalize();
      if (goingIn && swim.tr >= 1) { swim.tr = 1; swim.dirn = 0; st.dir.copy(swim.to); }
    }
    // pose: breaststroke (or treading water), tipped forward as she swims
    const pitch = (0.45 + 0.75 * swim.k) * tr;
    walkBody.rotation.set(pitch, 0, 0);
    swimPose(inst, swim.c, swim.k * tr);
    // set her in the water: her head bone just over the surface, kept over st.dir
    const root = player.root, surf = surfR(st.dir), ground = player.st.grT ?? radiusAt(st.dir);
    root.position.copy(st.dir).multiplyScalar(surf);
    root.updateMatrixWorld(true);
    const head = inst.bones.head.getWorldPosition(_b).sub(root.position);
    const hy = head.dot(up), hf = head.dot(st.heading);
    const inWater = _v.copy(st.dir).multiplyScalar(surf + 0.015 - hy).addScaledVector(st.heading, -hf);
    if (tr < 1) {                                  // on the deck at the start of the step / the end of the climb
      const onDeck = _w.copy(st.dir).multiplyScalar(ground);
      root.position.lerpVectors(onDeck, inWater, tr).addScaledVector(up, 0.18 * Math.sin(Math.PI * tr));
    } else root.position.copy(inWater);
    root.position.addScaledVector(up, 0.012 * Math.sin(t * 2.6 + swim.c * 6.28) * (1 - swim.k * 0.5));
    root.updateMatrixWorld(true);
    // the pool's shader: her body under the surface, the rings
    if (U) {
      U.uMeOn.value = 1;
      water.worldToLocal(shoulderMid(U.uMeA.value)); water.worldToLocal(feetMid(U.uMeB.value));
      U.uMeA.value.y = Math.min(U.uMeA.value.y, -0.04); U.uMeB.value.y = Math.min(U.uMeB.value.y, -0.04);
      U.uMeK.value = swim.k * (0.5 + 0.5 * Math.max(0, Math.sin((swim.c - 0.55) * Math.PI * 2))) * tr + 0.25 * (1 - swim.k) * tr;
    }
    // a soft splash with each kick
    if (swim.k > 0.4 && swim.c > 0.55 && swim.splashT < 0.55) splash(0.05 + 0.04 * swim.k, 0.3, 700);
    swim.splashT = swim.c;
    // the camera: behind and above her, looking a little ahead
    const me = _a.copy(st.dir).multiplyScalar(surf);
    cam.wantLook.copy(me).addScaledVector(up, -0.15).addScaledVector(st.camFwd, 0.3);   // (she sits a little above the middle, clear of the prompt)
    cam.wantPos.copy(me).addScaledVector(st.camFwd, -2.4 * st.zoom).addScaledVector(up, 1.45 + st.camPitch * 2.0);
    camEase(dt, 4, 6);
  }
  function finishSwim() {
    if (U) U.uMeOn.value = 0;
    st.dir.copy(swim.to);
    end();
    swim.dirn = 0;
  }

  // ════════════════════════ THE DRIVING RANGE ════════════════════════
  const rr = range?.root;
  const RL = (x, z, out = new THREE.Vector3()) => rr.localToWorld(out.set(x, 0, z)).normalize();
  const shot = { bay: 0, phase: 'address', p: 0, pd: 1, s: 0, t: 0, ball: null, hold: false };
  const BALL_R = 0.035, NB = 10;
  let balls = [], ballFill = null, ballInk = null, clubG = null, trail = null, nextSlot = 0;
  if (rr) {
    // the bays you can play from: every one but the golfer's
    range.bays.forEach((bx, i) => {
      if (Math.abs(bx - range.tee.x) < 0.3) return;
      game.doors.push({ dir: RL(bx - 0.1, range.matZ + 0.25), r: 0.62, label: 'hit some balls',
        act: () => { if (!keyRepeat && !mode && G.state === 'play') startRange(i); } });
    });
    // the balls: one instanced fill and one instanced ink hull, NB of them, reused round-robin
    const geo = new THREE.SphereGeometry(BALL_R, 10, 8);
    ballFill = new THREE.InstancedMesh(geo, paint(0xfaf6ec, { hatch: 0 }), NB);
    ballInk = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_R * 1.38, 10, 8), new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide }), NB);
    for (const m of [ballFill, ballInk]) { m.frustumCulled = false; m.userData.noInk = true; m.userData.noGround = true; m.raycast = () => {}; m.count = 0; scene.add(m); }
    for (let i = 0; i < NB; i++) balls.push({ live: false, st: 'rest', x: 0, z: 0, h: 0, vx: 0, vz: 0, vh: 0, curve: 0, landed: false });
    // the club she swings: a shaft, a grip, a head — posed each frame from her hands
    clubG = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0085, 1, 6).translate(0, -0.5, 0), paint(0xd8dde2));
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.011, 0.16, 6).translate(0, -0.06, 0), paint(PAL.ink, { hatch: 0 }));
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.09).translate(0, 0, 0.025), paint(0x6f7d92));
    clubG.add(shaft, grip, headM); clubG.userData = { shaft, headM };
    ink(clubG, 'fine');
    clubG.visible = false; clubG.traverse(o => { o.userData.noGround = true; o.raycast = () => {}; });
    scene.add(clubG);
    // the last shot's flight, a dotted pencil line
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3)); tg.setDrawRange(0, 0);
    trail = new THREE.Line(tg, new THREE.LineDashedMaterial({ color: 0xfaf6ec, dashSize: 0.12, gapSize: 0.09, transparent: true, opacity: 0.85 }));
    trail.frustumCulled = false; trail.userData.noInk = true; trail.raycast = () => {}; trail.visible = false; scene.add(trail);
    trail.userData.n = 0;
  }
  // the field's surface (the mown stripes ride 0.09 over the levelled ground) and the mat
  // the ground under a ball: the range's own surface (the mown stripes) where there is one,
  // read with a ray straight down; the planet's ground everywhere else
  const ray = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3(), hitsBuf = [];
  const ground = rr ? [] : null;
  if (rr) rr.traverse(o => { if (o.isMesh && !o.userData.isInk && !o.isInstancedMesh) ground.push(o); });
  const fieldR = (dir) => {
    const base = radiusAt(dir);
    ray.set(_o.copy(dir).multiplyScalar(base + 0.6), _d.copy(dir).negate()); ray.far = 0.9;
    hitsBuf.length = 0; ray.intersectObjects(ground, false, hitsBuf);
    let r = base;
    for (const h of hitsBuf) { const hr = h.point.length(); if (hr < base + 0.15 && hr > r) r = hr; }   // (low surfaces only: never the shelter's roof)
    return r;
  };
  const yards = (z) => {                           // read off the boards: 50 / 100 / 150
    const B = range.boards;
    for (let i = 0; i < B.length - 1; i++) if (z >= B[i + 1][0] || i === B.length - 2) {
      const [z0, y0] = B[i], [z1, y1] = B[i + 1]; return Math.max(0, Math.round(y0 + (y1 - y0) * (z - z0) / (z1 - z0)));
    }
    return 0;
  };
  function teeBall() {
    const b = balls[nextSlot]; nextSlot = (nextSlot + 1) % NB;
    const bx = range.bays[shot.bay];
    Object.assign(b, { live: true, st: 'tee', gr: null, x: bx + 0.18, z: range.matZ, h: 0, vx: 0, vz: 0, vh: 0, landed: false });
    shot.ball = b;
  }
  function startRange(bay) {
    shot.bay = bay; shot.phase = 'address'; shot.p = 0; shot.s = 0; shot.hold = false;
    begin('range', () => { if (!keyRepeat) press(); }, () => endRange());
    const bx = range.bays[bay];
    st.dir.copy(RL(bx - 0.16, range.matZ));
    st.heading.copy(RL(bx + 2, range.matZ)).sub(RL(bx - 0.16, range.matZ)).projectOnPlane(st.dir).normalize();
    teeBall();
    clubG.visible = true; show(rangeUI); setMeter(0, 'power');
  }
  function endRange() {
    if (shot.ball?.st === 'tee') shot.ball.live = false;      // the teed ball goes back in the bucket
    clubG.visible = false;
    // walking again, facing down the range
    st.camFwd.copy(RL(range.bays[shot.bay], range.matZ - 3)).sub(st.dir).projectOnPlane(st.dir).normalize();
    end();
  }
  function setMeter(p, label) { meterI.style.width = (p * 100).toFixed(1) + '%'; if (label != null) meterB.textContent = label; }
  function press() { if (mode === 'range' && shot.phase === 'address') { show(wordEl, false); wordT = 0; shot.phase = 'charge'; shot.p = 0; shot.pd = 1; shot.hold = true; } }
  function release() {
    if (mode !== 'range' || shot.phase !== 'charge') return;
    shot.phase = 'down'; shot.t = 0; shot.from = shot.s; shot.hold = false;
  }
  addEventListener('keydown', (e) => { if (mode === 'range' && e.code === 'Space' && !e.repeat) { press(); e.preventDefault(); } });
  addEventListener('keyup', (e) => { if (mode === 'range' && (e.code === 'Space' || e.code === 'KeyE')) release(); });
  addEventListener('pointerdown', (e) => { if (mode === 'range' && e.target.tagName === 'CANVAS') press(); });
  addEventListener('pointerup', () => { if (mode === 'range') release(); });
  addEventListener('pointercancel', () => { if (mode === 'range') release(); });
  { const sw = rangeUI.querySelector('.swing'); sw.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); }); }
  rangeUI.querySelector('.done').onclick = () => { if (mode === 'range') endRange(); };
  actBtn.onclick = () => { if (mode === 'swim' && swim.dirn === 0) climbOut(); };

  // the word for a shot, and the yards where it landed
  let wordT = 0, ydsT = 0, ydsBall = null;
  function say(w) { wordEl.textContent = w; show(wordEl); wordT = 1.6; }
  function strike() {
    const b = shot.ball; if (!b) return;
    thock();
    const p = shot.p, roll = Math.random();
    // a sweet spot near the top of the meter; past it she overswings and hooks
    let side = (Math.random() - 0.5) * 0.16, carry = 1.3 + 6.4 * p, word = null;
    if (p > 0.91) side += (p - 0.91) * 5 * (Math.random() < 0.5 ? -1 : 1);
    if (roll < 0.05 && p > 0.25) { side = 1.1; carry *= 0.35; word = 'shank'; }
    const peak = carry * (word ? 0.06 : 0.2), g = 5.2;
    const vh = Math.sqrt(2 * g * peak), T = 2 * vh / g, vs = carry / T;
    b.st = 'fly'; b.h = range.matY - 0.09; b.vh = vh; b.vx = Math.sin(side) * vs; b.vz = -Math.cos(side) * vs; b.curve = (Math.random() - 0.5) * 0.5 * p; b.landed = false; b.g = g;
    b.word = word || (Math.abs(side) > 0.38 ? 'fore!' : p > 0.55 && Math.abs(side) < 0.07 ? 'nice!' : null);
    if (b.word === 'shank') say('shank');
    // the dotted flight line restarts
    trail.userData.n = 0; trail.geometry.setDrawRange(0, 0); trail.visible = true;
    lastHit = b;
  }
  const _bp = new THREE.Vector3();
  function ballWorld(b, out) {
    const dir = RL(b.x, b.z, out);
    const base = b.st === 'tee' ? radiusAt(dir) + range.matY : b.st === 'rest' ? (b.gr ??= fieldR(dir)) : fieldR(dir);
    return dir.multiplyScalar(base + BALL_R + Math.max(0, b.h));
  }
  function stepBall(b, dt) {
    if (b.st === 'fly' || b.st === 'bounce') {
      b.vx += b.curve * dt; b.x += b.vx * dt; b.z += b.vz * dt;
      b.vh -= b.g * dt; b.h += b.vh * dt;
      // the catch net stops it and it drops
      if (b.z < range.netZ + 0.08 && b.h < 2.2) { b.z = range.netZ + 0.08; b.vx = b.vz = 0; b.curve = 0; }
      if (b.h <= 0 && b.vh < 0) {
        b.h = 0;
        if (!b.landed) { b.landed = true; landed(b); }
        b.vh = -b.vh * 0.34; b.vx *= 0.55; b.vz *= 0.55; b.curve = 0; b.st = 'bounce';
        if (b.vh < 0.35) { b.vh = 0; b.st = 'roll'; }
      }
    } else if (b.st === 'roll') {
      const v = Math.hypot(b.vx, b.vz), nv = Math.max(0, v - 2.2 * dt);
      if (nv <= 0) { b.vx = b.vz = 0; b.st = 'rest'; }
      else { b.vx *= nv / v; b.vz *= nv / v; b.x += b.vx * dt; b.z += b.vz * dt; if (b.z < range.netZ + 0.08) { b.z = range.netZ + 0.08; b.vz = 0; } }
    }
  }
  function landed(b) {
    const yd = yards(b.z);
    ydsEl.textContent = `${yd} yds`; ydsBall = b; ydsT = 3.2; show(ydsEl);
    if (b.word && b.word !== 'shank') say(b.word);
  }
  function placeClub(inst) {
    const bn = inst.bones, hl = bn.handL || bn.lowerarmL, hr = bn.handR || bn.lowerarmR;
    if (!hl || !hr) return;
    const gripP = _a.copy(hl.getWorldPosition(_v)).add(hr.getWorldPosition(_w)).multiplyScalar(0.5);
    const up = st.dir;
    // at address the club runs from her hands to the ball; through the swing it carries on the
    // line of her arms, the wrists cocking it up on the backswing
    const ball = shot.ball && shot.ball.st === 'tee' ? ballWorld(shot.ball, _bp) : _bp.copy(gripP).addScaledVector(up, -0.4).addScaledVector(st.heading, 0.35);
    const toBall = _w.copy(ball).sub(gripP); const len = Math.min(0.75, Math.max(0.5, toBall.length() + 0.01)); toBall.normalize();
    shoulderMid(_v); const arm = _v.subVectors(gripP, _v).normalize();
    const w = Math.min(1, Math.abs(shot.s) * 2.2), back = Math.max(0, -shot.s);
    const dirn = toBall.multiplyScalar(1 - w).addScaledVector(arm, w).addScaledVector(up, 1.1 * back * back).normalize();
    clubG.position.copy(gripP);
    clubG.quaternion.setFromUnitVectors(DOWN, dirn);
    // the club face square to the target line
    clubG.userData.shaft.scale.set(1, len, 1); clubG.userData.headM.position.set(0, -len, 0);
    clubG.updateMatrixWorld(true);
  }
  function updateRange(dt, t) {
    const inst = critic(); if (!inst?.bones?.hips) return;
    // the power meter: up, and back down if she holds on too long
    if (shot.phase === 'charge') {
      shot.p += shot.pd * dt / 1.05;
      if (shot.p >= 1) { shot.p = 1; shot.pd = -1; }
      if (shot.p <= 0.05 && shot.pd < 0) { shot.p = 0.05; shot.pd = 1; }
      shot.s += (-0.25 - 0.75 * shot.p - shot.s) * (1 - Math.exp(-10 * dt));
      setMeter(shot.p, shot.p > 0.78 && shot.p < 0.91 ? 'sweet!' : 'power');
    } else if (shot.phase === 'down') {                 // the downswing: quick
      shot.t += dt; const u = Math.min(1, shot.t / 0.17);
      shot.s = shot.from * (1 - u * u);
      if (u >= 1) { shot.phase = 'thru'; shot.t = 0; strike(); }
    } else if (shot.phase === 'thru') {                 // the follow-through, held a moment, then back to the ball
      shot.t += dt;
      shot.s = shot.t < 0.3 ? ease(shot.t / 0.3) : shot.t < 1.3 ? 1 : 1 - ease(Math.min(1, (shot.t - 1.3) / 0.5));
      if (shot.t > 1.0 && shot.ball?.st !== 'tee' && shot.t < 1.05) teeBall();
      if (shot.t >= 1.8) { shot.phase = 'address'; shot.s = 0; setMeter(0, 'power'); }
    }
    swingPose(inst, shot.s, t);
    // she stands on the mat (it's 0.0225 over the tee line's floor)
    const root = player.root;
    root.position.copy(st.dir).multiplyScalar(radiusAt(st.dir) + range.matY);
    root.updateMatrixWorld(true);
    placeClub(inst);
    // the camera: behind her, down the line, following a ball in the air
    const bx = range.bays[shot.bay];
    // (from the back corner of her bay, high, a wider lens: the back wall is right behind)
    RL(bx - 0.42, range.matZ + 0.58, cam.wantPos); cam.wantPos.multiplyScalar(radiusAt(cam.wantPos) + 1.32);
    RL(bx + 0.45, range.matZ - 1.6, cam.wantLook); cam.wantLook.multiplyScalar(radiusAt(cam.wantLook) + 0.05);
    const fb = balls.find(b => b.live && (b.st === 'fly' || b.st === 'bounce') && b === lastHit);
    if (fb) { ballWorld(fb, _v); cam.wantLook.lerp(_v, 0.55); }
    camEase(dt, 3, 3);
  }
  let lastHit = null;

  function updateBalls(dt) {
    if (!ballFill) return;
    let n = 0;
    for (const b of balls) {
      if (!b.live) continue;
      if (b.st !== 'tee' && b.st !== 'rest') stepBall(b, dt);
      ballWorld(b, _v);
      _q.identity(); _m.compose(_v, _q, _s);
      ballFill.setMatrixAt(n, _m); ballInk.setMatrixAt(n, _m); n++;
    }
    ballFill.count = ballInk.count = n;
    if (n) { ballFill.instanceMatrix.needsUpdate = true; ballInk.instanceMatrix.needsUpdate = true; }
    // the flight line follows the ball in the air
    if (lastHit && trail.visible && (lastHit.st === 'fly' || lastHit.st === 'bounce') && trail.userData.n < 64) {
      const a = trail.geometry.attributes.position, k = trail.userData.n;
      if (!k || _w.fromArray(a.array, (k - 1) * 3).distanceTo(ballWorld(lastHit, _v)) > 0.12) {
        ballWorld(lastHit, _v); a.setXYZ(k, _v.x, _v.y, _v.z); a.needsUpdate = true; trail.userData.n = k + 1;
        trail.geometry.setDrawRange(0, k + 1); trail.computeLineDistances();
      }
    }
  }

  return {
    // pool-local position of the critic while she swims (the swimmer gives way to her)
    swimAt: () => mode === 'swim' ? toPool(st.dir) : null,
    dev: { swim, shot, cam, balls, ballWorld, get mode() { return mode; }, toPool, fromPool },
    update(dt, t) {
      // anything else taking over (the police, the epilogue, a conversation) ends it at once
      if (mode && (G.ui !== 'activity' || G.state !== 'play')) {
        if (mode === 'swim') { if (U) U.uMeOn.value = 0; if (swim.dirn !== 1) { const [x, z] = toPool(st.dir), [ox, oz] = poolEdge(thOf(x, z), 0.3); fromPool(ox, oz, st.dir); } swim.dirn = 0; }
        if (mode === 'range' && clubG) clubG.visible = false;
        end();
      }
      if (mode === 'swim') updateSwim(dt, t);
      else if (mode === 'range') updateRange(dt, t);
      updateBalls(dt);
      // the word fades; the yards label rides over the ball where it landed
      if (wordT > 0) { wordT -= dt; if (wordT <= 0) show(wordEl, false); }
      if (ydsT > 0 && ydsBall && camera) {
        ydsT -= dt;
        ballWorld(ydsBall, _v).project(camera);
        const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
        ydsEl.style.transform = `translate(${((_v.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - _v.y) / 2 * innerHeight).toFixed(1)}px) translate(-50%, -150%) rotate(-2deg)`;
        show(ydsEl, ydsT > 0 && vis && mode === 'range');
      }
    },
  };
}
