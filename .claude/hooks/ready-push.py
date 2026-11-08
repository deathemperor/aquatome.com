#!/usr/bin/env python3
"""A ready iOS pull request takes its fixes in one push (AGENTS.md, Pull requests). Each push runs its iOS jobs again on
GitHub's five shared Macs, about 80 Mac-minutes a run (median 61, 5-8 Nov 2026), and cancels its run while that run is
queued or running: a quarter of pull requests' Mac time those days went to runs that a later push cancelled. So
`git push` stops here while the branch's pull request is open and ready, changes the app or the protocols, and its last
iOS run hasn't ended. `AQ_PUSH_ANYWAY=1 git push ...` goes through. A draft's push, a branch with no pull request, and
anything this can't tell, pass. Like main-merge.py, it reads the command as a shell would: a commit message or a heredoc
that says "git push" isn't one."""
import json
import os
import re
import shlex
import subprocess
import sys

# git's options that take the next word as their value, before its command; and push's.
GIT_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}
PUSH_VALUE = {"-o", "--push-option", "--repo", "--receive-pack", "--exec"}
NOT_A_BRANCH = {"-d", "--delete", "--tags", "-n", "--dry-run", "--mirror", "--all"}
WRAPPERS = {"exec", "nohup", "time", "nice", "timeout", "env", "command", "builtin", "then", "do", "else", "elif", "if",
            "while", "until", "!", "{"}
# What ios.yml runs for (its `paths`).
IOS = ("apps/ios/", "protocols/", ".github/workflows/ios.yml")
SAID = ("This pull request is ready and its iOS run is still {state} ({url}). This push cancels that run and runs every "
        "iOS job again: about 80 Mac-minutes on GitHub's five shared Macs (median 61, 5-8 Nov 2026). Gather the fixes into "
        "one push once that run ends. If you know that run will fail (you found the bug it will hit), push now as "
        "AQ_PUSH_ANYWAY=1 git push ...: cancelling a run that will fail saves the Mac time it would waste "
        "(AGENTS.md, Pull requests).")


def segments(command):
    command = re.sub(r"<<-?\s*['\"]?(\w+)['\"]?([^\n]*)\n.*?\n\s*\1[ \t]*(?=\n|$)", r"\2", command, flags=re.S)
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()\n")
    lexer.whitespace, lexer.whitespace_split, lexer.commenters = " \t\r", True, ""
    words = []
    for token in lexer:
        if token and all(c in ";&|()\n" for c in token):
            yield words
            words = []
        else:
            words.append(token)
    yield words


def run(cwd, *args):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=20)


def pushed(words, cwd):
    """The folder and the branch these words push, if they push one; else None."""
    i = 0
    while i < len(words) and (re.fullmatch(r"\w+=.*", words[i]) or words[i] in WRAPPERS or words[i].startswith("-")
                              or re.fullmatch(r"\d+[smhd]?", words[i])):
        if words[i] == "AQ_PUSH_ANYWAY=1":
            return None
        i += 1
    if i >= len(words):
        return None
    name, args = os.path.basename(words[i]), words[i + 1:]
    if name in ("bash", "sh", "zsh") and "-c" in args[:-1]:
        return next(filter(None, (pushed(w, cwd) for w in segments(args[args.index("-c") + 1]))), None)
    if name != "git":
        return None
    j = 0
    while j < len(args) and args[j].startswith("-"):
        if args[j] == "-C" and j + 1 < len(args):
            cwd = os.path.join(cwd, os.path.expanduser(args[j + 1]))
        j += 2 if args[j] in GIT_VALUE else 1
    if j >= len(args) or args[j] != "push":
        return None
    rest, refs, k = args[j + 1:], [], 0
    while k < len(rest):
        if rest[k] in NOT_A_BRANCH:
            return None
        if rest[k] in PUSH_VALUE:
            k += 1
        elif not rest[k].startswith("-"):
            refs.append(rest[k])
        k += 1
    branch = refs[1].split(":")[-1].lstrip("+") if len(refs) > 1 else "HEAD"
    if branch == "HEAD":
        branch = run(cwd, "git", "symbolic-ref", "--short", "-q", "HEAD").stdout.strip()  # detached: none
    branch = re.sub(r"^refs/heads/", "", branch)
    return (cwd, branch) if branch and branch != "HEAD" else None


def refused(command, cwd):
    for words in segments(command):
        found = pushed(words, cwd)
        if not found:
            continue
        where, branch = found
        pr = run(where, "gh", "pr", "view", branch, "--json", "isDraft,state,files", "--jq",
                 'select(.state == "OPEN" and (.isDraft | not)) | .files[].path')
        if pr.returncode != 0 or not any(f.startswith(IOS) for f in pr.stdout.split()):
            continue  # no open pull request, a draft, no app change, or gh couldn't say
        last = run(where, "gh", "run", "list", "--workflow", "ios.yml", "--branch", branch, "--event", "pull_request",
                   "--limit", "1", "--json", "status,url", "--jq", '.[] | select(.status != "completed") | "\\(.status) \\(.url)"')
        if last.returncode == 0 and last.stdout.strip():
            status, _, url = last.stdout.strip().partition(" ")
            return SAID.format(state="running" if status == "in_progress" else "queued", url=url)
    return None


try:
    given = json.load(sys.stdin)
    reason = refused(given["tool_input"]["command"], given.get("cwd") or os.getcwd())
except Exception:
    reason = None
if reason:
    print(reason, file=sys.stderr)
    sys.exit(2)
