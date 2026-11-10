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
# Other jobs on this Mac: take the lock only to run tests (vitest), which time out when another suite runs beside them.
# A simulator run takes its turn in its own queue instead (apps/ios/scripts/sim-run.py). A build that only compiles
# (xcodebuild build, a site build) has no timeouts and doesn't need either: in the queue, it only holds up the tests
# behind it. The engine takes it only for its tests too (verify_cycle).
calm() { [ -z "${GITHUB_ACTIONS:-}" ] || return 0; local cores; cores=$(sysctl -n hw.ncpu); for _ in $(seq 90); do [ "$(sysctl -n vm.loadavg | awk '{print int($3)}')" -lt $((cores * 4)) ] && return; sleep 30; done; log "load still high after 45 min: checking anyway"; }
# Engine work waits for cooler hours: under heat macOS takes cores away from work, and on 2026-11-08 it ran work on 6-8 of
# its 16 while every lead's work slowed, a 0.4 s job taking up to 54 s. A run waits while any core is taken away, up to 2 h,
# then goes ahead at its low priority. Its heat level alone says less: it read heavy with all 16 cores at work and that job
# at 0.3 s. Anywhere without these readings counts none taken. In GitHub Actions it waits only on this Mac's own runner
# (TestFlight's upload, testflight.yml): GitHub's runners aren't this Mac.
cores_taken() {
  local all mask n=0
  all=$(sysctl -n hw.ncpu 2>/dev/null) && mask=$(sysctl -n kern.sched_recommended_cores 2>/dev/null) || { echo 0; return; }
  while [ "${mask:-0}" -gt 0 ]; do n=$((n + (mask & 1))); mask=$((mask >> 1)); done
  [ "$all" -gt "$n" ] 2>/dev/null && echo $((all - n)) || echo 0
}
cool() {
  [ -z "${GITHUB_ACTIONS:-}" ] || [ "${RUNNER_ENVIRONMENT:-}" = self-hosted ] || return 0
  for _ in $(seq "${COOL_TRIES:-240}"); do
    [ "$(cores_taken)" -eq 0 ] && return 0
    sleep "${COOL_PAUSE:-30}"
  done
  log "still hot after the wait: going ahead"
}
# One step, under the lock on the Mac (GitHub: a runner of its own). Through checks.sh, which steps back while the chief of
# staff keeps the next turn for another run: a content update can wait, the owner's builds can't (2026-11-09).
CHECKS_SH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/checks.sh"
turn() { "$CHECKS_SH" "$@"; }
checks() { if [ -n "${GITHUB_ACTIONS:-}" ]; then bash -c "$1"; else turn bash -c "$1"; fi; }
# The checks, a step an argument, their output in $TEST_LOG. A step that fails runs once more, once the load has fallen
# (calm), and the steps before it, which passed, don't: on 2026-11-07 the pages part's tests ran out of time, and their
# second run queued the whole build again. Tests that ran out of time ran on a Mac too busy for them, not on a broken
# build (the sf cycle of 2026-11-04 lost five hours of pages to 32 timeouts at a 5-minute load of 700 on 16 cores), and
# one flaky test cost the sf cycle of 2026-11-10 its 207 files. It's the whole step, not the failed tests' files, because
# the root `pnpm test` gives up at a package's first failure, so the others may not have finished, and a package can fail
# with no test named. A step that passes the second time goes on, and its failed tests are logged as "flaky:" to be
# fixed. If it fails again: TIMED_OUT when
# tests ran out of time on that run, and the run's work is kept (keep_unpublished).
verify() {
  local step from first name names
  : >"$TEST_LOG"
  TIMED_OUT=
  calm
  for step in "$@"; do
    from=$(wc -c <"$TEST_LOG")
    checks "$step" >>"$TEST_LOG" 2>&1 && continue
    first=$from
    if ran_out "$first"; then log "tests ran out of time on a busy Mac: checking again once it is calmer"; else log "a check failed: running it once more once the Mac is calmer"; fi
    calm
    from=$(wc -c <"$TEST_LOG")
    if checks "$step" >>"$TEST_LOG" 2>&1; then
      names=$(failed_tests "$first")
      [ -n "$names" ] || log "flaky: $step failed once and passed the second time, no test named"
      while IFS= read -r name; do [ -z "$name" ] || log "flaky: $name"; done <<<"$names"
      continue
    fi
    ran_out "$from" && TIMED_OUT=1
    return 1
  done
}
# The tests that failed in $TEST_LOG since byte $1, one a line: vitest's FAIL lines, with pnpm's prefix and the colours off.
failed_tests() { tail -c +"$(($1 + 1))" "$TEST_LOG" | sed -E "s/$(printf '\033')\[[0-9;]*m//g" | sed -nE 's/^([^[:space:]]+ test:)?[[:space:]]*FAIL[[:space:]]+//p' | sort -u; }
# Whether the tests' output since byte $1 of $TEST_LOG has one that ran out of time. grep reads it all (-c, not -q): under
# pipefail, tail cut off by grep's early exit would make a match read as none.
ran_out() { tail -c +"$(($1 + 1))" "$TEST_LOG" | grep -c 'Test timed out in' >/dev/null; }

