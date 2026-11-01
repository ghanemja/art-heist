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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, paint, ink, blobShadow, mergeStatic } from './style.js';
import { pose } from './human.js';
import { makeFolk, poseFolk, ikArm, gripHand } from './folk.js';
import { frameKit } from '../museum.js?v=13';
import { audio } from './audio.js';
import { SUSPECTS } from './story.js';

// the rooms: keyed by the shop's style (and 'museum')
const PLACES = {
  yarn: {
    id: 'yarnflow', title: 'YarnFlow', trade: 'Pattern Haberdashery', sound: 'cosy',
    url: 'https://ghanemja.github.io/crochet/', shot: 'screenshots/rooms/yarnflow.webp?v=2',   // (the app's Learn the stitches tutorial)
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
  if (place.id === 'yarnflow') { grp.scale.setScalar(0.72); grp.position.y = 1.42; }   // (hung on the wall, clear of the floor: its walnut frame is deep)
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
  yarnflow(F, w, h) {                          // a walnut frame with a brass lip, crocheted flowers on its top corners
    const FG = new THREE.Group(); F.g.add(FG);
    const wal = paint(0x6e4a33), lip = paint(0xc9a45a), t = 0.11, tb = 0.07, zc = 0.02;
    const put = (geo, mat, x, y, z, rz = 0, s) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.z = rz; if (s) m.scale.set(...s); FG.add(m); return m; };
    // the sides run floor to top; the bottom rail is slim (the screen nearly meets the floor)
    for (const s of [-1, 1]) put(yfBox(t, h + t + tb, 0.09, 0.035), wal, s * (w / 2 + t / 2), (t - tb) / 2, zc);
    put(yfBox(w, t, 0.09, 0.035), wal, 0, h / 2 + t / 2, zc);
    put(yfBox(w, tb, 0.09, 0.03), wal, 0, -h / 2 - tb / 2, zc);
    for (const s of [-1, 1]) {
      put(yfBox(0.024, h + 0.048, 0.03, 0.01), lip, s * (w / 2 + 0.012), 0, 0.075);
      put(yfBox(w, 0.024, 0.03, 0.01), lip, 0, s * (h / 2 + 0.012), 0.075);
    }
    // two crocheted flowers sewn to the top corners
    [[-1, 0xdfa59a], [1, 0x9fbfba]].forEach(([s, col]) => {
      const fx = s * (w / 2 + t / 2), fy = h / 2 + t / 2, pm = paint(col);
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + 0.3, p = put(new THREE.SphereGeometry(0.042, 14, 10), pm, fx + Math.cos(a) * 0.05, fy + Math.sin(a) * 0.05, 0.088, a, [1, 0.62, 0.36]);
        p.userData.r = a;
      }
      put(new THREE.SphereGeometry(0.03, 14, 10), paint(0xe2bf7a), fx, fy, 0.1, 0, [1, 1, 0.6]);
      for (const k of [-1, 1]) put(new THREE.SphereGeometry(0.04, 12, 8), paint(0x7aa86a), fx - s * 0.1, fy - 0.03 + k * 0.035, 0.078, k * 0.5 - s * 0.3, [1, 0.45, 0.3]);
    });
    ink(FG, 'fine');
    mergeStatic(FG, [], { vc: true });
    FG.traverse(o => { if (o.isMesh && !o.userData.isInk) o.userData.noInk = true; });
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

// ── YARNFLOW: a cosy crochet studio (helpers shared by its SHOW/SETS/ENV/EXTRA/MINI entries) ──
// Cream wallpaper over a sage wainscot, honey planks, a round crocheted rug; the app's screen
// in a walnut frame; a white cubby wall of yarn graded by colour; a reading nook by the window
// (armchair, a half-finished granny blanket, a basket, a cat asleep); a work table under a
// pegboard; plants, a floor lamp and string lights. The static set is inked and merged per
// material (yarn balls share ONE textured material, coloured per vertex).
const YF = {
  chair: { x: 3.12, z: -3.1, yaw: -1.0 },          // the armchair, its front turned to the room
  cub: { x: -2.98, z: -5.23, w: 1.75, h: 2.0, d: 0.36 },
  table: { x: -3.6, z: -3.2, w: 0.6, l: 1.3 },
  rack: { x: -3.05, z: -1.55, yaw: 0.9 },
  rug: { x: 0.15, z: -2.75, r: 1.2 },
  win: { z: -3.15 },
};
// chair-local (x right, z front) → room coords
const yfChair = (lx, lz) => { const { x, z, yaw } = YF.chair, c = Math.cos(yaw), s = Math.sin(yaw); return [x + lx * c + lz * s, z - lx * s + lz * c]; };
YF.basket = yfChair(0.42, 0.72);
// smooth rounded boxes (enough segments that the bevels read round, not chamfered)
const yfBox = (w, h, d, r = 0.03, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.max(1e-3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
// the yarn's palette: soft rainbow rows, light to deep
const YF_HUES = [0.995, 0.065, 0.125, 0.32, 0.54, 0.76];
const yfCol = (row, k) => new THREE.Color().setHSL(YF_HUES[row % 6], 0.42 + 0.05 * k, 0.74 - k * 0.066);
// wound yarn: crossing strands on white, tinted per ball by vertex colour
let _yfWound = null, _yfYarn = null;
function yfYarnMat() {
  if (_yfYarn) return _yfYarn;
  _yfWound = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    for (const dir of [1, -1]) for (let k = 0; k < 16; k++) {
      const y0 = (k / 16) * h * 1.6 - h * 0.3, ph = dir * 0.9 + k * 0.15;
      c.strokeStyle = 'rgba(70,40,50,0.22)'; c.lineWidth = 2.2;
      c.beginPath();
      for (let x = 0; x <= w; x += 8) { const y = y0 + Math.sin((x / w) * Math.PI * 2 + ph) * h * 0.28 * dir; x ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 1.2; c.save(); c.translate(0, -2.5); c.stroke(); c.restore();
    }
  });
  _yfWound.wrapS = THREE.RepeatWrapping;
  return (_yfYarn = paint(0xffffff, { map: _yfWound, vertexColors: true, hatch: 0.25 }));
}
function yfBall(r, col, seg = 16) {
  const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return new THREE.Mesh(g, yfYarnMat());
}
// round crochet (the rug, the hoop doilies): rounds of stitches out from a magic ring
function yfRoundTex(px, rounds, bg = '#efe4cf') {
  return canvasTex(px, px, (c, w, h) => {
    const cx = w / 2, cy = h / 2, k = px / 1024;
    c.fillStyle = bg; c.beginPath(); c.arc(cx, cy, w / 2, 0, 7); c.fill();
    let r = 14 * k;
    rounds.forEach((col, i) => {
      const len = (i ? 36 : 30) * k * (12 / rounds.length), wid = 15 * k * (12 / rounds.length), n = Math.max(10, Math.round(2 * Math.PI * (r + len / 2) / (wid * 0.92)));
      for (let q = 0; q < n; q++) { const a = (q + (i % 2) * 0.5) / n * Math.PI * 2; stitch(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, a - Math.PI / 2, len, wid, col); }
      r += len + 3 * k;
    });
    c.strokeStyle = 'rgba(60,40,40,0.55)'; c.lineWidth = Math.max(2, 4 * k); c.beginPath(); c.arc(cx, cy, Math.min(r, w / 2 - 3), 0, 7); c.stroke();
  });
}
const YF_RUG = ['#f2e8d4', '#c9d6b8', '#f2e8d4', '#e2bf7a', '#f2e8d4', '#dfa59a', '#f2e8d4', '#9fbfba', '#ecdcc0', '#b9a6c9', '#f2e8d4', '#d9c49f'];
// the half-finished blanket: seven granny squares joined, the eighth not made yet (cut out)
function yfBlanketTex() {
  return canvasTex(1024, 512, (c, w, h) => {
    const s = w / 4, pals = [['#dfa59a', '#f2e8d4', '#e2bf7a', '#f6eedb'], ['#9fbfba', '#f6eedb', '#dfa59a', '#f6eedb'], ['#e2bf7a', '#9fbfba', '#f2e8d4', '#f6eedb'],
      ['#b9a6c9', '#e2bf7a', '#c9d6b8', '#f6eedb'], ['#c9d6b8', '#dfa59a', '#9fbfba', '#f6eedb']];
    let k = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
      if (j === 1 && i === 3) continue;
      c.fillStyle = '#8a7068'; c.fillRect(i * s, j * s, s, s);
      grannySquare(c, i * s, j * s, s, pals[k++ % pals.length]);
    }
  });
}
// a page of a pattern book: a round chart on the left, the written rounds on the right
function yfBookTex() {
  return canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#fbf6ea'; c.fillRect(0, 0, w, h);
    const g = c.createLinearGradient(w / 2 - 24, 0, w / 2 + 24, 0);
    g.addColorStop(0, 'rgba(120,90,70,0)'); g.addColorStop(0.5, 'rgba(120,90,70,0.28)'); g.addColorStop(1, 'rgba(120,90,70,0)');
    c.fillStyle = g; c.fillRect(w / 2 - 24, 0, 48, h);
    c.strokeStyle = INKC; c.lineWidth = 2;
    const cx = w / 4, cy = h / 2;
    c.beginPath(); c.arc(cx, cy, 10, 0, 7); c.stroke();
    for (let rr = 1; rr <= 3; rr++) {
      const n = rr * 12, R0 = 12 + rr * 26;
      c.strokeStyle = ['#c0504a', '#3f6a8a', '#6a8a4a'][rr - 1];
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, x = cx + Math.cos(a) * R0, y = cy + Math.sin(a) * R0;
        c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2);
        c.beginPath(); c.moveTo(0, -9); c.lineTo(0, 9); c.moveTo(-5, -9); c.lineTo(5, -9); c.moveTo(-3, -1); c.lineTo(3, 2); c.stroke();
        c.restore();
      }
    }
    c.fillStyle = INKC; c.font = `700 26px ${SCRIPT}`; c.fillText('Sunburst square', w / 2 + 24, 40);
    c.font = `400 17px ${HAND}`; c.fillStyle = '#4a4050';
    ['Rnd 1: magic ring, ch 3,', '  11 dc into the ring.', 'Rnd 2: 2 dc in each st (24)', 'Rnd 3: *dc, 2 dc* round (36)', 'Rnd 4: corners: 3 dc, ch 2…', '', 'fasten off, weave in ends.']
      .forEach((l, i) => c.fillText(l, w / 2 + 24, 72 + i * 25));
  });
}

