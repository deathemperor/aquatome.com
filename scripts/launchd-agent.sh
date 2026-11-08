#!/usr/bin/env bash
# Sourced by the install-*-schedule.sh scripts: when an agent starts, how it runs, and loading it.
#
# Each agent has its own minutes, so they don't all start together. Nice 10 and LowPriorityIO give way to what someone is
# waiting on. Not ProcessType Background: that keeps a job to the 4 efficiency cores, which a simulator's daemons fill. A
# 1.9 s job took 17 s there with one simulator up and 405 s with four, against 2.6 s and 19 s at Nice 10 (2026-11-08), and
# tests that run out of time cost a cycle its pages (cycle-checks.sh).
AGENT_PRIORITY='<key>Nice</key><integer>10</integer><key>LowPriorityIO</key><true/>'

# every_3h <first hour, 0 to 2> <minute>
every_3h() {
  printf '<key>StartCalendarInterval</key><array>'
  for hour in $(seq "$1" 3 23); do printf '<dict><key>Hour</key><integer>%d</integer><key>Minute</key><integer>%d</integer></dict>' "$hour" "$2"; done
  printf '</array>'
}
# hourly <minute>
hourly() { printf '<key>StartCalendarInterval</key><dict><key>Minute</key><integer>%d</integer></dict>' "$1"; }

# load_agent <label> <plist>. bootout stops a running job, and the next cycle drops a stopped one's work, so a running job
# keeps its old plist until it ends: machine-sweep.mjs loads the new one then (a plist newer than its stamp).
load_agent() {
  local stamps="$HOME/.cache/aquatome/agents-loaded"
  if launchctl print "gui/$UID/$1" 2>/dev/null | grep -Eq '^[[:space:]]*pid = '; then
    echo "$1 is running: the hourly sweep loads its new plist when it ends"
    return 0
  fi
  launchctl bootout "gui/$UID/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$UID" "$2"
  mkdir -p "$stamps"
  touch "$stamps/$1"
}
