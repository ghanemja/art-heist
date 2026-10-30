// ─── SOUND: a quiet noir score and the night's air, all synthesised (no files) ──
// Investigative, never shrill: plucked upright bass, brushes, low muted piano and
// pads in D minor, everything under a dark lowpass. No bells, chimes or high ringing —
// nothing here sounds above ~350 Hz except brush noise and the soft low end of the keys.
//
//   scene 'title'  – a slow low pad and a lone bass, behind the title page
//   scene 'night'  – the cold open: wind, a low drone, a heartbeat pulse (cue() swells)
//   scene 'dawn'   – the editor's texts: the pad alone, warming up
//   scene 'day'    – the investigation: a swung walking bass, brushes, piano stabs
//   scene 'tense'  – the countdown: a driving bass ostinato over a low pulse
//   scene 'end'    – the epilogue: warm major chords, no drums
//
// The context starts on the first click/key (browsers forbid autoplay). M or the
// sound button mutes everything, the bump voices too (they play through sfxOut()).

let AC = null, master, musicBus, ambBus, sfxBus, verbIn, noiseBuf, windGain, windLP;
let muted = false;
const LEVEL = 0.75;                                 // overall: a background score, under the game
try { muted = localStorage.getItem('sound') === 'off'; } catch { /* private window */ }

const N = (name) => {   // note name → Hz, e.g. 'D2', 'Bb3', 'C#4'
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  const s = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((s - 9) / 12 + (+m[3] - 4));
};
const Ns = (str) => str.split(' ').map(N);

function build() {
  AC = new (window.AudioContext || window.webkitAudioContext)();
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 6; comp.knee.value = 8; comp.attack.value = 0.01; comp.release.value = 0.3;
  master = AC.createGain(); master.gain.value = muted ? 0 : LEVEL;
  master.connect(comp); comp.connect(AC.destination);
  // the music sits under a dark lowpass: warm, never bright
  const dark = AC.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2400; dark.Q.value = 0.5;
  musicBus = AC.createGain(); musicBus.gain.value = 0; musicBus.connect(dark); dark.connect(master);
  ambBus = AC.createGain(); ambBus.gain.value = 1; ambBus.connect(master);
  sfxBus = AC.createGain(); sfxBus.gain.value = 1; sfxBus.connect(master);
  // a small dark room: a decaying-noise impulse, lowpassed
  const len = AC.sampleRate * 2.4, imp = AC.createBuffer(2, len, AC.sampleRate);
  for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); let lp = 0; for (let i = 0; i < len; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.25; d[i] = lp * (1 - i / len) ** 2.6; } }
  const conv = AC.createConvolver(); conv.buffer = imp;
  const vlp = AC.createBiquadFilter(); vlp.type = 'lowpass'; vlp.frequency.value = 1500;
  const vg = AC.createGain(); vg.gain.value = 0.9;
  verbIn = AC.createGain(); verbIn.connect(conv); conv.connect(vlp); vlp.connect(vg); vg.connect(musicBus);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  // wind: looped noise through a slowly wandering lowpass
  const w = AC.createBufferSource(); w.buffer = noiseBuf; w.loop = true;
  windLP = AC.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 320; windLP.Q.value = 1.2;
  const lfo = AC.createOscillator(), lfoG = AC.createGain(); lfo.frequency.value = 0.07; lfoG.gain.value = 160;
  lfo.connect(lfoG); lfoG.connect(windLP.frequency);
  const lfo2 = AC.createOscillator(), lfo2G = AC.createGain(); lfo2.frequency.value = 0.13; lfo2G.gain.value = 0.25;
  windGain = AC.createGain(); windGain.gain.value = 0;
  const wMod = AC.createGain(); wMod.gain.value = 0.75; lfo2.connect(lfo2G); lfo2G.connect(wMod.gain);
  w.connect(windLP); windLP.connect(wMod); wMod.connect(windGain); windGain.connect(ambBus);
  w.start(); lfo.start(); lfo2.start();
  // a hidden tab gets silence (and a scheduler that doesn't fall behind)
  document.addEventListener('visibilitychange', () => { if (document.hidden) AC.suspend(); else AC.resume(); });
  setInterval(pump, 25);
}

