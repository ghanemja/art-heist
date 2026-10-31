// THE STORY — the case's data holds together, and the whole game can be played start to
// finish by pressing the same keys a player would: title → cold open → phone → Vivi →
// every clue and suspect → wrong accusations → the right one → the getaway → Rex at the
// cape → the countdown → abort → police → epilogue → "Case closed".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from './lib/game.mjs';

let g;
before(async () => { g = await bootGame(); await g.fast(); });
after(async () => { await g?.close(); });

const E = async () => { await g.press('KeyE'); await g.frames(2); };
/** talk to someone all the way through (E on each line) */
async function talkThrough(id) {
  const prompt = await g.goTo(id);
  assert.match(prompt, /talk to/i, `no "talk to" prompt standing at ${id}`);
  await E();
  assert.equal((await g.state()).ui, 'talk', `pressing E at ${id} didn't open the conversation`);
  for (let i = 0; i < 12 && (await g.state()).ui === 'talk'; i++) await E();
  assert.equal((await g.state()).ui, null, `${id}'s conversation never ended`);
}

test('story data: suspects, culprit, clues and people are consistent', async () => {
  const r = await g.eval(() => {
    const { SUSPECTS, CULPRIT, CLUES, PEOPLE, PLACES } = __T.story;
    const places = new Set(PLACES.map((p) => p.id)), ids = CLUES.map((c) => c.id);
    return {
      culpritIsSuspect: CULPRIT in SUSPECTS,
      dupClues: ids.filter((id, i) => ids.indexOf(id) !== i),
      badWhere: CLUES.filter((c) => !places.has(c.where)).map((c) => c.id),
      badProves: CLUES.flatMap((c) => c.proves.filter((s) => !(s in SUSPECTS)).map((s) => `${c.id}→${s}`)),
      badClears: CLUES.filter((c) => c.clears && !(c.clears in SUSPECTS)).map((c) => c.id),
      noText: CLUES.filter((c) => !c.title || !c.text).map((c) => c.id),
      proofs: CLUES.filter((c) => c.proves.includes(CULPRIT)).length,
      suspectsWithoutPerson: Object.keys(SUSPECTS).filter((s) => !PEOPLE.some((p) => p.id === s)),
      silentPeople: PEOPLE.filter((p) => !p.lines?.length).map((p) => p.id),
      hasVivi: PEOPLE.some((p) => p.id === 'vivi'),
      cluesNotInWorld: ids.filter((id) => !__v2.game.items.some((i) => i.id === id)),
      peopleNotInWorld: PEOPLE.map((p) => p.id).filter((id) => !__v2.game.items.some((i) => i.id === id && i.kind === 'person')),
      noPortrait: PEOPLE.map((p) => p.id).filter((id) => !__v2.game.FACE[id]),
      noSketch: ids.filter((id) => !__v2.game.SKETCH[id]),
    };
  });
  assert.ok(r.culpritIsSuspect, 'CULPRIT must be one of SUSPECTS');
  assert.deepEqual(r.dupClues, [], 'duplicate clue ids');
  assert.deepEqual(r.badWhere, [], 'clues whose `where` is not a PLACE');
  assert.deepEqual(r.badProves, [], 'clues that prove a suspect who does not exist');
  assert.deepEqual(r.badClears, [], 'clues that clear a suspect who does not exist');
  assert.deepEqual(r.noText, [], 'clues without a title or text');
  assert.ok(r.proofs >= 2, `the culprit needs at least two proving clues to be catchable (has ${r.proofs})`);
  assert.deepEqual(r.suspectsWithoutPerson, [], 'suspects you cannot talk to');
  assert.deepEqual(r.silentPeople, [], 'people with no lines');
  assert.ok(r.hasVivi, 'Vivi (who takes the accusation) is missing');
  assert.deepEqual(r.cluesNotInWorld, [], 'clues with no object in the world to find');
  assert.deepEqual(r.peopleNotInWorld, [], 'people with no figure in the world');
  assert.deepEqual(r.noPortrait, [], 'people with no painted portrait');
  assert.deepEqual(r.noSketch, [], 'clues with no painted sketch');
});

test('story logic: judge() accepts only the culprit backed by two proving clues', async () => {
  const bad = await g.eval(() => {
    const { SUSPECTS, CULPRIT, CLUES, judge } = __T.story, out = [];
    for (const s of Object.keys(SUSPECTS)) for (let i = 0; i < CLUES.length; i++) for (let j = i + 1; j < CLUES.length; j++) {
      const a = CLUES[i], b = CLUES[j], want = s === CULPRIT && a.proves.includes(s) && b.proves.includes(s);
      const v = judge(s, [a.id, b.id]);
      if (v.ok !== want || !v.text) out.push(`${s} + ${a.id},${b.id}: ok=${v.ok}, expected ${want}`);
    }
    return out;
  });
  assert.deepEqual(bad, []);
});

test('title screen → cold open → phone → play', async () => {
  assert.equal((await g.state()).state, 'title');
  assert.ok(await g.visible('title'), 'title page not shown');
  assert.ok(!(await g.visible('loader')), 'loader still showing');
  await g.click('#start');
  await g.until(() => __v2.game.G.state === 'cold');
  assert.ok(await g.eval(() => document.body.classList.contains('cine')), 'no letterbox in the cold open');
  await g.click('#skip');
  await g.until(() => __v2.game.G.state === 'phone');
  await g.until(() => document.querySelector('#screen .chip'), null, 30_000);
  assert.ok(await g.visible('handset'), 'the phone did not come up with the brief');
  await g.click('#screen .chip');
  await g.until(() => __v2.game.G.state === 'play', null, 30_000);
  for (const id of ['hud', 'nbBtn', 'bagBtn']) assert.ok(await g.visible(id), `#${id} hidden once play starts`);
  assert.ok((await g.state()).enabled, 'player cannot move once play starts');
});

