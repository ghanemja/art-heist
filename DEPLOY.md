# Deploy

Static three.js site, no build step. Hosted on **Netlify** (site `art-heist` (formerly `shelfie-jg`),
id `c1677cd8-337d-4500-879c-3aed0433fe67`) → https://art-heist.netlify.app

The site is **git-connected**: Netlify deploys github.com/ghanemja/art-heist and
publishes `main` automatically. Netlify's build command (`netlify.toml`) runs
`node scripts/validate-critic.mjs`, so a missing/broken `critic.glb` fails the
deploy before anything goes live. Pushing another branch does not publish.

A manual deploy still works from a machine with the Netlify CLI:

```bash
./deploy.sh
```

It validates the main character and the model assets, syncs every module's cache
token to main.js's, then runs `netlify deploy --prod` against the `art-heist` site id.

## Gotchas

- **Bump the cache token.** `index.html` (the main app) loads `js/main.js?cb=NN`; `classic.html` loads `planet.js?cb=pNN`. Bump `NN`
  whenever `planet.js` changes, or browsers/CDN keep the stale bundle (new CSS +
  old JS = "nothing changed").
- **Check the link.** This folder's Netlify CLI has been mis-linked to other
  sites before. Confirm with `netlify status` (should say `art-heist`);
  `deploy.sh` also pins the site id explicitly.

## Local preview

```bash
python3 -m http.server 5173   # → http://localhost:5173
```
