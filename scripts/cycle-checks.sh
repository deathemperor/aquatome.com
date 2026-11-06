#!/usr/bin/env bash
# The engine cycle's checks before it publishes (sourced by engine-cycle.sh, which defines log and TEST_LOG).
# The Mac's engine parts and video job share one machine, so their builds and test runs take turns: two suites at once
# slowed a 0.6 s test past vitest's 5 s and failed a cycle. GitHub runs one part a runner.
# The Mac's load also comes from the iOS simulators and builds: 500 and more on 16 cores at times (2026-11-04), when even
# 30 s per test isn't enough. The checks wait for the 5-minute load to fall under 4 a core, up to 45 minutes, then run.
calm() { local cores; cores=$(sysctl -n hw.ncpu); for _ in $(seq 90); do [ "$(sysctl -n vm.loadavg | awk '{print int($3)}')" -lt $((cores * 4)) ] && return; sleep 30; done; log "load still high after 45 min: checking anyway"; }
checks() { if [ -n "${GITHUB_ACTIONS:-}" ]; then bash -c "$1"; else calm; lockf -k "$HOME/.cache/aquatome/checks.lock" bash -c "$1"; fi; }
# The checks, their output in $TEST_LOG. Tests that ran out of time ran on a Mac too busy for them, not on a broken
# build: the sf cycle of 2026-11-04 lost five hours of pages to 32 timeouts at a 5-minute load of 700 on 16 cores (the
# next cycle starts by dropping a failed one's work). So once the load has fallen (calm), they run once more.
verify() {
  checks "$1" >"$TEST_LOG" 2>&1 && return 0
  grep -q 'Test timed out in' "$TEST_LOG" || return 1
  log "tests ran out of time on a busy Mac: checking again once it is calmer"
  checks "$1" >"$TEST_LOG" 2>&1
}

# Before the checks: the cycle's commit on top of main as it is now. A cycle runs for hours from the main it started on,
# and a test that main failed then and has fixed since would hold back all of the cycle's pages: the pages part of
# 2026-11-06 started from a main whose page-vectors test failed, fixed 11 minutes later, and lost 229 files at its check.
# A clash with what landed meanwhile is left to push(), which settles it and checks again.
catch_up() {
  git pull -q --rebase && return 0
  git rebase --abort 2>/dev/null || true
  log "main changed this cycle's files meanwhile: checking as it started, push() settles the clash"
}
