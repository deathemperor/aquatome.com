#!/bin/bash
# AquaTome CI: a standard macOS user of its own for this Mac's TestFlight uploads. CI code then doesn't run as the owner,
# and an upload's keychain changes touch only this user's keychain list, never the owner's.
#
# Run once, from the owner's own account, in Terminal:
#   sudo bash apps/ios/scripts/ci-user.sh
# sudo asks for the admin password once. Nothing else is asked.
#
# What it does, and nothing more:
#   1. Makes the user "AquaTome CI" (aquatomeci): standard, not an admin, hidden from the login window. Its password is
#      random and kept nowhere, so nobody signs in as it.
#   2. Lets the owner's account act as that user (never the other way round), and restart its runner, so setting up
#      the runner afterwards needs no more passwords.
#   3. Has macOS start that runner as that user once it's set up, and keep it running.
# Undo it all: sudo bash apps/ios/scripts/ci-user.sh --undo
set -euo pipefail

CI=aquatomeci
LABEL=run.aquatome.ci-runner
PLIST=/Library/LaunchDaemons/$LABEL.plist
RUNNER=/Users/$CI/actions-runner/aquatome-upload
SUDOERS=/etc/sudoers.d/aquatome-ci

[ "$(id -u)" = 0 ] || { echo "Run it with sudo: sudo bash $0"; exit 1; }
OWNER=${SUDO_USER:-}
if [ -z "$OWNER" ] || [ "$OWNER" = root ]; then echo "Run it with sudo from the owner's own account"; exit 1; fi

if [ "${1:-}" = --undo ]; then
  launchctl bootout "system/$LABEL" 2>/dev/null || true
  rm -f "$PLIST" "$SUDOERS"
  if id "$CI" >/dev/null 2>&1; then sysadminctl -deleteUser "$CI"; fi
  echo "AquaTome CI removed."
  exit 0
fi

# 1. The user.
if ! id "$CI" >/dev/null 2>&1; then
  sysadminctl -addUser "$CI" -fullName "AquaTome CI" -shell /bin/zsh -home "/Users/$CI" \
    -password "$(openssl rand -base64 32)"
fi
id "$CI" >/dev/null
createhomedir -c -u "$CI" >/dev/null
dscl . -create "/Users/$CI" IsHidden 1
if dseditgroup -o checkmember -m "$CI" admin >/dev/null 2>&1; then dseditgroup -o edit -d "$CI" -t user admin; fi
# Xcode's developer tools without an admin prompt (for its own processes only).
dseditgroup -o edit -a "$CI" -t user _developer

# 2. The owner's account may act as it, and restart its runner. Checked by visudo before it takes effect.
cat > "$SUDOERS.new" <<EOF
$OWNER ALL=($CI) NOPASSWD: ALL
$OWNER ALL=(root) NOPASSWD: /bin/launchctl kickstart -k system/$LABEL
EOF
chmod 440 "$SUDOERS.new"
visudo -cqf "$SUDOERS.new"
mv "$SUDOERS.new" "$SUDOERS"

# 3. Its runner, started by macOS as that user once it's registered (the .runner file), restarted if it stops.
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>UserName</key><string>$CI</string>
  <key>WorkingDirectory</key><string>$RUNNER</string>
  <key>ProgramArguments</key><array><string>$RUNNER/runsvc.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ACTIONS_RUNNER_SVC</key><string>1</string>
    <key>HOME</key><string>/Users/$CI</string>
  </dict>
  <key>KeepAlive</key>
  <dict><key>PathState</key><dict><key>$RUNNER/.runner</key><true/></dict></dict>
  <key>SessionCreate</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>ProcessType</key><string>Standard</string>
  <key>ThrottleInterval</key><integer>30</integer>
</dict>
</plist>
EOF
chown root:wheel "$PLIST"
chmod 644 "$PLIST"
plutil -lint -s "$PLIST"
launchctl bootout "system/$LABEL" 2>/dev/null || true
launchctl bootstrap system "$PLIST"

echo "Done: AquaTome CI ($CI) exists, standard and hidden; its runner starts once it's set up."
