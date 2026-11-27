#!/usr/bin/env bash
# Sourced by video-recheck.sh after the common cycle helpers are loaded.

push_video_recheck() {
  local try run base tree checked_tree='' refreshed clash
  for try in 1 2 3; do
    run=$(git rev-parse HEAD) || break
    base=$(git merge-base "$run" '@{u}') || break
    if ! net git pull -q --rebase; then
      clash=$(git diff --name-only --diff-filter=U | tr '\n' ' ')
      git rebase --abort 2>/dev/null || true
      if [ -z "$clash" ]; then
        log "could not pull main before checking the video recheck"
        continue
      fi
      log "another job changed the same files: $clash"
      if ! net git pull -q --rebase -X theirs; then
        git rebase --abort 2>/dev/null || true
        continue
      fi
    fi
    if ! video_recheck_rules_current; then
      keep_lost_push video-recheck "video recheck rules changed during this run" "$run"
      return 1
    fi
    refreshed=$(git rev-parse '@{u}') || break
    if [ "$refreshed" != "$base" ]; then
      main_holds "$run" || true
      if ! sweep_merged; then
        keep_lost_push video-recheck "the sweep couldn't be committed" "$run"
        return 1
      fi
    fi

    # Check the tree that includes the latest main. A disjoint content change can affect cross-page checks.
    if ! tree=$(video_recheck_tree); then
      keep_lost_push video-recheck "the video recheck checkout differed from its commit before verification" "$run"
      return 1
    fi
    if [ "$checked_tree" != "$tree" ] || [ -n "${MIGRATE_FAILED:-}" ]; then
      if ! verify_cycle; then
        keep_unpublished video-recheck
        log "tests failed, not publishing (see $TEST_LOG)"
        return 1
      fi
      if [ "$(video_recheck_tree)" != "$tree" ]; then
        keep_lost_push video-recheck "the video recheck checkout changed during verification" "$run"
        return 1
      fi
      checked_tree=$tree
    fi

    # Main may have moved during the checks. A fast-forward-only pull means it cannot combine divergent trees here.
    # If anything came in, the next attempt integrates and checks it before a push can run.
    if ! net git pull -q --no-rebase --ff-only || [ "$(video_recheck_tree)" != "$checked_tree" ]; then
      log "main moved or could not be reached after the checks: trying a fresh pull before publishing"
      continue
    fi
    if net git push -q; then
      log "pushed (GitHub deploys it)"
      return 0
    fi
    if [ "$try" -lt 3 ]; then sleep 30; fi
  done
  log "could not publish after three attempts"
  keep_lost_push video-recheck
  return 1
}
