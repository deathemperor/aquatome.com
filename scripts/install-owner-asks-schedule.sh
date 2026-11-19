#!/usr/bin/env bash
# Install the sending of the owner's asks (owner-asks-send.mjs) as a launchd agent, every minute. launchd runs a missed
# interval when the Mac wakes. It runs a copy of the script, so a checkout changing or going away can't change what it
# sends: run this again to update it.
#
#   scripts/install-owner-asks-schedule.sh
#
# It reads the chief of staff's list (~/.cache/aquatome/cos/owner-todo.json) and the dashboard token
# (~/.config/aquatome/ab-dash-token), and writes its last result beside the list (owner-asks-sent.json).
set -euo pipefail
source "$(dirname "$0")/launchd-agent.sh"
LABEL=run.aquatome.owner-asks
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="$HOME/.local/share/aquatome/owner-asks"
LOG="$HOME/Library/Logs/aquatome-owner-asks.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"

[ -s "$HOME/.config/aquatome/ab-dash-token" ] || { echo "no dashboard token in ~/.config/aquatome/ab-dash-token" >&2; exit 1; }

mkdir -p "$DIR" "$(dirname "$PLIST")" "$(dirname "$LOG")"
cp "$HERE/owner-asks-send.mjs" "$DIR/"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/owner-asks-send.mjs</string></array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  $AGENT_PRIORITY
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
load_agent "$LABEL" "$PLIST"
echo "installed $LABEL → $DIR (every minute, log: $LOG)"
