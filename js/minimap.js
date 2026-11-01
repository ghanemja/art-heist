// ─── THE MINI MAP: where you are, and a quick way to anywhere ───────────────
// A round, hand-drawn map in the bottom-right corner while you're on foot: the roads,
// water, parks and buildings round her, her arrow, the lead you're following, and the
// named places nearby. It turns with the camera (what's up on the map is ahead on the
// screen), like the driving map (route.js) that takes the corner when you drive to a lead.
// The expanded view is the whole town, north up — the same projection as the phone's Map
// (phone.js) — with a list of every place on the planet.
// Tap a place (on either map, or in the list) to TRAVEL there: a fade, and she's on foot
// in front of it, facing it, on open ground (off the roads, out of every footprint) —
// on foot only, and never mid-scene (conversations, rooms, the telescope, the club, the
// launch countdown…). It's all a 2D canvas: no draw calls; the background is drawn once
// per area and only re-blitted, a few times a second.
import * as THREE from 'three';
import { R, ROADS, arc, isWater, onRoad, standAt, radiusAt, footing } from './world.js';
import PLAN from './manifest.js';

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const INK = '#2a2230', PAPER = '#efe4cc', WATER = '#9fc6cf', LAWN = '#b8cf93', ROAD = '#8a8392', ROADEDGE = '#f6efdf', HOUSE = '#d9c39c', RED = '#e8604c', GOLD = '#e4b84f';
const UP = new THREE.Vector3(0, 1, 0), XAX = new THREE.Vector3(1, 0, 0);
const MAP_ICON = '<svg viewBox="0 0 40 40" width="26" height="26"><path d="M6 11l9-4 10 4 9-4v22l-9 4-10-4-9 4z" fill="#f6efdf" stroke="#2a2230" stroke-width="2.4" stroke-linejoin="round"/><path d="M15 7v22M25 11v22" stroke="#2a2230" stroke-width="2"/><circle cx="20" cy="18" r="3" fill="#e8604c"/></svg>';
const BIG_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#2a2230" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"/></svg>';

