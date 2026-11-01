# The Vanishing Gallery

An art heist on a tiny hand-drawn planet. A browser 3D game in three.js r160: plain ES modules
through an import map, no build step. Live at https://art-heist.netlify.app

## Run locally

Any static file server, from the repo root:

```bash
python3 -m http.server 8123
# → http://localhost:8123
```

## Layout

- `index.html`: the page, its UI and CSS, and the import map. Every `js/` module is listed in
  the import map with one shared cache token (`?cb=NN`).
- `js/`: the game. `main.js` boots the world. The other modules include `world.js` (the planet,
  roads, ground), `town.js` and `buildings.js` (the town), `museum.js`, `rooms.js` (the
  interiors), `game.js` and `story.js` (the case), `folk.js`, `human.js` and `faces.js`
  (people), `style.js` (paint and ink), and `cull.js` (culling and distance LOD).
- `models/`: the critic (`critic.glb`) and the citizens (`models/citizens/`).
- `artworks/`: the paintings. `fonts/`: Caveat and Patrick Hand. `clips/` and
  `screenshots/rooms/`: the project rooms' screens.
- `scripts/`: the build checks (`validate-critic.mjs`, `check-code.mjs`, `check-modules.mjs`),
  `smoke.mjs` (a headless play-test), `perf-measure.mjs` (headless triangles, draws and screenshots),
  and `road-audit.mjs`.

## Checks

Netlify runs the build checks on every push to `main` (see `netlify.toml`). Before pushing
anything that touches `js/`, also run the smoke test locally:

```bash
node scripts/smoke.mjs        # needs the local server above, and Playwright
```

Working rules for this repo are in `CLAUDE.md` and `AGENTS.md`; deployment is in `DEPLOY.md`.
