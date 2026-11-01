// Build gate (Netlify runs it on every push to main, before publishing — see netlify.toml):
//  1. every js/ module parses as an ES module (a syntax error would ship a blank page);
//  2. every relative import between them points at a file that exists;
//  3. every asset the code names exists: models, paintings, fonts, clips, screenshots —
//     including the names it builds (each citizen's model, bike and prop; the paintings
//     named bare as art_…). The site has no catch-all any more, so a missing file is a 404 in
//     the browser — this catches it before it goes live.
// Run: node --experimental-vm-modules scripts/check-code.mjs
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import vm from 'node:vm';

const errors = [];
const files = readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);
const src = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]));
const html = readFileSync('index.html', 'utf8');

// 1. parses
if (!vm.SourceTextModule) errors.push('run with --experimental-vm-modules (node:vm SourceTextModule is needed to parse the modules)');
else for (const f of files) {
  try { new vm.SourceTextModule(src[f], { identifier: f }); } catch (e) { errors.push(`${f}: ${e.message}`); }
}

// 2. relative imports resolve
for (const f of files) {
  for (const m of src[f].matchAll(/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\s*\(\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const spec = (m[1] || m[2]).replace(/\?.*$/, '');
    const to = normalize(join(dirname(f), spec));
    if (!existsSync(to)) errors.push(`${f}: imports ${m[1] || m[2]} — no such file (${to})`);
  }
}

// 3. assets named in the code exist
const ASSET = /(?:^|[^\w/.])((?:\.\/)?(?:models|artworks|clips|screenshots|fonts|audio)\/[\w./-]*\.(?:glb|gltf|jpg|jpeg|png|webp|mp4|mp3|ogg|woff2))(?:\?[^'"`\s)]*)?/g;
const named = new Map();                       // path → first place it's named
const note = (p, where) => { const k = normalize(p.replace(/^\.\//, '')); if (!named.has(k)) named.set(k, where); };
for (const [f, s] of [...Object.entries(src), ['index.html', html]]) {
  for (const m of s.matchAll(ASSET)) note(m[1], f);
  // paintings named bare (rooms.js boards, game.js crates, museum.js banners): art_… → artworks/
  for (const m of s.matchAll(/['"](art_[\w-]+?)(\.jpg)?['"]/g)) note(`artworks/${m[1]}.jpg`, f);
}
// the citizens' models are named from their ids (citizens.js: <id>.glb, <id>-bike.glb, <id>-<act>.glb)
{
  const s = src['js/citizens.js'] || '';
  // (each cast entry read whole, so the order of its fields doesn't matter)
  let cast = 0;
  for (const m of s.matchAll(/\{\s*id:\s*'([\w-]+)'[^{}]*\}/g)) {
    const id = m[1], role = m[0].match(/\brole:\s*'(\w+)'/)?.[1], act = m[0].match(/\bact:\s*'(\w+)'/)?.[1];
    if (!role) continue;
    cast++;
    note(`models/citizens/${id}.glb`, 'js/citizens.js');
    if (role === 'bike') note(`models/citizens/${id}-bike.glb`, 'js/citizens.js');
    if (act) note(`models/citizens/${id}-${act}.glb`, 'js/citizens.js');
  }
  if (!cast) errors.push('js/citizens.js: no cast entries found — update scripts/check-code.mjs');
  if (!/\$\{C\.id\}\.glb/.test(s)) errors.push('js/citizens.js: the citizen model path pattern changed — update scripts/check-code.mjs');
}
for (const [p, where] of named) if (!existsSync(p)) errors.push(`${where}: names ${p} — no such file`);

if (errors.length) { console.error('✗ code check failed:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log(`✓ ${files.length} modules parse, their imports resolve, and all ${named.size} named assets exist`);
