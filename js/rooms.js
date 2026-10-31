// ─── INSIDE: rooms you walk into, like the shops on ghanemja.github.io ────────
// Walk through YarnFlow's, Borrowed Eyes' or QR Compass's door and you're in the
// whole room — the same dollhouse rooms as Janelle's Main Street (ported from its
// interiors.js): themed walls and floor, the real app on the back wall, its label,
// set dressing that moves, and little things to press E at. The museum's front door
// opens on the crime scene: forty-five empty frames, a rope down from the dome.
//
// The rooms are built far below the planet (y = −3000, on their own layer, built the
// first time you go in) and the critic walks a flat floor there: open front, the
// camera behind her over it, WASD/stick relative to the view, drag to look round.
// Walk back out over the mat (or press E on it) and you're on the street at the door.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PAL, paint, ink, blobShadow } from './style.js';
import { pose } from './human.js';
import { audio } from './audio.js';

// the rooms: keyed by the shop's style (and 'museum')
const PLACES = {
  yarn: {
    id: 'yarnflow', title: 'YarnFlow', trade: 'Pattern Haberdashery', sound: 'cosy',
    url: 'https://ghanemja.github.io/crochet/', shot: 'screenshots/rooms/yarnflow.webp',
    desc: 'A crochet studio: watch a pattern get made stitch by stitch in 3D, learn the stitches, and share what you make.',
  },
  eyes: {
    id: 'borrowed-eyes', title: 'Borrowed Eyes', trade: 'Optics & Menagerie', sound: 'night',
    url: 'https://ghanemja.github.io/borrowed_eyes/', shot: 'screenshots/rooms/borrowed-eyes.webp', clip: 'clips/borrowed-eyes.mp4',
    desc: 'A browser game about how other animals see. Photograph 14 hidden animals and borrow their eyes.',
  },
  qr: {
    id: 'qr', title: 'QR Compass', trade: 'The Map Room', sound: 'studio',
    url: 'https://ghanemja.github.io/qr/', shot: 'screenshots/rooms/qr-compass.webp',
    desc: "America's biggest companies on a 3D map, each one drawn as its own little model, and every model turns into that company's scannable QR code.",
  },
  museum: {
    id: 'gallery', title: 'The Downtown Museum', trade: 'closed · crime scene', sound: 'night',
    desc: 'Opening night. By 3 a.m. all forty-five paintings were gone from their frames. Nothing is to be moved until the police say so.',
  },
};
export const ROOM_STYLES = new Set(['yarn', 'eyes', 'qr']);
const INKC = '#2a2230';
const HAND = '"Patrick Hand", "Comic Sans MS", cursive', SCRIPT = '"Caveat", "Patrick Hand", cursive';

const rb = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, Math.min(w, h, d) > 0.6 ? 2 : 1, Math.max(1e-3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
function kit(g = new THREE.Group()) {
  const put = (geo, mat, x = 0, y = 0, z = 0, rot = null) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    g.add(m); return m;
  };
  const box = (w, h, d, mat, x, y, z, r = 0.03, rot) => put(rb(w, h, d, r), mat, x, y, z, rot);
  const flat = (w, h, mat, x, y, z, rot) => { const m = put(new THREE.PlaneGeometry(w, h), mat, x, y, z, rot); m.userData.noInk = true; return m; };
  return { g, put, box, flat };
}
function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); c.lineJoin = c.lineCap = 'round';
  draw(c, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const texMat = (w, h, draw) => {
  const m = paint(0xffffff, { map: canvasTex(w, h, draw), hatch: 0, unique: true });
  m.transparent = true;                   // bg-less lettering floats on the wall
  return m;
};
// shrink a line until it fits the canvas
function fitLine(c, text, px, font, maxW) {
  let s = px;
  do { c.font = `700 ${s}px ${font}`; s -= 2; } while (c.measureText(text).width > maxW && s > 8);
}

const _loader = new THREE.TextureLoader();
let LIVE = [], VIDS = [];                              // per-frame animations of the room being built: f(t), local room coords
let NOW = 0;
// a station's little show: plays for `dur` s, rests `rest` s, then plays again by itself;
// pressing E starts it over. p() is 0..1 through the show.
function station(dur, rest, delay = 0) {
  let t0 = delay;
  return {
    go() { t0 = NOW; },
    set(p) { t0 = NOW - p * dur; },
    p() { if (NOW - t0 > dur + rest) t0 = NOW; return Math.min(1, Math.max(0, (NOW - t0) / dur)); },
  };
}
// something to walk up to and press E at (room-local x, z)
const mini = (K, x, z, label, run, r = 0.8) => K.minis.push({ x, z, r, label, run });
function shotMat(url, clip, aspect = 1.6) {
  const crop = (tex, iw, ih) => {
    const ia = iw / ih;
    if (ia > aspect) { tex.repeat.set(aspect / ia, 1); tex.offset.set((1 - aspect / ia) / 2, 0); }
    else { tex.repeat.set(1, ia / aspect); tex.offset.set(0, 1 - ia / aspect); }     // keep the top of the page
  };
  const t = _loader.load(url, (tx) => crop(tx, tx.image.width, tx.image.height));
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const m = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  if (clip) {
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.src = clip; v.crossOrigin = 'anonymous';
    VIDS.push(v);                             // (paused while you're out of the room)
    const swap = () => {
      const vt = new THREE.VideoTexture(v);
      vt.colorSpace = THREE.SRGBColorSpace;
      crop(vt, v.videoWidth, v.videoHeight);
      m.map = vt; m.needsUpdate = true;
    };
    v.addEventListener('playing', swap, { once: true });
    v.play().catch(() => {
      // autoplay refused: start on the first interaction instead
      addEventListener('pointerdown', () => v.play().catch(() => {}), { once: true });
      addEventListener('keydown', () => v.play().catch(() => {}), { once: true });
    });
  }
  return m;
}


// ── THE SHOWCASE: each app's screen, framed as the thing it would be in its shop ──
// four bars round the screen; `bar(len, thick, horizontal)` returns a mesh
function frameBars(F, w, h, t, bar) {
  for (const s of [-1, 1]) {
    const hb = bar(w + 2 * t, t, true); hb.position.set(0, s * (h / 2 + t / 2), 0); F.g.add(hb);
    const vb = bar(h, t, false); vb.position.set(s * (w / 2 + t / 2), 0, 0); F.g.add(vb);
  }
}
const stripeTex = (draw, len, thick, horiz) => {
  const t = canvasTex(256, 32, draw); t.wrapS = THREE.RepeatWrapping; t.repeat.set(len / (thick * 6), 1);
  if (!horiz) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; }
  return t;
};
function showcase(K, place) {
  const w = SCR_W, h = SCR_H, z = -D + 0.6;
  const grp = new THREE.Group(); grp.position.set(0, SCR_Y, z); K.g.add(grp);
  const F = kit(grp);
  // the screen itself, set in a dark recess so it reads as lit from within
  F.box(w + 0.04, h + 0.04, 0.04, paint(0x2a2230, { hatch: 0 }), 0, 0, -0.02, 0.01);
  F.flat(w, h, shotMat(place.shot, place.clip, w / h), 0, 0, 0.012);
  const style = SHOW[place.id] || SHOW.default;
  style(F, w, h);
  // a warm pool of light on the floor in front of it
  const pool = K.flat(w + 1.2, 2.2, new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (c, cw, ch) => {
    const g = c.createRadialGradient(cw / 2, ch / 2, 2, cw / 2, ch / 2, cw / 2);
    g.addColorStop(0, 'rgba(255,236,190,0.55)'); g.addColorStop(1, 'rgba(255,236,190,0)');
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
  }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.02, -D + 1.6, [-Math.PI / 2, 0, 0]);
  pool.renderOrder = 3;
}
const SHOW = {
  qr(F, w, h) {                                // the screen IS a QR code: finder squares in three corners
    frameBars(F, w, h, 0.08, (len, t, hz) => new THREE.Mesh(rb(hz ? len : t, hz ? t : len, 0.06, 0.01), paint(0x2a2230, { hatch: 0 })));
    const ink = paint(0x2a2230, { hatch: 0 }), paper = paint(0xf6efdf, { hatch: 0 });
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1]]) {
      const x = sx * (w / 2 + 0.04), y = sy * (h / 2 + 0.04);
      F.box(0.56, 0.56, 0.03, ink, x, y, 0.05, 0.01);
      F.box(0.4, 0.4, 0.03, paper, x, y, 0.06, 0.008);
      F.box(0.24, 0.24, 0.03, ink, x, y, 0.07, 0.008);
    }
    // the fourth corner gets the small alignment square
    F.box(0.22, 0.22, 0.03, ink, w / 2 + 0.04, -h / 2 - 0.04, 0.05, 0.01);
    F.box(0.13, 0.13, 0.03, paper, w / 2 + 0.04, -h / 2 - 0.04, 0.06, 0.008);
    F.box(0.06, 0.06, 0.03, ink, w / 2 + 0.04, -h / 2 - 0.04, 0.07, 0.006);
  },
  default(F, w, h) {
    frameBars(F, w, h, 0.1, (len, t, hz) => new THREE.Mesh(rb(hz ? len : t, hz ? t : len, 0.08, 0.02), paint(PAL.gold)));
  },
  yarnflow(F, w, h) {                          // a frame wrapped in chunky yarn, pom-poms at the corners
    const cols = [0xe8604c, 0xe4b84f, 0x7fb3a8, 0x8f7ae8];
    frameBars(F, w, h, 0.13, (len, t, hz) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(rb(hz ? len : t, hz ? t : len, 0.08, 0.04), paint(0xdc9e9a)));
      // the wraps: little tori round the bar
      const n = Math.round(len / 0.07), col = paint(cols[Math.round(len * 10) % cols.length]);
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + 0.5) * len / n;
        const r = new THREE.Mesh(new THREE.TorusGeometry(t * 0.55, 0.018, 5, 12), col);
        r.position.set(hz ? u : 0, hz ? 0 : u, 0); r.rotation.y = hz ? Math.PI / 2 : 0; r.rotation.x = hz ? 0 : Math.PI / 2;
        r.rotation.z = 0.25; r.userData.noInk = true; g.add(r);
      }
      return g;
    });
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy], i) => {
      F.put(new THREE.IcosahedronGeometry(0.15, 1), paint(cols[i], { hatch: 0.6 }), sx * (w / 2 + 0.07), sy * (h / 2 + 0.07), 0.08);
    });
    // a crochet hook tucked into the bottom corner
    F.put(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), paint(0x8f7ae8), w / 2 - 0.35, -h / 2 - 0.02, 0.1, [0, 0, 1.2]);
  },
  'borrowed-eyes'(F, w, h) {                    // looking through the field camera's viewfinder
    frameBars(F, w, h, 0.14, (len, t, hz) => new THREE.Mesh(rb(hz ? len : t, hz ? t : len, 0.1, 0.05), paint(0x2a2230, { hatch: 0 })));
    const vf = F.flat(w, h, texMat(640, 400, (c, cw, ch) => {
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 5;
      const m = 26, L = 54;
      for (const [x, y, dx, dy] of [[m, m, 1, 1], [cw - m, m, -1, 1], [m, ch - m, 1, -1], [cw - m, ch - m, -1, -1]]) {
        c.beginPath(); c.moveTo(x, y + dy * L); c.lineTo(x, y); c.lineTo(x + dx * L, y); c.stroke();
      }
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.strokeRect(cw / 2 - 30, ch / 2 - 22, 60, 44);
      c.fillStyle = '#e8604c'; c.beginPath(); c.arc(cw - 96, 44, 8, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.font = `700 22px ${HAND}`; c.fillText('REC', cw - 82, 52);
    }), 0, 0, 0.02);
    vf.renderOrder = 3;
    // the lens hood and dials on top of the camera body
    F.box(0.5, 0.16, 0.14, paint(0x2a2230, { hatch: 0 }), -w / 2 + 0.5, h / 2 + 0.2, 0, 0.03);
    F.put(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 14), paint(0x6f7d92), w / 2 - 0.4, h / 2 + 0.17, 0);
    F.put(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), paint(PAL.accent), w / 2 - 0.65, h / 2 + 0.16, 0);
  },
};

// floor planks, drawn once and shared
let _planks = null;
function plankMat() {
  if (_planks) return _planks;
  const t = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#caa87c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      c.fillStyle = ['#c49f72', '#d0ad80', '#bd9a6e', '#c7a476'][Math.floor(y / 32) % 4];
      c.fillRect(0, y, w, 30);
      c.strokeStyle = 'rgba(90,60,40,0.35)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, y + 31); c.lineTo(w, y + 31); c.stroke();
      const off = ((y / 32) % 2) * 128;
      c.beginPath(); c.moveTo((off + 64) % w, y); c.lineTo((off + 64) % w, y + 30); c.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2.4);
  return (_planks = paint(0xffffff, { map: t, hatch: 0.4 }));
}

// ── one room: origin at the middle of the OPEN front edge, inside is −z ──
const W = 8, D = 6, H = 2.7;
// the app's screen fills the middle of the back wall
const SCR_W = 3.44, SCR_H = 2.15, SCR_Y = 1.15;
// its museum label hangs on the wall to the right
const LBL_X = 2.55;
function roomShell(K, wallHex, place, theme) {
  const wall = paint(wallHex, { hatch: 0.6 }), trim = paint(0xfffaf0);
  const tm = themeMats(theme, place.id);
  const floor = K.flat(W, D, tm?.floor || plankMat(), 0, 0, -D / 2 + 0.5, [-Math.PI / 2, 0, 0]);
  floor.userData.noInk = true;
  // walls: single-sided planes, invisible from outside so the camera roams free
  K.flat(W, H, tm?.walls[0] || wall, 0, H / 2, -D + 0.5);                                    // back
  K.flat(D, H, tm?.walls[1] || wall, -W / 2, H / 2, -D / 2 + 0.5, [0, Math.PI / 2, 0]);      // west
  K.flat(D, H, tm?.walls[2] || wall, W / 2, H / 2, -D / 2 + 0.5, [0, -Math.PI / 2, 0]);      // east
  // skirting + picture rail, real boxes so they take ink
  if (!theme?.bare) {
    K.box(W, 0.12, 0.05, trim, 0, 0.06, -D + 0.53);
    for (const s of [-1, 1]) K.box(0.05, 0.12, D, trim, s * (W / 2 - 0.026), 0.06, -D / 2 + 0.5);
    K.box(W, 0.045, 0.04, trim, 0, 2.08, -D + 0.53);
  }
  // the shop's name over the back wall
  K.flat(2.1, 0.35, texMat(768, 128, (c, w, h) => {
    // a paper banner behind the lettering, so it reads on any wallpaper
    c.fillStyle = '#f6efdf'; c.strokeStyle = INKC; c.lineWidth = 5;
    c.beginPath(); c.roundRect(w * 0.12, 6, w * 0.76, h - 12, 22); c.fill(); c.stroke();
    c.font = `700 ${h * 0.62}px ${SCRIPT}`; c.fillStyle = INKC; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(place.title, w / 2, h * 0.38);
    c.font = `400 ${h * 0.26}px ${HAND}`; c.fillStyle = '#5a4e5e';
    c.fillText('— ' + place.trade + ' —', w / 2, h * 0.8);
  }), 0, 2.53, -D + 0.68);
  // a rug
  if (theme?.rug !== false) {
  const rug = K.flat(2.6, 1.7, texMat(256, 160, (c, w, h) => {
    const base = new THREE.Color(wallHex).lerp(new THREE.Color(0x8a6448), 0.35);
    c.fillStyle = '#' + base.getHexString(); c.fillRect(0, 0, w, h);
    c.strokeStyle = '#fffaf0'; c.lineWidth = 6; c.strokeRect(12, 12, w - 24, h - 24);
    c.strokeStyle = INKC; c.lineWidth = 4; c.strokeRect(3, 3, w - 6, h - 6);
  }), 0, 0.015, -D / 2 + 0.35, [-Math.PI / 2, 0, 0]);
  rug.renderOrder = 1;
  }
  // the way out: just a mat at the open front (a doorframe only blocks the camera)
  K.flat(0.9, 0.5, texMat(192, 96, (c, w, h) => {
    c.fillStyle = '#b8a07c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = INKC; c.lineWidth = 4; c.strokeRect(4, 4, w - 8, h - 8);
    c.font = `400 ${h * 0.44}px ${HAND}`; c.fillStyle = INKC; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('back out', w / 2, h / 2);
  }), 0, 0.016, 0.52, [-Math.PI / 2, 0, 0]);
}

