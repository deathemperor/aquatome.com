#!/usr/bin/env bash
# Build the site in staging mode (all pages noindex, robots disallow) and deploy to Cloudflare Workers static assets.
# Requires CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID if the token can see several accounts).
set -euo pipefail
cd "$(dirname "$0")/../apps/site"
STAGING=1 SITE_URL=https://thuysinh.infinitus.run pnpm build
printf '/*\n  X-Robots-Tag: noindex, nofollow\n' > dist/_headers
pnpm exec wrangler deploy
