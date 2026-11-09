#!/usr/bin/env python3
"""Heavy work takes its turn (AGENTS.md, "This Mac"): an `xcodebuild test` a session starts that isn't through
apps/ios/scripts/sim-run.py stops here and says so, and so does an Astro build, a full test suite, e2e or another xcodebuild
build that isn't in the checks queue (scripts/checks.sh, or lockf on ~/.cache/aquatome/checks.lock): on 2026-11-08 they ran side by side, the
Mac went to heavy thermal pressure and a 0.4 s job took up to 54 s. It reads the command as a shell would: only what runs
counts, not a heredoc's text, a commit message or a search for those words. What it can't read passes. Simulator.app
isn't opened: simulators run headless."""
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
# xcodebuild's flags that only ask something: nothing is built.
INFO = {"-list", "-version", "-showsdks", "-showBuildSettings", "-showdestinations", "-showTestPlans", "-showComponent", "-help",
        "-usage", "-license", "-checkFirstLaunchStatus", "-runFirstLaunch", "-downloadPlatform", "-downloadAllPlatforms",
        "-resolvePackageDependencies", "-exportArchive"}
PACKAGE_MANAGERS = {"pnpm", "npm", "yarn"}
PM_VALUE = {"--filter", "-F", "-C", "--dir", "--prefix", "--workspace", "--reporter", "--workspace-concurrency"}
# The root's test runs every package's; the site's test and build are Astro builds.
HEAVY_SCRIPTS = {"build", "test", "e2e"}
SIM = "One simulator test run at a time on this Mac: start it as apps/ios/scripts/sim-run.py xcodebuild test ..."
HEADLESS = ("Simulators run headless on this Mac (AGENTS.md, This Mac): xcrun simctl boot, or let xcodebuild boot one; "
            "watch one in the Device panel only while you need to, and close it.")
QUEUE = ("Heavy work takes turns on this Mac (AGENTS.md, This Mac): start it as scripts/checks.sh nice -n 10 <command> (from the "
         "repository's root), or lockf -k ~/.cache/aquatome/checks.lock nice -n 10 <command>. One test file needs no turn: "
         "pnpm exec vitest run <file>.")


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
    """The command a line runs and its arguments, past assignments and wrappers (nice -n 10, timeout 60, lockf -k <file>),
    and whether it waits in the checks queue."""
    i, queued = 0, False
    while i < len(words):
        word = words[i]
        name = os.path.basename(word)
        if name == "checks.sh":  # the checks queue's own way in (scripts/checks.sh)
            i, queued = i + 1, True
            continue
        if re.fullmatch(r"\w+=.*", word) or name in WRAPPERS or word.startswith("-") or re.fullmatch(r"\d+[smhd]?", word):
            i += 1
            if name == "lockf":  # its file comes next, after its flags (-t takes a number)
                while i < len(words) and words[i].startswith("-"):
                    i += 2 if words[i] == "-t" else 1
                queued = queued or (i < len(words) and os.path.basename(words[i]) == "checks.lock")
                i += 1
            continue
        return name, words[i + 1:], queued
    return None, [], queued


def actions(args):
    """xcodebuild's actions: its words that aren't a flag, a flag's value or a build setting."""
    found, i = [], 0
    while i < len(args):
        arg = args[i]
        if arg.startswith("-"):
            i += 1 if arg in NO_VALUE or arg in INFO else 2
            continue
        if "=" not in arg:
            found.append(arg)
        i += 1
    return found


def runs_tests(args):
    return any(a in ("test", "test-without-building") for a in actions(args))


def heavy(name, args):
    """An Astro build, a whole test suite (a package's or all of them), e2e, or an xcodebuild that builds."""
    if name == "xcodebuild":
        return not any(a in INFO for a in args) and actions(args) != ["clean"]  # no action at all is a build
    if name == "astro":
        return args[:1] == ["build"]
    if name == "playwright":
        return args[:1] == ["test"]
    if name == "vitest":
        # One file or folder is a small run; no path is the package's whole suite.
        return not any("/" in a or re.search(r"\.(test|spec)\.|\.[cm]?[jt]sx?$", a) for a in args if not a.startswith("-"))
    if name in ("npx", "pnpx", "bunx"):
        rest = [a for a in args if not a.startswith("-")]
        return bool(rest) and heavy(os.path.basename(rest[0]), rest[1:])
    if name in PACKAGE_MANAGERS or name.split("@")[0] in PACKAGE_MANAGERS:  # corepack pnpm@12.4.1 ...
        i = 0
        while i < len(args):
            arg = args[i]
            if arg.startswith("-"):
                i += 2 if arg in PM_VALUE else 1
            elif arg in ("run", "run-script"):
                i += 1
            elif arg in ("exec", "dlx", "x"):
                tool = next((j for j in range(i + 1, len(args)) if not args[j].startswith("-")), None)
                return tool is not None and heavy(os.path.basename(args[tool]), args[tool + 1:])
            else:
                return arg in HEAVY_SCRIPTS or arg.startswith("e2e:")
    if name == "corepack":
        return bool(args) and heavy(os.path.basename(args[0]), args[1:])
    return False


def bare_run(command, queued=False):
    """What stops the command: a simulator run not through sim-run.py, or heavy work outside the checks queue."""
    for words in segments(command):
        name, args, locked = unwrapped(words)
        locked = locked or queued
        if name == "xcodebuild" and runs_tests(args):
            return SIM
        # Simulator.app's window is WindowServer's to draw, every frame, on top of the simulator's own rendering.
        if name == "open" and any(re.fullmatch(r"(.*/)?Simulator(\.app)?/?", a) for a in args):
            return HEADLESS
        if not locked and name and heavy(name, args):
            return QUEUE
        if name in SHELLS and "-c" in args[:-1]:
            reason = bare_run(args[args.index("-c") + 1], locked)
            if reason:
                return reason
    return None


try:
    reason = bare_run(json.load(sys.stdin)["tool_input"]["command"])
except Exception:
    reason = None
if reason:
    print(reason, file=sys.stderr)
    sys.exit(2)
