#!/bin/sh
# A screen recording on a quiet Mac: scripts/quiet-recording.sh [minutes] <command>
#
# It takes the simulator turn, then the checks turn, so nothing of ours tests or builds beside it (CI's flows, TestFlight's
# archive, the engine's and the leads' builds and tests wait, and aren't skipped). What's already running finishes first. If
# the Mac still isn't quiet after 3 minutes of holding both, it gives them back without recording (exit 75): a take then
# loses its frames. Holds them 10 minutes at most by default, 20 if asked, so whatever is waiting isn't kept long.
PATH="$PATH:/opt/homebrew/bin"
here=$(cd "$(dirname "$0")" && pwd)
case "${1:-}" in
  '' | *[!0-9]*) minutes=10 ;;
  *) minutes=$1; shift ;;
esac
[ $# -gt 0 ] && [ "$minutes" -ge 1 ] && [ "$minutes" -le 20 ] || { echo "usage: scripts/quiet-recording.sh [minutes, 20 at most] <command>" >&2; exit 64; }
exec "$here/../apps/ios/scripts/sim-run.py" "$here/checks.sh" timeout -k 10s "${minutes}m" sh -c '
  if ! python3 "$1" --wait "${QUIET_WAIT_MINUTES:-3}"; then echo "not recorded: still too loaded" >&2; exit 75; fi
  shift; exec "$@"' sh "$here/mac-status.py" "$@"