// ── per-room set dressing ───────────────────────────────────────────────────
const SETS = {
  yarnflow(K) {
    // ── the studio's furniture: built into one group, inked, then merged per material ──
    const SG = new THREE.Group(); K.g.add(SG);
    const cream = paint(0xf6efe2), creamDk = paint(0xe8dcc6), oak = paint(0xc89a68), walnut = paint(0x6e4a33);
    const terra = paint(0xc97b5a), brass = paint(0xc9a45a), soil = paint(0x5a4234, { hatch: 0 });
    const leafA = paint(0x5f8f5a), leafB = paint(0x7aa86a), leafC = paint(0x46744c);
    const R = rng(41);
    const put = (parent, geo, mat, x, y, z, rot) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); parent.add(m); return m; };
    const group = (x, y, z, ry = 0, parent = SG) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; };
    const ball = (parent, r, col, x, y, z, seg = 14) => { const b = yfBall(r, col, seg); b.position.set(x, y, z); b.rotation.set(R() * 6, R() * 6, R() * 6); parent.add(b); return b; };
    const hook = (parent, col, x, y, z, rot, len = 0.2) => {          // a crochet hook: a shaft, a coloured grip
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(...rot); parent.add(g);
      put(g, new THREE.CylinderGeometry(0.005, 0.005, len, 8), paint(0xb8bec6), 0, 0, 0).userData.noInk = true;
      put(g, new THREE.SphereGeometry(0.007, 8, 6), paint(0xb8bec6), 0, len / 2, 0).userData.noInk = true;
      put(g, new THREE.CylinderGeometry(0.011, 0.011, len * 0.4, 10), paint(col), 0, -len * 0.18, 0);
      return g;
    };
    // a potted plant: a terracotta pot, soil, and leaves (tall blades or soft ovals)
    const pot = (parent, x, y, z, r, h, mat = terra) => {
      const g = group(x, y, z, 0, parent);
      put(g, new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.74, 0), new THREE.Vector2(r * 0.9, h * 0.8), new THREE.Vector2(r, h * 0.82), new THREE.Vector2(r, h), new THREE.Vector2(r * 0.86, h)], 20), mat, 0, 0, 0);
      put(g, new THREE.CylinderGeometry(r * 0.86, r * 0.86, 0.01, 20), soil, 0, h * 0.92, 0).userData.noInk = true;
      return g;
    };

    // ── the cubby wall: white shelving, every cubby a colour, graded light to deep ──
    {
      const { x, z, w, h, d } = YF.cub, tk = 0.035, cols = 5, rows = 6, base = 0.06;
      const C = group(x, 0, z);
      put(C, yfBox(w - 0.06, base, d - 0.06, 0.012), creamDk, 0, base / 2, -0.015);
      for (const s of [-1, 1]) put(C, yfBox(tk, h, d, 0.012), cream, s * (w / 2 - tk / 2), h / 2, 0);
      put(C, yfBox(w, tk, d, 0.012), cream, 0, h - tk / 2, 0);
      const y0 = base + tk, y1 = h - tk, ch = (y1 - y0 - (rows - 1) * tk) / rows, x0 = -w / 2 + tk, cw = (w - 2 * tk - (cols - 1) * tk) / cols;
      put(C, yfBox(w - 2 * tk, tk, d, 0.01), cream, 0, base + tk / 2, 0);
      const back = put(C, new THREE.PlaneGeometry(w - 2 * tk, y1 - y0), creamDk, 0, (y0 + y1) / 2, -d / 2 + 0.008);
      back.userData.noInk = true;
      // shelves proud of the dividers (their fronts never share a plane)
      for (let r = 1; r < rows; r++) put(C, yfBox(w - 2 * tk, tk, d - 0.01, 0.01), cream, 0, y1 - r * (ch + tk) + tk / 2, 0.005);
      for (let c = 1; c < cols; c++) put(C, yfBox(tk, y1 - y0, d - 0.035, 0.01), cream, x0 + c * (cw + tk) - tk / 2, (y0 + y1) / 2, -0.012);
      const r0 = 0.068, zf = d / 2 - 0.1;
      for (let ri = 0; ri < rows; ri++) for (let ci = 0; ci < cols; ci++) {
        const yb = y1 - (ri + 1) * ch - ri * tk, cx = x0 + ci * (cw + tk) + cw / 2;
        const col = (j) => yfCol(ri, ci + (R() - 0.5) * 0.5 + j * 0.15);
        ball(C, r0, col(0), cx - r0 * 1.04, yb + r0, zf, 12);
        ball(C, r0, col(1), cx + r0 * 1.04, yb + r0, zf - 0.01, 12);
        if ((ri * 7 + ci * 3) % 5) ball(C, r0, col(-1), cx + (R() - 0.5) * 0.01, yb + r0 + 0.118, zf - 0.03, 12);   // most have a third, on top
      }
      // a pothos on top, trailing down the far side
      const P = pot(C, -w / 2 + 0.22, h, 0.02, 0.085, 0.15);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4, rr = 0.03 + (i % 3) * 0.02;
        put(P, new THREE.SphereGeometry(0.045, 12, 9).scale(1, 0.5, 0.75), [leafA, leafB, leafC][i % 3], Math.cos(a) * rr, 0.17 + (i % 2) * 0.03, Math.sin(a) * rr, [0.3 * Math.sin(a), a, 0.4 * Math.cos(a)]);
      }
      const vine = new THREE.CatmullRomCurve3([[-0.07, 0.16, 0.06], [-0.13, 0.12, 0.16], [-0.16, -0.15, 0.17], [-0.14, -0.4, 0.18], [-0.17, -0.65, 0.17]].map(p => new THREE.Vector3(...p)));
      put(P, new THREE.TubeGeometry(vine, 24, 0.006, 5), leafC, 0, 0, 0).userData.noInk = true;
      for (let i = 1; i < 10; i++) {
        const p = vine.getPointAt(i / 10), s = i % 2 ? 1 : -1;
        put(P, new THREE.SphereGeometry(0.03, 10, 8).scale(1, 0.55, 0.3), i % 2 ? leafA : leafB, p.x + s * 0.025, p.y, p.z + 0.005, [0, 0, s * 0.7]);
      }
      K.cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
    }

    // ── the rug: a round crocheted one, out in the open floor ──
    {
      const { x, z, r } = YF.rug;
      const m = put(SG, new THREE.CylinderGeometry(r, r, 0.012, 72), paint(0xffffff, { map: yfRoundTex(1024, YF_RUG), hatch: 0.2, unique: true }), x, 0.01, z);
      m.rotation.y = 0.3;
    }

    // ── the work table, under a pegboard of tools ──
    {
      const { x, z, w, l } = YF.table, top = 0.77;
      const T = group(x, 0, z);
      put(T, yfBox(w, 0.05, l, 0.02), oak, 0, top - 0.025, 0);
      put(T, yfBox(w - 0.1, 0.07, l - 0.12, 0.01), oak, 0, top - 0.085, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(T, new THREE.CylinderGeometry(0.024, 0.017, top - 0.05, 12), oak, sx * (w / 2 - 0.06), (top - 0.05) / 2, sz * (l / 2 - 0.07));
      put(T, yfBox(w - 0.12, 0.025, l - 0.16, 0.008), oak, 0, 0.17, 0);
      for (let i = 0; i < 4; i++) ball(T, 0.075, yfCol([3, 4, 0, 2][i], 1 + (i % 2)), -0.08 + (i % 2) * 0.1, 0.1825 + 0.075, -0.42 + i * 0.27);
      // on top: the pattern book, open
      {
        const B = group(0.04, top, 0.24, Math.PI / 2, T);
        put(B, yfBox(0.45, 0.014, 0.31, 0.005), paint(0x3f6a6a), 0, 0.007, 0);
        const bookM = paint(0xffffff, { map: yfBookTex(), hatch: 0, unique: true });
        for (const s of [-1, 1]) {
          const g = new THREE.PlaneGeometry(0.212, 0.29).rotateX(-Math.PI / 2), uv = g.attributes.uv;
          for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + (s > 0 ? 0.5 : 0));
          const pg = put(B, g, bookM, s * 0.108, 0.017 + 0.106 * Math.sin(0.06), 0, [0, 0, s * 0.06]);
          pg.userData.noInk = true;
        }
      }
      // a swatch in progress, a hook across it
      const sw = put(T, yfBox(0.15, 0.01, 0.15, 0.004), paint(0xffffff, { map: canvasTex(256, 256, (c, w2) => { c.fillStyle = '#8a7068'; c.fillRect(0, 0, w2, w2); grannySquare(c, 0, 0, w2, ['#dfa59a', '#f6eedb', '#9fbfba', '#f6eedb']); }), hatch: 0, unique: true }), 0.1, top + 0.005, -0.2, [0, 0.35, 0]);
      hook(T, 0xdfa59a, 0.1, top + 0.017, -0.2, [Math.PI / 2, 0, 1.1], 0.18);
      // a jar of hooks
      put(T, new THREE.CylinderGeometry(0.05, 0.045, 0.12, 18), paint(0x9fb39a), -0.17, top + 0.06, -0.47);
      [0xdfa59a, 0xe2bf7a, 0x9fbfba, 0xb9a6c9, 0xc9d6b8].forEach((col, i) => {
        const a = i * 1.26;
        hook(T, col, -0.17 + Math.cos(a) * 0.022, top + 0.14, -0.47 + Math.sin(a) * 0.022, [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22]);
      });
      // a ball with a hook through it, a mug, a little succulent
      ball(T, 0.07, yfCol(5, 1), -0.12, top + 0.07, -0.1);
      hook(T, 0xe2bf7a, -0.12, top + 0.1, -0.1, [0.5, 0, 0.6], 0.2);
      put(T, new THREE.CylinderGeometry(0.038, 0.034, 0.09, 16), paint(0xdfa59a), 0.15, top + 0.045, 0.53);
      put(T, new THREE.TorusGeometry(0.025, 0.008, 8, 16), paint(0xdfa59a), 0.15, top + 0.05, 0.575, [0, Math.PI / 2, 0]);
      const sp = pot(T, -0.18, top, 0.52, 0.055, 0.08);
      for (let i = 0; i < 7; i++) { const a = i * 0.9; put(sp, new THREE.SphereGeometry(0.022, 10, 8).scale(0.7, 1.3, 0.7), i % 2 ? leafB : leafA, Math.cos(a) * 0.022 * (i ? 1 : 0), 0.1, Math.sin(a) * 0.022 * (i ? 1 : 0), [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5]); }
      // the pegboard: a few tools on pegs
      const PB = group(-W / 2 + 0.012, 1.42, z, Math.PI / 2);
      put(PB, yfBox(1.1, 0.6, 0.02, 0.008), paint(0xffffff, { map: canvasTex(256, 140, (c, cw2, ch2) => {
        c.fillStyle = '#e9dcc4'; c.fillRect(0, 0, cw2, ch2); c.fillStyle = 'rgba(90,60,40,0.35)';
        for (let i = 8; i < cw2; i += 12) for (let j = 8; j < ch2; j += 12) { c.beginPath(); c.arc(i, j, 2, 0, 7); c.fill(); }
      }), hatch: 0.2, unique: true }), 0, 0, 0);
      [0xdfa59a, 0xe2bf7a, 0x9fbfba, 0xb9a6c9].forEach((col, i) => hook(PB, col, -0.42 + i * 0.07, 0.05, 0.03, [0, 0, 0.05 * (i - 1.5)], 0.22));
      // a pair of scissors, an embroidery hoop with a doily in it
      for (const s of [-1, 1]) put(PB, new THREE.TorusGeometry(0.03, 0.009, 8, 16), paint(0xdfa59a), -0.08 + s * 0.035, -0.1, 0.03);
      for (const s of [-1, 1]) put(PB, yfBox(0.012, 0.15, 0.006, 0.003), paint(0xb8bec6), -0.08 + s * 0.01, 0.0, 0.035, [0, 0, -s * 0.12]);
      put(PB, new THREE.TorusGeometry(0.16, 0.012, 10, 40), oak, 0.3, 0, 0.035);
      put(PB, new THREE.CircleGeometry(0.155, 40), paint(0xffffff, { map: yfRoundTex(256, ['#f6eedb', '#dfa59a', '#f6eedb', '#9fbfba', '#f6eedb', '#e2bf7a'], '#f6eedb'), hatch: 0, unique: true }), 0.3, 0, 0.026).userData.noInk = true;
      K.cols.push({ x0: x - w / 2, x1: x + w / 2, z0: z - l / 2, z1: z + l / 2 });
    }

    // ── the reading nook: an armchair by the window, a blanket half made, a basket of yarn ──
    {
      const { x, z, yaw } = YF.chair, teal = paint(0x6b9893), tealDk = paint(0x5c8783);
      const C = group(x, 0, z, yaw);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(C, new THREE.CylinderGeometry(0.024, 0.016, 0.11, 12), walnut, sx * 0.34, 0.055, sz * 0.29);
      put(C, yfBox(0.86, 0.3, 0.76, 0.07, 4), teal, 0, 0.25, 0);
      put(C, yfBox(0.58, 0.13, 0.62, 0.05, 4), tealDk, 0, 0.465, 0.04);
      put(C, yfBox(0.86, 0.62, 0.18, 0.08, 4), teal, 0, 0.71, -0.29, [-0.1, 0, 0]);
      put(C, yfBox(0.56, 0.42, 0.12, 0.05, 4), tealDk, 0, 0.75, -0.17, [-0.12, 0, 0]);
      for (const s of [-1, 1]) put(C, yfBox(0.15, 0.3, 0.72, 0.065, 4), teal, s * 0.355, 0.54, 0.0);
      // the blanket: over the seat and the right arm, its end hanging down (the last square to go)
      const prof = new THREE.CatmullRomCurve3([[-0.24, 0.54], [0.0, 0.541], [0.2, 0.542], [0.262, 0.57], [0.282, 0.665], [0.32, 0.7], [0.36, 0.706], [0.4, 0.696], [0.437, 0.65], [0.447, 0.5], [0.452, 0.32], [0.456, 0.18]].map(([a, b]) => new THREE.Vector3(a, b, 0)));
      const NX = 48, NZ = 10, z0b = -0.1, wb = 0.47, bg = new THREE.PlaneGeometry(1, 1, NX, NZ), bp = bg.attributes.position, bu = bg.attributes.uv;
      for (let iz = 0; iz <= NZ; iz++) for (let ix = 0; ix <= NX; ix++) {
        const i = iz * (NX + 1) + ix, tt = ix / NX, v = iz / NZ, p = prof.getPointAt(tt);
        const hang = Math.max(0, (0.66 - p.y) / 0.5) * (p.x > 0.43 ? 1 : 0);
        bp.setXYZ(i, p.x + hang * 0.014 * Math.sin(v * Math.PI * 3), p.y, z0b + v * wb);
        bu.setXY(i, tt, v);
      }
      bg.computeVertexNormals();
      const bm = paint(0xffffff, { map: yfBlanketTex(), hatch: 0.15, side: THREE.DoubleSide, unique: true }); bm.alphaTest = 0.5;
      put(C, bg, bm, 0, 0, 0).userData.noInk = true;
      // the basket at its foot: woven, full of yarn, a strand out to where the cat plays
      const [bx, bz] = YF.basket, BK = group(bx, 0, bz);
      const wt = canvasTex(256, 128, (c, cw2, ch2) => basketweave(c, cw2, ch2, ['#c8a06e', '#b48a5a', '#d4ad7c', '#a87e50'])); wt.wrapS = THREE.RepeatWrapping; wt.repeat.set(3, 1);
      put(BK, new THREE.LatheGeometry([new THREE.Vector2(0, 0.005), new THREE.Vector2(0.15, 0.005), new THREE.Vector2(0.17, 0.03), new THREE.Vector2(0.2, 0.22), new THREE.Vector2(0.205, 0.235)], 28), paint(0xffffff, { map: wt, side: THREE.DoubleSide, hatch: 0.3, unique: true }), 0, 0, 0);
      put(BK, new THREE.TorusGeometry(0.205, 0.016, 10, 32), paint(0xa87e50), 0, 0.237, 0, [Math.PI / 2, 0, 0]);
      put(BK, new THREE.SphereGeometry(0.19, 16, 12).scale(1, 0.35, 1), creamDk, 0, 0.17, 0).userData.noInk = true;
      ball(BK, 0.08, yfCol(0, 1), -0.07, 0.24, 0.04); ball(BK, 0.075, yfCol(3, 1), 0.08, 0.23, -0.03); ball(BK, 0.07, yfCol(1, 0), 0.0, 0.225, -0.1);
      hook(BK, 0x9fbfba, 0.05, 0.3, 0.08, [0.4, 0, -0.5], 0.22);
      K.cols.push({ x0: x - 0.56, x1: x + 0.56, z0: z - 0.57, z1: z + 0.57 }, { x0: bx - 0.2, x1: bx + 0.2, z0: bz - 0.2, z1: bz + 0.2 });
    }

    // ── the window: daylight, curtains, a succulent on the sill (east wall) ──
    {
      const WG = group(W / 2, 0, YF.win.z, -Math.PI / 2), white = paint(0xfbf6ec);
      const sky = new THREE.MeshBasicMaterial({ toneMapped: false, map: canvasTex(256, 224, (c, w2, h2) => {
        const g = c.createLinearGradient(0, 0, 0, h2); g.addColorStop(0, '#8fc3e3'); g.addColorStop(0.65, '#d5ecf3'); g.addColorStop(1, '#eef6ee');
        c.fillStyle = g; c.fillRect(0, 0, w2, h2);
        c.fillStyle = 'rgba(255,255,255,0.92)';
        for (const [cx, cy, s] of [[60, 50, 1], [190, 82, 0.8]]) for (const [dx, dy, r] of [[0, 0, 18], [18, -6, 22], [38, 2, 16], [-16, 4, 13]]) { c.beginPath(); c.arc(cx + dx * s, cy + dy * s, r * s, 0, 7); c.fill(); }
        c.fillStyle = '#a9cf9a'; c.beginPath(); c.moveTo(0, h2); c.bezierCurveTo(w2 * 0.2, h2 * 0.7, w2 * 0.5, h2 * 0.78, w2, h2 * 0.68); c.lineTo(w2, h2); c.fill();
        c.fillStyle = '#7fb27a'; c.beginPath(); c.arc(w2 * 0.78, h2 * 0.7, 30, 0, 7); c.arc(w2 * 0.86, h2 * 0.66, 24, 0, 7); c.fill();
      }) });
      put(WG, new THREE.PlaneGeometry(1.1, 0.96), sky, 0, 1.5, 0.004).userData.noInk = true;
      for (const s of [-1, 1]) put(WG, yfBox(0.07, 1.1, 0.07, 0.02), white, s * 0.585, 1.5, 0.035);
      for (const s of [-1, 1]) put(WG, yfBox(1.1, 0.07, 0.07, 0.02), white, 0, 1.5 + s * 0.515, 0.035);
      put(WG, yfBox(0.028, 0.96, 0.03, 0.01), white, 0, 1.5, 0.02);
      put(WG, yfBox(1.1, 0.028, 0.03, 0.01), white, 0, 1.5, 0.02);
      put(WG, yfBox(1.24, 0.04, 0.16, 0.015), white, 0, 0.975, 0.08);          // (clear of the chair rail below)
      const sp = pot(WG, 0.36, 0.995, 0.09, 0.05, 0.08);
      for (let i = 0; i < 6; i++) { const a = i * 1.05; put(sp, new THREE.SphereGeometry(0.02, 10, 8).scale(0.8, 1.2, 0.8), i % 2 ? leafB : leafA, Math.cos(a) * 0.02, 0.095, Math.sin(a) * 0.02, [Math.sin(a) * 0.6, 0, Math.cos(a) * 0.6]); }
      // a brass rod, linen curtains tied back either side
      put(WG, new THREE.CylinderGeometry(0.012, 0.012, 2.12, 10), brass, 0, 2.12, 0.13, [0, 0, Math.PI / 2]);
      for (const s of [-1, 1]) put(WG, new THREE.SphereGeometry(0.025, 12, 10), brass, s * 1.07, 2.12, 0.13);
      const curtM = paint(0xd9a596, { side: THREE.DoubleSide });
      for (const s of [-1, 1]) {
        const cg = new THREE.PlaneGeometry(0.34, 1.5, 18, 12), cp = cg.attributes.position;
        for (let i = 0; i < cp.count; i++) {
          const u = cp.getX(i) / 0.34 + 0.5, v = cp.getY(i) / 1.5 + 0.5;            // v: 0 at the hem, 1 at the rod
          const pinch = 1 - 0.45 * Math.exp(-((v - 0.42) ** 2) / 0.01);             // the tie-back
          cp.setX(i, (u - 0.5) * 0.34 * pinch * (1 + 0.15 * (1 - v)) + s * (1 - pinch) * 0.06);
          cp.setZ(i, 0.03 * Math.sin(u * Math.PI * 5) * pinch);
        }
        cg.computeVertexNormals();
        put(WG, cg, curtM, s * 0.84, 2.11 - 0.75, 0.115);                          // (its folds clear of the chair rail)
        const tie = put(WG, new THREE.TorusGeometry(0.1, 0.014, 8, 24), paint(0xb9806f), s * 0.867, 2.11 - 1.5 * 0.58, 0.115, [Math.PI / 2, 0, 0]);   // the tie-back, round the pinch
        tie.scale.set(1, 0.42, 1);
      }
    }

    // ── a floor lamp beside the chair, a snake plant in the corner, hoop art on the east wall ──
    {
      const L = group(3.55, 0, -4.3);
      put(L, new THREE.CylinderGeometry(0.14, 0.16, 0.03, 24), brass, 0, 0.015, 0);
      put(L, new THREE.CylinderGeometry(0.014, 0.014, 1.42, 10), brass, 0, 0.74, 0);
      put(L, new THREE.LatheGeometry([new THREE.Vector2(0.2, -0.24), new THREE.Vector2(0.12, 0)], 28), paint(0xf6e6c4, { side: THREE.DoubleSide, emissive: 0x6a4a1a }), 0, 1.62, 0);
      K.cols.push({ x0: 3.4, x1: 3.7, z0: -4.45, z1: -4.15 });
      const PL = pot(SG, 3.6, 0, -5.02, 0.17, 0.34, paint(0xe8dcc6));
      for (let i = 0; i < 8; i++) {
        const a = i * 2.3, hl = 0.32 + R() * 0.24, tilt = 0.12 + R() * 0.16;
        put(PL, new THREE.SphereGeometry(1, 14, 12).scale(0.05, hl, 0.016), i % 2 ? leafC : leafA, Math.cos(a) * 0.06, 0.31 + hl * 0.82, Math.sin(a) * 0.06, [Math.sin(a) * tilt, -a, -Math.cos(a) * tilt]);
      }
      K.cols.push({ x0: 3.4, x1: 3.8, z0: -5.25, z1: -4.8 });
      const HG = group(W / 2 - 0.012, 0, -1.55, -Math.PI / 2);
      [[-0.32, 1.62, 0.15, ['#f6eedb', '#9fbfba', '#f6eedb', '#dfa59a', '#f6eedb']], [0.04, 1.42, 0.2, ['#f6eedb', '#e2bf7a', '#f6eedb', '#c9d6b8', '#f6eedb', '#b9a6c9', '#f6eedb']], [0.36, 1.68, 0.12, ['#f6eedb', '#dfa59a', '#f6eedb', '#e2bf7a']]].forEach(([hx, hy, hr, pal]) => {
        put(HG, new THREE.TorusGeometry(hr, 0.012, 10, 40), oak, hx, hy, 0.014);
        put(HG, new THREE.CircleGeometry(hr - 0.004, 40), paint(0xffffff, { map: yfRoundTex(256, pal, '#efe4cf'), hatch: 0, unique: true }), hx, hy, 0.006).userData.noInk = true;
      });
    }

    // the glows: the lamp, the window's daylight on the floor (additive, never inked)
    const glow = (col, a) => canvasTex(128, 128, (c, cw2, ch2) => { const g = c.createRadialGradient(cw2 / 2, ch2 / 2, 2, cw2 / 2, ch2 / 2, cw2 / 2); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(0, 0, cw2, ch2); });
    const add = (tex) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow('255,214,150', 0.55), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    halo.position.set(3.55, 1.5, -4.3); halo.scale.set(1.1, 1.1, 1); K.g.add(halo);
    K.flat(1.8, 1.8, add(glow('255,214,150', 0.28)), 3.4, 0.02, -4.1, [-Math.PI / 2, 0, 0]).renderOrder = 3;
    K.flat(1.0, 1.5, add(canvasTex(64, 96, (c, cw2, ch2) => {
      c.fillStyle = 'rgba(255,240,200,0.22)'; c.fillRect(6, 6, cw2 - 12, ch2 - 12);
      c.fillStyle = 'rgba(0,0,0,1)'; c.globalCompositeOperation = 'destination-out'; c.fillRect(cw2 / 2 - 2, 0, 4, ch2); c.fillRect(0, ch2 / 2 - 2, cw2, 4);
    })), 2.85, 0.021, -3.8, [-Math.PI / 2, 0, 0.35]).renderOrder = 3;

    ink(SG, 'fine');
    mergeStatic(SG, [], { vc: true });
    SG.traverse(o => { if (o.isMesh && !o.userData.isInk) o.userData.noInk = true; });     // (already inked)
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
    const gilt = paint(PAL.gold), HPI = Math.PI / 2;
    // every empty frame is a real museum frame (the kit the forecourt's frames are built from,
    // museum.js): carved, deep-moulded, scalloped or plain with carved corners; portrait,
    // landscape, oval or arched; bright or antique gilt, walnut with a gilt lip, or silver.
    // Each keeps its stretcher, dust board and the torn band of canvas the knife left. They
    // hang straight between the chair rail and the picture rail, on wires from the rail;
    // the lot is merged into one mesh per material once built.
    const FG = new THREE.Group(); K.g.add(FG);
    const { ornateFrame } = frameKit({ S: (col, o = {}) => paint(col, { map: o.map, side: o.side, hatch: o.map ? 0 : 0.35 }), GOLD: gilt, lite: true });
    const wireM = paint(0x8a8392, { hatch: 0 });
    // hang(w, h, along the wall, centre height, wall, style, shape, finish): wall 'back' | 'west' | 'east'
    const WALLS = { back: [(u) => [u, -D + 0.5], 0, [1, 0]], west: [(u) => [-W / 2, u], HPI, [0, -1]], east: [(u) => [W / 2, u], -HPI, [0, 1]] };
    const hang = (w, h, u, y, wall, style, shape = 'rect', finish = 'gold') => {
      const [at, ry, [ax, az]] = WALLS[wall], [x, z] = at(u);
      const g = new THREE.Group(); g.rotation.y = ry; FG.add(g);
      g.position.set(x, y, z).add(new THREE.Vector3(0, 0, 0.04).applyAxisAngle(_Y, ry));   // its back on the wallpaper
      ornateFrame(w, h, g, style, { shape, finish });
      const top = shape === 'arch' ? Math.max(h, w) / 2 : h / 2, hook = new THREE.Vector3(0, Math.min(top + 0.13, 2.07 - y), -0.03);
      for (const s of [-1, 1]) {                          // a picture wire up to its hook (on the rail, on the back wall)
        const a = new THREE.Vector3(s * w * 0.2, top - (shape === 'rect' ? 0.03 : w * 0.06), -0.035);
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, a.distanceTo(hook), 4), wireM);
        wire.position.copy(a).add(hook).multiplyScalar(0.5); wire.quaternion.setFromUnitVectors(_Y, hook.clone().sub(a).normalize());
        wire.userData.noInk = true; g.add(wire);
      }
      const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.04, 6), wireM); nail.rotation.x = HPI; nail.position.copy(hook); g.add(nail);
      return g;
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
    // ── the back wall: the collection's centrepiece, its heaviest frame, hung on the wall's
    // centre line from the picture rail (clear of the chair rail below and the sign above) ──
    hang(1.3, 1.0, 0, 1.49, 'back', 'baroque');
    {
      // its card, still on the wall beside it at eye height: what hung here, stamped STOLEN
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
      }), -1.02, 1.3, -D + 0.56);
      card.renderOrder = 2;
    }
    hang(0.5, 0.7, -1.95, 1.55, 'back', 'corners', 'oval', 'antique');
    hang(0.62, 0.84, -3.1, 1.5, 'back', 'fluted', 'rect', 'gold');
    hang(0.52, 0.78, 1.5, 1.56, 'back', 'deep', 'arch', 'walnut');
    hang(0.66, 0.5, 3.35, 1.62, 'back', 'scallop', 'rect', 'silver');
    // the side walls
    hang(0.95, 0.72, -4.4, 1.5, 'west', 'walnut');
    hang(0.56, 0.74, -3.05, 1.55, 'west', 'corners', 'rect', 'silver');
    ghost(0.9, 0.6, -W / 2 + 0.055, 1.48, -1.85, HPI);
    hang(0.56, 0.56, -0.55, 1.55, 'west', 'scallop', 'oval', 'antique');
    hang(0.76, 0.92, -4.5, 1.5, 'east', 'baroque', 'rect', 'antique');
    // …the one that came down, face up on the floor below its patch
    {
      const g = new THREE.Group(); g.position.set(-3.2, 0.05, -1.55); g.rotation.order = 'YXZ'; g.rotation.set(-HPI, 0.4, 0); FG.add(g);
      ornateFrame(0.9, 0.6, g, 'corners', { finish: 'gold' });
    }
    // …and one propped against the wainscot, its foot on the floor, its top on the panel
    {
      const fw = 0.78, fh = 0.6, lean = 0.2;
      const g = new THREE.Group(); g.position.set(W / 2 - 0.19, 0, -0.95); g.rotation.y = -HPI; FG.add(g);
      const f = ornateFrame(fw, fh, g, 'deep', { finish: 'gold' });
      f.rotation.x = -lean; f.position.set(0, Math.cos(lean) * fh / 2 + 0.03 * Math.sin(lean) + 0.005, -Math.sin(lean) * fh / 2);
    }
    FG.traverse(o => { if (o.isMesh && Math.max(o.scale.x, o.scale.y) < 0.012) o.userData.noInk = true; });   // (beads and pearls: too small to outline)
    ink(FG, 'mid');
    mergeStatic(FG);
    FG.traverse(o => { if (o.isMesh && !o.userData.isInk) o.userData.noInk = true; });     // (already inked)
    // ── the police's board: the catalogue on a stand, red string between them (BOARD) ──
    officers(K, policeBoard(K));
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

