// node measure.mjs [label] [extra query] — load the main app headless, report load time and per-frame
// triangles/draws (fill vs ink) at Lantern Park, the meadow and by the museum; screenshots too.
// Headless perf + look check for the main app (see FEATURE_LOG 'feeling heavy'). Usage:
//   python3 -m http.server 8123 &            (from the repo root; PORT=<n> for another checkout)
//   (cd /tmp && npm pack three@0.160.0 && tar xzf three-0.160.0.tgz)   → THREE_DIR=/tmp/package serves three locally
//   node scripts/perf-measure.mjs <label> ["&tol=2"]   (full drawing by default; "&quality=low" for light mode)    → out/<label>.json + out/shots/<label>-<spot>.png
// Env: SHOTS=0 (no screenshots), CLOSE=0 (skip close-ups), ONLY=1 (park close-up only), PROBE=<file.js> (evaluated at each spot).
// Per spot: fill/ink triangles and draws per frame (tallied in renderBufferDirect), ms/frame, the culler's ms/frame while turning.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright/index.js'); }
const { chromium } = pw;
import fs from 'fs';
import path from 'path';
const SP = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'out');
fs.mkdirSync(SP, { recursive: true });
// (the full drawing unless asked: headless SwiftShader would otherwise choose light mode — quality.js)
const label = process.argv[2] || 'run', extra0 = process.argv[3] || '', extra = /quality=/.test(extra0) ? extra0 : extra0 + '&quality=high';
const shots = process.env.SHOTS !== '0';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
if (process.env.THREE_DIR) await page.route('https://unpkg.com/three@0.160.0/**', (r) => {
  const p = r.request().url().replace('https://unpkg.com/three@0.160.0/', process.env.THREE_DIR.replace(/\/$/, '') + '/');
  r.fulfill({ path: p, contentType: 'application/javascript' });
});
const errs = [], logs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errs.push(t); if (/ReadPixels|stall|perf:/i.test(t)) logs.push(m.type() + ': ' + t); });
const t0 = Date.now();
await page.goto(`http://localhost:${process.env.PORT || 8123}/index.html?dpr=1${extra}`, { waitUntil: 'commit', timeout: 0 });   // (the load event waits for the whole build: longer than goto's 30 s)
await page.waitForFunction(() => window.__v2?.culler, null, { timeout: 180000 });
const loadS = (Date.now() - t0) / 1000;
// play state, title hidden
await page.evaluate(() => {
  const { game, player } = window.__v2;
  game.G.state = 'play'; player.st.enabled = true; player.st.playing = true;
  document.getElementById('title')?.classList.add('hide');
  // tally draws by fill/ink
  const r = window.__v2.renderer, orig = r.renderBufferDirect.bind(r);
  window.__tally = { on: false, fill: 0, ink: 0, fd: 0, id: 0, by: {} };
  r.renderBufferDirect = function (cam, scene, geo, mat, obj, group) {
    const T = window.__tally;
    if (T.on) {
      let n = geo.index ? geo.index.count : geo.attributes.position.count;
      const dr = geo.drawRange; n = Math.min(n, dr.count) ;
      if (dr.start) n = Math.max(0, n - dr.start);
      if (group) n = Math.min(n, group.count);
      const ins = obj.isInstancedMesh ? obj.count : geo.isInstancedBufferGeometry ? geo.instanceCount : 1;
      const tris = (obj.isMesh ? n / 3 : 0) * (ins === Infinity ? 1 : ins);
      const ink = !!(obj.userData.isInk || mat.side === 1 && mat.isShaderMaterial && mat.uniforms?.uWeight);
      if (ink) { T.ink += tris; T.id++; } else { T.fill += tris; T.fd++; }
      let top = obj; while (top.parent && top.parent.type !== 'Scene') top = top.parent;
      const k = (ink ? 'ink:' : 'fill:') + (window.__lodset ? (window.__lodset.has(obj) ? 'LOD:' : (obj.material?.map ? 'TEX:' : obj.isSkinnedMesh ? 'SKIN:' : 'NO:')) : '') + (top.name || top.type) + '/' + (obj.name || obj.type);
      T.by[k] = (T.by[k] || 0) + tris;
    }
    return orig(cam, scene, geo, mat, obj, group);
  };
});
async function at(name, fn) {
  await page.evaluate(fn);
  // let the culler/LOD settle (and the background LOD work finish)
  await page.waitForFunction(() => window.__v2.culler.lodPending === 0, null, { timeout: 240000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const pr = process.env.PROBE ? await page.evaluate(fs.readFileSync(process.env.PROBE, 'utf8')) : undefined;
  const frames = (k) => page.evaluate((k) => new Promise((r) => { let n = 0; const f = () => (++n < k ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), k);
  // the triangles and draws of two frames (halved), and the frame time over the next 20
  const count = () => page.evaluate(async () => {
    const T = window.__tally; T.fill = T.ink = T.fd = T.id = 0; T.by = {};
    T.on = true; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); T.on = false;
    const info = window.__v2.renderer.info.render;
    const top = Object.entries(T.by).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ' ' + Math.round(v / 2000) + 'k');
    const t1 = performance.now(); let n = 0; await new Promise((res) => { const f = () => { if (++n < 20) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    return { fill: Math.round(T.fill / 2), ink: Math.round(T.ink / 2), fillDraws: T.fd / 2, inkDraws: T.id / 2, tris: info.triangles, calls: info.calls, ms: +((performance.now() - t1) / 20).toFixed(1), top };
  });
  // the screenshot first (the view as settled), then the count
  if (shots) await page.screenshot({ path: `${SP}/shots/${label}-${name}.png` });
  const m = await count();
  m.probe = pr;
  m.turnMs = await turn();
  return m;
}
// a turn on the spot (last: it leaves the camera swinging back): the culler's own time per frame
// (its patch rebuilds) while the view swings
function turn() {
  return page.evaluate(async () => {
    const C = window.__v2.culler, st = window.__v2.player.st; if (!C._t) { const u = C.update.bind(C); C._ms = 0; C.update = () => { const a = performance.now(); u(); C._ms += performance.now() - a; }; C._t = 1; }
    C._ms = 0; let nf = 0; const h0 = st.heading.clone();
    await new Promise((res) => { const f = () => { st.heading.applyAxisAngle(st.dir, 0.05); st.camFwd.copy(st.heading); if (++nf < 40) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    st.heading.copy(h0); st.camFwd.copy(h0);
    return +(C._ms / 40).toFixed(2);
  });
}
fs.mkdirSync(SP + '/shots', { recursive: true });
const place = (dirExpr, lookExpr) => `(() => { const V = window.__v2, st = V.player.st; const d = (${dirExpr}).clone().normalize(), L = (${lookExpr}).clone().normalize();
  st.dir.copy(d); st.heading.copy(L.sub(d.clone().multiplyScalar(d.dot(L)))).normalize(); st.camFwd.copy(st.heading); st.camInit = false; st.camYaw = 0; st.camPitch = 0; })()`;
const res = { label, loadS };
if (!process.env.ONLY) res.museum = await at('museum', place('V.town.museum.frame(0.8, 3.4)', 'V.town.museum.frame(0, -6)'));
if (!process.env.ONLY) res.park = await at('park', place('V.town.park.dir.clone().applyAxisAngle(V.town.park.dir.clone().cross(V.town.museum.frame(0,0)).normalize(), 4.2 / window.__R)', 'V.town.park.dir'));
if (!process.env.ONLY) res.meadow = await at('meadow', place('V.meadow.frame.at(0, -6)', 'V.meadow.frame.c'));
if (process.env.CLOSE !== '0') {
  const zoom = `; V.player.st.zoomT = V.player.st.zoom = 0.5;`;
  const pl = (d, l) => place(d, l).replace('st.camPitch = 0; })()', 'st.camPitch = 0' + zoom + ' })()');
  if (!process.env.ONLY) res.vivi = await at('vivi', pl('V.game.items.find(i => i.kind === "person").obj.position.clone().normalize().multiplyScalar(1).add(V.town.museum.frame(0, 6).clone().normalize().sub(V.town.museum.frame(0,0).clone().normalize()).multiplyScalar(0.06))', 'V.game.items.find(i => i.kind === "person").obj.position'));
  if (!process.env.ONLY) res.meadowClose = await at('meadowClose', pl('V.meadow.frame.at(0, -2.5)', 'V.meadow.frame.c'));
  res.parkClose = await at('parkClose', pl('V.town.park.dir.clone().applyAxisAngle(V.town.park.dir.clone().cross(V.town.museum.frame(0,0)).normalize(), 2.2 / window.__R)', 'V.town.park.dir'));
}
res.errors = errs; res.logs = logs.slice(0, 10);
console.log(JSON.stringify(res, null, 1));
fs.writeFileSync(`${SP}/${label}.json`, JSON.stringify(res, null, 1));
await browser.close();