// the label: a museum card on the wall beside the screen
function wallLabel(K, place, x, y, z) {
  const card = K.flat(0.62, 0.82, texMat(310, 410, (c, w, h) => {
    c.fillStyle = '#fbf6ea'; c.fillRect(0, 0, w, h);
    c.strokeStyle = INKC; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
    fitLine(c, place.title, 48, SCRIPT, w - 40); c.fillStyle = INKC; c.textAlign = 'left'; c.fillText(place.title, 20, 58);
    c.font = `400 17px ${HAND}`; c.fillStyle = '#8a7e8e'; c.fillText(place.trade.toUpperCase(), 20, 86);
    c.fillStyle = '#e8604c'; c.fillRect(20, 98, 50, 4);
    c.font = `400 19px ${HAND}`; c.fillStyle = '#3a3240';
    const words = place.desc.split(' '); let line = '', y = 132;
    for (const wd of words) {
      if (c.measureText(line + wd).width > w - 40) { c.fillText(line, 20, y); line = ''; y += 24; if (y > h - 70) break; }
      line += wd + ' ';
    }
    if (y <= h - 70) c.fillText(line, 20, y);
    c.font = `700 19px ${HAND}`; c.fillStyle = '#e8604c'; c.fillText('walk up · press E', 20, h - 26);
  }), x, y, z);
  card.renderOrder = 2;
  K.box(0.68, 0.88, 0.02, paint(0x2a2230, { hatch: 0 }), x, y, z - 0.02, 0.005);      // (a clear gap behind the card: a thin one lost the depth test)
}

// the plaque: a lectern with the story on it