// ─── THE MUSEUM'S POLICE BOARD, AND THE TWO OFFICERS WORKING IT ─────────────────
// One layout, drawn twice: on the board in the room, and in the close-up you get by
// pressing E at it. Metres from the board's centre (x to the right as you face it, y up);
// r: a card's tilt. The officers re-pin the `live` photos as they work, so both views
// follow r. Everything else (the cork, the clippings, the suspects, the photos nobody
// touches) is painted once into the cork's own canvas: the room pays for one texture,
// the live photos, the string and a few merged pins. The board is flavour, not a clue:
// only what anyone standing in the room could see — no suspect singled out.
const _Y = new THREE.Vector3(0, 1, 0);
const BOARD_W = 2.0, BOARD_H = 1.12, BOARD_AT = { x: 3.72, y: 1.08, z: -2.8 };   // (the board's face, room coords)
const PH_W = 0.2, PH_H = 0.215, PIC_W = 0.178, PIC_H = 0.14;                      // a photo card, and the window for its photo
const NEWS = '"Times New Roman", Georgia, serif';
// the catalogue: four columns of polaroids down the left of the board
const CX = [-0.87, -0.645, -0.42, -0.195], CY = [0.39, 0.155, -0.08];
const ph = (img, col, row, r, cap, live = false, dx = 0, dy = 0) => ({ img, x: CX[col] + dx, y: CY[row] + dy, r, cap, live });
const BOARD = {
  photos: [            // the catalogue's photos: the same paintings that hung here (Janelle's)
    ph('art_cows_in_storm', 0, 0, -0.04, 'Cows in Storm'),
    ph('art_sunset_swell', 1, 0, 0.05, '#2', false, 0.004, -0.006),
    ph('art_IMG_5264', 2, 0, -0.03, '#3', false, 0, 0.004),
    ph('art_IMG_5263', 3, 0, 0.04, '#4', false, -0.004, -0.004),
    ph('art_banana_treats_astronaut', 0, 1, 0.05, '#5', false, 0.003, 0.003),
    ph('art_IMG_5271', 1, 1, -0.04, '#6'),
    ph('art_IMG_0658', 2, 1, 0.03, '#7', false, 0.003, -0.004),
    ph('art_IMG_5261', 3, 1, -0.05, '#8', false, -0.003, 0.003),
    ph('art_space_heist_mice', 0, 2, -0.03, '#9', false, 0.002, -0.003),
    ph('art_IMG_5265', 1, 2, 0.06, '#10', true),
    ph('art_IMG_9506', 2, 2, -0.05, '#11', true, 0.003, 0.004),
    ph('art_IMG_5262', 3, 2, 0.03, '#12', true, -0.002, -0.003),
  ],
  notes: [             // under: drawn beneath the photos; pin: a drawing pin's colour (null: taped)
    { kind: 'opening', x: -0.72, y: -0.395, w: 0.44, h: 0.27, r: 0.025, under: true, pin: null },
    { kind: 'map', x: -0.265, y: -0.39, w: 0.35, h: 0.28, r: -0.045, under: true, pin: 0x3f6a8a, pinAt: [0.15, 0.115] },
    { kind: 'chron', id: 'chron', x: 0.2, y: -0.33, w: 0.44, h: 0.4, r: -0.02, under: true, pin: 0xc8402f, pinAt: [-0.19, 0.178] },
    { kind: 'baffled', x: 0.71, y: -0.31, w: 0.34, h: 0.25, r: 0.04, under: true, pin: null },
    { kind: 'mug', id: 'otto', x: 0.11, y: 0.365, w: 0.2, h: 0.27, r: 0.03, pin: 0xc8402f, pinAt: [0.078, -0.118] },
    { kind: 'mug', id: 'pia', x: 0.37, y: 0.37, w: 0.2, h: 0.27, r: -0.02, pin: 0xc8402f, pinAt: [0.078, -0.118] },
    { kind: 'mug', id: 'rex', x: 0.63, y: 0.36, w: 0.2, h: 0.27, r: 0.025, pin: 0xc8402f, pinAt: [0.078, -0.118] },
    { kind: 'sticky', x: 0.885, y: 0.4, w: 0.15, h: 0.14, r: 0.07, pin: 0xe4b84f, lines: ['who had', 'keys?'] },
    { kind: 'card', x: 0.865, y: 0.1, w: 0.2, h: 0.15, r: -0.03, pin: 0x3f6a8a, pinAt: [-0.083, 0.058], lines: ['THE DOME', 'one pane out', 'a rope still hangs'] },
    { kind: 'miss', id: 'miss', x: 0.37, y: 0.025, w: 0.3, h: 0.17, r: -0.02, pin: 0xc8402f, lines: ['45 MISSING', 'frames left on the walls'] },
    { kind: 'sticky', x: 0.645, y: 0.055, w: 0.14, h: 0.12, r: -0.07, pin: 0xe4b84f, lines: ['3:07', 'a.m.'], big: true },
  ],
  rings: [[0.9, -0.47, 0.045], [-0.13, -0.47, 0.04]],    // coffee rings on the cork (x, y, radius)
  string: [['otto', 'miss'], ['pia', 'miss'], ['rex', 'miss'], ['miss', 7], [7, 10], ['miss', 'chron']],   // the red string, pin to pin
  run: 3,              // the stretch of string the officer runs a hand along
};
const LIVE_PH = BOARD.photos.flatMap((p, i) => (p.live ? [i] : []));
const itemOf = (k) => (typeof k === 'number' ? BOARD.photos[k] : BOARD.notes.find(n => n.id === k));
const pinOf = (it) => { const [ax, ay] = it.pinAt || [0, (it.h ?? PH_H) / 2 - 0.018], c = Math.cos(it.r), s = Math.sin(it.r); return [it.x + ax * c - ay * s, it.y + ax * s + ay * c]; };
const strSegs = () => BOARD.string.map(([a, b]) => [pinOf(itemOf(a)), pinOf(itemOf(b))]);
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ── the pictures the board needs: the paintings, and the suspects' painted faces (game.FACE,
// the notebook's own portraits). Each one that arrives redraws whatever shows the board.
let _FACE = null;
const _imgs = {}, _imgSubs = new Set();
let _imgVer = 0;
const _imgDone = () => { _imgVer++; _imgSubs.forEach(f => f()); };
function boardImg(key, src) {
  let im = _imgs[key];
  if (!im) {
    if (!src) return null;
    im = _imgs[key] = new Image(); im.onload = _imgDone; im.src = src;
  }
  return im.complete && im.naturalWidth ? im : null;
}
const artImg = (n) => boardImg(n, 'artworks/' + n + '.jpg');
const faceImg = (id) => { try { return boardImg('face:' + id, _FACE?.[id]); } catch { return null; } };
document.fonts?.ready.then(_imgDone);

