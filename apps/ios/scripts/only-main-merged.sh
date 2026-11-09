#!/bin/bash
# Whether a pull request's push only merged main in: only-main-merged.sh <head before> <head after> [<main>]
#
# Exit 0 when <after> merges <before> with a commit of <main> (origin/main) and leaves the app's and the protocols' files
# (ios.yml's paths) as the merge alone makes them: no conflict there, and nothing else changed there. CI tested the pull
# request's change merged with main already, so its iOS jobs needn't run again (ios.yml, job `changes`). A merge that
# resolved a conflict in those files is new code, as is any other push: exit 1, saying why. Needs the history back to
# where the branch left main.
set -uo pipefail
before=$1 after=$2 main=${3:-origin/main}
paths=(apps/ios protocols .github/workflows/ios.yml)
no() { echo "not only main merged in: $*"; exit 1; }

read -r _ first second extra <<< "$(git rev-list --parents -n 1 "$after" 2>/dev/null)"
[ -n "${second:-}" ] && [ -z "${extra:-}" ] || no "not a merge of two commits"
[ "$first" = "$(git rev-parse "$before^{commit}" 2>/dev/null)" ] || no "its first parent isn't the head before it"
git merge-base --is-ancestor "$second" "$main" 2>/dev/null || no "what it merges isn't main's"
# The merge as git makes it on its own: its tree, then the files it couldn't merge.
out=$(git merge-tree --write-tree --name-only --no-messages "$first" "$second")
[ $? -le 1 ] || no "git couldn't merge them"
conflicts=$(tail -n +2 <<< "$out" | grep -E '^(apps/ios/|protocols/|\.github/workflows/ios\.yml$)')
[ -z "$conflicts" ] || no "it resolved a conflict in $(tr '\n' ' ' <<< "$conflicts")"
git diff --quiet "$(head -n 1 <<< "$out")" "$after" -- "${paths[@]}" || no "it changes the app's or the protocols' files beyond the merge"
echo "only main merged in"