// ── per-room set dressing ───────────────────────────────────────────────────
const SETS = {
  yarnflow(K) {
    // cubbies of yarn, every colour in the palette
    const sh = kit(new THREE.Group()); sh.g.position.set(-2.8, 0, -D + 0.75);
    const wood = paint(0x9a7c5c);
    for (let r = 0; r < 4; r++) sh.box(1.9, 0.05, 0.45, wood, 0, 0.42 + r * 0.42, 0);
    for (const s of [-1, 1]) sh.box(0.06, 1.75, 0.45, wood, s * 0.95, 0.9, 0);
    const cols = [0xe8604c, 0xe4b84f, 0x7fb3a8, 0xb7a3c6, 0xdc9e9a, 0x93abc0, 0xf1e4c8, 0x8f7ae8, 0xa8b994];
    for (let i = 0; i < 12; i++) {
      const r = Math.floor(i / 4), cI = i % 4;
      const ball = sh.put(new THREE.SphereGeometry(0.14, 12, 10), paint(cols[i % cols.length]), -0.68 + cI * 0.45, 0.6 + r * 0.42, 0);
      const wrap = sh.put(new THREE.TorusGeometry(0.14, 0.018, 6, 18), paint(cols[(i + 3) % cols.length]), -0.68 + cI * 0.45, 0.6 + r * 0.42, 0, [0.6 + i, 0.4 * i, 0]);
      wrap.userData.noInk = true;
    }
    K.g.add(sh.g); ink(sh.g, 'fine');
    // a giant granny square on the wall
    K.flat(0.7, 0.7, texMat(300, 300, (c, w, h) => {
      const ring = ['#8f7ae8', '#dc9e9a', '#e4b84f', '#7fb3a8', '#f6eedb'];
      ring.forEach((col, i) => {
        const m = 10 + i * 28;
        c.strokeStyle = col; c.lineWidth = 22;
        c.setLineDash([16, 7]);
        c.strokeRect(m, m, w - 2 * m, h - 2 * m);
      });
      c.setLineDash([]);
      c.fillStyle = '#e8604c'; c.beginPath(); c.arc(w / 2, h / 2, 26, 0, 7); c.fill();
      c.strokeStyle = INKC; c.lineWidth = 3; c.stroke();
    }), 3.45, 1.95, -D + 0.56);
    // a basket with needles
    K.put(new THREE.CylinderGeometry(0.3, 0.22, 0.3, 12, 1, true), paint(0xc8a47c, { side: THREE.DoubleSide }), 1.1, 0.15, -D + 1.1);
    for (const a of [-0.3, 0.1, 0.5]) K.box(0.025, 0.85, 0.025, paint(0x6b4a34), 1.1 + a * 0.3, 0.5, -D + 1.1, 0.008, [0, 0, a]);
  },
  'borrowed-eyes'(K) {
    // a wall of eyes: cow, honeybee, owl — each sees you differently
    const eyes = [
      ['cow', (c, w, h) => { c.fillStyle = '#b48a62'; c.fillRect(0, 0, w, h); c.fillStyle = '#f0e6d4'; c.beginPath(); c.ellipse(w / 2, h / 2, 70, 44, 0, 0, 7); c.fill(); c.strokeStyle = INKC; c.lineWidth = 4; c.stroke(); c.fillStyle = '#3b2e24'; c.beginPath(); c.ellipse(w / 2, h / 2, 26, 40, 0, 0, 7); c.fill(); c.fillStyle = '#111'; c.fillRect(w / 2 - 20, h / 2 - 7, 40, 14); c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2 - 12, h / 2 - 14, 7, 0, 7); c.fill(); }],
      ['honeybee', (c, w, h) => { c.fillStyle = '#e4b84f'; c.fillRect(0, 0, w, h); c.fillStyle = '#2a2230'; c.beginPath(); c.ellipse(w / 2, h / 2, 62, 52, 0, 0, 7); c.fill(); c.strokeStyle = '#8f7ae8'; c.lineWidth = 2; for (let y = -48; y < 50; y += 11) for (let x = -58; x < 60; x += 12) { const dx = x + (Math.abs(y) % 22 < 11 ? 6 : 0); if (dx * dx / 3600 + y * y / 2500 < 1) { c.beginPath(); c.arc(w / 2 + dx, h / 2 + y, 5, 0, 7); c.stroke(); } } }],
      ['owl', (c, w, h) => { c.fillStyle = '#4a4258'; c.fillRect(0, 0, w, h); c.fillStyle = '#e4b84f'; c.beginPath(); c.arc(w / 2, h / 2, 52, 0, 7); c.fill(); c.strokeStyle = INKC; c.lineWidth = 5; c.stroke(); c.fillStyle = '#111'; c.beginPath(); c.arc(w / 2, h / 2, 30, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2 - 11, h / 2 - 11, 9, 0, 7); c.fill(); }],
    ];
    eyes.forEach(([name, draw], i) => {
      const x = [-3.45, -2.55, 3.4][i], y = 1.9;
      K.put(new THREE.TorusGeometry(0.34, 0.045, 10, 28), paint(PAL.gold), x, y, -D + 0.58, [0, 0, 0]);
      const face = K.flat(0.8, 0.66, texMat(200, 164, draw), x, y, -D + 0.57);
      face.geometry = new THREE.CircleGeometry(0.32, 28);
      K.flat(0.7, 0.18, texMat(256, 64, (c, w, h) => {
        c.font = `400 ${h * 0.62}px ${HAND}`; c.fillStyle = INKC; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('the ' + name + "'s", w / 2, h / 2);
      }), x, y - 0.47, -D + 0.57);
    });
    // the field camera on its tripod
    const cam = kit(new THREE.Group()); cam.g.position.set(3.2, 0, -D + 2.7); cam.g.rotation.y = -0.6;
    const dk = paint(PAL.ink, { hatch: 0 });
    for (let i = 0; i < 3; i++) cam.box(0.045, 1.15, 0.045, paint(PAL.bark), Math.sin(i * 2.1) * 0.3, 0.55, Math.cos(i * 2.1) * 0.3, 0.012, [Math.cos(i * 2.1) * 0.5, 0, -Math.sin(i * 2.1) * 0.5]);
    cam.box(0.4, 0.3, 0.24, dk, 0, 1.2, 0);
    cam.put(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 14), dk, 0, 1.2, 0.2, [Math.PI / 2, 0, 0]);
    cam.put(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 10), paint(PAL.accent), 0.12, 1.38, 0);
    K.g.add(cam.g); ink(cam.g, 'fine');
  },
  gallery(K) {
    // ── the morning after: every frame on every wall is empty ──
    // The canvases were cut out close to the stretcher, so each gilt frame still hangs with
    // a thin band of canvas round its inside edge. One frame came down (a pale patch and a
    // bare nail where it hung), one leans on the skirting; a rope still hangs from the dome
    // over a scatter of glass, taped off; the police have pinned the catalogue to a board.
    const gilt = paint(PAL.gold), deep = paint(0xb8872f), HPI = Math.PI / 2;
    const cutBand = (w, h) => texMat(Math.round(256 * Math.min(2.4, w / h)), 256, (c, cw, ch) => {
      const b = Math.max(6, ch * 0.045), R = rng(Math.round(w * 97 + h * 31));
      c.fillStyle = '#ece0c4';                            // the canvas left on the stretcher
      c.fillRect(0, 0, cw, b); c.fillRect(0, ch - b, cw, b); c.fillRect(0, 0, b, ch); c.fillRect(cw - b, 0, b, ch);
      c.strokeStyle = 'rgba(42,34,48,0.75)'; c.lineWidth = 2;          // one straight blade line
      c.strokeRect(b, b, cw - 2 * b, ch - 2 * b);
      c.strokeStyle = 'rgba(160,140,110,0.8)'; c.lineWidth = 1.2;      // a few loose threads
      for (let i = 0; i < 9; i++) {
        const side = i % 4, u = 0.1 + R() * 0.8, L = 4 + R() * 9;
        const [x, y, dx, dy] = [[u * cw, b, 0, 1], [u * cw, ch - b, 0, -1], [b, u * ch, 1, 0], [cw - b, u * ch, -1, 0]][side];
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * L + (R() - 0.5) * 4, y + dy * L + (R() - 0.5) * 4); c.stroke();
      }
    });
    // an empty frame: gilt bars, the cut band, and the wall showing through
    const empty = (w, h, x, y, z, ry = 0, tilt = 0, lean = 0, t = 0.05) => {
      const g = new THREE.Group(); g.position.set(x, y, z);
      g.rotation.order = 'YXZ'; g.rotation.set(lean, ry, tilt);
      const F = kit(g);
      F.box(w + 2 * t, t, 0.045, gilt, 0, h / 2 + t / 2, 0, 0.012);
      F.box(w + 2 * t, t, 0.045, gilt, 0, -h / 2 - t / 2, 0, 0.012);
      F.box(t, h, 0.045, gilt, -w / 2 - t / 2, 0, 0, 0.012);
      F.box(t, h, 0.045, gilt, w / 2 + t / 2, 0, 0, 0.012);
      F.flat(w, h, cutBand(w, h), 0, 0, 0.006).renderOrder = 2;
      K.g.add(g); return g;
    };
    // where a painting came down: a fresher patch of wallpaper and the nail it hung from
    const ghost = (w, h, x, y, z, ry = 0) => {
      const m = K.flat(w + 0.1, h + 0.1, texMat(128, 128, (c, cw, ch) => {
        c.fillStyle = 'rgba(70,40,90,0.16)'; c.fillRect(0, 0, cw, ch);
        c.strokeStyle = 'rgba(70,40,90,0.22)'; c.lineWidth = 4; c.strokeRect(2, 2, cw - 4, ch - 4);
      }), x, y, z, [0, ry, 0]);
      m.renderOrder = 2;
      const nail = K.put(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6), paint(0x8a8392), x, y + h / 2 + 0.08, z, [HPI, ry, 0]);
      nail.position.add(new THREE.Vector3(0, 0, 0.02).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry));
    };
    // ── the back wall: the collection's centrepiece, its heaviest frame, empty ──
    {
      const w = SCR_W, h = SCR_H, z = -D + 0.6;
      const grp = new THREE.Group(); grp.position.set(0, SCR_Y, z); K.g.add(grp);
      const F = kit(grp);
      frameBars(F, w, h, 0.2, (len, tt, hz) => {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(rb(hz ? len : tt, hz ? tt : len, 0.1, 0.03), gilt));
        g.add(new THREE.Mesh(rb(hz ? len - 0.1 : 0.05, hz ? 0.05 : len - 0.1, 0.13, 0.01), deep));
        return g;
      });
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) F.put(new THREE.SphereGeometry(0.13, 12, 10).scale(1, 1, 0.5), gilt, sx * (w / 2 + 0.1), sy * (h / 2 + 0.1), 0.06);
      F.flat(w, h, cutBand(w, h), 0, 0, 0.02).renderOrder = 2;
      // its card, still on the wall: what hung here, stamped STOLEN
      const card = K.flat(0.5, 0.36, texMat(250, 180, (c, cw, ch) => {
        c.fillStyle = '#fbf6ea'; c.fillRect(0, 0, cw, ch);
        c.strokeStyle = INKC; c.lineWidth = 4; c.strokeRect(2, 2, cw - 4, ch - 4);
        c.font = `700 30px ${SCRIPT}`; c.fillStyle = INKC; c.fillText('Cows in Storm', 14, 38);
        c.font = `400 17px ${HAND}`; c.fillStyle = '#5a4e5e'; c.fillText('J. Ghanem · oil on canvas', 14, 64);
        c.fillText('the centrepiece of the show', 14, 86);
        c.save(); c.translate(cw * 0.56, ch * 0.72); c.rotate(-0.16);
        c.strokeStyle = '#c8402f'; c.lineWidth = 5; c.strokeRect(-70, -22, 140, 44);
        c.font = `700 34px ${HAND}`; c.fillStyle = '#c8402f'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('STOLEN', 0, 2);
        c.restore();
      }), -w / 2 - 0.62, 0.62, -D + 0.56);
      card.renderOrder = 2;
    }
    empty(0.8, 0.62, -2.75, 1.95, -D + 0.56, 0, 0.05);
    empty(0.5, 0.66, -3.6, 1.7, -D + 0.56, 0, -0.06);
    empty(0.6, 0.48, 3.55, 2.0, -D + 0.56, 0, 0.08);
    empty(0.55, 0.7, 3.5, 1.0, -D + 0.56, 0, -0.04);
    // the side walls
    empty(0.95, 0.72, -W / 2 + 0.06, 1.6, -4.3, HPI, -0.06);
    empty(0.8, 0.6, -W / 2 + 0.06, 1.85, -2.85, HPI, 0.05);
    ghost(0.9, 0.6, -W / 2 + 0.055, 1.0, -1.6, HPI);
    empty(0.9, 0.6, -3.2, 0.03, -1.35, 0.4, 0, -HPI);                     // …the one that came down, face up
    empty(0.9, 0.7, W / 2 - 0.06, 1.7, -4.4, -HPI, 0.07);
    empty(0.78, 0.6, W / 2 - 0.2, 0.36, -0.95, -HPI, 0.03, -0.28);          // propped against the skirting
    // ── the police's board: the catalogue, pinned up, red string between them ──
    {
      const bx = W / 2 - 0.05, bz = -2.5, by = 1.55;
      K.box(0.04, 0.95, 1.5, paint(0x8a6448), bx - 0.02, by, bz, 0.01);
      K.flat(1.42, 0.87, texMat(284, 174, (c, cw, ch) => {
        c.fillStyle = '#c99a62'; c.fillRect(0, 0, cw, ch);
        const R = rng(4); for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(90,60,30,${R() * 0.25})`; c.fillRect(R() * cw, R() * ch, 2, 2); }
        c.fillStyle = '#fbf6ea'; c.fillRect(cw * 0.62, ch * 0.66, cw * 0.34, ch * 0.28);
        c.font = `700 22px ${SCRIPT}`; c.fillStyle = '#c8402f'; c.fillText('45 MISSING', cw * 0.64, ch * 0.86);
      }), bx - 0.045, by, bz, [0, -HPI, 0]).renderOrder = 2;
      const pins = [];
      const shots = ['art_IMG_7121', 'art_IMG_9240', 'art_IMG_5265', 'art_IMG_8538', 'art_IMG_9606'];
      shots.forEach((name, i) => {
        const pz = bz - 0.5 + (i % 3) * 0.45, py = by + 0.2 - Math.floor(i / 3) * 0.42 + (i % 2) * 0.04;
        const g = new THREE.Group(); g.position.set(bx - 0.055, py, pz); g.rotation.set(0, -HPI, ((i * 7) % 5 - 2) * 0.04); K.g.add(g);
        const P = kit(g);
        P.flat(0.3, 0.3, paint(0xfbf6ea, { hatch: 0 }), 0, 0, 0);
        P.flat(0.26, 0.21, shotMat('artworks/' + name + '.jpg', null, 0.26 / 0.21), 0, 0.025, 0.003);
        P.put(new THREE.SphereGeometry(0.018, 8, 6), paint(0xc8402f), 0, 0.13, 0.01);
        pins.push(new THREE.Vector3(bx - 0.07, py + 0.13, pz));
      });
      const str = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([pins[0], pins[4], pins[2], pins[3], pins[1]]), 40, 0.005, 4), paint(0xc8402f, { hatch: 0 }));
      str.userData.noInk = true; K.g.add(str);
    }
    // ── through the dome: a climbing rope still hangs down, over a scatter of glass ──
    {
      const rx = 1.25, rz = -2.75;
      const ropeG = new THREE.Group(); ropeG.position.set(rx, H + 0.4, rz); K.g.add(ropeG);
      const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.04, -1.4, 0.02), new THREE.Vector3(-0.03, -2.4, 0.03), new THREE.Vector3(0.08, -2.75, 0.12),
      ]), 30, 0.022, 6), paint(0x3f6a8a));
      ropeG.add(rope);
      const clip = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 14), paint(0xb8bec6));
      clip.position.set(0.08, -2.8, 0.12); ropeG.add(clip);
      LIVE.push((t) => { ropeG.rotation.z = Math.sin(t * 0.6) * 0.025; ropeG.rotation.x = Math.sin(t * 0.45 + 1) * 0.02; });
      const glass = paint(0xdff0f6, { opacity: 0.75, hatch: 0, side: THREE.DoubleSide }), R = rng(19);
      for (let i = 0; i < 16; i++) {
        const s = 0.05 + R() * 0.1, sh = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(s, R() * s * 0.4), new THREE.Vector2(s * (0.2 + R() * 0.5), s * (0.6 + R() * 0.5))]);
        const a = R() * 6.28, d = R() * 0.6;
        const m = K.put(new THREE.ShapeGeometry(sh), glass, rx + Math.cos(a) * d, 0.012 + i * 0.0006, rz + Math.sin(a) * d, [-HPI, 0, R() * 6]);
        m.userData.noInk = true;
      }
      // taped off: three posts, the tape between them
      const posts = [[0.25, -1.95], [2.3, -2.1], [1.3, -3.75]];
      for (const [px, pz] of posts) {
        K.put(new THREE.CylinderGeometry(0.11, 0.14, 0.05, 12), paint(0x2a2230, { hatch: 0 }), px, 0.025, pz);
        K.put(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), paint(0xe4b84f), px, 0.45, pz);
      }
      const tapeTex = canvasTex(512, 40, (c, w, h) => {
        c.fillStyle = '#f2c94c'; c.fillRect(0, 0, w, h);
        c.font = `700 24px ${HAND}`; c.fillStyle = '#2a2230'; c.textBaseline = 'middle';
        c.fillText('POLICE LINE — DO NOT CROSS — POLICE LINE —', 8, h / 2 + 1);
      });
      posts.forEach(([ax, az], i) => {
        const [bx2, bz2] = posts[(i + 1) % 3], len = Math.hypot(bx2 - ax, bz2 - az);
        const t = tapeTex.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(len / 1.6, 1); t.needsUpdate = true;
        const m = K.flat(len, 0.07, paint(0xffffff, { map: t, hatch: 0, side: THREE.DoubleSide, unique: true }), (ax + bx2) / 2, 0.8, (az + bz2) / 2, [0, -Math.atan2(bz2 - az, bx2 - ax), 0]);
        m.userData.noInk = true;
      });
      K.cols.push({ x0: 0.15, x1: 2.4, z0: -3.85, z1: -1.85 });
    }
    // evidence markers: little numbered tents
    [[1.0, -2.35, '1'], [-0.4, -4.75, '2'], [-3.0, -1.0, '3'], [2.9, -1.2, '4']].forEach(([x, z, n], i) => {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = i * 0.7 - 0.4; K.g.add(g);
      const face = texMat(64, 64, (c, w, h) => { c.fillStyle = '#f2c94c'; c.fillRect(0, 0, w, h); c.font = `700 44px ${HAND}`; c.fillStyle = '#2a2230'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n, w / 2, h / 2 + 3); });
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), face); m.material.side = THREE.DoubleSide;
        m.position.set(0, 0.065, s * 0.035); m.rotation.x = s * 0.5; m.userData.noInk = true; g.add(m);
      }
    });
    // a roll of the museum's grey gallery tape, a strip trailing off it
    K.put(new THREE.TorusGeometry(0.07, 0.035, 8, 18), paint(0x9a9aa2), -0.4, 0.035, -4.55, [HPI, 0, 0]);
    K.flat(0.06, 0.6, paint(0x9a9aa2, { side: THREE.DoubleSide }), -0.42, 0.012, -4.2, [-HPI, 0, 0.3]).renderOrder = 2;
    // the catalogue's pages, kicked about underfoot
    for (const [sx, sz, yaw] of [[0.3, -1.3, 0.5], [-0.8, -2.9, -0.9], [-2.1, -2.3, 2.2], [2.9, -3.4, 1.1], [-1.9, -0.6, -0.4]]) {
      K.flat(0.3, 0.4, texMat(96, 128, (c, w, h) => {
        c.fillStyle = '#fbf6ea'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(42,34,48,0.6)'; c.lineWidth = 2; c.strokeRect(1, 1, w - 2, h - 2);
        c.fillStyle = 'rgba(120,100,140,0.45)'; c.fillRect(12, 12, w - 24, h * 0.42);
        for (let l = 0; l < 3; l++) { c.beginPath(); c.moveTo(12, h * 0.68 + l * 12); c.lineTo(w - 12 - l * 14, h * 0.68 + l * 12); c.stroke(); }
      }), sx, 0.016 + Math.random() * 0.004, sz, [-HPI, 0, yaw]).renderOrder = 2;
    }
    // a stanchion went over in the scramble; its pair still holds the rope up
    K.put(new THREE.CylinderGeometry(0.11, 0.14, 0.06, 12), gilt, -3.3, 0.03, -D + 1.7);
    K.box(0.035, 0.85, 0.035, gilt, -3.3, 0.46, -D + 1.7, 0.01);
    K.put(new THREE.SphereGeometry(0.055, 10, 8), gilt, -3.3, 0.9, -D + 1.7);
    K.put(new THREE.CylinderGeometry(0.11, 0.14, 0.06, 12), gilt, -1.75, 0.07, -D + 1.95, [0, 0, 1.45]);
    K.box(0.035, 0.85, 0.035, gilt, -1.3, 0.08, -D + 2.05, 0.01, [0, 0.25, HPI]);
    K.put(new THREE.SphereGeometry(0.055, 10, 8), gilt, -0.86, 0.06, -D + 2.15);
    K.g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.3, 0.88, -D + 1.7), new THREE.Vector3(-2.5, 0.25, -D + 1.85), new THREE.Vector3(-1.8, 0.04, -D + 2.0), new THREE.Vector3(-0.9, 0.06, -D + 2.15),
    ]), 20, 0.035, 8), paint(0xb03a30)));
    K.cols.push({ x0: -3.45, x1: -3.15, z0: -D + 1.55, z1: -D + 1.85 });
  },
};

// ─── THE FUN LAYER: every room gets life ────────────────────────────────────
// Small looping animations in room-local coordinates, registered in LIVE.

// a little toon cat, facing +z. Returns the pieces the animations drive.
function makeCat(colA, colB = colA) {
  const g = new THREE.Group(), C = kit(g);
  const fur = paint(colA, { hatch: 0.4 }), fur2 = paint(colB, { hatch: 0.4 });
  // the side profile carries the cat: a chest mass blending into the head, a
  // round rump the tail grows from, and legs that emerge from those masses
  // instead of hanging off a bare box like pins
  C.box(0.28, 0.15, 0.14, fur, 0, 0.165, 0, 0.055);
  C.put(new THREE.SphereGeometry(0.095, 12, 10).scale(1, 0.95, 1), fur, 0, 0.17, 0.09);   // chest/shoulders
  C.put(new THREE.SphereGeometry(0.09, 12, 10).scale(1, 1, 1.05), fur, 0, 0.17, -0.09);   // haunches
  C.put(new THREE.SphereGeometry(0.088, 12, 10), fur2, 0, 0.27, 0.16);
  for (const s of [-1, 1]) C.put(new THREE.ConeGeometry(0.032, 0.065, 6), fur2, s * 0.052, 0.355, 0.15);
  const dark = paint(0x2a2230, { hatch: 0 });
  for (const s of [-1, 1]) C.put(new THREE.SphereGeometry(0.013, 6, 5), dark, s * 0.036, 0.285, 0.238);
  C.put(new THREE.SphereGeometry(0.011, 6, 5), paint(0xdc9e9a, { hatch: 0 }), 0, 0.255, 0.245);
  const legs = [];
  // legs pivot at the hip/shoulder (geometry hangs below its origin), so a
  // swing or a batting paw hinges where it attaches instead of orbiting its
  // own middle and tearing off the body; a paw at the foot grounds the profile
  const legGeo = rb(0.06, 0.15, 0.06, 0.02);
  legGeo.translate(0, -0.075, 0);
  const pawGeo = rb(0.065, 0.045, 0.08, 0.018);
  pawGeo.translate(0, -0.128, 0.012);
  for (const [lx, lz] of [[-0.08, 0.09], [0.08, 0.09], [-0.08, -0.09], [0.08, -0.09]]) {
    const leg = C.put(legGeo, fur, lx, 0.15, lz);
    leg.add(new THREE.Mesh(pawGeo, fur2));
    legs.push(leg);
  }
  // one connected curved tail (jointed boxes read as broken-off sticks)
  const tailG = new THREE.Group(); tailG.position.set(0, 0.2, -0.15);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(0, 0.03, -0.1),
    new THREE.Vector3(0.015, 0.14, -0.17), new THREE.Vector3(0.02, 0.26, -0.15),
  ]);
  tailG.add(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 12, 0.02, 6), fur2));
  g.add(tailG);
  ink(g, 'fine');
  g.add(blobShadow(0.15));
  return { g, legs, tail: tailG };
}
// drive a cat along a position + heading, legs trotting
function catMove(cat, x, z, dx, dz, t, pace = 9) {
  cat.g.position.set(x, Math.abs(Math.sin(t * pace)) * 0.025, z);
  cat.g.rotation.y = Math.atan2(dx, dz);
  cat.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * pace + (i % 2) * Math.PI + Math.floor(i / 2) * 1.3) * 0.55; });
  cat.tail.rotation.y = Math.sin(t * 2.7) * 0.35;
  cat.tail.rotation.x = Math.sin(t * 1.9) * 0.15;
}

const EXTRA = {
  yarnflow(K) {
    // ── yarn EVERYWHERE ──
    const cols = [0xe8604c, 0xe4b84f, 0x7fb3a8, 0xb7a3c6, 0xdc9e9a, 0x8f7ae8, 0xa8b994, 0x93abc0];
    const spots = [[-3.2, -1.1], [-2.2, -2.9], [-0.9, -4.3], [2.1, -1.2], [3.1, -3.2], [-1.6, -0.7], [3.4, -4.6], [0.6, -4.8], [-3.5, -4.6], [2.8, -0.6]];
    spots.forEach(([x, z], i) => {
      const r = 0.1 + (i % 3) * 0.03;
      K.put(new THREE.SphereGeometry(r, 10, 8), paint(cols[i % cols.length]), x, r, z);
      const w = K.put(new THREE.TorusGeometry(r, 0.014, 6, 16), paint(cols[(i + 3) % cols.length]), x, r, z, [0.6 + i, i * 0.8, 0]);
      w.userData.noInk = true;
    });
    // loose strands trailing across the floor between the balls
    for (let s = 0; s < 4; s++) {
      const pts = [spots[s], spots[s + 3], spots[s + 6 < spots.length ? s + 6 : s + 1]].map(([x, z], j) =>
        new THREE.Vector3(x, 0.02, z).add(new THREE.Vector3(Math.sin(s * 3 + j) * 0.4, 0, Math.cos(s * 5 + j) * 0.4)));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.013, 5), paint(cols[(s * 2 + 1) % cols.length]));
      tube.userData.noInk = true;
      K.g.add(tube);
    }
    // ── the cats ──
    // Pickle chases a runaway ball round the room
    const pickle = makeCat(0xe09a52, 0xd98a40);
    const ball = K.put(new THREE.SphereGeometry(0.11, 10, 8), paint(0xe8604c), 0, 0.11, -2);
    const bw = K.put(new THREE.TorusGeometry(0.11, 0.015, 6, 16), paint(0xe4b84f), 0, 0.11, -2);
    bw.userData.noInk = true;
    K.g.add(pickle.g);
    const orbit = (tt) => { const a = tt * 0.62; return [Math.cos(a) * 2.1, -2.1 + Math.sin(a) * 1.15, a]; };
    LIVE.push((t) => {
      const [bx, bz, a] = orbit(t);
      ball.position.set(bx, 0.11, bz); bw.position.set(bx, 0.11, bz);
      ball.rotation.z -= 0.08; bw.rotation.y = a;
      const [cx, cz] = orbit(t - 0.55), [nx, nz] = orbit(t - 0.5);
      catMove(pickle, cx, cz, nx - cx, nz - cz, t);
    });
    // Mochi sits on her haunches under the shelf, batting at a strand
    const mochi = makeCat(0x9a9490, 0xb8b2ac);
    mochi.g.position.set(-2.0, 0.03, -4.05);
    mochi.g.rotation.order = 'YXZ';
    mochi.g.rotation.y = -2.3;                 // facing the hanging strand
    mochi.g.rotation.x = -0.5;                 // up on her haunches, nose to the toy
    mochi.legs[0].rotation.x = 0.5;            // front legs stay planted under her
    mochi.legs[2].rotation.x = 0.95;           // hind legs tucked beneath
    mochi.legs[3].rotation.x = 0.95;
    K.g.add(mochi.g);
    const strandG = new THREE.Group(); strandG.position.set(-2.35, 1.3, -4.4);
    const strand = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.03, -0.45, 0.05), new THREE.Vector3(-0.02, -0.9, 0.02),
    ]), 12, 0.013, 5), paint(0x8f7ae8));
    strand.userData.noInk = true;
    strandG.add(strand);
    const strandBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 7), paint(0x8f7ae8));
    strandBall.position.set(-0.02, -0.95, 0.02);
    strandG.add(strandBall);
    K.g.add(strandG);
    LIVE.push((t) => {
      strandG.rotation.z = Math.sin(t * 2.3) * 0.3;
      strandG.rotation.x = Math.cos(t * 1.7) * 0.15;
      // the batting paw hinges at the shoulder: planted (0.5) up to a raised swipe
      mochi.legs[1].rotation.x = 0.5 - Math.max(0, Math.sin(t * 2.3 + 0.6)) * 1.3;
      mochi.tail.rotation.y = Math.sin(t * 3.1) * 0.5;
    });
    // Biscuit does zoomies along the front of the room
    const biscuit = makeCat(0x2a2230, 0x3a3240);
    K.g.add(biscuit.g);
    LIVE.push((t) => {
      const x = Math.sin(t * 0.9) * 2.7, dx = Math.cos(t * 0.9);
      catMove(biscuit, x, -0.9 + Math.sin(t * 1.8) * 0.2, dx, Math.cos(t * 1.8) * 0.2, t, 13);
      biscuit.g.scale.z = 1 + Math.abs(dx) * 0.12;        // stretch along her OWN length (local z is her nose-to-tail axis)
    });
  },



  'borrowed-eyes'(K) {
    // the menagerie is IN: frog, bee, goldfish, and a bat on the rail
    // the frog, hopping a lazy circuit
    const frogG = new THREE.Group(); K.g.add(frogG);
    const F = kit(frogG), green = paint(0x6f9a4c, { hatch: 0.4 });
    F.put(new THREE.SphereGeometry(0.1, 10, 8).scale(1.15, 0.8, 1.3), green, 0, 0.09, 0);
    for (const s of [-1, 1]) {
      F.put(new THREE.SphereGeometry(0.035, 8, 6), green, s * 0.055, 0.17, 0.06);
      F.put(new THREE.SphereGeometry(0.016, 6, 5), paint(0x2a2230, { hatch: 0 }), s * 0.055, 0.18, 0.085);
      F.put(new THREE.SphereGeometry(0.045, 7, 6).scale(1.4, 0.6, 1), green, s * 0.1, 0.045, -0.04);
    }
    ink(frogG, 'fine');
    frogG.add(blobShadow(0.12));
    LIVE.push((t) => {
      const s = (t * 0.35) % 1, a = Math.floor(t * 0.35) * 1.3;
      const hop = Math.max(0, Math.sin(s * Math.PI * 3)) * 0.22;
      frogG.position.set(-1.6 + Math.cos(a) * 1.1 + Math.cos(a + 1.3) * s * 0.9, hop, -2.1 + Math.sin(a) * 0.9 + Math.sin(a + 1.3) * s * 0.7);
      frogG.rotation.y = a + 1.3 + Math.PI / 2;
      frogG.scale.y = 1 - (hop > 0.01 ? 0 : Math.abs(Math.sin(t * 6)) * 0.1);
    });
    // the bee, figure-eighting round the room
    const beeG = new THREE.Group(); K.g.add(beeG);
    const BB = kit(beeG);
    BB.put(new THREE.SphereGeometry(0.05, 8, 7).scale(1.4, 1, 1), paint(0xe4b84f, { hatch: 0 }), 0, 0, 0);
    BB.box(0.02, 0.09, 0.09, paint(0x2a2230, { hatch: 0 }), 0.01, 0, 0, 0.006);
    BB.box(0.02, 0.09, 0.09, paint(0x2a2230, { hatch: 0 }), -0.035, 0, 0, 0.006);
    const wingL = BB.put(new THREE.CircleGeometry(0.05, 8), paint(0xffffff, { hatch: 0, opacity: 0.6 }), 0, 0.05, 0.03, [0.5, 0, 0]);
    const wingR = BB.put(new THREE.CircleGeometry(0.05, 8), paint(0xffffff, { hatch: 0, opacity: 0.6 }), 0, 0.05, -0.03, [-0.5, 0, 0]);
    wingL.userData.noInk = wingR.userData.noInk = true;
    ink(beeG, 'fine');
    LIVE.push((t) => {
      const a = t * 0.8;
      beeG.position.set(Math.sin(a) * 2.4, 1.3 + Math.sin(t * 2.3) * 0.25, -2.6 + Math.sin(a * 2) * 1.3);
      beeG.rotation.y = Math.atan2(Math.cos(a) * 2.4, Math.cos(a * 2) * 2.6) + Math.PI / 2;
      wingL.rotation.x = 0.5 + Math.sin(t * 40) * 0.5;
      wingR.rotation.x = -0.5 - Math.sin(t * 40) * 0.5;
    });
    // the goldfish bowl on its own stand
    const standG = kit(new THREE.Group()); standG.g.position.set(-3.2, 0, -1.3);
    standG.put(new THREE.CylinderGeometry(0.12, 0.16, 0.8, 10), paint(PAL.bark), 0, 0.4, 0);
    standG.put(new THREE.SphereGeometry(0.3, 16, 12, 0, Math.PI * 2, 0.6, Math.PI - 0.6).scale(1, 0.9, 1), paint(0xcfe6ef, { opacity: 0.4, hatch: 0 }), 0, 1.05, 0).userData.noInk = true;
    standG.put(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 16), paint(0x8fc3c9, { opacity: 0.75, hatch: 0 }), 0, 1.1, 0).userData.noInk = true;
    ink(standG.g, 'fine');
    K.g.add(standG.g);
    const fish = kit(new THREE.Group());
    fish.put(new THREE.SphereGeometry(0.05, 8, 7).scale(1.5, 1, 0.8), paint(0xf0a040, { hatch: 0 }), 0, 0, 0);
    fish.put(new THREE.ConeGeometry(0.035, 0.07, 6), paint(0xe8604c, { hatch: 0 }), -0.09, 0, 0, [0, 0, Math.PI / 2]);
    ink(fish.g, 'fine');
    K.g.add(fish.g);
    LIVE.push((t) => {
      const a = t * 1.6;
      fish.g.position.set(-3.2 + Math.cos(a) * 0.14, 1.03 + Math.sin(t * 2.7) * 0.04, -1.3 + Math.sin(a) * 0.14);
      fish.g.rotation.y = -a;
    });
    // the bat, asleep on the picture rail (it stretches now and then)
    const batG = new THREE.Group(); batG.position.set(2.2, 2.05, -D + 0.6);
    const BT = kit(batG);
    BT.put(new THREE.SphereGeometry(0.07, 8, 7).scale(0.9, 1.3, 0.9), paint(0x4a4258, { hatch: 0.4 }), 0, -0.1, 0);
    for (const s of [-1, 1]) BT.put(new THREE.ConeGeometry(0.02, 0.05, 5), paint(0x4a4258), s * 0.03, -0.2, 0, [Math.PI, 0, 0]);
    const wings = [];
    for (const s of [-1, 1]) {
      const wg = BT.box(0.12, 0.16, 0.015, paint(0x3a3448, { hatch: 0.4 }), s * 0.085, -0.08, 0, 0.005, [0, 0, s * 0.5]);
      wings.push([wg, s]);
    }
    ink(batG, 'fine');
    K.g.add(batG);
    LIVE.push((t) => {
      const stretch = Math.max(0, Math.sin(t * 0.4) - 0.92) * 12;
      for (const [wg, s] of wings) wg.rotation.z = s * (0.5 - stretch * 0.45);
      batG.scale.y = 1 + Math.sin(t * 1.1) * 0.02;        // breathing
    });
  },

};

// ─── FURNISHING: every room reads as a lived-in shop, not a bare box ────────
const ACCENT = {
  behaviors: 0x3f5872, qr: 0x2a2230, yarnflow: 0x8f7ae8, deckgpt: 0xb03a30,
  splatform: 0xe8604c, 'borrowed-eyes': 0x2f5a52, gallery: 0x6a4a8a, library: 0x8e2f3a,
};
function furnish(K, id, wallHex, theme) {
  if (theme?.bare) return;
  const acc = ACCENT[id] ?? 0x8a6448, trim = paint(0xfffaf0);
  const panel = paint(new THREE.Color(wallHex).multiplyScalar(0.84).getHex(), { hatch: 0.5 });
  // wainscot: a darker lower panel and a chair rail round all three walls
  K.box(W - 0.1, 0.9, 0.03, panel, 0, 0.45, -D + 0.52, 0.01);
  K.box(W - 0.1, 0.05, 0.06, trim, 0, 0.92, -D + 0.54, 0.015);
  for (const s of [-1, 1]) {
    K.box(0.03, 0.9, D - 0.1, panel, s * (W / 2 - 0.02), 0.45, -D / 2 + 0.5, 0.01);
    K.box(0.06, 0.05, D - 0.1, trim, s * (W / 2 - 0.04), 0.92, -D / 2 + 0.5, 0.015);
  }
}

// one centrepiece per room in the open floor, tied to what the app does

// one centrepiece per room in the open floor, tied to what the app does
const CENTER = {
  qr(K) {
    // ── the map table: seven regions, each one waking up in turn ──
    {
      const x = -2.3, z = -1.9, wood = paint(0x6b4a34);
      K.box(1.5, 0.06, 1.0, wood, x, 0.72, z, 0.02);
      for (const [dx, dz] of [[-0.68, -0.43], [0.68, -0.43], [-0.68, 0.43], [0.68, 0.43]]) K.box(0.06, 0.7, 0.06, wood, x + dx, 0.35, z + dz, 0.015);
      K.box(1.36, 0.04, 0.86, paint(0x8fc3c9), x, 0.77, z, 0.01);
      const regs = [[-0.48, -0.2, 0.34, 0.36, 0xa8b994], [-0.48, 0.18, 0.34, 0.3, 0xe1b95c], [-0.12, -0.15, 0.36, 0.44, 0xdc9e9a], [-0.12, 0.22, 0.36, 0.26, 0xd58b63], [0.24, -0.12, 0.34, 0.5, 0xe8d77a], [0.24, 0.25, 0.34, 0.22, 0xe8a0a0], [0.5, -0.08, 0.16, 0.4, 0xb7a3c6]];
      const tiles = regs.map(([dx, dz, rw, rd, col], i) => {
        const g = new THREE.Group(); g.position.set(x + dx, 0.8, z + dz); K.g.add(g);
        g.add(new THREE.Mesh(rb(rw - 0.02, 0.05, rd - 0.02, 0.01), paint(col)));
        const pin = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 8).rotateX(Math.PI), paint(0xe8604c)); pin.position.y = 0.09; g.add(pin);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), paint(0xe8604c)); head.position.y = 0.14; g.add(head);
        return { g, pin, head };
      });
      const NAMES = [['Northwest', 'sway'], ['West', 'float'], ['Southwest', 'hop'], ['Midwest', 'wave'], ['Southeast', 'swing'], ['Mid-Atlantic', 'rush'], ['Northeast', 'twirl']];
      let on = 0, t0 = 0;
      mini(K, x, z + 0.85, 'wake a region', (m) => {
        on = (on + 1) % tiles.length; t0 = NOW;
        m.say(`${NAMES[on][0]}: its companies ${NAMES[on][1]}. On the real map, click a region and it breaks off into its own little world.`);
      });
      LIVE.push((t) => {
        if (t - t0 > 2.5) { on = (on + 1) % tiles.length; t0 = t; }
        tiles.forEach((tl, i) => {
          const k = i === on ? Math.sin(Math.min(1, (t - t0) / 1.25) * Math.PI) : 0;
          tl.g.position.y = 0.8 + k * 0.05;
          tl.pin.position.y = 0.09 + k * 0.12; tl.head.position.y = 0.14 + k * 0.12;
        });
      });
      K.cols.push({ x0: x - 0.8, x1: x + 0.8, z0: z - 0.55, z1: z + 0.55 });
    }
    // ── the sculpture: a little company model breaks into pixels that land on its QR code ──
    {
      const x = 2.3, z = -2.0;
      K.put(new THREE.CylinderGeometry(0.32, 0.38, 0.75, 20), paint(0xf6efdf), x, 0.375, z);
      K.put(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 20), paint(0x2a2230, { hatch: 0 }), x, 0.77, z);
      const n = 9, cell = 0.07, R = rng(8);
      // the model: a little shop with a roof and a door, as voxels
      const model = [];
      for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) for (let zz = 0; zz < 3; zz++) {
        if (yy < 3 && (xx === 0 || xx === 3 || zz === 0 || zz === 2)) model.push([xx - 1.5, yy, zz - 1, yy === 0 && xx === 1 && zz === 2 ? 0x2a2230 : 0xe8604c]);
        else if (yy === 3 && zz === 1) model.push([xx - 1.5, yy, zz - 1, 0xe4b84f]);
      }
      // the code: a 9×9 with finder corners
      const code = [];
      const fd = (i, j) => (i === 0 || i === 2 || j === 0 || j === 2) || (i === 1 && j === 1);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        let on;
        if (i < 3 && j < 3) on = fd(i, j); else if (i > n - 4 && j < 3) on = fd(i - (n - 3), j); else if (i < 3 && j > n - 4) on = fd(i, j - (n - 3));
        else on = R() < 0.5;
        if (on) code.push([i - (n - 1) / 2, (n - 1) - j]);
      }
      const N = Math.max(model.length, code.length);
      const px = [];
      for (let k = 0; k < N; k++) {
        const m = new THREE.Mesh(rb(cell * 0.92, cell * 0.92, cell * 0.92, 0.008), paint(0xffffff, { unique: true }));
        m.userData.noInk = true; K.g.add(m);
        const a = model[k % model.length], b = code[k % code.length];
        px.push({ m, a: new THREE.Vector3(x + a[0] * cell, 0.82 + a[1] * cell, z + a[2] * cell), ca: new THREE.Color(a[3]),
          b: new THREE.Vector3(x + b[0] * cell, 0.82 + b[1] * cell, z + 0.1), d: R() * 0.25 });
      }
      const ink = new THREE.Color(0x2a2230), P = new THREE.Vector3();
      const st = station(8.3, 0, 0);
      mini(K, x - 0.1, z + 0.75, 'scan the model', (m) => {
        const s = st.p();
        if (s < 0.2 || s > 0.92) { st.set(0.2); m.say('Tap a company and its model breaks into pixels that land on its QR code: scannable, and it links back.'); }
        else { st.set(0.7); m.say('…and back into the little shop it was.'); }
      });
      LIVE.push((t) => {
        const s = st.p();
        px.forEach((p) => {
          const f = Math.min(1, Math.max(0, (s - 0.2 - p.d) / 0.18)) - Math.min(1, Math.max(0, (s - 0.7 - p.d) / 0.18));
          const e = f * f * (3 - 2 * f);
          P.lerpVectors(p.a, p.b, e); P.y += Math.sin(e * Math.PI) * 0.25;
          p.m.position.copy(P); p.m.rotation.set(e * 3, e * 2, 0);
          p.m.material.color.copy(p.ca).lerp(ink, e);
        });
      });
      K.cols.push({ x0: x - 0.45, x1: x + 0.45, z0: z - 0.45, z1: z + 0.45 });
    }
  },
  'borrowed-eyes'(K) {  // a giant eye under a glass dome, looking around the room
    const x = 1.6, z = -1.8, wood = paint(0x7a5a40, { hatch: 0.6 });   // a tree stump
    K.put(new THREE.CylinderGeometry(0.22, 0.28, 0.8, 16), wood, x, 0.4, z);
    K.put(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20), paint(PAL.gold), x, 0.82, z);
    const eye = new THREE.Group(); eye.position.set(x, 1.05, z); K.g.add(eye);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 18), paint(0xfbf8f1, { hatch: 0 })));
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), paint(0x5f9a6a, { hatch: 0 })); iris.scale.z = 0.4; iris.position.z = 0.15; iris.userData.noInk = true; eye.add(iris);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), paint(0x111014, { hatch: 0 })); pupil.scale.z = 0.4; pupil.position.z = 0.175; pupil.userData.noInk = true; eye.add(pupil);
    const dome = K.put(new THREE.SphereGeometry(0.26, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), paint(0xdff0f6, { opacity: 0.28, hatch: 0, side: THREE.DoubleSide }), x, 0.85, z); dome.userData.noInk = true;
    LIVE.push((t) => { eye.rotation.y = 0.9 * Math.sin(t * 0.5) + 0.25 * Math.sin(t * 1.7); eye.rotation.x = 0.25 * Math.sin(t * 0.8); });
    K.cols.push({ x0: x - 0.35, x1: x + 0.35, z0: z - 0.35, z1: z + 0.35 });
  },
  gallery(K) {          // the museum bench, where visitors sat and looked
    const x = -1.4, z = -1.7;
    K.box(1.4, 0.12, 0.45, paint(0x6a4a8a), x, 0.44, z, 0.05);
    K.box(1.3, 0.3, 0.38, paint(0x2a2230, { hatch: 0 }), x, 0.2, z, 0.03);
    K.cols.push({ x0: x - 0.75, x1: x + 0.75, z0: z - 0.3, z1: z + 0.3 });
  },
};

// ─── THEMES: every room gets its own walls and floor, not one shop fitted out eight ways ───
// wallpaper/floor painters draw one seamless tile (or a whole mural) onto a canvas;
// `env` builds what makes the room a place — a forest, a cinema, a post office.
const rng = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
// draw a scattered element so it wraps across the tile edges seamlessly
const wrap9 = (w, h, fn) => { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) fn(ox, oy); };
function splat(c, x, y, r, col, R) {
  c.fillStyle = col;
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  for (let i = 0; i < 9; i++) {
    const a = R() * 7, d = r * (0.9 + R() * 1.4), rr = r * (0.08 + R() * 0.28);
    c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, 7); c.fill();
  }
}
function planksDraw(c, w, h, cols, n, seam = 'rgba(40,24,16,0.4)') {
  const ph = h / n;
  for (let i = 0; i < n; i++) {
    c.fillStyle = cols[i % cols.length]; c.fillRect(0, i * ph, w, ph);
    c.strokeStyle = seam; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, i * ph + ph - 1); c.lineTo(w, i * ph + ph - 1); c.stroke();
    const off = (i % 2) * w / 2 + w / 4;
    c.beginPath(); c.moveTo(off % w, i * ph); c.lineTo(off % w, i * ph + ph); c.stroke();
    c.strokeStyle = 'rgba(40,24,16,0.12)'; c.lineWidth = 1;
    for (let k = 0; k < 3; k++) { const y = i * ph + ph * (0.25 + k * 0.25); c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + 3, w * 0.6, y - 3, w, y); c.stroke(); }
  }
}
function basketweave(c, w, h, cols) {
  const cell = w / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const vert = (i + j) % 2, x = i * cell, y = j * cell;
    for (let k = 0; k < 3; k++) {
      c.fillStyle = cols[(i * 3 + j * 5 + k) % cols.length];
      if (vert) c.fillRect(x + k * cell / 3, y, cell / 3, cell); else c.fillRect(x, y + k * cell / 3, cell, cell / 3);
      c.strokeStyle = 'rgba(40,24,16,0.35)'; c.lineWidth = 1.5;
      if (vert) c.strokeRect(x + k * cell / 3, y, cell / 3, cell); else c.strokeRect(x, y + k * cell / 3, cell, cell / 3);
    }
  }
}
// the forest painted round the walls: sky, three layers of trees, big leaves in front
function forestMural(c, w, h, seed) {
  const R = rng(seed);
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#fbeec0'); sky.addColorStop(0.45, '#e3efc9'); sky.addColorStop(1, '#b9d6a8');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  // sun haze
  const sun = c.createRadialGradient(w * (0.3 + R() * 0.4), h * 0.12, 4, w * 0.5, h * 0.12, w * 0.4);
  sun.addColorStop(0, 'rgba(255,248,214,0.9)'); sun.addColorStop(1, 'rgba(255,248,214,0)');
  c.fillStyle = sun; c.fillRect(0, 0, w, h);
  const layers = [['#a7c9a0', 0.42, 0.09], ['#7eaf7f', 0.55, 0.12], ['#5a8f63', 0.7, 0.15]];
  layers.forEach(([col, base, rad], L) => {
    // trunks
    c.fillStyle = ['#a99c86', '#8a7a62', '#6b5a44'][L];
    for (let x = R() * 60; x < w; x += 70 + R() * 90) c.fillRect(x, h * (base - 0.05), 6 + L * 5, h);
    c.fillStyle = col;
    for (let x = -20; x < w + 40; x += h * rad * (0.7 + R() * 0.6)) {
      const r = h * rad * (0.7 + R() * 0.7), y = h * base - R() * h * 0.1;
      c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.strokeStyle = 'rgba(42,34,48,0.18)'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, r, Math.PI * 1.05, Math.PI * 1.9); c.stroke();
    }
    c.fillRect(0, h * base, w, h);
  });
  // light shafts
  c.fillStyle = 'rgba(255,250,220,0.22)';
  for (let i = 0; i < 4; i++) { const x = R() * w; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 40, 0); c.lineTo(x + 160, h); c.lineTo(x + 70, h); c.fill(); }
  // big foreground leaves along the bottom
  for (let x = -30; x < w + 30; x += 26 + R() * 30) {
    const len = h * (0.18 + R() * 0.22), a = -Math.PI / 2 + (R() - 0.5) * 1.3;
    c.save(); c.translate(x, h + 6); c.rotate(a + Math.PI / 2);
    c.fillStyle = ['#3f7a4c', '#4f8f58', '#2f6a44', '#5e9d5e'][Math.floor(R() * 4)];
    c.beginPath(); c.ellipse(0, -len / 2, len * 0.22, len / 2, 0, 0, 7); c.fill();
    c.strokeStyle = 'rgba(230,245,210,0.5)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -len * 0.95); c.stroke();
    c.restore();
  }
  // flowers dotted in the undergrowth
  for (let i = 0; i < 40; i++) {
    const x = R() * w, y = h * (0.72 + R() * 0.25), r = 3 + R() * 4;
    c.fillStyle = ['#f29bb4', '#f6c453', '#ffffff', '#e8604c', '#b7a3e6'][i % 5];
    for (let p = 0; p < 5; p++) { c.beginPath(); c.arc(x + Math.cos(p * 1.26) * r, y + Math.sin(p * 1.26) * r, r * 0.7, 0, 7); c.fill(); }
    c.fillStyle = '#f6d36b'; c.beginPath(); c.arc(x, y, r * 0.5, 0, 7); c.fill();
  }
}
function forestFloor(c, w, h) {
  const R = rng(7);
  c.fillStyle = '#86ad62'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    c.fillStyle = ['rgba(70,120,60,0.35)', 'rgba(170,200,110,0.35)', 'rgba(110,150,70,0.3)'][i % 3];
    c.beginPath(); c.ellipse(R() * w, R() * h, 30 + R() * 70, 20 + R() * 40, R() * 3, 0, 7); c.fill();
  }
  // grass blades
  for (let i = 0; i < 2600; i++) {
    const x = R() * w, y = R() * h, l = 6 + R() * 9;
    c.strokeStyle = R() < 0.5 ? 'rgba(60,110,50,0.55)' : 'rgba(190,220,130,0.55)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - 0.5) * 5, y - l); c.stroke();
  }
  // a dirt path winding from the door (bottom) to the counter (top)
  const path = [[0.5, 1.02], [0.44, 0.85], [0.56, 0.68], [0.47, 0.52], [0.5, 0.36]];
  c.strokeStyle = '#c9ad7f'; c.lineWidth = w * 0.11; c.lineCap = 'round';
  c.beginPath(); c.moveTo(path[0][0] * w, path[0][1] * h);
  for (let i = 1; i < path.length; i++) c.lineTo(path[i][0] * w, path[i][1] * h);
  c.stroke();
  c.strokeStyle = 'rgba(120,90,50,0.25)'; c.lineWidth = w * 0.11 + 8; c.globalCompositeOperation = 'destination-over'; c.stroke(); c.globalCompositeOperation = 'source-over';
  // stepping stones along it
  for (let t = 0.05; t < 0.98; t += 0.08) {
    const s = t * (path.length - 1), i = Math.floor(s), f = s - i, a = path[i], b = path[Math.min(i + 1, path.length - 1)];
    const x = (a[0] + (b[0] - a[0]) * f) * w + (R() - 0.5) * 16, y = (a[1] + (b[1] - a[1]) * f) * h;
    c.fillStyle = '#bdb6a8'; c.beginPath(); c.ellipse(x, y, 22 + R() * 8, 15 + R() * 5, R(), 0, 7); c.fill();
    c.strokeStyle = 'rgba(42,34,48,0.5)'; c.lineWidth = 2; c.stroke();
  }
  // clover, daisies, buttercups
  for (let i = 0; i < 220; i++) {
    const x = R() * w, y = R() * h, k = i % 4;
    if (k === 0) { c.fillStyle = 'rgba(70,130,60,0.8)'; for (let p = 0; p < 3; p++) { c.beginPath(); c.arc(x + Math.cos(p * 2.1) * 3, y + Math.sin(p * 2.1) * 3, 3, 0, 7); c.fill(); } }
    else { c.fillStyle = ['#ffffff', '#f6c453', '#f29bb4'][k - 1]; for (let p = 0; p < 5; p++) { c.beginPath(); c.arc(x + Math.cos(p * 1.26) * 3, y + Math.sin(p * 1.26) * 3, 2.2, 0, 7); c.fill(); } c.fillStyle = '#e4a83f'; c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); }
  }
}

// one crochet stitch: a plump loop standing up from its base, with the V of its top
function stitch(c, x, y, ang, len, wid, col) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = col; c.strokeStyle = 'rgba(50,25,40,0.55)'; c.lineWidth = 1.4;
  c.beginPath(); c.roundRect(-wid / 2, 0, wid, len, wid / 2); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-wid * 0.15, len * 0.2); c.lineTo(-wid * 0.15, len * 0.75); c.stroke();
  c.strokeStyle = 'rgba(50,25,40,0.45)';
  c.beginPath(); c.moveTo(-wid * 0.4, len * 0.82); c.lineTo(0, len * 0.95); c.lineTo(wid * 0.4, len * 0.82); c.stroke();
  c.restore();
}
// a granny square: a ring in the middle, then rounds of three-stitch clusters with
// chain gaps between them, two clusters at each corner, and a single-crochet border
function grannySquare(c, x0, y0, s, cols) {
  const cx = x0 + s / 2, cy = y0 + s / 2, L = s * 0.11, Wd = s * 0.045;
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; stitch(c, cx + Math.cos(a) * s * 0.025, cy + Math.sin(a) * s * 0.025, a - Math.PI / 2, s * 0.06, Wd, cols[0]); }
  const cluster = (x, y, ang, col) => {
    for (const d of [-1, 0, 1]) stitch(c, x + Math.cos(ang) * d * Wd * 0.95, y + Math.sin(ang) * d * Wd * 0.95, ang - Math.PI / 2 + d * 0.12, L, Wd, col);
  };
  for (let k = 1; k <= 3; k++) {
    const r = s * (0.02 + k * 0.115), col = cols[k % cols.length];
    for (let side = 0; side < 4; side++) {
      const out = side * Math.PI / 2;                              // outward normal of this side
      const nx = Math.cos(out), ny = Math.sin(out), tx = -ny, ty = nx;
      // clusters along the side, between the corners
      for (let q = 0; q < k - 1; q++) {
        const u = (-1 + (2 * q + 2) / k) * r * 0.82;
        cluster(cx + nx * r + tx * u, cy + ny * r + ty * u, out + Math.PI / 2, col);
      }
      // the corner: two clusters fanned round it
      const ca = out + Math.PI / 4, cr = r * 1.3;
      for (const f of [-0.32, 0.32]) cluster(cx + Math.cos(ca + f * 0.6) * cr * 0.92, cy + Math.sin(ca + f * 0.6) * cr * 0.92, ca + f + Math.PI / 2, col);
    }
  }
  // a border round of single crochet, then the seam it's whipped to its neighbours with
  const b = s * 0.035, n = 26, edge = cols[3] || '#f6eedb';
  for (let side = 0; side < 4; side++) for (let q = 0; q <= n; q++) {
    const u = b + (s - 2 * b) * q / n;
    const [x, y, ang] = [[x0 + u, y0 + b * 0.4, 0], [x0 + s - b * 0.4, y0 + u, Math.PI / 2], [x0 + s - u, y0 + s - b * 0.4, Math.PI], [x0 + b * 0.4, y0 + s - u, -Math.PI / 2]][side];
    stitch(c, x, y, ang, b * 1.25, s / n * 0.95, edge);
  }
  c.strokeStyle = 'rgba(60,40,50,0.6)'; c.lineWidth = 2; c.setLineDash([5, 4]);
  c.strokeRect(x0 + 1, y0 + 1, s - 2, s - 2); c.setLineDash([]);
}

const THEMES = {
  qr: {
    wash: [0.2, '#e3ece8'],
    tile: [512, 2.2, (c, w, h) => {             // a contour map, pins in it
      c.fillStyle = '#e3ece8'; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(60,110,100,0.12)'; c.lineWidth = 1;
      for (let i = 0; i <= w; i += 64) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); }
      const R = rng(21);
      for (let k = 0; k < 5; k++) {
        const cx = R() * w, cy = R() * h, base = 40 + R() * 50, ph = R() * 6;
        wrap9(w, h, (ox, oy) => {
          for (let ring = 0; ring < 5; ring++) {
            const rr = base - ring * 9;
            if (rr < 6) break;
            c.strokeStyle = ring === 0 ? 'rgba(60,110,100,0.4)' : 'rgba(60,110,100,0.22)'; c.lineWidth = ring === 0 ? 2 : 1.4;
            c.beginPath();
            for (let a = 0; a <= 6.3; a += 0.2) {
              const r2 = rr * (1 + 0.22 * Math.sin(a * 3 + ph) + 0.1 * Math.sin(a * 5 + ph * 2));
              const x = cx + ox + Math.cos(a) * r2 * 1.3, y = cy + oy + Math.sin(a) * r2;
              a === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
            }
            c.closePath(); c.stroke();
          }
        });
      }
      for (let k = 0; k < 6; k++) {
        const x = R() * w, y = R() * h;
        wrap9(w, h, (ox, oy) => {
          c.fillStyle = ['#e8604c', '#3f5aa8', '#e4b84f'][k % 3];
          c.beginPath(); c.arc(x + ox, y + oy - 10, 7, 0, 7); c.fill();
          c.beginPath(); c.moveTo(x + ox - 6, y + oy - 7); c.lineTo(x + ox, y + oy + 4); c.lineTo(x + ox + 6, y + oy - 7); c.fill();
        });
      }
    }],
    floor: (c, w, h) => {                      // the floor is a QR code, laid in tiles
      planksDraw(c, w, h, ['#c49f72', '#bd9a6e', '#c7a476', '#b8956a'], 20);
      const n = 25, size = h * 0.66, m = size / n, x0 = w / 2 - size / 2, y0 = h * 0.56 - size / 2, R = rng(5);
      c.fillStyle = '#f6efdf'; c.fillRect(x0 - m * 2, y0 - m * 2, size + m * 4, size + m * 4);
      c.strokeStyle = '#2a2230'; c.lineWidth = 3; c.strokeRect(x0 - m * 2, y0 - m * 2, size + m * 4, size + m * 4);
      const finder = (i, j) => i >= 0 && i < 7 && j >= 0 && j < 7 && (i === 0 || i === 6 || j === 0 || j === 6 || (i > 1 && i < 5 && j > 1 && j < 5));
      const inFinder = (i, j) => (i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        let on;
        if (inFinder(i, j)) on = finder(i, j) || finder(i - (n - 7), j) || finder(i, j - (n - 7));
        else if (i === 6 || j === 6) on = (i + j) % 2 === 0;
        else on = R() < 0.48;
        if (on) { c.fillStyle = '#2a2230'; c.fillRect(x0 + i * m + 1, y0 + j * m + 1, m - 2, m - 2); }
      }
    },
    rug: false,
  },
  'borrowed-eyes': { mural: forestMural, floor: forestFloor, bare: true, rug: false },
  yarnflow: {
    wash: [0.3, '#f2d9d6'],
    tile: [128, 0.36, (c, w, h) => {             // knitted stockinette: rows of little Vs
      c.fillStyle = '#e9c8c3'; c.fillRect(0, 0, w, h);
      const sw = w / 8, sh = h / 8;
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
        const x = i * sw + sw / 2, y = j * sh + sh / 2;
        const band = j < 2 ? '#d9a9b8' : j === 5 ? '#f3dfa8' : '#f2d9d6';
        for (const s of [-1, 1]) {
          c.fillStyle = band; c.beginPath(); c.ellipse(x + s * sw * 0.22, y, sw * 0.24, sh * 0.5, s * -0.5, 0, 7); c.fill();
          c.strokeStyle = 'rgba(120,70,80,0.35)'; c.lineWidth = 1.2; c.stroke();
        }
      }
    }],
    floor: (c, w, h) => {                      // a crocheted floor: granny squares, stitch by stitch
      const pal = [['#e8604c', '#e4b84f', '#7fb3a8', '#f6eedb'], ['#8f7ae8', '#f6eedb', '#dc9e9a', '#e4b84f'], ['#7fb3a8', '#e8604c', '#f3dfa8', '#93abc0'], ['#dc9e9a', '#a8b994', '#8f7ae8', '#f6eedb']];
      c.fillStyle = '#7a6670'; c.fillRect(0, 0, w, h);          // the shadow showing through the holes
      const s = w / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) grannySquare(c, i * s, j * s, s, pal[i * 2 + j]);
    },
    floorTile: 1.8, floorPx: 512,
    rug: false,
  },
  gallery: {
    wash: [0.3, '#c7b9d8'],
    tile: [256, 0.75, (c, w, h) => {             // museum damask
      c.fillStyle = '#c7b9d8'; c.fillRect(0, 0, w, h);
      const motif = (x, y) => {
        c.fillStyle = 'rgba(110,80,140,0.28)';
        c.beginPath(); c.ellipse(x, y, 18, 42, 0, 0, 7); c.fill();
        for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * 26, y + 10, 10, 26, s * 0.6, 0, 7); c.fill(); c.beginPath(); c.arc(x + s * 14, y - 40, 8, 0, 7); c.fill(); }
        c.fillStyle = 'rgba(228,184,79,0.35)'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill();
      };
      wrap9(w, h, (ox, oy) => { motif(w * 0.25 + ox, h * 0.25 + oy); motif(w * 0.75 + ox, h * 0.75 + oy); });
    }],
    floor: (c, w, h) => basketweave(c, w, h, ['#b58a5e', '#a77c52', '#c09468', '#9c7048']),
    floorTile: 1.2,
  },
};

// wall/floor materials for a theme (null = the old plain paint / planks)
function themeMats(theme, id) {
  if (!theme) return null;
  const out = { walls: [null, null, null], floor: null };
  const lens = [W, D, D];
  if (theme.mural) {
    out.walls = lens.map((len, i) => paint(0xffffff, { map: canvasTex(Math.round(384 * len / H), 384, (c, w, h) => theme.mural(c, w, h, 17 + i * 31)), hatch: 0.25, unique: true }));
  } else if (theme.tile) {
    const [px, tw, draw, th = tw] = theme.tile;
    // a wash of the base colour knocks the pattern back so the screen is the loudest thing
    const base = canvasTex(px, Math.round(px * th / tw), (c, w, h) => {
      draw(c, w, h);
      if (theme.wash) { c.globalAlpha = theme.wash[0]; c.fillStyle = theme.wash[1]; c.fillRect(0, 0, w, h); c.globalAlpha = 1; }
    });
    out.walls = lens.map((len) => {
      const t = base.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(len / tw, H / th); t.needsUpdate = true;
      return paint(0xffffff, { map: t, hatch: 0.3, unique: true });
    });
  }
  if (theme.floor) {
    const ft = theme.floorTile;
    const t = ft ? canvasTex(theme.floorPx || 256, theme.floorPx || 256, theme.floor) : canvasTex(1024, 768, theme.floor);
    if (ft) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / ft, D / ft); }
    out.floor = paint(0xffffff, { map: t, hatch: 0.3, unique: true });
  }
  return out;
}

// ─── ENVIRONMENTS: what turns a themed room into a place ───
// a leaf texture shared by every fern, vine and canopy
let _leafTex = null;
function leafTex() {
  if (_leafTex) return _leafTex;
  return (_leafTex = canvasTex(64, 128, (c, w, h) => {
    c.fillStyle = '#4f8f58'; c.beginPath(); c.moveTo(w / 2, h - 2); c.bezierCurveTo(-4, h * 0.6, w * 0.2, h * 0.1, w / 2, 2); c.bezierCurveTo(w * 0.8, h * 0.1, w + 4, h * 0.6, w / 2, h - 2); c.fill();
    c.strokeStyle = '#2a2230'; c.lineWidth = 2.5; c.stroke();
    c.strokeStyle = 'rgba(220,240,200,0.7)'; c.lineWidth = 2; c.beginPath(); c.moveTo(w / 2, h - 4); c.lineTo(w / 2, 8); c.stroke();
  }));
}
let _frondTex = null;
function frondTex() {
  if (_frondTex) return _frondTex;
  return (_frondTex = canvasTex(64, 256, (c, w, h) => {
    c.strokeStyle = '#2f6a44'; c.lineWidth = 3; c.beginPath(); c.moveTo(w / 2, h); c.lineTo(w / 2, 4); c.stroke();
    for (let y = h - 14; y > 8; y -= 11) {
      const l = (w / 2 - 4) * Math.sin(Math.PI * (1 - y / h) * 0.95 + 0.1);
      for (const s of [-1, 1]) {
        c.fillStyle = (y / 11) % 2 ? '#4f8f58' : '#5e9d5e';
        c.beginPath(); c.ellipse(w / 2 + s * l / 2, y - 3, l / 2, 4, s * -0.35, 0, 7); c.fill();
      }
    }
  }));
}
const cutout = (tex, col = 0xffffff) => { const m = paint(col, { map: tex, hatch: 0, side: THREE.DoubleSide, unique: true }); m.alphaTest = 0.5; return m; };

function fern(K, x, z, s = 1, seed = 1) {
  const R = rng(seed * 97 + 3), m = cutout(frondTex());
  const g = new THREE.Group(); g.position.set(x, 0, z); K.g.add(g);
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22 * s, 0.85 * s).translate(0, 0.42 * s, 0), m);
    p.userData.noInk = true;
    p.rotation.order = 'YXZ'; p.rotation.y = i * 0.7 + R(); p.rotation.x = 0.5 + R() * 0.6;
    g.add(p);
  }
  return g;
}
function bloom(K, x, z, h, col, seed) {          // a tall jungle flower
  const R = rng(seed);
  const stem = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0, z), new THREE.Vector3(x + (R() - 0.5) * 0.15, h * 0.5, z + (R() - 0.5) * 0.15), new THREE.Vector3(x + (R() - 0.5) * 0.2, h, z)]);
  const sm = new THREE.Mesh(new THREE.TubeGeometry(stem, 8, 0.012, 5), paint(0x3f7a4c)); sm.userData.noInk = true; K.g.add(sm);
  const top = stem.getPoint(1), pet = paint(col);
  for (let p = 0; p < 5; p++) {
    const a = p * 1.256;
    const m = K.put(new THREE.SphereGeometry(0.055, 8, 6).scale(1, 0.35, 0.6), pet, top.x + Math.cos(a) * 0.05, top.y, top.z + Math.sin(a) * 0.05, [0, -a, 0.25]);
    m.userData.noInk = true;
  }
  K.put(new THREE.SphereGeometry(0.025, 8, 6), paint(0xf6d36b, { hatch: 0 }), top.x, top.y + 0.015, top.z).userData.noInk = true;
  for (const s of [-1, 1]) {
    const lp = stem.getPoint(0.35 + s * 0.08);
    const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.2).translate(0, 0.1, 0), cutout(leafTex()));
    lf.position.copy(lp); lf.rotation.set(0, R() * 3, s * 0.9); lf.userData.noInk = true; K.g.add(lf);
  }
}
function tree(K, x, z, seed) {                    // a big storybook tree, canopy brushing the ceiling
  const R = rng(seed), bark = paint(0x7a5a40, { hatch: 0.6 });
  const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0, z), new THREE.Vector3(x + 0.08, 0.9, z), new THREE.Vector3(x - 0.05, 1.7, z + 0.05), new THREE.Vector3(x, 2.2, z)]);
  K.g.add(new THREE.Mesh(new THREE.TubeGeometry(trunk, 16, 0.2, 10), bark));
  // flared roots
  for (let i = 0; i < 5; i++) {
    const a = i * 1.26 + R();
    K.put(new THREE.ConeGeometry(0.1, 0.5, 6), bark, x + Math.cos(a) * 0.22, 0.08, z + Math.sin(a) * 0.22, [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]);
  }
  // branches
  for (const [a, y] of [[0.6, 1.6], [2.6, 1.85], [4.4, 1.7]]) {
    const b = new THREE.CatmullRomCurve3([new THREE.Vector3(x, y, z), new THREE.Vector3(x + Math.cos(a) * 0.4, y + 0.25, z + Math.sin(a) * 0.3), new THREE.Vector3(x + Math.cos(a) * 0.75, y + 0.5, z + Math.sin(a) * 0.5)]);
    K.g.add(new THREE.Mesh(new THREE.TubeGeometry(b, 8, 0.06, 6), bark));
  }
  const greens = [0x5e9d5e, 0x4f8f58, 0x6fae66, 0x86a868];
  for (let i = 0; i < 9; i++) {
    const a = i * 0.7 + R(), r = 0.3 + R() * 0.55;
    const p = K.put(new THREE.IcosahedronGeometry(0.38 + R() * 0.2, 1), paint(greens[i % 4], { hatch: 0.5 }), x + Math.cos(a) * r, 2.25 + R() * 0.35, z + Math.sin(a) * r * 0.8);
    p.scale.y = 0.75;
  }
  K.cols.push({ x0: x - 0.32, x1: x + 0.32, z0: z - 0.32, z1: z + 0.32 });
}
function bunting(K, pts, n, make) {               // a sagging string with things hung along it
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.006, 4), paint(0x2a2230, { hatch: 0 }));
  tube.userData.noInk = true; K.g.add(tube);
  n = Math.max(3, Math.round(n * curve.getLength() / 7));        // n is per 7 m of string
  for (let i = 1; i < n; i++) { const t = i / n, p = curve.getPoint(t), tg = curve.getTangent(t); make(p, Math.atan2(-tg.z, tg.x), i); }
}
const sag = (a, b, d = 0.25) => [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - d, (a[2] + b[2]) / 2], b];
// three strings round the top of the room: along the back wall, then down each side
const topLoops = (y = 2.45) => [
  // (the back wall's string stops either side of the screen)
  sag([-W / 2 + 0.1, y, -D + 0.62], [-SCR_W / 2 - 0.15, y, -D + 0.62], 0.2),
  sag([SCR_W / 2 + 0.15, y, -D + 0.62], [W / 2 - 0.1, y, -D + 0.62], 0.2),
  sag([-W / 2 + 0.08, y, -D + 0.7], [-W / 2 + 0.08, y, -0.2], 0.3),
  sag([W / 2 - 0.08, y, -D + 0.7], [W / 2 - 0.08, y, -0.2], 0.3),
];

const ENV = {
  qr(K) {
    // pennants, each printed with its own little code
    const R = rng(3);
    for (const pts of topLoops()) bunting(K, pts, 12, (p, a, i) => {
      const f = K.flat(0.18, 0.22, texMat(60, 72, (c, w, h) => {
        c.fillStyle = '#f6efdf'; c.beginPath(); c.moveTo(2, 2); c.lineTo(w - 2, 2); c.lineTo(w / 2, h - 2); c.closePath(); c.fill();
        c.strokeStyle = INKC; c.lineWidth = 3; c.stroke();
        c.save(); c.clip(); c.fillStyle = INKC;
        for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 4; gy++) if (R() < 0.5) c.fillRect(12 + gx * 7, 8 + gy * 7, 7, 7);
        c.restore();
      }), p.x, p.y - 0.1, p.z, [0, a, 0]);
      f.material.side = THREE.DoubleSide;
    });
  },
  'borrowed-eyes'(K) {
    // ── a forest paradise: trees, ferns, vines, a pond, fireflies, butterflies ──
    tree(K, -3.45, -2.35, 5);
    tree(K, 3.45, -2.0, 9);
    // a leafy canopy along the top of every wall
    const greens = [0x5e9d5e, 0x4f8f58, 0x6fae66, 0x86a868, 0x3f7a4c];
    const canopyAt = (x, z, i) => { const p = K.put(new THREE.IcosahedronGeometry(0.28 + (i % 3) * 0.07, 1), paint(greens[i % 5], { hatch: 0.5 }), x, 2.62 + (i % 2) * 0.08, z); p.scale.y = 0.7; };
    for (let i = 0, x = -W / 2 + 0.2; x <= W / 2 - 0.2; x += 0.42, i++) if (Math.abs(x) > 1.3) canopyAt(x, -D + 0.75, i);   // a gap over the name sign
    for (const s of [-1, 1]) for (let i = 0, z = -D + 1.1; z <= -0.4; z += 0.45, i++) canopyAt(s * (W / 2 - 0.22), z, i + 2);
    // vines hanging from the canopy, swaying
    const leafM = cutout(leafTex()), vineM = paint(0x3f6a3c), vines = [];
    const vr = rng(23);
    const vineSpots = [];
    for (let x = -3.6; x <= 3.6; x += 0.45) if (Math.abs(x) > SCR_W / 2 + 0.15) vineSpots.push([x + vr() * 0.2, -D + 0.75]);
    for (const s of [-1, 1]) for (let z = -4.6; z <= -0.6; z += 0.6) vineSpots.push([s * (W / 2 - 0.25), z + vr() * 0.2]);
    vineSpots.forEach(([x, z], i) => {
      const len = 0.5 + vr() * 1.0, g = new THREE.Group(); g.position.set(x, 2.6, z); K.g.add(g);
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, -len * 0.5, 0.04), new THREE.Vector3(-0.03, -len, 0.02)]);
      const v = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.01, 4), vineM); v.userData.noInk = true; g.add(v);
      for (let k = 1; k <= Math.floor(len * 9); k++) {
        const p = curve.getPoint(k / Math.floor(len * 9 + 1));
        const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.13).translate(0, -0.06, 0), leafM);
        lf.position.copy(p); lf.rotation.set(0, vr() * 6, (k % 2 ? 1 : -1) * 0.8); lf.userData.noInk = true; g.add(lf);
      }
      if (i % 4 === 0) {                     // a few vines flower at the tip
        const f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), paint([0xf29bb4, 0xe8604c, 0xf6c453][i % 3]));
        f.position.copy(curve.getPoint(1)); f.userData.noInk = true; g.add(f);
      }
      vines.push([g, vr() * 6]);
    });
    LIVE.push((t) => { for (const [g, ph] of vines) { g.rotation.z = Math.sin(t * 0.7 + ph) * 0.05; g.rotation.x = Math.cos(t * 0.5 + ph) * 0.04; } });
    // ferns and flowers in the undergrowth, out of the walkway
    [[-3.6, -0.3, 1.2], [3.6, -0.3, 1.2], [-3.6, -3.4, 0.9], [3.6, -3.0, 0.8], [-2.4, -4.9, 0.9], [0.9, -5.0, 0.7], [-0.6, -5.0, 0.6], [2.2, -5.1, 0.8], [-3.6, -4.9, 1.0], [3.6, -4.9, 1.1]]
      .forEach(([x, z, s], i) => fern(K, x, z, s, i + 1));
    for (const s of [-1, 1]) K.cols.push({ x0: s * 3.6 - 0.45, x1: s * 3.6 + 0.45, z0: -0.75, z1: 0.2 });
    [[-3.75, -1.4, 0.9, 0xf29bb4], [-3.7, -3.2, 0.7, 0xe8604c], [3.75, -2.8, 0.85, 0xf6c453], [3.7, -1.2, 0.65, 0xb7a3e6], [-1.6, -5.2, 0.75, 0xe8604c], [1.4, -5.2, 0.9, 0xf29bb4], [-3.75, -4.2, 0.95, 0xf6c453], [3.75, -4.3, 0.75, 0xe8604c]]
      .forEach(([x, z, h, col], i) => bloom(K, x, z, h, col, i * 13 + 5));
    // mushrooms at the tree roots
    for (const [x, z, s] of [[-2.95, -2.1, 1], [-3.05, -2.75, 0.7], [3.0, -1.6, 0.9], [2.95, -2.35, 0.6], [-0.2, -1.1, 0.5]]) {
      K.put(new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.12 * s, 8), paint(0xf6eedb), x, 0.06 * s, z);
      const cap = K.put(new THREE.SphereGeometry(0.08 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), paint(0xd2483e), x, 0.11 * s, z);
      for (let k = 0; k < 4; k++) K.put(new THREE.SphereGeometry(0.012 * s, 6, 5), paint(0xffffff, { hatch: 0 }), x + Math.cos(k * 1.6) * 0.05 * s, 0.11 * s + 0.055 * s, z + Math.sin(k * 1.6) * 0.05 * s).userData.noInk = true;
    }
    // a lily pond the frog hops round
    const px = -1.6, pz = -2.1;
    const pond = K.put(new THREE.CircleGeometry(0.62, 32), paint(0xffffff, { hatch: 0, map: canvasTex(128, 128, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
      g.addColorStop(0, '#4f8fa0'); g.addColorStop(0.8, '#7fb8c0'); g.addColorStop(1, '#a8d4cf');
      c.fillStyle = g; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, 7); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 2;
      for (const [x, y, r] of [[40, 50, 10], [80, 70, 14], [60, 90, 7]]) { c.beginPath(); c.arc(x, y, r, 0.3, 2.6); c.stroke(); }
    }) }), px, 0.02, pz, [-Math.PI / 2, 0, 0]);
    pond.userData.noInk = true;
    for (let i = 0; i < 14; i++) {
      const a = i * 0.45;
      K.put(new THREE.SphereGeometry(0.07 + (i % 3) * 0.02, 8, 6).scale(1.3, 0.55, 1), paint(i % 2 ? 0xbdb6a8 : 0xa89f90), px + Math.cos(a) * 0.66, 0.03, pz + Math.sin(a) * 0.66);
    }
    const pads = [];
    for (const [dx, dz, r] of [[-0.2, 0.1, 0.12], [0.18, -0.15, 0.1], [0.05, 0.25, 0.09], [0.25, 0.18, 0.08]]) {
      const pad = K.put(new THREE.CircleGeometry(r, 16, 0.3, Math.PI * 2 - 0.6), paint(0x6f9a4c, { side: THREE.DoubleSide }), px + dx, 0.03, pz + dz, [-Math.PI / 2, 0, 0]);
      pad.userData.noInk = true; pads.push([pad, dx * 9]);
    }
    const lotus = new THREE.Group(); lotus.position.set(px - 0.2, 0.04, pz + 0.1); K.g.add(lotus);
    for (let p = 0; p < 7; p++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6).scale(0.5, 1, 0.25).translate(0, 0.05, 0), paint(0xf4b6c8));
      m.rotation.set(0.5, p * 0.9, 0, 'YXZ'); m.userData.noInk = true; lotus.add(m);
    }
    LIVE.push((t) => { for (const [pad, ph] of pads) pad.position.y = 0.03 + Math.sin(t * 1.2 + ph) * 0.004; lotus.rotation.y = t * 0.1; });
    K.cols.push({ x0: px - 0.6, x1: px + 0.6, z0: pz - 0.6, z1: pz + 0.6 });
    // sunbeams slanting down through the canopy
    const beamTex = canvasTex(64, 256, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,246,200,0.9)'); g.addColorStop(1, 'rgba(255,246,200,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      const s = c.createLinearGradient(0, 0, w, 0); s.addColorStop(0, 'rgba(0,0,0,1)'); s.addColorStop(0.5, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(0,0,0,1)');
      c.globalCompositeOperation = 'destination-out'; c.fillStyle = s; c.fillRect(0, 0, w, h);
    });
    const beams = [];
    for (const [x, z, w, r] of [[-0.6, -3.6, 0.7, 0.35], [1.2, -2.6, 0.55, 0.3], [2.6, -4.2, 0.6, 0.38], [-2.4, -1.8, 0.5, 0.3]]) {
      const m = new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.8), m);
      b.position.set(x, 1.3, z); b.rotation.set(0, 0, r); b.userData.noInk = true; K.g.add(b); beams.push([m, x]);
    }
    LIVE.push((t) => { for (const [m, ph] of beams) m.opacity = 0.32 + Math.sin(t * 0.4 + ph) * 0.12; });
    // fireflies drifting through the undergrowth
    const glowTex = canvasTex(64, 64, (c, w, h) => {
      const g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.25, 'rgba(240,255,140,0.8)'); g.addColorStop(1, 'rgba(200,255,100,0)');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    const flies = [], fr = rng(31);
    for (let i = 0; i < 34; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.setScalar(0.09 + fr() * 0.05); K.g.add(s);
      flies.push({ s, x: (fr() - 0.5) * 7, z: -0.6 - fr() * 4.6, y: 0.3 + fr() * 1.9, ph: fr() * 6, sp: 0.3 + fr() * 0.5 });
    }
    LIVE.push((t) => {
      for (const f of flies) {
        f.s.position.set(f.x + Math.sin(t * f.sp + f.ph) * 0.35, f.y + Math.sin(t * f.sp * 1.7 + f.ph) * 0.18, f.z + Math.cos(t * f.sp * 0.8 + f.ph) * 0.3);
        f.s.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.9 + f.ph * 3));
      }
    });
    // butterflies flitting about
    const wingTex = (a, b) => canvasTex(64, 64, (c, w, h) => {
      c.fillStyle = a; c.beginPath(); c.ellipse(w * 0.5, h * 0.32, w * 0.42, h * 0.28, -0.3, 0, 7); c.fill();
      c.fillStyle = b; c.beginPath(); c.ellipse(w * 0.4, h * 0.72, w * 0.3, h * 0.22, 0.4, 0, 7); c.fill();
      c.strokeStyle = '#2a2230'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(w * 0.6, h * 0.3, 4, 0, 7); c.fill();
    });
    [['#5fa8e8', '#2a5aa8'], ['#f6a53b', '#e8604c'], ['#f29bb4', '#b7a3e6']].forEach(([a, b], i) => {
      const bf = new THREE.Group(); K.g.add(bf);
      const m = cutout(wingTex(a, b));
      const ws = [-1, 1].map(s => {
        const pv = new THREE.Group(); bf.add(pv);
        const wg = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12).translate(0.06, 0, 0), m); wg.rotation.x = -Math.PI / 2; wg.userData.noInk = true;
        pv.add(wg); pv.scale.x = s; return pv;
      });
      bf.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.06, 2, 6).rotateX(Math.PI / 2), paint(0x2a2230, { hatch: 0 })));
      LIVE.push((t) => {
        const a2 = t * (0.35 + i * 0.08) + i * 2;
        bf.position.set(Math.sin(a2) * (1.6 + i * 0.6), 1.1 + i * 0.25 + Math.sin(t * 1.3 + i) * 0.3, -2.6 + Math.cos(a2 * 1.3) * 1.6);
        bf.rotation.y = -a2 + Math.PI;
        const flap = Math.sin(t * 16 + i) * 0.9;
        ws[0].rotation.z = flap; ws[1].rotation.z = flap;
      });
    });
    // leaves drifting down from the canopy
    const fall = [], lr = rng(41);
    for (let i = 0; i < 10; i++) {
      const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.14), leafM); lf.userData.noInk = true; K.g.add(lf);
      fall.push({ lf, x: (lr() - 0.5) * 7, z: -0.8 - lr() * 4.4, ph: lr(), sp: 0.05 + lr() * 0.05 });
    }
    LIVE.push((t) => {
      for (const f of fall) {
        const s = (t * f.sp + f.ph) % 1;
        f.lf.position.set(f.x + Math.sin(s * 12) * 0.25, 2.5 - s * 2.5, f.z);
        f.lf.rotation.set(Math.sin(s * 9) * 1.2, s * 6, Math.cos(s * 11) * 0.8);
      }
    });
  },
  yarnflow(K) {
    // pom-pom garlands strung round the room
    const cols = [0xe8604c, 0xe4b84f, 0x7fb3a8, 0xb7a3c6, 0xdc9e9a, 0x8f7ae8];
    for (const pts of topLoops()) bunting(K, pts, 14, (p, a, i) => {
      const pm = K.put(new THREE.IcosahedronGeometry(0.06, 1), paint(cols[i % cols.length], { hatch: 0.6 }), p.x, p.y - 0.06, p.z);
      pm.userData.noInk = i % 2 === 0;
    });
  },
};

const MINI = {
  yarnflow(K) {
    // a drying rack with a scarf on it: every press crochets one more row
    const x = 2.7, z = -3.2, wood = paint(0x8a6448);
    for (const dx of [-0.42, 0.42]) { K.box(0.05, 1.6, 0.05, wood, x + dx, 0.8, z, 0.012); K.box(0.3, 0.04, 0.3, wood, x + dx, 0.02, z, 0.01); }
    K.box(0.95, 0.05, 0.05, wood, x, 1.58, z, 0.012);
    const cols = [0xe8604c, 0xe4b84f, 0x7fb3a8, 0x8f7ae8, 0xdc9e9a, 0xa8b994];
    const STITCH = ['chain', 'single crochet', 'half double crochet', 'double crochet', 'treble crochet'];
    const rows = [];
    for (let i = 0; i < 16; i++) {
      const r = K.box(0.42, 0.07, 0.035, paint(cols[Math.floor(i / 2) % cols.length], { hatch: 0.7 }), x, 1.5 - i * 0.075, z, 0.03);
      r.visible = i < 5; rows.push(r);
    }
    let n = 5;
    const hook = K.put(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), paint(0x8f7ae8), x + 0.26, 1.5 - n * 0.075, z + 0.05, [0, 0, 0.9]);
    LIVE.push((t) => { hook.position.y = 1.54 - n * 0.075 + Math.sin(t * 6) * 0.01; hook.rotation.z = 0.9 + Math.sin(t * 6) * 0.15; });
    mini(K, x, z + 0.75, 'crochet a row', (m) => {
      if (n >= rows.length) { rows.forEach((r, i) => { r.visible = i < 1; }); n = 1; return m.say('Finished a swatch! Starting a new one with a chain.'); }
      rows[n].visible = true; n++;
      m.say(`Row ${n}: ${STITCH[n % STITCH.length]} × 12. YarnFlow plays a pattern like this stitch by stitch, in 3D.`);
    });
    K.cols.push({ x0: x - 0.55, x1: x + 0.55, z0: z - 0.25, z1: z + 0.25 });
  },
  'borrowed-eyes'(K) {
    // look through the field camera and the whole room changes to how that animal sees
    const EYES = [
      ['your own eyes', ''],
      ['a honeybee', 'hue-rotate(235deg) saturate(1.8) contrast(1.1)', 'ultraviolet: flowers light up with landing strips you can’t normally see'],
      ['a pit viper', 'grayscale(1) sepia(1) hue-rotate(-40deg) saturate(6) contrast(1.5) brightness(1.05)', 'heat pits: warm things glow, cold things fade'],
      ['an owl', 'brightness(0.55) contrast(1.5) grayscale(0.75) sepia(0.4) hue-rotate(170deg)', 'night eyes: dim light, sharp shapes, little colour'],
      ['a bat', 'grayscale(1) invert(0.9) contrast(1.8)', 'echolocation: the world as edges and echoes'],
    ];
    let i = 0;
    mini(K, 2.45, -3.0, 'look through the camera', (m) => {
      i = (i + 1) % EYES.length; m.see(EYES[i][1]);
      m.say(i ? `Borrowing ${EYES[i][0]}'s eyes — ${EYES[i][2]}. Press E again for the next animal.` : 'Back to your own eyes.');
    }, 0.75);
  },
  gallery(K) {
    // walk round the crime scene: what you see, never what it means
    const FRAME = [
      'Every frame in the room is still on the wall. Only the paintings are gone.',
      'A thin band of canvas is left round the inside of the frame, all the way round.',
      'Forty-five empty frames, in this room and the next. Not one of them broken.',
    ];
    let i = -1;
    mini(K, 0, -4.35, 'look at the empty frame', (m) => { i = (i + 1) % FRAME.length; m.say(FRAME[i]); });
    mini(K, 1.25, -1.5, 'look up', (m) => m.say('One pane of the dome is missing. A climbing rope still hangs from the gap, over the broken glass.'), 0.7);
    let j = -1;
    const BOARD = [
      'The police pinned the catalogue up: every painting that hung in here.',
      'Forty-five of Janelle\'s paintings. They are out there somewhere.',
    ];
    mini(K, 3.25, -2.5, 'look at the board', (m) => { j = (j + 1) % BOARD.length; m.say(BOARD[j]); }, 0.75);
    mini(K, -0.4, -4.0, 'look at the tape', (m) => m.say('A roll of grey gallery tape — the museum\'s own kind — left on the floor.'), 0.55);
  },
};