// ── instruments ──
const env = (g, t, a, peak, dec, sus = 0.0001) => {
  g.gain.value = 0;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + dec);
};
function osc(type, f, t, end, to) { const o = AC.createOscillator(); o.type = type; o.frequency.value = f; o.connect(to); o.start(t); o.stop(end); return o; }
// upright bass: a round pluck with the filter closing as it rings
function bass(f, t, dur, vol = 0.32) {
  const g = AC.createGain(), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
  lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.25);
  env(g, t, 0.008, vol, dur * 1.5);
  lp.connect(g); g.connect(musicBus);
  osc('triangle', f, t, t + dur * 1.6, lp); osc('sine', f, t, t + dur * 1.6, lp);
}
// muted low piano: sine + a little triangle, a soft hammer, short-ish ring
function keys(fs, t, dur, vol = 0.05) {
  for (const f of fs) {
    const g = AC.createGain(), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    g.gain.value = 0;                                   // silent until its (slightly rolled) hammer lands
    env(g, t + Math.random() * 0.025, 0.012, vol, dur, vol * 0.15);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.25);
    lp.connect(g); g.connect(musicBus); g.connect(verbIn);
    osc('sine', f, t, t + dur + 1.5, lp); osc('triangle', f, t, t + dur + 1.5, lp).detune.value = 4;
  }
}
// pad: detuned saws through a low filter, slow in and out
function pad(fs, t, dur, vol = 0.035, cut = 420) {
  for (const f of fs) {
    const g = AC.createGain(), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(g); g.connect(musicBus); g.connect(verbIn);
    osc('sawtooth', f, t, t + dur + 0.1, lp).detune.value = -7; osc('sawtooth', f, t, t + dur + 0.1, lp).detune.value = 7;
  }
}
// brushes: a soft swish of filtered noise (no cymbal tone)
function brush(t, vol = 0.05, len = 0.16) {
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  const g = AC.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + len * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  s.connect(bp); bp.connect(lp); lp.connect(g); g.connect(musicBus);
  s.start(t, Math.random() * 1.5); s.stop(t + len + 0.05);
}
// a soft felt kick / heartbeat
function kick(t, vol = 0.3, f0 = 85) {
  const g = AC.createGain(); env(g, t, 0.005, vol, 0.28);
  const o = AC.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.35);
}

