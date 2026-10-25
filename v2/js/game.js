// ─── THE GAME FLOW: title → cold open → the case ────────────────────────────
// The cold open follows the classic adventure-game shape: a few silent,
// letterboxed shots of the crime (≈10s, skippable), then you're in control
// with one buzz of the phone telling you why you're here. After that the game
// never explains a clue — you look, you listen, you decide.
import * as THREE from 'three';
import { arc, radiusAt, settle, yawToFace } from './world.js';
import { CLUES, PEOPLE, SUSPECTS, PLACES, judge, buildCase, sketchProp } from './story.js';
import { paintPeople, paintThings } from './portraits.js';
import { LOOKS } from './human.js';
import { pose } from './human.js';
import { ink } from './style.js';

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => el.classList.toggle('hide', !on);

export function createGame({ scene, camera, town, player, atmosphere, renderer }) {
  const G = {
    state: 'title', t0: 0, found: new Set(), met: new Set(), talked: new Set(), solved: false,
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
  const parked = player.bodies.jeep.clone(true);
  // beside the plaza, in view when you start — not behind you where the camera sits
  const jeepSpot = town.museumFrame(5.4, 2.2);
  settle(parked, jeepSpot, 1.0, 0.02, yawToFace(jeepSpot, town.museumFrame(5.4, 12)));
  parked.visible = true;                 // the player's car body starts hidden (you're on foot), and so did its clone
  scene.add(parked);
  let jeepDir = jeepSpot.clone();

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
  function openPhone() {
    const P = $('phone');
    P.innerHTML = `<div class="hd">Editor · The Chronicle</div>
      <div class="msg">You're at the museum? Good. All 45 paintings went overnight. The police have nothing.</div>
      <div class="msg">You know those canvases better than anyone. Find out who — and where they're going.</div>
      <button class="sk" id="phOk">on it</button>`;
    show(P);
    $('phOk').onclick = () => { show(P, false); beginPlay(); };
  }
  function beginPlay() {
    G.state = 'play';
    player.st.enabled = true;
    show($('hud')); show($('nbBtn')); showKeys();
    updateGoal();
  }
  // the controls strip: always there (H hides it), and it changes when you drive
  let keysOn = true;
  function showKeys() {
    const k = (t) => `<kbd>${t}</kbd>`;
    $('hint').innerHTML = player.st.mode === 'jeep'
      ? `${k('W')}${k('S')} drive · ${k('A')}${k('D')} steer · ${k('E')} get out · scroll to zoom · ${k('C')} camera behind · ${k('H')} hide`
      : `${k('WASD')} walk · ${k('Shift')} run · ${k('E')} look / talk · ${k('N')} notebook · drag to look · scroll to zoom · ${k('C')} camera behind · ${k('H')} hide`;
    show($('hint'), keysOn && G.state === 'play');
  }

  // ── what's near you, and what pressing E does ──
  let nearest = null;
  function scan() {
    nearest = null;
    if (G.state !== 'play' || G.ui) { show($('prompt'), false); return; }
    const here = player.st.dir;
    let best = 1e9;
    if (player.st.mode === 'walk') {
      for (const it of items) {
        const lim = it.kind === 'person' ? 2.4 : 2.1;
        const d = arc(here, it.dir);
        if (d < lim && d < best) { best = d; nearest = it; }
      }
      const dj = arc(here, jeepDir);
      if (dj < 2.6 && (!nearest || dj < best)) nearest = { kind: 'jeep' };
    } else nearest = { kind: 'exit' };
    const pr = $('prompt');
    if (!nearest) { show(pr, false); return; }
    const label = nearest.kind === 'person' ? `talk to ${PEOPLE.find(p => p.id === nearest.id).name.split(',')[0]}`
      : nearest.kind === 'jeep' ? 'get in the car' : nearest.kind === 'exit' ? 'get out' : 'look closer';
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
    if (G.state !== 'play') return;
    if (G.ui === 'card') { closeUI(); return; }
    if (G.ui === 'talk') { nextLine(); return; }
    if (G.ui) return;
    if (!nearest) return;
    if (nearest.kind === 'clue') return openClue(nearest);
    if (nearest.kind === 'person') return openTalk(nearest.id);
    if (nearest.kind === 'jeep') { parked.visible = false; player.setMode('jeep'); player.st.heading = new THREE.Vector3(0, 0, 1).applyQuaternion(parked.quaternion); player.st.camFwd.copy(player.st.heading); showKeys(); renderCase(); return; }
    if (nearest.kind === 'exit') {
      player.setMode('walk');
      jeepDir = player.st.dir.clone();
      parked.position.copy(player.root.position); parked.quaternion.copy(player.root.quaternion); parked.visible = true;
      // step out beside the car
      const side = new THREE.Vector3().crossVectors(player.st.dir, player.st.heading).normalize();
      player.st.dir.multiplyScalar(40).addScaledVector(side, 1.6).normalize();
      showKeys(); renderCase();
    }
  }
  function closeUI() {
    if (!G.ui) return;
    if (player.st.camHook === convoCam) { player.st.camHook = null; player.st.camInit = false; }
    show($({ card: 'card', talk: 'talk', nb: 'nb' }[G.ui]), false);
    G.ui = null; player.st.enabled = true;
  }

  // ── a found thing ──
  function openClue(it) {
    const c = CLUES.find(c => c.id === it.id);
    const isNew = !G.found.has(c.id);
    G.found.add(c.id);
    if (it.glint) it.glint.visible = false;
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
  function convoCam(cam, root) {
    const it = items.find(i => i.id === G.talkWho?.id); if (!it) return;
    const a = root.position, b = it.obj.position;
    const mid = a.clone().add(b).multiplyScalar(0.5), up = mid.clone().normalize();
    const ab = b.clone().sub(a).projectOnPlane(up); const dist = ab.length(); ab.normalize();
    const side = new THREE.Vector3().crossVectors(up, ab).normalize().multiplyScalar(conv.side);
    const want = mid.clone().addScaledVector(side, 2.5 + dist * 0.6).addScaledVector(up, 1.05).addScaledVector(ab, -0.45);
    const look = mid.clone().addScaledVector(up, 0.72);
    const now = performance.now() / 1000, dt = conv.init ? Math.min(0.1, now - conv.t) : 0; conv.t = now;
    if (!conv.init) { conv.pos.copy(cam.position); conv.look.copy(look); conv.init = true; }
    conv.pos.lerp(want, 1 - Math.exp(-3.5 * dt)); conv.look.lerp(look, 1 - Math.exp(-6 * dt));
    cam.position.copy(conv.pos); cam.up.copy(up); cam.lookAt(conv.look);
  }
  function startConvo(it) {
    // face them, and put the camera on whichever side isn't inside a building
    const st = player.st, d = it.dir.clone();
    st.heading = d.sub(st.dir.clone().multiplyScalar(st.dir.dot(d))).normalize();
    const mid = player.root.position.clone().add(it.obj.position).multiplyScalar(0.5), up = mid.clone().normalize();
    const ab = it.obj.position.clone().sub(player.root.position).projectOnPlane(up).normalize();
    const blocked = (sg) => { const p = mid.clone().addScaledVector(new THREE.Vector3().crossVectors(up, ab).normalize(), sg * 2.2).normalize();
      return town.colliders.some(c => c.r >= 0.5 && arc(p, c.dir) < c.r + 0.5); };
    conv.side = blocked(1) && !blocked(-1) ? -1 : 1;
    conv.init = false;
    player.st.camHook = convoCam;
  }
  function openTalk(id) {
    G.talkWho = PEOPLE.find(p => p.id === id); G.talkIdx = 0;
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
        $('nbV').innerHTML = `<div class="verdict sk">${v.text}</div>`;
        if (v.ok) { G.solved = true; G.track = null; updateGoal(); }
      };
    }
  }

  // ── the case board: where you are in the story, who's left, where to look ──
  // It says WHERE things are, never what they mean: finds are counted per place.
  const canAccuse = () => G.talked.has('vivi') && G.found.size >= 2 && !G.solved;
  const WHERE = { vivi: 'on the museum steps', otto: 'by the guard booth beside the museum steps', pia: 'outside Bean There Café, Main Street', rex: 'by his van at Frame & Co., Main Street' };
  const placeDir = {
    museum: town.museum.dir, main: town.townAt([2, 0]), harbour: town.sites.harbour.dir, station: town.sites.station.dir,
  };
  const personIt = (id) => items.find(i => i.kind === 'person' && i.id === id);
  const placeCount = (pl) => { const all = CLUES.filter(c => c.where === pl); return [all.filter(c => G.found.has(c.id)).length, all.length]; };
  function targetOf(key) {
    const [kind, id] = key.split(':');
    if (kind === 'person') { const it = personIt(id); return it && { dir: it.dir, label: PEOPLE.find(p => p.id === id).name.split(',')[0], near: 2.4, h: 2.75, done: G.talked.has(id) && id !== 'vivi' }; }
    if (kind === 'place') { const [n, t] = placeCount(id); return { dir: placeDir[id], label: PLACES.find(p => p.id === id).name, near: id === 'main' ? 6 : 5, h: 3.2, done: n >= t }; }
    if (kind === 'car') return player.st.mode === 'walk' ? { dir: jeepDir, label: 'your car', near: 2.6, h: 1.8, done: false } : null;
    return null;
  }
  // what the arrow points at: what you picked on the board, or the next lead
  function currentTarget() {
    if (G.solved) return null;
    if (G.track) { const t = targetOf(G.track); if (t && !t.done) return t; G.track = null; }
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
  function renderCase() {
    const el = $('case'), auto = currentTarget();
    const row = (key, html, done = false) => {
      const t = targetOf(key), on = t && auto && t.dir === auto.dir && !done;
      return `<div class="cr ${done ? 'done' : ''} ${on ? 'on' : ''}" data-k="${key}">${html}</div>`;
    };
    let h = '';
    if (G.solved) h = `<div class="st">Case closed.</div><p>The canvases leave Cape Far Side tonight — to be continued.</p>`;
    else if (!G.talked.has('vivi')) {
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
    if (!G.solved && player.st.mode === 'walk') h += row('car', `<i>›</i> your car — <kbd>E</kbd> to drive`);
    if (!G.solved) h += `<p class="soft">click a line to follow it</p>`;
    el.innerHTML = h;
    el.querySelectorAll('.cr').forEach(r => r.onclick = () => { G.track = r.dataset.k; renderCase(); });
  }

  // ── the waypoint: a sketched pin over your lead, or an arrow at the edge ──
  const way = $('way'), _wp = new THREE.Vector3(), _pc = new THREE.Vector3();
  let wayKey = '';
  function updateWaypoint() {
    const t = G.state === 'play' && !G.ui ? currentTarget() : null;
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

  // ── per frame ──
  // the people: breathe, gesture while they talk, turn to face you as you come up
  const _pv = new THREE.Vector3();
  function tickPeople(dt) {
    for (const it of items) {
      if (it.kind !== 'person') continue;
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
    for (const it of items) if (it.glint?.visible) it.glint.material.rotation = Math.sin(t * 2 + it.dir.x * 9) * 0.25;
    scan();
    updateWaypoint();
    return false;
  }
  return { G, update, items, FACE, SKETCH, jeepSpot: () => jeepDir.clone() };
}
