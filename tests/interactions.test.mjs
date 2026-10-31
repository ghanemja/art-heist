// USER INTERACTIONS — every control a player has still does its job: walking, the camera
// keys, the notebook / backpack / phone / sound / hints, getting in and out of the car and
// the boat, the museum's front door, and a project building's card.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from './lib/game.mjs';

let g;
before(async () => { g = await bootGame(); await g.fast(); await g.startPlay(); });
after(async () => { await g?.close(); });

const E = async () => { await g.press('KeyE'); await g.frames(3); };
const ui = async () => (await g.state()).ui;

test('WASD walks the critic; Shift runs faster', async () => {
  const at = () => g.eval(() => __v2.player.st.dir.toArray());
  const dist = (a, b) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 40;
  // hold keys for ~30 frames; report how far she went and her top speed
  const walk = async (codes) => {
    const a = await at();
    const top = await g.eval((codes) => new Promise((ok) => {
      const st = __v2.player.st; let n = 0, top = 0;
      for (const c of codes) st.keys.add(c);
      const f = () => { top = Math.max(top, Math.abs(st.speed)); if (++n < 30) requestAnimationFrame(f); else { for (const c of codes) st.keys.delete(c); ok(top); } };
      requestAnimationFrame(f);
    }), codes);
    await g.frames(20);
    return { d: dist(a, await at()), top };
  };
  const w = await walk(['KeyW']);
  assert.ok(w.d > 0.3, `W moved the critic only ${w.d.toFixed(3)} units`);
  const s = await walk(['KeyS']);
  assert.ok(s.d > 0.3, `S moved the critic only ${s.d.toFixed(3)} units`);
  const run = await walk(['KeyW', 'ShiftLeft']);
  assert.ok(run.top > w.top * 1.2, `Shift did not run (walk top speed ${w.top.toFixed(2)}, run ${run.top.toFixed(2)})`);
});

test('the phone layout (narrow screens) hides the keyboard hints and keeps the buttons', async () => {
  await g.page.setViewportSize({ width: 390, height: 760 });
  await g.frames(2);
  assert.equal(await g.eval(() => getComputedStyle(document.getElementById('hint')).display), 'none', 'keyboard hints shown on a phone-width screen');
  for (const id of ['nbBtn', 'bagBtn', 'sndBtn']) {
    const r = await g.eval((id) => { const b = document.getElementById(id).getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; }, id);
    assert.ok(r[0] >= 0 && r[1] >= 0 && r[2] <= 390 && r[3] <= 760, `#${id} off screen on a phone: ${r.map(Math.round)}`);
  }
  await g.page.setViewportSize({ width: 960, height: 540 });
  await g.frames(2);
});

test('player stays on the ground while walking (no falling through / flying off)', async () => {
  const r = await g.eval(() => {
    const st = __v2.player.st, p = __v2.player.root.position;
    return { r: p.length(), ground: __T.world.standAt(st.dir) };
  });
  assert.ok(Math.abs(r.r - r.ground) < 0.3, `critic at radius ${r.r.toFixed(3)}, ground at ${r.ground.toFixed(3)}`);
});

test('N opens and closes the notebook; Esc closes it too', async () => {
  await g.press('KeyN'); await g.frames(2);
  assert.equal(await ui(), 'nb'); assert.ok(await g.visible('nb'));
  assert.equal((await g.state()).enabled, false, 'player can walk with the notebook open');
  await g.press('KeyN'); await g.frames(2);
  assert.equal(await ui(), null); assert.ok(!(await g.visible('nb')));
  await g.click('#nbBtn'); await g.frames(2);
  assert.equal(await ui(), 'nb', 'the notebook button does not open it');
  await g.press('Escape'); await g.frames(2);
  assert.equal(await ui(), null);
  assert.ok((await g.state()).enabled, 'player still frozen after closing the notebook');
});

test('B opens and closes the backpack', async () => {
  await g.press('KeyB'); await g.frames(2);
  assert.ok(await g.visible('bag'), 'backpack did not open');
  await g.press('KeyB'); await g.frames(2);
  assert.ok(!(await g.visible('bag')), 'backpack did not close');
});

test('P takes the phone out and puts it away', async () => {
  await g.press('KeyP'); await g.frames(2);
  assert.ok(await g.visible('handset'), 'phone did not open');
  await g.press('KeyP'); await g.frames(2);
  assert.ok(!(await g.visible('handset')), 'phone did not close');
});

test('M toggles sound; H toggles the controls strip', async () => {
  const off = () => g.eval(() => document.getElementById('sndBtn').classList.contains('off'));
  const a = await off();
  await g.press('KeyM'); assert.equal(await off(), !a, 'M did not toggle sound');
  await g.press('KeyM'); assert.equal(await off(), a);
  assert.ok(await g.visible('hint'));
  await g.press('KeyH'); assert.ok(!(await g.visible('hint')), 'H did not hide the hints');
  await g.press('KeyH'); assert.ok(await g.visible('hint'), 'H did not bring the hints back');
});

