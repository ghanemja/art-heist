// ─── THE PHONE (it lives in the critic's little backpack) ───────────────────
// The backpack (B) holds what you carry: the phone, the notebook, the car keys,
// your press pass, and anything you pick up. The phone (P) has Messages (the
// story arrives as texts — and Mum), a hand-drawn Map you can tap to follow a
// place, a Camera that takes polaroids of whatever you're looking at, and Photos.
import { ROADS, isWater, arc } from './world.js';

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => el.classList.toggle('hide', !on);
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// little painted icons for the bag and the home screen (inline SVG, ink + gouache)
const ICON = {
  phone: '<svg viewBox="0 0 40 40"><rect x="11" y="4" width="18" height="32" rx="4" fill="#2a2230"/><rect x="13.5" y="8" width="13" height="22" rx="1.5" fill="#9fd0d8"/><circle cx="20" cy="33" r="1.4" fill="#f6efdf"/></svg>',
  notebook: '<svg viewBox="0 0 40 40"><rect x="9" y="5" width="23" height="30" rx="2" fill="#c7533e" stroke="#2a2230" stroke-width="2"/><rect x="13" y="9" width="16" height="22" fill="#f6efdf"/><path d="M15 14h11M15 18h11M15 22h8" stroke="#8a8fa8" stroke-width="1.5"/></svg>',
  keys: '<svg viewBox="0 0 40 40"><circle cx="14" cy="15" r="7" fill="none" stroke="#e4b84f" stroke-width="3"/><path d="M19 19 L31 31 M26 26 L29 23 M29 29 L32 26" stroke="#2a2230" stroke-width="3" stroke-linecap="round"/><rect x="5" y="25" width="11" height="8" rx="3" fill="#d9573f" stroke="#2a2230" stroke-width="1.5"/></svg>',
  pass: '<svg viewBox="0 0 40 40"><rect x="6" y="9" width="28" height="22" rx="3" fill="#f6efdf" stroke="#2a2230" stroke-width="2"/><circle cx="14" cy="18" r="4" fill="#c7533e"/><path d="M21 16h9M21 21h7M10 26h20" stroke="#2a2230" stroke-width="1.6"/><rect x="16" y="4" width="8" height="6" rx="2" fill="#e4b84f" stroke="#2a2230" stroke-width="1.5"/></svg>',
  ticket: '<svg viewBox="0 0 40 40"><path d="M5 12h30v5a3 3 0 0 0 0 6v5H5v-5a3 3 0 0 0 0-6z" fill="#f4e6b8" stroke="#2a2230" stroke-width="2"/><path d="M12 17h15M12 22h11" stroke="#8a6448" stroke-width="1.6"/></svg>',
  messages: '<svg viewBox="0 0 40 40"><rect x="3" y="3" width="34" height="34" rx="9" fill="#7fb3a8"/><path d="M10 12h20a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H18l-6 5v-5h-2a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z" fill="#f6efdf"/></svg>',
  map: '<svg viewBox="0 0 40 40"><rect x="3" y="3" width="34" height="34" rx="9" fill="#a8c08a"/><path d="M8 12l8-3 8 3 8-3v19l-8 3-8-3-8 3z" fill="#f6efdf" stroke="#2a2230" stroke-width="1.5"/><path d="M16 9v19M24 12v19" stroke="#2a2230" stroke-width="1.2"/><circle cx="20" cy="18" r="2.5" fill="#e8604c"/></svg>',
  camera: '<svg viewBox="0 0 40 40"><rect x="3" y="3" width="34" height="34" rx="9" fill="#93abc0"/><rect x="8" y="13" width="24" height="16" rx="3" fill="#2a2230"/><circle cx="20" cy="21" r="5" fill="#9fd0d8" stroke="#f6efdf" stroke-width="2"/><rect x="14" y="10" width="7" height="4" rx="1" fill="#2a2230"/></svg>',
  photos: '<svg viewBox="0 0 40 40"><rect x="3" y="3" width="34" height="34" rx="9" fill="#e1b95c"/><rect x="9" y="10" width="22" height="20" fill="#f6efdf" stroke="#2a2230" stroke-width="1.5"/><path d="M11 26l6-7 4 4 3-3 5 6z" fill="#7fb3a8"/><circle cx="25" cy="15" r="2" fill="#e8604c"/></svg>',
  case: '<svg viewBox="0 0 40 40"><rect x="3" y="3" width="34" height="34" rx="9" fill="#c7533e"/><rect x="11" y="9" width="18" height="23" rx="2" fill="#f6efdf"/><path d="M14 14h12M14 18h12M14 22h8" stroke="#8a8fa8" stroke-width="1.5"/></svg>',
};