const ROOM_WALL = { qr: 0x6f8a84, yarnflow: 0xf2d9d6, 'borrowed-eyes': 0xdbe8dd, gallery: 0x8a6a9a };

// ── one room, built the first time it's needed ──
const LAYER = 2, DEEP = -3000;
function buildRoom(key, i) {
  const place = PLACES[key];
  const ox = i * 30, oy = DEEP, oz = 0;
  const g = new THREE.Group(); g.position.set(ox, oy, oz);
  g.userData.noGround = true;
  const K = kit(g);
  K.cols = []; K.minis = [];
  LIVE = []; VIDS = [];
  const theme = THEMES[place.id], wall = ROOM_WALL[place.id] ?? 0xe8ddc2;
  roomShell(K, wall, place, theme);
  furnish(K, place.id, wall, theme);
  ENV[place.id]?.(K);
  CENTER[place.id]?.(K);
  EXTRA[place.id]?.(K);
  if (place.shot) showcase(K, place);
  wallLabel(K, place, LBL_X, 1.35, -D + 0.56);
  SETS[place.id]?.(K);
  MINI[place.id]?.(K);
  ink(g, 'mid');
  g.traverse(o => o.layers.set(LAYER));
  const interact = [
    { x: LBL_X, z: -D + 1.3, r: 0.85, label: 'read the label', act: { type: 'card' } },
    ...(place.url ? [{ x: 0, z: -D + 1.5, r: 1.25, label: `open ${place.title} ↗`, act: { type: 'visit' } }] : []),
    { x: 0, z: 0.1, r: 1.0, label: 'back to the street', act: { type: 'exit' } },
    ...K.minis.map(m => ({ x: m.x, z: m.z, r: m.r, label: m.label, act: { type: 'mini', run: m.run } })),
  ];
  return {
    key, place, g, live: LIVE, vids: VIDS, cols: K.cols, interact,
    bounds: { x0: -W / 2 + 0.25, x1: W / 2 - 0.25, z0: -D + 0.8, z1: 0.42 },
  };
}

