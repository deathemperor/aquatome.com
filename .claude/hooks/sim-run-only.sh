#!/bin/sh
# Runs on every Bash call, so the check that starts Python only comes after the word it's looking for (sim-run-only.py).
input=$(cat)
case "$input" in *xcodebuild*) ;; *) exit 0 ;; esac
printf '%s' "$input" | python3 "$(dirname "$0")/sim-run-only.py"
status=$?
[ "$status" = 2 ] && exit 2
exit 0
