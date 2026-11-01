// ─── SOUND: the planet's own air, and music only when the story earns it ──────
// All synthesised (no files). Most of the time there is NO music — you hear the world:
//   • wind and leaves, birds by day, crickets at night, the sea when you're near it,
//     a far-off town hum and the odd car passing in the distance;
//   • your own footsteps (grass, pavement, floorboards) in time with the critic's stride;
//   • your car's engine and tyres (pitch follows the speed), the boat's motor.
// Music comes in only for story beats, as short cues (sting()):
//   clue – a new find   lead – a find that points at the culprit   wrong – Vivi isn't convinced
//   solved – the case cracked   getaway – Rex bolts
// …and three scored scenes that ARE events: the cold open's heist ('night'), the rocket
// countdown ('tense') and the epilogue ('end'). 'title', 'dawn' and 'day' are just the air.
//
// The context starts on the first click/key (browsers forbid autoplay). M or the
// sound button mutes everything, the bump voices too (they play through sfxOut()).

let AC = null, master, musicBus, ambBus, outBus, sfxBus, verbIn, noiseBuf, windGain, windLP;
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
  outBus = AC.createGain(); outBus.gain.value = 1; outBus.connect(ambBus);   // the outdoors (ducked inside a room)
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
  w.connect(windLP); windLP.connect(wMod); wMod.connect(windGain); windGain.connect(outBus);
  w.start(); lfo.start(); lfo2.start();
  buildAir();
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
  title: { bpm: 66, vol: 0.85, wind: 0.05, air: true },     // air: no score, just the world
  night: { bpm: 60, vol: 0.9, wind: 0.16 },
  dawn:  { bpm: 66, vol: 0.85, wind: 0.06, air: true },
  day:   { bpm: 84, vol: 0.85, wind: 0.035, air: true },
  tense: { bpm: 112, vol: 0.7, wind: 0.04 },
  end:   { bpm: 74, vol: 0.8, wind: 0.03 },
};
let scene = null, step = 0, nextT = 0;
// one bar = 8 swung eighths; called for each eighth just ahead of time
function play(sc, s, t, beat) {
  const bar = Math.floor(s / 8), e = s % 8, prog = sc === 'end' ? PROG.end : PROG.minor;
  const c = CH[prog[bar % 4]];
  if (sc === 'night') {
    // drone + heartbeat; a low minor-second rub creeps in every other bar
    if (e === 0 && bar % 2 === 0) pad(Ns('D2 A2'), t, beat * 8.5, 0.04, 320);
    if (e === 0 || e === 1) kick(t + (e ? -beat * 0.2 : 0), e ? 0.16 : 0.24, 70);
    if (e === 4 && bar % 2) bass(N('Eb2'), t, beat * 2, 0.16);
    if (e === 0 && bar % 2 === 0) bass(N('D2'), t, beat * 3, 0.24);
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
  if (sc.air) return;                                                   // no score: the world is the soundtrack
  if (nextT < AC.currentTime) nextT = AC.currentTime + 0.05;            // fell behind (tab was asleep)
  while (nextT < AC.currentTime + 0.2) {
    play(scene, step, nextT, beat);
    nextT += beat * (step % 2 === 0 ? 0.6 : 0.4);                        // swung eighths
    step++;
  }
}


// ── the world's own air ──
// Built once with the context. Continuous layers (leaves, town hum, sea, engine) are
// looped noise/oscillators whose gains tick() steers; birds, crickets, far cars and
// footsteps are one-shots scheduled from tick().
const air = { night: 0, water: 0, day: 1, birdT: 1.5, carT: 6, crickets: [], wc: null, mode: 'walk', leaves: null, hum: null, sea: null, seaLP: null, eng: null };
const rnd = (a, b) => a + Math.random() * (b - a);
// a voice's way out: through a pan, into the outdoors (or the sfx bus)
function panned(pan, to = outBus) {
  if (!AC.createStereoPanner) return to;
  const p = AC.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(to); return p;
}
function noiseSrc(t, len, off = Math.random() * 1.5) { const s = AC.createBufferSource(); s.buffer = noiseBuf; s.start(t, off); s.stop(t + len); return s; }
function loopNoise() { const s = AC.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random() * 1.5); return s; }
function filt(type, f, Q = 0.7) { const b = AC.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; }
function gainNode(v = 0) { const g = AC.createGain(); g.gain.value = v; return g; }