// ── drawing it: S pixels to the metre; each piece drawn about its own centre ──
// a sheet of paper with torn edges (sides: top, right, bottom, left — which are torn)
function paperPath(c, w, h, R, amp, sides = [1, 1, 1, 1]) {
  const P = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  c.beginPath();
  for (let s = 0; s < 4; s++) {
    const [x0, y0] = P[s], [x1, y1] = P[(s + 1) % 4], n = sides[s] ? 22 : 1;
    const L = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    for (let i = 0; i < n; i++) {
      const t = i / n, k = i && sides[s] ? (R() - 0.5) * amp : 0;
      const x = x0 + (x1 - x0) * t + nx * k, y = y0 + (y1 - y0) * t + ny * k;
      s || i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
  }
  c.closePath();
}
function paper(c, wm, hm, S, R, col, amp = 0.006, sides) {
  const w = wm * S, h = hm * S;
  c.save(); c.translate(S * 0.005, S * 0.007); paperPath(c, w, h, rng(7), amp * S, sides); c.fillStyle = 'rgba(60,35,20,0.28)'; c.fill(); c.restore();
  paperPath(c, w, h, R, amp * S, sides); c.fillStyle = col; c.fill();
  c.strokeStyle = 'rgba(42,34,48,0.3)'; c.lineWidth = S * 0.0015; c.stroke();
}
// newsprint too small to read: grey lines of ragged length
function smallPrint(c, x, y, w, rows, lh, S, R) {
  c.fillStyle = 'rgba(60,55,60,0.45)';
  for (let k = 0; k < rows; k++) { const l = k === rows - 1 ? w * (0.3 + R() * 0.4) : w * (0.86 + R() * 0.14); c.fillRect(x, y + k * lh, l, Math.max(1, S * 0.0035)); }
}
const tape = (c, x, y, w, h, a) => { c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = 'rgba(236,226,190,0.78)'; c.fillRect(-w / 2, -h / 2, w, h); c.strokeStyle = 'rgba(150,130,90,0.35)'; c.lineWidth = 1; c.strokeRect(-w / 2, -h / 2, w, h); c.restore(); };
function centred(c, text, x, y, size, font, maxW, weight = 700, col = INKC) {
  c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
  let s = size; do { c.font = `${weight} ${s}px ${font}`; s -= 1; } while (c.measureText(text).width > maxW && s > 6);
  c.fillText(text, x, y);
}
function coffeeRing(c, x, y, r, S) {
  c.save();
  c.fillStyle = 'rgba(120,70,30,0.07)'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  for (const [a0, a1, wd, al] of [[0.3, 5.9, 0.006, 0.32], [2.2, 4.4, 0.003, 0.25], [5.0, 7.0, 0.0025, 0.3]]) {
    c.strokeStyle = `rgba(110,62,28,${al})`; c.lineWidth = S * wd; c.beginPath(); c.arc(x, y, r * (1 - wd * 2), a0, a1); c.stroke();
  }
  c.restore();
}

// a polaroid of one painting: the picture fitted to its window (a near-match fills it; a
// square or a wide one sits inside it, mounted, rather than being chopped), the caption below
function drawPhoto(c, p, S, X, Y, rot, shadow = true) {
  c.save(); c.translate(X, Y); c.rotate(-rot);
  const w = PH_W * S, h = PH_H * S;
  if (shadow) { c.fillStyle = 'rgba(60,35,20,0.32)'; c.fillRect(-w / 2 + S * 0.006, -h / 2 + S * 0.008, w, h); }
  c.fillStyle = '#fbf8ee'; c.fillRect(-w / 2, -h / 2, w, h);
  c.strokeStyle = 'rgba(42,34,48,0.45)'; c.lineWidth = S * 0.002; c.strokeRect(-w / 2, -h / 2, w, h);
  const bw = PIC_W * S, bh = PIC_H * S, bx = -bw / 2, by = -h / 2 + 0.011 * S;
  const img = artImg(p.img);
  if (img) {
    const ia = img.naturalWidth / img.naturalHeight, wa = bw / bh, q = ia / wa;
    if (q > 0.84 && q < 1.2) {                      // near enough: fill the window
      const [sx, sy, sw, sh] = ia > wa ? [(img.naturalWidth - img.naturalHeight * wa) / 2, 0, img.naturalHeight * wa, img.naturalHeight] : [0, (img.naturalHeight - img.naturalWidth / wa) / 2, img.naturalWidth, img.naturalWidth / wa];
      c.drawImage(img, sx, sy, sw, sh, bx, by, bw, bh);
      c.strokeStyle = 'rgba(42,34,48,0.35)'; c.strokeRect(bx, by, bw, bh);
    } else {                                        // mounted inside it
      const dw = q > 1 ? bw : bh * ia, dh = q > 1 ? bw / ia : bh;
      c.fillStyle = '#e6dfcf'; c.fillRect(bx, by, bw, bh);
      c.drawImage(img, -dw / 2, by + (bh - dh) / 2, dw, dh);
      c.strokeStyle = 'rgba(42,34,48,0.4)'; c.strokeRect(-dw / 2, by + (bh - dh) / 2, dw, dh);
    }
  } else { c.fillStyle = '#b9ad98'; c.fillRect(bx, by, bw, bh); }
  centred(c, p.cap, 0, (by + bh + h / 2) / 2 + S * 0.002, S * 0.034, SCRIPT, w * 0.9);
  c.restore();
}

// a suspect's card, mugshot-style: the height chart, their face, a name slate, the stamp
function drawMug(c, n, S, R) {
  const s = SUSPECTS[n.id], w = n.w * S, h = n.h * S;
  paper(c, n.w, n.h, S, R, '#f3efe4', 0, [0, 0, 0, 0]);
  const m = 0.011 * S, cw = w - 2 * m, chh = h * 0.6, x0 = -w / 2 + m, y0 = -h / 2 + m;
  c.fillStyle = '#cfd4d3'; c.fillRect(x0, y0, cw, chh);
  c.strokeStyle = 'rgba(42,34,48,0.4)'; c.lineWidth = S * 0.0013;
  for (let k = 1; k < 10; k++) {
    const yy = y0 + chh * k / 10, l = cw * (k % 2 ? 0.1 : 0.2);
    c.beginPath(); c.moveTo(x0, yy); c.lineTo(x0 + l, yy); c.moveTo(x0 + cw, yy); c.lineTo(x0 + cw - l, yy); c.stroke();
  }
  c.save(); c.beginPath(); c.rect(x0, y0, cw, chh); c.clip();
  const im = faceImg(n.id), fs = chh * 1.02;
  if (im) c.drawImage(im, -fs / 2, y0 + chh - fs * 0.97, fs, fs);
  else {                                            // (no portrait yet: a pencil outline of a head)
    c.strokeStyle = 'rgba(42,34,48,0.7)'; c.lineWidth = S * 0.0025; c.fillStyle = 'rgba(42,34,48,0.12)';
    c.beginPath(); c.ellipse(0, y0 + chh * 0.45, chh * 0.2, chh * 0.25, 0, 0, 7); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-chh * 0.42, y0 + chh); c.quadraticCurveTo(0, y0 + chh * 0.6, chh * 0.42, y0 + chh); c.fill(); c.stroke();
  }
  c.restore();
  c.strokeStyle = 'rgba(42,34,48,0.5)'; c.lineWidth = S * 0.0015; c.strokeRect(x0, y0, cw, chh);
  // the slate
  const sy = y0 + chh + 0.007 * S, sh = h * 0.15;
  c.fillStyle = '#2a2230'; c.fillRect(-cw * 0.46, sy, cw * 0.92, sh);
  centred(c, s.name.toUpperCase(), 0, sy + sh * 0.52, S * 0.021, NEWS, cw * 0.86, 700, '#f3efe4');
  centred(c, s.role, -0.014 * S, sy + sh + (h / 2 - sy - sh) / 2, S * 0.024, HAND, cw * 0.74, 400);
  // the stamp: every one of them alike
  c.save(); c.translate(cw * 0.05, y0 + chh * 0.84); c.rotate(-0.2); c.globalAlpha = 0.9;
  const tw = cw * 0.84, th = S * 0.04;
  c.fillStyle = 'rgba(243,239,228,0.55)'; c.fillRect(-tw / 2, -th / 2, tw, th);
  c.strokeStyle = '#c8402f'; c.lineWidth = S * 0.0035; c.strokeRect(-tw / 2, -th / 2, tw, th);
  centred(c, 'SUSPECT ?', 0, th * 0.06, S * 0.03, NEWS, tw * 0.9, 900, '#c8402f');
  c.restore();
}

