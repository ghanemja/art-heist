// Headless smoke test of the main app: run it before pushing anything that touches js/.
//   python3 -m http.server 8123 &          (from the repo root; PORT=<n> for another)
//   node scripts/smoke.mjs                 (THREE_DIR=<unpacked three@0.160.0 package> serves three locally:
//                                           (cd /tmp && npm pack three@0.160.0 && tar xzf three-0.160.0.tgz) → /tmp/package)
// Fails (exit 1) on: any console error or uncaught exception, any local file answering 4xx/5xx,
// the world not finishing its build, the player not moving when walked, the museum room not opening.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright/index.js'); }
const PORT = process.env.PORT || 8123, BASE = `http://localhost:${PORT}/`;
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
if (process.env.THREE_DIR) await page.route('https://unpkg.com/three@0.160.0/**', (r) =>
  r.fulfill({ path: r.request().url().replace('https://unpkg.com/three@0.160.0/', process.env.THREE_DIR.replace(/\/$/, '') + '/'), contentType: 'application/javascript' }));
const problems = [];
page.on('pageerror', (e) => problems.push('uncaught: ' + String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)); });
page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) problems.push(`${r.status()} ${r.url().slice(BASE.length)}`); });
const t0 = Date.now();
await page.goto(BASE + 'index.html?dpr=1', { waitUntil: 'commit', timeout: 0 });
const built = await page.waitForFunction(() => window.__v2?.culler, null, { timeout: 180000 }).then(() => true, () => false);
if (!built) problems.push('the world never finished building (window.__v2.culler)');
const loadS = (Date.now() - t0) / 1000;
let walked = 0, room = false;
if (built) {
  await page.evaluate(() => { const { game, player } = window.__v2; game.G.state = 'play'; player.st.enabled = true; player.st.playing = true; });
  const p0 = await page.evaluate(() => window.__v2.player.st.dir.toArray());
  await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW');
  const p1 = await page.evaluate(() => window.__v2.player.st.dir.toArray());
  walked = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]) * await page.evaluate(() => window.__R);
  if (!(walked > 0.3)) problems.push(`walking moved the player only ${walked.toFixed(2)} units in 3 s`);
  room = await page.evaluate(async () => { const V = window.__v2;
    V.rooms.enter({ key: 'museum', out: () => ({ dir: V.player.st.dir.clone(), heading: V.player.st.heading.clone() }) });
    await new Promise((r) => setTimeout(r, 4000)); return !!V.rooms.inside; });
  if (!room) problems.push('the museum room did not open');
  await page.waitForTimeout(2000);
}
await browser.close();
console.log(JSON.stringify({ loadS, walked: +walked.toFixed(2), room }));
if (problems.length) { console.error('✗ smoke test failed:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('✓ smoke test passed');
