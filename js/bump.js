// ─── OOOOHHH! — what happens when the car hits someone ──────────────────────
// Cartoon rules: they launch, flail, tumble through the air, bounce once,
// land flat on their back with a long wail, lie there a moment, pick
// themselves up with a grumble and walk back to where they were. Nobody is
// ever hurt; the story's people always come back to their spot.
import * as THREE from 'three';
import { groundAt, standAt, alignToSurface, yawToFace, arc, slerpDir, R } from './world.js';
import { poseFolk } from './folk.js';
import { sfxOut } from './audio.js';

// ── voices: a falling "oooooh" sung through two vowel formants ──
// (through the game's sound bus, so the mute covers them — see audio.js)
let OUT = null;
function audio() { const a = sfxOut(); OUT = a && a.out; return a && a.ac; }
function wail(pitch = 300, dur = 1.25, vol = 0.18) {
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime, out = ac.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(vol, t + 0.06);
  out.gain.setValueAtTime(vol, t + dur * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(OUT);
  // "oo": formants around 330 Hz and 870 Hz
  const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 330; f1.Q.value = 5;
  const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 870; f2.Q.value = 7;
  const g2 = ac.createGain(); g2.gain.value = 0.5;
  f1.connect(out); f2.connect(g2); g2.connect(out);
  const lfo = ac.createOscillator(), lfoG = ac.createGain();
  lfo.frequency.value = 6.5; lfoG.gain.value = pitch * 0.04; lfo.connect(lfoG);
  for (const det of [0, 7]) {
    const o = ac.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
    o.frequency.setValueAtTime(pitch * 1.7, t);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.62, t + dur);
    lfoG.connect(o.frequency);
    o.connect(f1); o.connect(f2);
    o.start(t); o.stop(t + dur + 0.05);
  }
  lfo.start(t); lfo.stop(t + dur + 0.05);
}
function thud(vol = 0.25) {
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime, n = ac.sampleRate * 0.18, buf = ac.createBuffer(1, n, ac.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3;
  const src = ac.createBufferSource(); src.buffer = buf;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
  const g = ac.createGain(); g.gain.value = vol;
  src.connect(lp); lp.connect(g); g.connect(OUT); src.start(t);
}

// ── speech bubbles that hang over a person (hand-drawn, in the DOM) ──
const _v = new THREE.Vector3();
function bubbleLayer() {
  let el = document.getElementById('bubbles');
  if (!el) { el = document.createElement('div'); el.id = 'bubbles'; document.body.appendChild(el); }
  return el;
}

export function createBumps({ camera, player }) {
  const bodies = [];
  const layer = bubbleLayer();
  const bubbles = [];
  function say(body, text, dur, cls = '') {
    const el = document.createElement('div');
    el.className = 'bub sk ' + cls; el.textContent = text;
    layer.appendChild(el);
    bubbles.push({ el, body, t: 0, dur });
  }

  // register anyone who can be knocked over
  // opts: { name, pitch, line, home: () => dir, onAway(), onBack(), quat (rest orientation, optional) }
  function add(obj, opts) {
    const b = { obj, ...opts, state: 'ok', vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), dir: new THREE.Vector3() };
    bodies.push(b);
    return b;
  }

  // the car: is anyone in front of the bumper?
  const _l = new THREE.Vector3();
  function checkHits() {
    const st = player.st;
    if (st.mode !== 'jeep' || Math.abs(st.speed) < 1.2) return;
    const car = player.root;
    for (const b of bodies) {
      if (b.state !== 'ok' || !b.obj.visible || b.immune) continue;
      car.worldToLocal(_l.copy(b.obj.position));
      if (Math.abs(_l.x) > 0.95 || Math.abs(_l.z) > 1.7 || Math.abs(_l.y) > 1.5) continue;
      launch(b, Math.sign(_l.x || 1));
    }
  }
  function launch(b, side) {
    const st = player.st, up = b.obj.position.clone().normalize(), sp = Math.abs(st.speed);
    b.state = 'fly'; b.t = 0; b.bounced = false;
    b.vel.copy(st.heading).multiplyScalar(Math.sign(st.speed) * (2 + sp * 0.75))
      .addScaledVector(up, 4.2 + sp * 0.45)
      .addScaledVector(new THREE.Vector3().crossVectors(up, st.heading).normalize(), side * (1.2 + Math.random()));
    b.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(7 + sp * 0.6);
    st.speed *= 0.72;                                  // the car feels it
    b.onAway?.();
    wail(b.pitch, 1.3);
    say(b, ['WAAAAH!', 'AAAAH!', 'WHOAAA!'][Math.floor(Math.random() * 3)], 1.0, 'yell');
  }

  const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  function update(dt) {
    checkHits();
    for (const b of bodies) {
      if (b.state === 'ok') continue;
      const h = b.obj.userData.human, J = h?.J;
      b.t += dt;
      if (b.state === 'fly') {
        const P = b.obj.position, up = _v.copy(P).normalize();
        b.vel.addScaledVector(up, -15 * dt);                                  // the planet pulls them home
        P.addScaledVector(b.vel, dt);
        const sa = b.spin.length();
        if (sa) b.obj.quaternion.premultiply(_q.setFromAxisAngle(_x.copy(b.spin).normalize(), sa * dt));
        if (h) {                                                                // flail!
          poseFolk(h, dt, 0);
          const w = b.t * 22;
          J.armL.rotation.set(-2.7 + 0.5 * Math.sin(w), 0, -0.5 - 0.3 * Math.cos(w * 1.1));
          J.armR.rotation.set(-2.7 + 0.5 * Math.sin(w + 2), 0, 0.5 + 0.3 * Math.cos(w * 0.9));
          J.foreL.rotation.x = -0.4; J.foreR.rotation.x = -0.4;
          J.thighL.rotation.x = -0.9 * Math.sin(w * 0.8); J.thighR.rotation.x = 0.9 * Math.sin(w * 0.8);
          J.shinL.rotation.x = 0.8; J.shinR.rotation.x = 0.8;
        }
        const d = b.dir.copy(P).normalize(), g = groundAt(d);
        if (P.length() <= g + 0.05 && b.vel.dot(d) < 0) {
          P.setLength(g + 0.05);
          const vn = b.vel.dot(d);
          if (!b.bounced && vn < -3.5) {                                       // one good bounce
            b.vel.addScaledVector(d, -vn * 1.4).multiplyScalar(0.45);
            b.spin.multiplyScalar(0.5); b.bounced = true; thud(0.18);
          } else land(b);
        }
      } else if (b.state === 'down') {
        b.obj.quaternion.slerp(b.q1, 1 - Math.exp(-12 * dt));
        b.obj.position.setLength(groundAt(b.dir) + 0.12);
        if (h) {                                                                // spread-eagled, a weak twitch
          poseFolk(h, dt, 0);
          J.armL.rotation.set(-0.2, 0, -1.3 - 0.1 * Math.sin(b.t * 9) * Math.max(0, 1 - b.t)); J.armR.rotation.set(-0.2, 0, 1.3);
          J.thighL.rotation.set(-0.15, 0, -0.25); J.thighR.rotation.set(-0.3, 0, 0.25); J.shinR.rotation.x = 0.6;
        }
        if (b.t > 2.4) { b.state = 'rise'; b.t = 0; b.q0.copy(b.obj.quaternion); say(b, b.line, 2.2, 'grumble'); }
      } else if (b.state === 'rise') {
        const k = Math.min(1, b.t / 0.7), e = k * k * (3 - 2 * k);
        const home = b.home();
        alignToSurface(b.obj, b.dir, yawToFace(b.dir, home));
        b.q1.copy(b.obj.quaternion);
        b.obj.quaternion.copy(b.q0).slerp(b.q1, e);
        b.obj.position.copy(b.dir).multiplyScalar(standAt(b.dir) + 0.12 * (1 - e));
        if (h) poseFolk(h, dt, 0);
        if (k >= 1) { b.state = 'back'; b.t = 0; }
      } else if (b.state === 'back') {                                          // dust off and walk back
        const home = b.home(), dist = arc(b.dir, home);
        if (dist < 0.06) {
          b.state = 'ok';
          b.onBack?.();
          continue;
        }
        b.dir.copy(slerpDir(b.dir, home, Math.min(1, 1.3 * dt / dist)));
        b.obj.position.copy(b.dir).multiplyScalar(standAt(b.dir));
        alignToSurface(b.obj, b.dir, yawToFace(b.dir, home));
        if (b.obj.userData.turn) b.obj.userData.turn.rotation.y = 0;
        if (h) poseFolk(h, dt, 0.6);
      }
    }
    // bubbles ride above their person and fade out
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const B = bubbles[i];
      B.t += dt;
      if (B.t > B.dur) { B.el.remove(); bubbles.splice(i, 1); continue; }
      const P = B.body.obj.position;
      _v.copy(P).addScaledVector(_y.copy(P).normalize(), 1.7).project(camera);
      const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
      B.el.style.opacity = vis ? String(Math.min(1, (B.dur - B.t) * 3, B.t * 8)) : '0';
      B.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translate(-50%, -100%) rotate(${(Math.sin(B.t * 18) * 3).toFixed(1)}deg)`;
    }
  }
  function land(b) {
    b.state = 'down'; b.t = 0;
    const up = b.dir.copy(b.obj.position).normalize();
    // flat on their back, head pointing the way they were flying
    _y.copy(b.vel).projectOnPlane(up);
    if (_y.lengthSq() < 1e-4) _y.set(1, 0, 0).projectOnPlane(up);
    _y.normalize(); _z.copy(up); _x.crossVectors(_y, _z).normalize();
    b.q1.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    thud(0.28);
    wail(b.pitch * 0.8, 1.6, 0.14);
    say(b, 'oooOOOHHH…', 2.2, 'wail');
  }
  const busy = (obj) => bodies.some(b => b.obj === obj && b.state !== 'ok');
  // knock someone over directly (used by tests; handy for a scripted gag later)
  const knock = (obj, side = 1) => { const b = bodies.find(x => x.obj === obj); if (b && b.state === 'ok') launch(b, side); };
  // a bubble over anyone on demand (the story uses it: "Come ON!", "…bother.")
  const sayOver = (obj, text, dur = 2.2, cls = 'grumble') => say({ obj }, text, dur, cls);
  const body = (obj) => bodies.find(x => x.obj === obj);
  return { add, update, busy, bodies, knock, say: sayOver, body };
}
