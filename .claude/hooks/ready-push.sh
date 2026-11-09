#!/bin/sh
# Runs on every Bash call, so Python only starts for the word it's looking for (ready-push.py).
input=$(cat)
case "$input" in *push*) ;; *) exit 0 ;; esac
printf '%s' "$input" | python3 "$(dirname "$0")/ready-push.py"
status=$?
[ "$status" = 2 ] && exit 2
exit 0
