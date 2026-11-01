#!/bin/sh
# Some runners don't list the simulator yet when the job starts: xcodebuild then stops at once with "Unable to find a
# device matching the provided destination specifier", on the same image a passing run used (twice on 2026-10-31).
# Wait for it, up to two minutes; the list goes in the log if it never shows.
for i in $(seq 1 24); do
  xcrun simctl list devices available -j | jq -e '[.devices | to_entries[] | select(.key | endswith("iOS-26-5")) | .value[] | select(.name == "iPhone 17")] | length > 0' >/dev/null && exit 0
  sleep 5
done
xcrun simctl list devices available
exit 1