function buildAir() {
  // leaves: a soft high hiss that gusts with the wind
  { const src = loopNoise(), hp = filt('highpass', 1400), bp = filt('bandpass', 3200, 0.4), g = gainNode(0), gust = gainNode(0.6);
    const lfo = AC.createOscillator(), lg = gainNode(0.45); lfo.frequency.value = 0.11; lfo.connect(lg); lg.connect(gust.gain); lfo.start();
    src.connect(hp); hp.connect(bp); bp.connect(gust); gust.connect(g); g.connect(outBus); air.leaves = g; }
  // the town, far off: a low rumble you only notice when it stops
  { const src = loopNoise(), lp = filt('lowpass', 140, 0.5), g = gainNode(0); src.connect(lp); lp.connect(g); g.connect(outBus); air.hum = g; }
  // the sea: low surf that swells and draws back
  { const src = loopNoise(), lp = filt('lowpass', 520, 0.6), g = gainNode(0), swell = gainNode(0.55);
    const lfo = AC.createOscillator(), lg = gainNode(0.45); lfo.frequency.value = 0.13; lfo.connect(lg); lg.connect(swell.gain); lfo.start();
    const lfo2 = AC.createOscillator(), lg2 = gainNode(260); lfo2.frequency.value = 0.13; lfo2.connect(lg2); lg2.connect(lp.frequency); lfo2.start();
    src.connect(lp); lp.connect(swell); swell.connect(g); g.connect(outBus); air.sea = g; }
  // the engine (car or boat): a buzzy fundamental + a sub, putting through a firing tremolo,
  // under a lowpass that opens with the revs; tyres/hull noise beside it
  { const g = gainNode(0), lp = filt('lowpass', 380, 1.1), putt = gainNode(0.7);
    const o1 = AC.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 36;
    const o2 = AC.createOscillator(); o2.type = 'square'; o2.frequency.value = 18; const o2g = gainNode(0.5);
    const am = AC.createOscillator(); am.frequency.value = 18; const amG = gainNode(0.3); am.connect(amG); amG.connect(putt.gain);
    o1.connect(lp); o2.connect(o2g); o2g.connect(lp); lp.connect(putt); putt.connect(g); g.connect(sfxBus);
    o1.start(); o2.start(); am.start();
    const rs = loopNoise(), rlp = filt('lowpass', 300, 0.5), rg = gainNode(0); rs.connect(rlp); rlp.connect(rg); rg.connect(sfxBus);
    air.eng = { g, lp, o1, o2, am, amG, rg, rlp }; }
  for (let i = 0; i < 4; i++) air.crickets.push({ t: rnd(0, 2), per: rnd(0.55, 1.1), f: rnd(3400, 4300), pan: rnd(-0.9, 0.9), n: 2 + (i % 3) });
}

