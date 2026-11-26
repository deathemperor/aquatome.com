#!/usr/bin/env bash
# The shell sandbox the auto-fix's agent runs every command in (.github/workflows/fix.yml): the CLI's own, on Linux
# bubblewrap with socat for its network, and the agent is never let outside it. GitHub's runner has neither, so from
# 12 Nov 2026 every session's shell failed to start ("socat not installed") and the agent, rightly refusing to run
# outside the sandbox, could only read. This installs both, then starts a sandbox the way the CLI does (its own
# namespaces, no network but its proxy's) and stops the job if one can't start: a session that could do nothing is
# never paid for.
set -euo pipefail

if ! command -v socat >/dev/null 2>&1 || ! command -v bwrap >/dev/null 2>&1; then
  sudo -n apt-get update -qq
  sudo -n apt-get install -y -qq --no-install-recommends socat bubblewrap
fi
socat -V >/dev/null

starts() { bwrap --ro-bind / / --dev /dev --proc /proc --unshare-all --die-with-parent true; }
if ! starts; then
  # Ubuntu keeps a program's own user namespaces behind AppArmor; this runner is the job's alone and thrown away after it.
  flag=/proc/sys/kernel/apparmor_restrict_unprivileged_userns
  if [ -r "$flag" ] && [ "$(cat "$flag")" = 1 ]; then
    sudo -n sysctl -q -w kernel.apparmor_restrict_unprivileged_userns=0
  fi
  if ! starts; then
    echo "sandbox-ready: a sandbox can't start on this runner, so the agent isn't started" >&2
    exit 1
  fi
fi
echo "sandbox-ready: bubblewrap and socat are here, and a sandbox starts"