// a little halftone press photo of the museum's front, lit up, a crowd on the steps
function pressPhoto(c, x, y, w, h, S) {
  c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = '#6e6a70'; c.fillRect(x, y, w, h);
  c.fillStyle = '#9d99a0'; c.fillRect(x, y + h * 0.78, w, h * 0.22);                      // the forecourt
  c.fillStyle = '#d8d4d6';
  c.beginPath(); c.moveTo(x + w * 0.12, y + h * 0.36); c.lineTo(x + w * 0.5, y + h * 0.12); c.lineTo(x + w * 0.88, y + h * 0.36); c.closePath(); c.fill();   // the pediment
  c.fillRect(x + w * 0.14, y + h * 0.36, w * 0.72, h * 0.06);
  for (let k = 0; k < 6; k++) c.fillRect(x + w * (0.17 + k * 0.125), y + h * 0.42, w * 0.05, h * 0.3);               // columns
  c.fillRect(x + w * 0.1, y + h * 0.72, w * 0.8, h * 0.06);                                // the steps
  c.fillStyle = '#f2e7b0'; for (let k = 0; k < 5; k++) c.fillRect(x + w * (0.23 + k * 0.125), y + h * 0.48, w * 0.06, h * 0.18);   // lit doors
  c.fillStyle = '#2e2a30';
  for (let k = 0; k < 14; k++) { const px = x + w * (0.08 + k * 0.064), py = y + h * (0.8 + (k % 3) * 0.035); c.beginPath(); c.arc(px, py, w * 0.018, 0, 7); c.fill(); c.fillRect(px - w * 0.02, py, w * 0.04, h * 0.12); }
  c.fillStyle = 'rgba(255,255,255,0.12)';                                                  // halftone dots
  for (let yy = y; yy < y + h; yy += S * 0.006) for (let xx = x + ((yy / (S * 0.006)) % 2) * S * 0.003; xx < x + w; xx += S * 0.006) c.fillRect(xx, yy, S * 0.0018, S * 0.0018);
  c.restore();
  c.strokeStyle = 'rgba(42,34,48,0.6)'; c.lineWidth = S * 0.0015; c.strokeRect(x, y, w, h);
}

function drawNote(c, nt, S, R) {
  const w = nt.w * S, h = nt.h * S, L = -w / 2, T = -h / 2;
  if (nt.kind === 'chron') {                       // THE CHRONICLE's front page, torn out
    paper(c, nt.w, nt.h, S, R, '#ebe5d2', 0.007);
    centred(c, 'THE CHRONICLE', 0, T + S * 0.034, S * 0.046, NEWS, w * 0.86, 900);
    c.fillStyle = INKC; c.fillRect(L + w * 0.06, T + S * 0.062, w * 0.88, S * 0.003); c.fillRect(L + w * 0.06, T + S * 0.068, w * 0.88, S * 0.0012);
    centred(c, 'LATE EDITION', 0, T + S * 0.078, S * 0.011, NEWS, w * 0.5, 400);
    centred(c, '45 PAINTINGS', 0, T + S * 0.118, S * 0.054, NEWS, w * 0.9, 900);
    centred(c, 'VANISH', 0, T + S * 0.17, S * 0.054, NEWS, w * 0.9, 900);
    centred(c, 'Every canvas gone from the Downtown Museum', 0, T + S * 0.207, S * 0.0175, NEWS, w * 0.88, 'italic 400');
    centred(c, 'by morning, on its opening night', 0, T + S * 0.228, S * 0.0175, NEWS, w * 0.88, 'italic 400');
    c.fillRect(L + w * 0.06, T + S * 0.245, w * 0.88, S * 0.0012);
    const colW = w * 0.27;
    for (let k = 0; k < 3; k++) smallPrint(c, L + w * 0.06 + k * (colW + w * 0.035), T + S * 0.258, colW, k === 2 ? 9 : 10, S * 0.012, S, R);
  } else if (nt.kind === 'opening') {               // the society page, from before
    paper(c, nt.w, nt.h, S, R, '#ede7d6', 0.006);
    tape(c, L + w * 0.08, T + S * 0.004, S * 0.07, S * 0.022, -0.5); tape(c, -L - w * 0.08, T + S * 0.004, S * 0.07, S * 0.022, 0.45);
    centred(c, 'OPENING NIGHT AT', 0, T + S * 0.03, S * 0.03, NEWS, w * 0.86, 900);
    centred(c, 'THE DOWNTOWN MUSEUM', 0, T + S * 0.06, S * 0.03, NEWS, w * 0.86, 900);
    const px = L + w * 0.06, py = T + S * 0.083, pw = w * 0.46, phh = S * 0.13;
    pressPhoto(c, px, py, pw, phh, S);
    c.font = `italic 400 ${S * 0.0125}px ${NEWS}`; c.fillStyle = INKC; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText('Guests on the steps at the doors', px, py + phh + S * 0.006);
    centred(c, 'Forty-five new works', L + w * 0.76, py + S * 0.012, S * 0.016, NEWS, w * 0.42, 700);
    centred(c, 'go on show tonight', L + w * 0.76, py + S * 0.031, S * 0.016, NEWS, w * 0.42, 700);
    smallPrint(c, L + w * 0.55, py + S * 0.05, w * 0.4, 7, S * 0.012, S, R);
  } else if (nt.kind === 'baffled') {
    paper(c, nt.w, nt.h, S, R, '#e8e1cc', 0.006);
    tape(c, 0, T + S * 0.002, S * 0.08, S * 0.022, 0.06);
    centred(c, 'POLICE', 0, T + S * 0.045, S * 0.05, NEWS, w * 0.86, 900);
    centred(c, 'BAFFLED', 0, T + S * 0.093, S * 0.05, NEWS, w * 0.86, 900);
    centred(c, 'No arrests yet in museum theft', 0, T + S * 0.127, S * 0.0175, NEWS, w * 0.88, 400);
    for (let k = 0; k < 2; k++) smallPrint(c, L + w * 0.07 + k * w * 0.45, T + S * 0.145, w * 0.4, 7, S * 0.012, S, R);
  } else if (nt.kind === 'map') {                  // a scrap of the town plan, the museum ringed
    paper(c, nt.w, nt.h, S, R, '#efe7cc', 0.005, [0, 1, 1, 0]);
    c.save(); paperPath(c, w, h, rng(3), 0); c.clip();
    c.fillStyle = 'rgba(120,170,200,0.55)'; c.beginPath(); c.moveTo(L, -T); c.quadraticCurveTo(L + w * 0.35, T + h * 0.72, -L, T + h * 0.86); c.lineTo(-L, -T); c.closePath(); c.fill();   // the river
    c.fillStyle = 'rgba(170,150,120,0.35)';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const bx = L + w * (0.05 + i * 0.19), by = T + h * (0.08 + j * 0.2); if (by + h * 0.15 > T + h * (0.72 - i * 0.03)) continue; c.fillRect(bx, by, w * 0.15, h * 0.15); }
    c.strokeStyle = 'rgba(200,120,90,0.6)'; c.lineWidth = S * 0.006; c.beginPath(); c.moveTo(L, T + h * 0.27); c.lineTo(-L, T + h * 0.22); c.stroke();     // Main Street
    c.restore();
    c.fillStyle = INKC; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.font = `700 ${S * 0.017}px ${NEWS}`; c.fillText('DOWNTOWN', L + w * 0.06, T + S * 0.016);
    c.save(); c.translate(L + w * 0.62, T + h * 0.235); c.rotate(-0.05); c.font = `italic 400 ${S * 0.014}px ${NEWS}`; c.fillText('Main St', 0, 0); c.restore();
    // the museum's block, ringed twice in red marker
    const mx = L + w * 0.43, my = T + h * 0.5;
    c.fillStyle = 'rgba(140,110,150,0.55)'; c.fillRect(mx - w * 0.075, my - h * 0.075, w * 0.15, h * 0.15);
    c.strokeStyle = '#c8402f'; c.lineWidth = S * 0.004;
    for (const [k, a0] of [[1, 0.2], [1.12, 2.4]]) { c.beginPath(); c.ellipse(mx, my, w * 0.14 * k, h * 0.17 * k, -0.15, a0, a0 + 6.0); c.stroke(); }
    c.font = `700 ${S * 0.03}px ${SCRIPT}`; c.fillStyle = '#c8402f'; c.textAlign = 'left'; c.fillText('MUSEUM', mx + w * 0.17, my + h * 0.2);
    coffeeRing(c, -L - w * 0.12, -T - h * 0.18, S * 0.05, S);
  } else if (nt.kind === 'mug') {
    drawMug(c, nt, S, R);
  } else {
    c.fillStyle = 'rgba(60,35,20,0.3)'; c.fillRect(L + S * 0.006, T + S * 0.008, w, h);
    c.fillStyle = nt.kind === 'sticky' ? '#f4d968' : '#fbf6ea'; c.fillRect(L, T, w, h);
    c.strokeStyle = 'rgba(42,34,48,0.55)'; c.lineWidth = S * 0.0025; c.strokeRect(L, T, w, h);
    if (nt.kind === 'card') {                                  // a ruled index card
      c.strokeStyle = 'rgba(200,64,47,0.55)'; c.lineWidth = S * 0.002;
      c.beginPath(); c.moveTo(L, T + S * 0.045); c.lineTo(-L, T + S * 0.045); c.stroke();
      c.strokeStyle = 'rgba(90,120,170,0.35)';
      for (let k = 1; k < 4; k++) { const yy = T + S * (0.045 + k * 0.033); c.beginPath(); c.moveTo(L, yy); c.lineTo(-L, yy); c.stroke(); }
      centred(c, nt.lines[0], 0, T + S * 0.027, S * 0.032, SCRIPT, w * 0.9);
      nt.lines.slice(1).forEach((l, k) => centred(c, l, 0, T + S * (0.064 + k * 0.033), S * 0.025, HAND, w * 0.92, 400));
    } else if (nt.kind === 'sticky') {
      const fs = nt.big ? 0.042 : 0.032;
      nt.lines.forEach((l, k) => centred(c, l, 0, T + h * (nt.big ? 0.56 : 0.5) + (k - (nt.lines.length - 1) / 2) * S * fs * 1.05 + S * 0.008, S * fs, SCRIPT, w * 0.9));
    } else {
      centred(c, nt.lines[0], 0, -S * 0.016, S * 0.052, SCRIPT, w * 0.9, 700, '#c8402f');
      centred(c, nt.lines[1], 0, S * 0.042, S * 0.024, HAND, w * 0.9, 400, '#5a4e5e');
    }
  }
}