// a bird: one of a few calls, soft and a little way off
function bird(t) {
  const pan = rnd(-0.85, 0.85), out = filt('lowpass', 5200, 0.5), g = gainNode(0);
  out.connect(g); g.connect(panned(pan)); const v = rnd(0.02, 0.045);
  const kind = Math.random();
  const note = (t0, f0, f1, len, vol = v) => {
    const o = AC.createOscillator(), e = gainNode(0); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + len);
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(vol, t0 + len * 0.2); e.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(e); e.connect(out); o.start(t0); o.stop(t0 + len + 0.02);
  };
  g.gain.value = 1;
  if (kind < 0.3) {                         // a two-note whistle, sometimes answered
    const f = rnd(2200, 3000); note(t, f, f * 1.18, 0.14); note(t + 0.22, f * 1.12, f * 0.86, 0.2);
    if (Math.random() < 0.4) { note(t + 0.7, f, f * 1.18, 0.14); note(t + 0.92, f * 1.12, f * 0.86, 0.2); }
  } else if (kind < 0.55) {                 // a quick trill, falling
    const f = rnd(3000, 3800), n = 5 + (Math.random() * 6 | 0);
    for (let i = 0; i < n; i++) note(t + i * 0.055, f * (1 - i * 0.02), f * (0.94 - i * 0.02), 0.045, v * 0.8);
  } else if (kind < 0.8) {                  // a warble: chirps up and down
    const f = rnd(2400, 3400), n = 3 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++) { const up = i % 2 ? 0.85 : 1.25; note(t + i * 0.11, f, f * up, 0.08 + Math.random() * 0.04, v * rnd(0.6, 1)); }
  } else {                                  // a wood pigeon: low, breathy 'hoo-hoo, hoo'
    const f = rnd(480, 560);
    for (const [k, len] of [[0, 0.32], [0.45, 0.22], [0.75, 0.38]]) note(t + k, f * 0.92, f, len, v * 0.9);
  }
}
// a cricket: a few fast pulses of a high tone
function cricket(c, t, vol) {
  const g = gainNode(0), lp = filt('lowpass', 6000, 0.5); g.connect(lp); lp.connect(panned(c.pan));
  const o = AC.createOscillator(); o.frequency.value = c.f; o.connect(g); o.start(t); o.stop(t + c.n * 0.05 + 0.05);
  for (let i = 0; i < c.n; i++) { const p = t + i * 0.05; g.gain.setValueAtTime(0.0001, p); g.gain.linearRampToValueAtTime(vol, p + 0.008); g.gain.linearRampToValueAtTime(0.0001, p + 0.03); }
}
// a car on a road somewhere off: swells up, passes across, fades (the pitch drops as it goes)
function farCar(t, vol) {
  const len = rnd(4, 6.5), dir = Math.random() < 0.5 ? -1 : 1, mid = t + len * 0.5;
  const out = AC.createStereoPanner ? AC.createStereoPanner() : null, g = gainNode(0);
  if (out) { out.pan.setValueAtTime(-0.8 * dir, t); out.pan.linearRampToValueAtTime(0.8 * dir, t + len); g.connect(out); out.connect(outBus); } else g.connect(outBus);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, mid); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const bp = filt('bandpass', 420, 0.9); bp.frequency.setValueAtTime(520, t); bp.frequency.exponentialRampToValueAtTime(330, t + len);
  noiseSrc(t, len + 0.1).connect(bp); bp.connect(g);
  const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(rnd(52, 62), t); o.frequency.linearRampToValueAtTime(rnd(40, 46), t + len);
  const olp = filt('lowpass', 220), og = gainNode(0.35); o.connect(olp); olp.connect(og); og.connect(g); o.start(t); o.stop(t + len + 0.1);
}
// a footstep: grass (a soft crush), hard (heel and toe on stone), wood (a hollow knock)
function footstep(t, surf, vol, side) {
  const out = panned(side * 0.12, sfxBus), g = gainNode(1); g.connect(out);
  const tick = (t0, type, f, Q, len, v) => {
    const e = gainNode(0), b = filt(type, f * rnd(0.85, 1.15), Q); noiseSrc(t0, len + 0.02).connect(b); b.connect(e); e.connect(g);
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(v, t0 + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  };
  const thud = (t0, f, v, len = 0.09) => {
    const o = AC.createOscillator(), e = gainNode(0); o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * 0.55, t0 + len);
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(v, t0 + 0.005); e.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(e); e.connect(g); o.start(t0); o.stop(t0 + len + 0.02);
  };
  if (surf === 'grass') {
    tick(t, 'bandpass', 1900, 0.8, 0.11, vol * 0.5); tick(t + 0.03, 'bandpass', 2800, 1, 0.08, vol * 0.3); thud(t, 85, vol * 0.35);
  } else if (surf === 'wood') {
    thud(t, 150, vol * 0.7, 0.1); tick(t, 'bandpass', 900, 1.2, 0.05, vol * 0.3); thud(t + 0.05, 180, vol * 0.25, 0.06);
  } else {
    thud(t, 110, vol * 0.5, 0.07); tick(t, 'highpass', 1800, 0.7, 0.04, vol * 0.45); tick(t + 0.055, 'bandpass', 2600, 1.4, 0.03, vol * 0.25);
  }
}
// getting in or out of the car: a door's clunk; getting in also turns the key
function door(t) {
  const o = AC.createOscillator(), e = gainNode(0); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
  e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.25, t + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  o.connect(e); e.connect(sfxBus); o.start(t); o.stop(t + 0.2);
  const b = filt('bandpass', 1200, 1), n = gainNode(0); noiseSrc(t, 0.08).connect(b); b.connect(n); n.connect(sfxBus);
  n.gain.setValueAtTime(0.0001, t); n.gain.exponentialRampToValueAtTime(0.1, t + 0.004); n.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
}
function crank(t) {
  for (let i = 0; i < 4; i++) {
    const p = t + i * 0.11, b = filt('bandpass', 260, 2), n = gainNode(0); noiseSrc(p, 0.1).connect(b); b.connect(n); n.connect(sfxBus);
    n.gain.setValueAtTime(0.0001, p); n.gain.exponentialRampToValueAtTime(0.18, p + 0.02); n.gain.exponentialRampToValueAtTime(0.0001, p + 0.09);
  }
}

