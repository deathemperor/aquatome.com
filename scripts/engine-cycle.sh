#!/usr/bin/env bash
# One content-engine cycle on the home machine: sync → run engine → test → commit + push → deploy staging.
# Runs from a dedicated clone (see install-engine-schedule.sh) so it never touches a development checkout.
set -euo pipefail
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
LOCK="${TMPDIR:-/tmp}/thuysinh-engine.lock"
mkdir "$LOCK" 2>/dev/null || { echo "$(date -u +%FT%TZ) previous cycle still running"; exit 0; }
trap 'rmdir "$LOCK"' EXIT

# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"
echo "$(date -u +%FT%TZ) cycle start"
git checkout -q main && git pull -q --ff-only
pnpm install --frozen-lockfile --silent
pnpm engine run --max-minutes "${ENGINE_MAX_MINUTES:-300}" ${ENGINE_ARGS:-}

if [ -z "$(git status --porcelain -- content sources engine-state)" ]; then
  echo "$(date -u +%FT%TZ) no content changes"; exit 0
fi
if ! pnpm test >/tmp/thuysinh-engine-test.log 2>&1; then
  echo "$(date -u +%FT%TZ) tests failed, not publishing (see /tmp/thuysinh-engine-test.log)"; exit 1
fi
git add content sources engine-state
git commit -q -m "content: engine run $(date -u +%F)"
git push -q
CLOUDFLARE_API_TOKEN="$(cat "$HOME/.config/thuysinh/cf-token")" scripts/deploy-staging.sh
echo "$(date -u +%FT%TZ) cycle done"