// the board, all but its live photos, its string and its pins, onto a canvas cw × ch that IS the board
function drawBoardLayer(c, cw, ch) {
  const S = cw / BOARD_W, cx = cw / 2, cy = ch / 2;
  c.lineJoin = c.lineCap = 'round';
  c.fillStyle = '#c99a62'; c.fillRect(0, 0, cw, ch);
  const R = rng(4), n = Math.round(3200 * (cw / 1024) ** 2);
  for (let i = 0; i < n; i++) { c.fillStyle = `rgba(${R() < 0.5 ? '90,60,30' : '235,200,150'},${R() * 0.28})`; const s = S * (0.0015 + R() * 0.002); c.fillRect(R() * cw, R() * ch, s, s); }
  const v = c.createRadialGradient(cx, cy, ch * 0.35, cx, cy, cw * 0.62);
  v.addColorStop(0, 'rgba(70,40,20,0)'); v.addColorStop(1, 'rgba(70,40,20,0.22)');
  c.fillStyle = v; c.fillRect(0, 0, cw, ch);
  for (const [x, y, r] of BOARD.rings) coffeeRing(c, cx + x * S, cy - y * S, r * S, S);
  const note = (nt, i) => { c.save(); c.translate(cx + nt.x * S, cy - nt.y * S); c.rotate(-nt.r); drawNote(c, nt, S, rng(31 + i * 7)); c.restore(); };
  BOARD.notes.forEach((nt, i) => nt.under && note(nt, i));
  for (const p of BOARD.photos) if (!p.live) drawPhoto(c, p, S, cx + p.x * S, cy - p.y * S, p.r);
  BOARD.notes.forEach((nt, i) => !nt.under && note(nt, i));
}

// the board in the room: on a free-standing police stand in front of the east wall
function policeBoard(K) {
  const HPI = Math.PI / 2, { x: BX, y: BY, z: BZ } = BOARD_AT;
  const g = new THREE.Group(); g.position.set(BX, BY, BZ); g.rotation.y = -HPI; K.g.add(g);
  const P = kit(g), wood = paint(0x8a6448), steel = paint(0x6f7d92);
  P.box(BOARD_W + 0.08, BOARD_H + 0.08, 0.04, wood, 0, 0, -0.022, 0.012);
  // the cork and everything that stays put on it: one canvas, redrawn as its pictures arrive
  const cv = document.createElement('canvas'); cv.width = 1536; cv.height = Math.round(1536 * BOARD_H / BOARD_W);
  const corkTex = new THREE.CanvasTexture(cv); corkTex.colorSpace = THREE.SRGBColorSpace; corkTex.anisotropy = 4;
  const live = LIVE_PH.map((i) => {
    const pc = document.createElement('canvas'); pc.width = 240; pc.height = Math.round(240 * PH_H / PH_W);
    const t = new THREE.CanvasTexture(pc); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { p: BOARD.photos[i], pc, t };
  });
  const redraw = () => {
    drawBoardLayer(cv.getContext('2d'), cv.width, cv.height); corkTex.needsUpdate = true;
    for (const L of live) { const c = L.pc.getContext('2d'); drawPhoto(c, { ...L.p, r: 0 }, L.pc.width / PH_W, L.pc.width / 2, L.pc.height / 2, 0, false); L.t.needsUpdate = true; }
  };
  redraw();
  let pend = 0;
  _imgSubs.add(() => { if (!pend) pend = setTimeout(() => { pend = 0; redraw(); }, 150); });
  P.flat(BOARD_W, BOARD_H, paint(0xffffff, { map: corkTex, hatch: 0, unique: true }), 0, 0, 0.001).renderOrder = 1;
  // the stand: two uprights on feet, standing on the floor
  const UX = BOARD_W / 2 + 0.07, top = BOARD_H / 2 + 0.145;
  for (const s of [-1, 1]) {
    P.box(0.05, BY + top, 0.05, steel, s * UX, (top - BY) / 2, -0.02, 0.015);
    P.box(0.07, 0.04, 0.44, steel, s * UX, -BY + 0.02, -0.02, 0.015);
    P.put(new THREE.SphereGeometry(0.035, 10, 8), steel, s * UX, top + 0.01, -0.02);
    P.box(0.07, 0.03, 0.06, steel, s * UX - s * 0.05, 0, -0.022, 0.01);     // the clamp holding the board
  }
  // the pins that never move: merged, one mesh per colour
  const pinGeo = new THREE.SphereGeometry(0.016, 10, 8), byCol = new Map();
  const still = [...BOARD.photos.filter(p => !p.live).map(p => [p, 0xc8402f]), ...BOARD.notes.filter(n => n.pin != null).map(n => [n, n.pin])];
  for (const [it, col] of still) { const [px, py] = pinOf(it); if (!byCol.has(col)) byCol.set(col, []); byCol.get(col).push(pinGeo.clone().translate(px, py, 0.012)); }
  for (const [col, geos] of byCol) P.put(mergeGeometries(geos), paint(col));
  // the photos the officer keeps re-pinning: a card each, its pin on it
  const photos = live.map(({ p, t }) => {
    const pg = new THREE.Group(); pg.position.set(p.x, p.y, 0.006); g.add(pg);
    const Q = kit(pg);
    Q.flat(PH_W, PH_H, paint(0xffffff, { map: t, hatch: 0, unique: true }), 0, 0, 0).renderOrder = 2;
    Q.put(pinGeo, paint(0xc8402f), 0, PH_H / 2 - 0.018, 0.01);
    return pg;
  });
  const strM = paint(0xb8302a, { hatch: 0 }), seg = new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5);
  const strs = BOARD.string.map(() => { const m = P.put(seg, strM); m.userData.noInk = true; return m; });
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const update = () => {
    live.forEach(({ p }, i) => { photos[i].rotation.z = p.r; });
    strSegs().forEach(([a, b], i) => {
      const m = strs[i];
      _a.set(a[0], a[1], 0.016); _b.set(b[0], b[1], 0.016);
      m.position.copy(_a).add(_b).multiplyScalar(0.5); m.scale.y = _a.distanceTo(_b);
      m.quaternion.setFromUnitVectors(_Y, _b.sub(_a).normalize());
    });
  };
  update();
  LIVE.push(update);
  K.cols.push({ x0: BX - 0.25, x1: BX + 0.25, z0: BZ - UX - 0.05, z1: BZ + UX + 0.05 });
  // board-local → room coords
  return { toRoom: (x, y, z = 0, out = new THREE.Vector3()) => out.set(BX - z, BY + y, BZ + x) };
}