// once a frame from main.js: what's around the critic, and what she's doing
//   night 0…1, mode 'walk'|'jeep'|'boat', speed (world units/s), wc (her stride phase),
//   surface 'grass'|'hard'|'wood', water 0…1 (how near the sea is), inside (a room)
function tick(dt, w) {
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime, T = 0.4;
  const day = 1 - w.night, outside = !w.inside;
  air.night = w.night; air.day = day;
  outBus.gain.setTargetAtTime(outside ? 1 : 0.1, t, 0.5);
  air.leaves.gain.setTargetAtTime(0.02 + 0.012 * day, t, T);
  air.hum.gain.setTargetAtTime(0.05 + 0.04 * day, t, T);
  air.sea.gain.setTargetAtTime(0.14 * w.water + (w.mode === 'boat' ? 0.05 : 0), t, 0.8);
  // engine
  const E = air.eng, v = Math.abs(w.speed);
  if (w.mode !== air.mode) {
    if (w.mode === 'jeep') { door(t); crank(t + 0.25); }
    else if (air.mode === 'jeep') door(t + 0.05);
    air.mode = w.mode;
  }
  if (w.mode === 'jeep') {
    const gear = v < 4 ? v / 4 : v < 8 ? (v - 4) / 4 : (v - 8) / 3;     // three gears: the revs climb and drop back
    const rev = 0.15 + 0.85 * Math.min(1, gear) * Math.min(1, v / 2);
    E.o1.frequency.setTargetAtTime(34 + 40 * rev + 2 * v, t, 0.1); E.o2.frequency.setTargetAtTime((34 + 40 * rev + 2 * v) / 2, t, 0.1);
    E.am.frequency.setTargetAtTime((34 + 40 * rev) / 2, t, 0.1); E.amG.gain.setTargetAtTime(0.3, t, 0.2);
    E.lp.frequency.setTargetAtTime(260 + 650 * rev, t, 0.1);
    E.g.gain.setTargetAtTime(0.06 + 0.07 * rev, t, 0.15);
    E.rg.gain.setTargetAtTime(0.09 * Math.min(1, v / 9), t, 0.2); E.rlp.frequency.setTargetAtTime(220 + 40 * v, t, 0.2);
  } else if (w.mode === 'boat') {                                    // an outboard's putt-putt, and the hull through the water
    const rev = 0.2 + 0.8 * Math.min(1, v / 5.5);
    E.o1.frequency.setTargetAtTime(28 + 30 * rev, t, 0.2); E.o2.frequency.setTargetAtTime(14 + 15 * rev, t, 0.2);
    E.am.frequency.setTargetAtTime(7 + 9 * rev, t, 0.2); E.amG.gain.setTargetAtTime(0.55, t, 0.2);
    E.lp.frequency.setTargetAtTime(220 + 380 * rev, t, 0.2);
    E.g.gain.setTargetAtTime(0.05 + 0.06 * rev, t, 0.3);
    E.rg.gain.setTargetAtTime(0.1 * Math.min(1, v / 4), t, 0.3); E.rlp.frequency.setTargetAtTime(700, t, 0.3);
  } else { E.g.gain.setTargetAtTime(0, t, 0.25); E.rg.gain.setTargetAtTime(0, t, 0.2); }
  if (muted) { air.wc = w.wc; return; }                               // (nothing to hear: skip the one-shots)
  // footsteps: a foot lands each time the stride passes a half-turn
  if (w.mode === 'walk' && w.wc != null) {
    if (air.wc != null && w.speed > 0.35) {
      const a = Math.floor((air.wc - Math.PI / 2) / Math.PI), b = Math.floor((w.wc - Math.PI / 2) / Math.PI);
      if (b > a) footstep(t + 0.01, w.surface, 0.16 + 0.12 * Math.min(1, w.speed / 4.5), b % 2 ? 1 : -1);
    }
    air.wc = w.wc;
  } else air.wc = null;
  if (!outside) return;
  // birds by day (more near trees and fields than anywhere — but everywhere has some)
  air.birdT -= dt;
  if (air.birdT <= 0) { if (Math.random() < day) bird(t + 0.02); air.birdT = rnd(1.2, 4.5) / Math.max(0.3, day); }
  // crickets by night
  if (w.night > 0.15) for (const c of air.crickets) if ((c.t -= dt) <= 0) { cricket(c, t + 0.02, 0.006 * w.night); c.t = c.per * rnd(0.9, 1.1); }
  // far-off traffic
  air.carT -= dt;
  if (air.carT <= 0) { farCar(t + 0.02, 0.04 + 0.03 * day); air.carT = rnd(7, 18) * (1 + w.night * 1.5); }
}

