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

VIDEO_RECHECK_PENDING_REF=refs/aquatome/video-recheck/pending

# A held ref can point to a record with the original batch as its first parent.
video_recheck_batch_is_queued() {
  local branches branch original
  branches=$(git for-each-ref --format='%(refname)' refs/heads/kept/video-recheck/ refs/heads/held/video-recheck/) || return 2
  for branch in $branches; do
    original=$(video_recheck_recovery_parent "$branch" 1) || return 2
    if [ "$original" = "$1" ]; then return 0; fi
  done
  return 1
}

# Runs after the checkout archive and before from_main can reset it.
recover_interrupted_video_recheck() {
  local batch rebase_merge rebase_apply
  batch=$(git for-each-ref --format='%(objectname)' "$VIDEO_RECHECK_PENDING_REF") || return 1
  [ -n "$batch" ] || return 0
  if video_recheck_batch_is_queued "$batch"; then
    :
  elif [ "$?" != 1 ] || ! keep_lost_push video-recheck "video recheck was interrupted" "$batch"; then
    return 1
  fi
  rebase_merge=$(git rev-parse --git-path rebase-merge) &&
    rebase_apply=$(git rev-parse --git-path rebase-apply) || return 1
  if [ -d "$rebase_merge" ] || [ -d "$rebase_apply" ]; then git rebase --abort || return 1; fi
  git update-ref -d "$VIDEO_RECHECK_PENDING_REF" "$batch"
}

push_video_recheck() {
  local batch status=0
  batch=$(git rev-parse HEAD) || return 1
  # Keep the original commit reachable even if the process stops without running cleanup.
  if ! git update-ref "$VIDEO_RECHECK_PENDING_REF" "$batch" ''; then
    keep_lost_push video-recheck "could not record the pending batch before verification" "$batch"
    return 1
  fi
  publish_video_recheck_batch "$batch" || status=$?
  if [ "$status" = 0 ] || video_recheck_batch_is_queued "$batch"; then
    git update-ref -d "$VIDEO_RECHECK_PENDING_REF" "$batch" || log "could not clear the pending video recheck ref"
  fi
  return "$status"
}

publish_video_recheck_batch() {
  local try run batch_base tree checked_tree='' refreshed pulled calendar verification_failed commit candidate batch=$1
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
    if ! refreshed=$(video_recheck_fetch_main) || ! video_recheck_rebase "$refreshed"; then
      log "could not rebase the video recheck onto main"
      continue
    fi
    if ! pulled=$(git rev-parse HEAD); then
      keep_lost_push video-recheck "could not identify the rebased video recheck" "$batch"
      return 1
    fi
    if ! video_recheck_rules_current; then
      keep_lost_push video-recheck "video recheck rules changed during this run" "$batch"
      return 1
    fi
    if ! calendar=$(video_recheck_batch_calendar "$batch" "$refreshed" "$pulled"); then
      keep_lost_push video-recheck "could not reconcile the video recheck batch with main" "$batch"
      return 1
    fi
    if [ -n "$calendar" ] && ! restore_video_recheck_calendar "$refreshed"; then
      keep_lost_push video-recheck "could not restore main's calendar" "$batch"
      return 1
    fi
    if [ "$refreshed" != "$batch_base" ]; then
      main_holds "$batch" "$refreshed" || true
      if ! sweep_merged strict; then
        keep_lost_push video-recheck "the sweep did not finish and commit" "$batch"
        return 1
      fi
    fi

    if [ -n "$calendar" ] && ! curate_merged_calendar strict; then
      keep_lost_push video-recheck "could not replan main's calendar" "$batch"
      return 1
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
