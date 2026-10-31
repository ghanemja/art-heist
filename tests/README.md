# Test harness — The Vanishing Gallery

Regression tests for the main app (`index.html` → `js/`). They boot the **real game** in headless
Chromium and play it the way a person would (keys, clicks, walking up to things), so a
change that breaks the story, a control or a model fails here before it reaches `main`.

```bash
node tests/run.mjs                 # everything (~8 min: the browser renders in software)
node tests/run.mjs static          # no-browser checks only (seconds) — run on every edit
node tests/run.mjs story           # one suite (static | story | interactions | models)
node --test tests/story.test.mjs   # same thing, plain node:test
```

Needs Node 20+ and Playwright's Chromium (`npm i -g playwright && npx playwright install chromium`).
No `package.json` and nothing to install into the repo, so Netlify's build is unchanged.
Screenshots and a JSON report of every measurement land in `tests/output/` (gitignored).

## What each suite covers

| suite | what it proves | catches |
|---|---|---|
| **static** | every module parses; every relative import names a real file *and* a real export; the import map lists every module on main.js's `?cb=` token; every model/texture/font path in the code exists; every artwork image exists; no shipped GLB over 6 MB; the Netlify build gates pass | a typo'd import, a forgotten import-map entry, a stale cache token, a renamed/deleted asset |
| **story** | the case's data is consistent (culprit is a suspect with ≥2 proving clues, every clue/person exists in the world, has a portrait/sketch); `judge()` accepts *only* the culprit backed by two proving clues (every suspect × every pair); then a **full playthrough**: title → cold open → phone → Vivi → all 8 clues → all suspects + Ezra → three wrong accusations refused → right one → getaway → Rex at the cape → countdown runs → abort at the console → police → epilogue → "Case closed" | a clue that can't be reached, a story step that no longer advances, an accusation rule that changed, a dead end |
| **interactions** | WASD walks, Shift runs, the critic stays on the ground; N notebook, B backpack, P phone, M sound, H hints, Esc, the case-board fold; get in/drive/get out of the car; boat in/out; the museum door in and back out; a project building's card; the phone-width layout keeps its buttons on screen | a dead key, a panel that won't close, a vehicle you can't leave, a door that traps you |
| **models** | no mesh has NaN/infinite geometry; the critic at her scale with feet on the ground; story people at a sane height, feet on the ground (or the bench), under the 6k-tri budget (AGENTS.md); landmarks + story items + scene cost compared to `tests/baseline/scene.json`; review screenshots | a model that vanished, a person floating or sunk, a 3× triangle blow-up, a broken transform |

Every browser suite also fails on **any page error, `console.error`, or failed request** (a 404'd model).

## When a test fails because you *meant* the change

- New building / bigger model / removed landmark → re-record the scene baseline and commit it:
  `UPDATE_BASELINE=1 node --test tests/models.test.mjs`
- Story changed (new clue, new suspect, different solution) → update the playthrough in
  `story.test.mjs` (the accusation picks and the act checks) in the same commit.

## How it drives the game

`tests/lib/game.mjs` boots the page and gives tests a small vocabulary: `startPlay()`,
`goTo('vivi')` (stand at a person/clue, returns the E prompt), `press('KeyE')`, `teleport(dir)`,
`frames(n)`, `state()` (act, ui, found clues…), `shot(name)`. It reads the game through
`window.__v2` (set in `js/main.js`) and three read-only peeks on the game object
(`consoleDir`, `boatSpot`, `countdown`).

Headless Chromium draws with SwiftShader — seconds per frame of the full town — so between
screenshots the harness switches `renderer.render` off (`fast()`); the game's own loop,
logic, AI and timers keep running at full speed.

## Not automated (still needs eyes)

Does it *look* right (the ink, the hand-drawn feel, faces up close — see AGENTS.md rule 12),
does it *feel* right (camera, pacing), and real-device performance. The screenshots in
`tests/output/` are there to make that look quick.
