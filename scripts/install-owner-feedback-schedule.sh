#!/usr/bin/env bash
# Install the owner's reports' delivery (owner-feedback-deliver.mjs) as a launchd agent, every 30 seconds. launchd runs a
# missed interval when the Mac wakes. It runs a copy of the scripts, so a checkout changing or going away can't change what
# may post to the thread: run this again to update it.
#
#   scripts/install-owner-feedback-schedule.sh <thread id>
#
# The thread's id stays in ~/.config/aquatome/, with the dashboard token the job reads the queue with. Sending signs in
# anew each time and signs out after, so no key to the thread is kept (infinitus-send.mjs).
set -euo pipefail
LABEL=run.aquatome.owner-feedback
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="$HOME/.local/share/aquatome/owner-feedback"
THREAD_FILE="$HOME/.config/aquatome/owner-report-thread"
LOG="$HOME/Library/Logs/aquatome-owner-feedback.log"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"

if [ $# -ge 1 ]; then
  (umask 077; printf '%s\n' "$1" > "$THREAD_FILE")
fi
[ -s "$THREAD_FILE" ] || { echo "no thread: pass the thread's id once" >&2; exit 1; }
[ -s "$HOME/.config/aquatome/ab-dash-token" ] || { echo "no dashboard token in ~/.config/aquatome/ab-dash-token" >&2; exit 1; }

mkdir -p "$DIR" "$(dirname "$PLIST")" "$(dirname "$LOG")"
cp "$HERE/owner-feedback-deliver.mjs" "$HERE/infinitus-send.mjs" "$DIR/"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/owner-feedback-deliver.mjs</string></array>
  <key>StartInterval</key><integer>30</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLIST
launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UID" "$PLIST"
echo "installed $LABEL → $DIR (every 30 s, log: $LOG)"