# A run whose tests ran out of time even on their second try (TIMED_OUT) ran on a Mac too busy for them, not on broken
# work: its commit goes on a branch of its own, kept/<job>/<when>, which the next run's start from main (from_main)
# leaves alone, and that run publishes it before its own work (publish_kept). Until 2026-11-08 the next run dropped it:
# that day a videos run and a photos run lost their work to load, redone from nothing. Only in the Mac's engine clones,
# which a run resets as it starts: GitHub's runners keep nothing past a run, and any other checkout is someone's own.
# A run whose checks failed twice for another reason goes on held/<job>/<when>, which nothing publishes: the Machine Load
# Lead looks at those, never the owner, and a run drops its job's after 14 days (drop_old_held).
# `keep_unpublished <job>`, where a run gives up publishing.
engine_clone() { [ -z "${GITHUB_ACTIONS:-}" ] && case "$PWD/" in "$HOME/.local/share/aquatome/"*) true ;; *) false ;; esac; }
keep_unpublished() {
  engine_clone || return 0
  local when
  when=$(date -u +%Y%m%dT%H%M%S)
  if [ -n "${TIMED_OUT:-}" ]; then
    git branch -q -f "kept/$1/$when" HEAD && log "tests ran out of time: this run's work is kept on kept/$1/$when for the next run"
  else
    git branch -q -f "held/$1/$when" HEAD && log "checks failed twice: this run's work is on held/$1/$when, not published"
  fi
}
HELD_DAYS=14
drop_old_held() {
  local cutoff branch
  cutoff=$(date -u -v-"$HELD_DAYS"d +%Y%m%dT%H%M%S 2>/dev/null || date -u -d "$HELD_DAYS days ago" +%Y%m%dT%H%M%S)
  for branch in $(git for-each-ref --format='%(refname:short)' "refs/heads/held/$1/"); do
    [[ "${branch##*/}" < "$cutoff" ]] || continue
    git branch -q -D "$branch" && log "$branch was held $HELD_DAYS days: dropped"
  done
}
# The work earlier runs of <job> kept, oldest first: each on main as it is now, swept and checked as any run's commit is,
# then pushed. Only tests that fail twice for real move it to held/<job>/<when>, never pushed, as the gate's crash keeps
# its work (gate_or_keep); anything else (tests out of time again, a push that didn't land, a clash it couldn't settle)
# keeps it for the run after. Then this run's own work starts from main. `publish_kept <job>`, after the run's install
# and merge drivers.
publish_kept() {
  local branch
  engine_clone || return 0
  drop_old_held "$1"
  for branch in $(git for-each-ref --sort=refname --format='%(refname:short)' "refs/heads/kept/$1/"); do
    log "publishing $branch, kept when its tests ran out of time"
    git reset -q --hard "$branch"
    if push_kept; then
      git branch -q -D "$branch"
      log "published $branch"
    elif [ -n "$KEPT_FAILED" ]; then
      git branch -q -M "$branch" "held/${branch#kept/}"
      log "$branch failed its tests twice: on held/${branch#kept/}, not published"
    else
      log "$branch isn't published yet ($KEPT_WHY): it stays kept for the next run"
    fi
    git fetch -q origin || true
    git reset -q --hard origin/main
  done
}
# The checked-out kept work on top of main, swept and checked, pushed. As push() does, lines both changed give way to the
# kept work's, a clash in the calendar plans it again, and after any merge it's swept and checked again. KEPT_FAILED
# when its tests failed for real; KEPT_WHY says why it isn't published.
push_kept() {
  local check=1 clash
  KEPT_FAILED= KEPT_WHY=
  for _ in 1 2 3; do
    if ! git pull -q --rebase origin main; then
      clash=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
      git rebase --abort 2>/dev/null || true
      git pull -q --rebase -X theirs origin main || { git rebase --abort 2>/dev/null || true; KEPT_WHY="a clash with main"; return 1; }
      replan_merged "$clash"
      check=1
    fi
    if [ -n "$check" ]; then
      sweep_merged
      if ! verify 'pnpm test'; then
        if [ -n "$TIMED_OUT" ]; then KEPT_WHY="tests out of time again"; else KEPT_FAILED=1; fi
        return 1
      fi
      check=
    fi
    git push -q origin HEAD:main && return 0
    sleep "${PUSH_PAUSE:-30}"
  done
  KEPT_WHY="the push didn't land"
  return 1
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
# The calendar (content/curation.json) is one plan, not lines to blend. After a clash with a change on main, push()'s
# line-by-line merge kept some of each plan's days, and named one guide on two days running (the photos part of
# 2026-11-08, against an editor's re-plan): its tests failed and the part's photos waited a cycle. So when the calendar
# is among the clashing files ($1), it is main's, planned again on this cycle's photos, as the curate step plans.
replan_merged() {
  [[ " $1 " == *" content/curation.json "* ]] || return 0
  git show '@{u}:content/curation.json' > content/curation.json
  pnpm engine curate || log "curate: failed"
  git add content/curation.json
  git diff --cached --quiet || git commit -q -m "content: the calendar planned again on main's"
}
catch_up() {
  git pull -q --rebase && return 0
  git rebase --abort 2>/dev/null || true
  log "main changed this cycle's files meanwhile: checking as it started, push() settles the clash"
}
# Start from GitHub's main, this very script too. git writes main's version as a new file, and bash keeps reading the one it
# started with, so a run went on with its old script against main's code: on 2026-11-08 a video run tested before it
# committed, as its old script did, though main's now commits first, and its failed tests left its work uncommitted. The
# run starts again from the top of main's script, once for each commit it resets to (AQ_SCRIPT_HEAD). Call it as
# The gate (gate.ts), last of the steps that write pages, timed for the Mac's load report (150 Opus reads at 3 jobs is real
# time on a big rewrite day). A crash stops the run before it publishes, and the run's work goes on a branch of its own,
# committed and never pushed, to gate and publish by hand: the next run's reset (from_main) would drop it uncommitted,
# and a commit left on main would go out ungated with a later push. `gate_or_keep "<commit message>" <paths it commits>`.
gate_or_keep() {
  local msg=$1 start=$SECONDS rc=0 branch
  shift
  pnpm engine gate || rc=$?
  log "gate: took $((SECONDS - start)) s"
  [ "$rc" -eq 0 ] && return 0
  if [ -n "$(git status --porcelain -- "$@")" ]; then
    branch="gate-crashed/$(date -u +%Y%m%dT%H%M%S)"
    if git checkout -q -b "$branch" && git add -- "$@" && git commit -q -m "$msg, gate crashed, not published $(date -u +%F)"; then
      log "gate: crashed, not publishing: this run's work is committed on $branch, not pushed"
    else
      log "gate: crashed, not publishing, and keeping this run's work on $branch failed"
    fi
  else
    log "gate: crashed, not publishing"
  fi
  return 1
}

# `from_main "$@"`.
from_main() {
  git fetch -q origin && git checkout -q main && git reset -q --hard origin/main
  [ "${AQ_SCRIPT_HEAD:-}" != "$(git rev-parse HEAD)" ] || return 0
  AQ_SCRIPT_HEAD="$(git rev-parse HEAD)"; export AQ_SCRIPT_HEAD
  exec bash "$0" "$@"
}
