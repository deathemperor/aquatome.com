#!/usr/bin/env bash
# Install this Mac's upkeep (machine-sweep.mjs, hourly) and its readings (machine-metric.py, every 10 minutes) as launchd
# agents, from the engine clone. The readings run at normal priority: that's what they measure.
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
    <key>PATH</key><string>$HOME/.local/bin:$HOME/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  $(hourly 35)
  $AGENT_PRIORITY
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
load_agent "$LABEL" "$PLIST"
echo "installed $LABEL → $CLONE (log: $LOG)"

METRIC=run.aquatome.machine-metric
METRIC_PLIST="$HOME/Library/LaunchAgents/$METRIC.plist"
cat > "$METRIC_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$METRIC</string>
  <key>ProgramArguments</key><array><string>/opt/homebrew/bin/python3</string><string>-I</string><string>$CLONE/scripts/machine-metric.py</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
load_agent "$METRIC" "$METRIC_PLIST"
echo "installed $METRIC → $CLONE (readings: ~/.cache/aquatome/machine-metrics.jsonl)"
