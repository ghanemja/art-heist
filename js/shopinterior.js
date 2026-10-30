// ─── INSIDE THE PROJECT SHOPS: the room comes alive when you step in ───────────
// The static set dressing (shelves, rugs, lamps, beams) is baked with the shop in
// buildings.js. This is the part that moves and talks back, and only while you're in:
//  · a few living things per shop (a cat breathing, a yarn ball swinging, a flickering
//    screen, a projector beam, fireflies…) and dust motes drifting in the lamplight
//  · a room camera: it frames the room from just inside the shopfront (which lifts away
//    with the roof), close and warm, instead of the far look down from outside
//  · little cards: walk up to an exhibit and a note about that part of the project
//    pops up beside it (E still opens the project's own card)
//  · the room's own soft sound (audio.setRoom) and a warm vignette over the view
import * as THREE from 'three';
import { paint, ink } from './style.js';
import { radiusAt } from './world.js';
import { audio } from './audio.js';

const SH = { W: 5.6, D: 4.6, H: 3.0, FY: 0.16 };       // must match buildings.js projectShop's shell
const ADD = (col, op) => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

// ── what each shop has to say: [x, z, reach, title, text] in the shop's own frame ──
const NOTES = {
  yarn: [
    [-1.6, 0.6, 0.9, 'Pick a pattern', 'A scarf, a coaster, an amigurumi ball. Choose one and YarnFlow lays out every row before a single stitch.'],
    [1.75, 0.55, 0.95, 'Row by row', 'The work grows in 3D the way it does in your lap: one row, then the next, each stitch looping into the one below.'],
    [0, -1.35, 1.0, 'Every colour', 'Swap the yarn and the whole piece re-dyes as it builds, so you can see the stripes before you buy the skeins.'],
    [0.7, -1.0, 0.7, 'Stitches in 3D', 'Real stitch shapes, not a flat chart: chains, singles, doubles, increases that make a ball round.'],
    [-1.05, 1.45, 0.65, 'Purl, the shop cat', 'Has unravelled more yarn than anyone in town. Please do not disturb the cushion.'],
  ],
  behaviors: [
    [-0.4, -0.6, 1.0, 'The probe bench', 'Every object gets the same pokes: pushed low, pushed high, tilted, dropped. What it does next is its behaviour.'],
    [-1.6, 0.6, 0.85, 'Slid, rolled, tipped', 'The results screen sorts 2,166 SimReady objects by how far they slid, whether they rolled, when they tipped.'],
    [1.9, -0.25, 0.8, 'Search by motion', 'Ask for "things that roll but don\'t bounce" and the index answers from the tests, not from the names.'],
  ],
  deckgpt: [
    [-1.0, -0.9, 0.9, '1 · Scope', 'First it asks what you are sharing and who with. Nothing gets drawn until that is clear.'],
    [1.0, -0.9, 0.9, '2 · Story', 'Then the argument: the beats of the talk, in order, before any slide exists.'],
    [-1.0, 0.95, 0.9, '3 · Visuals', 'Your house style — fonts, colours, the way you draw a chart — applied to every slide.'],
    [1.0, 0.95, 0.9, '4 · Deck', 'And out it comes, a deck you can present or keep editing. Built with you, step by step.'],
  ],
  eyes: [
    [-1.7, -1.0, 0.65, 'Bee · ultraviolet', 'Borrow a bee\'s eyes and the flowers grow landing strips, patterns only ultraviolet can show.'],
    [-0.55, -1.2, 0.6, 'Snake · heat', 'Heat pits: everything warm glows. Hidden animals give themselves away by being alive.'],
    [0.6, -1.2, 0.6, 'Bat · echoes', 'Close your eyes and listen: the room draws itself out of sound.'],
    [1.75, -1.0, 0.65, 'Owl · the night', 'Photograph the owl and the dark stops being dark.'],
    [1.9, 0.9, 0.7, 'Fourteen hidden', 'Fourteen animals hide in the game. Each one you photograph lends you a new way of seeing.'],
  ],
  splat: [
    [1.6, 0.3, 0.85, 'Five media', 'Watercolour, acrylic, charcoal, torn paper, marker: every component comes in each one, painted for real.'],
    [0, -1.5, 1.0, 'Painted components', 'Buttons, cards, inputs — scanned from real paint, so no two edges are quite the same.'],
    [-1.6, 0.4, 0.8, 'One attribute', 'Set the medium once on the page and the whole site repaints itself.'],
  ],
  qr: [
    [0, -0.05, 1.1, 'The map table', 'America\'s biggest companies on a 3D map, seven regions, each company a little model.'],
    [1.3, -0.15, 0.6, 'Into pixels', 'Tap a company and it breaks into pixels that fall and land on its QR code.'],
    [-2.0, 0.9, 0.7, 'Find your way', 'Scan the code and it takes you there: the map is a compass for the real thing.'],
  ],
};
const ROOM = { yarn: 'cosy', behaviors: 'hum', deckgpt: 'reel', eyes: 'night', splat: 'studio', qr: 'studio' };
const MOTES = { yarn: 0xffd9a0, behaviors: 0xd8ffb0, deckgpt: 0xfff0c8, eyes: 0xf2d27a, splat: 0xffc6b0, qr: 0xffe0a8 };

