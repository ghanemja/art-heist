// ─── THE CASE: things to find, people to ask, a theory to prove ─────────────
// Nothing tells you what a clue means. You walk up to something, look closer,
// and your notebook records what you SAW. People tell you what THEY saw. When
// you think you know, you name someone and back it with two things you found.
import * as THREE from 'three';
import { R, arc, settle, frame, yawToFace, radiusAt, groundAt, standAt } from './world.js';
import { PAL, paint, ink, blobShadow } from './style.js';
import { rbox, lathe, bench, rnd } from './props.js';
import { person, LOOKS } from './human.js';

// the people (and who did it — the game never says so out loud)
export const SUSPECTS = {
  rex:  { name: 'Rex Calloway', role: 'framer, Frame & Co.' },
  pia:  { name: 'Pia Moreno', role: 'bike courier' },
  otto: { name: 'Otto Brandt', role: 'night guard' },
};
export const CULPRIT = 'rex';
// the places worth looking around, for the case board
export const PLACES = [
  { id: 'museum', name: 'the museum' },
  { id: 'main', name: 'Main Street' },
  { id: 'harbour', name: 'the harbour' },
  { id: 'station', name: 'Central Station' },
];

// what you can find. `proves` is hidden: it's only used to judge your theory.
// `where` is the place it's found — the case board counts finds per place.
export const CLUES = [
  { id: 'ladder', where: 'museum', title: 'The ladder',
    text: 'An aluminium ladder against the east wing. The feet have sunk deep into the lawn — whoever came down it was heavy, or carrying something heavy.', proves: [] },
  { id: 'frames', where: 'museum', title: 'The empty frame',
    text: 'The canvas wasn\'t torn out. It was cut — one straight line, close to the stretcher, the way a professional trims a print.', proves: ['rex'] },
  { id: 'ruts', where: 'museum', title: 'Tyre ruts',
    text: 'Behind the service door, deep ruts in the soft verge. Wide tyres, and two side by side at the back — something heavy, with twin rear wheels.', proves: ['rex'] },
  { id: 'van', where: 'main', title: 'The white van',
    text: 'A white van, rear doors not quite shut. Inside: packing foam, corner protectors, and a roll of the museum\'s own grey gallery tape. The side says FRAME & CO.', proves: ['rex'] },
  { id: 'bike', where: 'main', title: 'The courier\'s bike',
    text: 'Paint on the handlebars and the frame — but it\'s dry, cracked, and it has dust in it. Weeks old.', proves: [], clears: 'pia' },
  { id: 'log', where: 'museum', title: 'The guard\'s logbook',
    text: 'Rounds signed at 1:00, 2:00, 3:00 and 4:00 — same pen, same pressure, same slant. As if all four were written at once. A cold coffee beside it, untouched.', proves: [], hint: 'otto' },
  { id: 'crates', where: 'harbour', title: 'Crates at the harbour',
    text: 'Flat crates stamped CATERING — CAPE FAR SIDE. One corner is splintered, and through the gap: gilt. A picture frame.', proves: [] },
  { id: 'ticket', where: 'station', title: 'A cargo ticket',
    text: 'Dropped by the freight door: “Cape Far Side, oversize, flat, 45 items. Account: Frame & Co.”', proves: ['rex'] },
];

