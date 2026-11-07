#!/usr/bin/env bash
# Install this Mac's upkeep (machine-sweep.mjs) as a launchd agent, hourly, from the engine clone.
set -euo pipefail
source "$(dirname "$0")/launchd-agent.sh"
LABEL=run.aquatome.machine-sweep
CLONE="${ENGINE_CLONE:-$HOME/.local/share/aquatome/engine-repo}"
ORIGIN="$(git -C "$(dirname "$0")/.." remote get-url origin)"
LOG="$HOME/Library/Logs/aquatome-machine-sweep.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -d "$CLONE/.git" ] || git clone -q "$ORIGIN" "$CLONE"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/usr/bin/env</string><string>node</string><string>$CLONE/scripts/machine-sweep.mjs</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  $(hourly 35)
  $AGENT_PRIORITY
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
load_agent "$LABEL" "$PLIST"
echo "installed $LABEL → $CLONE (log: $LOG)"
