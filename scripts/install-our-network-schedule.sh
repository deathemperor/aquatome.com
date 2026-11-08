#!/usr/bin/env bash
# Tell the site, every 10 minutes, that this Mac's network is ours (worker/us.ts): the beacon then marks every visit from it,
# the agents' preview browser, their Chrome, the simulators, Device panel sessions and any browser script, as ours, and the
# readers page counts them apart instead of as readers. The site keeps only a keyed hash of the address, and forgets it 25
# minutes after the last report, so a new address (the router restarting, the laptop on another network) is ours within
# 10 minutes, and one the Mac left, a café's, is a reader's again within 25.
#
#   scripts/install-our-network-schedule.sh
#
# The job reads the dashboard token from ~/.config/aquatome/ab-dash-token at each run; it isn't copied anywhere, and it
# reaches curl on its standard input, never on a command line.
set -euo pipefail
source "$(dirname "$0")/launchd-agent.sh"
LABEL=run.aquatome.our-network
TOKEN="$HOME/.config/aquatome/ab-dash-token"
LOG="$HOME/Library/Logs/aquatome-our-network.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
[ -s "$TOKEN" ] || { echo "no dashboard token in $TOKEN" >&2; exit 1; }

# printf is the shell's own, so the token is in no process's arguments.
JOB="printf 'header = \"Authorization: Bearer %s\"\\n' \"\$(cat '$TOKEN')\" | /usr/bin/curl -fsS --max-time 20 -K - -X POST https://aquatome.com/_ab/our-network; echo \" \$(date -u +%FT%TZ)\""
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>-c</string><string>$(printf '%s' "$JOB" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  $AGENT_PRIORITY
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
load_agent "$LABEL" "$PLIST"
echo "installed $LABEL (every 10 min, log: $LOG)"