// ── story cues: short phrases, played once, through the score's bus ──
const CUES = {
  clue(t) {                                   // something noticed: a soft rolled question
    bass(N('D2'), t, 1.4, 0.2); pad(Ns('D2 A2'), t, 2.6, 0.022, 380);
    keys([N('F3')], t + 0.05, 0.5, 0.05); keys([N('A3')], t + 0.3, 0.5, 0.045); keys(Ns('D3 G3 C4'), t + 0.6, 1.4, 0.04);
  },
  lead(t) {                                   // a find that points somewhere: darker, with a pulse under it
    kick(t, 0.2, 70); bass(N('D2'), t, 1.1, 0.26); bass(N('Bb1'), t + 0.9, 1.6, 0.26);
    pad(Ns('Bb1 F2 D3'), t + 0.85, 3.2, 0.03, 380);
    keys(Ns('A3'), t + 0.1, 0.4, 0.05); keys(Ns('Bb3'), t + 0.4, 0.5, 0.05); keys(Ns('D3 F3 A3'), t + 0.9, 1.8, 0.05);
    kick(t + 0.9, 0.16, 70);
  },
  wrong(t) {                                  // Vivi shakes her head
    bass(N('A1'), t, 1.2, 0.22); keys(Ns('Bb2 E3'), t + 0.1, 0.9, 0.035);
  },
  solved(t) {                                 // it all fits: the minor turns to major
    const b = 0.55, seq = [['Dm', 0], ['Bb', 2], ['C', 4], ['F', 6]];
    for (const [k, i] of seq) { const c = CH[k]; bass(c.walk[0], t + i * b, b * 2, 0.26); keys(c.keys, t + i * b, b * (i === 6 ? 4 : 1.6), 0.055); }
    pad(Ns('F2 C3 A3'), t + 6 * b, 4, 0.032);
    brush(t + 6 * b, 0.04, 0.6);
  },
  getaway(t) {                                // Rex bolts: the countdown's figure, once
    const line = Ns('D2 D2 F2 D2 Eb2 D2 A1 C2'), e = 60 / 112 / 2;
    for (let i = 0; i < 16; i++) { bass(line[i % 8], t + i * e, e * 0.9, 0.26); if (i % 2 === 0) kick(t + i * e, 0.18, 80); }
    pad(Ns('D2 Eb2 A2'), t, 16 * e + 0.8, 0.03, 380);
  },
};