export function createMinimap({ town, player, game, rooms }) {
  const G = game.G, st = player.st;

  // ── the places you can go: the story's places, the sites round the planet, Janelle's shops ──
  const mf = town.museumFrame;
  const places = [];
  const add = (key, name, dir, o = {}) => { if (dir) places.push({ key, name, dir: dir.clone().normalize(), r: 2.6, ...o }); };
  add('museum', 'The Museum', town.museum.dir, { spot: [mf(0.8, 3.4), mf(0, -6)], big: true });
  add('main', 'Main Street', town.townAt([2, 0]), { r: 1.6, big: true });
  if (town.mall) add('mall', 'Maple Plaza', town.mall.dir, { r: 3.5 });
  if (town.park) add('park', PLAN.park?.name || 'Lantern Park', town.park.dir, { r: (PLAN.park?.r ?? 4.9) * 0.9 });
  for (const [k, s] of Object.entries(town.sites || {})) {
    if (k === 'airport') continue;                                       // (nothing out there yet)
    add(k === 'launchpad' ? 'cape' : k, s.name || k, s.dir, { r: Math.max(2.4, (s.r ?? 3) * 0.8) });
  }
  if (town.island) add('island', PLAN.terrain.island?.name || 'Gull Island', town.island.dir, { r: 3 });
  const N = town.north || {};
  if (N.club?.dir) add('club', 'The Country Club', N.club.dir, { r: 5 });
  if (N.range?.dir) add('range', 'The Driving Range', N.range.dir, { r: 4.5 });
  if (N.close?.dir) add('close', 'Riverbend Close', N.close.dir, { r: 2.2 });
  for (const lm of town.landmarks) add('lm:' + lm.key, lm.name, lm.dir, { r: 3.2, lm });
  const placeByKey = new Map(places.map(p => [p.key, p]));

  // ── the DOM ──
  const box = document.createElement('div');
  box.id = 'mm'; box.className = 'ui hide';
  box.innerHTML = `<canvas id="mmCv"></canvas><button id="mmBigB" class="mmb" title="the whole map (G)" aria-label="open the big map">${BIG_ICON}</button>
    <button id="mmMinB" class="mmb" title="hide the map" aria-label="hide the mini map">–</button><div id="mmNear"></div>`;
  const pill = document.createElement('button');
  pill.id = 'mmPill'; pill.className = 'ui sk hide'; pill.title = 'show the map'; pill.setAttribute('aria-label', 'show the mini map'); pill.innerHTML = MAP_ICON;
  const big = document.createElement('div');
  big.id = 'mmBig'; big.className = 'ui sk fade hide';
  big.innerHTML = `<button class="sk x" id="mmBigX">close</button><h2>Map</h2>
    <div class="mmWrap"><canvas id="mmBigCv"></canvas><div class="mmList" id="mmList"></div></div>
    <p class="soft">tap a place to go there on foot · <kbd>G</kbd> or <kbd>Esc</kbd> closes</p>`;
  const ask = document.createElement('div');
  ask.id = 'mmAsk'; ask.className = 'ui sk fade hide';
  const fade = document.createElement('div');
  Object.assign(fade.style, { position: 'fixed', inset: '0', background: '#f3ead7', opacity: '0', pointerEvents: 'none', transition: 'opacity .38s ease', zIndex: 41 });
  document.body.append(box, pill, big, ask, fade);
  const cv = $('mmCv'), c = cv.getContext('2d'), bcv = $('mmBigCv'), bc = bcv.getContext('2d');
  // (the player's drag-to-look starts on any CANVAS: keep presses on the maps to the maps)
  for (const el of [box, pill, big, ask]) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  // minimised? (remembered)
  let min = false; try { min = localStorage.getItem('mmMin') === '1'; } catch {}
  const setMin = (v) => { min = v; try { localStorage.setItem('mmMin', v ? '1' : '0'); } catch {} hideAsk(); dirty = true; };
  $('mmMinB').onclick = (e) => { e.stopPropagation(); setMin(true); };
  pill.onclick = (e) => { e.stopPropagation(); setMin(false); };
  $('mmBigB').onclick = (e) => { e.stopPropagation(); openBig(); };
  $('mmBigX').onclick = () => closeBig();

  // ── can she travel right now? (a reason if not) ──
  const insideShop = () => town.landmarks.some(lm => {
    if (!lm.inside || !lm.root || arc(st.dir, lm.dir) > 6) return false;
    const p = lm.root.worldToLocal(st.dir.clone().multiplyScalar(R));
    return lm.inside(p.x, p.z);
  });
  function refusal() {
    if (G.state !== 'play' || !st.playing) return 'Not just now.';
    if (G.ui === 'talk') return 'You\'re in the middle of a conversation — finish talking first.';
    if (G.act === 3) return 'No time for that — the launch is counting down. Run!';
    if (G.ui === 'activity') return 'Finish what you\'re doing first (Esc to stop).';
    if (G.ui === 'scope') return 'Step back from the telescope first.';
    if (G.ui || G.room || rooms?.inside) return 'Finish what you\'re doing first.';
    if (game.phone?.busy) return 'Put the phone away first.';
    if (st.mode === 'jeep') return 'Travel is on foot — park the car first (E to get out).';
    if (st.mode === 'boat') return 'Travel is on foot — moor the boat by the pier or the shore first (E to get out).';
    if (insideShop()) return 'Step outside first.';
    if (!st.enabled && !bigOpen) return 'Not just now.';
    return null;
  }

  // ── a safe spot in front of a place: on the ground, off the roads, out of every footprint ──
  const bodies = () => (game.bumps?.bodies || []).map(b => b.obj).filter(o => o.visible);
  function okSpot(d, people) {
    if (isWater(d, 0)) return false;
    if (onRoad(d, 0.55)) return false;
    for (const k of town.colliders) if (arc(d, k.dir) < k.r + 0.45) return false;
    for (const lm of town.landmarks) {
      if (!lm.inside || !lm.root || arc(d, lm.dir) > 8) continue;
      const p = lm.root.worldToLocal(d.clone().multiplyScalar(R));
      if (lm.inside(p.x, p.z)) return false;
    }
    if (town.train?.inside(d)) return false;
    for (const o of people) if (arc(d, o.position.clone().normalize()) < 0.9) return false;
    const s = standAt(d);
    if (s - radiusAt(d) > 0.6) return false;                             // up on something, not the ground
    if (footing(d, s).wall) return false;                                // a riser right at her feet
    return true;
  }
  // …and room behind her for the follow camera: nothing solid (or anyone) where it will stand
  const _bk = new THREE.Vector3();
  function clearBehind(d, T, people) {
    const back = d.clone().sub(T).addScaledVector(d, -d.dot(d.clone().sub(T))).normalize();
    for (const dist of [1.2, 2.4, 3.6, 4.8, 6.0]) {            // (the camera rides ~6 behind her)
      _bk.copy(d).multiplyScalar(R).addScaledVector(back, dist).normalize();
      for (const k of town.colliders) if (k.r >= 0.12 && arc(_bk, k.dir) < k.r + 0.3) return false;
      for (const o of people) if (arc(_bk, o.position.clone().normalize()) < 0.55) return false;
      for (const lm of town.landmarks) {
        if (!lm.inside || !lm.root || arc(_bk, lm.dir) > 8) continue;
        const q = lm.root.worldToLocal(_bk.clone().multiplyScalar(R));
        if (lm.inside(q.x, q.z)) return false;
      }
    }
    return true;
  }
  function frontOf(p) {
    if (p.spot) return p.spot[1];
    if (p.lm?.root) return p.lm.root.localToWorld(new THREE.Vector3(0, 0, 6)).normalize();   // a shop faces its +z (its door)
    return town.dirC;                                                    // the sites all face the town
  }
  function findSpot(p) {
    const T = p.dir, people = bodies();
    if (p.spot && okSpot(p.spot[0], people) && clearBehind(p.spot[0], p.dir, people)) return p.spot[0];
    let f = frontOf(p).clone().sub(T.clone().multiplyScalar(T.dot(frontOf(p))));
    if (f.lengthSq() < 1e-8) f = UP.clone().sub(T.clone().multiplyScalar(T.y));
    f.normalize();
    const side = new THREE.Vector3().crossVectors(f, T).normalize();
    // the best spot has a clear view behind it too; failing that, any safe spot will do
    let fallback = null;
    for (let dist = p.r; dist < p.r + 9; dist += 0.5) {
      for (const a of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.3, -1.3, 1.7, -1.7, 2.1, -2.1, 2.6, -2.6, Math.PI]) {
        const d = T.clone().multiplyScalar(R).addScaledVector(f, Math.cos(a) * dist).addScaledVector(side, Math.sin(a) * dist).normalize();
        if (!okSpot(d, people)) continue;
        if (clearBehind(d, T, people)) return d;
        fallback ||= d;
      }
    }
    return fallback;
  }

  // ── travel: ask, then fade, move her, fade back ──
  let pending = null, travelling = false;
  function hideAsk() { ask.classList.add('hide'); pending = null; }
  function offer(p, where) {
    if (travelling) return;
    const why = refusal();
    ask.dataset.at = where;
    const dist = Math.round(arc(st.dir, p.dir) * 1.5);
    if (why) {
      ask.innerHTML = `<b>${esc(p.name)}</b><p>${esc(why)}</p><div class="row"><button class="sk" id="mmNo">ok</button></div>`;
      pending = null;
    } else {
      ask.innerHTML = `<b>${esc(p.name)}</b><p>${dist} m away. Go there now?</p><div class="row"><button class="sk next" id="mmGo">travel here</button><button class="sk" id="mmNo">cancel</button></div>`;
      pending = p;
      $('mmGo').onclick = () => travel(p);
    }
    $('mmNo').onclick = hideAsk;
    ask.classList.remove('hide');
  }
  function travel(p) {
    hideAsk();
    if (travelling || refusal()) return;
    closeBig();
    travelling = true; st.enabled = false;
    fade.style.opacity = '1';
    setTimeout(() => {
      // (the spot is searched for behind the fade: a few dozen ground probes)
      const spot = G.state === 'play' && !G.ui && !G.room ? findSpot(p) : null;
      if (!spot) {
        fade.style.opacity = '0'; travelling = false;
        if (G.state === 'play' && !G.ui && !G.room) st.enabled = true;
        ask.dataset.at = 'mini';
        ask.innerHTML = `<b>${esc(p.name)}</b><p>There's nowhere clear to stand there just now.</p><div class="row"><button class="sk" id="mmNo">ok</button></div>`;
        $('mmNo').onclick = hideAsk; ask.classList.remove('hide'); return;
      }
      // arrive standing still, facing the place, the camera cut in behind her
      st.dir.copy(spot);
      const h = p.dir.clone().addScaledVector(spot, -spot.dot(p.dir));
      if (h.lengthSq() < 1e-10) h.copy(st.heading).addScaledVector(spot, -spot.dot(st.heading));
      st.heading.copy(h.normalize()); st.camFwd.copy(st.heading);
      Object.assign(st, { speed: 0, steer: 0, gr: 0, grT: null, camYaw: 0, recenter: 0, camInit: false });
      st.keys.clear();
      dirty = true; bigT = 0;
      setTimeout(() => {
        fade.style.opacity = '0';
        if (G.state === 'play' && !G.ui && !G.room) st.enabled = true;
        travelling = false;
      }, 120);
    }, 420);
  }

  // ── the mini map: heading-up, centred on her; the background cached per area ──
  const VIEW = 21;                                    // world units from the centre to the rim
  const BG_R = 34, BG_K = 6, BG = Math.ceil(BG_R * 2 * BG_K);   // the cached area round its anchor, at 6 px a unit
  const bg = document.createElement('canvas'); bg.width = bg.height = BG;
  const anc = { A: null, n: new THREE.Vector3(), e: new THREE.Vector3(), roads: -1 };
  let dirty = true, lastPhi = 0, hits = [];
  const _t = new THREE.Vector3(), _nP = new THREE.Vector3(), _eP = new THREE.Vector3();
  // azimuthal (equidistant) projection about the anchor: a direction → [x east, y north] in units
  function projA(d, out = [0, 0]) {
    const A = anc.A, cs = Math.min(1, Math.max(-1, A.dot(d))), th = Math.acos(cs);
    _t.copy(d).addScaledVector(A, -cs);
    const L = _t.length();
    if (L < 1e-9) { out[0] = out[1] = 0; return out; }
    out[0] = _t.dot(anc.e) / L * th * R; out[1] = _t.dot(anc.n) / L * th * R;
    return out;
  }
  function unprojA(x, y, out) {
    const th = Math.hypot(x, y) / R;
    if (th < 1e-9) return out.copy(anc.A);
    return out.copy(anc.A).multiplyScalar(Math.cos(th)).addScaledVector(_t.copy(anc.e).multiplyScalar(x).addScaledVector(anc.n, y).normalize(), Math.sin(th));
  }
  const waterCache = new Map();
  function wet(d) {                                   // isWater, remembered per ~0.5-unit patch
    const k = Math.round(d.x * 80) + ',' + Math.round(d.y * 80) + ',' + Math.round(d.z * 80);
    let v = waterCache.get(k); if (v === undefined) { v = isWater(d); waterCache.set(k, v); } return v;
  }
  const maskCanvas = (n) => { const m = document.createElement('canvas'); m.width = m.height = n; return m; };
  const roadCount = () => ROADS.reduce((a, r) => a + r.pts.length, 0);
  function polyline(ctx, pts, closed, proj, keep) {
    ctx.beginPath(); let pen = false;
    const P = closed ? [...pts, pts[0]] : pts, xy = [0, 0];
    for (const p of P) {
      if (!keep(p)) { pen = false; continue; }
      proj(p, xy);
      if (pen) ctx.lineTo(xy[0], xy[1]); else { ctx.moveTo(xy[0], xy[1]); pen = true; }
    }
  }
  // what's drawn under everything: the ground, the water, lawns, roads, buildings
  function paintGround(ctx, proj, keep, k, sampleWater) {
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    sampleWater(ctx);
    const xy = [0, 0];
    ctx.fillStyle = LAWN;                             // the park and the club's lawns
    for (const p of places) if (['park', 'club', 'range'].includes(p.key) && keep(p.dir)) { proj(p.dir, xy); ctx.beginPath(); ctx.arc(xy[0], xy[1], (p.r / 0.9) * k, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineCap = ctx.lineJoin = 'round';
    for (const rd of ROADS) {
      polyline(ctx, rd.pts, rd.closed, proj, keep);
      ctx.strokeStyle = ROADEDGE; ctx.lineWidth = Math.max(3, (rd.half * 2 + 0.5) * k); ctx.stroke();
      ctx.strokeStyle = ROAD; ctx.lineWidth = Math.max(2, rd.half * 2 * k); ctx.stroke();
    }
    // the cobbled footpaths (footpaths.js): thin warm-stone lines from the park out to the roads and the meadow
    for (const pts of town.footpaths?.lines || []) {
      polyline(ctx, pts, false, proj, keep);
      ctx.strokeStyle = '#b9a688'; ctx.lineWidth = Math.max(1, 0.62 * k); ctx.stroke();
    }
    // buildings: the solid footprints (trees and posts are left off), drawn as one inked
    // silhouette — an ink pass a touch wider, then the fill over it, so the circles merge
    const solids = town.colliders.filter(s => s.r >= 0.6 && !s.soft && !s.carOnly && keep(s.dir));
    const ink = Math.max(1, k * 0.14);
    for (const [col, pad] of [['rgba(42,34,48,.6)', ink], [HOUSE, 0]]) {
      ctx.fillStyle = col; ctx.beginPath();
      for (const s of solids) { proj(s.dir, xy); ctx.moveTo(xy[0] + s.r * k * 1.08 + pad, xy[1]); ctx.arc(xy[0], xy[1], s.r * k * 1.08 + pad, 0, Math.PI * 2); }
      ctx.fill();
    }
  }
  function cacheBackground() {
    anc.A = st.dir.clone();
    anc.n.copy(UP).addScaledVector(anc.A, -anc.A.y);
    if (anc.n.lengthSq() < 1e-4) anc.n.copy(XAX).addScaledVector(anc.A, -anc.A.x);
    anc.n.normalize(); anc.e.crossVectors(anc.n, anc.A).normalize();
    anc.roads = roadCount();
    const ctx = bg.getContext('2d'), C = BG / 2, d = new THREE.Vector3();
    const proj = (p, out) => { projA(p, out); out[0] = C + out[0] * BG_K; out[1] = C - out[1] * BG_K; return out; };
    const reach = Math.cos((BG_R * 1.5) / R);
    paintGround(ctx, proj, (p) => p.dot(anc.A) > reach, BG_K, (ctx) => {
      // the water: sampled once a unit into a tiny mask, scaled up smooth (soft shores, not steps)
      const n = BG_R * 2, wc = maskCanvas(n), w = wc.getContext('2d');
      w.clearRect(0, 0, n, n); w.fillStyle = WATER;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (wet(unprojA(-BG_R + i + 0.5, BG_R - j - 0.5, d))) w.fillRect(i, j, 1, 1);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(wc, 0, 0, BG, BG);
    });
    dirty = true;
  }
  // a direction, as seen from her: [bearing from the map's north (radians), distance (units)]
  function bearing(d) {
    const P = st.dir;
    _t.copy(d).addScaledVector(P, -P.dot(d));
    return [Math.atan2(_t.dot(_eP), _t.dot(_nP)), arc(P, d)];
  }
  function fitCanvas(el, ctx) {
    const r = el.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w && h && (el.width !== w || el.height !== h)) { el.width = w; el.height = h; }
    return dpr;
  }
  function drawMini() {
    const dpr = fitCanvas(cv, c), S = cv.width, CX = S / 2, rim = S / 2 - 2 * dpr, k = rim / VIEW;
    if (!S) return;
    if (!anc.A || arc(anc.A, st.dir) > BG_R - VIEW - 4 || anc.roads !== roadCount()) cacheBackground();
    // the anchor's north, carried to where she stands; the camera's bearing from it
    _nP.copy(anc.n).addScaledVector(st.dir, -st.dir.dot(anc.n)).normalize(); _eP.crossVectors(_nP, st.dir).normalize();
    const f = _t.copy(st.camFwd).addScaledVector(st.dir, -st.dir.dot(st.camFwd));
    const phi = Math.atan2(f.dot(_eP), f.dot(_nP)); lastPhi = phi;
    const [px, py] = projA(st.dir);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(CX, CX, rim, 0, Math.PI * 2); c.clip();
    c.translate(CX, CX); c.rotate(-phi); c.scale(k / BG_K, k / BG_K);
    c.drawImage(bg, -(BG / 2 + px * BG_K), -(BG / 2 - py * BG_K));
    c.restore();
    const at = (b, dist) => { const a = b - phi; return [CX + Math.sin(a) * dist * k, CX - Math.cos(a) * dist * k]; };
    // places: a dot and a name; the lead in red
    const tgt = game.target?.() || null;
    hits = [];
    c.textAlign = 'center'; c.lineJoin = 'round';
    const fs = Math.round(11.5 * dpr);
    c.font = `${fs}px "Patrick Hand", cursive`;
    for (const p of places) {
      const [b, dist] = bearing(p.dir); if (dist > VIEW - 1.5) continue;
      const [x, y] = at(b, dist);
      c.fillStyle = GOLD; c.strokeStyle = INK; c.lineWidth = 1.6 * dpr;
      c.beginPath(); c.arc(x, y, (p.big ? 4.5 : 3.6) * dpr, 0, Math.PI * 2); c.fill(); c.stroke();
      const lab = p.name.replace(/^The /, '');
      c.lineWidth = 3 * dpr; c.strokeStyle = 'rgba(246,239,223,.9)'; c.strokeText(lab, x, y - 6 * dpr);
      c.fillStyle = INK; c.fillText(lab, x, y - 6 * dpr);
      hits.push({ x: x / dpr, y: y / dpr, p });
    }
    // the car, while you're on foot
    if (st.mode === 'walk' && game.jeepSpot) {
      const [b, dist] = bearing(game.jeepSpot());
      if (dist < VIEW - 1) { const [x, y] = at(b, dist); c.save(); c.translate(x, y); c.rotate(0); c.fillStyle = '#d9573f'; c.strokeStyle = INK; c.lineWidth = 1.5 * dpr; c.fillRect(-4 * dpr, -3 * dpr, 8 * dpr, 6 * dpr); c.strokeRect(-4 * dpr, -3 * dpr, 8 * dpr, 6 * dpr); c.restore(); }
    }
    // the lead: a pin on the map, or an arrow on the rim pointing the way
    if (tgt) {
      const [b, dist] = bearing(tgt.dir);
      c.fillStyle = RED; c.strokeStyle = INK; c.lineWidth = 2 * dpr;
      if (dist < VIEW - 2) {
        const [x, y] = at(b, dist);
        c.beginPath(); c.arc(x, y - 7 * dpr, 5.5 * dpr, 0, Math.PI * 2); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(x - 4 * dpr, y - 4 * dpr); c.lineTo(x, y + 2 * dpr); c.lineTo(x + 4 * dpr, y - 4 * dpr); c.fill();
      } else {
        const a = b - phi, ex = CX + Math.sin(a) * (rim - 9 * dpr), ey = CX - Math.cos(a) * (rim - 9 * dpr);
        c.save(); c.translate(ex, ey); c.rotate(a - Math.PI / 2);
        c.beginPath(); c.moveTo(9 * dpr, 0); c.lineTo(-6 * dpr, -6.5 * dpr); c.lineTo(-2.5 * dpr, 0); c.lineTo(-6 * dpr, 6.5 * dpr); c.closePath(); c.fill(); c.stroke(); c.restore();
      }
    }
    // north, on the rim
    { const a = -phi, x = CX + Math.sin(a) * (rim - 8 * dpr), y = CX - Math.cos(a) * (rim - 8 * dpr);
      c.font = `700 ${Math.round(13 * dpr)}px "Caveat", cursive`; c.lineWidth = 3 * dpr; c.strokeStyle = PAPER; c.strokeText('N', x, y + 4 * dpr); c.fillStyle = INK; c.fillText('N', x, y + 4 * dpr); }
    // her: an arrow in the middle, turned to the way she faces
    {
      const hb = bearing(_t.copy(st.dir).multiplyScalar(R).addScaledVector(st.heading, 1).normalize())[0];
      c.save(); c.translate(CX, CX); c.rotate(hb - phi);
      c.fillStyle = RED; c.strokeStyle = INK; c.lineWidth = 2 * dpr;
      c.beginPath(); c.moveTo(0, -8 * dpr); c.lineTo(6 * dpr, 6 * dpr); c.lineTo(0, 3 * dpr); c.lineTo(-6 * dpr, 6 * dpr); c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    c.strokeStyle = INK; c.lineWidth = 2.5 * dpr; c.beginPath(); c.arc(CX, CX, rim, 0, Math.PI * 2); c.stroke();
    // where you are, in words
    let near = null, nd = 9;
    for (const p of places) { const a = arc(st.dir, p.dir); if (a < nd) { nd = a; near = p; } }
    const txt = near ? `near ${near.name.replace(/^The /, 'the ')}` : 'out in the country';
    const nEl = $('mmNear'); if (nEl.textContent !== txt) nEl.textContent = txt;
  }
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 16;
    for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h.p; } }
    if (best) offer(best, 'mini'); else openBig();
  });

  // ── the big map: the town, north up, as the phone draws it ──
  const BW = 600, SC = 7.2;
  let bigOpen = false, bigT = 0, bigHits = [], bigBg = null, bigRoads = -1, wasEnabled = true;
  const toXY = (d, out = [0, 0]) => { if (d.dot(town.dirC) < 0.3) return null; const [x, y] = town.toTown(d); out[0] = BW / 2 - x * SC; out[1] = BW / 2 - y * SC; return out; };
  function cacheBig() {
    bigBg = document.createElement('canvas'); bigBg.width = bigBg.height = BW; bigRoads = roadCount();
    const ctx = bigBg.getContext('2d');
    paintGround(ctx, (p, out) => toXY(p, out) || (out[0] = out[1] = -999, out), (p) => p.dot(town.dirC) > 0.3, SC, (ctx) => {
      const n = BW / 6, wc = maskCanvas(n), w = wc.getContext('2d');
      w.clearRect(0, 0, n, n); w.fillStyle = WATER;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (wet(town.townAt([(BW / 2 - i * 6 - 3) / SC, (BW / 2 - j * 6 - 3) / SC]))) w.fillRect(i, j, 1, 1);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(wc, 0, 0, BW, BW);
    });
  }
  function drawBig() {
    fitCanvas(bcv, bc);
    const S = bcv.width; if (!S) return;
    if (!bigBg || bigRoads !== roadCount()) cacheBig();
    const k = S / BW;
    bc.setTransform(1, 0, 0, 1, 0, 0); bc.clearRect(0, 0, S, S);
    bc.drawImage(bigBg, 0, 0, S, S);
    bc.setTransform(k, 0, 0, k, 0, 0);
    const tgt = game.target?.() || null, xy = [0, 0];
    bigHits = [];
    bc.textAlign = 'center'; bc.lineJoin = 'round';
    for (const p of places) {
      const on = tgt && arc(tgt.dir, p.dir) < 1.5;
      const q = toXY(p.dir, xy);
      if (q && q[0] > 14 && q[0] < BW - 14 && q[1] > 14 && q[1] < BW - 14) {
        bc.fillStyle = on ? RED : GOLD; bc.strokeStyle = INK; bc.lineWidth = 2.2;
        bc.beginPath(); bc.arc(q[0], q[1], p.big ? 7 : 5.5, 0, Math.PI * 2); bc.fill(); bc.stroke();
        bc.font = '600 17px "Patrick Hand", cursive';
        bc.lineWidth = 4; bc.strokeStyle = 'rgba(246,239,223,.92)'; bc.strokeText(p.name, q[0], q[1] - 10);
        bc.fillStyle = INK; bc.fillText(p.name, q[0], q[1] - 10);
        bigHits.push({ x: q[0], y: q[1], p });
      } else {                                                         // off the map: an arrow on the edge
        const dx = -p.dir.dot(town.axes.side), dy = p.dir.dot(town.axes.fwd), a = Math.atan2(-dy, dx);
        const kk = Math.min((BW / 2 - 16) / Math.max(1e-3, Math.abs(Math.cos(a))), (BW / 2 - 16) / Math.max(1e-3, Math.abs(Math.sin(a))));
        const x = BW / 2 + Math.cos(a) * kk, y = BW / 2 + Math.sin(a) * kk;
        bc.save(); bc.translate(x, y); bc.rotate(a); bc.fillStyle = on ? RED : INK;
        bc.beginPath(); bc.moveTo(11, 0); bc.lineTo(-7, -7); bc.lineTo(-3, 0); bc.lineTo(-7, 7); bc.closePath(); bc.fill(); bc.restore();
        bigHits.push({ x, y, p });
      }
    }
    if (tgt && !places.some(p => arc(tgt.dir, p.dir) < 1.5)) {        // a lead that isn't a place (a person): a red pin
      const q = toXY(tgt.dir, xy);
      if (q) { bc.fillStyle = RED; bc.strokeStyle = INK; bc.lineWidth = 2.2; bc.beginPath(); bc.arc(q[0], q[1] - 9, 7, 0, Math.PI * 2); bc.fill(); bc.stroke(); bc.beginPath(); bc.moveTo(q[0] - 5, q[1] - 5); bc.lineTo(q[0], q[1] + 3); bc.lineTo(q[0] + 5, q[1] - 5); bc.fill(); }
    }
    if (st.mode === 'walk' && game.jeepSpot) {
      const q = toXY(game.jeepSpot(), xy);
      if (q) { bc.fillStyle = '#d9573f'; bc.strokeStyle = INK; bc.lineWidth = 2; bc.fillRect(q[0] - 7, q[1] - 4, 14, 8); bc.strokeRect(q[0] - 7, q[1] - 4, 14, 8); }
    }
    const me = toXY(st.dir, [0, 0]);
    if (me) {
      const ah = town.toTown(st.dir.clone().multiplyScalar(R).addScaledVector(st.heading, 2).normalize());
      const [mx, my] = town.toTown(st.dir), a = Math.atan2(-(ah[1] - my), -(ah[0] - mx));
      bc.save(); bc.translate(me[0], me[1]); bc.rotate(a);
      bc.fillStyle = RED; bc.strokeStyle = INK; bc.lineWidth = 3;
      bc.beginPath(); bc.moveTo(13, 0); bc.lineTo(-9, -9); bc.lineTo(-4, 0); bc.lineTo(-9, 9); bc.closePath(); bc.fill(); bc.stroke(); bc.restore();
      bc.font = '700 20px "Caveat", cursive'; bc.fillStyle = INK; bc.fillText('you', me[0], me[1] + 26);
    }
    bc.strokeStyle = INK; bc.lineWidth = 3; bc.strokeRect(2, 2, BW - 4, BW - 4);
    bc.font = '700 26px "Caveat", cursive'; bc.textAlign = 'left'; bc.fillStyle = INK; bc.fillText('N ↑', 14, 32);
    bc.setTransform(1, 0, 0, 1, 0, 0);
  }
  function renderList() {
    const rows = places.map(p => ({ p, d: arc(st.dir, p.dir) })).sort((a, b) => a.d - b.d);
    $('mmList').innerHTML = rows.map(({ p, d }) => `<button class="mmRow" data-k="${esc(p.key)}"><span>${esc(p.name)}</span><i>${Math.round(d * 1.5)} m</i></button>`).join('');
    $('mmList').querySelectorAll('.mmRow').forEach(b => b.onclick = () => offer(placeByKey.get(b.dataset.k), 'big'));
  }
  bcv.addEventListener('click', (e) => {
    const r = bcv.getBoundingClientRect(), x = (e.clientX - r.left) * (BW / r.width), y = (e.clientY - r.top) * (BW / r.height);
    let best = null, bd = 26;
    for (const h of bigHits) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h.p; } }
    if (best) offer(best, 'big');
  });
  function openBig() {
    if (bigOpen || G.state !== 'play' || G.ui || G.room || travelling) return;
    bigOpen = true; hideAsk();
    wasEnabled = st.enabled; st.enabled = false;
    big.classList.remove('hide'); renderList(); bigT = 0;
  }
  function closeBig() {
    if (!bigOpen) return;
    bigOpen = false; hideAsk(); big.classList.add('hide');
    if (wasEnabled && !travelling && G.state === 'play' && !G.ui && !G.room) st.enabled = true;
  }
  addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (e.code === 'KeyG' && G.state === 'play') { if (bigOpen) closeBig(); else if (!G.ui && !G.room && !game.phone?.busy) openBig(); }
    if (e.code === 'Escape') { if (!ask.classList.contains('hide')) hideAsk(); else closeBig(); }
  });

  // ── per frame: show or hide, and redraw a few times a second ──
  let shown = null, pillOn = null, busyOn = null, sinceDraw = 0;
  const drivingMap = $('minimapBox');
  function update(dt) {
    const play = G.state === 'play' && st.playing;
    // (the driving map has this corner while it's up; the scenes that take the screen hide it)
    const free = play && !G.room && !rooms?.inside && !['scope', 'activity', 'police', 'room'].includes(G.ui)
      && (!drivingMap || drivingMap.classList.contains('hide')) && !document.body.classList.contains('cine');
    const on = free && !min;
    if (on !== shown) { shown = on; box.classList.toggle('hide', !on); dirty = true; }
    if ((free && min) !== pillOn) { pillOn = free && min; pill.classList.toggle('hide', !pillOn); }
    if (!!G.ui !== busyOn) { busyOn = !!G.ui; document.body.classList.toggle('mm-busy', busyOn); }
    if (bigOpen && (G.state !== 'play' || G.ui || G.room)) closeBig();
    if (!ask.classList.contains('hide') && (!free && !bigOpen || ask.dataset.at === 'mini' && !on)) hideAsk();
    if (pending && refusal()) hideAsk();                // the moment passed (someone started talking…)
    if (on) {
      // ~4 times a second; up to ~8 while the camera is turning, so the map keeps up with it
      sinceDraw += dt;
      const f = _t.copy(st.camFwd), turning = !!anc.A && Math.abs(Math.atan2(f.dot(_eP), f.dot(_nP)) - lastPhi) > 0.12;
      if (dirty || sinceDraw >= (turning ? 0.125 : 0.25)) { drawMini(); sinceDraw = 0; dirty = false; }
    }
    if (bigOpen) { bigT -= dt; if (bigT <= 0) { drawBig(); bigT = 0.3; } }
  }
  addEventListener('resize', () => { dirty = true; bigT = 0; });
  return { update, places, travel: (key) => travel(placeByKey.get(key)), offer: (key) => offer(placeByKey.get(key), 'mini'), findSpot: (key) => findSpot(placeByKey.get(key)), refusal, get bigOpen() { return bigOpen; }, get hits() { return hits; } };
}
