#!/bin/sh
# A simulator test run takes its turn (AGENTS.md, "This Mac"): an `xcodebuild test` a session starts that isn't through
# apps/ios/scripts/sim-run.py stops here and says so. Only where xcodebuild is the command run: a `grep 'xcodebuild test'`
# or a file written with those words passes.
input=$(cat)
case "$input" in *xcodebuild*) ;; *) exit 0 ;; esac
case "$input" in *sim-run.py*) exit 0 ;; esac
printf '%s' "$input" |
  grep -Eq '("command"[[:space:]]*:[[:space:]]*"|\\n|[;&|(])[[:space:]]*((exec|nice|caffeinate|timeout)[[:space:]]+([^;&|[:space:]]+[[:space:]]+)*)?xcodebuild[[:space:]]([^;&|]*[[:space:]])?(test|test-without-building)([[:space:]]|\\|")' ||
  exit 0
echo 'One simulator test run at a time on this Mac: start it as apps/ios/scripts/sim-run.py xcodebuild test ...' >&2
exit 2
