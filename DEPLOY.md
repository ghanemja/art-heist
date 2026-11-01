# Deploy

Static three.js site, no build step. Hosted on **Netlify** (site `art-heist` (formerly `shelfie-jg`),
id `c1677cd8-337d-4500-879c-3aed0433fe67`) → https://art-heist.netlify.app

The site is **git-connected**: Netlify deploys github.com/ghanemja/art-heist and
publishes `main` automatically. Netlify's build command (`netlify.toml`) runs the build checks:
`validate-critic.mjs` (a missing or broken `critic.glb`), `check-code.mjs` (every module parses,
its imports resolve, every asset it names exists) and `check-modules.mjs` (the import map). Any
failure stops the deploy before anything goes live. Pushing another branch does not publish.

A manual deploy still works from a machine with the Netlify CLI:

```bash
./deploy.sh
```

It runs the same checks, syncs every module's cache token to main.js's, then runs
`netlify deploy --prod` against the `art-heist` site id.

## Gotchas

- **Bump the cache token.** `index.html` loads `js/main.js?cb=NN`, and its import map gives every
  `js/` module the same token. Bump `NN` on every change to `js/` (and pick a number no other
  branch has shipped), or browsers keep the stale modules.
- **No catch-all.** A missing file is a real 404; there's no rewrite to `index.html`. The old
  `/v2/` and `/classic.html` addresses redirect to `/`.
- **Check the link.** This folder's Netlify CLI has been mis-linked to other
  sites before. Confirm with `netlify status` (should say `art-heist`);
  `deploy.sh` also pins the site id explicitly.

## Local preview

```bash
python3 -m http.server 8123   # → http://localhost:8123
node scripts/smoke.mjs        # headless play-test against it
```
