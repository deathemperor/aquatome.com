#!/usr/bin/env bash
# The engine cycle's and the video jobs' checks before they publish, and their start from main (sourced by engine-cycle.sh,
# video-cycle.sh and video-recheck.sh, which define log and TEST_LOG).
# The Mac's engine parts and video job share one machine, so their builds and test runs take turns: two suites at once
# slowed a 0.6 s test past vitest's 5 s and failed a cycle. GitHub runs one part a runner.
# The Mac's load also comes from the iOS simulators and builds: 500 and more on 16 cores at times (2026-11-04), when even
# 30 s per test isn't enough. The checks wait for the 5-minute load to fall under 4 a core, up to 45 minutes, then run.
# The turns are lockf's on ~/.cache/aquatome/checks.lock. It hands the lock over in the order the waiters came, and a
# waiter that is stopped keeps its place, holding up everyone behind it. Each step of the checks (the build, then the
# tests) takes the lock on its own, so whoever waits goes in between: on 2026-11-07, at a load of 300 to 600, one part's
# build and tests held it for 3 h 23 min, with four jobs waiting behind them, another lead's iOS build for 80 min.
# Other jobs on this Mac: take the lock only to run tests (vitest, xcodebuild test), which time out when another suite
# runs beside them. A build that only compiles (xcodebuild build, a site build) has no timeouts and doesn't need it: in
# the queue, it only holds up the tests behind it. The engine takes it only for its tests too (verify_cycle).
calm() { [ -z "${GITHUB_ACTIONS:-}" ] || return 0; local cores; cores=$(sysctl -n hw.ncpu); for _ in $(seq 90); do [ "$(sysctl -n vm.loadavg | awk '{print int($3)}')" -lt $((cores * 4)) ] && return; sleep 30; done; log "load still high after 45 min: checking anyway"; }
# One step, under the lock on the Mac (GitHub: a runner of its own).
checks() { if [ -n "${GITHUB_ACTIONS:-}" ]; then bash -c "$1"; else lockf -k "$HOME/.cache/aquatome/checks.lock" bash -c "$1"; fi; }
# The checks, a step an argument, their output in $TEST_LOG. Tests that ran out of time ran on a Mac too busy for them,
# not on a broken build: the sf cycle of 2026-11-04 lost five hours of pages to 32 timeouts at a 5-minute load of 700 on
# 16 cores (the next cycle starts by dropping a failed one's work). So once the load has fallen (calm), the step that
# ran out of time runs once more, and the steps before it, which passed, don't: on 2026-11-07 the pages part's tests ran
# out of time, and their second run queued the whole build again.
verify() {
  local step again=
  : >"$TEST_LOG"
  calm
  for step in "$@"; do
    checks "$step" >>"$TEST_LOG" 2>&1 && continue
    [ -z "$again" ] && grep -q 'Test timed out in' "$TEST_LOG" || return 1
    again=1
    log "tests ran out of time on a busy Mac: checking again once it is calmer"
    calm
    checks "$step" >>"$TEST_LOG" 2>&1 || return 1
  done
}
# verify, as a cycle's commit needs it: the tests, which build the site from their own fixture content. The real site
# (about 7,600 pages) isn't built here: that build was about 14 of the checks' 16 minutes on a GitHub runner and 1 to 3
# hours on this Mac at a load of 300 to 600 (2026-11-07), holding the lock while other jobs waited; no test reads it;
# and in the history read on 2026-11-07 it never failed where the tests passed. deploy.yml builds the real site before
# anything goes live and fails before the upload, so readers keep the live site and a "Deploy failed" issue opens.
verify_cycle() { verify 'pnpm test'; }

# Before the checks: the cycle's commit on top of main as it is now. A cycle runs for hours from the main it started on,
# and a test that main failed then and has fixed since would hold back all of the cycle's pages: the pages part of
# 2026-11-06 started from a main whose page-vectors test failed, fixed 11 minutes later, and lost 229 files at its check.
# A clash with what landed meanwhile is left to push(), which settles it and checks again.
# Main's changes and this run's meet only at a merge: a card from main and a summary from this run can then disagree, which
# the sweep fixes and the tests fail on (the sf and pages runs of 2026-11-07 didn't publish over 30 such pages). So it runs
# again before those tests.
sweep_merged() {
  pnpm engine sweep || log "sweep: failed"
  git add content sources engine-state docs/review
  git diff --cached --quiet || git commit -q -m "content: sweep on main as it is now"
}
catch_up() {
  git pull -q --rebase && return 0
  git rebase --abort 2>/dev/null || true
  log "main changed this cycle's files meanwhile: checking as it started, push() settles the clash"
}
# Start from GitHub's main, this very script too. A reset puts main's script in a new file, and bash goes on reading the
# one it opened, so without a restart the run does what its script said before the reset: on 2026-11-08 a video run that
# started before the commit before its tests reached its clone ran without it, and left its work uncommitted. So the run
# starts again from the top of main's script, once for each commit it resets to (AQ_SCRIPT_HEAD). Call it as
# `from_main "$@"`.
from_main() {
  git fetch -q origin && git checkout -q main && git reset -q --hard origin/main
  [ "${AQ_SCRIPT_HEAD:-}" != "$(git rev-parse HEAD)" ] || return 0
  AQ_SCRIPT_HEAD="$(git rev-parse HEAD)"; export AQ_SCRIPT_HEAD
  exec bash "$0" "$@"
}
