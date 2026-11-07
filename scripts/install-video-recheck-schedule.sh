#!/usr/bin/env bash
# Install the video guides' recheck (video-recheck.sh) as a launchd agent, hourly, in its own clone, so it runs beside the
# video job (install-video-schedule.sh) and the engine's parts. Once every guide is checked again and redone, a run calls
# no model; `launchctl bootout gui/$UID/run.aquatome.video-recheck` then takes it off.
set -euo pipefail
LABEL=run.aquatome.video-recheck
CLONE="$HOME/.local/share/aquatome/engine-video-recheck"
ORIGIN="$(git -C "$(dirname "$0")/.." remote get-url origin)"
LOG="$HOME/Library/Logs/aquatome-video-recheck.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -d "$CLONE/.git" ] || git clone -q "$ORIGIN" "$CLONE"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
# caffeinate keeps the Mac awake while a run goes.
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-i</string><string>/bin/bash</string><string>$CLONE/scripts/video-recheck.sh</string></array>
  <key>StartInterval</key><integer>3600</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "installed $LABEL → $CLONE (hourly, log: $LOG)"
