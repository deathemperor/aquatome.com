#!/usr/bin/env bash
# The engine cycle's and the video job's checks before they publish (sourced by engine-cycle.sh and video-cycle.sh, which
# define log and TEST_LOG).
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
# the queue, it only holds up the tests behind it. The engine's own build of the real site (about 7,600 pages) is the one
# build here that takes it, so the three parts' builds run one at a time on a Mac already deep in swap.
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
# verify, with the steps this cycle's commit needs. The site's build reads content/ and the UI text
# (apps/site/src/i18n); sources/ (the source pages as the engine read them), engine-state/ and docs/review/ feed only the
# engine and the tests. So a commit of only those skips the build of the real site, about 14 of the checks' 16 minutes
# on a GitHub runner, and hours on a busy Mac. What it skips, deploy.yml still runs before anything goes live: the tests,
# the real build and its browser checks. The tests build the site from their own fixture content: none read the real
# build. I18N_LENIENT: a UI string a new Indonesian or Thai page needs and src/i18n lacks shows in Vietnamese (and is
# logged) instead of holding back the content. The commit is what this clone has on top of where it left main
# (origin/main...HEAD), before or after catch_up and push() put it on top of main as it is now.
verify_cycle() {
  if git diff --quiet origin/main...HEAD -- content apps/site/src/i18n; then verify 'pnpm test'
  else verify 'I18N_LENIENT=1 pnpm build' 'pnpm test'; fi
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