// ── the living things, per shop: returns a tick(t, dt) ──
function live(style, g) {
  const fy = SH.FY, ticks = [];
  const put = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  if (style === 'yarn') {
    // a yarn ball hanging on its strand from the middle beam, swinging slowly
    const piv = new THREE.Group(); piv.position.set(-0.35, SH.H - 0.14, 0); g.add(piv);
    put(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 4), paint(0xc4607e), 0, -0.55, 0, piv);
    const ball = put(new THREE.SphereGeometry(0.15, 16, 12), paint(0xe1b95c), 0, -1.22, 0, piv);
    for (let k = 0; k < 4; k++) put(new THREE.TorusGeometry(0.152, 0.012, 5, 22), paint(0xc8963a), 0, 0, 0, ball).rotation.set(k * 0.8, k * 0.5, 0);
    ticks.push((t) => { piv.rotation.z = Math.sin(t * 1.1) * 0.22; piv.rotation.x = Math.sin(t * 0.7 + 1) * 0.08; ball.rotation.y = t * 0.6; });
    // Purl, curled asleep on the cushion: breathing, a tail that flicks, an ear that twitches
    const cat = new THREE.Group(); cat.position.set(-1.05, fy + 0.1, 1.5); cat.rotation.y = 0.6; g.add(cat);
    const fur = paint(0xd58b63), furL = paint(0xf6eedb);
    const body = put(new THREE.SphereGeometry(0.2, 16, 12), fur, 0, 0.12, 0, cat); body.scale.set(1.25, 0.7, 1);
    const head = put(new THREE.SphereGeometry(0.11, 14, 10), fur, 0.2, 0.12, 0.1, cat);
    put(new THREE.SphereGeometry(0.06, 10, 8), furL, 0.27, 0.09, 0.15, cat);
    const ears = [-1, 1].map(s => { const e = put(new THREE.ConeGeometry(0.04, 0.08, 6), fur, 0.22 + s * 0.05, 0.22, 0.08, cat); e.rotation.z = -s * 0.3; return e; });
    for (const s of [-1, 1]) put(new THREE.BoxGeometry(0.035, 0.006, 0.006), paint(0x2a2230, { hatch: 0 }), 0.26 + s * 0.035, 0.15, 0.2, cat);   // closed eyes
    const tailP = new THREE.Group(); tailP.position.set(-0.22, 0.06, 0); cat.add(tailP);
    put(new THREE.TorusGeometry(0.16, 0.035, 6, 14, Math.PI), fur, 0, 0, 0.12, tailP).rotation.x = -Math.PI / 2;
    ticks.push((t) => {
      const br = 1 + Math.sin(t * 2.1) * 0.035; body.scale.set(1.25 * br, 0.7 * br, br);
      head.position.y = 0.12 + Math.sin(t * 2.1) * 0.006;
      tailP.rotation.y = Math.sin(t * 0.9) * 0.35 + (Math.sin(t * 0.31) > 0.92 ? Math.sin(t * 9) * 0.25 : 0);
      ears[1].rotation.x = Math.sin(t * 0.5) > 0.96 ? Math.sin(t * 30) * 0.3 : 0;
    });
  } else if (style === 'behaviors') {
    // the results screen, live: the bars re-measure every few beats; a ball rolls down the bench
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 160;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const draw = (t) => { const c = cv.getContext('2d'); c.fillStyle = '#1d232a'; c.fillRect(0, 0, 256, 160); c.fillStyle = '#b8f05a'; c.font = '700 22px sans-serif'; c.fillText('slid / rolled / tipped', 14, 26);
      for (let i = 0; i < 6; i++) { const v = 0.3 + 0.6 * Math.abs(Math.sin(i * 1.7 + Math.floor(t / 2.2) * 0.9)); c.fillStyle = i % 2 ? '#76b900' : '#b8f05a'; c.fillRect(20 + i * 38, 144 - v * 100, 26, v * 100); }
      if (Math.floor(t * 2) % 2) { c.fillStyle = '#b8f05a'; c.fillRect(230, 10, 10, 10); } tex.needsUpdate = true; };
    const scr = new THREE.Group(); scr.position.set(-1.6, 0, 0.6); scr.rotation.y = 0.5; g.add(scr);
    const m = put(new THREE.PlaneGeometry(0.92, 0.58), new THREE.MeshBasicMaterial({ map: tex }), 0, fy + 1.55, 0.066, scr); m.userData.noInk = true;
    const glow = put(new THREE.PlaneGeometry(1.4, 1.0), ADD(0x76b900, 0.08), 0, fy + 1.55, 0.1, scr); glow.userData.noInk = true;
    let last = -1;
    const roll = put(new THREE.SphereGeometry(0.07, 12, 8), paint(0xe8604c), 0, 0, 0);
    const leds = [];
    for (let k = 0; k < 6; k++) for (const dz of [-0.2, 0.12]) leds.push(put(new THREE.SphereGeometry(0.018, 6, 5), new THREE.MeshBasicMaterial({ color: k % 2 ? 0xb8f05a : 0xffb347 }), 2.09, fy + 0.3 + k * 0.27, -0.25 + dz));
    ticks.push((t) => {
      if (Math.floor(t * 4) !== last) { last = Math.floor(t * 4); draw(t); }
      glow.material.opacity = 0.06 + 0.03 * Math.sin(t * 13) * Math.sin(t * 3.1);
      const k = (t * 0.35) % 1, x = -0.2 - k * 1.2; roll.position.set(x, fy + 0.98 + (x + 0.8) * 0.31 + 0.085, -1.25); roll.rotation.z = k * 14;   // down the tilted ramp
      leds.forEach((l, i) => { l.visible = Math.sin(t * (2 + i % 5) + i * 1.7) > -0.2; });
    });
  } else if (style === 'deckgpt') {
    // the screen runs the four stages as slides; the projector's beam, dust turning in it
    const slides = ['Scope', 'Story', 'Visuals', 'Deck'].map((name, i) => {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 260; const c = cv.getContext('2d');
      c.fillStyle = '#f6eedb'; c.fillRect(0, 0, 512, 260); c.fillStyle = '#a94848'; c.fillRect(0, 0, 512, 54);
      c.fillStyle = '#f6eedb'; c.font = '700 38px serif'; c.fillText(`${i + 1} · ${name}`, 22, 40);
      c.fillStyle = '#2a2230'; c.font = '400 26px sans-serif';
      [['what are you sharing?', 'and who is it for?'], ['the argument, beat by beat', 'before any slide exists'], ['your fonts, your colours', 'your way of drawing a chart'], ['present it,', 'or keep editing']][i].forEach((l, j) => c.fillText(l, 34, 110 + j * 44));
      c.fillStyle = ['#e1b95c', '#7fb3a8', '#dc9e9a', '#a94848'][i]; c.fillRect(360, 90, 120, 120);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    });
    const sm = new THREE.MeshBasicMaterial({ map: slides[0] });
    put(new THREE.PlaneGeometry(3.4, 1.72), sm, 0, fy + 1.45, -1.95 + 0.085).userData.noInk = true;
    const from = new THREE.Vector3(-1.7 - 0.43 * Math.sin(0.3), SH.H - 0.43, 1.45 - 0.43 * Math.cos(0.3)), to = new THREE.Vector3(0, fy + 1.45, -1.85), L = from.distanceTo(to);
    const cone = new THREE.CylinderGeometry(0.07, 1.5, L, 24, 1, true); cone.translate(0, -L / 2, 0); cone.rotateX(-Math.PI / 2);   // apex at the lens, opening along +z
    const beam = put(cone, ADD(0xfff0c8, 0.07), from.x, from.y, from.z); beam.userData.noInk = true;
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().sub(from).normalize());
    let cur = 0;
    ticks.push((t) => { const i = Math.floor(t / 4) % 4; if (i !== cur) { cur = i; sm.map = slides[i]; sm.needsUpdate = true; }
      beam.material.opacity = 0.06 + 0.012 * Math.sin(t * 23) + 0.008 * Math.sin(t * 7.3); });
  } else if (style === 'eyes') {
    // fireflies drift round the room; a bee hovers in loops over its pedestal; the lens catches the light
    const bee = new THREE.Group(); g.add(bee);
    const bb = put(new THREE.SphereGeometry(0.06, 10, 8), paint(0xe1b95c), 0, 0, 0, bee); bb.scale.set(1, 0.85, 1.4);
    put(new THREE.TorusGeometry(0.05, 0.012, 5, 12), paint(0x2a2230), 0, 0, 0, bee);
    const wings = [-1, 1].map(s => { const w = put(new THREE.SphereGeometry(0.045, 8, 6), ADD(0xdfe9f2, 0.6), s * 0.05, 0.05, 0, bee); w.scale.set(1, 0.3, 0.7); return w; });
    const shine = put(new THREE.PlaneGeometry(0.12, 0.5), ADD(0xffffff, 0.25), 0, 0, 0); shine.userData.noInk = true;
    const lens = new THREE.Group(); lens.position.set(1.9, fy + 1.45, 0.9); lens.rotation.y = -0.7; g.add(lens); lens.add(shine);
    ticks.push((t) => {
      bee.position.set(-1.7 + Math.cos(t * 1.3) * 0.35, fy + 1.35 + Math.sin(t * 2.6) * 0.08, -1.4 + Math.sin(t * 1.3) * 0.25);
      bee.rotation.y = -t * 1.3; wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * Math.sin(t * 60) * 0.6; });
      shine.position.x = Math.sin(t * 0.6) * 0.25; shine.rotation.z = 0.5;
    });
  } else if (style === 'splat') {
    // a brush at the swatch board, laying down a stroke and lifting off, over and over
    const ea = new THREE.Group(); ea.position.set(1.6, 0, 0.3); ea.rotation.y = -0.5; g.add(ea);
    const br = new THREE.Group(); ea.add(br);
    put(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 8), paint(0xd58b63), 0, 0.25, 0, br);
    put(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 8), paint(0xb8bec6), 0, 0.02, 0, br);
    put(new THREE.ConeGeometry(0.035, 0.08, 8), paint(0xe8604c), 0, -0.05, 0, br).rotation.x = Math.PI;
    ticks.push((t) => { const k = (t * 0.45) % 1, on = k < 0.6; br.position.set(-0.3 + (on ? k / 0.6 : 1 - (k - 0.6) / 0.4) * 0.5, fy + 1.0 + (on ? 0 : 0.15 * Math.sin((k - 0.6) / 0.4 * Math.PI)) + Math.sin(k * 20) * 0.01, 0.16 + (on ? 0 : 0.08));
      br.rotation.z = -0.6; br.rotation.x = 0.3; });
  } else if (style === 'qr') {
    // pixels keep tumbling into the QR code on the table; the globe turns
    const pix = [];
    for (let k = 0; k < 8; k++) pix.push(put(new THREE.BoxGeometry(0.06, 0.06, 0.06), paint(k % 2 ? 0xf3ead7 : 0x2a2230), 0, 0, 0));
    const globe = put(new THREE.SphereGeometry(0.31, 20, 14), paint(0xffffff, { hatch: 0, map: (() => { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const c = cv.getContext('2d'); c.fillStyle = '#8fc3c9'; c.fillRect(0, 0, 128, 64); c.fillStyle = '#a8b994'; [[20, 22, 18], [52, 36, 14], [86, 20, 16], [104, 44, 10]].forEach(([x, y, r]) => { c.beginPath(); c.ellipse(x, y, r, r * 0.6, 0.3, 0, 7); c.fill(); }); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })() }), -2.0, fy + 1.15, 0.9);
    ticks.push((t, dt) => {
      globe.rotation.y += dt * 0.5;
      pix.forEach((p, i) => { const k = (t * 0.6 + i / pix.length) % 1; p.position.set(1.3 - (i % 3) * 0.1 + Math.sin(i) * 0.05, fy + 1.0 + (1 - k) * 0.9, -0.13 + (i % 2) * 0.06); p.rotation.set(k * 6, k * 4 + i, 0); p.visible = k < 0.97; });
    });
  }
  return ticks;
}

