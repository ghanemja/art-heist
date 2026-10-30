// ─── THE GAME FLOW: title → cold open → the case ────────────────────────────
// The cold open follows the classic adventure-game shape: a few silent,
// letterboxed shots of the crime (≈10s, skippable), then you're in control
// with one buzz of the phone telling you why you're here. After that the game
// never explains a clue — you look, you listen, you decide.
// Act 2 (once you've named the thief): the getaway to Cape Far Side, a launch
// countdown, an ABORT button, the police, and a letterboxed epilogue.
import * as THREE from 'three';
import { R, arc, radiusAt, settle, yawToFace, nearestRoad, standAt, alignToSurface, slerpDir } from './world.js';
import { CAPE, cargoRocket, launchConsole, paintingCrate } from './buildings.js';
import { buildCar } from './player.js';
import { createPhone } from './phone.js';
import { createGuide } from './route.js';
import { buildWalkers, tickWalkers, walkerHome, WALKERS } from './crowd.js';
import { createBumps } from './bump.js';
import { CLUES, PEOPLE, SUSPECTS, PLACES, judge, buildCase, sketchProp } from './story.js';
import { paintPeople, paintThings } from './portraits.js';
import { LOOKS } from './human.js';
import { pose } from './human.js';
import { poseFolk } from './folk.js';
import { ink } from './style.js';

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => el.classList.toggle('hide', !on);

