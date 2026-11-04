#!/bin/sh
# On the repository's own Mac (apps/ios/README.md), its runner's .env names the simulator kept for it (AQ_CI_UDID):
# erased before a job, so each starts as on a fresh hosted runner (no app, keychain or settings left by the last), and
# shut down after (`--done`, a cancelled job's too). Nothing else on that Mac uses it. The job's xcodebuild is sent to it
# by AQ_CI_DEST, set here. Self-hosted without one fails: else xcodebuild would take any "iPhone 17" there, another's.
if [ "$RUNNER_ENVIRONMENT" = self-hosted ] && [ -z "$AQ_CI_UDID" ]; then
  echo "::error::this self-hosted runner has no simulator of its own (AQ_CI_UDID in its .env): see apps/ios/README.md"
  exit 1
fi
if [ -n "$AQ_CI_UDID" ]; then
  xcrun simctl shutdown "$AQ_CI_UDID" 2>/dev/null
  [ "$1" = --done ] && exit 0
  if xcrun simctl erase "$AQ_CI_UDID"; then
    [ -n "$GITHUB_ENV" ] && echo "AQ_CI_DEST=platform=iOS Simulator,id=$AQ_CI_UDID" >> "$GITHUB_ENV"
    exit 0
  fi
  echo "::error::the own Mac's simulator (AQ_CI_UDID in its runner's .env) is gone: make it again, as apps/ios/README.md says"
  exit 1
fi
[ "$1" = --done ] && exit 0
# Some runners don't list the simulator yet when the job starts: xcodebuild then stops at once with "Unable to find a
# device matching the provided destination specifier", on the same image a passing run used (twice on 2026-10-31).
# Wait for it, up to two minutes; the list goes in the log if it never shows.
for i in $(seq 1 24); do
  xcrun simctl list devices available -j | jq -e '[.devices | to_entries[] | select(.key | endswith("iOS-26-5")) | .value[] | select(.name == "iPhone 17")] | length > 0' >/dev/null && exit 0
  sleep 5
done
xcrun simctl list devices available
exit 1