// dust motes drifting in the lamplight: one points cloud per shop, additive
function motes(col) {
  const N = 46, pos = new Float32Array(N * 3), seed = [];
  for (let i = 0; i < N; i++) seed.push([(Math.random() - 0.5) * (SH.W - 0.8), SH.FY + 0.4 + Math.random() * 2.2, (Math.random() - 0.5) * (SH.D - 0.8), Math.random() * 6]);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: col, size: 0.035, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.userData.noInk = true; pts.frustumCulled = false;
  const tick = (t) => { for (let i = 0; i < N; i++) { const [x, y, z, p] = seed[i]; pos[i * 3] = x + Math.sin(t * 0.21 + p) * 0.25; pos[i * 3 + 1] = y + Math.sin(t * 0.13 + p * 2) * 0.3; pos[i * 3 + 2] = z + Math.cos(t * 0.17 + p) * 0.25; } geo.attributes.position.needsUpdate = true; };
  return { pts, tick };
}

// ── the DOM bits: the exhibit card and the warm vignette ──
function dom() {
  const note = document.createElement('div');
  note.id = 'shopNote'; note.className = 'ui sk fade hide';
  Object.assign(note.style, { left: '50%', bottom: 'calc(11vh + 70px)', transform: 'translateX(-50%) rotate(-0.6deg)', maxWidth: 'min(380px, 86vw)', padding: '10px 18px 12px', zIndex: 12, pointerEvents: 'none', textAlign: 'left' });
  const glow = document.createElement('div');
  glow.id = 'roomGlow'; glow.className = 'fade hide';
  Object.assign(glow.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 5, background: 'radial-gradient(ellipse at 50% 55%, rgba(255,200,130,0) 45%, rgba(120,62,30,0.32) 100%)', mixBlendMode: 'multiply' });
  document.body.append(glow, note);
  return { note, glow };
}

