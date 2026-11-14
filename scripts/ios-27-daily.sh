#!/usr/bin/env bash
# v2's flows against main, once a day, on the iOS the owner's phone has. Pull requests' flows run on iOS 26.5, and on
# 2026-11-10 two bugs only 27.2 draws had reached the owner's phone past them: a frosted band, and search giving no field.
# TestFlight builds with this Mac's SDK, and so does this. A normal turn of both queues, from 04:00, in its own clone.
#
# Flows that fail go to the threads in ~/.config/aquatome/ios-27-threads, never the owner. A run that stops short of a
# result (no simulator, no build, no turn in time) is this Mac's problem, not theirs: it is only recorded, in runs.jsonl,
# where the Machine Load Lead's morning check reads it, along with any failure that couldn't be sent.
# Installed by install-ios-27-daily-schedule.sh.
set -euo pipefail
export PATH="${PATH:+$PATH:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$(dirname "$0")/.."
log() { echo "$(date -u +%FT%TZ) $*"; }
# Each run starts from GitHub's main and drops what the clone holds, so only in an engine clone, never a working checkout.
case "$PWD/" in "$HOME/.local/share/aquatome/"*) ;; *) log "not an engine clone (~/.local/share/aquatome/): not running"; exit 1 ;; esac
# shellcheck disable=SC1091
source scripts/cycle-checks.sh
from_main "$@"

RUNTIME=com.apple.CoreSimulator.SimRuntime.iOS-27-2
DEVICE_TYPE=com.apple.CoreSimulator.SimDeviceType.iPhone-13-Pro-Max
# Its own, so a lead's work on the other 27.2 simulators never shares it.
DEVICE="iPhone 13 Pro Max daily 27.2"
PROJECT=apps/ios/AquaTome.xcodeproj
OUT="$HOME/.cache/aquatome/ios-27"
RESULT="$OUT/result.xcresult"
RUNS="$OUT/runs.jsonl"
THREADS="$HOME/.config/aquatome/ios-27-threads"
# A turn in either queue: the flows took 14 minutes on 26.5, so an hour is a run that has stopped answering, and the jobs
# behind it wait for nothing.
TURN_LIMIT=1h
# Four hours from its start, cooling down and both queues' waits included: from 04:00, a run with no turn on the simulator
# by 08:00 would be running into the working day.
DEADLINE=$(($(date +%s) + ${WHOLE_SECONDS:-14400}))
mkdir -p "$OUT"

BUILD_MINUTES=null MINUTES=null PASSED=0 FAILED=0 NAMES='[]' TOLD=null EXIT=null
minutes() { jq -n --argjson from "$1" --argjson to "$(date +%s)" '(($to - $from) / 6 | round) / 10'; }

# One line of runs.jsonl, and the run is over. The minutes are the build's and the flows' own, not their wait in the queues.
finish() {
  jq -nc --arg at "$(date -u +%FT%TZ)" --arg commit "$(git rev-parse --short HEAD)" --arg outcome "$1" \
    --argjson build_minutes "$BUILD_MINUTES" --argjson minutes "$MINUTES" --argjson passed "$PASSED" --argjson failed "$FAILED" \
    --argjson names "$NAMES" --argjson told "$TOLD" --argjson exit "$EXIT" \
    '{at: $at, commit: $commit, outcome: $outcome, build_minutes: $build_minutes, minutes: $minutes, passed: $passed, failed: $failed, names: $names, told: $told, exit: $exit}' >> "$RUNS"
  log "$1"
  exit 0
}

# This phone on this iOS, made the first time.
device() {
  local udid
  udid=$(xcrun simctl list devices -j | jq -r --arg r "$RUNTIME" --arg n "$DEVICE" '[.devices[$r][]? | select(.name == $n and .isAvailable)][0].udid // empty')
  if [ -n "$udid" ]; then echo "$udid"; else xcrun simctl create "$DEVICE" "$DEVICE_TYPE" "$RUNTIME"; fi
}

# v2's flows and page shots, as flow_lists.py keeps them for a change to v2.
flows() { python3 -c 'import sys; sys.path.insert(0, "apps/ios/scripts"); import flow_lists as f; print(" ".join(f"-only-testing:{f.UI}/{t}" for t in f.REACH[f.APP + "V2/"]))'; }

