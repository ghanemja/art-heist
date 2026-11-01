// node scripts/lowend-measure.mjs <label> [profile] [throttle] ["&extra=query"]
// The low end, headless: a phone-sized viewport and pixel ratio, touch, and the CPU slowed down
// (CDP Emulation.setCPUThrottlingRate). Reports:
//   • time to the title page and to playable (the world built, the loop running);
//   • the median frame time while walking downtown (Main Street, away from the museum) and by
//     the museum (along its forecourt), the culler's ms/frame, draws + triangles there;
//   • the JS heap after a forced GC (--expose-gc);
//   • what the adaptive resolution settled at (res.dpr, DPR_MIN/MAX) and the quality chosen.
// SwiftShader draws on the CPU, so absolute frame times aren't a phone's: compare runs.
//   python3 -m http.server 8123 &      THREE_DIR=/tmp/package (three@0.160.0 unpacked) serves three locally
//   profiles: desktop (900×700, DPR 1), iphone (390×844, DPR 3, touch), android (412×915, DPR 2.6, touch)
//   → out/lowend/<label>.json, out/lowend/shots/<label>-{downtown,museum}.png
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright/index.js'); }
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'out', 'lowend');
fs.mkdirSync(OUT + '/shots', { recursive: true });
const [label = 'run', prof = 'iphone', thr = '4', extra = ''] = process.argv.slice(2);
const PROFILES = {
  desktop: { viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 },
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  android: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true },
};
const P = PROFILES[prof]; if (!P) throw new Error('profile: ' + Object.keys(PROFILES));
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc'] });
const ctx = await browser.newContext(P);
const page = await ctx.newPage();
if (process.env.THREE_DIR) await page.route('https://unpkg.com/three@0.160.0/**', (r) =>
  r.fulfill({ path: r.request().url().replace('https://unpkg.com/three@0.160.0/', process.env.THREE_DIR.replace(/\/$/, '') + '/'), contentType: 'application/javascript' }));
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: +thr || 1 });
const t0 = Date.now();
await page.goto(`http://localhost:${process.env.PORT || 8123}/index.html?${extra.replace(/^&/, '')}`, { waitUntil: 'commit', timeout: 0 });
await page.waitForFunction(() => { const t = document.getElementById('title'); return t && !t.classList.contains('hide'); }, null, { timeout: 900000, polling: 200 });
const titleS = (Date.now() - t0) / 1000;
await page.waitForFunction(() => window.__v2?.culler, null, { timeout: 900000, polling: 200 });
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const playS = (Date.now() - t0) / 1000;
// play state, title hidden (as perf-measure does: the cold open is a cut-scene)
await page.evaluate(() => {
  const { game, player } = window.__v2;
  game.G.state = 'play'; player.st.enabled = true; player.st.playing = true;
  document.getElementById('title')?.classList.add('hide');
});
// let the background LOD work and the citizens' stream-in finish (they're part of the load on a phone)
await page.waitForFunction(() => window.__v2.culler.lodPending === 0, null, { timeout: 600000, polling: 500 }).catch(() => {});
await page.waitForTimeout(4000);
const place = (dirExpr, lookExpr) => page.evaluate(`(() => { const V = window.__v2, st = V.player.st; const d = (${dirExpr}).clone().normalize(), L = (${lookExpr}).clone().normalize();
  st.dir.copy(d); st.heading.copy(L.sub(d.clone().multiplyScalar(d.dot(L)))).normalize(); st.camFwd.copy(st.heading); st.camInit = false; st.camYaw = 0; st.camPitch = 0; })()`);
// walk for `secs` with W held; frame times from rAF, the culler's own time, draws/tris from renderer.info
async function walk(name, secs) {
  await page.waitForTimeout(2500);                                  // (settle after the cut)
  await page.evaluate(() => {
    const C = window.__v2.culler; if (!C._t) { const u = C.update.bind(C); C.update = () => { const a = performance.now(); u(); C._ms = (C._ms || 0) + performance.now() - a; C._n = (C._n || 0) + 1; }; C._t = 1; }
    C._ms = 0; C._n = 0;
    const W = window.__walk = { ft: [], calls: [], tris: [], last: 0, on: true };
    const f = (now) => { if (!W.on) return; if (W.last) { W.ft.push(now - W.last); const i = window.__v2.renderer.info.render; W.calls.push(i.calls); W.tris.push(i.triangles); } W.last = now; requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(secs * 1000);
  await page.keyboard.up('KeyW');
  if (process.env.SHOTS !== '0') await page.screenshot({ path: `${OUT}/shots/${label}-${name}.png` });
  return page.evaluate(() => {
    const W = window.__walk; W.on = false; const C = window.__v2.culler;
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
    const p90 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.9)] : 0; };
    return { frames: W.ft.length, medMs: +med(W.ft).toFixed(1), p90Ms: +p90(W.ft).toFixed(1), cullMs: +(C._ms / Math.max(1, C._n)).toFixed(2), calls: med(W.calls), tris: med(W.tris), dpr: window.__v2.res.dpr };
  });
}
const out = { label, prof, throttle: +thr, extra, titleS, playS };
// downtown: Main Street, walking away from the museum's forecourt into town
await place('V.town.museum.frame(0, 9)', 'V.town.museum.frame(0, 40)');
out.downtown = await walk('downtown', +(process.env.WALK || 12));
// by the museum: along the forecourt, the museum to one side
await place('V.town.museum.frame(-5, 3.5)', 'V.town.museum.frame(8, 3.5)');
out.museum = await walk('museum', +(process.env.WALK || 12));
// the adaptive resolution after ~30 s of play
out.res = await page.evaluate(() => ({ dpr: window.__v2.res.dpr, min: window.__v2.res.min, max: window.__v2.res.max, quality: window.__v2.quality?.level, why: window.__v2.quality?.why, canvas: [window.__v2.renderer.domElement.width, window.__v2.renderer.domElement.height] }));
out.citizens = await page.evaluate(() => window.__v2.citizens.list?.length ?? null);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage');
out.heapMB = +((await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576).toFixed(1);   // (exact: performance.memory is rounded)
out.errors = errs;
console.log(JSON.stringify(out));
fs.writeFileSync(`${OUT}/${label}.json`, JSON.stringify(out, null, 1));
await browser.close();