// ── public ──
// ── a room's own air, for the walk-in shops: low and soft (no tones up high) ──
//   cosy – a fire's low crackle   hum – a lab's mains hum   reel – a projector's whirr
//   night – a slow low hush       studio – plain room tone
let room = null;
function roomTone(kind) {
  const out = AC.createGain(); out.gain.value = 0; out.connect(ambBus);
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = kind === 'night' ? 220 : 340; lp.Q.value = 0.7;
  const g = AC.createGain(); g.gain.value = kind === 'cosy' ? 0.5 : 0.35;
  src.connect(lp); lp.connect(g); g.connect(out); src.start();
  const nodes = [src];
  if (kind === 'cosy') {                          // the crackle: the noise flickers through a slow random gate
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.type = 'square'; lfo.frequency.value = 7.3; lg.gain.value = 0.25;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(); nodes.push(lfo);
  }
  if (kind === 'hum' || kind === 'reel') {        // a low tone under it: the mains, or the projector's motor
    const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = kind === 'hum' ? 55 : 72;
    const og = AC.createGain(); og.gain.value = 0.05; o.connect(og); og.connect(out); o.start(); nodes.push(o);
    if (kind === 'reel') {                        // …and the film's flutter, a slow tremble on the noise
      const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 18; lg.gain.value = 0.15;
      lfo.connect(lg); lg.connect(g.gain); lfo.start(); nodes.push(lfo);
    }
  }
  if (kind === 'night') {                         // the hush rises and falls like breathing
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.2;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(); nodes.push(lfo);
  }
  out.gain.setTargetAtTime(0.09, AC.currentTime, 0.6);
  return { out, nodes };
}

export const audio = {
  // step into (kind) or out of (null) a shop: its air fades in, the score steps back a little
  setRoom(kind) {
    if (!AC || (room && room.kind === kind) || (!room && !kind)) return;
    const t = AC.currentTime;
    if (room) { const r = room; r.out.gain.setTargetAtTime(0, t, 0.4); setTimeout(() => { for (const n of r.nodes) try { n.stop(); } catch { /* done */ } r.out.disconnect(); }, 2500); }
    room = kind ? { kind, ...roomTone(kind) } : null;
    if (scene) musicBus.gain.setTargetAtTime(SCENES[scene].vol * (kind ? 0.55 : 1), t, 0.8);
  },
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
  // a frog by the river: two low, buzzy 'rrb-bit' pulses (a square wave rattled at ~28 Hz,
  // sliding down ~120 → 80 Hz, under a dark lowpass — a croak, never a chirp)
  croak() {
    if (!AC) return;
    for (const k of [0, 0.17]) {
      const t = AC.currentTime + k, g = AC.createGain(), lp = AC.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 520;
      env(g, t, 0.01, k ? 0.11 : 0.14, 0.12);
      const rattle = AC.createGain(); rattle.gain.value = 0.55;
      const am = AC.createOscillator(), amG = AC.createGain(); am.frequency.value = 28; amG.gain.value = 0.45; am.connect(amG); amG.connect(rattle.gain);
      const o = AC.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(k ? 105 : 125, t); o.frequency.exponentialRampToValueAtTime(78, t + 0.13);
      o.connect(lp); lp.connect(g); g.connect(rattle); rattle.connect(sfxBus);
      o.start(t); o.stop(t + 0.18); am.start(t); am.stop(t + 0.18);
    }
  },
  // a soft wooden knock for opening a card / a talk
  knock() {
    if (!AC || muted) return;
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
  // a story beat's music (see CUES): the only score you hear while exploring
  sting(kind) {
    if (!AC || muted || !CUES[kind]) return;
    const t = AC.currentTime + 0.05;
    if (SCENES[scene]?.air) { musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(SCENES[scene].vol, t, 0.05); }
    CUES[kind](t);
  },
  tick,
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
