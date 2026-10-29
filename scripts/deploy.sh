#!/usr/bin/env bash
# Production build (publish-gated content, indexable) → Cloudflare Workers static assets at https://aquatome.com.
# Requires CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID if the token can see several accounts).
set -euo pipefail
cd "$(dirname "$0")/../apps/site"
# Pages hidden from the /_ab/ dashboard leave lists, sitemap and search (the Worker already answers 410 for them).
# On failure the last fetched list is kept; hidden pages still 410 either way.
DASH_TOKEN="$HOME/.config/thuysinh/ab-dash-token"
if [ -s "$DASH_TOKEN" ] && curl -sf -H "authorization: Bearer $(cat "$DASH_TOKEN")" https://aquatome.com/_ab/hidden.json -o .hidden.json.tmp; then
  mv .hidden.json.tmp .hidden.json
else
  rm -f .hidden.json.tmp; echo "warning: hidden-page list unavailable, using the last one fetched"
fi
PUBLIC_BUILD=1 SITE_URL=https://aquatome.com pnpm build
pnpm exec wrangler deploy
[ -f .hidden.json ] && shasum < .hidden.json | cut -c1-40 > "$HOME/.config/thuysinh/hidden-deployed" || true
