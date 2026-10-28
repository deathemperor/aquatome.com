#!/usr/bin/env bash
# Install daily comment moderation (04:00 local) as a launchd agent, running from the engine clone.
set -euo pipefail
LABEL=run.thuysinh.moderate
CLONE="${ENGINE_CLONE:-$HOME/.local/share/thuysinh/engine-repo}"
LOG="$HOME/Library/Logs/thuysinh-moderate.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -d "$CLONE/.git" ] || { echo "no engine clone at $CLONE — run install-engine-schedule.sh first"; exit 1; }
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$CLONE/scripts/moderate-cycle.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "installed $LABEL → $CLONE (log: $LOG)"