test('act 1: Vivi briefs you; you cannot accuse before finding anything', async () => {
  await talkThrough('vivi');
  const s = await g.state();
  assert.ok(s.talked.includes('vivi'));
  await g.press('KeyN'); await g.frames(2);
  assert.equal((await g.state()).ui, 'nb');
  assert.equal(await g.eval(() => !!document.getElementById('nbCase')), false, '"make your case" offered with no evidence');
  await g.press('Escape'); await g.frames(2);
  assert.equal((await g.state()).ui, null);
});

test('act 1: every clue can be walked up to, looked at and noted', async () => {
  const clues = await g.eval(() => __T.story.CLUES.map((c) => ({ id: c.id, title: c.title })));
  for (const c of clues) {
    const prompt = await g.goTo(c.id);
    assert.match(prompt, /look closer/i, `no "look closer" prompt at clue ${c.id}`);
    await E();
    assert.equal((await g.state()).ui, 'card', `E at ${c.id} did not open its card`);
    assert.equal(await g.eval(() => document.querySelector('#card h3')?.textContent), c.title);
    await E();
    assert.equal((await g.state()).ui, null, `the ${c.id} card did not close on E`);
  }
  const s = await g.state();
  assert.deepEqual([...s.found].sort(), clues.map((c) => c.id).sort());
  assert.equal(await g.text('nbCount'), String(clues.length), 'notebook badge does not count the finds');
});

test('act 1: every suspect (and Ezra on the train) can be talked to', async () => {
  for (const id of ['otto', 'pia', 'rex', 'ezra']) await talkThrough(id);
  const s = await g.state();
  for (const id of ['otto', 'pia', 'rex', 'ezra']) assert.ok(s.met.includes(id) && s.talked.includes(id), `${id} not recorded as met/talked`);
});

test('act 1: wrong accusations are refused, the right one solves the case', async () => {
  await g.press('KeyN'); await g.frames(2);
  await g.click('#nbCase');
  const accuse = async (sus, clues) => {
    await g.eval(([sus, clues]) => {
      document.querySelector(`[data-s="${sus}"]`).click();
      for (const li of document.querySelectorAll('#nb li.on')) li.click();       // clear the last pick
      for (const id of clues) document.querySelector(`#nb li[data-id="${id}"]`).click();
    }, [sus, clues]);
    await g.click('#nbGo');
    return g.eval(() => ({ verdict: document.querySelector('#nbV .verdict')?.textContent, solved: __v2.game.G.solved }));
  };
  let v = await accuse('otto', ['log', 'ladder']);
  assert.equal(v.solved, false, 'accusing Otto solved the case'); assert.match(v.verdict, /sleeping guard/i);
  v = await accuse('pia', ['bike', 'ladder']);
  assert.equal(v.solved, false); assert.match(v.verdict, /clears her/i);
  v = await accuse('rex', ['ladder', 'crates']);
  assert.equal(v.solved, false, 'Rex with no proof solved the case');
  v = await accuse('rex', ['frames', 'van']);
  assert.equal(v.solved, true, 'the right accusation did not solve the case');
  await g.click('#nbOn');
  await g.frames(2);
  const s = await g.state();
  assert.equal(s.act, 2, 'closing the solved notebook did not start the getaway');
  assert.match(await g.eval(() => document.querySelector('#card h3')?.textContent), /Cape Far Side/);
  await g.click('#cardOk'); await g.frames(2);
});

test('act 2 → 3: Rex is at the cape; talking to him starts the countdown', async () => {
  // he was moved to the cape: standing at him must be far from where he started
  await talkThrough('rex');
  const s = await g.state();
  assert.equal(s.act, 3, 'talking to Rex at the cape did not start the countdown');
  assert.ok(await g.visible('timer'), 'no countdown timer on screen');
});

test('act 3: the countdown runs down on screen', async () => {
  const a = await g.eval(() => __v2.game.countdown());
  assert.ok(a > 0 && a <= 60, `countdown starts at ${a}`);
  await g.frames(20);
  const b = await g.eval(() => __v2.game.countdown());
  assert.ok(b < a, `countdown not running (${a} → ${b})`);
  assert.match(await g.text('timer'), /\d/, 'timer shows no number');
});

test('act 3 → 4 → epilogue → case closed: abort the launch at the console', async () => {
  const dir = await g.eval(() => __v2.game.consoleDir()?.toArray());
  assert.ok(dir, 'no launch console');
  await g.teleport(dir);
  assert.match(await g.text('prompt'), /ABORT THE LAUNCH/);
  await E();
  assert.equal((await g.state()).act, 4, 'E at the console did not abort the launch');
  await g.until(() => __v2.game.G.ui === 'police', null, 30_000);
  await g.until(() => __v2.game.G.state === 'epilogue', null, 60_000);
  await g.until(() => __v2.game.G.act === 5, null, 240_000);
  const s = await g.state();
  assert.equal(s.state, 'play', 'not back in free play after the epilogue');
  assert.ok(s.enabled, 'player frozen after the epilogue');
  assert.ok(await g.visible('endcard'), 'no "Case closed" card');
  assert.match(await g.text('endcard'), /Case closed/);
  await g.shot('story-endcard');
  await g.click('#endOk');
  assert.ok(!(await g.visible('endcard')));
});

test('no errors during the whole playthrough', () => {
  assert.deepEqual(g.errors, [], 'page errors / console.error');
  assert.deepEqual(g.failed, [], 'failed requests');
});
