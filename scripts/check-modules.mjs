// Build gate (Netlify runs it on every push to main, before publishing): every js/ module
// needs an entry in index.html's import map, and they all carry main.js's ?cb token — so a
// deploy never mixes fresh and stale files in someone's browser cache. Missing entries fail
// the build; stray tokens are brought into line with main.js's.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
const cb = html.match(/main\.js\?cb=(\d+)/)?.[1];
if (!cb) { console.error('✗ index.html has no main.js?cb= token'); process.exit(1); }
const missing = readdirSync('js').filter(f => f.endsWith('.js') && f !== 'main.js')
  .filter(f => !html.includes(`"./js/${f}": "./js/${f}?cb=`));
if (missing.length) {
  console.error(`✗ no import-map entry in index.html for: ${missing.join(', ')}\n  add e.g. "./js/${missing[0]}": "./js/${missing[0]}?cb=${cb}"`);
  process.exit(1);
}
const synced = html.replace(/("\.\/js\/[a-z]+\.js": "\.\/js\/[a-z]+\.js\?cb=)\d+/g, `$1${cb}`);
if (synced !== html) { writeFileSync('index.html', synced); console.log(`→ synced every module's cache token to ${cb}`); }
console.log(`✓ import map covers every js/ module (cb=${cb})`);