// two officers at the board, in uniform and peaked caps (the police look of the guard's
// uniform, folk.js), each their own person. One keeps re-pinning photos, running a hand along
// the string, pointing things out and stepping back to look; the other writes it all down.
const OFFICERS = {
  pinner: { skin: 'tan', hair: 0x2b1d1a, hairStyle: 'bun', hat: 'cap', hatColor: 0x1f2a44, top: 0x2c3a5a, outfit: 'uniform',
    bottom: 0x1e2433, shoes: 0x161416, sole: 0x4a4246, height: 1.02, build: 0.94,
    // brisk and focused: an oval face, a straight nose, a set mouth, brows drawn together
    face: { shape: { jaw: 0.35, chin: 0.55, cheeks: 0.35, long: 0.25, skull: 0.5, brow: 0.45 }, nose: 'straight', noseSize: 0.9, mouth: 'flat',
      eyes: 'round', brows: 'frown', browW: 0.9, lashes: true, hair: 'bun', blush: 0.4 } },
  writer: { skin: 'deep', hair: 0x1a1414, hairStyle: 'crop', hat: 'cap', hatColor: 0x1f2a44, top: 0x2c3a5a, outfit: 'uniform', stance: 'writing',
    bottom: 0x1e2433, shoes: 0x161416, sole: 0x4a4246, height: 0.98, build: 1.1, belly: 0.25,
    // patient and a little amused: a broad square face, a snub nose, raised brows, a half-smile
    face: { shape: { jaw: 0.8, chin: 0.45, cheeks: 0.6, long: 0.05, skull: 0.55, brow: 0.6 }, nose: 'snub', noseSize: 1.1, mouth: 'smirk',
      eyes: 'round', brows: 'raised', browW: 1.3, hair: 'crop', blush: 0.3 } },
};
function officers(K, brd) {
  const HPI = Math.PI / 2, ss = THREE.MathUtils.smoothstep, lerp = THREE.MathUtils.lerp;
  const add = (spec, x, z, ry) => {
    const inst = makeFolk(spec), root = new THREE.Group();
    root.position.set(x, 0, z); root.rotation.y = ry; root.add(inst.rig, blobShadow(0.24)); K.g.add(root);
    root.traverse(o => { if (o.isMesh && !o.userData.isInk) o.userData.noInk = true; });   // (inked fine already: no second hull from the room's)
    return { inst, root, J: inst.J };
  };
  const A = add(OFFICERS.pinner, 3.42, -2.75, HPI), B = add(OFFICERS.writer, 3.45, -1.5, 2.6);
  K.cols.push({ x0: 3.33, x1: 3.57, z0: -1.62, z1: -1.38 });
  const colA = { x0: 0, x1: 0, z0: 0, z1: 0 }; K.cols.push(colA);
  // ── the pinner: a loop of jobs, picked at random (never the same twice running) ──
  const R = rng(23), LOW = LIVE_PH, HIGH = [5, 6, 7];
  const pick = (a) => a[Math.floor(R() * a.length)];
  const FRONT = 3.42, BACK = 3.08;
  let job = null, last = '', prevT = null;
  const next = () => {
    const kinds = ['pin', 'string', 'point', 'back', 'pin'].filter(k => k !== last);
    const kind = pick(kinds); last = kind;
    const i = kind === 'pin' ? pick(LOW) : kind === 'point' ? pick(HIGH) : 3;
    const p = BOARD.photos[i];
    const back = R() < 0.5, sp = strSegs()[BOARD.run][back ? 1 : 0];
    const z = kind === 'string' ? BOARD_AT.z + sp[0] - 0.05 : kind === 'back' ? BOARD_AT.z - 0.2 + R() * 0.3 : BOARD_AT.z + p.x + (kind === 'point' ? 0.2 : 0.02);
    job = { kind, i, side: R() < 0.5 ? 'L' : 'R', z: THREE.MathUtils.clamp(z, -3.45, -2.1), x: kind === 'back' ? BACK : FRONT,
      t: 0, dur: { pin: 4.2, string: 4.6, point: 3.4, back: 3.6 }[kind], rT: (R() - 0.5) * 0.14, back };
  };
  next();
  const _w = new THREE.Vector3(), _l = new THREE.Vector3(), _q0 = new THREE.Quaternion();
  // put a hand on a board point (board-local), blended in by k; the elbow out to its side
  const reach = (P, side, bx, by, k, off = 0.035) => {
    if (k <= 0.001) return;
    const arm = P.J['arm' + side], fore = P.J['fore' + side];
    _q0.copy(arm.quaternion); const b0 = fore.rotation.x;
    brd.toRoom(bx, by, off, _w); K.g.localToWorld(_w);
    P.J.spine.worldToLocal(_l.copy(_w));
    ikArm(P.J, side, _l, new THREE.Vector3(side === 'R' ? 0.7 : -0.7, -0.7, -0.1));
    arm.quaternion.slerpQuaternions(_q0, arm.quaternion.clone(), k);
    fore.rotation.x = lerp(b0, fore.rotation.x, k);
    P.J['hand' + side].rotation.set(lerp(0, -0.4, k), 0, lerp(0, side === 'R' ? 0.5 : -0.5, k));
  };
  // turn the head (and a little of the neck) to a board point
  const look = (P, bx, by, k) => {
    brd.toRoom(bx, by, 0, _w); P.root.worldToLocal(K.g.localToWorld(_w));
    const yaw = THREE.MathUtils.clamp(Math.atan2(_w.x, _w.z), -1.1, 1.1), pitch = THREE.MathUtils.clamp(Math.atan2(1.0 - _w.y, Math.hypot(_w.x, _w.z)), -0.6, 0.6);
    P.J.neck.rotation.y = lerp(P.J.neck.rotation.y, yaw * 0.35, k); P.J.head.rotation.y = lerp(P.J.head.rotation.y, yaw * 0.65, k);
    P.J.head.rotation.x = lerp(P.J.head.rotation.x, pitch * 0.9, k);
  };
  const hips = (P, side, k) => {                     // a hand on the hip
    const sg = side === 'L' ? -1 : 1;
    P.J['arm' + side].rotation.set(lerp(P.J['arm' + side].rotation.x, 0.12, k), lerp(P.J['arm' + side].rotation.y, -sg * 1.6, k), lerp(P.J['arm' + side].rotation.z, sg * (0.56 + P.inst.armOut), k));
    P.J['fore' + side].rotation.x = lerp(P.J['fore' + side].rotation.x, -1.35, k);
    gripHand(P.J['grip' + side], 0.3);
  };
  LIVE.push((t) => {
    const dt = prevT == null ? 0 : Math.min(0.05, t - prevT); prevT = t;
    // ── walk to the spot for this job, turned the way she's going; then face the board ──
    const r = A.root.position, dx = job.x - r.x, dz = job.z - r.z, dist = Math.hypot(dx, dz);
    const D = job.dur, p = BOARD.photos[job.i];
    let k = 0, faceTo = HPI, env = 0, hx = 0, hy = 0;
    if (dist > 0.02 && job.t === 0) {
      const sp = dt > 0 ? Math.min(dist / dt, 0.5) : 0;
      r.x += dx / dist * sp * dt; r.z += dz / dist * sp * dt;
      const backing = job.kind === 'back' && dx < 0;             // stepping back: still facing the board
      k = Math.min(backing ? 0.4 : 0.7, dist * 4);
      if (!backing) faceTo = Math.atan2(dx, dz);
    } else {
      job.t += dt;
      env = ss(job.t, 0, 0.7) * (1 - ss(job.t, D - 0.7, D));
      if (job.kind === 'string') {                               // walking along with the hand
        const [a, b] = strSegs()[BOARD.run], s = ss(job.t, 0.6, D - 0.6), f = job.back ? 1 - s : s;
        hx = lerp(a[0], b[0], f); hy = lerp(a[1], b[1], f);
        const z1 = THREE.MathUtils.clamp(BOARD_AT.z + hx - 0.05, -3.45, -2.1);
        k = dt > 0 ? Math.min(0.45, Math.abs(z1 - r.z) / dt * 0.9) : 0;
        r.z = z1;
      }
    }
    let d = faceTo - A.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    A.root.rotation.y += d * Math.min(1, dt * 6);
    A.inst.rig.position.y = poseFolk(A.inst, dt, k);
    colA.x0 = r.x - 0.12; colA.x1 = r.x + 0.12; colA.z0 = r.z - 0.12; colA.z1 = r.z + 0.12;
    if (job.t > 0) {
      const u = job.t;
      A.root.updateMatrixWorld(true);
      if (job.kind === 'pin') {
        // re-pin a photo: one hand on its pin, the other steadying its corner; it turns to its new angle
        if (u > 0.8 && u < D - 0.9) p.r += (job.rT - p.r) * Math.min(1, dt * 1.6);
        const [px, py] = pinOf(p);
        reach(A, 'R', px + 0.004 * Math.sin(u * 9), py + 0.004 * Math.cos(u * 7), env);
        reach(A, 'L', p.x - 0.1 * Math.cos(p.r) + 0.1 * Math.sin(p.r), p.y - 0.1 * Math.cos(p.r) - 0.1 * Math.sin(p.r), env * 0.9, 0.03);
        gripHand(A.J.gripR, lerp(0.25, 0.85, env)); gripHand(A.J.gripL, lerp(0.25, 0.1, env));
        look(A, px, py - 0.05, Math.max(env, 0.5));
      } else if (job.kind === 'string') {
        // run a hand along the string from one pin to the next
        reach(A, 'R', hx, hy, env, 0.03);
        gripHand(A.J.gripR, 0.55);
        look(A, hx, hy, 1);
      } else if (job.kind === 'point') {
        // point out a photo up top: arm out, index finger extended, a couple of taps
        const side = job.side, tap = 0.03 * Math.max(0, Math.sin(u * 7)) * ss(u, 0.9, 1.2);
        reach(A, side, p.x, p.y, env, 0.12 - tap);
        const h = A.J['grip' + side]; gripHand(h, lerp(0.25, 1.3, env)); if (env > 0.3) h.userData.fingers[0].forEach((b) => { b.rotation.z = 0; });
        hips(A, side === 'L' ? 'R' : 'L', env);
        look(A, p.x, p.y, 1);
      } else {
        // step back, hands on hips, and take the whole board in
        hips(A, 'L', env); hips(A, 'R', env);
        look(A, -0.15 + 0.35 * Math.sin(u * 0.9), 0.05, 1);
        A.J.head.rotation.z = 0.12 * env * Math.sin(u * 0.7);
      }
      if (u >= D) { job.t = 0; const was = job.kind; next(); if (was === 'back') job.x = FRONT; }
    }
    // ── the writer: notes on his clipboard, looking up at the board between lines ──
    const lookUp = ss(Math.sin(t * 0.31), 0.55, 0.85);
    B.root.rotation.y = 2.6 + 0.3 * lookUp + 0.05 * Math.sin(t * 0.23);
    poseFolk(B.inst, dt, 0, { talk: 0 });
    if (lookUp > 0.01) { B.root.updateMatrixWorld(true); look(B, lerp(-0.3, 0.2, 0.5 + 0.5 * Math.sin(t * 0.17)), 0.05, lookUp); }
  });
}