// people you can talk to. Each says what they saw — not what it means.
export const PEOPLE = [
  { id: 'vivi', name: 'Director Vivi', colors: [PAL.accent, PAL.ink],
    lines: [
      'You came. Thank heavens. Forty-five canvases, gone in one night — through the dome, of all places.',
      'The police have nothing. I had three people with keys or reasons to be here last night: Otto on the night shift, Pia who brought the last delivery, and Rex — he framed the whole show.',
      'Look around. Talk to them. When you know who, come back and show me why.',
    ] },
  { id: 'otto', name: 'Otto, night guard', colors: [PAL.dusty, PAL.ink],
    lines: [
      'I did my rounds! Every hour, it\'s all in the log.',
      '…Alright. I may have rested my eyes. Once. Maybe twice. But I heard an engine around three — something big, round the back.',
    ] },
  { id: 'pia', name: 'Pia, courier', colors: [PAL.teal, PAL.ink],
    lines: [
      'Me? I dropped the last crate at six and went home. Ask the café, I was here till close.',
      'Funny thing — Rex\'s van went past here at dawn. He never opens before ten.',
    ] },
  { id: 'rex', name: 'Rex, framer', colors: [PAL.mustard, PAL.ink],
    lines: [
      'Terrible business. Terrible. I framed every one of those pieces myself, you know.',
      'Last night? Home. Asleep. The van\'s been parked right here since yesterday.',
    ] },
];

