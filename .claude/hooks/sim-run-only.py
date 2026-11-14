#!/usr/bin/env python3
"""Heavy work takes its turn (AGENTS.md, "This Mac"): an `xcodebuild test` a session starts that isn't through
apps/ios/scripts/sim-run.py stops here and says so, and so does an Astro build, a full test suite, e2e or another xcodebuild
build that isn't in the checks queue (scripts/checks.sh, or lockf on ~/.cache/aquatome/checks.lock): on 2026-11-08 they ran side by side, the
Mac went to heavy thermal pressure and a 0.4 s job took up to 54 s. It reads the command as a shell would: only what runs
counts, not a heredoc's text, a commit message or a search for those words. What it can't read passes. Simulator.app
isn't opened: simulators run headless. Nothing is killed by name or pattern, and a queue's lock file stays."""
import json
import os
import re
import shlex
import subprocess
import sys

WRAPPERS = {"exec", "nohup", "time", "nice", "timeout", "caffeinate", "env", "command", "builtin", "xcrun", "sudo", "stdbuf",
            "then", "do", "else", "elif", "if", "while", "until", "!", "{", "lockf"}
SHELLS = {"sh", "bash", "zsh"}
MAC_STATUS = os.path.join(os.path.dirname(os.path.realpath(__file__)), "../../scripts/mac-status.py")
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
KILL = ("Stop a process only by a pid you started yourself (AGENTS.md, This Mac): pkill, killall and a kill fed by pgrep match "
        "other people's runs. Keep the pid when you start it, then kill <pid>.")
KEEP_LOCK = ("A lockf on a queue's lock needs -k (AGENTS.md, This Mac): without it lockf deletes the link to the shared queue "
             "when it ends. Add -k, as in lockf -k -t 0 <file> true to try it.")
QUEUE_LOCKS = {"checks.lock", "sim.lock"}
# A kill fed by pgrep within one word: kill "$(pgrep x)", or with backticks.
PGREP_FED = re.compile(r"(\$\(|`)\s*(\S*/)?pgrep\b")
PIPE = re.compile(r"\)*\|&?\n*")  # the lexer runs separators together: a pipe at a line's end comes with its newline
XARGS_VALUE = {"-n", "-I", "-L", "-P", "-s", "-E", "-J", "-R", "-S"}
GRANT = ("Only the chief of staff keeps the next turn for a run (AGENTS.md, This Mac): scripts/next-turn.py runs from their "
         "own thread.")
QUEUE = ("Heavy work takes turns on this Mac (AGENTS.md, This Mac): start it as scripts/checks.sh nice -n 10 <command> (from the "
         "repository's root), or lockf -k ~/.cache/aquatome/checks.lock nice -n 10 <command>. One test file needs no turn: "
         "pnpm exec vitest run <file>.")


def segments(command):
    """Each command in a line of shell: its words, and the separator that ended it ("" at the end)."""
    # A heredoc's body is text, not commands.
    command = re.sub(r"<<-?\s*['\"]?(\w+)['\"]?([^\n]*)\n.*?\n\s*\1[ \t]*(?=\n|$)", r"\2", command, flags=re.S)
    command = re.sub(r"\d*>&\d*-?", " ", command)  # 2>&1's & separates nothing
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()\n")
    lexer.whitespace = " \t\r"
    lexer.whitespace_split = True
    lexer.commenters = ""
    words = []
    for token in lexer:
        if token and all(c in ";&|()\n" for c in token):
            yield words, token
            words = []
        else:
            words.append(token)
    yield words, ""


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
                flags = []
                while i < len(words) and words[i].startswith("-"):
                    flags.append(words[i])
                    i += 2 if words[i] == "-t" else 1
                target = os.path.basename(words[i]) if i < len(words) else ""
                if target in QUEUE_LOCKS and not any("k" in f for f in flags):
                    return "lockf", [], queued  # the only way "lockf" comes back from here: it would delete a queue's lock
                queued = queued or target == "checks.lock"
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


def granter():
    """Whether this session is the chief of staff's: the thread it runs in (its environment, which a command's own
    assignment doesn't change) is the one that runs the project."""
    try:
        with open(os.path.expanduser("~/.config/aquatome/owner-report-thread")) as f:
            thread = f.read().strip()
    except OSError:
        return False
    return bool(thread) and os.environ.get("T3CODE_THREAD_ID") == thread


def kills_by_name(name, args, after_kill, pgrep_upstream):
    """pkill or killall, through xargs too, or a kill that pgrep feeds, in its arguments or down a pipe."""
    if name in ("pkill", "killall"):
        return True
    if name == "kill":
        return any(PGREP_FED.search(a) for a in args)
    if name == "pgrep":
        return after_kill
    if name == "xargs":
        i = 0
        while i < len(args) and args[i].startswith("-"):
            i += 2 if args[i] in XARGS_VALUE else 1
        runs, rest, _ = unwrapped(args[i:])
        if runs in SHELLS:  # xargs -I{} sh -c 'kill {}'
            return any(re.search(r"\b(pkill|killall)\b", a) or (pgrep_upstream and re.search(r"\bkill\b", a)) for a in rest)
        return runs in ("pkill", "killall") or (pgrep_upstream and runs == "kill")
    return False


def bare_run(command, queued=False):
    """What stops the command: a simulator run not through sim-run.py, heavy work outside the checks queue, a kill by name or
    pattern, or a lockf that would delete a queue's lock."""
    after_kill, pgrep_upstream = False, False
    for words, ended_by in segments(command):
        name, args, locked = unwrapped(words)
        locked = locked or queued
        pgrep_upstream = pgrep_upstream or name == "pgrep"
        if kills_by_name(name, args, after_kill, pgrep_upstream):
            return KILL
        if name == "lockf":
            return KEEP_LOCK
        after_kill = name == "kill" and ended_by.startswith("(")  # kill $(pgrep x): the $( ends this part, and pgrep starts the next
        pgrep_upstream = pgrep_upstream and PIPE.fullmatch(ended_by) is not None
        if name == "xcodebuild" and runs_tests(args):
            return SIM
        if re.fullmatch(r"python[\d.]*", name or "") and args:  # python3 scripts/next-turn.py ...
            name, args = os.path.basename(args[0]), args[1:]
        if name == "next-turn.py" and args[:1] not in (["--kept"], ["--help"], ["-h"]) and not granter():
            return GRANT
        # Simulator.app's window is WindowServer's to draw, every frame, on top of the simulator's own rendering.
        if name == "open" and any(re.fullmatch(r"(.*/)?Simulator(\.app)?/?", a) for a in args):
            return HEADLESS
        if not locked and name and heavy(name, args):
            return QUEUE
        if name == "simctl" and args[:1] == ["boot"] and len(args) > 1:
            cap = subprocess.run([sys.executable, MAC_STATUS, "--cap", args[1]], capture_output=True, text=True)
            if cap.returncode == 2:
                return cap.stderr.strip()
        script = next((i + 1 for i, a in enumerate(args[:-1]) if re.fullmatch(r"-[a-z]*c", a)), None)  # sh -c, bash -lc
        if name in SHELLS and script is not None:
            reason = bare_run(args[script], locked)
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
