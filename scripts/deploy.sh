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
# I18N_LENIENT: a UI string an Indonesian or Thai page lacks shows in Vietnamese rather than stopping the deploy.
I18N_LENIENT=1 PUBLIC_BUILD=1 SITE_URL=https://aquatome.com pnpm build
# The same list goes into the Worker: what it answers from until it has read the live one (worker/hidden.ts isHidden).
HIDDEN_PAGES="$(node -e 'try { process.stdout.write(Object.keys(JSON.parse(require("fs").readFileSync(".hidden.json", "utf8"))).join(" ")) } catch {}')"
[ "${#HIDDEN_PAGES}" -le 5000 ] || { echo "warning: hidden-page list over 5 KB, not baked in"; HIDDEN_PAGES=; } # a Worker variable's limit
# Cloudflare's API now and then fails an upload ("unknown error", code 10013; 5xx): try again before failing the deploy.
for i in 1 2 3; do
  pnpm exec wrangler deploy ${HIDDEN_PAGES:+--var "HIDDEN_PAGES:$HIDDEN_PAGES"} && break
  [ "$i" -lt 3 ] || exit 1
  echo "deploy failed, trying again in $((i * 30)) s"; sleep $((i * 30))
done
[ -f .hidden.json ] && shasum < .hidden.json | cut -c1-40 > "$HOME/.config/thuysinh/hidden-deployed" || true
