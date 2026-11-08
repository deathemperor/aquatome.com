#!/usr/bin/env python3
"""A simulator test run takes its turn (AGENTS.md, "This Mac"): an `xcodebuild test` a session starts that isn't through
apps/ios/scripts/sim-run.py stops here and says so. It reads the command as a shell would: only what runs counts, not a
heredoc's text, a commit message or a search for those words. What it can't read passes."""
import json
import os
import re
import shlex
import sys

WRAPPERS = {"exec", "nohup", "time", "nice", "timeout", "caffeinate", "env", "command", "builtin", "xcrun", "sudo", "stdbuf",
            "then", "do", "else", "elif", "if", "while", "until", "!", "{", "lockf"}
SHELLS = {"sh", "bash", "zsh"}
# xcodebuild's flags that take no value: after any other flag, the next word is that flag's.
NO_VALUE = {"-quiet", "-verbose", "-json", "-showBuildSettings", "-allowProvisioningUpdates", "-allowProvisioningDeviceRegistration",
            "-skipUnavailableActions", "-hideShellScriptEnvironment", "-skipMacroValidation", "-skipPackagePluginValidation",
            "-disableAutomaticPackageResolution", "-onlyUsePackageVersionsFromResolvedFile"}


def segments(command):
    # A heredoc's body is text, not commands.
    command = re.sub(r"<<-?\s*['\"]?(\w+)['\"]?([^\n]*)\n.*?\n\s*\1[ \t]*(?=\n|$)", r"\2", command, flags=re.S)
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()\n")
    lexer.whitespace = " \t\r"
    lexer.whitespace_split = True
    lexer.commenters = ""
    words = []
    for token in lexer:
        if token and all(c in ";&|()\n" for c in token):
            yield words
            words = []
        else:
            words.append(token)
    yield words


def unwrapped(words):
    """The command a line runs and its arguments, past assignments and wrappers (nice -n 10, timeout 60, lockf -k <file>)."""
    i = 0
    while i < len(words):
        word = words[i]
        name = os.path.basename(word)
        if re.fullmatch(r"\w+=.*", word) or name in WRAPPERS or word.startswith("-") or re.fullmatch(r"\d+[smhd]?", word):
            i += 1
            if name == "lockf":  # its file comes next, after its flags
                while i < len(words) and words[i].startswith("-"):
                    i += 1
                i += 1
            continue
        return name, words[i + 1:]
    return None, []


def runs_tests(args):
    i = 0
    while i < len(args):
        arg = args[i]
        if arg in ("test", "test-without-building"):
            return True
        i += 2 if arg.startswith("-") and arg not in NO_VALUE else 1
    return False


def bare_run(command):
    for words in segments(command):
        name, args = unwrapped(words)
        if name == "xcodebuild" and runs_tests(args):
            return True
        if name in SHELLS and "-c" in args[:-1] and bare_run(args[args.index("-c") + 1]):
            return True
    return False


try:
    blocked = bare_run(json.load(sys.stdin)["tool_input"]["command"])
except Exception:
    blocked = False
if blocked:
    print("One simulator test run at a time on this Mac: start it as apps/ios/scripts/sim-run.py xcodebuild test ...", file=sys.stderr)
    sys.exit(2)
