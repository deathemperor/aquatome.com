#!/usr/bin/env python3
"""A ready pull request's branch takes main in only to resolve a conflict (AGENTS.md, Pull requests): CI checks a pull
request merged with main already, and each push to a ready one runs its iOS jobs again. Merges of main started 28% of the
pull requests' time on GitHub's Macs on 2026-11-08. So `git merge`, `git pull` or `git rebase` of main, and
`gh pr update-branch`, stop here when the branch's pull request is ready and merges with main without a conflict. A
draft's, one with a conflict, a branch with no pull request, and anything this can't tell, pass. Like sim-run-only.py,
it reads the command as a shell would: a commit message or a heredoc that names main isn't a merge."""
import json
import os
import re
import shlex
import subprocess
import sys

MAIN = {"main", "origin/main", "upstream/main", "refs/heads/main", "refs/remotes/origin/main"}
# git's options that take the next word as their value, before its command.
GIT_VALUE = {"-C", "-c", "--git-dir", "--work-tree", "--namespace"}
WRAPPERS = {"exec", "nohup", "time", "nice", "timeout", "env", "command", "builtin", "then", "do", "else", "elif", "if",
            "while", "until", "!", "{"}
SAID = ("This pull request is ready and merges with main cleanly: CI already checks it merged with main, and merging main in "
        "only runs its iOS jobs again (28% of pull requests' Mac time on 2026-11-08). Merge main in only to resolve a "
        "conflict, or while it's a draft (AGENTS.md, Pull requests). This checked your copy of main: fetch first if it's old.")


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


def merges_main(words, cwd):
    """The folder whose branch takes main in, main's ref there and the pull request (none: the branch's), if these words
    do that; else None. GitHub's update-branch has no ref: it can't merge a conflict, so a ready pull request's stops."""
    i = 0
    while i < len(words) and (re.fullmatch(r"\w+=.*", words[i]) or words[i] in WRAPPERS or words[i].startswith("-")
                              or re.fullmatch(r"\d+[smhd]?", words[i])):
        i += 1
    if i >= len(words):
        return None
    name, args = os.path.basename(words[i]), words[i + 1:]
    if name in ("bash", "sh", "zsh") and "-c" in args[:-1]:
        return next(filter(None, (merges_main(w, cwd) for w in segments(args[args.index("-c") + 1]))), None)
    if name == "gh":
        rest = [a for a in args if not a.startswith("-")]
        return (cwd, None, rest[2:3]) if rest[:2] == ["pr", "update-branch"] else None
    if name != "git":
        return None
    j = 0
    while j < len(args) and args[j].startswith("-"):
        if args[j] == "-C" and j + 1 < len(args):
            cwd = os.path.join(cwd, os.path.expanduser(args[j + 1]))
        j += 2 if args[j] in GIT_VALUE else 1
    if j >= len(args) or args[j] not in ("merge", "pull", "rebase"):
        return None
    refs = [a for a in args[j + 1:] if not a.startswith("-")]
    if args[j] == "pull":
        return (cwd, "origin/main", []) if refs[1:2] == ["main"] else None
    main = next((r for r in refs if r in MAIN), None)
    return (cwd, "main" if main in ("main", "refs/heads/main") else "origin/main", []) if main else None


def refused(command, cwd):
    for words in segments(command):
        found = merges_main(words, cwd)
        if not found:
            continue
        where, main, number = found
        run = lambda *a: subprocess.run(a, cwd=where, capture_output=True, text=True, timeout=20)
        pr = run("gh", "pr", "view", *number, "--json", "isDraft,state", "--jq", 'select(.state == "OPEN") | .isDraft')
        if pr.returncode != 0 or pr.stdout.strip() != "false":
            continue  # no open pull request, a draft, or gh couldn't say
        # Exit 0: it merges cleanly. 1: a conflict, which a merge of main is for. Anything else: git couldn't say.
        if main is None or run("git", "merge-tree", "--write-tree", "--no-messages", "HEAD", main).returncode == 0:
            return SAID
    return None


try:
    given = json.load(sys.stdin)
    reason = refused(given["tool_input"]["command"], given.get("cwd") or os.getcwd())
except Exception:
    reason = None
if reason:
    print(reason, file=sys.stderr)
    sys.exit(2)