// ── the controller: in through a door, round the room, out again ──
// doors: [{ key, lm?, inside(dir) → bool (walk-in), near?: { dir, r } (an E prompt), out: () → { dir, heading } }]
export function createRooms({ scene, camera, player, game }) {
  const st = player.st, G = game.G;
  const built = {}, keys = Object.keys(PLACES);
  let cur = null, armed = true, busy = false;
  const S = { x: 0, z: -0.9, face: Math.PI, speed: 0, yaw: 0, pitch: 0.34, pitch0: 0, out: null };
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), snap: true };
  // the DOM: a fade, and a line of what you see
  const fade = document.createElement('div');
  Object.assign(fade.style, { position: 'fixed', inset: '0', background: '#f3ead7', opacity: '0', pointerEvents: 'none', transition: 'opacity .38s ease', zIndex: 40 });
  const say = document.createElement('div');
  say.className = 'ui sk fade hide';
  Object.assign(say.style, { left: '50%', bottom: 'calc(11vh + 70px)', transform: 'translateX(-50%) rotate(0.6deg)', maxWidth: 'min(460px, 88vw)', padding: '8px 18px', zIndex: 12, pointerEvents: 'none', textAlign: 'center', fontSize: '19px' });
  document.body.append(fade, say);
  const prompt = document.getElementById('prompt');
  let sayT = 0;
  const M = {
    say(text) { say.textContent = text; say.classList.remove('hide'); clearTimeout(sayT); sayT = setTimeout(() => say.classList.add('hide'), 4800); },
    see(filter) { document.querySelector('canvas').style.filter = filter || ''; },
  };
  const fadeDo = (fn) => {
    busy = true; fade.style.opacity = '1';
    setTimeout(() => { fn(); setTimeout(() => { fade.style.opacity = '0'; busy = false; }, 80); }, 400);
  };
  const playerLayer = (on) => player.root.traverse(o => on ? o.layers.enable(LAYER) : o.layers.disable(LAYER));

  function enter(door) {
    if (busy || cur) return;
    st.enabled = false;
    fadeDo(() => {
      if (!built[door.key]) built[door.key] = buildRoom(door.key, keys.indexOf(door.key));
      cur = built[door.key];
      scene.add(cur.g);
      for (const v of cur.vids) v.play().catch(() => {});
      S.x = 0; S.z = -0.9; S.face = Math.PI; S.speed = 0; S.yaw = 0; S.pitch0 = st.camPitch; S.out = door.out;
      cam.snap = true;
      camera.layers.set(LAYER); playerLayer(true);
      G.room = { act };
      st.enabled = true;
      audio.setRoom(cur.place.sound);
      place(0);
    });
  }
  function exit() {
    if (busy || !cur) return;
    fadeDo(() => {
      cur.g.removeFromParent();
      for (const v of cur.vids) v.pause();
      M.see(''); say.classList.add('hide'); prompt.classList.add('hide');
      camera.layers.set(0); playerLayer(false);
      const o = S.out();
      st.dir.copy(o.dir); st.heading.copy(o.heading); st.camFwd.copy(o.heading);
      st.speed = 0; st.camPitch = S.pitch0; st.camInit = false; st.grT = null;
      G.room = null; cur = null; armed = false;
      audio.setRoom(null);
    });
  }
  let near = null;
  function act() {
    if (!near || busy) return;
    const a = near.act;
    if (a.type === 'exit') exit();
    else if (a.type === 'mini') a.run(M);
    else if (a.type === 'visit') window.open(cur.place.url, '_blank', 'noopener');
    else if (a.type === 'card') M.say(cur.place.desc);
  }

  // the critic in the room: her root stands on the room's floor, turned to where she walks
  const _t = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function place(dt) {
    player.root.position.set(cur.g.position.x + S.x, cur.g.position.y, cur.g.position.z + S.z);
    player.root.quaternion.setFromAxisAngle(_up, S.face);
    let bob = 0;
    if (player.critic.inst) bob = pose(player.critic.inst, dt, Math.min(1, S.speed / 1.55), { run: THREE.MathUtils.clamp((S.speed - 1.6) / 1.4, 0, 1) });
    player.root.children[0].position.y = bob || 0;
  }
  const free = (x, z) => !cur.cols.some(c => x > c.x0 - 0.2 && x < c.x1 + 0.2 && z > c.z0 - 0.2 && z < c.z1 + 0.2);
  let pushOut = 0;

  return {
    get inside() { return !!cur; },
    // the street side: walking in at a shop door, or an E prompt at the museum's
    watch(doors) {
      if (cur || busy || G.state !== 'play' || G.ui || st.mode !== 'walk' || !st.enabled) return;
      let still = false;
      for (const d of doors) {
        if (!d.inside) continue;
        if (d.inside(st.dir)) { still = true; if (armed) return enter(d); }
      }
      if (!still) armed = true;                // re-arm once she's back out of the doorway
    },
    enter,
    update(dt, t) {
      if (!cur) return false;
      NOW = t;
      for (const f of cur.live) f(t);
      // input: camera-relative, like on the street
      if (st.camYaw) { S.yaw = THREE.MathUtils.clamp(S.yaw + st.camYaw, -1.3, 1.3); st.camYaw = 0; }
      S.pitch = THREE.MathUtils.clamp(0.34 + (st.camPitch - S.pitch0) * 0.9, 0.08, 1.1);
      const k = (...c) => c.some(q => st.keys.has(q));
      let f = 0, r = 0;
      const free2 = st.enabled && !G.ui && !busy;
      if (free2) {
        f = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0);
        r = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0);
        if (!f && !r && Math.hypot(st.stick.x, st.stick.y) > 0.2) { f = st.stick.y; r = st.stick.x; }
      }
      const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
      let mx = -sy * f + cy * r, mz = -cy * f - sy * r;
      const len = Math.hypot(mx, mz);
      const run = k('ShiftLeft', 'ShiftRight') || Math.hypot(st.stick.x, st.stick.y) > 0.95;
      const target = len > 0.05 ? (run ? 3.1 : 1.55) * Math.min(1, len) : 0;
      S.speed += (target - S.speed) * (1 - Math.exp(-10 * dt));
      if (len > 0.05) {
        mx /= len; mz /= len;
        let d = Math.atan2(mx, mz) - S.face;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        S.face += d * Math.min(1, dt * 11);
        const nx = S.x + mx * S.speed * dt, nz = S.z + mz * S.speed * dt;
        if (free(nx, nz)) { S.x = nx; S.z = nz; } else { if (free(nx, S.z)) S.x = nx; if (free(S.x, nz)) S.z = nz; }
        const b = cur.bounds;
        S.x = THREE.MathUtils.clamp(S.x, b.x0, b.x1); S.z = THREE.MathUtils.clamp(S.z, b.z0, b.z1);
        // keep walking out over the front edge and you're back on the street
        pushOut = S.z >= b.z1 - 0.01 && mz > 0.5 ? pushOut + dt : 0;
        if (pushOut > 0.25) { pushOut = 0; exit(); }
      }
      place(dt);
      // the camera: behind her over the open front, eased; it aims high, at the walls
      const o = cur.g.position, dist = 3.4 * st.zoom;
      const tx = o.x + S.x, ty = o.y + 1.45, tz = o.z + S.z;
      const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
      const want = new THREE.Vector3(tx + sy * cp * dist, ty + sp * dist, tz + cy * cp * dist);
      if (want.y < o.y + 0.3) want.y = o.y + 0.3;
      if (cam.snap) { cam.pos.copy(want); cam.look.set(tx, ty, tz); cam.snap = false; }
      cam.pos.lerp(want, 1 - Math.exp(-9 * dt)); cam.look.lerp(_t.set(tx, ty, tz), 1 - Math.exp(-12 * dt));
      camera.position.copy(cam.pos); camera.up.set(0, 1, 0); camera.lookAt(cam.look);
      // what's in reach
      near = null;
      if (free2) {
        let bd = 1e9;
        for (const it of cur.interact) { const dd = Math.hypot(S.x - it.x, S.z - it.z); if (dd < it.r && dd < bd) { bd = dd; near = it; } }
      }
      if (near) { prompt.innerHTML = `<kbd>E</kbd>${near.label}`; prompt.classList.remove('hide'); }
      else prompt.classList.add('hide');
      return true;
    },
  };
}