// ── props for the case ──
function ladderProp() {
  const g = new THREE.Group(), alu = paint(0xc7ccd2);
  for (const s of [-1, 1]) g.add(new THREE.Mesh(rbox(0.07, 3.6, 0.07, 0.03), alu).translateX(s * 0.24).translateY(1.8));
  for (let k = 0; k < 10; k++) g.add(new THREE.Mesh(rbox(0.5, 0.05, 0.05, 0.02), alu).translateY(0.25 + k * 0.34));
  g.rotation.x = -0.22;
  return ink(g, 'fine');
}
function ruts() {
  const g = new THREE.Group(), mud = paint(0x8a6a52, { hatch: 0 });
  for (const x of [-0.9, -0.62, 0.62, 0.9]) {
    const r = new THREE.Mesh(rbox(0.22, 0.03, 3.4, 0.01), mud); r.position.set(x, 0.02, 0); g.add(r);
  }
  return g;
}
function van() {
  const g = new THREE.Group(), white = paint(0xf4f1ea), dark = paint(PAL.ink, { hatch: 0 });
  g.add(new THREE.Mesh(rbox(1.5, 1.45, 3.2, 0.25, 3), white).translateY(1.05));
  g.add(new THREE.Mesh(rbox(1.42, 0.55, 0.9, 0.18, 2), white).translateY(0.62).translateZ(1.95));
  const ws = new THREE.Mesh(rbox(1.3, 0.5, 0.06, 0.03), paint(0x9fc4cc, { hatch: 0 })); ws.position.set(0, 1.25, 1.62); ws.rotation.x = -0.25; g.add(ws);
  // FRAME & CO. painted on the side
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
  const c = cv.getContext('2d'); c.fillStyle = '#f4f1ea'; c.fillRect(0, 0, 256, 96);
  c.fillStyle = '#2a2230'; c.font = '700 40px "Patrick Hand", "Comic Sans MS", cursive'; c.textAlign = 'center'; c.fillText('FRAME & CO.', 128, 60);
  c.strokeStyle = '#2a2230'; c.lineWidth = 4; c.strokeRect(14, 14, 228, 68);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), paint(0xffffff, { map: tx, hatch: 0 })); p.position.set(s * 0.77, 1.15, 0); p.rotation.y = s * Math.PI / 2; p.userData.noInk = true; g.add(p); }
  const tyre = lathe([[0.15, -0.1], [0.3, -0.1], [0.33, 0], [0.3, 0.1], [0.15, 0.1]], 16).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-0.72, 1.2], [0.72, 1.2], [-0.72, -1.1], [0.72, -1.1], [-0.52, -1.1], [0.52, -1.1]]) g.add(new THREE.Mesh(tyre, dark).translateX(x).translateY(0.32).translateZ(z));
  // rear doors ajar
  const door = new THREE.Mesh(rbox(0.7, 1.3, 0.06, 0.03), white); door.position.set(0.62, 1.0, -1.62); door.rotation.y = 0.5; g.add(door);
  g.add(blobShadow(1.0, 1.9));
  return ink(g, 'mid');
}
function bikeProp() {
  const g = new THREE.Group(), frameM = paint(PAL.teal), dark = paint(PAL.ink, { hatch: 0 });
  const wheel = new THREE.TorusGeometry(0.34, 0.04, 8, 24);
  for (const z of [-0.55, 0.55]) g.add(new THREE.Mesh(wheel, dark).translateY(0.36).translateZ(z).rotateY(Math.PI / 2));
  const bar = (a, b) => { const v = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, v.length(), 6), frameM); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); g.add(m); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  bar(V(0, 0.36, -0.55), V(0, 0.8, -0.1)); bar(V(0, 0.8, -0.1), V(0, 0.82, 0.4)); bar(V(0, 0.36, 0.55), V(0, 0.95, 0.42));
  bar(V(0, 0.36, -0.55), V(0, 0.45, 0.1)); bar(V(0, 0.45, 0.1), V(0, 0.82, 0.4));
  g.add(new THREE.Mesh(rbox(0.5, 0.05, 0.05, 0.02), dark).translateY(0.98).translateZ(0.45));
  // splashes of old paint
  for (const [c, y, z] of [[PAL.accent, 0.7, 0.1], [PAL.mustard, 0.6, -0.3], [PAL.dusty, 0.9, 0.3]])
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), paint(c)).translateY(y).translateZ(z).translateX(0.03));
  g.rotation.z = 0.12;
  return ink(g, 'fine');
}
function crates() {
  const g = new THREE.Group(), wood = paint(0xc9a06a);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d'); c.fillStyle = '#c9a06a'; c.fillRect(0, 0, 256, 128);
  c.fillStyle = '#5a3a24'; c.font = '700 26px "Patrick Hand", cursive'; c.textAlign = 'center';
  c.fillText('CATERING', 128, 52); c.font = '600 20px "Patrick Hand", cursive'; c.fillText('— CAPE FAR SIDE —', 128, 86);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const lab = paint(0xffffff, { map: tx, hatch: 0 });
  for (let i = 0; i < 4; i++) {
    const cr = new THREE.Mesh(rbox(1.5, 1.0, 0.25, 0.04), wood);
    cr.position.set((i % 2) * 1.6 - 0.8, 0.5 + Math.floor(i / 2) * 1.02, (i % 2) * 0.1); cr.rotation.y = (i - 1.5) * 0.06; g.add(cr);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), lab); l.position.set(cr.position.x, cr.position.y, cr.position.z + 0.13); l.rotation.y = cr.rotation.y; l.userData.noInk = true; g.add(l);
  }
  // the splintered corner shows gilt
  g.add(new THREE.Mesh(rbox(0.2, 0.2, 0.08, 0.02), paint(PAL.gold)).translateX(0.05).translateY(1.0).translateZ(0.15));
  g.add(blobShadow(1.8, 0.6));
  return ink(g, 'fine');
}
// stand-ins used only for the notebook sketches (things with no prop of their own)
export function sketchProp(id) {
  if (id === 'frames') {             // the empty gilt frame, canvas cut out
    const g = new THREE.Group(), gilt = paint(0xd9a640), back = paint(0x2a2230, { hatch: 0 });
    for (const [w, h, x, y] of [[1.0, 0.14, 0, 0.43], [1.0, 0.14, 0, -0.43], [0.14, 1.0, 0.43, 0], [0.14, 1.0, -0.43, 0]])
      g.add(new THREE.Mesh(rbox(w, h, 0.1, 0.03), gilt).translateX(x).translateY(y));
    g.add(new THREE.Mesh(rbox(0.74, 0.74, 0.02, 0.005), back).translateZ(-0.03));
    const flap = new THREE.Mesh(rbox(0.3, 0.06, 0.012, 0.004), paint(0xb8894a)); flap.position.set(0.22, -0.34, 0.01); flap.rotation.z = 0.5; g.add(flap);
    g.rotation.y = -0.5;
    return ink(g, 'fine');
  }
  if (id === 'log') {                // the guard's logbook, open, a pen across it
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const pg = new THREE.Mesh(rbox(0.42, 0.03, 0.56, 0.01), paint(0xfaf3e2)); pg.position.x = s * 0.22; pg.rotation.z = -s * 0.06; g.add(pg); }
    g.add(new THREE.Mesh(rbox(0.9, 0.025, 0.6, 0.01), paint(0x3a5a8a)).translateY(-0.03));
    for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.005, 0.015), paint(0x5a4e5e, { hatch: 0 })); l.position.set(0.22, 0.03, -0.18 + i * 0.12); l.userData.noInk = true; g.add(l); }
    const pen = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.4, 3, 6), paint(0x2a2230, { hatch: 0 })); pen.rotation.set(Math.PI / 2, 0, 0.6); pen.position.set(-0.1, 0.05, 0.05); g.add(pen);
    return ink(g, 'fine');
  }
  return null;
}

