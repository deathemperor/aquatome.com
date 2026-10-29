#!/usr/bin/env bash
# Add or update affiliate products: scripts/aff-add.sh products.json  (JSON array; see worker/affiliate/admin.ts for fields)
# Uses the dashboard token from ~/.config/thuysinh/ab-dash-token. Listing URLs must be on the network's own hosts.
set -euo pipefail
FILE="${1:?usage: aff-add.sh products.json}"
BASE="${SITE:-https://aquatome.com}"
curl -sS --fail-with-body -X POST "$BASE/_aff/products" \
  -H "authorization: Bearer $(cat "$HOME/.config/thuysinh/ab-dash-token")" \
  -H 'content-type: application/json' --data-binary "@$FILE"
echo
