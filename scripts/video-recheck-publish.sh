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

clear_video_recheck_pending() {
  rm -f -- "$(video_recheck_queue_archive "$1")" &&
    git update-ref -d "$VIDEO_RECHECK_PENDING_REF" "$2"
}

clear_video_recheck_recovery() {
  clear_video_recheck_pending "$1" "$2" && clear_video_recheck_outgoing "$1"
}

restore_video_recheck_queue() {
  local branch=$1 saved=$2 batch=$3 base
  # An earlier attempt may have left both queue ref locks in place.
  base=$(uncounted "$branch")
  branch=$(keep_video_recheck_ref "${base}_${saved}_resume${branch#"$base"}" "$saved" "$batch") || return 1
  log "restored interrupted video recheck on $branch"
}

restore_video_recheck_archive() {
  local batch=$1 link archive branch saved
  link=$(video_recheck_queue_archive "$batch")
  IFS= read -r archive < "$link" || return 1
  branch=$(git -C "$archive" for-each-ref --format='%(refname:short)' refs/heads/) || return 1
  case "$branch" in kept/video-recheck/*|held/video-recheck/*) ;; *) return 1 ;; esac
  net git fetch -q "$archive" "refs/heads/$branch" || return 1
  saved=$(git rev-parse --verify 'FETCH_HEAD^{commit}') &&
    [ "$(video_recheck_recovery_parent "$saved" 1)" = "$batch" ] || return 1
  restore_video_recheck_queue "$branch" "$saved" "$batch"
}

recover_video_recheck_pending() {
  local pending=$1 subject batch saved branch='' outgoing main queued
  subject=$(git show -s --format=%s "$pending") || return 1
  batch=$pending
  case "$subject" in
    "$VIDEO_RECHECK_PENDING_QUEUE_PREFIX"*)
      branch=${subject#"$VIDEO_RECHECK_PENDING_QUEUE_PREFIX"}
      case "$branch" in kept/video-recheck/*|held/video-recheck/*) ;; *) return 1 ;; esac
      saved=$(git rev-parse "$pending^") &&
        batch=$(video_recheck_recovery_parent "$saved" 1) || return 1
      ;;
  esac
  outgoing=$(video_recheck_outgoing_commits "$batch") &&
    queued=$(video_recheck_batch_refs "$batch") || return 1
  if [ -n "$outgoing" ]; then
    main=$(video_recheck_fetch_main) || return 1
    if video_recheck_push_reached_main "$outgoing" "$main"; then
      log "main already contains the verified video recheck commit"
      drop_video_recheck_queue_refs "$queued" || return 1
      clear_video_recheck_recovery "$batch" "$pending"
      return
    elif [ "$?" != 1 ]; then return 1; fi
  fi
  if [ -z "$queued" ]; then
    if [ -n "$branch" ]; then
      restore_video_recheck_queue "$branch" "$saved" "$batch" || return 1
    elif [ -e "$(video_recheck_queue_archive "$batch")" ]; then
      restore_video_recheck_archive "$batch" || return 1
    else
      keep_lost_push video-recheck "video recheck was interrupted" "$batch" || return 1
    fi
  fi
  # The interrupted push can still land. The queue checks this receipt before retrying.
  clear_video_recheck_pending "$batch" "$pending"
}

# Runs after the checkout archive and before from_main can reset it.
recover_interrupted_video_recheck() {
  local rebase_merge rebase_apply pending link batch queued
  rebase_merge=$(git rev-parse --git-path rebase-merge) &&
    rebase_apply=$(git rev-parse --git-path rebase-apply) || return 1
  if [ -d "$rebase_merge" ] || [ -d "$rebase_apply" ]; then git rebase --abort || return 1; fi

  pending=$(video_recheck_pending) || return 1
  if [ -n "$pending" ]; then recover_video_recheck_pending "$pending" || return 1; fi
  # The first pending-ref write can fail before there is a ref to look up.
  for link in "$(video_recheck_queue_archive '')"*; do
    [ -f "$link" ] || continue
    batch=${link##*.}
    [[ "$batch" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]] || continue
    queued=$(video_recheck_batch_refs "$batch") || return 1
    if [ -z "$queued" ]; then restore_video_recheck_archive "$batch" || return 1; fi
    rm -f -- "$link" || return 1
  done
}

# The batch becomes reachable before local main moves to it.
commit_video_recheck() {
  local parent tree batch
  parent=$(git rev-parse HEAD) && tree=$(git write-tree) &&
    batch=$(git commit-tree "$tree" -p "$parent" -m "$1") || return 1
  if ! git update-ref "$VIDEO_RECHECK_PENDING_REF" "$batch" ''; then
    keep_lost_push video-recheck "could not record the gated video recheck" "$batch"
    return 1
  fi
  git update-ref -m "$1" HEAD "$batch" "$parent"
}

push_video_recheck() {
  local batch pending queued outgoing status=0
  batch=$(git rev-parse HEAD) && pending=$(video_recheck_pending) || return 1
  if [ "$pending" != "$batch" ]; then
    if [ -n "$pending" ] || ! git update-ref "$VIDEO_RECHECK_PENDING_REF" "$batch" ''; then
      keep_lost_push video-recheck "could not record the pending batch before verification" "$batch"
      return 1
    fi
  fi
  publish_video_recheck_batch "$batch" || status=$?
  if [ "$status" != 0 ]; then
    queued=$(video_recheck_batch_refs "$batch") &&
      outgoing=$(video_recheck_outgoing_commits "$batch") || return "$status"
    # An unconfirmed push may have landed. Keep its evidence through the next startup.
    if [ -z "$queued" ] || [ -n "$outgoing" ]; then return "$status"; fi
  fi
  pending=$(video_recheck_pending) || return 1
  clear_video_recheck_recovery "$batch" "$pending" || log "could not clear the video recheck recovery state"
  return "$status"
}

publish_video_recheck_batch() {
  local try run batch_base tree checked_tree='' refreshed pulled calendar outgoing verification_failed commit candidate batch=$1
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
    if ! refreshed=$(video_recheck_fetch_main); then
      log "could not fetch main before publishing the video recheck"
      continue
    fi
    outgoing=$(video_recheck_outgoing_commits "$batch") || break
    if video_recheck_push_reached_main "$outgoing" "$refreshed"; then
      log "main already contains the verified video recheck commit"
      return 0
    elif [ "$?" != 1 ]; then break; fi
    if ! video_recheck_rebase "$refreshed"; then
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
    if ! record_video_recheck_outgoing "$batch" "$commit"; then
      keep_lost_push video-recheck "could not record the outgoing video recheck commit" "$batch"
      return 1
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
