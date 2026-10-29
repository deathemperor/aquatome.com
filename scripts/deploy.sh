#!/usr/bin/env bash
# Production build (publish-gated content, indexable) → Cloudflare Workers static assets at https://aquatome.com.
# Requires CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID if the token can see several accounts).
set -euo pipefail
cd "$(dirname "$0")/../apps/site"
PUBLIC_BUILD=1 SITE_URL=https://aquatome.com pnpm build
pnpm exec wrangler deploy
