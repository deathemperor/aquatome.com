#!/usr/bin/env bash
# Install the daily run of v2's flows on iOS 27.2 (ios-27-daily.sh) as a launchd agent, at 04:00, in its own clone.
#
#   scripts/install-ios-27-daily-schedule.sh <thread id>...
#
# The threads that hear of failing flows stay in ~/.config/aquatome/, and a run of this with none keeps those.
set -euo pipefail
source "$(dirname "$0")/launchd-agent.sh"
LABEL=run.aquatome.ios-27-daily
CLONE="$HOME/.local/share/aquatome/ios-27"
ORIGIN="$(git -C "$(dirname "$0")/.." remote get-url origin)"
THREADS="$HOME/.config/aquatome/ios-27-threads"
LOG="$HOME/Library/Logs/aquatome-ios-27-daily.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$(dirname "$THREADS")"
if [ $# -ge 1 ]; then
  (umask 077; printf '%s\n' "$@" > "$THREADS")
fi
[ -s "$THREADS" ] || { echo "no threads: pass their ids once" >&2; exit 1; }
[ -d "$CLONE/.git" ] || git clone -q "$ORIGIN" "$CLONE"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
# caffeinate keeps the Mac awake while a run goes.
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-i</string><string>/bin/bash</string><string>$CLONE/scripts/ios-27-daily.sh</string></array>
  $(daily 4 0)
  $AGENT_PRIORITY
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
load_agent "$LABEL" "$PLIST"
echo "installed $LABEL → $CLONE (04:00, log: $LOG)"