export function createGame({ scene, camera, town, player, atmosphere, renderer }) {
  const G = {
    state: 'title', t0: 0, found: new Set(), met: new Set(), talked: new Set(), solved: false, act: 1,
    ui: null, talkIdx: 0, talkWho: null, pickSus: null, pickClues: new Set(),
  };
  const items = buildCase(scene, town);
  // painted portraits + clue sketches for the UI, rendered once from the real models
  const FACE = paintPeople(renderer, LOOKS);
  const SKETCH = paintThings(renderer, Object.fromEntries(CLUES.map(c => [c.id, sketchProp(c.id) || items.find(i => i.id === c.id)?.obj])));
  const face = (id, cls = 'pt') => FACE[id] ? `<img class="${cls}" src="${FACE[id]}" alt="">` : '';
  const sketch = (id, cls = 'pt') => SKETCH[id] ? `<img class="${cls}" src="${SKETCH[id]}" alt="">` : '';
  const mus = town.museum.group;
  const ML = (x, y, z) => mus.localToWorld(new THREE.Vector3(x, y, z));

  // ── a parked jeep you can walk up to ──
  // (a level frame on the planet, with the car inside it pitched/rolled onto its four tyres)
  const parked = new THREE.Group(), parkedBody = player.bodies.jeep.clone(true);
  parked.add(parkedBody); parkedBody.visible = true;
  const seatParked = () => { parked.position.setLength(standAt(parked.position.clone().normalize())); parkedBody.position.y = 0; parkedBody.rotation.set(0, 0, 0); player.fitToGround(parkedBody, parked); };
  // beside the plaza, in view when you start — not behind you where the camera sits —
  // and ON the road, pulled in to the kerb, pointing along it (the car keeps to roads)
  let jeepSpot = town.museumFrame(5.4, 2.2), jeepFace = town.museumFrame(5.4, 12);
  {
    const nr = nearestRoad(jeepSpot);
    if (nr && nr.dist < 6) {
      const lat = new THREE.Vector3().crossVectors(nr.point, nr.tangent).normalize();
      const sg = Math.sign(lat.dot(jeepSpot.clone().sub(nr.point))) || 1;
      jeepSpot = nr.point.clone().multiplyScalar(R).addScaledVector(lat, sg * nr.half * 0.45).normalize();
      jeepFace = jeepSpot.clone().multiplyScalar(R).addScaledVector(nr.tangent, 5).normalize();
    }
  }
  settle(parked, jeepSpot, 1.0, 0, yawToFace(jeepSpot, jeepFace));
  parked.visible = true;                 // the player's car body starts hidden (you're on foot), and so did its clone
  parked.userData.noGround = true;
  scene.add(parked);
  seatParked();
  let jeepDir = jeepSpot.clone();

  // ── townsfolk out walking, and what happens when the car meets anyone ──
  const walkers = buildWalkers(scene, town);
  const bumps = createBumps({ camera, player });
  const VOICE = {
    vivi: { pitch: 380, line: 'My INSURANCE!' }, otto: { pitch: 150, line: 'I was on my BREAK!' },
    pia: { pitch: 350, line: 'Watch it — I\'m the courier here!' }, rex: { pitch: 190, line: 'Oi! Mind the paintwork!' },
  };
  for (const it of items) {
    if (it.kind !== 'person') continue;
    it.homePos = it.obj.position.clone(); it.homeQ = it.obj.quaternion.clone();
    bumps.add(it.obj, { ...VOICE[it.id], home: () => it.dir,
      onAway: () => { it.knocked = true; },
      onBack: () => { it.obj.position.copy(it.homePos); it.obj.quaternion.copy(it.homeQ); it.knocked = false; } });
  }
  for (const w of walkers) bumps.add(w.obj, { pitch: WALKERS[w.id].pitch, line: WALKERS[w.id].line,
    home: () => walkerHome(w), onAway: () => { w.paused = true; }, onBack: () => { w.paused = false; } });

  // ── title ──
  show($('loader'), false);
  show($('title'));
  $('start').onclick = () => startColdOpen();
  addEventListener('keydown', (e) => { if (e.code === 'Enter' && G.state === 'title') startColdOpen(); });

  // ── cold open: three silent shots of last night ──
  const SHOTS = [
    { dur: 3.4, cap: 'Opening night.', from: [0, 26, 42], to: [0, 18, 30], look: [0, 3, -5] },
    { dur: 3.2, cap: '3:07 a.m.', from: [7.5, 12.5, -1.0], to: [5.4, 11.2, -2.6], look: [0.9, 9.2, -6.2] },
    { dur: 3.4, cap: 'Every frame — empty.', from: [4.6, 2.0, 4.6], to: [3.5, 1.7, 3.0], look: [2.2, 1.55, 0.6] },
  ];
  const COLD = SHOTS.reduce((a, s) => a + s.dur, 0);
  function startColdOpen() {
    if (G.state !== 'title') return;
    G.state = 'cold'; G.t0 = performance.now() / 1000;
    show($('title'), false);
    document.body.classList.add('cine');
    show($('skip'));
    atmosphere.setNight(1);
    player.st.enabled = false;
  }
  $('skip').onclick = () => { if (G.state === 'cold') endColdOpen(); };
  function endColdOpen() {
    G.state = 'phone';
    document.body.classList.remove('cine');
    show($('caption'), false); show($('skip'), false);
    atmosphere.fadeTo(0, 1.6);                       // dawn breaks
    player.st.camInit = false;
    setTimeout(openPhone, 900);
  }
  // the opening brief arrives as texts on the critic's own phone: it buzzes, comes up
  // open on Messages, the editor types, and you answer "on it"
  function openPhone() {
    navigator.vibrate?.([60, 80, 60]);
    phone.open('messages');
    phone.setTyping(true);
    setTimeout(() => { phone.setTyping(false); phone.push('Editor', 'You\'re at the museum? Good. All 45 paintings went overnight. The police have nothing.'); phone.setTyping(true); }, 900);
    setTimeout(() => { phone.setTyping(false); phone.push('Editor', 'You know those canvases better than anyone. Find out who — and where they\'re going.');
      // three ways to answer; the editor answers back, then you're off
      const BACK = ['Good. Start with Director Vivi — she\'s on the museum steps.',
        'That\'s why I called you. Vivi\'s on the steps — start there.',
        'You\'re the one who reviewed every one of them. Vivi\'s waiting on the steps.'];
      phone.setReply(['on it', 'heading in now', 'why me??'], (i) => {
        if (!phone.state.open) { beginPlay(); return; }
        phone.setTyping(true);
        setTimeout(() => { phone.setTyping(false); phone.push('Editor', BACK[i] ?? BACK[0]); }, 1000);
        setTimeout(() => { phone.close(); beginPlay(); }, 3400);         // time to read the answer
      }); }, 2400);
  }
  function beginPlay() {
    G.state = 'play';
    player.st.enabled = true; player.st.playing = true;
    show($('hud')); show($('nbBtn')); show($('bagBtn')); showKeys();
    phone.state.unread = 0;
    updateGoal();
  }
  // the controls strip: always there (H hides it), and it changes when you drive
  let keysOn = true;
  function showKeys() {
    const k = (t) => `<kbd>${t}</kbd>`;
    $('hint').innerHTML = player.st.mode === 'jeep'
      ? `${k('W')}${k('S')} drive · ${k('A')}${k('D')} steer · ${k('E')} get out · scroll to zoom · ${k('C')} camera behind · ${k('H')} hide`
      : `${k('WASD')} walk · ${k('Shift')} run · ${k('E')} look / talk · ${k('N')} notebook · ${k('B')} backpack · ${k('P')} phone · drag to look · scroll to zoom · ${k('C')} camera · ${k('H')} hide`;
    show($('hint'), keysOn && G.state === 'play');
  }

  // ── what's near you, and what pressing E does ──
  let nearest = null;
  function scan() {
    nearest = null;
    if (G.state !== 'play' || G.ui || phone.busy) { show($('prompt'), false); return; }
    const here = player.st.dir;
    let best = 1e9;
    if (player.st.mode === 'walk') {
      for (const it of items) {
        if (it.knocked) continue;                    // can't chat to someone mid-air
        const lim = it.kind === 'person' ? 2.4 : 2.1;
        const d = arc(here, it.dir);
        if (d < lim && d < best) { best = d; nearest = it; }
      }
      const dj = arc(here, jeepDir);
      if (dj < 2.6 && (!nearest || dj < best)) { best = dj; nearest = { kind: 'jeep' }; }
      if (G.act === 3 && cape.console && arc(here, cape.consoleDir) < 1.9) nearest = { kind: 'console' };
      for (const lm of town.landmarks) { if (lm.decor) continue; const d = arc(here, lm.dir); if (d < 3.6 && d < best) { best = d; nearest = { kind: 'project', lm }; } }
    } else nearest = { kind: 'exit' };
    const pr = $('prompt');
    if (!nearest) { show(pr, false); return; }
    const label = nearest.kind === 'person' ? `talk to ${PEOPLE.find(p => p.id === nearest.id).name.split(',')[0]}`
      : nearest.kind === 'jeep' ? 'get in the car' : nearest.kind === 'exit' ? 'get out'
      : nearest.kind === 'console' ? 'ABORT THE LAUNCH' : nearest.kind === 'project' ? `visit ${nearest.lm.name}` : 'look closer';
    pr.innerHTML = `<kbd>E</kbd>${label}`;
    show(pr);
  }
  $('prompt').onclick = () => act();
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') act();
    if (e.code === 'Escape') closeUI();
    if (e.code === 'KeyN' && G.state === 'play') toggleNotebook();
    if (e.code === 'KeyH' && G.state === 'play') { keysOn = !keysOn; showKeys(); }
  });
  function act() {
    if (G.state !== 'play' || phone.busy) return;
    if (G.ui === 'card') { closeUI(); return; }
    if (G.ui === 'talk') { nextLine(); return; }
    if (G.ui) return;
    if (!nearest) return;
    if (nearest.kind === 'clue') return openClue(nearest);
    if (nearest.kind === 'person') return openTalk(nearest.id);
    if (nearest.kind === 'console') return abortLaunch();
    if (nearest.kind === 'project') return openProject(nearest.lm);
    if (nearest.kind === 'jeep') { parked.visible = false; player.setMode('jeep'); player.st.heading = new THREE.Vector3(0, 0, 1).applyQuaternion(parked.quaternion); player.st.camFwd.copy(player.st.heading); showKeys(); renderCase(); return; }
    if (nearest.kind === 'exit') {
      player.setMode('walk');
      jeepDir = player.st.dir.clone();
      parked.position.copy(player.root.position); parked.quaternion.copy(player.root.quaternion); parked.visible = true; seatParked();
      // step out beside the car
      const side = new THREE.Vector3().crossVectors(player.st.dir, player.st.heading).normalize();
      player.st.dir.multiplyScalar(40).addScaledVector(side, 1.6).normalize();
      showKeys(); renderCase();
    }
  }
  function closeUI() {
    if (!G.ui) return;
    if (player.st.camHook === convoCam) { player.st.camHook = null; player.st.camInit = false; }
    show($({ card: 'card', talk: 'talk', nb: 'nb', proj: 'card' }[G.ui]), false);
    const was = G.ui;
    G.ui = null; player.st.enabled = true;
    if (was === 'nb' && G.solved && G.act === 1) startGetaway();
  }

  // ── a found thing ──
  function openClue(it) {
    const c = CLUES.find(c => c.id === it.id);
    const isNew = !G.found.has(c.id);
    G.found.add(c.id);
    if (it.glint) it.glint.visible = false;
    if (isNew) {
      if (G.found.size === 1) setTimeout(() => phone.push('Mum', 'saw the museum on the news!! are you safe?? are you eating??'), 2500);
      if (c.id === 'van') setTimeout(() => phone.push('Editor', 'FRAME & CO.? Isn\'t that the framer who hung the whole show?'), 2000);
      if (c.id === 'ticket') phone.addItem('ticket');
      if (G.found.size === 4) setTimeout(() => phone.push('Editor', 'When you\'re sure, take it to Vivi — the police will listen to her. Name a name, show two things.'), 2500);
    }
    $('card').innerHTML = `<div class="ic">${sketch(c.id)}</div><h3>${c.title}</h3><p>${c.text}</p>
      <div class="note">${isNew ? 'noted in your notebook' : 'already in your notebook'}</div><button class="sk" id="cardOk">ok</button>`;
    show($('card')); G.ui = 'card'; player.st.enabled = false;
    $('cardOk').onclick = closeUI;
    updateGoal();
  }
  // ── someone talks ──
  // a conversation is framed like one: both of you, side-on, at eye level
  const conv = { pos: new THREE.Vector3(), look: new THREE.Vector3(), init: false, side: 1 };
  const _cv = new THREE.Vector3();
  // where the talk camera sits: off to one side of the pair, swung round by `sw` radians
  const _rc = new THREE.Raycaster(); _rc.camera = camera;
  function convoSpot(mid, up, ab, dist, sg, sw) {
    const side = new THREE.Vector3().crossVectors(up, ab).normalize().multiplyScalar(sg);
    const off = side.multiplyScalar(2.5 + dist * 0.6).addScaledVector(ab, -0.45).applyAxisAngle(up, sw * sg);
    return mid.clone().add(off).addScaledVector(up, 1.05);
  }
  function convoCam(cam, root) {
    const it = items.find(i => i.id === G.talkWho?.id); if (!it) return;
    const a = root.position, b = it.obj.position;
    const mid = a.clone().add(b).multiplyScalar(0.5), up = mid.clone().normalize();
    const ab = b.clone().sub(a).projectOnPlane(up); const dist = ab.length(); ab.normalize();
    const want = convoSpot(mid, up, ab, dist, conv.side, conv.swing || 0);
    const look = mid.clone().addScaledVector(up, 0.72);
    const now = performance.now() / 1000, dt = conv.init ? Math.min(0.1, now - conv.t) : 0; conv.t = now;
    if (!conv.init) { conv.pos.copy(conv.cut ? want : cam.position); conv.look.copy(look); conv.init = true; }
    conv.pos.lerp(want, 1 - Math.exp(-3.5 * dt)); conv.look.lerp(look, 1 - Math.exp(-6 * dt));
    cam.position.copy(conv.pos); cam.up.copy(up); cam.lookAt(conv.look);
  }
  function startConvo(it) {
    // face them, and put the camera on whichever side isn't inside a building
    const st = player.st, d = it.dir.clone();
    st.heading = d.sub(st.dir.clone().multiplyScalar(st.dir.dot(d))).normalize();
    const mid = player.root.position.clone().add(it.obj.position).multiplyScalar(0.5), up = mid.clone().normalize();
    const ab = it.obj.position.clone().sub(player.root.position).projectOnPlane(up).normalize();
    // try each side and a few swings round the pair; take the first view nothing stands in
    const dist = it.obj.position.clone().sub(player.root.position).projectOnPlane(up).length(), look = mid.clone().addScaledVector(up, 0.72);
    const skip = new Set([player.root, it.obj]);
    // the whole shot must be clear, not just its centre: both of you head to foot, and the
    // edges of the frame either side and above — nothing may stand between them and the camera
    const pa = player.root.position, pb = it.obj.position;
    const at = (p, h) => p.clone().addScaledVector(up, h);
    const targets = [look, at(pa, 1.1), at(pb, 1.1), at(pa, 0.2), at(pb, 0.2), look.clone().addScaledVector(ab, 1.7), look.clone().addScaledVector(ab, -1.7), at(mid, 1.6), at(mid, 0.05)];
    const blocked = (from, to) => {
      const dv = to.clone().sub(from), L = dv.length();
      _rc.set(from, dv.normalize()); _rc.far = Math.max(0.01, L - 0.15);
      return _rc.intersectObjects(scene.children, true).some(h => { const o = h.object; if (!o.visible || o.userData.isInk || o.isSprite || o.name === 'planet' || o.name === 'sea' || o.userData.noInk && o.material?.transparent) return false;
        for (let q = o; q; q = q.parent) if (skip.has(q)) return false; return true; });
    };
    const clear = (p) => !targets.some(t => blocked(p, t));
    const sides = it.id === 'otto' ? [-1, 1] : [1, -1];                  // Otto: from the road side, away from the easels
    conv.side = sides[0]; conv.swing = 0;
    outer: for (const sw of [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2, 1.5, -1.5]) for (const sg of sides) {
      if (clear(convoSpot(mid, up, ab, dist, sg, sw))) { conv.side = sg; conv.swing = sw; break outer; }
    }
    // if gliding there would pass through something (an easel, a wall), cut straight to it
    { const want = convoSpot(mid, up, ab, dist, conv.side, conv.swing), dv = want.clone().sub(camera.position), L = dv.length();
      _rc.set(camera.position, dv.normalize()); _rc.far = L;
      conv.cut = _rc.intersectObjects(scene.children, true).some(h => h.object.visible && !h.object.userData.isInk && !h.object.isSprite && h.object.name !== 'planet' && h.object.name !== 'sea'); }
    conv.init = false;
    player.st.camHook = convoCam;
  }
  const REX_CAPE = { id: 'rex', name: 'Rex, framer', lines: [
    'Persistent, aren\'t you. Forty-five canvases, one rocket, and a very private collector on the far side of nowhere.',
    'Frames are my life\'s work, you know. Nobody ever looks at the frames.',
    'And you can\'t stop it — the count\'s already running. Ta-ra!'] };
  const REX_CAUGHT = { id: 'rex', name: 'Rex, framer', lines: ['I\'m not coming down.', '…Is there such a thing as a lawyer on the far side?'] };
  function openTalk(id) {
    G.talkWho = id === 'rex' && G.act === 2 ? REX_CAPE : id === 'rex' && G.act >= 4 ? REX_CAUGHT : PEOPLE.find(p => p.id === id); G.talkIdx = 0;
    startConvo(items.find(i => i.id === id));
    G.met.add(id);
    const it = items.find(i => i.id === id); if (it?.glint) it.glint.visible = false;
    G.ui = 'talk'; player.st.enabled = false;
    renderTalk();
  }
  function renderTalk() {
    const p = G.talkWho, last = G.talkIdx >= p.lines.length - 1;
    const canAccuseHere = p.id === 'vivi' && canAccuse();
    $('talk').innerHTML = `<div class="face">${face(p.id)}</div><div><b>${p.name}</b><p>${p.lines[G.talkIdx]}</p>
      <div class="row">${canAccuseHere && last ? '<button class="sk" id="tAcc">I know who did it</button>' : ''}<button class="sk" id="tNext">${last ? 'bye' : 'go on'}</button></div></div>`;
    show($('talk'));
    $('tNext').onclick = nextLine;
    if ($('tAcc')) $('tAcc').onclick = () => { closeUI(); openNotebook(true); };
  }
  function nextLine() {
    const p = G.talkWho;
    if (G.talkIdx < p.lines.length - 1) { G.talkIdx++; renderTalk(); return; }
    G.talked.add(p.id);
    closeUI(); updateGoal();
    if (p === REX_CAPE) startCountdown();
    else if (p.id === 'vivi' && G.talked.size === 1) setTimeout(() => phone.push('Editor', 'Three people with keys or reasons. Talk to all three — and look at everything twice.'), 1500);
  }

  // ── the notebook: what you saw, who you met, and (with Vivi) your case ──
  $('nbBtn').onclick = () => toggleNotebook();
  function toggleNotebook() { if (G.ui === 'nb') closeUI(); else if (!G.ui) openNotebook(false); }
  function openNotebook(accusing) {
    G.ui = 'nb'; player.st.enabled = false;
    const notes = CLUES.filter(c => G.found.has(c.id));
    const people = PEOPLE.filter(p => G.met.has(p.id));
    const li = (c) => `<li class="${accusing ? 'pick' : ''} ${G.pickClues.has(c.id) ? 'on' : ''}" data-id="${c.id}"><span class="i">${sketch(c.id, 'pt sm')}</span><span><b>${c.title}.</b> ${c.text}</span></li>`;
    $('nb').innerHTML = `<button class="sk x" id="nbX">close</button><h2>${accusing ? 'Make your case' : 'Notebook'}</h2>
      ${accusing ? `<p>Who did it?</p><div class="who">${Object.entries(SUSPECTS).map(([k, s]) => `<button class="sk ${G.pickSus === k ? 'on' : ''}" data-s="${k}">${face(k, 'pt xs')} ${s.name}</button>`).join('')}</div>
        <p>Pick the two things you found that prove it:</p>` : '<p><b>Things I noticed</b></p>'}
      <ul>${notes.length ? notes.map(li).join('') : '<li class="empty">nothing yet — walk up to anything that catches your eye</li>'}</ul>
      ${accusing ? `<button class="sk" id="nbGo" ${G.pickSus && G.pickClues.size === 2 ? '' : 'disabled style="opacity:.5"'}>show Vivi</button><div id="nbV"></div>`
        : `<p><b>People</b></p><ul>${people.length ? people.map(p => `<li><span class="i">${face(p.id, 'pt sm')}</span><span><b>${p.name}.</b> ${p.lines[p.lines.length - 1]}</span></li>`).join('') : '<li class="empty">no one yet</li>'}</ul>
        ${canAccuse() ? '<button class="sk case" id="nbCase">make your case</button>' : ''}`}`;
    show($('nb'));
    $('nbX').onclick = closeUI;
    if ($('nbCase')) $('nbCase').onclick = () => openNotebook(true);
    if (accusing) {
      $('nb').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { G.pickSus = b.dataset.s; openNotebook(true); });
      $('nb').querySelectorAll('li.pick').forEach(l => l.onclick = () => {
        const id = l.dataset.id;
        if (G.pickClues.has(id)) G.pickClues.delete(id); else if (G.pickClues.size < 2) G.pickClues.add(id);
        openNotebook(true);
      });
      const go = $('nbGo');
      if (go && !go.disabled) go.onclick = () => {
        const v = judge(G.pickSus, [...G.pickClues]);
        $('nbV').innerHTML = `<div class="verdict sk">${v.text}</div>` +
          (v.ok ? `<button class="sk next" id="nbOn">great work — now head to Cape Far Side →</button>` : '');
        if (v.ok) { G.solved = true; G.track = null; updateGoal(); $('nbOn').onclick = closeUI; $('nbOn').scrollIntoView({ block: 'nearest' }); }
      };
    }
  }

  // ── the case board: where you are in the story, who's left, where to look ──
  // It says WHERE things are, never what they mean: finds are counted per place.
  const canAccuse = () => G.talked.has('vivi') && G.found.size >= 2 && !G.solved;
  const WHERE = { vivi: 'on the museum steps', otto: 'by the guard booth beside the museum steps', pia: 'outside Bean There Café, Main Street', rex: 'by his van at Frame & Co., Main Street' };
  const placeDir = {
    museum: town.museum.dir, main: town.townAt([2, 0]), harbour: town.sites.harbour.dir, station: town.sites.station.dir,
    mall: town.mall.dir, cape: town.cape.dir,
  };
  const PLACE_NAME = { ...Object.fromEntries(PLACES.map(p => [p.id, p.name])), mall: 'Maple Plaza', cape: 'Cape Far Side' };
  const personIt = (id) => items.find(i => i.kind === 'person' && i.id === id);
  const placeCount = (pl) => { const all = CLUES.filter(c => c.where === pl); return [all.filter(c => G.found.has(c.id)).length, all.length]; };
  function targetOf(key) {
    const [kind, id] = key.split(':');
    if (kind === 'person') { const it = personIt(id); return it && { dir: it.dir, label: PEOPLE.find(p => p.id === id).name.split(',')[0], near: 2.4, h: 2.75, done: G.act === 1 && G.talked.has(id) && id !== 'vivi' }; }
    if (kind === 'place') { const [n, t] = placeCount(id); return { dir: placeDir[id], label: PLACE_NAME[id], near: id === 'main' ? 6 : id === 'cape' ? 7 : 5, h: 3.2, done: t > 0 && n >= t && G.act === 1 }; }
    if (kind === 'car') return player.st.mode === 'walk' ? { dir: jeepDir, label: 'your car', near: 2.6, h: 1.8, done: false } : null;
    if (kind === 'console') return cape.consoleDir && { dir: cape.consoleDir, label: 'launch console', near: 1.6, h: 2.0, done: G.act !== 3 };
    if (kind === 'lm') { const lm = town.landmarks.find(l => l.key === id); return lm && { dir: lm.dir, label: lm.name, near: 3.5, h: 5.5, done: false }; }
    return null;
  }
  // what the arrow points at: what you picked on the board, or the next lead
  function currentTarget() {
    if (G.act === 3) return targetOf('console');
    if (G.track) { const t = targetOf(G.track); if (t && !t.done) return t; G.track = null; }
    if (G.act === 2) return targetOf('place:cape');
    if (G.act >= 4) return null;
    if (!G.talked.has('vivi')) return targetOf('person:vivi');
    for (const id of ['otto', 'pia', 'rex']) if (!G.talked.has(id)) return targetOf('person:' + id);
    if (canAccuse() && G.found.size >= 4) return targetOf('person:vivi');
    for (const pl of PLACES) { const t = targetOf('place:' + pl.id); if (!t.done) return t; }
    return targetOf('person:vivi');
  }
  function updateGoal() {
    $('nbCount').textContent = G.found.size;
    renderCase();
  }
  // the case board's tab: fold it down to its title + the current step, and remember it
  {
    // folded by default on a phone (it covers a third of a portrait screen); a choice sticks
    let min = innerWidth < 700 || innerHeight < 500; try { const v = localStorage.getItem('caseMin'); if (v) min = v === '1'; } catch {}
    const apply = () => { $('hud').classList.toggle('min', min); const b = $('caseTog'); b.textContent = min ? '+' : '–'; b.title = min ? 'expand' : 'minimize'; };
    $('caseTog').onclick = (e) => { e.stopPropagation(); min = !min; try { localStorage.setItem('caseMin', min ? '1' : '0'); } catch {} apply(); };
    apply();
  }
  function renderCase() {
    const el = $('case'), auto = currentTarget();
    const row = (key, html, done = false) => {
      const t = targetOf(key), on = t && auto && t.dir === auto.dir && !done;
      return `<div class="cr ${done ? 'done' : ''} ${on ? 'on' : ''}" data-k="${key}">${html}</div>`;
    };
    let h = '';
    if (G.act >= 4) {
      h = `<div class="st go">Case closed ✓</div><p>All 45 paintings are going home. Rex is going somewhere else.</p>` +
        `<div class="st">Janelle's projects</div><p>The buildings around town are her real work — walk up and press <kbd>E</kbd>.</p>` +
        town.landmarks.filter(lm => !lm.decor).map(lm => row('lm:' + lm.key, `<i>›</i> ${lm.name} <span class="ct">${lm.tag}</span>`)).join('');
    } else if (G.act === 3) {
      h = `<div class="st go">5 · ABORT the launch!</div>` + row('console', `<i>›</i> the launch console — run!`) +
        `<p>Rex is up the gantry. The console's by the road — press <kbd>E</kbd> at it.</p>`;
    } else if (G.act === 2) {
      const there = arc(player.st.dir, town.cape.dir) < 12;
      h = `<div class="st go">4 · Stop the launch at Cape Far Side</div>` +
        row('place:cape', `<i>›</i> Cape Far Side — ${there ? 'find Rex by the crates' : 'the long road round the planet'}`) +
        `<p>${there ? 'Walk up to Rex and press <kbd>E</kbd>.' : 'Take your car — it\'s a long way round. Follow the arrow.'}</p>`;
    } else if (!G.talked.has('vivi')) {
      h = `<div class="st">1 · Find Director Vivi</div>` + row('person:vivi', `<i>›</i>${face('vivi', 'pt xs')} Vivi — ${WHERE.vivi}`) +
        `<p>Follow the arrow. Walk up to her and press <kbd>E</kbd>.</p>`;
    } else {
      h = `<div class="st">2 · Question the three</div>` +
        ['otto', 'pia', 'rex'].map(id => row('person:' + id, `<i>${G.talked.has(id) ? '✓' : '›'}</i>${face(id, 'pt xs')} ${PEOPLE.find(p => p.id === id).name.split(',')[0]} — ${WHERE[id]}`, G.talked.has(id))).join('') +
        `<div class="st">Look around · ${G.found.size} of ${CLUES.length} noticed</div>` +
        PLACES.map(pl => { const [n, t] = placeCount(pl.id); return row('place:' + pl.id, `<i>${n >= t ? '✓' : '›'}</i> ${pl.name} <span class="ct">${n}/${t}</span>`, n >= t); }).join('') +
        (canAccuse()
          ? `<div class="st go">3 · Name the thief</div><p>Tell Vivi — or open your notebook (<kbd>N</kbd>) → make your case. You need a suspect and two things that prove it.</p>`
          : `<p class="soft">Glints mark things worth a closer look. Find two that point at someone.</p>`);
    }
    if (G.act !== 3 && player.st.mode === 'walk') h += row('car', `<i>›</i> your car — <kbd>E</kbd> to drive`);
    if (G.act !== 3) h += `<p class="soft">click a line to follow it · <kbd>P</kbd> phone map</p>`;
    el.innerHTML = h;
    // folded: just the step you're on
    const tmp = document.createElement('div'); tmp.innerHTML = h; const st = [...tmp.querySelectorAll('.st')].find(x => !x.closest('.done')) || tmp.querySelector('.st');
    $('caseMini').textContent = st ? st.textContent.replace(/\s+/g, ' ').trim() : '';
    el.querySelectorAll('.cr').forEach(r => r.onclick = () => { G.track = r.dataset.k; renderCase(); });
  }

  // ── the waypoint: a sketched pin over your lead, or an arrow at the edge ──
  const guide = createGuide({ scene, player });                  // driving: corner map + arrows on the road
  const way = $('way'), _wp = new THREE.Vector3(), _pc = new THREE.Vector3();
  let wayKey = '';
  function updateWaypoint(dt = 0, time = 0) {
    const t = G.state === 'play' && !G.ui ? currentTarget() : null;
    guide.update(dt, time, t);
    const dist = t ? arc(player.st.dir, t.dir) : 0;
    if (!t || dist < t.near) { show(way, false); return; }
    _wp.copy(t.dir).multiplyScalar(radiusAt(t.dir) + t.h);
    _pc.copy(_wp).applyMatrix4(camera.matrixWorldInverse);
    const v = _wp.clone().project(camera);
    const W = innerWidth, H = innerHeight, m = 54;
    let x, y, ang;
    if (_pc.z < 0 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.88) {
      x = (v.x * 0.5 + 0.5) * W; y = (-v.y * 0.5 + 0.5) * H; ang = 90;               // over it, pointing down
    } else {
      let dx = _pc.x, dy = -_pc.y;
      if (_pc.z > 0) dy = Math.abs(dy) + _pc.z;                                        // behind you: toward the bottom edge
      const a = Math.atan2(dy, dx), c = Math.cos(a), s2 = Math.sin(a);
      const k = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(c)), (H / 2 - m) / Math.max(1e-3, Math.abs(s2)));
      x = W / 2 + c * k; y = H / 2 + s2 * k; ang = a * 180 / Math.PI;
    }
    way.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    way.firstElementChild.style.transform = `translate(-50%, -50%) rotate(${ang.toFixed(1)}deg)`;
    const label = `${t.label} · ${Math.round(dist * 1.5)} m`;
    if (label !== wayKey) { way.lastElementChild.textContent = label; wayKey = label; }
    // keep the label on screen at the edges: hang it inward from the arrow
    const lb = way.lastElementChild.style;
    lb.transform = `translateX(${x > W - 150 ? -100 : x < 150 ? 0 : -50}%)`;
    lb.top = y > H - 90 ? '-52px' : '26px';
    show(way);
  }

  // ── the phone, in the backpack ──
  const phone = createPhone({ town, player, camera,
    places: () => ['museum', 'main', 'station', 'harbour', 'mall', 'cape'].map(id => ({ key: 'place:' + id, name: PLACE_NAME[id], dir: placeDir[id] })),
    onTrack: (k) => { G.track = k; renderCase(); },
    openNotebook: () => { if (!G.ui) openNotebook(false); },
    isTracked: (k) => { const a = currentTarget(), t = targetOf(k); return !!(a && t && a.dir === t.dir); } });
  phone.setCar(() => jeepDir);
  const placeName = () => {
    let best = 'somewhere on the planet', bd = 9;
    for (const [id, d] of Object.entries(placeDir)) { const a = arc(player.st.dir, d); if (a < bd) { bd = a; best = PLACE_NAME[id]; } }
    return best;
  };

  // ── a project building: what it is, and a link to the real thing ──
  function openProject(lm) {
    const link = lm.url ? `<a class="sk btn" href="${lm.url}" target="_blank" rel="noopener">open ${lm.name} ↗</a>`
      : lm.enter ? `<a class="sk btn" href="${lm.enter}">step inside ↗</a>` : '<p class="note">coming soon</p>';
    $('card').innerHTML = `<h3>${lm.name}</h3><p class="tag">${lm.tag}</p><p>${lm.desc}</p><div class="row">${link}<button class="sk" id="cardOk">back</button></div>`;
    show($('card')); G.ui = 'proj'; player.st.enabled = false;
    $('cardOk').onclick = closeUI;
  }

  // ── ACT 2: the getaway to Cape Far Side ─────────────────────────────────────
  // The moving parts are built at load (hidden until needed) so nothing hitches.
  const UPV = new THREE.Vector3(0, 1, 0);
  const CL = (x, y, z) => town.cape.root.localToWorld(new THREE.Vector3(x, y, z));
  const capeDir = (x, z) => town.cape.at(x, z);
  // put an object on the site in its own frame: local (x, z), turned ry about the up axis
  const capeAttach = (obj, x, z, ry = 0, lift = 0) => {
    obj.position.copy(CL(x, lift, z));
    obj.quaternion.copy(town.cape.root.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(UPV, ry));
  };
  const cape = { count: 0, hopT: -1, puffs: [], crates: [], lidT: -1, policeT: -1, shown: -1 };
  {
    const [rx, , rz] = CAPE.rocket, [cx, , cz] = CAPE.console, ry = Math.atan2(cx - rx, cz - rz);
    cape.rocket = cargoRocket(); capeAttach(cape.rocket, rx, rz, 0, 0.16); scene.add(cape.rocket);
    cape.rocketPos = cape.rocket.position.clone(); cape.up = cape.rocketPos.clone().normalize();
    cape.console = launchConsole(); capeAttach(cape.console, cx, cz, ry); scene.add(cape.console);
    // the operator's spot is on the road side of the desk, facing the rocket
    cape.consoleDir = CL(cx + Math.sin(ry) * 0.75, 0, cz + Math.cos(ry) * 0.75).normalize();
    for (let i = 0; i < 3; i++) {
      const c = paintingCrate(i); capeAttach(c, CAPE.crates[0] - 1.15 + i * 1.15, CAPE.crates[2] + (i % 2) * 0.12, 0.08 * (i - 1)); scene.add(c); cape.crates.push(c);
    }
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xf3eee4, transparent: true, opacity: 0.85, depthWrite: false }));
      m.visible = false; m.userData.noInk = true; scene.add(m);
      cape.puffs.push({ m, t: 1 + i / 16, seed: i * 1.7 });
    }
    // the police: a convoy of three, each a level frame with the car inside it, so its wheels
    // can be seated on the ground under them (the site isn't flat) — like your parked car
    cape.police = [[1.6, 5.2, Math.PI, 0], [3.9, 6.1, Math.PI + 0.45, 0.6], [-0.9, 6.8, Math.PI - 0.35, 1.2]].map(([x, z, ry, delay]) => {
      const frame = new THREE.Group(), body = buildCar({ body: 0xf3eee4, police: true });
      frame.add(body); frame.visible = false; frame.userData.noGround = true; scene.add(frame);
      return { frame, body, x, z, ry, delay, lights: body.userData.lights };
    });
  }
  // move a story thing (and its collider and glint) to a spot at the cape
  function relocate(it, x, z, faceX, faceZ) {
    const old = it.dir.clone(), d = capeDir(x, z);
    for (const c of town.colliders) if (arc(c.dir, old) < 0.05) c.dir.copy(d);
    it.dir.copy(d);
    it.obj.position.copy(d).multiplyScalar(standAt(d));
    alignToSurface(it.obj, d, yawToFace(d, capeDir(faceX, faceZ)));
    it.homePos = it.obj.position.clone(); it.homeQ = it.obj.quaternion.clone();
    if (it.glint) it.glint.position.copy(d).multiplyScalar(standAt(d) + (it.kind === 'person' ? 1.75 : it.id === 'van' ? 2.3 : 1.6));
  }
  function startGetaway() {
    G.act = 2; G.track = null;
    const rex = personIt('rex'), van = items.find(i => i.id === 'van');
    relocate(rex, CAPE.rex[0], CAPE.rex[2], CAPE.rex[0], CAPE.rex[2] + 5);
    if (rex.glint) rex.glint.visible = true;
    if (van) relocate(van, CAPE.van[0], CAPE.van[2], CAPE.rocket[0], CAPE.rocket[2]);
    atmosphere.fadeTo(0.5, 40);                                  // dusk falls on the way
    phone.push('Editor', 'Vivi\'s called it in — police are forty minutes out. Rex\'s van just tore out of town. There\'s a cargo launch from CAPE FAR SIDE at nine. The coast road goes all the way round. GO.');
    setTimeout(() => phone.push('Vivi', 'Take your car. And please — bring them home.'), 4000);
    setTimeout(() => phone.push('Mum', 'why is there a ROCKET on the local news'), 14000);
    G.track = 'place:cape';
    updateGoal();
    // say it plainly, in the middle of the screen: where to go next, and how
    $('card').innerHTML = `<div class="ic">${face('vivi')}</div><h3>Now head to Cape Far Side</h3>
      <p>“Great work. Rex has the paintings — his van just tore out of town. There's a cargo launch from <b>Cape Far Side</b> at nine.”</p>
      <p class="note">Take your car (press <kbd>E</kbd> by it) and follow the arrow — the coast road goes all the way round the planet.</p>
      <div class="row"><button class="sk next" id="cardOk">let's go →</button></div>`;
    show($('card')); G.ui = 'card'; player.st.enabled = false;
    $('cardOk').onclick = closeUI;
  }
  // Rex bolts up the gantry; the countdown starts; the rocket rumbles
  function startCountdown() {
    G.act = 3; cape.count = 60; cape.shown = -1;
    const rex = personIt('rex'), b = bumps.body(rex.obj);
    if (b) b.immune = true;
    rex.fleeing = { phase: 'run', y: 0 };
    if (rex.glint) rex.glint.visible = false;
    show($('timer'));
    phone.push('Editor', 'Is that a ROCKET?! Stop it!!');
    updateGoal();
  }
  const GANTRY_FOOT = () => capeDir(CAPE.gantry[0] + 0.95, CAPE.gantry[2]);
  function tickRex(dt) {
    const rex = personIt('rex'), F = rex.fleeing; if (!F) return;
    const h = rex.obj.userData.human;
    if (F.phase === 'run') {
      const to = GANTRY_FOOT(), d = arc(rex.dir, to);
      if (d < 0.08) { F.phase = 'climb'; rex.dir.copy(to); }
      else rex.dir.copy(slerpDir(rex.dir, to, Math.min(1, 3.4 * dt / d)));
      rex.obj.position.copy(rex.dir).multiplyScalar(standAt(rex.dir));
      alignToSurface(rex.obj, rex.dir, yawToFace(rex.dir, to));
      if (h) poseFolk(h, dt, 1);
    } else if (F.phase === 'climb') {
      F.y = Math.min(CAPE.gantryTop + 0.04, F.y + 1.5 * dt);
      rex.obj.position.copy(rex.dir).multiplyScalar(standAt(rex.dir) + F.y);
      alignToSurface(rex.obj, rex.dir, yawToFace(rex.dir, capeDir(CAPE.gantry[0], CAPE.gantry[2])));
      if (h) poseFolk(h, dt, 0.9);
      if (F.y >= CAPE.gantryTop + 0.04) {                      // on the platform: step in, turn, gloat
        F.phase = 'top';
        const top = capeDir(CAPE.gantry[0], CAPE.gantry[2]);
        rex.obj.position.copy(top).multiplyScalar(standAt(top) + CAPE.gantryTop + 0.04);
        alignToSurface(rex.obj, top, yawToFace(top, capeDir(CAPE.rocket[0] + 4, CAPE.rocket[2] + 6)));
        rex.homePos = rex.obj.position.clone(); rex.homeQ = rex.obj.quaternion.clone();
        bumps.say(rex.obj, 'Toodle-oo!', 2.0, 'yell');
      }
    } else if (h) poseFolk(h, dt, 0, { talk: 0.6 });
  }
  function tickCape(dt, t) {
    if (G.act < 2) return;
    tickRex(dt);
    const R0 = cape.rocketPos, up = cape.up;
    if (G.act === 3) {
      cape.count -= dt;
      const n = Math.max(0, Math.ceil(cape.count));
      if (n !== cape.shown && cape.hopT < 0) {
        cape.shown = n;
        cape.console.userData.draw(`T-${String(n).padStart(2, '0')}`, n <= 10 ? '#f2a07a' : '#7fe0a8');
        $('timer').textContent = `LAUNCH IN ${n}`;
      }
      if (cape.count <= 0 && cape.hopT < 0) hop();
    }
    // the rocket: rumbles harder as the count runs down; hops if it hits zero
    let lift = 0, shake = 0;
    if (G.act === 3) shake = 0.012 + 0.05 * (1 - Math.min(1, cape.count / 60));
    if (cape.hopT >= 0) {
      cape.hopT += dt;
      const k = cape.hopT / 2.4;
      lift = 1.6 * Math.sin(Math.PI * Math.min(1, k)); shake = 0.08;
      if (k >= 1) { cape.hopT = -1; cape.count = 30; cape.shown = -1; }
    }
    cape.rocket.position.copy(R0).addScaledVector(up, lift);
    if (shake) cape.rocket.position.add(new THREE.Vector3(Math.sin(t * 61) * shake, Math.sin(t * 53) * shake, Math.sin(t * 47) * shake).projectOnPlane(up));
    // smoke: puffs roll out from the base while it's live
    const live = G.act === 3;
    for (const P of cape.puffs) {
      P.t += dt * (0.55 + (cape.hopT >= 0 ? 1.2 : 0));
      if (P.t > 1) { if (!live) { P.m.visible = false; continue; } P.t -= 1; P.a = P.seed + t; }
      if (!live && !P.m.visible) continue;
      const k = P.t, a = P.a ?? P.seed, r = 0.5 + 2.2 * k;
      const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).applyQuaternion(town.cape.root.quaternion);
      P.m.position.copy(R0).addScaledVector(side, r).addScaledVector(up, 0.25 + 0.9 * k * k);
      P.m.scale.setScalar(0.35 + 0.9 * k);
      P.m.material.opacity = 0.85 * (1 - k);
      P.m.visible = true;
    }
    // police lights, and the car rolling up the road
    if (cape.policeT >= 0) {
      cape.policeT += dt;
      cape.police.forEach((P, i) => {
        const k = THREE.MathUtils.clamp((cape.policeT - P.delay) / 2.5, 0, 1);
        if (k <= 0) return;
        P.frame.visible = true;
        const [red, blue] = P.lights, f = Math.sin(t * 9 + i * 1.3) > 0;
        red.emissiveIntensity = f ? 2.2 : 0.2; blue.emissiveIntensity = f ? 0.2 : 2.2;
        if (P.done) return;
        const e = 1 - (1 - k) ** 3;
        capeAttach(P.frame, P.x, P.z + 9 * (1 - e), P.ry);
        P.frame.position.setLength(standAt(P.frame.position.clone().normalize()));    // on the ground…
        player.fitToGround(P.body, P.frame);                                           // …all four wheels down
        if (k >= 1) P.done = true;
      });
    }
    // crate lids pop off (the epilogue)
    if (cape.lidT >= 0) {
      cape.lidT += dt;
      cape.crates.forEach((c, i) => {
        const k = THREE.MathUtils.clamp((cape.lidT - i * 0.35) / 0.6, 0, 1), lid = c.userData.lid;
        lid.position.set(0, 0.06 * Math.sin(Math.PI * k), 0.3 * k); lid.rotation.x = 1.45 * k * k;
      });
    }
  }
  // the overloaded rocket coughs, hops and sinks back — forty-five paintings is a lot of cargo
  function hop() {
    cape.hopT = 0;
    cape.console.userData.draw('OVERWEIGHT', '#f2a07a');
    $('timer').textContent = 'TOO HEAVY — RETRYING';
    bumps.say(personIt('rex').obj, 'Come ON!', 2.4, 'yell');
    phone.push('Editor', 'It\'s too heavy to fly — it\'s trying again! The CONSOLE, quick!');
  }
  function abortLaunch() {
    if (G.act !== 3) return;
    G.act = 4; cape.hopT = -1;
    const U = cape.console.userData;
    U.draw('ABORTED', '#ff8a7a');
    U.btn.position.y -= 0.045; U.cover.rotation.x = -1.2; U.cover.position.z -= 0.1;
    show($('timer'), false);
    const rex = personIt('rex');
    bumps.say(rex.obj, '…bother.', 3, 'grumble');
    if (rex.fleeing) rex.fleeing.phase = rex.fleeing.phase === 'top' ? 'top' : rex.fleeing.phase;
    rex.dir.copy(GANTRY_FOOT());                                   // shout up at him from the foot of the gantry
    phone.push('Editor', 'You stopped a ROCKET. Front page. Tomorrow. Yours.');
    cape.policeT = 0;
    updateGoal();
    setTimeout(startEpilogue, 4200);
  }

  // ── the epilogue: three letterboxed shots, then the papers ──
  const ARTS = ['art_cows_in_storm.jpg', 'art_IMG_5262.jpg', 'art_IMG_7152.jpg'];
  const EPI = [
    { dur: 4.4, cap: 'Forty-five canvases. Not a scratch.', at: CL, from: [-2.3, 1.5, 2.7], to: [-3.0, 1.15, 1.9], look: [-3.0, 0.6, 0.4] },
    { dur: 3.8, cap: 'Rex Calloway — framed, at last.', at: CL, from: [6.4, 3.0, 5.2], to: [5.4, 3.8, 3.6], look: [2.15, 5.6, -1.6] },
    { dur: 4.4, cap: 'Back on the walls by morning.', at: ML, from: [0, 3.2, 17], to: [0, 4.2, 11.5], look: [0, 3, -5] },
  ];
  function startEpilogue() {
    G.state = 'epilogue'; G.ui = null; G.epiT = 0; G.epiShot = -1;
    phone.closeAll();
    for (const k of ['card', 'talk', 'nb', 'prompt', 'way', 'timer']) show($(k), false);
    player.st.enabled = false;
    document.body.classList.add('cine');
    const loader = new THREE.TextureLoader();
    cape.crates.forEach((c, i) => loader.load('./artworks/' + ARTS[i % ARTS.length], (tx) => {
      tx.colorSpace = THREE.SRGBColorSpace;
      c.userData.art.material = new THREE.MeshBasicMaterial({ map: tx });
    }));
    cape.lidT = 0;
  }
  function tickEpilogue(dt) {
    G.epiT += dt;
    let acc = 0, i = 0;
    while (i < EPI.length - 1 && G.epiT > acc + EPI[i].dur) acc += EPI[i++].dur;
    if (i !== G.epiShot) { G.epiShot = i; if (i === 2) atmosphere.fadeTo(0, 1.2); }
    const S = EPI[i], k = Math.min(1, (G.epiT - acc) / S.dur), e = k * k * (3 - 2 * k);
    const from = S.at(...S.from), to = S.at(...S.to);
    camera.position.copy(from.lerp(to, e));
    camera.up.copy(camera.position).normalize();
    camera.lookAt(S.at(...S.look));
    const cap = $('caption');
    if (cap.textContent !== S.cap) { cap.textContent = S.cap; show(cap, false); requestAnimationFrame(() => show(cap)); }
    else show(cap, k > 0.08 && k < 0.92);
    if (G.epiT >= EPI.reduce((a, s) => a + s.dur, 0)) endEpilogue();
  }
  function endEpilogue() {
    G.state = 'play'; G.act = 5;
    document.body.classList.remove('cine'); show($('caption'), false);
    player.st.enabled = true; player.st.camInit = false;
    phone.push('The Chronicle', 'FRONT PAGE: CRITIC CATCHES THE FRAMER — all 45 paintings home safe. Rex Calloway charged. Story & photos: you.');
    setTimeout(() => phone.push('Mum', 'SO proud!!! dinner sunday. bring the newspaper'), 3000);
    $('endcard').innerHTML = `<h2>Case closed.</h2><p>Forty-five paintings, home by morning. Thank you for playing <b>The Vanishing Gallery</b>.</p>
      <p class="soft">The planet's still yours — and the buildings around town are Janelle's real projects. Walk up to one and press <kbd>E</kbd>.</p>
      <button class="sk" id="endOk">keep exploring</button>`;
    show($('endcard'));
    $('endOk').onclick = () => show($('endcard'), false);
    updateGoal();
  }

  // ── per frame ──
  // the people: breathe, gesture while they talk, turn to face you as you come up
  const _pv = new THREE.Vector3();
  function tickPeople(dt) {
    for (const it of items) {
      if (it.kind !== 'person' || it.knocked || it.fleeing) continue;
      const h = it.obj.userData.human; if (!h) continue;
      const talking = G.ui === 'talk' && G.talkWho?.id === it.id;
      h.talkK = (h.talkK || 0) + ((talking ? 1 : 0) - (h.talkK || 0)) * (1 - Math.exp(-5 * dt));
      pose(h, dt, 0, { talk: h.talkK });
      const l = it.obj.worldToLocal(_pv.copy(player.root.position));
      const target = G.state === 'play' && Math.hypot(l.x, l.z) < 4.5 ? Math.atan2(l.x, l.z) : 0;
      const tg = it.obj.userData.turn;
      const d = Math.atan2(Math.sin(target - tg.rotation.y), Math.cos(target - tg.rotation.y));
      tg.rotation.y += d * (1 - Math.exp(-4 * dt));
    }
  }
  function update(dt, t) {
    tickPeople(dt);
    tickWalkers(walkers, dt);
    tickCape(dt, t);
    phone.tick(dt);
    if (G.state === 'play') bumps.update(dt);
    if (G.state === 'epilogue') { tickEpilogue(dt); return true; }
    if (G.state === 'cold') {
      const e = performance.now() / 1000 - G.t0;
      let acc = 0, i = 0;
      while (i < SHOTS.length - 1 && e > acc + SHOTS[i].dur) acc += SHOTS[i++].dur;
      const S = SHOTS[i], k = Math.min(1, (e - acc) / S.dur), ease = k * k * (3 - 2 * k);
      const from = new THREE.Vector3(...S.from), to = new THREE.Vector3(...S.to);
      camera.position.copy(ML(...from.lerp(to, ease).toArray()));
      camera.up.copy(mus.position).normalize();
      camera.lookAt(ML(...S.look));
      const cap = $('caption');
      if (cap.textContent !== S.cap) { cap.textContent = S.cap; show(cap, false); requestAnimationFrame(() => { if (G.state === 'cold') show(cap); }); }
      else show(cap, k > 0.08 && k < 0.92);
      if (e >= COLD) endColdOpen();
      return true;                                  // the camera is ours
    }
    if (G.state === 'title') {
      // the planet turns slowly behind the title page
      // the planet sits low, under the title, like an illustrated book cover
      const a = 0.9 + t * 0.05;
      camera.position.set(Math.sin(a) * 96, 30, Math.cos(a) * 96);
      camera.up.set(0, 1, 0); camera.lookAt(0, 30, 0);
      return true;
    }
    // glints bob gently so you notice them without being told
    // …and every few seconds each one gently pops (swells a little and settles back) with a
    // slow shimmer — staggered so they never pulse together: noticeable, never alarming
    for (const it of items) {
      const gl = it.glint; if (!gl?.visible) continue;
      if (gl.userData.base == null) gl.userData.base = gl.scale.x;
      const seed = (it.dir.x * 9.7 + it.dir.z * 4.3) % 1, cyc = (t / 3.4 + seed) % 1;
      const u = cyc < 0.22 ? cyc / 0.22 : 1;                 // the pop: the first ~0.75s of each cycle
      const pop = u < 1 ? Math.sin(Math.PI * u) * (1 - 0.35 * u) : 0;
      gl.scale.setScalar(gl.userData.base * (0.92 + 0.36 * pop + 0.04 * Math.sin(t * 1.3 + seed * 6)));
      gl.material.rotation = Math.sin(t * 1.4 + seed * 9) * 0.18 + pop * 0.35;
      gl.material.opacity = 0.82 + 0.18 * Math.max(pop, 0.5 + 0.5 * Math.sin(t * 0.9 + seed * 7));
    }
    scan();
    updateWaypoint(dt, t);
    return false;
  }
  const afterRender = () => phone.afterRender(renderer, placeName());
  return { G, update, items, FACE, SKETCH, bumps, walkers, phone, afterRender, startGetaway, startCountdown, abortLaunch, jeepSpot: () => jeepDir.clone() };
}
