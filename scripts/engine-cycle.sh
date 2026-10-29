#!/usr/bin/env bash
# One content-engine cycle on the home machine: sync → run engine → build + test → commit + push → deploy.
# Runs from a dedicated clone (see install-engine-schedule.sh) so it never touches a development checkout.
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
log() { echo "$(date -u +%FT%TZ) $*"; }

# Single instance: a PID file, so a crashed or killed cycle doesn't block the schedule forever.
PIDFILE="${TMPDIR:-/tmp}/thuysinh-engine.pid"
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then log "previous cycle (pid $(cat "$PIDFILE")) still running"; exit 0; fi
echo $$ > "$PIDFILE"
trap 'rm -f "$PIDFILE"' EXIT

TOKEN_FILE="$HOME/.config/thuysinh/cf-token"
[ -s "$TOKEN_FILE" ] || { log "missing $TOKEN_FILE — not running"; exit 1; }

# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"
log "cycle start"
if [ -n "$(git status --porcelain -- content sources)" ]; then
  log "uncommitted content from an earlier failed cycle — fix it (see /tmp/thuysinh-engine-test.log) before new runs"; exit 1
fi
git checkout -q main && git pull -q --ff-only
pnpm install --frozen-lockfile --silent
pnpm engine run --max-minutes "${ENGINE_MAX_MINUTES:-300}" ${ENGINE_ARGS:-}
# No people in photos: drop any with a human face (before thumbs, so none are made for dropped photos).
pnpm engine faces || log "faces: failed (unscreened photos may publish)"
# Card thumbs for photos stored before thumbs existed; a failure only means full-size photos on cards.
pnpm engine thumbs || log "thumbs: some failed (cards fall back to full photos)"
# Temperament / fin-nipping / school size for new or changed species (tank-mates checker).
pnpm engine traits --limit 200 || log "traits: failed (checker shows missing data)"

if [ -z "$(git status --porcelain -- content sources)" ]; then
  # Pages hidden or unhidden on the dashboard since the last deploy still need a build to leave (or rejoin) the lists.
  HIDDEN_JSON="$(curl -sf -H "authorization: Bearer $(cat "$HOME/.config/thuysinh/ab-dash-token")" https://aquatome.com/_ab/hidden.json || true)"
  HIDDEN_NOW="$(printf '%s' "$HIDDEN_JSON" | shasum | cut -c1-40)"
  if [ -n "$HIDDEN_JSON" ] && [ "$HIDDEN_NOW" != "$(cat "$HOME/.config/thuysinh/hidden-deployed" 2>/dev/null)" ]; then
    log "hidden pages changed — redeploying"; CLOUDFLARE_API_TOKEN="$(cat "$TOKEN_FILE")" scripts/deploy.sh; exit 0
  fi
  log "no content changes"; exit 0
fi
# Real content must build (the test suite builds fixtures), then the suite must pass.
if ! { pnpm build && pnpm test; } >/tmp/thuysinh-engine-test.log 2>&1; then
  log "build/tests failed, not publishing (see /tmp/thuysinh-engine-test.log)"; exit 1
fi
git add content sources engine-state
git commit -q -m "content: engine run $(date -u +%F)"
# Code may have merged during the run (it can take hours): replay the content commit on top, then publish.
git pull -q --rebase
git push -q
CLOUDFLARE_API_TOKEN="$(cat "$TOKEN_FILE")" scripts/deploy.sh
log "cycle done"
