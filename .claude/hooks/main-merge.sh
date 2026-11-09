#!/bin/sh
# Runs on every Bash call, so Python only starts for the words it's looking for (main-merge.py).
input=$(cat)
case "$input" in *merge*|*pull*|*rebase*|*update-branch*) ;; *) exit 0 ;; esac
printf '%s' "$input" | python3 "$(dirname "$0")/main-merge.py"
status=$?
[ "$status" = 2 ] && exit 2
exit 0
