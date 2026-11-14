#!/usr/bin/env bash
# The owner's morning report at 07:00 in Vietnam: this Mac starts the job (daily-report.yml) at 06:58, about a minute before
# it's done. GitHub's own schedule ran it about 5 hours late on each day of 6 to 9 Nov 2026, and stays only as a backstop.
# A Mac asleep at 06:58 starts it when it wakes. launchd reads the Mac's clock, which is Vietnam's.
#
#   scripts/install-daily-report-schedule.sh
#
# gh uses this Mac's own sign-in, as the engine's cycles do, so there is no new secret.
set -euo pipefail
source "$(dirname "$0")/launchd-agent.sh"
LABEL=run.aquatome.daily-report
LOG="$HOME/Library/Logs/aquatome-daily-report.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# Three tries, 30 s apart: a moment without network at 06:58 shouldn't cost the morning its report.
JOB='export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"; for i in 1 2 3; do gh workflow run daily-report.yml -R deathemperor/aquatome.com --ref main && { echo "$(date -u +%FT%TZ) started"; exit 0; }; sleep 30; done; echo "$(date -u +%FT%TZ) could not start it"; exit 1'
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>-c</string><string>$(printf '%s' "$JOB" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')</string></array>
  $(daily 6 58)
  $AGENT_PRIORITY
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
load_agent "$LABEL" "$PLIST"
echo "installed $LABEL (06:58 on this Mac's clock, log: $LOG)"