function booth() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(rbox(1.3, 2.0, 1.3, 0.15), paint(PAL.dusty)).translateY(1.0));
  g.add(new THREE.Mesh(rbox(1.5, 0.18, 1.5, 0.08), paint(PAL.cream)).translateY(2.09));
  const w = new THREE.Mesh(rbox(0.9, 0.6, 0.06, 0.03), paint(0x9fc4cc, { hatch: 0 })); w.position.set(0, 1.35, 0.65); g.add(w);
  g.add(new THREE.Mesh(rbox(0.6, 0.06, 0.3, 0.02), paint(0xf4f1ea)).translateY(1.0).translateZ(0.82));   // the logbook on the sill
  g.add(blobShadow(0.9));
  return ink(g, 'mid');
}
function ticket() {
  const g = new THREE.Group();
  const t = new THREE.Mesh(rbox(0.5, 0.02, 0.28, 0.01), paint(0xf4e6b8));
  t.position.y = 0.03; t.rotation.y = 0.4; g.add(t);
  return ink(g, 'fine');
}
function cafe() {
  // two bistro tables on the pavement under the café's awning
  const g = new THREE.Group();
  for (const x of [-0.5, 0.5]) {
    const t = new THREE.Group();
    t.add(new THREE.Mesh(lathe([[0.001, 0], [0.18, 0], [0.04, 0.06], [0.03, 0.62], [0.26, 0.64], [0.26, 0.69], [0.001, 0.69]], 16), paint(PAL.cream)));
    t.position.set(x, 0.07, 0); g.add(t);
    for (const s of [-1, 1]) {
      const ch = new THREE.Group();
      ch.add(new THREE.Mesh(lathe([[0.001, 0], [0.13, 0], [0.13, 0.04], [0.03, 0.06], [0.03, 0.38], [0.15, 0.4], [0.15, 0.44], [0.001, 0.44]], 14), paint(0x4f8a7e)));
      const back = new THREE.Mesh(rbox(0.26, 0.24, 0.03, 0.012), paint(0x4f8a7e)); back.position.set(0, 0.58, -0.13); ch.add(back);
      ch.position.set(x, 0.07, s * 0.36); ch.rotation.y = s > 0 ? Math.PI : 0; g.add(ch);
    }
    const cup = new THREE.Mesh(lathe([[0.001, 0], [0.035, 0], [0.045, 0.06], [0.001, 0.06]], 10), paint(0xf6eedb)); cup.position.set(x + 0.06, 0.76, 0.02); g.add(cup);
  }
  return ink(g, 'fine');
}

