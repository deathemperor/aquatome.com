#!/usr/bin/env bash
# Daily comment moderation on the home machine (claude -p on the subscription).
# Runs in the engine clone, which engine-cycle.sh keeps pulled and installed — so no git/pnpm work here.
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
. "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"
# A line a model call (claude.ts): moderation has no ceiling for its day (ceiling.ts), and what it spends is on the record.
export ENGINE_COST_LOG="${ENGINE_COST_LOG:-$HOME/Library/Logs/aquatome-cost-moderate.jsonl}"
echo "$(date -u +%FT%TZ) moderate start"
pnpm engine moderate
