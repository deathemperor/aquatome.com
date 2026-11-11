#!/bin/sh
# Heavy work's turn on this Mac (AGENTS.md, This Mac): scripts/checks.sh <command> waits in the checks queue (lockf on
# ~/.cache/aquatome/checks.lock, first come first served), then runs the command and exits with its status. While the chief
# of staff keeps the next turn for another run (scripts/next-turn.py), this one steps back when it reaches the front: it
# gives the turn up before the command starts, and queues again a little later, behind the run it was kept for.
[ $# -gt 0 ] || { echo "usage: scripts/checks.sh <command>" >&2; exit 64; }
here=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$HOME/.cache/aquatome"
# One queue for both users (apps/ios/README.md): a link to the shared file. A plain `lockf` without -k deletes its lock file
# when it ends, and the next one makes a file of this user's, so from 2026-11-09 18:36 to 11-10 13:31 TestFlight's archive
# ran beside everyone's builds and tests. Put back here, as every heavy job comes through.
# Only a real home's: a test's stands in for one, and must never join the real queue.
shared=${AQ_SHARED_LOCKS:-}
case "$HOME" in /Users/*/*) ;; /Users/*) shared=${shared:-/Users/Shared/aquatome} ;; esac
lock=$HOME/.cache/aquatome/checks.lock
if [ -n "$shared" ] && [ -f "$shared/checks.lock" ] && [ ! -L "$lock" ]; then ln -s "$shared/checks.lock" "$lock.$$" && mv -f "$lock.$$" "$lock"; fi
back=$(mktemp "$HOME/.cache/aquatome/checks-back.XXXXXX") || exit 70
trap 'rm -f "$back"' EXIT
said=
while :; do
  : >"$back"
  # Under the lock: a run that steps back writes whom for into $back and gives up the turn. Named by its pid or its
  # lockf's ($PPID there, the one ps shows waiting), it goes.
  lockf -k "$HOME/.cache/aquatome/checks.lock" sh -c \
    'python3 "$1/next-turn.py" --kept checks "$2,$PPID" "$PWD $3" >"$4" 2>/dev/null && exit 0; : >"$4"; shift 4; exec "$@"' \
    sh "$here" "$$" "$*" "$back" "$@"
  status=$?
  [ -s "$back" ] || exit "$status"
  [ -n "$said" ] || echo "checks.sh: the chief of staff kept the next turn for $(cat "$back"): this one steps back until it has had it" >&2
  said=1
  sleep "${CHECKS_NEXT_PAUSE:-10}"
done
