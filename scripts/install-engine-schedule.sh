#!/usr/bin/env bash
# Install the engine's macOS parts (pages, sf, photos: scripts/engine-cycle.sh <part>) as launchd agents on the owner's
# Mac, every 3 h, an hour apart, each from its own clone so the three run side by side. GitHub runs the fourth, rewrite
# (engine.yml); engine-repo stays video-cycle.sh's (install-video-schedule.sh).
set -euo pipefail
source "$(dirname "$0")/launchd-agent.sh"
ORIGIN="$(git -C "$(dirname "$0")/.." remote get-url origin)"
BASE="$HOME/.local/share/aquatome"
FIRST_HOUR=0
for PART in pages sf photos; do
  LABEL="run.aquatome.engine-$PART"
  CLONE="$BASE/engine-$PART"
  LOG="$HOME/Library/Logs/aquatome-engine-$PART.log"
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  # pages keeps the engine's Chrome profile, where the owner passes a source's browser check; the others get their own,
  # as one Chrome at a time can use a profile.
  PROFILE="$HOME/.cache/aquatome/chrome-profile"
  [ "$PART" = pages ] || PROFILE="$PROFILE-$PART"
  [ -d "$CLONE/.git" ] || git clone -q "$ORIGIN" "$CLONE"
  mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
  # 150 minutes of pages, so a part ends inside its 3 hours; caffeinate keeps the Mac awake while one runs. The YouTube
  # steps are video-cycle.sh's (SKIP_VIDEOS).
  cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-i</string><string>/bin/bash</string><string>$CLONE/scripts/engine-cycle.sh</string><string>$PART</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>ENGINE_PROFILE</key><string>$PROFILE</string>
    <key>ENGINE_MAX_MINUTES</key><string>150</string>
    <key>SKIP_VIDEOS</key><string>1</string>
  </dict>
  $(every_3h "$FIRST_HOUR" 10)
  $AGENT_PRIORITY
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
  load_agent "$LABEL" "$PLIST"
  FIRST_HOUR=$((FIRST_HOUR + 1))
  echo "installed $LABEL → $CLONE (log: $LOG)"
done