// ── the score ──
// D minor noir: Dm9 – Bbmaj7 – Gm9 – A7(b9), low close voicings
const CH = {
  Dm: { keys: Ns('F3 A3 C4 E4'), walk: Ns('D2 F2 A2 C3'), pad: Ns('D2 A2 F3') },
  Bb: { keys: Ns('Bb2 D3 F3 A3'), walk: Ns('Bb1 D2 F2 A2'), pad: Ns('Bb1 F2 D3') },
  Gm: { keys: Ns('F3 A3 Bb3 D4'), walk: Ns('G1 Bb1 D2 F2'), pad: Ns('G1 D2 Bb2') },
  A7: { keys: Ns('G3 Bb3 C#4 E4'), walk: Ns('A1 C#2 E2 G2'), pad: Ns('A1 E2 C#3') },
  F:  { keys: Ns('E3 A3 C4 E4'), walk: Ns('F2 A2 C3 E3'), pad: Ns('F2 C3 A3') },
  C:  { keys: Ns('E3 G3 Bb3 D4'), walk: Ns('C2 E2 G2 Bb2'), pad: Ns('C2 G2 E3') },
};
const PROG = { minor: ['Dm', 'Bb', 'Gm', 'A7'], end: ['F', 'Dm', 'Gm', 'C'] };
const SCENES = {
  title: { bpm: 66, vol: 0.85, wind: 0.05 },
  night: { bpm: 60, vol: 0.9, wind: 0.16 },
  dawn:  { bpm: 66, vol: 0.8, wind: 0.07 },
  day:   { bpm: 84, vol: 0.45, wind: 0.025 },
  tense: { bpm: 112, vol: 0.7, wind: 0.04 },
  end:   { bpm: 74, vol: 0.8, wind: 0.03 },
};
let scene = null, step = 0, nextT = 0;
// one bar = 8 swung eighths; called for each eighth just ahead of time
function play(sc, s, t, beat) {
  const bar = Math.floor(s / 8), e = s % 8, prog = sc === 'end' ? PROG.end : PROG.minor;
  const c = CH[prog[bar % 4]], phrase = bar % 8;
  if (sc === 'title' || sc === 'dawn') {
    if (e === 0 && bar % 2 === 0) pad(c.pad, t, beat * 8.5, sc === 'dawn' ? 0.03 : 0.028);
    if (e === 0) bass(c.walk[0], t, beat * 2, 0.26);
    if (e === 5 && sc === 'dawn' && bar % 2) keys(c.keys.slice(0, 3), t, beat * 1.5, 0.045);
  } else if (sc === 'night') {
    // drone + heartbeat; a low minor-second rub creeps in every other bar
    if (e === 0 && bar % 2 === 0) pad(Ns('D2 A2'), t, beat * 8.5, 0.04, 320);
    if (e === 0 || e === 1) kick(t + (e ? -beat * 0.2 : 0), e ? 0.16 : 0.24, 70);
    if (e === 4 && bar % 2) bass(N('Eb2'), t, beat * 2, 0.16);
    if (e === 0 && bar % 2 === 0) bass(N('D2'), t, beat * 3, 0.24);
  } else if (sc === 'day') {
    // walking bass on every beat, brushes on 2 & 4, piano on 1 and the and-of-2
    const drums = phrase < 6;
    if (e % 2 === 0) {
      const i = e / 2, nxt = CH[prog[(bar + 1) % 4]].walk[0];
      const f = i === 3 ? nxt * (Math.random() < 0.5 ? 2 ** (1 / 12) : 2 ** (-1 / 12)) : c.walk[i];   // a chromatic step into the next chord
      bass(f, t, beat * 0.9, 0.3);
      if (drums && (i === 1 || i === 3)) brush(t, 0.045, 0.2);
      if (drums && i === 0) kick(t, 0.14, 80);
    } else if (drums) brush(t, 0.02, 0.09);
    if (e === 0) keys(c.keys, t, beat * 1.2, 0.055);
    if (e === 3 && bar % 2) keys(c.keys.slice(1), t, beat * 0.6, 0.04);
  } else if (sc === 'tense') {
    // eighth-note ostinato, kick on every beat, the pad a low cluster
    const line = Ns('D2 D2 F2 D2 Eb2 D2 A1 C2');
    bass(line[e] * (bar % 4 === 3 ? 2 ** (3 / 12) : 1), t, beat * 0.45, 0.28);
    if (e % 2 === 0) kick(t, 0.2, 80);
    brush(t, e % 2 ? 0.02 : 0.035, 0.1);
    if (e === 0 && bar % 2 === 0) pad(Ns('D2 Eb2 A2'), t, beat * 8.5, 0.03, 380);
  } else if (sc === 'end') {
    if (e === 0) { pad(c.pad, t, beat * 4.4, 0.03); bass(c.walk[0], t, beat * 2.5, 0.26); keys(c.keys, t, beat * 2.5, 0.06); }
    if (e === 4) bass(c.walk[2], t, beat * 1.5, 0.2);
    if (e === 6) keys(c.keys.slice(1, 3), t, beat, 0.035);
  }
}
function pump() {
  if (!AC || !scene || AC.state !== 'running') return;
  const sc = SCENES[scene], beat = 60 / sc.bpm;
  if (nextT < AC.currentTime) nextT = AC.currentTime + 0.05;            // fell behind (tab was asleep)
  while (nextT < AC.currentTime + 0.2) {
    play(scene, step, nextT, beat);
    nextT += beat * (step % 2 === 0 ? 0.6 : 0.4);                        // swung eighths
    step++;
  }
}

