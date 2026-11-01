# art-heist: The Vanishing Gallery (live at https://art-heist.netlify.app)

A browser 3D game (three.js r160 from unpkg, minified, plain ES modules, no build step).
**Netlify deploys every push to `main` automatically.** Anything pushed there is live, so test before pushing.

`index.html` at the site root loads `js/main.js`; all the code is in `js/`. Old addresses
redirect to `/`: the game used to live under `v2/`, and the classic planet game (`classic.html`,
`planet.js`) was retired on 2026-11-01. `js/museum.js` came from the classic game and is part of
this one now. Layout and tooling are summarised in `README.md`.

## The cartoon art style: non-negotiable

Everything is drawn in a hand-made cartoon style: gouache-like flat paint and ink outlines.

- **Paint.** Use `paint(color)` materials (js/style.js): toon "paper" shading with optional
  hatching. Plain paints bake together with the colour carried per vertex (`bakeScenery`,
  `mergeStatic`), so a whole building costs a handful of draws.
- **Ink.** Outlines are real geometry: an inverted hull (BackSide), pushed out in clip space so the
  stroke is the same width in pixels near or far, re-traced ~4×/s with a little wobble so it boils
  like a hand-traced line (`ink(root, weight)`, weights `heavy` / `mid` / `fine`). Small soft
  features (eyes, brows, mouths) are `noInk`. A part that grows out of another fades its line
  (`inkW`). Anything built after the world (streamed-in people) must be inked when it's made.
- **No inside-out faces.** The ink hull draws every back face it can see. A sliver or flipped
  triangle (for example from earcut on a long, thin outline, then laid onto a slope) shows as dark
  streaks. Build flat paving as bands of quads, never as long extruded outlines. See `slab()` in
  `stripMall`.

## People models

Making a person (townsfolk, crowd, any character)? Follow the rules in
[`AGENTS.md`](AGENTS.md#making-people-models-jsfolkjs): never a clone of the
critic, her scale, shoes on the ground, smooth skinned joints, shoulders grown from
the torso, real hands, a face, idle life, and verify up close.

## Bevels vs. the browser: the balance to hold

The models must read **curved, smooth and real**: bevelled edges and smooth (not faceted)
shading. Faceted low-poly is wrong for this world. But this is a **browser game that must not
lag**, so every model is a trade-off:

- Keep **smooth normals** and enough geometry that silhouettes and bevels stay round.
- Spend polygons on the **silhouette** (curves you see) and save them on interior detail.
- Compress shipped GLBs (meshopt or Draco); keep textures small (512² WebP).
- The distance LOD (`js/cull.js`) makes simpler versions of every mesh in the background and draws
  them only while the difference is under a pixel. The per-frame budget is ~900k triangles at
  street level (fill + ink); measure with `scripts/perf-measure.mjs`.

Judge both at once: if it looks faceted, add geometry; if it stalls or drags the frame rate, cut
texture size or triangles first, not the smoothness.

## Layout and curvature

- **Nothing may be built on anything.** Every structure that matters reserves its ground first
  (`reserve(dir, r, key)` → `ZONES` in `js/world.js`). Roads, rails and footpaths go around
  reserved ground, and decoration landing in a structure, on a road or on the rails is removed.
- **The planet is radius 28** (`R` in `js/manifest.js`; `?R=<n>` previews another size). The plan's
  `[lat, lon]`s are drawn for radius 40 (`R_PLAN`): `ll()` in `world.js` keeps every place's bearing
  AND distance from downtown, so the smaller sphere wraps the outer places round its back. Never
  hard-code 40, a radius, or a horizon: use `R`.
- **Anything flat and wide floats at its ends.** Build structures in `js/buildings.js` and set
  them down with `placeOnPlanet()`. It bakes per material, tessellates long faces, lays every
  vertex onto the terrain under it (the curve, and any levelled plane or slope), then inks.
  Batch a row with `batchPlaced()`; register walkable tops with `addFloor()`.

## Workflow rules

- **Log every feature request** the user makes for this project in
  [`FEATURE_LOG.md`](FEATURE_LOG.md): append each one as it arrives, with a
  status marker. Keep it current across chats.
- **`main` is live.** Netlify builds and publishes every push to `main`. The build runs
  `validate-critic`, `check-code` (every module parses, its imports resolve, every asset it names
  exists) and `check-modules` (the import map); see netlify.toml. A feature is done once it's
  merged to `main` and the build passes. `./deploy.sh` is the manual fallback.
- **Run the smoke test before pushing anything that touches `js/`:** `python3 -m http.server 8123 &`,
  then `node scripts/smoke.mjs`. It fails on any console error, any missing file, the world not
  building, walking or the museum room not working. For visual changes, also compare
  `scripts/perf-measure.mjs` screenshots against `main`'s, and look at them. Headless Chromium
  gets light mode (`js/quality.js`), so run the smoke test with `QUERY='&quality=high'` too;
  `perf-measure.mjs` pins the full drawing unless given `"&quality=low"` (check that one too).
- **Bump the cache token** on every edit to `js/`, or browsers keep stale modules:
  `js/main.js?cb=NN` in `index.html`. The import map gives every `js/` module the same token, and
  `check-modules.mjs` syncs them. Pick a number no other branch has shipped.
- Work in progress goes on its own branch; only tested, finished work is merged to `main`.