test('the case board folds and unfolds', async () => {
  const min = () => g.eval(() => document.getElementById('hud').classList.contains('min'));
  const a = await min();
  await g.click('#caseTog'); assert.equal(await min(), !a, 'case board toggle did nothing');
  await g.click('#caseTog'); assert.equal(await min(), a);
});

test('E by the car gets in (drive mode), drives, and E gets out again', async () => {
  const spot = await g.eval(() => __v2.game.jeepSpot().toArray());
  await g.teleport(spot);
  assert.match(await g.text('prompt'), /get in the car/);
  await E();
  assert.equal((await g.state()).mode, 'jeep', 'not driving after E at the car');
  assert.match(await g.text('hint'), /drive/, 'controls strip did not switch to driving');
  const a = await g.eval(() => __v2.player.st.dir.toArray());
  await g.eval(() => __v2.player.st.keys.add('KeyW')); await g.frames(40); await g.eval(() => __v2.player.st.keys.delete('KeyW'));
  const b = await g.eval(() => __v2.player.st.dir.toArray());
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 40 > 0.3, 'the car did not move on W');
  await g.frames(40);
  await E();
  assert.equal((await g.state()).mode, 'walk', 'E did not get out of the car');
});

test('E by the boat gets in, E near the shore gets out', async () => {
  const spot = await g.eval(() => __v2.game.boatSpot().toArray());
  // stand on the pier beside it: step toward land until the "get in the boat" prompt shows
  await g.teleport(spot);
  assert.match(await g.text('prompt'), /get in the boat/);
  await E();
  assert.equal((await g.state()).mode, 'boat');
  await g.frames(5);
  assert.match(await g.text('prompt'), /get out/, 'no landing spot offered beside the mooring');
  await E();
  assert.equal((await g.state()).mode, 'walk', 'could not step off the boat');
});

test('the museum door takes you inside, and you can walk back out', async () => {
  const door = await g.eval(() => __v2.game.doors.find((d) => /museum/.test(d.label))?.dir.toArray());
  assert.ok(door, 'no museum door');
  await g.teleport(door);
  assert.match(await g.text('prompt'), /museum/);
  await E();
  await g.until(() => __v2.rooms.inside, null, 20_000);
  assert.ok((await g.state()).room, 'G.room not set inside the museum');
  // walk out: back down (S) until we're on the street again
  await g.eval(() => __v2.player.st.keys.add('KeyS'));
  try { await g.until(() => !__v2.rooms.inside, null, 60_000); }
  finally { await g.eval(() => __v2.player.st.keys.delete('KeyS')); }
  await g.frames(20);
  assert.equal((await g.state()).inside, false);
});

test('a project building: E shows its card with a link, Esc closes it', async () => {
  const lm = await g.eval(() => { const l = __v2.town.landmarks.find((l) => !l.decor && !['yarn', 'eyes', 'qr'].includes(l.style)); return l && { dir: l.dir.toArray(), name: l.name }; });
  assert.ok(lm, 'no project landmark');
  await g.teleport(lm.dir);
  // the landmark's centre may be inside the building: nudge round it until the prompt shows
  let txt = await g.text('prompt');
  if (!/visit/.test(txt)) {
    txt = await g.eval(async (name) => {
      const st = __v2.player.st, c = st.dir.clone(), { THREE } = __T;
      const t = new THREE.Vector3().crossVectors(c, new THREE.Vector3(0, 1, 0)).normalize(), b = new THREE.Vector3().crossVectors(c, t);
      for (const r of [0.04, 0.06, 0.08]) for (let a = 0; a < 6.28; a += 0.5) {
        st.dir.copy(c).addScaledVector(t, Math.cos(a) * r).addScaledVector(b, Math.sin(a) * r).normalize();
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
        const p = document.getElementById('prompt');
        if (!p.classList.contains('hide') && p.textContent.includes(name)) return p.textContent;
      }
      return document.getElementById('prompt').textContent;
    }, lm.name);
  }
  assert.match(txt, new RegExp(`visit ${lm.name}`));
  await E();
  assert.equal(await ui(), 'proj');
  assert.equal(await g.eval(() => document.querySelector('#card h3')?.textContent), lm.name);
  assert.ok(await g.eval(() => !!document.querySelector('#card a.btn, #card .note')), 'project card has no link');
  await g.press('Escape'); await g.frames(2);
  assert.equal(await ui(), null);
});

test('no errors during the interactions', () => {
  assert.deepEqual(g.errors, []);
  assert.deepEqual(g.failed, []);
});