export function createPhone({ town, player, camera, places, onTrack, openNotebook, isTracked }) {
  const S = { app: null, open: false, bag: false, msgs: [], unread: 0, photos: [], items: ['phone', 'notebook', 'keys', 'pass'], shoot: null, mapT: 0 };
  const ITEMS = {
    phone: { name: 'Phone', note: 'Texts, a map, a camera. Press P.', act: () => open('home') },
    notebook: { name: 'Notebook', note: 'Everything you noticed. Press N.', act: () => { closeAll(); openNotebook(); } },
    keys: { name: 'Car keys', note: 'The red roadster. Tap to find it.', act: () => { onTrack('car'); closeAll(); } },
    pass: { name: 'Press pass', note: 'THE CHRONICLE — ARTS. It opens doors (mostly gallery ones).' },
    ticket: { name: 'Cargo ticket', note: '“Cape Far Side, oversize, flat, 45 items. Account: Frame & Co.”' },
  };

  // ── messages arrive with a buzz and a little card in the corner ──
  function push(from, text, { silent = false } = {}) {
    S.msgs.push({ from, text, t: clock() });
    if (S.open && S.app === 'messages') render();
    else {
      S.unread++;
      if (!silent) toast(from, text);
    }
    badge();
  }
  let toastT = 0;
  function toast(from, text) {
    const el = $('toast');
    el.innerHTML = `<b>${esc(from)}</b> ${esc(text.length > 70 ? text.slice(0, 68) + '…' : text)}<small>P to read</small>`;
    show(el); toastT = 5.5;
    el.onclick = () => open('messages');
    navigator.vibrate?.(60);
  }
  function badge() {
    const n = S.unread;
    for (const id of ['bagCount']) { const b = $(id); if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; } }
  }
  const clock = () => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); };

  // ── the backpack ──
  function openBag() {
    if (S.open) close();
    S.bag = true;
    const el = $('bag');
    el.innerHTML = `<button class="sk x" id="bagX">close</button><h2>Backpack</h2>
      <div class="grid">${S.items.map(k => `<button class="it" data-k="${k}">${ICON[k] || ICON.pass}<b>${ITEMS[k].name}</b><small>${ITEMS[k].note}</small>${k === 'phone' && S.unread ? `<i>${S.unread}</i>` : ''}</button>`).join('')}</div>`;
    show(el);
    $('bagX').onclick = closeAll;
    el.querySelectorAll('.it').forEach(b => b.onclick = () => ITEMS[b.dataset.k].act?.());
    player.st.enabled = false;
  }
  function addItem(k) { if (!S.items.includes(k)) S.items.push(k); }

  // ── the phone ──
  function open(app = 'home') {
    if (S.bag) { show($('bag'), false); S.bag = false; }
    S.open = true; S.app = app;
    if (app === 'messages') S.unread = 0;
    badge(); render(); show($('handset'));
    show($('toast'), false);
    player.st.enabled = app === 'camera';                 // you can walk around to frame a photo
  }
  // suggested replies above the keyboard (the opening's "on it"…): tapping one types it
  // out on the keypad, key by key, then sends it as your own bubble; the callback gets
  // the index of the reply you chose. Closing the phone picks the first.
  function sendReply(i = 0) {
    const r = S.reply; if (!r || S.composing != null) return;
    const text = r.options[i];
    S.composing = '';
    let k = 0;
    const step = () => {
      if (!S.open || S.app !== 'messages') return;
      if (k < text.length) {
        S.composing = text.slice(0, ++k);
        const field = $('phField'); if (field) { field.textContent = S.composing; field.classList.add('on'); }
        const ch = text[k - 1].toLowerCase();
        document.querySelectorAll('#screen .kb [data-k]').forEach(b => b.classList.toggle('hit', b.dataset.k === (ch === ' ' ? 'space' : ch)));
        setTimeout(step, 55 + Math.random() * 45);
      } else {
        S.reply = null; S.composing = null;
        S.msgs.push({ from: 'You', text, t: clock(), me: true });
        render();
        setTimeout(() => r.cb(i), 450);
      }
    };
    step();
  }
  function setReply(options, cb) {
    S.reply = options ? { options: [].concat(options), cb } : null; S.composing = null;
    if (S.open && S.app === 'messages') render();
  }
  function setTyping(on) { S.typing = on; if (S.open && S.app === 'messages') render(); }
  function close() {
    if (S.reply) { const r = S.reply; S.reply = null; S.composing = null; S.open = false; S.app = null; show($('handset'), false); r.cb(0); return; }
    S.open = false; S.app = null;
    show($('handset'), false);
    player.st.enabled = true;
  }
  function closeAll() { if (S.bag) { show($('bag'), false); S.bag = false; player.st.enabled = true; } if (S.open) close(); }
  function render() {
    const scr = $('screen');
    const hdr = (title) => `<div class="sbar"><button class="back" id="phBack">‹</button><b>${title}</b><span>${clock()}</span></div>`;
    if (S.app === 'home') {
      const apps = [['messages', 'Messages'], ['map', 'Map'], ['camera', 'Camera'], ['photos', 'Photos'], ['case', 'Case']];
      scr.innerHTML = `<div class="sbar"><span></span><b>${clock()}</b><span>●●●</span></div><div class="apps">${apps.map(([k, n]) =>
        `<button class="app" data-a="${k}">${ICON[k]}<span>${n}</span>${k === 'messages' && S.unread ? `<i>${S.unread}</i>` : ''}</button>`).join('')}</div>
        <div class="hint">P closes the phone</div>`;
      scr.querySelectorAll('.app').forEach(b => b.onclick = () => b.dataset.a === 'case' ? (close(), openNotebook()) : open(b.dataset.a));
    } else if (S.app === 'messages') {
      // a chat thread: bubbles with tails (theirs left, yours right), the sender's name
      // once per run, a time under the last of a run; a composer and keypad at the bottom
      const who = S.msgs.filter(m => !m.me).slice(-1)[0]?.from || 'Messages';
      const runs = S.msgs.map((m, i) => {
        const prev = S.msgs[i - 1], next = S.msgs[i + 1];
        const first = !prev || prev.from !== m.from, last = !next || next.from !== m.from;
        return `${first && !m.me ? `<div class="who">${esc(m.from)}</div>` : ''}<div class="b ${m.me ? 'me' : 'them'} ${m.from === 'Mum' ? 'mum' : ''} ${last ? 'tail' : ''}">${esc(m.text)}</div>${last ? `<div class="t ${m.me ? 'me' : ''}">${m.me ? 'Delivered · ' : ''}${m.t}</div>` : ''}`;
      }).join('');
      const keys = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
      scr.innerHTML = `<div class="sbar chat"><button class="back" id="phBack">‹</button><div class="contact"><span class="av">${esc(who[0])}</span><b>${esc(who)}</b></div><span>${clock()}</span></div>
        <div class="msgs chat" id="msgs">${runs || '<p class="empty">no messages</p>'}${S.typing ? `<div class="b them typing"><span></span><span></span><span></span></div>` : ''}</div>
        ${S.reply ? `<div class="sugg">${S.reply.options.map((o, i) => `<button class="chip" data-i="${i}">${esc(o)}</button>`).join('')}</div>` : ''}
        <div class="composer"><div class="field ${S.composing ? 'on' : ''}" id="phField">${S.composing ? esc(S.composing) : 'iMessage'}</div><button class="send" id="phSend" aria-label="send">↑</button></div>
        ${S.reply ? `<div class="kb">${keys.map((row, r) => `<div class="row">${r === 2 ? '<span class="k wide">⇧</span>' : ''}${[...row].map(c => `<span class="k" data-k="${c}">${c}</span>`).join('')}${r === 2 ? '<span class="k wide">⌫</span>' : ''}</div>`).join('')}
          <div class="row"><span class="k wide">123</span><span class="k space" data-k="space">space</span><span class="k wide">return</span></div></div>` : ''}`;
      const box = $('msgs'); box.scrollTop = box.scrollHeight;
      scr.querySelectorAll('.sugg .chip').forEach(b => b.onclick = () => sendReply(+b.dataset.i));
      const send = $('phSend'); if (send && S.reply) send.onclick = () => sendReply(0);
    } else if (S.app === 'map') {
      scr.innerHTML = hdr('Map') + `<canvas id="mapCv" width="560" height="640"></canvas><div class="legend">tap a place to follow it</div>`;
      drawMap();
      $('mapCv').onclick = (e) => {
        const r = e.target.getBoundingClientRect(), x = (e.clientX - r.left) * (560 / r.width), y = (e.clientY - r.top) * (640 / r.height);
        let best = null, bd = 40;
        for (const h of mapHits) if (h.x === W / 2 && Math.abs(h.y - y) < 15) { onTrack(h.key); drawMap(); return; }   // a row in the far-off list
        for (const p of mapHits) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
        if (best) { onTrack(best.key); drawMap(); }
      };
    } else if (S.app === 'camera') {
      scr.innerHTML = hdr('Camera') + `<div class="vf"><div class="cross"></div><p>walk and turn to frame it</p></div><button class="shutter" id="shut"></button>`;
      $('shut').onclick = () => { S.shoot = true; };
    } else if (S.app === 'photos') {
      scr.innerHTML = hdr('Photos') + `<div class="pics">${S.photos.length ? S.photos.slice().reverse().map(p =>
        `<figure><img src="${p.src}" alt=""><figcaption>${esc(p.cap)}</figcaption></figure>`).join('') : '<p class="empty">no photos yet — open the Camera</p>'}</div>`;
    }
    const back = $('phBack'); if (back) back.onclick = () => open('home');
  }

  // ── the map: town-frame top view, north up, drawn like a sketch map ──
  let mapHits = [];
  const W = 560, H = 640, SC = 7.2, CX = W / 2, CY = H / 2 - 10;
  const toXY = (d) => { if (d.dot(town.dirC) < 0.3) return null; const [x, y] = town.toTown(d); return [CX - x * SC, CY - y * SC]; };
  let water = null;
  function drawMap() {
    const cv = $('mapCv'); if (!cv) return;
    const c = cv.getContext('2d');
    c.fillStyle = '#efe4cc'; c.fillRect(0, 0, W, H);
    if (!water) {                                        // the coastline, sampled once
      water = [];
      for (let y = 0; y < H; y += 8) for (let x = 0; x < W; x += 8) {
        const d = town.townAt([(CX - x) / SC, (CY - y) / SC]);
        if (isWater(d)) water.push([x, y]);
      }
    }
    c.fillStyle = '#9fc6cf'; for (const [x, y] of water) c.fillRect(x - 0.5, y - 0.5, 9, 9);
    c.lineCap = c.lineJoin = 'round';
    for (const rd of ROADS) {
      c.strokeStyle = '#8a8392'; c.lineWidth = Math.max(2.5, rd.half * 2 * SC * 0.8);
      c.beginPath(); let pen = false;
      for (let i = 0; i < rd.pts.length; i += 2) {
        const p = toXY(rd.pts[i]);
        if (!p || p[0] < -40 || p[0] > W + 40 || p[1] < -40 || p[1] > H + 40) { pen = false; continue; }
        if (pen) c.lineTo(p[0], p[1]); else { c.moveTo(p[0], p[1]); pen = true; }
      }
      c.stroke();
    }
    mapHits = [];
    const off = [];
    for (const pl of places()) {
      const p = toXY(pl.dir);
      const on = isTracked(pl.key);
      if (p && p[0] > 18 && p[0] < W - 18 && p[1] > 18 && p[1] < H - 18) {
        c.fillStyle = on ? '#e8604c' : '#2a2230'; c.beginPath(); c.arc(p[0], p[1], on ? 9 : 6, 0, Math.PI * 2); c.fill();
        c.font = '600 22px "Patrick Hand", cursive'; c.fillStyle = '#2a2230'; c.textAlign = 'center';
        c.fillText(pl.name, p[0], p[1] - 13);
        mapHits.push({ x: p[0], y: p[1], key: pl.key });
      } else {                                              // off the map: an arrow on the edge with the distance
        const dx = -pl.dir.dot(town.axes.side), dy = pl.dir.dot(town.axes.fwd), a = Math.atan2(-dy, dx);   // direction only: works for the far side too
        const k = Math.min((W / 2 - 30) / Math.max(1e-3, Math.abs(Math.cos(a))), (H / 2 - 30) / Math.max(1e-3, Math.abs(Math.sin(a))));
        const x = CX + Math.cos(a) * k, y = CY + Math.sin(a) * k;
        c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = on ? '#e8604c' : '#2a2230';
        c.beginPath(); c.moveTo(14, 0); c.lineTo(-8, -9); c.lineTo(-4, 0); c.lineTo(-8, 9); c.closePath(); c.fill(); c.restore();
        off.push({ pl, on, a });
        mapHits.push({ x, y, key: pl.key });
      }
    }
    // far-off places: listed along the bottom with a little direction arrow (tap to follow)
    off.forEach(({ pl, on, a }, i) => {
      const y = H - 22 - (off.length - 1 - i) * 30, x = 22;
      c.fillStyle = 'rgba(239,228,204,.92)'; c.fillRect(8, y - 18, W - 16, 28);
      c.save(); c.translate(x, y - 4); c.rotate(a); c.fillStyle = on ? '#e8604c' : '#2a2230';
      c.beginPath(); c.moveTo(10, 0); c.lineTo(-6, -7); c.lineTo(-3, 0); c.lineTo(-6, 7); c.closePath(); c.fill(); c.restore();
      c.font = `${on ? 700 : 600} 21px "Patrick Hand", cursive`; c.fillStyle = on ? '#c7533e' : '#2a2230'; c.textAlign = 'left';
      c.fillText(`${pl.name} · ${Math.round(arc(player.st.dir, pl.dir) * 1.5)} m`, x + 18, y + 3);
      mapHits.push({ x: W / 2, y: y - 4, key: pl.key });
    });
    // the car and you
    const car = toXY(placesCar());
    if (car && player.st.mode === 'walk') { c.fillStyle = '#d9573f'; c.strokeStyle = '#2a2230'; c.lineWidth = 2; c.fillRect(car[0] - 7, car[1] - 4, 14, 8); c.strokeRect(car[0] - 7, car[1] - 4, 14, 8); }
    const me = toXY(player.st.dir);
    if (me) {
      const ah = town.toTown(player.st.dir.clone().multiplyScalar(40).addScaledVector(player.st.heading, 2).normalize());
      const [mx, my] = town.toTown(player.st.dir), a = Math.atan2(-(ah[1] - my), -(ah[0] - mx));
      c.save(); c.translate(me[0], me[1]); c.rotate(a);
      c.fillStyle = '#e8604c'; c.strokeStyle = '#2a2230'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(13, 0); c.lineTo(-9, -9); c.lineTo(-4, 0); c.lineTo(-9, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
      c.font = '700 20px "Caveat", cursive'; c.fillStyle = '#2a2230'; c.textAlign = 'center'; c.fillText('you', me[0], me[1] + 26);
    }
    c.strokeStyle = '#2a2230'; c.lineWidth = 3; c.strokeRect(2, 2, W - 4, H - 4);
    c.font = '700 26px "Caveat", cursive'; c.textAlign = 'left'; c.fillText('N ↑', 16, 34);
  }
  let placesCar = () => player.st.dir;
  const setCar = (f) => { placesCar = f; };

  // ── the camera: grab the frame right after it's drawn, as a polaroid ──
  function afterRender(renderer, placeName) {
    if (!S.shoot) return;
    S.shoot = false;
    const src = renderer.domElement, w = 480, h = Math.round(480 * src.height / src.width);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(src, 0, 0, w, h);
    S.photos.push({ src: cv.toDataURL('image/jpeg', 0.82), cap: `${placeName} · ${clock()}` });
    const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    toast('Photos', `Saved — ${placeName}`);
  }

  function tick(dt) {
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) show($('toast'), false); }
    if (S.open && S.app === 'map') { S.mapT += dt; if (S.mapT > 0.25) { S.mapT = 0; drawMap(); } }
  }
  // keys: B backpack, P phone, Esc closes
  addEventListener('keydown', (e) => {
    if (!player.st.playing) return;
    if (e.code === 'KeyP') { if (S.open) close(); else open(S.unread ? 'messages' : 'home'); }
    if (e.code === 'KeyB') { if (S.bag) closeAll(); else openBag(); }
    if (e.code === 'Escape') closeAll();
  });
  $('bagBtn').onclick = () => (S.bag ? closeAll() : openBag());
  return { push, open, close, closeAll, openBag, addItem, tick, afterRender, setCar, setReply, setTyping, state: S, get busy() { return S.bag || (S.open && S.app !== 'camera'); } };
}