// ── public ──
export const audio = {
  // call from a click/keypress: makes (or wakes) the context
  start() {
    try { if (!AC) build(); if (AC.state === 'suspended') AC.resume(); } catch { AC = null; }
  },
  // crossfade to a scene: the music dips, the pattern changes on a bar line, it swells back
  setScene(name) {
    if (!AC || name === scene) return;
    const t = AC.currentTime, sc = SCENES[name];
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setValueAtTime(musicBus.gain.value, t);
    musicBus.gain.linearRampToValueAtTime(0.0001, t + (scene ? 0.9 : 0.05));
    windGain.gain.setTargetAtTime(sc.wind, t, 1.5);
    const go = () => {
      scene = name; step = 0;
      const n = AC.currentTime; nextT = n + 0.05;
      musicBus.gain.cancelScheduledValues(n);            // drop the dip's ramp, or it lands after the swell and holds at zero
      musicBus.gain.setValueAtTime(Math.max(0.0001, musicBus.gain.value), n);
      musicBus.gain.setTargetAtTime(sc.vol, n, 0.8);
    };
    if (scene) setTimeout(go, 950); else go();
  },
  // a beat in the cold open: a low swell under the cut
  cue(kind) {
    if (!AC || muted) return;
    const t = AC.currentTime;
    if (kind === 'swell') { pad(Ns('D1 D2 A2'), t, 4.5, 0.06, 300); kick(t + 0.05, 0.28, 60); }
    if (kind === 'low') { bass(N('A1'), t, 2.5, 0.3); pad(Ns('A1 Bb2'), t, 3.5, 0.04, 300); }
  },
  // the phone vibrating on a table: a low rattle, never a ring
  buzz(n = 2) {
    if (!AC) return;
    for (let k = 0; k < n; k++) {
      const t = AC.currentTime + k * 0.32, g = AC.createGain(), lp = AC.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 380;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.2, t + 0.02);
      g.gain.setValueAtTime(0.2, t + 0.2); g.gain.linearRampToValueAtTime(0.0001, t + 0.24);
      // the rattle: its own stage (0.5 ± 0.5) after the envelope, so it never outlives it
      const rattle = AC.createGain(); rattle.gain.value = 0.5;
      lp.connect(g); g.connect(rattle); rattle.connect(sfxBus);
      const o = AC.createOscillator(); o.type = 'square'; o.frequency.value = 118;
      const am = AC.createOscillator(), amG = AC.createGain(); am.frequency.value = 31; amG.gain.value = 0.5;
      am.connect(amG); amG.connect(rattle.gain);
      o.connect(lp); o.start(t); o.stop(t + 0.26); am.start(t); am.stop(t + 0.26);
    }
  },
  // a soft wooden knock for opening a card / a talk
  knock() {
    if (!AC) return;
    const t = AC.currentTime, g = AC.createGain(); env(g, t, 0.003, 0.14, 0.12);
    const o = AC.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.16);
  },
  // the police arriving: a low two-tone 'woo-woop' (a warm swell between ~170 and ~300 Hz,
  // under a lowpass — a siren's shape without the shrill), n times
  siren(n = 4) {
    if (!AC) return;
    for (let k = 0; k < n; k++) {
      const t = AC.currentTime + k * 0.9, g = AC.createGain(), lp = AC.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.7;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11 * (0.6 + 0.4 * k / n), t + 0.08);
      g.gain.setValueAtTime(0.11 * (0.6 + 0.4 * k / n), t + 0.62); g.gain.linearRampToValueAtTime(0.0001, t + 0.82);
      lp.connect(g); g.connect(sfxBus);
      for (const det of [0, 6]) {
        const o = AC.createOscillator(); o.type = 'triangle'; o.detune.value = det;
        o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.38);
        o.frequency.exponentialRampToValueAtTime(175, t + 0.8);
        o.connect(lp); o.start(t); o.stop(t + 0.85);
      }
    }
  },
  get muted() { return muted; },
  get out() { return master; },          // dev: tap the mix (recording, analysis)
  setMuted(m) {
    muted = m;
    try { localStorage.setItem('sound', m ? 'off' : 'on'); } catch { /* fine */ }
    if (AC) master.gain.setTargetAtTime(m ? 0 : LEVEL, AC.currentTime, 0.08);
  },
};
// iOS Safari only lets audio start inside a tap: keep (re)starting it on taps and keys until it runs
const UNLOCK = ['pointerdown', 'touchend', 'keydown'];
function unlock() { audio.start(); if (AC && AC.state === 'running') for (const ev of UNLOCK) removeEventListener(ev, unlock); }
for (const ev of UNLOCK) addEventListener(ev, unlock);
// the bump voices (bump.js) share the context and the mute
export function sfxOut() { audio.start(); return AC ? { ac: AC, out: sfxBus } : null; }
