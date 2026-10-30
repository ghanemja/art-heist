#!/usr/bin/env bash
# The only blessed way to ship art-heist (art-heist.netlify.app). Validates the main character FIRST,
# so a missing/broken critic.glb aborts before anything reaches the live site,
# then deploys the repo root to production. Run: ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "→ validating main character…"
node scripts/validate-critic.mjs

echo "→ validating real-model assets…"
node scripts/validate-assets.mjs

echo "→ syncing every module's cache token to main.js's…"
# index.html's import map gives each js/ module main.js's ?cb token, so a deploy never mixes
# fresh and stale files in someone's browser cache
CB=$(grep -o 'main.js?cb=[0-9]*' index.html | head -1 | cut -d= -f2)
sed -i.bak -E "s#(\"\./js/[a-z]+\.js\": \"\./js/[a-z]+\.js\?cb=)[0-9]+#\1${CB}#g" index.html && rm -f index.html.bak

echo "→ deploying to art-heist.netlify.app…"
netlify deploy --prod --dir . --site c1677cd8-337d-4500-879c-3aed0433fe67
