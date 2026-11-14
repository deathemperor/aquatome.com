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

# The wall clock and the seconds the Mac has slept since it started, "1794527337 31355": the clock that counts sleep less
# the one that doesn't, 0 where they can't be told apart (GitHub's runners, which don't sleep). AQ_CLOCK stands in for it
# in tests.
clock() {
  if [ -n "${AQ_CLOCK:-}" ]; then "$AQ_CLOCK"; return; fi
  perl -MTime::HiRes -e 'my $s = eval { Time::HiRes::clock_gettime(Time::HiRes::CLOCK_MONOTONIC()) - Time::HiRes::clock_gettime(Time::HiRes::CLOCK_UPTIME_RAW()) }; printf "%d %d\n", time, $s // 0'
}
# `net git <fetch|pull|push> …`: a call to GitHub given GIT_NET_SECONDS (600) at most. On 12 Nov 2026 the Mac's 23:10
# photos cycle began its opening fetch as the Mac fell asleep with its lid shut; the connection died on GitHub's side, ours
# never learned, and launchd starts no run of a part while the last one lives, so no photos run started behind it. Past
# the limit the call is stopped, the log says so (and how long the Mac slept in it), and it fails as a refused fetch or
# push does: the opening fetch ends the cycle, which frees the next run (finish reports it to GitHub, engine-mac.yml).
net() {
  local limit="${GIT_NET_SECONDS:-600}" status=0 t0 z0 t1 z1 slept why
  read -r t0 z0 < <(clock)
  # The call runs in a process group of its own, so the stop reaches what it started too (git pull's fetch, ssh, a merge
  # driver), and that group is led by a keeper, not by the call: the keeper makes the group before the call starts, and its
  # number, which is the group's, stays taken until the supervisor below has sent its last signal and reaped it, so no
  # other program can have that group and nothing but the call's is ever signalled. A watchdog that found the call by its
  # number through ps could stop another program that had the number, and a ps that failed left the call with no limit
  # (Astra's read, 13 Nov). The keeper outlives a TERM and writes how the call ended to the supervisor, which waits for
  # that word and reads the clock each second, by the clock and not by how many waits it took (a Mac asleep or busy
  # stretches them). At the limit it sends TERM to the group, and KILL to what's left once the call has ended or 10 s on,
  # so a call that exits 0 on TERM is still stopped, children and all, and ends with 124. A call that ends in time is let
  # go at once with its own status; what it left running in its group runs on without the limit, as git's own leftovers
  # (gc, an ssh master) leave the group anyway. Its input is /dev/null, as a call run in the background had.
  perl -e '
    use POSIX ();
    my ($limit, $t0) = splice @ARGV, 0, 2;
    pipe my $r, my $w or die "pipe: $!\n";
    my $keeper = fork // die "fork: $!\n";
    unless ($keeper) {
      close $r; setpgrp 0, 0;
      my $call = fork // die "fork: $!\n";
      unless ($call) { exec { $ARGV[0] } @ARGV; die "$ARGV[0]: $!\n" }
      $SIG{TERM} = "IGNORE";
      waitpid $call, 0;
      my $s = $? & 127 ? 128 + ($? & 127) : $? >> 8;
      print $w "$s\n"; exit 0;
    }
    close $w; POSIX::setpgid($keeper, $keeper);
    my $ended = sub { my $in = ""; vec($in, fileno $r, 1) = 1; select($in, undef, undef, shift) > 0 };
    my $now = sub { my $t = $ENV{AQ_CLOCK} ? (split " ", qx{"$ENV{AQ_CLOCK}"})[0] : time; $t // time };
    until ($ended->(1)) {
      next if $now->() - $t0 < $limit;
      kill TERM => -$keeper; $ended->(10); kill KILL => -$keeper; waitpid $keeper, 0; exit 124;
    }
    my $s = <$r>; waitpid $keeper, 0; exit($s // 1);
  ' -- "$limit" "$t0" "$@" </dev/null || status=$?
  [ "$status" -eq 124 ] || return "$status"
  read -r t1 z1 < <(clock)
  # A call that exits 124 itself, inside its limit, wasn't stopped.
  [ $((t1 - t0)) -ge "$limit" ] || return 124
  slept=$((z1 - z0)); why="$*: no answer from GitHub in $((t1 - t0)) s, stopped"
  [ "$slept" -lt 60 ] || why="$why; the Mac slept $((slept / 60)) min of that, and a connection doesn't outlive a sleep"
  log "$why"; return 124
}
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
# Before a check's second try: the first try's own load gone. calm alone didn't wait for it: at 02:28 on 2026-11-12 the
# photos part's second try began the moment its first ended, at a 5-minute load far under calm's 4 a core, and ran two
# to four times slower than the first, its site tests out of time. The first try's workers (two packages' side by side)
# leave the 1-minute load as they end: the second try waits a minute, then until that load is under one a core, up to
# 10 more minutes, then goes ahead. GitHub's runners run one part each, so there it doesn't wait.
settled() {
  [ -z "${GITHUB_ACTIONS:-}" ] || return 0
  local cores
  cores=$(sysctl -n hw.ncpu)
  sleep "${SETTLE_FIRST:-60}"
  for _ in $(seq "${SETTLE_TRIES:-20}"); do
    [ "$(sysctl -n vm.loadavg | awk '{print int($2)}')" -lt "$cores" ] && return 0
    sleep "${SETTLE_PAUSE:-30}"
  done
  log "the load stayed high after the first try: trying again anyway"
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
# fixed. The second try starts once the first's own load has gone (settled), and runs the packages one at a time
# (pnpm's workspace-concurrency, set for the whole step): the same tests and the same limits, on half the load of
# its own. If it fails again: TIMED_OUT when tests ran out of time on that run, and the run's work is kept
# (keep_unpublished).
# Each test's time limits, times AQ_TEST_TIME_SCALE (the vitest configs and @aq/schema/test-time read it): 1 on a Mac at
# full strength, HOT_TIME_SCALE while heat has taken cores away and on a check's second try on the Mac. Waiting for cool
# hours (cool) and calm (calm, settled) wasn't enough on 2026-11-13: with cores cut to 8, three cycles in a day lost
# their checks to the clock, tests with a 30 s limit running 100–180 s (the sf cycle's at 15:43, its slowest 182 s),
# hooks past their 120 s and 300 s (the photos run that started 11:10, still unpublished at 16:28). Not a hung test:
# those ran to the end. A limit 6 times as long holds those; a test that really hangs still fails, later.
# The second try also starts SECOND_TRY_WORKERS of vitest's workers at a time, not one a core: vitest gives a worker
# 60 s to start, a limit of its own that nothing raises, and that photos run's second try (16:25) lost 25 of the
# schema's 28 test files to workers that hadn't started in time.
# A busy Mac gets them too, heat or none: the first tries of the night of 2026-11-13 ran at a 5-minute load past one a
# core with every core at work, at their own limits, and ran out of time.
HOT_TIME_SCALE=6
SECOND_TRY_WORKERS=2
# The 5-minute load and the cores, "load cores"; nothing where there's no reading (not a Mac).
load5() { local l c; l=$(sysctl -n vm.loadavg 2>/dev/null) && c=$(sysctl -n hw.ncpu 2>/dev/null) || return 0; echo "$(awk '{print int($3)}' <<<"$l") $c"; }
# Why a check's tests get more than their own time, or nothing: heat has taken cores, or (on the Mac, not on GitHub's
# runners) the 5-minute load is at least one a core.
slow_mac() {
  local load cores
  [ "$(cores_taken)" -gt 0 ] && { echo "cores taken away by heat"; return 0; }
  [ -z "${GITHUB_ACTIONS:-}" ] || return 0
  read -r load cores <<<"$(load5)"
  [ -n "$cores" ] && [ "$load" -ge "$cores" ] && echo "a busy Mac, its 5-minute load $load on $cores cores"
  return 0
}
verify() {
  local step from first name names workers why
  : >"$TEST_LOG"
  TIMED_OUT=
  if [ -n "${MIGRATE_FAILED:-}" ]; then log "photo records not migrated: not tested, not published"; return 1; fi
  calm
  export AQ_TEST_TIME_SCALE
  for step in "$@"; do
    from=$(wc -c <"$TEST_LOG")
    why=$(slow_mac)
    AQ_TEST_TIME_SCALE=1
    [ -z "$why" ] || { AQ_TEST_TIME_SCALE=$HOT_TIME_SCALE; log "$why: tests get $AQ_TEST_TIME_SCALE times their time"; }
    checks "$step" >>"$TEST_LOG" 2>&1 && continue
    first=$from
    if ran_out "$first"; then log "tests ran out of time on a busy Mac: checking again once it is calmer"; else log "a check failed: running it once more once the Mac is calmer"; fi
    settled
    calm
    from=$(wc -c <"$TEST_LOG")
    # On the Mac only: GitHub's runner is a machine of its own, with no heat, and its second try keeps the first's.
    workers=
    [ -n "${GITHUB_ACTIONS:-}" ] || { AQ_TEST_TIME_SCALE=$HOT_TIME_SCALE; workers=$SECOND_TRY_WORKERS; }
    if VITEST_MAX_WORKERS=$workers checks "export pnpm_config_workspace_concurrency=1; $step" >>"$TEST_LOG" 2>&1; then
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
# Whether the tests' output since byte $1 of $TEST_LOG has one that ran out of time: vitest's own line for a test, a hook
# (beforeAll and the like) or a worker that didn't start in time, "Error: Test timed out in 30000ms.", at the start of a
# line after pnpm's prefix, colours off. Only those: a failing test that quotes one, in its assertion, a diff, its title,
# a stack line or its source, ran out of nothing (at 22:36 and 23:35 on 2026-11-13 one did, and its run's work was kept,
# to be tried for ever, instead of held). Its limit: a test that itself prints vitest's line at the start of a line (a
# console.log, a later line of a many-line message) still reads as out of time, which keeps the work and loses nothing;
# a stricter pattern risks the other way, a real time-out held, its retries lost (the chief of staff, 14 Nov). grep reads
# it all (-c, not -q): under pipefail, tail cut off by grep's early exit would make a match read as none.
ran_out() { tail -c +"$(($1 + 1))" "$TEST_LOG" | sed -E "s/$(printf '\033')\[[0-9;]*m//g" | grep -cE '^([^[:space:]]+ test: )?Error: ((Test|Hook) timed out in [0-9]+ms\.|\[vitest-pool[^]]*\]: Timeout (waiting for worker to respond|starting [a-z]+ runner))' >/dev/null; }

# A run whose tests ran out of time even on their second try (TIMED_OUT) ran on a Mac too busy for them, not on broken
# work: its commit goes on a branch of its own, kept/<job>/<when>, which the next run's start from main (from_main)
# leaves alone, and that run publishes it before its own work (publish_kept). Until 2026-11-08 the next run dropped it:
# that day a videos run and a photos run lost their work to load, redone from nothing. Only in the Mac's engine clones,
# which a run resets as it starts, and in the cloud's cycle (engine_cloud); any other checkout is someone's own.
# A run whose checks failed twice for another reason goes on held/<job>/<when>, which nothing publishes as it is: it gets
# one more try once main's code has changed since it was held (retry_held), the Machine Load Lead looks at those, never
# the owner, and a run drops its job's after 14 days (drop_old_held).
# Work out of time OUT_CYCLES cycles in a row is no longer put down to a busy Mac: it fails as broken work does (count_outs).
# `keep_unpublished <job>`, where a run gives up publishing.
engine_clone() { [ -z "${GITHUB_ACTIONS:-}" ] && case "$PWD/" in "$HOME/.local/share/aquatome/"*) true ;; *) false ;; esac; }
# The cloud's cycle (engine.yml) keeps its work the same way, but a runner keeps nothing past its run, so each of those
# branches is on GitHub too, pushed over the key the cycle pushes main with: on 2026-11-12 a cloud cycle lost 682 model
# calls ($39) to one failed test (the chief of staff, that day). One engine.yml run at a time (its concurrency group), and
# only it makes, publishes and deletes its job's branches there, each by its exact name. Not another workflow's checkout,
# as ci.yml's tests.
engine_cloud() { [ -n "${GITHUB_ACTIONS:-}" ] && case "${GITHUB_WORKFLOW_REF:-}" in */.github/workflows/engine.yml@*) true ;; *) false ;; esac; }
keep_unpublished() {
  engine_clone || engine_cloud || return 0
  local when
  when=$(date -u +%Y%m%dT%H%M%S)
  if [ -n "${TIMED_OUT:-}" ]; then
    keep_branch "kept/$1/$when-out1" && log "tests ran out of time: this run's work is kept on kept/$1/$when-out1 for the next run"
  elif [ -n "${MIGRATE_FAILED:-}" ]; then
    # The line the run's failure is reported with (engine-cycle.sh finish), as its callers then stop the run.
    FAILED="photo records not migrated: this run's work is kept on kept/$1/$when for the next run"
    keep_branch "kept/$1/$when" && log "$FAILED"
  else
    # Off main at once: a next run that couldn't fetch would carry on from this commit, and could publish it.
    keep_branch "held/$1/$when" && git reset -q --hard origin/main && log "checks failed twice: this run's work is on held/$1/$when, not published"
  fi
  # Its callers go on to say they aren't publishing, under set -e.
  return 0
}
# HEAD on branch $1, and in the cloud on GitHub's branch of that name.
keep_branch() {
  git branch -q -f "$1" HEAD || return 1
  engine_cloud || return 0
  net git push -q origin "refs/heads/$1:refs/heads/$1" || { log "$1 couldn't be pushed to GitHub: this run's work is lost with the runner"; return 1; }
}
# Branch $1 deleted, and in the cloud GitHub's of that exact name, GitHub's first. Until 14 Nov this clone's went first:
# when GitHub then refused, a batch under two names (one_name) had one name left here, which was published, while GitHub
# kept the other for the next run to publish again (Codex's read, that day). Now a refusal leaves both names here, and
# the batch's other name is left this run too.
drop_branch() {
  if engine_cloud; then
    net git push -q origin --delete "refs/heads/$1"
  fi || return 1
  git branch -q -D "$1"
}
# `move_branch <from> <to>`, once its work failed its tests (push_kept): <to> is the work as it was last checked, on the
# main it failed on, so its one more try waits for a main newer than that (retry_held). On the Mac too since 14 Nov: a
# rename there kept the work's first main, so a branch just held was tried again in the same run. In the cloud, GitHub's
# <to> made and <from> deleted in one push, both or neither, so no branch is ever in two places. Neither a move nor a
# rename goes over a branch that exists (the chief of staff, 14 Nov): a forced one could overwrite another batch's work,
# and on GitHub a plain push moves a branch on when it's behind. A <to> already there fails it, here and on GitHub
# (the lease that it isn't there); a delete here that fails takes back the branch just made.
move_branch() {
  if engine_cloud; then net git push -q --atomic --force-with-lease="refs/heads/$2:" origin "HEAD:refs/heads/$2" ":refs/heads/$1" || return 1; fi
  git branch -q "$2" HEAD || return 1
  git branch -q -D "$1" || { git branch -q -D "$2"; return 1; }
}
# `rename_branch <from> <to>`: the same work under another name (its count, count_outs), and in the cloud GitHub's in one
# push, both or neither; never over a branch that exists.
rename_branch() {
  if engine_cloud; then net git push -q --atomic --force-with-lease="refs/heads/$2:" origin "refs/heads/$1:refs/heads/$2" ":refs/heads/$1" || return 1; fi
  git branch -q -m "$1" "$2"
}
# `copy_branch <from> <to>`: <from>'s work under a second name as well, and in the cloud on GitHub too; never over a branch
# that exists.
copy_branch() {
  if engine_cloud; then net git push -q --force-with-lease="refs/heads/$2:" origin "refs/heads/$1:refs/heads/$2" || return 1; fi
  git branch -q "$2" "$1"
}
# The same work out of time OUT_CYCLES cycles in a row is no longer put down to a busy Mac (the chief of staff, 14 Nov): it
# fails as work whose tests failed does, its output kept and the run failed with a notice. A branch's count is in its name,
# the one thing a cloud runner and the Mac's clone share: kept/<job>/<when>-out1 is work out of time in its own run, and
# each next run whose check of it runs out of time again moves it on, -out2, then the bound. A check that passed ends the
# row at that moment, before any push is tried (ended_row); one that didn't run (a clash with main before any pass, its
# photo records) leaves it as it is. A branch with no count (kept for its photo records, held for a real failure, or kept
# before 14 Nov) is at 0. A count that can't be written (its rename refused) leaves the work under its present name, and
# the run says so in a FAULT line: until 14 Nov it said so only in its log, and a rename refused every run would have kept
# the work short of the bound for ever (the chief of staff, that day).
OUT_CYCLES=3
outs() { case "$1" in *-out[0-9]) echo "${1##*-out}" ;; *) echo 0 ;; esac; }
uncounted() { echo "${1%-out[0-9]}"; }
# After push_kept failed <branch>: BRANCH, its name now (moved on); or at the bound, OUT_FAILED, its count, with
# KEPT_FAILED set, its output in the log and kept, and the notice in FAULT. Always 0, under set -e.
count_outs() {
  local n to
  BRANCH=$1 OUT_FAILED=
  # A pass this run couldn't record (ended_row) left a count that's wrong: nothing is counted on it, nothing held on it.
  # Left for the next run, the work gets its name with no count beside the counted one, on its own commit (HEAD is the
  # work rebased, and a batch on two commits is touched by no run). one_name reads the two as a pass's rename half-done:
  # the next run drops the counted name by its exact name and goes on from the other, or processes neither until it can.
  # Until 14 Nov the next run knew nothing of the pass, and out of time it held the work at -out3 (Codex's read, that
  # day). Not earlier in the run: a publish would delete one name and leave the other for the next run to publish again.
  if [ -n "${PASS_UNRECORDED:-}" ]; then
    [ -z "$KEPT_FAILED" ] || return 0
    to=$(uncounted "$1")
    if copy_branch "$1" "$to"; then log "$1 passed and couldn't lose its count: $to is beside it on the same work, the name the next run takes"
    else log "$1 passed and couldn't lose its count, nor have $to beside it: only this run's FAULT line records the pass"; fi
    return 0
  fi
  [ "$KEPT_WHY" = "tests out of time again" ] || return 0
  n=$(($(outs "$1") + 1))
  if [ "$n" -ge "$OUT_CYCLES" ]; then
    OUT_FAILED=$n KEPT_FAILED=1
    out_of_time_output "$(uncounted "$1")" "$n"
    return 0
  fi
  KEPT_WHY="tests out of time again: $n of $OUT_CYCLES cycles in a row"
  to="$(uncounted "$1")-out$n"
  if rename_branch "$1" "$to"; then BRANCH=$to; return 0; fi
  FAULT="${FAULT:+$FAULT; }$1 ran out of time again and couldn't be renamed $to: it stays as $1, its count not moved on"
  return 0
}
# A check of kept or held work that passed ends its row of time-outs then, before any push is tried (the chief of staff,
# 14 Nov): a batch at -out2 that passed, lost its push to another job's and ran out of time on main's newer commit was
# held as three cycles in a row with a pass between them, and one whose pass a clash followed kept its count. BRANCH
# loses its count. A rename refused leaves a count that's wrong: this run counts nothing on it and holds nothing on it
# (PASS_UNRECORDED, count_outs), and says so in a FAULT line. A later run reads it only from the name with no count that
# count_outs puts beside the counted one, the one record a cloud runner and the Mac's clone share. On the Mac only a fault
# of the clone itself (a lock left behind, a full disk) refuses a rename one_name has cleared the way for: a branch
# already at the name is one batch under two names. That name refused too, here or on GitHub, the pass is recorded
# nowhere but the FAULT line, and the name is put right by hand before a later run counts on it.
ended_row() {
  local to
  to=$(uncounted "$BRANCH")
  [ "$to" != "$BRANCH" ] || return 0
  if rename_branch "$BRANCH" "$to"; then BRANCH=$to; return 0; fi
  PASS_UNRECORDED=1
  FAULT="${FAULT:+$FAULT; }$BRANCH passed its checks and couldn't be renamed $to: it stays as $BRANCH, and its count is wrong until it is"
}
# The output of work failed at the bound, `out_of_time_output <branch> <cycles>`: its time-out lines and failed tests in the
# log (a worker that never started names no test), on the Mac a copy of its whole test log in
# ~/.cache/aquatome/engine-held/ ($TEST_LOG is in /tmp, and the run's next check empties it), and one line in FAULT.
out_of_time_output() {
  local where="this run's log" copy line
  log "$1 ran out of time $2 cycles in a row, so it's no longer put down to a busy Mac: it fails as broken work does. Its tests:"
  while IFS= read -r line; do [ -z "$line" ] || log "  $line"; done < <(
    { sed -E "s/$(printf '\033')\[[0-9;]*m//g" "$TEST_LOG" | grep -E '(Test|Hook) timed out in|\[vitest-pool' | sort -u | head -20; failed_tests 0 | sed 's/^/FAIL /' | head -20; } || true)
  if [ -z "${GITHUB_ACTIONS:-}" ]; then
    copy="$HOME/.cache/aquatome/engine-held/$(tr / - <<<"$1").log"
    if mkdir -p "${copy%/*}" && cp "$TEST_LOG" "$copy"; then where=$copy; fi
  fi
  FAULT="${FAULT:+$FAULT; }$1 ran out of time $2 cycles in a row and failed as broken work: its tests' output is in $where"
}
HELD_DAYS=14
drop_old_held() {
  local cutoff branch
  cutoff=$(date -u -v-"$HELD_DAYS"d +%Y%m%dT%H%M%S 2>/dev/null || date -u -d "$HELD_DAYS days ago" +%Y%m%dT%H%M%S)
  for branch in $(git for-each-ref --format='%(refname:short)' "refs/heads/held/$1/"); do
    [[ "${branch##*/}" < "$cutoff" ]] || continue
    # One that can't go (a worktree someone is reading it in) mustn't stop the run.
    if drop_branch "$branch"; then log "$branch was held $HELD_DAYS days: dropped"; else log "$branch is past $HELD_DAYS days and couldn't be dropped"; fi
  done
}
# One batch is one run's work, by its job and its time: kept/<job>/<when>[-out<n>], then held/<job>/<when>[-out<n>], then
# held/<job>/<when>-tried. Under two names at once, a rename or a move half-worked (a run stopped between its two steps;
# before 14 Nov, a forced one), and each name would be processed, the work published twice (the chief of staff, 14 Nov).
# On one commit the old name goes, by its exact name: the newer is held over kept, tried over held, and within one of
# those no count over a count (a pass's rename; were it a time-out's from no count, it costs one more cycle, where the
# other way could hold work on a count with a pass in it), else the higher count. On different commits none of them is
# touched, and the run says so in a FAULT line. `one_name <branch>`: true when <branch> is its batch's one name, now or
# once the others are dropped; false, to leave it this run, otherwise.
one_name() {
  local job=${1#*/} when=${1##*/} names b rank top=-1 newest=
  job=${job%/*} when=${when%%-*}
  names=$(git for-each-ref --format='%(refname:short)' "refs/heads/kept/$job/$when" "refs/heads/kept/$job/$when-*" "refs/heads/held/$job/$when" "refs/heads/held/$job/$when-*")
  [ "$(wc -l <<<"$names")" -gt 1 ] || return 0
  # shellcheck disable=SC2086 # branch names have no spaces
  if [ "$(git rev-parse $names | sort -u | wc -l)" -gt 1 ]; then
    # shellcheck disable=SC2086
    [[ " ${SPLIT:-} " == *" $job/$when "* ]] || { SPLIT="${SPLIT:-} $job/$when"; FAULT="${FAULT:+$FAULT; }$job/$when is on $(echo $names | sed 's/ /, /g'), on different commits: none of them is touched"; }
    return 1
  fi
  for b in $names; do
    case "$b" in
      held/*-tried) rank=300 ;;
      held/*-out[0-9]) rank=$((200 + $(outs "$b"))) ;;
      held/*) rank=299 ;;
      *-out[0-9]) rank=$((100 + $(outs "$b"))) ;;
      *) rank=199 ;;
    esac
    [ "$rank" -le "$top" ] || { top=$rank; newest=$b; }
  done
  for b in $names; do
    [ "$b" != "$newest" ] || continue
    drop_branch "$b" || { log "$b is the same work as $newest and couldn't be dropped: neither is processed this run"; return 1; }
    log "$b is the same work as $newest, left by a rename that half-worked: dropped"
  done
  [ "$1" = "$newest" ]
}
# The work earlier runs of <job> kept, oldest first: each on main as it is now, swept and checked as any run's commit is,
# then pushed. Only tests that fail twice for real move it to held/<job>/<when>, never pushed, as the gate's crash keeps
# its work (gate_or_keep); anything else (tests out of time again, a push that didn't land, a clash it couldn't settle)
# keeps it for the run after. Then this run's own work starts from main. `publish_kept <job>`, after the run's install
# and merge drivers. In the cloud, the job's branches come from GitHub first.
publish_kept() {
  local branch held why as
  engine_clone || engine_cloud || return 0
  if engine_cloud; then
    net git fetch -q origin "+refs/heads/kept/$1/*:refs/heads/kept/$1/*" "+refs/heads/held/$1/*:refs/heads/held/$1/*" || log "the kept work on GitHub couldn't be fetched: left for the next run"
  fi
  drop_old_held "$1"
  for branch in $(git for-each-ref --sort=refname --format='%(refname:short)' "refs/heads/kept/$1/"); do
    # Gone already, the old name of a batch under two (one_name).
    git show-ref -q --verify "refs/heads/$branch" || continue
    one_name "$branch" || continue
    log "publishing $branch, kept by an earlier run"
    git reset -q --hard "$branch"
    if push_kept "$branch"; then
      git branch -q -D "$BRANCH"
      log "published $branch"
      net git fetch -q origin || true
      git reset -q --hard origin/main
      continue
    fi
    count_outs "$BRANCH"
    if [ -n "$KEPT_FAILED" ]; then
      # Held at the bound keeps its count, so its one more try out of time again is its last (retry_held); a real
      # failure ends the row.
      held="held/$(uncounted "${branch#kept/}")${OUT_FAILED:+-out$OUT_FAILED}"
      why="failed its tests twice"
      [ -z "$OUT_FAILED" ] || why="ran out of time $OUT_FAILED cycles in a row"
      if move_branch "$BRANCH" "$held"; then
        log "$branch $why: on $held, not published"
      else
        log "$branch $why and couldn't be moved to $held: it stays kept for the next run"
      fi
    else
      as=
      [ "$BRANCH" = "$branch" ] || as=", as $BRANCH"
      log "$branch isn't published yet ($KEPT_WHY): it stays kept for the next run$as"
      # Kept work held back by its records goes on to the next run, never silently: the run reports it when it ends, as
      # a failed run is reported (FAULT, engine-cycle.sh finish; the chief of staff, 13 Nov).
      [ -z "${MIGRATE_FAILED:-}" ] || FAULT="${FAULT:+$FAULT; }$branch isn't published: its photo records couldn't be migrated, and it stays kept"
    fi
    net git fetch -q origin || true
    git reset -q --hard origin/main
  done
  # On the Mac too since 14 Nov: until then a held batch there sat until someone renamed it by hand (13 Nov, three).
  retry_held "$1"
  # Kept work's failed migration is that work's: the run's own goes on to its own (video-cycle.sh tests with no merge).
  MIGRATE_FAILED=
}
# A video job's EXIT trap, last: a fault the job went on past (FAULT: kept work its photo records held back) fails the
# job and is reported on GitHub as a part's failed cycle is (engine-mac.yml), as engine-cycle.sh's finish does for the
# parts. Without it a video job that kept work back exited 0 and said nothing (Astra's read, 13 Nov). A job that failed
# already keeps its own status. `fault_exit <status> <job>`.
fault_exit() {
  local status=$1
  if [ -n "${FAULT:-}" ]; then
    log "$FAULT"
    [ "$status" != 0 ] || status=1
    [ -n "${GITHUB_ACTIONS:-}" ] || gh workflow run engine-mac.yml -R deathemperor/aquatome.com -f part="$2" -f why="exit $status: $FAULT" || true
  fi
  exit "$status"
}
# Each held branch of <job> not yet tried again, once main's code (anything but the engine's output and the docs) has
# changed since the main it was checked on: published as kept work is, or, failing its tests for real again, or out of
# time in OUT_CYCLES tries in a row (count_outs), moved to <branch>-tried, which nothing tries again. Out of time fewer
# times, or not pushed, it stays held for the next run's try.
retry_held() {
  local branch base tried why as
  for branch in $(git for-each-ref --sort=refname --format='%(refname:short)' "refs/heads/held/$1/"); do
    case "$branch" in *-tried) continue ;; esac
    git show-ref -q --verify "refs/heads/$branch" || continue
    one_name "$branch" || continue
    base=$(git merge-base "$branch" origin/main) || continue
    git diff --quiet "$base" origin/main -- . ':!content' ':!sources' ':!engine-state' ':!docs' ':!*.md' && continue
    log "trying $branch once more: main's code has changed since it was held"
    git reset -q --hard "$branch"
    if push_kept "$branch"; then
      git branch -q -D "$BRANCH"
      log "published $branch"
      net git fetch -q origin || true
      git reset -q --hard origin/main
      continue
    fi
    count_outs "$BRANCH"
    if [ -n "$KEPT_FAILED" ]; then
      tried="$(uncounted "$branch")-tried"
      why="failed its tests again"
      [ -z "$OUT_FAILED" ] || why="ran out of time $OUT_FAILED cycles in a row"
      if move_branch "$BRANCH" "$tried"; then
        log "$branch $why: on $tried, not tried again"
      else
        log "$branch $why and couldn't be moved to $tried: it stays held"
      fi
    else
      as=
      [ "$BRANCH" = "$branch" ] || as=", as $BRANCH"
      log "$branch isn't published yet ($KEPT_WHY): it stays held for the next run's try$as"
    fi
    net git fetch -q origin || true
    git reset -q --hard origin/main
  done
}
# Pages a later run put on main while this work was kept, and that this work wrote too: main's stay as main has them. They
# are live under main's names: at 03:14 on 14 Nov a kept batch landing on four fish pages live since 02:49 gave them its
# own names, and their first addresses answered 404. A page is its folder (content/<kind>/<id>/): one main added, not
# there when <branch> was cut, goes out as main has it, whole, and the kept work's files in it are dropped; the engine
# translates main's page in a later cycle. Until 14 Nov it went file by file, and main's entity.json could go out beside
# the kept work's translation of another draft, half one page and half another (the chief of staff, that day). Any other
# file both added (one in a folder that was there, a page of one file such as content/gallery/<id>.json) goes back to
# main's. Added is absent where <branch> was cut, renames not followed: git's rename detection read a page main moved to
# a path the kept work also wrote as moved, not added, and the kept version won (that day too). The kept work's are what
# any of its commits added, not only what its last one has: the rebase replays each commit, and a page it added and a
# later commit deleted was added on main's and then deleted, main's page with it (Codex's read, 14 Nov). All in a commit
# of its own. `main_pages <branch>`, after the pull.
main_pages() {
  local base pages files
  base=$(git merge-base "$1" origin/main) || return 0
  pages=$(comm -12 <(ever_added "$base" "$1" | sed -nE 's#^(content/[^/]+/[^/]+)/[^/]+$#\1#p' | sort -u) <(added "$base" origin/main | sed -nE 's#^(content/[^/]+/[^/]+)/[^/]+$#\1#p' | sort -u) |
    while read -r page; do git cat-file -e "$base:$page" 2>/dev/null || echo "$page"; done)
  files=$(comm -12 <(ever_added "$base" "$1") <(added "$base" origin/main) | while read -r file; do grep -qxF "${file%/*}" <<<"$pages" || echo "$file"; done)
  [ -n "$pages$files" ] || return 0
  # shellcheck disable=SC2086 # content paths have no spaces
  git checkout --no-overlay origin/main -- $pages $files
  git diff --cached --quiet && return 0
  git commit -q -m "content: main's pages as main has them ($(grep -c . <<<"$pages" || true) pages and $(grep -c . <<<"$files" || true) other files a later run published first)"
  log "$1: $(grep -c . <<<"$pages" || true) pages and $(grep -c . <<<"$files" || true) other files a later run published first stay as main has them"
}
# The content files added between commits $1 and $2, renames not followed, sorted.
added() { git diff --name-only --no-renames --diff-filter=A "$1" "$2" -- content | sort; }
# The content files any commit after $1 up to $2 added, renames not followed, sorted: one a later commit deleted too.
ever_added() { git log --format= --name-only --no-renames --diff-filter=A "$1..$2" -- content | sed '/^$/d' | sort -u; }
# The checked-out kept work on top of main, swept and checked, pushed. As push() does, lines both changed give way to the
# kept work's, a clash in the calendar plans it again, and after any merge it's swept and checked again. KEPT_FAILED
# when its tests failed for real; KEPT_WHY says why it isn't published; BRANCH, the branch's name now (a check that
# passed ends its row, ended_row). `push_kept [<branch>]`: in the cloud, GitHub's branch of that exact name is deleted in
# the same push as main's, both or neither, so work published is never published again from a branch left behind.
push_kept() {
  local check=1 clash main
  # Each branch's own: an earlier branch's failed migration says nothing of this one (Astra's read, 13 Nov).
  KEPT_FAILED= KEPT_WHY= MIGRATE_FAILED= PASS_UNRECORDED= BRANCH=${1:-}
  for _ in 1 2 3; do
    main=$(git rev-parse origin/main 2>/dev/null || true)
    if ! net git pull -q --rebase origin main; then
      clash=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
      git rebase --abort 2>/dev/null || true
      net git pull -q --rebase -X theirs origin main || { git rebase --abort 2>/dev/null || true; KEPT_WHY="a clash with main"; return 1; }
      replan_merged "$clash"
      check=1
    fi
    [ -z "$BRANCH" ] || main_pages "$BRANCH"
    # A clean pull that brought main's commits in is swept and checked too, as swept_pull says why.
    [ "$(git rev-parse origin/main 2>/dev/null)" = "$main" ] || check=1
    if [ -n "$check" ]; then
      sweep_merged
      if ! verify 'pnpm test'; then
        if [ -n "$TIMED_OUT" ]; then KEPT_WHY="tests out of time again"
        elif [ -n "${MIGRATE_FAILED:-}" ]; then KEPT_WHY="its photo records couldn't be migrated"
        else KEPT_FAILED=1; fi
        return 1
      fi
      check=
      [ -z "$BRANCH" ] || [ -n "$PASS_UNRECORDED" ] || ended_row
    fi
    if engine_cloud && [ -n "$BRANCH" ]; then
      net git push -q --atomic origin HEAD:main ":refs/heads/$BRANCH" && return 0
    else
      net git push -q origin HEAD:main && return 0
    fi
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
# Photo records in the format before 13 Nov 2026, which kept lettering read off a photo, fail the privacy test
# (photo-privacy.ts). A run on older code writes them, and they come in at a merge: on 13 Nov two engine pushes made on
# older code turned main red. So they're rewritten here first, with no model and no decision changed, before the sweep and
# the tests see them. A migration that fails publishes nothing, and the work is kept for the next run, which migrates and
# tests it again, never held for it (MIGRATE_FAILED; the Image Lead and the chief of staff, 13 Nov).
sweep_merged() {
  MIGRATE_FAILED=
  pnpm engine photo-privacy --write || { MIGRATE_FAILED=1; log "photo records: the migration failed, so nothing is published"; }
  pnpm engine sweep || log "sweep: failed"
  git add content sources engine-state docs/review
  git diff --cached --quiet || git commit -q -m "content: sweep on main as it is now"
}
# A clean pull at a push brings main's changes in as well: a photo put on the never-again list, a head picked. A page file
# merges item by item (merge-entity.mjs keeps an item one side changed), so a photo removed on main could come back on a
# page this run also changed, and stay for a cycle, until the next sweep (the chief of staff, 2026-11-12). So after a pull
# that brought main's commits in, the sweep runs on the merge, as after a clash. `swept_pull <main before the pull>` is
# true when the sweep had nothing to do, so the push goes ahead, and false when it committed, so the tests run again.
swept_pull() {
  [ "$(git rev-parse '@{u}' 2>/dev/null)" = "$1" ] && return 0
  local head; head=$(git rev-parse HEAD)
  sweep_merged
  [ -z "${MIGRATE_FAILED:-}" ] && [ "$(git rev-parse HEAD)" = "$head" ]
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
  net git pull -q --rebase && return 0
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

# `from_main "$@"`. A fetch that fails ends the run, its last line saying why: until 13 Nov 2026 the run went on from the
# clone's old checkout, its old code included (an && list that fails doesn't stop a script under set -e).
from_main() {
  net git fetch -q origin && git checkout -q main && git reset -q --hard origin/main || exit
  [ "${AQ_SCRIPT_HEAD:-}" != "$(git rev-parse HEAD)" ] || return 0
  AQ_SCRIPT_HEAD="$(git rev-parse HEAD)"; export AQ_SCRIPT_HEAD
  exec bash "$0" "$@"
}