// ── place the case in the world ──
// spots: { museum frame, town frame, sites } — resolved by main.js
export function buildCase(scene, W) {
  const items = [];                                   // inspectables + people: {dir, radius, kind, id}
  const place = (obj, d, yaw = 0) => { settle(obj, d, 0.6, 0.03, yaw); scene.add(obj); return obj; };
  const mF = W.museumFrame;
  // at the museum
  { const d = mF(7.9, -7.6); const l = ladderProp(); place(l, d, yawToFace(d, mF(6.8, -7.6))); items.push({ kind: 'clue', id: 'ladder', dir: d, obj: l }); }
  { const d = mF(2.2, 0.6); items.push({ kind: 'clue', id: 'frames', dir: d }); }          // the easel's empty frame
  { const d = mF(0, -13.2); const r = ruts(); place(r, d, yawToFace(d, mF(0, -20))); items.push({ kind: 'clue', id: 'ruts', dir: d, obj: r }); }
  { const d = mF(-6.6, 1.2); const b = booth(); place(b, d, yawToFace(d, mF(0, 1))); items.push({ kind: 'clue', id: 'log', dir: mF(-6.0, 2.0), obj: b }); W.solid(d, 0.8); }
  // downtown: the van outside Frame & Co., the café with Pia's bike
  { const d = W.townAt(W.vanSpot); const v = van(); place(v, d, W.vanYaw); items.push({ kind: 'clue', id: 'van', dir: d, obj: v }); W.solid(d, 1.1); }
  { const d = W.townAt(W.cafeSpot); const c = cafe(); place(c, d, yawToFace(d, W.townAt([W.cafeSpot[0], 0]))); W.solid(d, 0.55);
    const bd = W.townAt([W.cafeSpot[0] + 1.05, W.cafeSpot[1] - 0.45]); const b = bikeProp(); place(b, bd, yawToFace(bd, W.townAt([W.cafeSpot[0] + 1.05, 0])) + Math.PI / 2);
    items.push({ kind: 'clue', id: 'bike', dir: bd, obj: b }); }
  // the harbour crates and the station ticket
  { const d = W.siteAt('harbour', [2.2, 0.5]); const c = crates(); place(c, d, yawToFace(d, W.sites.harbour.dir)); items.push({ kind: 'clue', id: 'crates', dir: d, obj: c }); W.solid(d, 1.2); }
  { const d = W.siteAt('station', [-2.6, 1.6]); const t = ticket(); place(t, d); items.push({ kind: 'clue', id: 'ticket', dir: d, obj: t }); }
  // people
  const at = { vivi: mF(-1.4, 1.6), otto: mF(-5.6, 2.4), pia: W.townAt([W.cafeSpot[0] - 1.35, W.cafeSpot[1] - 0.25]), rex: W.townAt([W.vanSpot[0] + 1.6, W.vanSpot[1] + 1.6]) };
  for (const p of PEOPLE) {
    const d = at[p.id];
    const m = person(LOOKS[p.id]);
    settle(m, d, 0.25, 0, yawToFace(d, mF(0, 6))); m.position.setLength(standAt(d)); scene.add(m);   // people stand ON the ground/road (no sink)
    items.push({ kind: 'person', id: p.id, dir: d, obj: m });
    W.solid(d, 0.35);
  }
  // a faint, hand-drawn glint over anything you haven't looked at yet
  for (const it of items) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex(it.kind), transparent: true, depthWrite: false }));
    s.scale.setScalar(0.7);
    s.position.copy(it.dir).multiplyScalar(groundAt(it.dir) + (it.kind === 'person' ? 1.75 : 1.6));
    scene.add(s);
    it.glint = s;
  }
  return items;
}
const _glints = {};
function glintTex(kind) {
  if (_glints[kind]) return _glints[kind];
  // drawn like the world: loose, thin, double-traced ink over a paper-and-gouache fill —
  // never a crisp vector icon. Big canvas so it stays soft-edged, not blurry, up close.
  const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
  const c = cv.getContext('2d');
  let seed = kind === 'person' ? 11 : 29;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const wob = (k = 1) => (rnd() - 0.5) * 1.6 * k;
  // a shape outline as points (closed), traced as ink twice, slightly off each time
  const ink = (pts, w, a, closed = true) => {
    c.strokeStyle = `rgba(42,34,48,${a})`; c.lineWidth = w; c.lineCap = c.lineJoin = 'round';
    const P = pts.map(([x, y]) => [x + wob(), y + wob()]); if (closed) P.push(P[0], P[1]);
    c.beginPath(); c.moveTo((P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2);
    for (let i = 1; i < P.length - 1; i++) c.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
    c.stroke();
  };
  const fill = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); };
  const grain = (pts) => {                       // paper tooth + a soft wash darker to one side
    c.save(); c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.clip();
    const g = c.createLinearGradient(40, 40, 220, 220); g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(120,96,110,0.18)');
    c.fillStyle = g; c.fillRect(0, 0, N, N);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(90,70,80,${0.03 + rnd() * 0.05})`; c.fillRect(rnd() * N, rnd() * N, 1.5, 1.5); }
    // a few pencil hatch strokes in the shadow corner, like the world's shading
    c.strokeStyle = 'rgba(42,34,48,0.12)'; c.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) { const o = 150 + i * 9; c.beginPath(); c.moveTo(o, 230); c.lineTo(o + 60, 170); c.stroke(); }
    c.restore();
  };
  if (kind === 'person') {             // a speech bubble, sketched
    // one continuous outline: round body, and a curved tail drawn out of it at the lower left
    const body = [];
    const a0 = Math.PI * 0.62, a1 = Math.PI * 0.78;                  // where the tail leaves and rejoins
    for (let i = 0; i <= 36; i++) {
      const a = a1 + i / 36 * (Math.PI * 2 - (a1 - a0));
      body.push([128 + Math.cos(a) * 88, 108 + Math.sin(a) * 62]);
    }
    body.push([128 + Math.cos(a0) * 88, 108 + Math.sin(a0) * 62], [86, 192], [60, 226], [72, 184]);
    fill(body, '#f7f0df'); grain(body);
    ink(body, 4.5, 0.85); ink(body, 2, 0.4);
    for (const x of [92, 128, 164]) {                    // three brushy dots
      c.fillStyle = 'rgba(42,34,48,0.88)'; c.beginPath(); c.ellipse(x + wob(), 108 + wob(), 9 + wob(0.6), 8 + wob(0.6), wob(0.2), 0, 7); c.fill();
    }
  } else {                              // a sparkle: a four-point star with soft curved arms + a small one
    const star = (cx, cy, R, r) => { const p = []; for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2 - Math.PI / 2; const k = Math.pow(Math.abs(Math.cos(2 * a)), 5.5); p.push([cx + Math.cos(a) * (r + (R - r) * k), cy + Math.sin(a) * (r + (R - r) * k)]); } return p; };
    const big = star(120, 132, 98, 30), small = star(200, 58, 34, 11);
    for (const p of [big, small]) { fill(p, '#ffe7a0'); grain(p); ink(p, 4, 0.85); ink(p, 1.8, 0.4); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  _glints[kind] = t; return t;
}

// judge a theory: a suspect + two pieces of evidence
export function judge(suspect, ids) {
  const clues = ids.map(id => CLUES.find(c => c.id === id));
  const support = clues.filter(c => c.proves.includes(suspect)).length;
  if (suspect === CULPRIT && support >= 2)
    return { ok: true, text: `Vivi reads your notes twice. “${clues.map(c => c.title.replace(/^(The|A) /, 'The ').replace(/\.$/, '')).join('. ')}… Rex. He framed them — then he took them.” She's already dialling. “If those canvases are crated for Cape Far Side, they leave tonight.”` };
  if (suspect === 'pia' && ids.includes('bike'))
    return { ok: false, text: '“That paint is weeks old,” Vivi says. “If anything, that clears her.”' };
  if (suspect === 'otto')
    return { ok: false, text: '“Otto slept on the job — I\'ll have words. But a sleeping guard doesn\'t carry forty-five canvases down a ladder.”' };
  if (suspect === CULPRIT)
    return { ok: false, text: '“Maybe,” Vivi says slowly. “But that doesn\'t prove it. I need something that puts him there.”' };
  return { ok: false, text: '“That doesn\'t prove anything,” Vivi says. “Keep looking.”' };
}
