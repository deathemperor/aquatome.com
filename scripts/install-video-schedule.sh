#!/usr/bin/env bash
# Install the YouTube job (video-cycle.sh) as a launchd agent, every 3 h, in the engine clone, and the engine's clock
# (engine-due.sh), every hour.
set -euo pipefail
source "$(dirname "$0")/launchd-agent.sh"
LABEL=run.aquatome.videos
CLONE="${ENGINE_CLONE:-$HOME/.local/share/aquatome/engine-repo}"
ORIGIN="$(git -C "$(dirname "$0")/.." remote get-url origin)"
LOG="$HOME/Library/Logs/aquatome-videos.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -d "$CLONE/.git" ] || git clone -q "$ORIGIN" "$CLONE"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$CLONE/scripts/video-cycle.sh</string></array>
  $(every_3h 0 40)
  $AGENT_PRIORITY
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
load_agent "$LABEL" "$PLIST"
echo "installed $LABEL → $CLONE (log: $LOG)"

# The engine's clock (engine-due.sh), hourly: starts a GitHub cycle when none started for ENGINE_EVERY_MINUTES.
DUE=run.aquatome.engine-due
DUE_PLIST="$HOME/Library/LaunchAgents/$DUE.plist"
cat > "$DUE_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$DUE</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$CLONE/scripts/engine-due.sh</string></array>
  $(hourly 55)
  $AGENT_PRIORITY
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
load_agent "$DUE" "$DUE_PLIST"
echo "installed $DUE → $CLONE (hourly, log: $LOG)"