// ── set up: once per placed shop. `base` is the placed (baked) base group ──
export function createShopInteriors(scene, shops) {
  const D = dom(), up = new THREE.Vector3();
  const list = shops.map((lm) => {
    const g = new THREE.Group();
    g.position.copy(lm.root.position); g.quaternion.copy(lm.root.quaternion); g.visible = false;
    scene.add(g);
    const ticks = live(lm.style, g), M = motes(MOTES[lm.style] ?? 0xffe0b0); g.add(M.pts); ticks.push(M.tick);
    // the shop was laid onto the terrain (placeOnPlanet, sink 0.04): its local y=0 isn't exactly
    // the ground, so lift the whole live layer by the difference at the shop's middle
    g.updateMatrixWorld(true);
    const c = g.localToWorld(new THREE.Vector3(0, 0, 0)), d = c.clone().normalize();
    g.position.addScaledVector(d, radiusAt(d) - 0.04 - c.length());
    ink(g, 'fine');
    return { lm, g, ticks, notes: NOTES[lm.style] || [] };
  });
  const _p = new THREE.Vector3(), _w = new THREE.Vector3(), cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
  let inside = null, shownNote = null;
  const local = (S, dir) => S.lm.root.worldToLocal(_p.copy(dir).multiplyScalar(40));
  // the room camera: from just inside the (lifted-away) shopfront, a little above her, eased
  const roomCam = (camera, root) => {
    const S = inside; if (!S) return;
    const p = S.lm.root.worldToLocal(_w.copy(root.position));
    const want = S.lm.root.localToWorld(new THREE.Vector3(THREE.MathUtils.clamp(p.x * 0.55, -1.5, 1.5), SH.FY + 2.25, Math.min(SH.D / 2 + 0.85, p.z + 2.7)));
    const look = S.lm.root.localToWorld(new THREE.Vector3(p.x * 0.8, SH.FY + 0.75, p.z - 0.6));
    if (!cam.init) { cam.pos.copy(camera.position); cam.look.copy(want.clone().lerp(look, 0.5)); cam.init = true; }
    cam.pos.lerp(want, 0.08); cam.look.lerp(look, 0.12);
    camera.position.copy(cam.pos); camera.up.copy(up.copy(S.lm.root.position).normalize()); camera.lookAt(cam.look);
  };
  return {
    update(dt, t, player) {
      const st = player.st, here = st.mode === 'walk' ? st.dir : null;
      let now = null;
      for (const S of list) {
        const near = here && S.lm.dir.dot(here) > 0.985;          // within ~7 units: worth drawing
        if (near) { const p = local(S, here); if (S.lm.inside(p.x, p.z)) now = S; }
        S.g.visible = !!near;
      }
      if (now !== inside) {
        if (inside && st.camHook === roomCam) { st.camHook = null; st.camInit = false; }
        inside = now; cam.init = false;
        audio.setRoom(inside ? ROOM[inside.lm.style] : null);
        D.glow.classList.toggle('hide', !inside);
        if (inside) {                                                       // walk "into the room": W heads for the back wall
          const a = inside.lm.root.localToWorld(new THREE.Vector3(0, 0, 0)), b = inside.lm.root.localToWorld(new THREE.Vector3(0, 0, -1));
          st.camFwd.copy(b.sub(a)).projectOnPlane(st.dir).normalize();
        }
      }
      if (inside && !st.camHook && st.enabled) st.camHook = roomCam;      // (a conversation's camera wins while it lasts)
      if (inside) for (const tk of inside.ticks) tk(t, dt);
      // the nearest exhibit's card
      let best = null;
      if (inside && st.enabled) {
        const p = local(inside, here); let bd = 1e9;
        for (const n of inside.notes) { const dd = Math.hypot(p.x - n[0], p.z - n[1]); if (dd < n[2] && dd < bd) { bd = dd; best = n; } }
      }
      if (best !== shownNote) {
        shownNote = best;
        if (best) D.note.innerHTML = `<b style="font-size:20px">${best[3]}</b><br><span style="font-size:17px">${best[4]}</span>`;
        D.note.classList.toggle('hide', !best);
      }
    },
  };
}
