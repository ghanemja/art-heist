// STATIC CHECKS — no browser, a couple of seconds. The wiring that breaks a deploy before a
// single frame is drawn: syntax, imports, the import map + cache tokens, every model/texture
// the code asks for actually exists, and the build gates Netlify runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const JS = readdirSync(join(ROOT, 'js')).filter((f) => f.endsWith('.js'));
const html = rd('index.html');

test('every js/ module parses', () => {
  const bad = [];
  for (const f of [...JS.map((f) => `js/${f}`), 'planet.js']) {
    if (!existsSync(join(ROOT, f))) continue;
    try { execFileSync(process.execPath, ['--check', '--input-type=module'], { input: rd(f), stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { bad.push(`${f}: ${String(e.stderr).split('\n').find((l) => /Error/.test(l))}`); }
  }
  assert.deepEqual(bad, []);
});

test('every relative import in js/ points at a real file and a real export', () => {
  const bad = [];
  const exportsOf = (f) => {
    const src = rd(`js/${f}`), names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    // export const A = 1, B = new X(…) — every top-level name in the declaration
    for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+([^;\n]+)/gm)) {
      let depth = 0, cur = '';
      for (const ch of m[1]) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; else if (ch === ',' && !depth) { const k = cur.match(/^\s*([A-Za-z_$][\w$]*)\s*=/); if (k) names.add(k[1]); cur = ''; continue; } cur += ch; }
      const k = cur.match(/^\s*([A-Za-z_$][\w$]*)\s*=/); if (k) names.add(k[1]);
    }
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(',')) { const k = n.trim().split(/\s+as\s+/).pop(); if (k) names.add(k); }
    return names;
  };
  for (const f of JS) {
    for (const m of rd(`js/${f}`).matchAll(/import\s*(\{[^}]*\}|[\w$]+|\*\s+as\s+[\w$]+)?\s*(?:from\s*)?['"](\.\/[^'"?]+)['"]/g)) {
      const target = m[2].replace(/^\.\//, '');
      if (!existsSync(join(ROOT, 'js', target))) { bad.push(`${f} imports missing ${m[2]}`); continue; }
      if (m[1]?.startsWith('{')) {
        const have = exportsOf(target);
        for (const n of m[1].slice(1, -1).split(',')) {
          const name = n.trim().split(/\s+as\s+/)[0];
          if (name && !have.has(name)) bad.push(`${f} imports { ${name} } but ${target} does not export it`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('import map lists every module with main.js\'s cache token', () => {
  const cb = html.match(/main\.js\?cb=(\d+)/)?.[1];
  assert.ok(cb, 'index.html has no main.js?cb= token');
  const missing = JS.filter((f) => f !== 'main.js' && !html.includes(`"./js/${f}": "./js/${f}?cb=`));
  assert.deepEqual(missing, [], 'modules missing from the import map');
  const stale = [...html.matchAll(/"\.\/js\/([a-z]+\.js)": "\.\/js\/[a-z]+\.js\?cb=(\d+)"/g)].filter((m) => m[2] !== cb).map((m) => `${m[1]}@${m[2]}`);
  assert.deepEqual(stale, [], `modules not on cb=${cb} (run node scripts/check-modules.mjs)`);
  const ghosts = [...html.matchAll(/"\.\/js\/([a-z]+\.js)":/g)].map((m) => m[1]).filter((f) => !JS.includes(f));
  assert.deepEqual(ghosts, [], 'import map entries for modules that no longer exist');
});

test('every asset path named in the code exists', () => {
  const bad = new Set();
  const re = /['"`](\.?\/?(?:models|artworks|fonts|data|clips|screenshots)\/[^'"`$\s]+\.(?:glb|gltf|png|jpe?g|webp|json|woff2|mp3|ogg|wav|mp4|webm))['"`]/g;
  for (const f of [...JS.map((f) => `js/${f}`), 'index.html']) {
    for (const m of rd(f).matchAll(re)) {
      const p = m[1].replace(/^\.?\//, '');
      if (!existsSync(join(ROOT, p))) bad.add(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual([...bad], []);
});

test('every artwork in data/artworks.json has its image', () => {
  if (!existsSync(join(ROOT, 'data/artworks.json'))) return;
  const list = JSON.parse(rd('data/artworks.json'));
  const files = (Array.isArray(list) ? list : Object.values(list).flat()).map((a) => a?.image ?? a?.file ?? a?.src ?? a?.img ?? (typeof a === 'string' ? a : null)).filter(Boolean);
  const missing = files.filter((f) => !existsSync(join(ROOT, f.replace(/^\.?\//, ''))) && !existsSync(join(ROOT, 'artworks', f)));
  assert.deepEqual(missing, []);
});

test('shipped models stay inside the browser budget (≤ 6 MB each, CLAUDE.md targets ~1.5 MB)', () => {
  const big = [];
  const walk = (d) => { for (const f of readdirSync(join(ROOT, d))) {
    const p = `${d}/${f}`, s = statSync(join(ROOT, p));
    if (s.isDirectory()) { if (f !== '_raw') walk(p); } else if (/\.glb$/.test(f) && s.size > 6e6) big.push(`${p} ${(s.size / 1e6).toFixed(1)} MB`);
  } };
  walk('models');
  assert.deepEqual(big, []);
});

test('Netlify build gates pass (validate-critic, validate-assets)', () => {
  for (const s of ['scripts/validate-critic.mjs', 'scripts/validate-assets.mjs']) {
    try { execFileSync(process.execPath, [s], { cwd: ROOT, stdio: 'pipe' }); }
    catch (e) { assert.fail(`${s} failed:\n${e.stdout}${e.stderr}`); }
  }
});
