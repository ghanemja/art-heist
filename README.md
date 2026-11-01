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
  (people), `style.js` (paint and ink), `cull.js` (culling and distance LOD) and `quality.js`
  (the full drawing or light mode for weak devices).
- `models/`: the critic (`critic.glb`) and the citizens (`models/citizens/`).
- `artworks/`: the paintings. `fonts/`: Caveat and Patrick Hand. `clips/` and
  `screenshots/rooms/`: the project rooms' screens.
- `scripts/`: the build checks (`validate-critic.mjs`, `check-code.mjs`, `check-modules.mjs`),
  `smoke.mjs` (a headless play-test), `perf-measure.mjs` (headless triangles, draws and screenshots),
  `lowend-measure.mjs` (phone viewports + CPU throttling: load time, frame time, heap, resolution)
  and `road-audit.mjs`.

## Checks

Netlify runs the build checks on every push to `main` (see `netlify.toml`). Before pushing
anything that touches `js/`, also run the smoke test locally:

```bash
node scripts/smoke.mjs        # needs the local server above, and Playwright
```

## Quality: full or light

Weak devices (a phone, few cores or little memory, a software or mobile GPU, or frame times that
can't keep up in the first seconds) get **light mode**: a lower pixel-ratio cap, half the citizens,
no outlines on small or far things, a coarser distance LOD where no outline is drawn, and no clouds.
Everything else gets the full drawing. `?quality=low` or `?quality=high` pins it, and
`window.__v2.quality` says which was chosen and why. Headless Chromium renders with SwiftShader, so
it picks light mode there. `perf-measure.mjs` pins the full drawing unless you pass
`"&quality=low"`; run `smoke.mjs` with `QUERY='&quality=high'` as well as without.

Working rules for this repo are in `CLAUDE.md` and `AGENTS.md`; deployment is in `DEPLOY.md`.

## License

Copyright (c) 2026 Janelle Ghanem. **All rights reserved.** The code, story, characters and
paintings may not be copied, modified or redistributed without written permission. Third-party
components (three.js, the fonts, the 3D models) keep their own licences. See [LICENSE](LICENSE).
