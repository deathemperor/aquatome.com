#!/usr/bin/env bash
# Sourced by video-recheck.sh after the common cycle helpers are loaded.

# Fresh work has yet to pass the gate. Save a failed sweep separately from batches recovery can publish.
sweep_new_video_recheck() {
  pnpm engine sweep && return 0
  local branch
  branch="sweep-failed/video-recheck/$(date -u +%Y%m%dT%H%M%S)"
  log "video recheck sweep failed before the gate: nothing published"
  if [ -n "$(git status --porcelain -- content engine-state docs/review)" ]; then
    if git checkout -q -b "$branch" && git add content engine-state docs/review &&
      git commit -q -m "content: video recheck sweep failed before the gate"; then
      log "video recheck work is on $branch for a fresh sweep and gate"
    else
      log "could not save video recheck work on $branch"
    fi
  fi
  return 1
}

push_video_recheck() {
  local try run batch_base tree checked_tree='' refreshed pulled clash verification_failed commit candidate batch
  batch=$(git rev-parse HEAD) || return 1
  candidate=$batch
  if ! batch_base=$(git merge-base "$batch" origin/main); then
    keep_lost_push video-recheck "could not find the batch's base on origin/main" "$batch"
    return 1
  fi
  for try in 1 2 3; do
    run=$(git rev-parse HEAD) || break
    if [ "$run" != "$candidate" ]; then
      keep_lost_push video-recheck "the video recheck checkout moved between publish attempts" "$batch"
      return 1
    fi
    if ! prepare_video_recheck; then
      keep_lost_push video-recheck "the checkout had changes before publishing" "$batch"
      return 1
    fi
    # Reconcile main from the unmodified batch again if a publish attempt lost.
    if [ "$run" != "$batch" ]; then
      if ! git reset -q --hard "$batch"; then
        keep_lost_push video-recheck "could not return to the original video recheck batch" "$batch"
        return 1
      fi
      candidate=$batch
    fi
    if ! net git pull -q --rebase origin main; then
      clash=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
      git rebase --abort 2>/dev/null || true
      if [ -z "$clash" ]; then
        log "could not pull main before checking the video recheck"
        continue
      fi
      log "another job changed the same files: $clash"
      if ! net git pull -q --rebase -X theirs origin main; then
        git rebase --abort 2>/dev/null || true
        continue
      fi
    else
      clash=
    fi
    refreshed=$(git rev-parse origin/main) || break
    if ! pulled=$(git rev-parse HEAD) || ! video_recheck_pull_kept_batch "$batch" "$refreshed" "$pulled"; then
      keep_lost_push video-recheck "the first pull did not retain the video recheck batch" "$batch"
      return 1
    fi
    if ! video_recheck_rules_current; then
      keep_lost_push video-recheck "video recheck rules changed during this run" "$batch"
      return 1
    fi
    if ! replan_merged "$clash" "$refreshed"; then
      keep_lost_push video-recheck "could not replan main's calendar" "$batch"
      return 1
    fi
    if [ "$refreshed" != "$batch_base" ]; then
      main_holds "$batch" "$refreshed" || true
      if ! sweep_merged strict; then
        keep_lost_push video-recheck "the sweep did not finish and commit" "$batch"
        return 1
      fi
    fi

    # Check the tree that includes the latest main. A disjoint content change can affect cross-page checks.
    candidate=$(git rev-parse HEAD) || break
    if ! tree=$(video_recheck_tree "$candidate" "$pulled"); then
      keep_lost_push video-recheck "the video recheck checkout differed from its commit before verification" "$batch"
      return 1
    fi
    if [ "$checked_tree" != "$tree" ] || [ -n "${MIGRATE_FAILED:-}" ]; then
      verification_failed=0
      verify_cycle "$tree" || verification_failed=$?
      if ! video_recheck_unchanged "$tree" || [ "$verification_failed" = 2 ]; then
        keep_lost_push video-recheck "the video recheck checkout changed during verification" "$batch"
        return 1
      fi
      if [ "$verification_failed" != 0 ]; then
        keep_unpublished video-recheck "$batch" || log "could not queue the failed video recheck"
        log "tests failed, not publishing (see $TEST_LOG)"
        return 1
      fi
      checked_tree=$tree
    fi

    # Main may have moved during the checks. A fast-forward-only pull means it cannot combine divergent trees here.
    # If the tree changed, the next attempt checks it against the original batch before verifying again.
    if ! net git pull -q --no-rebase --ff-only origin main; then
      log "main moved or could not be reached after the checks: trying a fresh pull before publishing"
      continue
    fi
    commit=$(git rev-parse HEAD) || break
    if ! git merge-base --is-ancestor "$candidate" "$commit"; then
      keep_lost_push video-recheck "the checkout moved outside the verified video recheck history" "$batch"
      return 1
    fi
    candidate=$commit
    if [ "$(video_recheck_tree "$candidate")" != "$checked_tree" ]; then
      log "main moved after the checks: trying a fresh pull before publishing"
      continue
    fi
    if net git push -q origin "$commit:refs/heads/main"; then
      log "pushed (GitHub deploys it)"
      return 0
    fi
    if [ "$try" -lt 3 ]; then sleep 30; fi
  done
  log "could not publish after three attempts"
  keep_lost_push video-recheck "push failed three times" "$batch"
  return 1
}