// ── the close-up: press E at the board and it fills the screen, drawn from the same layout ──
let _bv = null;
function boardView() {
  if (_bv) return _bv;
  const css = document.createElement('style');
  css.textContent = `
    #boardView { inset: 0; z-index: 35; display: flex; align-items: center; justify-content: center; box-sizing: border-box;
      padding: max(12px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
      background: rgba(42,34,48,.55); }
    #boardView .pn { position: relative; box-sizing: border-box; width: min(1320px, 100%, calc((100vh - 130px) * 1.79 + 40px)); width: min(1320px, 100%, calc((100dvh - 130px) * 1.79 + 40px));
      padding: 12px 18px 12px; transform: rotate(-0.5deg); }
    #boardView h3 { font-family: 'Caveat', cursive; font-size: clamp(26px, 4vw, 36px); line-height: 1; margin: 0 0 8px; padding-right: 110px; }
    #boardView .cw { overflow: auto; border: 2.5px solid var(--ink); border-radius: 6px; overscroll-behavior: contain; }
    #boardView canvas { display: block; width: 100%; height: auto; background: #c99a62; touch-action: pan-x pan-y; }
    #boardView .ft .w { display: none; }
    /* a tall phone: the board drawn bigger, swiped along */
    @media (max-aspect-ratio: 4/5) { #boardView .pn { width: 100%; padding: 10px 12px; } #boardView canvas { width: 240%; } #boardView .ft .w { display: inline; } }
    #boardView .x { position: absolute; right: 14px; top: 10px; font-size: 18px; padding: 4px 14px; min-height: 40px; }
    #boardView .ft { font-size: 15px; color: var(--ink2); margin-top: 6px; text-align: center; }
    body.touch #boardView .ft .k { display: none; } body:not(.touch) #boardView .ft .t { display: none; }`;
  document.head.append(css);
  const el = document.createElement('div');
  el.id = 'boardView'; el.className = 'ui fade hide';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'the police board, close up');
  el.innerHTML = `<div class="pn sk"><h3>The police board</h3><button class="sk x" aria-label="close">close ✕</button>
    <div class="cw"><canvas width="2240" height="1254"></canvas></div>
    <div class="ft"><span class="w">swipe along the board · </span><span class="k">E or Esc to close</span><span class="t">tap outside the board to close</span></div></div>`;
  document.body.append(el);
  const cv = el.querySelector('canvas'), c = cv.getContext('2d');
  c.lineJoin = c.lineCap = 'round';
  // the still part of the board is painted once into its own canvas (again when a picture
  // arrives); every redraw lays that down, then the live photos, the string and the pins
  const still = document.createElement('canvas'); still.width = cv.width; still.height = cv.height;
  let stillVer = -1;
  const draw = () => {
    const cw = cv.width, ch = cv.height, S = cw / BOARD_W, cx = cw / 2, cy = ch / 2;
    if (stillVer !== _imgVer) { stillVer = _imgVer; drawBoardLayer(still.getContext('2d'), cw, ch); }
    c.drawImage(still, 0, 0);
    for (const i of LIVE_PH) { const p = BOARD.photos[i]; drawPhoto(c, p, S, cx + p.x * S, cy - p.y * S, p.r); }
    // the red string, pin to pin (a shadow on the cork under it), then the pins on top
    const segs = strSegs();
    for (const [col, off, wd] of [['rgba(60,30,20,0.3)', S * 0.006, S * 0.006], ['#b8302a', 0, S * 0.005]]) {
      c.strokeStyle = col; c.lineWidth = wd; c.beginPath();
      for (const [[ax, ay], [bx, by]] of segs) { c.moveTo(cx + ax * S + off, cy - ay * S + off); c.lineTo(cx + bx * S + off, cy - by * S + off); }
      c.stroke();
    }
    const pin = (x, y, col) => {
      const r = S * 0.016;
      c.fillStyle = 'rgba(40,20,10,0.35)'; c.beginPath(); c.arc(x + r * 0.5, y + r * 0.7, r, 0, 7); c.fill();
      c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
      c.strokeStyle = INKC; c.lineWidth = S * 0.0025; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.32, 0, 7); c.fill();
    };
    for (const p of BOARD.photos) { const [x, y] = pinOf(p); pin(cx + x * S, cy - y * S, '#c8402f'); }
    for (const n of BOARD.notes) if (n.pin != null) { const [x, y] = pinOf(n); pin(cx + x * S, cy - y * S, hex(n.pin)); }
  };
  for (const p of BOARD.photos) artImg(p.img);
  for (const id of Object.keys(SUSPECTS)) faceImg(id);
  _imgSubs.add(() => { if (_bv?.open) draw(); });
  let M = null, tick = 0;
  const close = () => {
    if (!_bv.open) return;
    _bv.open = false; el.classList.add('hide'); clearInterval(tick);
    removeEventListener('keydown', keys, true);
    M?.ui(false); M = null;
  };
  // E and Esc close it (caught before the game's own keys see them)
  const keys = (e) => {
    if (e.code !== 'KeyE' && e.code !== 'Escape') return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) close();
  };
  el.querySelector('.x').onclick = close;
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });       // a tap outside the board
  _bv = {
    open: false,
    show(m) {
      if (_bv.open) return;
      M = m; M.ui(true);
      _bv.open = true; draw(); el.classList.remove('hide');
      addEventListener('keydown', keys, true);
      tick = setInterval(draw, 250);                   // (the officers keep re-pinning while you look)
    },
    close,
  };
  return _bv;
}

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
    // ── two cats: Pickle asleep on the armchair's blanket; Mochi batting a ball of yarn about ──
    const { yaw } = YF.chair;
    const pickle = makeCat(0xe09a52, 0xd98a40);
    pickle.g.remove(pickle.g.children[pickle.g.children.length - 1]);      // (no floor shadow up on a cushion)
    pickle.g.traverse(o => { if (o.isMesh && o.geometry.parameters?.radius === 0.013) o.scale.set(1.3, 0.22, 1); });   // eyes shut
    pickle.legs.forEach((l) => { l.rotation.x = -1.5; });                  // a loaf: every paw tucked forward
    pickle.tail.rotation.order = 'YXZ'; pickle.tail.rotation.set(-1.3, 1.0, 0);   // tail laid round her
    const [px, pz] = yfChair(-0.01, 0.07);
    pickle.g.position.set(px, 0.548 - 0.072, pz);
    pickle.g.rotation.y = yaw - Math.PI / 2 + 0.22;                         // curled across the seat, nose to the left arm
    K.g.add(pickle.g);
    let petT = -9;
    LIVE.push((t) => {
      const b = Math.sin(t * 1.5);
      pickle.g.scale.set(1 + b * 0.012, 1 + b * 0.028, 1);                // breathing
      const k = Math.min(1, Math.max(0, (t - petT) / 1.8)), st = Math.sin(k * Math.PI);
      pickle.legs[0].rotation.x = pickle.legs[1].rotation.x = -1.5 + st * 0.35;     // a stretch when you pet her
      pickle.tail.rotation.y = 1.0 + Math.sin(t * 0.7) * 0.06 + st * 0.25;
    });
    mini(K, ...yfChair(0, 0.9), 'pet Pickle', (m) => { petT = NOW; m.say('Pickle stretches both front paws, purrs, and goes back to sleep on the blanket.'); }, 0.65);

    // Mochi: sits by the ball, watches, bats it — it rolls off, its strand trailing slack back to
    // the basket — and trots after it. Three spots, round and round.
    const mochi = makeCat(0x9a9490, 0xb8b2ac);
    mochi.g.rotation.order = 'YXZ';
    K.g.add(mochi.g);
    const ball = yfBall(0.065, yfCol(0, 1)); K.g.add(ball);
    const P = [[1.75, -1.75], [1.25, -1.3], [1.95, -1.05]];
    const dirs = P.map((p, k) => { const q = P[(k + 1) % 3], dx = q[0] - p[0], dz = q[1] - p[1], l = Math.hypot(dx, dz); return [dx / l, dz / l]; });
    const seat = P.map((p, k) => [p[0] - dirs[k][0] * 0.4, p[1] - dirs[k][1] * 0.4]);
    const [bkx, bkz] = YF.basket, strandM = paint(yfCol(0, 1).getHex());
    const strand = new THREE.Mesh(new THREE.BufferGeometry(), strandM); strand.userData.noInk = true; K.g.add(strand);
    const _ax = new THREE.Vector3();
    let lastX = 1e9, lastZ = 1e9;
    const lay = (x, z) => {                                               // the strand from the basket's rim to the ball
      const dx = x - bkx, dz = z - bkz, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, nx = -uz, nz = ux;
      const at = (r, y) => new THREE.Vector3(bkx + ux * r, y, bkz + uz * r);
      const fx = bkx + ux * 0.34, fz = bkz + uz * 0.34, mx = (fx + x) / 2 + nx * 0.16, mz = (fz + z) / 2 + nz * 0.16;
      const pts = [at(0.15, 0.24), at(0.205, 0.255), at(0.25, 0.2), at(0.27, 0.06), new THREE.Vector3(fx, 0.008, fz), new THREE.Vector3(mx, 0.008, mz), new THREE.Vector3(x - ux * 0.05, 0.02, z - uz * 0.05)];
      strand.geometry.dispose();
      strand.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.006, 5);
    };
    const sitAt = (x, z, d, t, swipe) => {
      mochi.g.position.set(x, 0.03, z);
      mochi.g.rotation.set(-0.5, Math.atan2(d[0], d[1]), 0);
      mochi.legs[0].rotation.x = 0.5; mochi.legs[2].rotation.x = mochi.legs[3].rotation.x = 0.95;
      mochi.legs[1].rotation.x = 0.5 - swipe * 1.3;
      mochi.tail.rotation.y = Math.sin(t * 3.1) * 0.5; mochi.tail.rotation.x = 0;
    };
    const T = 6.5;
    LIVE.push((t) => {
      const cyc = Math.floor(t / T), u = t - cyc * T, k = cyc % 3, k1 = (k + 1) % 3;
      // the ball: rolls from spot k to k+1 after the swipe, easing to a stop
      const ru = Math.min(1, Math.max(0, (u - 2.5) / 1.2)), re = 1 - (1 - ru) ** 2;
      const bx = P[k][0] + (P[k1][0] - P[k][0]) * re, bz = P[k][1] + (P[k1][1] - P[k][1]) * re;
      const mv = Math.hypot(bx - lastX, bz - lastZ);
      if (mv > 1e-4) {
        if (mv < 0.5) ball.rotateOnWorldAxis(_ax.set(bz - lastZ, 0, -(bx - lastX)).normalize(), mv / 0.065);
        ball.position.set(bx, 0.065, bz); lay(bx, bz); lastX = bx; lastZ = bz;
      }
      // the cat
      if (u < 3.4) sitAt(...seat[k], dirs[k], t, u > 2.1 && u < 2.6 ? Math.sin((u - 2.1) / 0.5 * Math.PI) : Math.max(0, Math.sin(t * 2.2)) * 0.12);
      else if (u < 4.9) {
        const w = (u - 3.4) / 1.5, e = w * w * (3 - 2 * w), [ax, az] = seat[k], [cx2, cz2] = seat[k1];
        const mx = (ax + cx2) / 2, mz = (az + cz2) / 2, ox = mx - P[k1][0], oz = mz - P[k1][1], ol = Math.hypot(ox, oz) || 1;
        const qx = mx + ox / ol * 0.35, qz = mz + oz / ol * 0.35;           // round the ball, not through it
        const x = (1 - e) ** 2 * ax + 2 * (1 - e) * e * qx + e * e * cx2, z = (1 - e) ** 2 * az + 2 * (1 - e) * e * qz + e * e * cz2;
        const dx = 2 * (1 - e) * (qx - ax) + 2 * e * (cx2 - qx), dz = 2 * (1 - e) * (qz - az) + 2 * e * (cz2 - qz);
        mochi.g.rotation.x = 0;
        catMove(mochi, x, z, dx, dz, t, 10);
      } else sitAt(...seat[k1], dirs[k1], t, 0);
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
    wash: [0.12, '#f4ead8'],
    tile: [256, 0.64, (c, w, h) => {             // cream wallpaper: soft oat stripes, a little sprig between
      c.fillStyle = '#f3e8d5'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ece0c9'; c.fillRect(0, 0, w * 0.16, h); c.fillRect(w * 0.5, 0, w * 0.16, h);
      c.strokeStyle = 'rgba(190,160,120,0.28)'; c.lineWidth = 1.5;
      for (const x of [w * 0.16, w * 0.66]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (const [sx, sy] of [[w * 0.33, h * 0.27], [w * 0.83, h * 0.77]]) {
        c.strokeStyle = 'rgba(120,150,110,0.55)'; c.lineWidth = 2;
        c.beginPath(); c.moveTo(sx, sy + 16); c.quadraticCurveTo(sx + 3, sy, sx, sy - 14); c.stroke();
        c.fillStyle = 'rgba(140,170,125,0.55)';
        for (const [dx, dy, a] of [[-6, 4, -0.7], [6, -2, 0.7], [-5, -8, -0.6]]) { c.beginPath(); c.ellipse(sx + dx, sy + dy, 6, 3, a, 0, 7); c.fill(); }
        c.fillStyle = 'rgba(214,150,125,0.6)'; c.beginPath(); c.arc(sx, sy - 16, 3.5, 0, 7); c.fill();
      }
    }],
    floor: (c, w, h) => planksDraw(c, w, h, ['#c99f70', '#bf9465', '#d0a879', '#c49a6b'], 8),       // honey planks
    floorTile: 1.6, floorPx: 512,
    rug: false,                                // (its own round crocheted rug: SETS)
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
    // warm string lights round the top of the room (clear of the sign, the cubbies' plant and the curtain rod)
    const y = 2.55, LG = new THREE.Group(); K.g.add(LG);
    const bulbG = new THREE.SphereGeometry(0.028, 12, 10).scale(1, 1.3, 1), bulbM = new THREE.MeshBasicMaterial({ color: 0xffd68a, toneMapped: false });
    const at = [];
    const loops = [
      sag([-W / 2 + 0.1, y, -D + 0.62], [-SCR_W / 2 - 0.15, y, -D + 0.62], 0.12),
      sag([SCR_W / 2 + 0.15, y, -D + 0.62], [W / 2 - 0.1, y, -D + 0.62], 0.12),
      sag([-W / 2 + 0.08, y, -D + 0.7], [-W / 2 + 0.08, y, -0.2], 0.15),
      sag([W / 2 - 0.08, y, -D + 0.7], [W / 2 - 0.08, y, -0.2], 0.15),
    ];
    for (const pts of loops) bunting(K, pts, 16, (p) => {
      const b = new THREE.Mesh(bulbG, bulbM); b.position.set(p.x, p.y - 0.04, p.z); LG.add(b);
      at.push(p.x, p.y - 0.04, p.z);
    });
    mergeStatic(LG);
    LG.traverse(o => { o.userData.noInk = true; });
    // their glow: one draw of soft points
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(at, 3));
    const glowT = canvasTex(64, 64, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,214,140,0.7)'); g.addColorStop(1, 'rgba(255,214,140,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowT, size: 0.24, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    pts.userData.noInk = true; K.g.add(pts);
  },
};

const MINI = {
  yarnflow(K) {
    // the drying rack, a scarf on it: every press crochets one more row
    const { x, z, yaw } = YF.rack;
    const RG = new THREE.Group(); RG.position.set(x, 0, z); RG.rotation.y = yaw; K.g.add(RG);
    const RS = kit(new THREE.Group()), wood = paint(0xb0845a); RG.add(RS.g);
    for (const dx of [-0.42, 0.42]) { RS.put(yfBox(0.05, 1.6, 0.05, 0.018), wood, dx, 0.8, 0); RS.put(yfBox(0.07, 0.04, 0.34, 0.015), wood, dx, 0.02, 0); }
    RS.put(new THREE.CylinderGeometry(0.022, 0.022, 0.84, 12), wood, 0, 1.56, 0, [0, 0, Math.PI / 2]);
    RS.put(yfBox(0.44, 0.075, 0.075, 0.03), paint(yfCol(0, 1).getHex(), { hatch: 0.7 }), 0, 1.56, 0);      // the scarf, folded over the bar
    ink(RS.g, 'fine'); mergeStatic(RS.g, [], { vc: true });
    RS.g.traverse(o => { if (o.isMesh && !o.userData.isInk) o.userData.noInk = true; });
    const STITCH = ['chain', 'single crochet', 'half double crochet', 'double crochet', 'treble crochet'];
    const rows = [];
    for (let i = 0; i < 16; i++) {
      const r = new THREE.Mesh(yfBox(0.42, 0.075, 0.03, 0.012), paint(yfCol(Math.floor(i / 2.67), 1).getHex(), { hatch: 0.7 }));
      r.position.set(0, 1.5 - i * 0.072, (i % 2) * 0.003); r.visible = i < 5; RG.add(r); rows.push(r);
    }
    let n = 5;
    const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 10), paint(0x9fbfba)); RG.add(hook);
    hook.position.set(0.26, 1.5 - n * 0.072, 0.05);
    LIVE.push((t) => { hook.position.y = 1.54 - n * 0.072 + Math.sin(t * 6) * 0.01; hook.rotation.z = 0.9 + Math.sin(t * 6) * 0.15; });
    mini(K, x + Math.sin(yaw) * 0.75, z + Math.cos(yaw) * 0.75, 'crochet a row', (m) => {
      if (n >= rows.length) { rows.forEach((r, i) => { r.visible = i < 1; }); n = 1; return m.say('Finished a scarf! Starting a new one with a chain.'); }
      rows[n].visible = true; n++;
      m.say(`Row ${n}: ${STITCH[n % STITCH.length]} × 12. YarnFlow plays a pattern like this stitch by stitch, in 3D.`);
    });
    K.cols.push({ x0: x - 0.42, x1: x + 0.42, z0: z - 0.46, z1: z + 0.46 });
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
    // the police board: a close-up of it fills the screen (boardView)
    mini(K, 3.0, -2.8, 'look at the board', (m) => boardView().show(m), 0.85);
    let j = -1;
    const COPS = [
      'Evening. We\'re only putting the board in order. Please stay behind the tape.',
      'One photo for every painting in the catalogue. Forty-five to pin.',
    ];
    mini(K, 3.0, -1.35, 'talk to the officer', (m) => { j = (j + 1) % COPS.length; m.say(COPS[j]); }, 0.6);
    mini(K, -0.4, -4.0, 'look at the tape', (m) => m.say('A roll of grey gallery tape — the museum\'s own kind — left on the floor.'), 0.55);
  },
};

const ROOM_WALL = { qr: 0x6f8a84, yarnflow: 0xc9dcc1, 'borrowed-eyes': 0xdbe8dd, gallery: 0x8a6a9a };

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
  _FACE = game?.FACE ?? null;                   // (the suspects' portraits, for the museum's police board)
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
    ui(on) { G.ui = on ? 'room' : null; st.enabled = !on; if (on) { prompt.classList.add('hide'); say.classList.add('hide'); } },
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
      S.camMask = camera.layers.mask;
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
      camera.layers.mask = S.camMask ?? 1; playerLayer(false);
      player.root.children[0].position.y = 0;                    // (the room's walk bob)
      const o = S.out();
      st.dir.copy(o.dir); st.heading.copy(o.heading); st.camFwd.copy(o.camFwd || o.heading);
      // back on the street as a clean cut: everything the street walk eases (her height, the
      // camera's anchor, its look-ahead, the squash) starts from here, not from where she
      // went in; the camera takes a clear angle at once (player.js: not inside the shop's
      // back wall); and a key held through the fade — S, to walk out of the room — waits to
      // be let go, or she'd turn on the spot and walk straight back in
      st.speed = 0; st.camPitch = S.pitch0; st.camInit = false; st.grT = null; st.gr = 0;
      st.squashK = 0; st.leadV?.set(0, 0, 0); st.camYaw = 0; st.recenter = 0; st.inputHold = true;
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
