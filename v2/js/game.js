// ─── THE GAME FLOW: title → cold open → the case ────────────────────────────
// The cold open follows the classic adventure-game shape: a few silent,
// letterboxed shots of the crime (≈10s, skippable), then you're in control
// with one buzz of the phone telling you why you're here. After that the game
// never explains a clue — you look, you listen, you decide.
import * as THREE from 'three';
import { arc, radiusAt, settle, yawToFace } from './world.js';
import { CLUES, PEOPLE, SUSPECTS, judge, buildCase } from './story.js';
import { pose } from './human.js';
import { ink } from './style.js';

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => el.classList.toggle('hide', !on);

export function createGame({ scene, camera, town, player, atmosphere }) {
  const G = {
    state: 'title', t0: 0, found: new Set(), met: new Set(), talked: new Set(), solved: false,
    ui: null, talkIdx: 0, talkWho: null, pickSus: null, pickClues: new Set(),
  };
  const items = buildCase(scene, town);
  const mus = town.museum.group;
  const ML = (x, y, z) => mus.localToWorld(new THREE.Vector3(x, y, z));

  // ── a parked jeep you can walk up to ──
  const parked = player.bodies.jeep.clone(true);
  const jeepSpot = town.museumFrame(4.6, 4.8);
  settle(parked, jeepSpot, 1.0, 0.02, yawToFace(jeepSpot, town.museumFrame(4.6, 12)));
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
    P.innerHTML = `<div class="hd">📰 Editor · The Chronicle</div>
      <div class="msg">You're at the museum? Good. All 45 paintings went overnight. The police have nothing.</div>
      <div class="msg">You know those canvases better than anyone. Find out who — and where they're going.</div>
      <button class="sk" id="phOk">on it</button>`;
    show(P);
    $('phOk').onclick = () => { show(P, false); beginPlay(); };
  }
  function beginPlay() {
    G.state = 'play';
    player.st.enabled = true;
    show($('hud')); show($('nbBtn')); show($('hint'));
    setTimeout(() => show($('hint'), false), 9000);
    updateGoal();
  }

  // ── what's near you, and what pressing E does ──
  let nearest = null;
  function scan() {
    nearest = null;
    if (G.state !== 'play' || G.ui) return;
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
      : nearest.kind === 'jeep' ? 'get in the jeep' : nearest.kind === 'exit' ? 'get out' : 'look closer';
    pr.innerHTML = `<kbd>E</kbd>${label}`;
    show(pr);
  }
  $('prompt').onclick = () => act();
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyE') act();
    if (e.code === 'Escape') closeUI();
    if (e.code === 'KeyN' && G.state === 'play') toggleNotebook();
  });
  function act() {
    if (G.state !== 'play') return;
    if (G.ui === 'card') { closeUI(); return; }
    if (G.ui === 'talk') { nextLine(); return; }
    if (G.ui) return;
    if (!nearest) return;
    if (nearest.kind === 'clue') return openClue(nearest);
    if (nearest.kind === 'person') return openTalk(nearest.id);
    if (nearest.kind === 'jeep') { parked.visible = false; player.setMode('jeep'); player.st.heading = new THREE.Vector3(0, 0, 1).applyQuaternion(parked.quaternion); player.st.camFwd.copy(player.st.heading); return; }
    if (nearest.kind === 'exit') {
      player.setMode('walk');
      jeepDir = player.st.dir.clone();
      parked.position.copy(player.root.position); parked.quaternion.copy(player.root.quaternion); parked.visible = true;
      // step out beside the car
      const side = new THREE.Vector3().crossVectors(player.st.dir, player.st.heading).normalize();
      player.st.dir.multiplyScalar(40).addScaledVector(side, 1.6).normalize();
    }
  }
  function closeUI() {
    if (!G.ui) return;
    show($({ card: 'card', talk: 'talk', nb: 'nb' }[G.ui]), false);
    G.ui = null; player.st.enabled = true;
  }

  // ── a found thing ──
  function openClue(it) {
    const c = CLUES.find(c => c.id === it.id);
    const isNew = !G.found.has(c.id);
    G.found.add(c.id);
    if (it.glint) it.glint.visible = false;
    $('card').innerHTML = `<div class="ic">${c.icon}</div><h3>${c.title}</h3><p>${c.text}</p>
      <div class="note">${isNew ? '✎ noted in your notebook' : 'already in your notebook'}</div><button class="sk" id="cardOk">ok</button>`;
    show($('card')); G.ui = 'card'; player.st.enabled = false;
    $('cardOk').onclick = closeUI;
    updateGoal();
  }
  // ── someone talks ──
  function openTalk(id) {
    G.talkWho = PEOPLE.find(p => p.id === id); G.talkIdx = 0;
    G.met.add(id);
    const it = items.find(i => i.id === id); if (it?.glint) it.glint.visible = false;
    G.ui = 'talk'; player.st.enabled = false;
    renderTalk();
  }
  function renderTalk() {
    const p = G.talkWho, last = G.talkIdx >= p.lines.length - 1;
    const canAccuse = p.id === 'vivi' && G.talked.has('vivi') && !G.solved && G.found.size >= 2;
    $('talk').innerHTML = `<div class="face">${p.face}</div><div><b>${p.name}</b><p>${p.lines[G.talkIdx]}</p>
      <div class="row">${canAccuse && last ? '<button class="sk" id="tAcc">I know who did it</button>' : ''}<button class="sk" id="tNext">${last ? 'bye' : 'go on'}</button></div></div>`;
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
    const li = (c) => `<li class="${accusing ? 'pick' : ''} ${G.pickClues.has(c.id) ? 'on' : ''}" data-id="${c.id}"><span class="i">${c.icon}</span><span><b>${c.title}.</b> ${c.text}</span></li>`;
    $('nb').innerHTML = `<button class="sk x" id="nbX">close</button><h2>${accusing ? 'Make your case' : 'Notebook'}</h2>
      ${accusing ? `<p>Who did it?</p><div class="who">${Object.entries(SUSPECTS).map(([k, s]) => `<button class="sk ${G.pickSus === k ? 'on' : ''}" data-s="${k}">${s.face} ${s.name}</button>`).join('')}</div>
        <p>Pick the two things you found that prove it:</p>` : '<p><b>Things I noticed</b></p>'}
      <ul>${notes.length ? notes.map(li).join('') : '<li class="empty">nothing yet — walk up to anything that catches your eye</li>'}</ul>
      ${accusing ? `<button class="sk" id="nbGo" ${G.pickSus && G.pickClues.size === 2 ? '' : 'disabled style="opacity:.5"'}>show Vivi</button><div id="nbV"></div>`
        : `<p><b>People</b></p><ul>${people.length ? people.map(p => `<li><span class="i">${p.face}</span><span><b>${p.name}.</b> ${p.lines[p.lines.length - 1]}</span></li>`).join('') : '<li class="empty">no one yet</li>'}</ul>`}`;
    show($('nb'));
    $('nbX').onclick = closeUI;
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
        if (v.ok) { G.solved = true; updateGoal(); }
      };
    }
  }

  function updateGoal() {
    const g = $('goal');
    if (!G.talked.has('vivi')) g.textContent = 'find Director Vivi on the museum steps';
    else if (!G.solved) g.textContent = `ask around, look closely · ${G.found.size} things noticed`;
    else g.textContent = 'the canvases leave Cape Far Side tonight — to be continued';
    $('nbCount').textContent = G.found.size;
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
    return false;
  }
  return { G, update, items, jeepSpot: () => jeepDir.clone() };
}