# Every thread hears, or the run's line says not. A second try a minute on: a send can meet the owner's reports' sign-out
# (infinitus-send.mjs), and they'd be retried in 30 s too.
tell() {
  local thread
  [ -s "$THREADS" ] || { log "no threads in $THREADS"; TOLD=false; return 0; }
  # shellcheck disable=SC1091
  { . "$HOME/.nvm/nvm.sh" && nvm use --silent "$(cat .nvmrc)"; } || { log "no node to send with"; TOLD=false; return 0; }
  TOLD=true
  for thread in $(cat "$THREADS"); do
    node scripts/ios-27-notify.mjs "$thread" "$1" || { sleep "${TELL_PAUSE:-60}"; node scripts/ios-27-notify.mjs "$thread" "$1"; } || { log "couldn't tell one of the threads"; TOLD=false; }
  done
}

cool
udid=$(device) || finish "no simulator"
trap 'xcrun simctl shutdown "$udid" 2>/dev/null || true' EXIT
tests=$(flows) && [ -n "$tests" ] || finish "no flow list"

# The start is written once it has its turn, so its minutes aren't the queue's.
turn bash -c 'date +%s > "$0"; exec "$@"' "$OUT/build-started" timeout -k 30s "$TURN_LIMIT" xcodebuild build-for-testing -quiet -project "$PROJECT" -scheme AquaTome \
  -destination "id=$udid" -derivedDataPath "$OUT/dd" CODE_SIGNING_ALLOWED=NO || finish "no build"
BUILD_MINUTES=$(minutes "$(cat "$OUT/build-started")")

left=$((DEADLINE - $(date +%s)))
[ "$left" -gt 0 ] || finish "no turn in time"
rm -rf "$RESULT"
rc=0
# The inner limit is the turn's, the outer one the wait's too. --foreground signals only sim-run.py: a plain timeout signals
# it twice (the child, then its group), and a second forward is the SIGKILL that leaves xcodebuild running with no parent.
# ios.yml's flags: a flow fails only if it fails twice.
# shellcheck disable=SC2086
timeout --foreground "${left}s" apps/ios/scripts/sim-run.py timeout -k 30s "$TURN_LIMIT" xcodebuild test-without-building -quiet -project "$PROJECT" -scheme AquaTome \
  -destination "id=$udid" -derivedDataPath "$OUT/dd" -resultBundlePath "$RESULT" -test-timeouts-enabled YES \
  -default-test-execution-time-allowance 600 -retry-tests-on-failure -test-iterations 2 $tests || rc=$?

summary=$(xcrun xcresulttool get test-results summary --path "$RESULT" 2>/dev/null) && jq -e . >/dev/null <<<"$summary" || summary='{}'
MINUTES=$(jq 'if .finishTime and .startTime then (((.finishTime - .startTime) / 6) | round) / 10 else null end' <<<"$summary")
PASSED=$(jq '.passedTests // 0' <<<"$summary")
FAILED=$(jq '.failedTests // 0' <<<"$summary")

if [ "$FAILED" -gt 0 ]; then
  # Names only, and only names as the code writes them: a failure's text can quote a page, and these threads take instructions.
  NAMES=$(jq -c '[.testFailures[]?.testIdentifierString | select(test("^[A-Za-z0-9_/.()]+$"))] | unique' <<<"$summary")
  names=$(jq -r '.[] | "- " + .' <<<"$NAMES")
  tell "Daily run on iOS 27.2 against main ($(git rev-parse --short HEAD)): $FAILED of $((PASSED + FAILED)) of v2's flows failed, after a retry.
$names
Their result bundle stays on the Mac until the next run: ~/.cache/aquatome/ios-27/result.xcresult. The Design Lead and the v2 Lab both have this, so agree who takes it before starting."
  finish failed
fi
# Passing means flows ran: a list that matches no test also exits 0.
[ "$rc" -eq 0 ] && [ "$PASSED" -gt 0 ] && finish passed
EXIT=$rc
finish "no result"
