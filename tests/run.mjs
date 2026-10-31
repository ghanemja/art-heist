// Run the whole harness:   node tests/run.mjs            (everything, ~8 min on software GL)
//                          node tests/run.mjs static      (just the no-browser checks, seconds)
//                          node tests/run.mjs story models (any suites by name)
// Static checks run first; if they fail the browser suites are skipped (nothing would boot).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('.', import.meta.url));
const ALL = ['static', 'story', 'interactions', 'models'];
const pick = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const suites = pick.length ? pick : ALL;
const unknown = suites.filter((s) => !ALL.includes(s));
if (unknown.length) { console.error(`unknown suite(s): ${unknown.join(', ')} — have: ${ALL.join(', ')}`); process.exit(2); }

const results = [];
for (const s of suites) {
  const t0 = Date.now();
  console.log(`\n━━ ${s} ━━`);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', `${DIR}${s}.test.mjs`], { stdio: 'inherit', env: process.env });
  results.push({ s, ok: r.status === 0, secs: Math.round((Date.now() - t0) / 1000) });
  if (s === 'static' && r.status !== 0 && suites.length > 1) { console.error('\nstatic checks failed — skipping the browser suites'); break; }
}
console.log('\n━━ summary ━━');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.s.padEnd(13)} ${r.secs}s`);
console.log(`screenshots + reports: ${DIR}output/`);
process.exit(results.every((r) => r.ok) && results.length === suites.length ? 0 : 1);
