#!/usr/bin/env python3
"""Which simulator flows each flow job of ios.yml runs (`app`, `handbook` and `lights`, in parts: PARTS), as
xcodebuild's -only-testing and -skip-testing arguments.

`--full`: every flow, as main runs them (after merges, nightly and by hand) and a pull request labelled `ios-full`:
packed by their time into the nine jobs (`packed`); `--full --own-mac` on the repository's own Mac, which runs the
light flows alone in job `lights`.
Otherwise the changed paths of a pull request come on stdin, one a line. A pull request runs:
- the smoke set (SMOKE, a few flows across the app's main journeys), when its change can reach any flow;
- the whole class of each flow file it changes, so a check added or changed is seen to pass;
- the page shots of the screens its change reaches (PageShotsFlowTests, by screen in flow_lists.py's SHOTS, in
  `handbook (1)`, which uploads them), for their before and after (docs/governance.md, Mobile apps rule 6): the whole
  class when it can reach every flow or edits the class, and on main;
- every flow, when it changes what selects and runs the flows, or the flows' shared code (MACHINERY).
Those flows go into as few jobs as hold them (`pack`): each job builds the app and holds one of GitHub's five Macs. A
class past SPLIT_SECONDS goes by test, in a pull request as in the full run.
The lists it reads (flow_lists.py: what a test of each class takes, and what each path can reach) aren't among them: a
change to them alone runs no flow, and `--test` checks them on every run. The other flows its change can reach (REACH)
run on main after the merge, and nightly; `left=` names their classes, for a notice. The owner's call of 2026-11-05: a
pull request's run of every flow it reached held GitHub's Macs for one to two and a half hours.

Every test runs in one job, named in the files or not: a class packed by test runs whole in one of its jobs, less the
tests the others name (`home`), and in the full run job `app (2)` runs every flow the others don't name (REST). So a
test or a class the reading of the files misses (in an extension, in another file, declared some way the patterns
don't match) still runs, there.

Prints `app=[parts]`, `app_1=` to `app_4=`, `handbook=[parts]`, `handbook_1=` to `handbook_3=`, `lights=[parts]`,
`lights_1=`, `lights_2=`, `left=` and `ran=` (what each job part runs, by class, for a notice) for $GITHUB_OUTPUT: a
job's part with no arguments is left out, and a job with no parts is skipped. `--test` checks how it picks (on
stand-ins for the lists), that the full run names every class and test once and no job's flows pass LINE_SECONDS, what
the lists decide for a few changes (flow_lists.check), and that every flow named here or in the lists is in
AquaTomeUITests; it prints nothing.

A pull request with no paths runs every flow. A path under apps/ios/ that no rule names reaches every flow: the smoke
set and the page shots run, and main runs the rest.
"""
import functools, json, os, re, sys

sys.dont_write_bytecode = True  # importing the lists leaves no __pycache__ in the checkout
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flow_lists import ALL, APP, FLOW_SECONDS, KIT, NONE, REACH, SHOTS, TEST_SECONDS, UI, check as check_lists

TESTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', UI)

# The jobs of a full run on GitHub's Macs: nine, each building the app on one of GitHub's five Macs. Main's full run on
# 789ca5218 (2026-11-17, 43963190389) had six; two passed GitHub's 120 minutes and were stopped, 107 and 106 minutes of
# flows each, while OwnerFlowTests, PhotoGridFlowTests, PhotoViewerFlowTests, WholePhotoFlowTests and most of
# ViAtRootFlowTests never ran. Every flow then took 32,600 s on those Macs, and this week's changes add about 3,400 s:
# nine jobs hold about 4,000 s of flows each, about 77 minutes with a build of 8 to 14 minutes.
PARTS = {'app': 4, 'handbook': 3, 'lights': 2}
# The job of the full run that names none of its flows: it runs every flow but those the others name and those run
# elsewhere, so a class or a test the reading of the files missed still runs.
REST = 'app_2'
# No job of a full run on GitHub's Macs may hold more than this, by the lists' times: 75 minutes, about 85 with its
# build, 35 from GitHub's limit. `--test` fails past it, naming the job: a job more in PARTS (and its outputs in
# ios.yml), or shorter flows, before main's run passes 120 minutes again.
LINE_SECONDS = 4500
# A class past this goes into jobs by test, each its own unit, rather than whole: V2FlowTests, the light flows and
# others took 40 to 72 minutes each on 2026-11-17, more than a job can hold beside anything. The page shots' tests go
# into job `handbook` alone, whose parts upload them and job `shots` merges them into one artifact; a pull request's
# into `handbook (1)`.
SPLIT_SECONDS = 1500
# Run elsewhere: the performance tests by job `perf`, the App Store's screenshots by app-store.yml.
ELSEWHERE = ['PerformanceTests', 'StoreShotsFlowTests']

# On every pull request that changes the app, packed with its other flows: one or two flows a journey, chosen by their
# time on GitHub's Macs (the median of 5 to 7 runs, 2026-11-02 to 04): 344 s together, under 6 minutes after the build.
SMOKE = [
    'HandbookFlowTests/testTheChihirosToolOpensTheLightsTab',  # the app starts, a search, the lights tab (18 s)
    'HandbookFlowTests/testTheMyTanksToolOpensTheTanksTab',  # the tanks tab (15 s)
    'NativePageFlowTests/testAGuideIsDrawnByTheAppNotTheWebPage',  # a search opens a page the app draws (19 s)
    'FactsCardFlowTests/testAFishPageShowsItsFactsAsTheSiteWritesThem',  # a fish's page and its facts (51 s)
    'TanksFlowTests/testAddsATankWithItsSize',  # a tank made and saved (33 s)
    'TankLifeFlowTests/testPutsAFishFromItsPageOnATankStartingAtItsSchoolSize',  # a fish put on it from its page (31 s)
    'TankCheckFlowTests/testWarnsWhenTheFishDontGoTogetherAndTheTankIsTooSmall',  # the tank-mates check (19 s)
    'LightFlowTests/testWritesAPresetThenAnotherThenUndoesBackToTheFirst',  # the fake light: connected, a preset (85 s)
    'AccountFlowTests/testAPasskeyAddedOnTheWebsiteOpensItsAccount',  # signed in on the stand-in server (40 s)
    'OfflineFlowTests/testTheAccountSheetCountsTheKeptPagesAndOpensTheirShelfOnTim',  # a shelf kept for offline, listed in the sheet (about 50 s)
]


# A pull request's flows go into as few jobs as hold them in PACK_SECONDS of tests each (about 30 minutes with the
# build): on GitHub's Macs a job's build, from xcodebuild's start to its first test, took a median 4.8 minutes, 24% of
# the flow jobs' time on 2026-11-06, and each job waits for one of the five Macs, which the pull requests' jobs did for
# about an hour at a time. The page shots go in `handbook (1)` (past LINE_SECONDS, the rest in `handbook (2)`), whose
# step uploads them; then the rest, longest first, into the first job with room, the jobs taken in PACK_ORDER. Past four
# jobs' worth, the rest join the least loaded.
PACK_SECONDS = 1500
# A flow of the smoke set: their median times below, 344 s for the ten.
SMOKE_SECONDS = 35
PACK_ORDER = ['app_1', 'handbook_2', 'app_2', 'handbook_1']


# What selects and runs the flows, and the flows' shared code (a file of AquaTomeUITests that isn't a class's own, as
# TabBar.swift, or a helper every flow's launch goes through): a pull request that changes them runs every flow, as only
# a run of each job tries them. Not the lists (flow_lists.py says why).
MACHINERY = ['.github/workflows/ios.yml', 'apps/ios/scripts/flows-to-run.py', 'apps/ios/scripts/wait-for-simulator.sh',
             'apps/ios/scripts/retried-tests.py', 'apps/ios/scripts/shots.py']
FLOW_FILE = re.compile(f'apps/ios/{UI}/(\\w+Tests)\\.swift')


def machinery(path):
    return path in MACHINERY or (path.startswith(f'apps/ios/{UI}/') and not FLOW_FILE.fullmatch(path))


def perf(paths):
    """Whether job `perf` runs for a pull request's change (`perf=`): it builds the app and tests the kit against the
    vectors (protocols/), so anything under apps/ios/ or protocols/ but what it never reads: the README, CI's and the
    App Store's scripts and files, the flows (but its own PerformanceTests), the icon's design. Its scripts and ios.yml,
    it does. On 2026-11-08 it took 18 minutes of a Mac on pull requests that changed only CI's scripts."""
    def reads(p):
        if p in ('apps/ios/scripts/check-perf.py', 'apps/ios/scripts/check-strings.py', '.github/workflows/ios.yml'):
            return True
        if flow := FLOW_FILE.fullmatch(p):
            return flow.group(1) == 'PerformanceTests'
        if p.startswith(('apps/ios/scripts/', 'apps/ios/store/', 'apps/ios/design/')) or p in ('apps/ios/README.md', 'apps/ios/.gitignore'):
            return False
        return p.startswith(('apps/ios/', 'protocols/'))
    return not paths or any(map(reads, paths))


def reach(path):
    """The flows `path` can reach (a list), NONE, or ALL (also when no rule names it)."""
    flow = FLOW_FILE.fullmatch(path)
    if flow:  # a class's tests are its own: what they share is in other files
        return NONE if flow.group(1) in ELSEWHERE else [flow.group(1)]
    rule = max((p for p in REACH if path.startswith(p)), key=len, default=None)
    if rule is not None:
        return REACH[rule]
    return ALL if path.startswith('apps/ios/') else NONE  # outside: the site, the other workflows


def only(tests):
    return ' '.join(f'-only-testing:{UI}/{t}' for t in tests)


def classes():
    """The classes of flows in AquaTomeUITests, as their files declare them."""
    return sorted({c for f in os.listdir(TESTS_DIR) if f.endswith('.swift')
                   for c in re.findall(r'class (\w+): XCTestCase', open(os.path.join(TESTS_DIR, f)).read())})


@functools.cache
def tests_of(cls):
    """A class's tests, as its own file declares them (`func test…()`), once each."""
    path = os.path.join(TESTS_DIR, f'{cls}.swift')
    return list(dict.fromkeys(re.findall(r'func (test\w*)\(\)', open(path).read()))) if os.path.exists(path) else []


def seconds(test):
    """What a class of flows, or one flow ('Class/test'), takes on GitHub's Macs: TEST_SECONDS for each test of its
    class (FLOW_SECONDS for a class it doesn't name); one of the smoke set's flows, SMOKE_SECONDS."""
    cls, _, one = test.partition('/')
    each = TEST_SECONDS.get(cls, FLOW_SECONDS)
    if one:
        return SMOKE_SECONDS if test in SMOKE else each
    return round(each * max(1, len(tests_of(cls))))


def units(cls):
    """A class's units for packing: itself, or each of its tests ('Class/test') when it takes more than SPLIT_SECONDS."""
    if seconds(cls) <= SPLIT_SECONDS:
        return [cls]
    return [f'{cls}/{t}' for t in tests_of(cls)] or [cls]


def pack(units):
    """Units of flows (lists of tests, each unit kept in one job) into job parts: {job part: tests}."""
    jobs, load = {}, {}
    shots = [u for u in units if any(t.split('/')[0] == 'PageShotsFlowTests' for t in u)]
    rest = sorted((u for u in units if u not in shots), key=lambda u: (-sum(map(seconds, u)), u))
    for unit in shots + rest:
        secs = sum(map(seconds, unit))
        job = next((j for j in ('handbook_1', 'handbook_2') if load.get(j, 0) + secs <= LINE_SECONDS), 'handbook_3') if unit in shots else (
            next((j for j in jobs if load[j] + secs <= PACK_SECONDS), None)
            or next((j for j in PACK_ORDER if j not in jobs), None) or min(jobs, key=load.get))
        jobs.setdefault(job, []).extend(unit)
        load[job] = load.get(job, 0) + secs
    # Classes first, then single flows (the page shots), then the smoke set's flows in their order.
    return {j: sorted(t for t in ts if '/' not in t) + sorted(t for t in ts if '/' in t and t not in SMOKE)
            + [t for t in SMOKE if t in ts] for j, ts in jobs.items()}


def home(jobs, split):
    """Job parts' tests ({job part: tests}) as their xcodebuild arguments. A class packed by test (`split`) runs whole in
    the job with the most of its tests (the first of them on a tie), less the tests the other jobs name: a test the
    reading of its file missed runs there."""
    named, skipped = {j: list(ts) for j, ts in jobs.items()}, {j: [] for j in jobs}
    for c in sorted(split):
        has = {j: [t for t in ts if t.startswith(c + '/')] for j, ts in jobs.items()}
        at = max(jobs, key=lambda j: len(has[j]))
        named[at] = [c] + [t for t in named[at] if not t.startswith(c + '/')]
        skipped[at] += [t for j in jobs if j != at for t in has[j]]
    return {j: ' '.join(filter(None, [only(named[j])] + [f'-skip-testing:{UI}/{t}' for t in skipped[j]])) for j in jobs}


def ran(args):
    """What job parts' arguments ({job part: arguments}) run, test by test ('Class/test', once for each time it runs): a
    class named runs its tests less those its part skips; a test or a class its own part both names and skips runs
    nowhere, and a part's skip of a whole class takes all its tests."""
    out = []
    for a in args.values():
        skipped = set(re.findall(rf'-skip-testing:{UI}/(\S+)', a))
        for t in re.findall(rf'-only-testing:{UI}/(\S+)', a):
            if t in skipped or t.split('/')[0] in skipped:
                continue
            out += [t] if '/' in t else [f'{t}/{x}' for x in tests_of(t) if f'{t}/{x}' not in skipped]
    return sorted(out)


def parts(name, args):
    """A job's parts from {job part: arguments}: {'1': its arguments, … , 'parts': the numbers of those with any}."""
    got = {str(n): args.get(f'{name}_{n}', '') for n in range(1, PARTS[name] + 1)}
    return got | {'parts': json.dumps([int(n) for n, a in got.items() if a])}


def packed(own_mac=False):
    """Every flow, packed by time into the nine jobs: ({job part: units}, {job part: seconds}). The page shots first,
    into job `handbook`, whose parts upload them; then each class (or past SPLIT_SECONDS each of its tests), longest
    first; each unit into the least loaded job it may go in, the first of them on a tie. On the own Mac, the light flows'
    units in job `lights` and nothing else there: it runs one simulator, and its light flows took 1.25 to 1.5 times
    GitHub's (main's runs of 2026-11-07)."""
    jobs = {f'{n}_{i}': [] for n, k in PARTS.items() for i in range(1, k + 1)}
    load, order = dict.fromkeys(jobs, 0), list(jobs)
    rest = sorted((u for c in classes() if c not in ELSEWHERE + ['PageShotsFlowTests'] for u in units(c)),
                  key=lambda u: (-seconds(u), u))
    for u in units('PageShotsFlowTests') + rest:
        light = u.split('/')[0] == 'LightFlowTests'
        room = ([j for j in order if j.startswith('handbook')] if u.split('/')[0] == 'PageShotsFlowTests' else
                [j for j in order if not own_mac or j.startswith('lights') == light])
        j = min(room, key=lambda j: (load[j], order.index(j)))
        jobs[j].append(u)
        load[j] += seconds(u)
    return jobs, load


def full(own_mac=False):
    """Every flow, in each job's parts (`packed`): each job names its own, but REST, which skips those and those run
    elsewhere."""
    jobs, _ = packed(own_mac)
    args = {j: only(ts) for j, ts in jobs.items() if j != REST}
    args[REST] = ' '.join(f'-skip-testing:{UI}/{t}' for t in ELSEWHERE + sorted(t for j, ts in jobs.items() if j != REST for t in ts))
    return tuple(parts(n, args) for n in PARTS)


def pick(paths):
    """Each job's arguments for a pull request (app, handbook, lights parts), and the classes of the flows its change
    can reach that it leaves to main's run after the merge ('every flow' when it can reach them all)."""
    if not paths or any(machinery(p) for p in paths):
        return full(), ''
    reaches = [reach(p) for p in paths]
    if all(r is NONE for r in reaches):
        return tuple(parts(n, {}) for n in PARTS), ''
    every = ALL in reaches
    flows = {f for r in reaches if isinstance(r, list) for f in r}
    # The classes it runs whole: its own flow files', and the page shots when it can reach every flow.
    whole = {m.group(1) for p in paths if (m := FLOW_FILE.fullmatch(p)) and m.group(1) not in ELSEWHERE}
    if every or 'PageShotsFlowTests' in flows:
        whole.add('PageShotsFlowTests')
    # Else the shots of the screens it reaches, as one unit (in `handbook (1)`, which uploads them).
    shots = [] if 'PageShotsFlowTests' in whole else sorted(f for f in flows if f.startswith('PageShotsFlowTests/'))
    # The smoke set runs as one unit, and each class whole, or by test past SPLIT_SECONDS.
    smoke = [t for t in SMOKE if t.split('/')[0] not in whole]
    split = {c for c in whole if units(c) != [c]}
    jobs = pack([[u] for c in sorted(whole) for u in units(c)] + ([shots] if shots else []) + ([smoke] if smoke else []))
    left = 'every flow' if every else ' '.join(sorted({f.split('/')[0] for f in flows
                                                       if f not in smoke + shots and f.split('/')[0] not in whole}))
    args = home(jobs, split)
    return tuple(parts(n, args) for n in PARTS), left


def described(args):
    """A job part's xcodebuild arguments, by class: its classes, the smoke set's flows, other single flows."""
    tests = re.findall(rf'-only-testing:{UI}/(\S+)', args)
    if not tests:
        return 'every flow not run elsewhere'
    shots = [t for t in tests if t.startswith('PageShotsFlowTests/')]
    flows = [t for t in tests if '/' in t and t not in shots]
    skipped = len(re.findall(r'-skip-testing:', args))
    some = (f'the smoke set ({len(flows)} flows)' if set(flows) <= set(SMOKE) else
            f'{len(flows)} flows of ' + ' and '.join(sorted({t.split('/')[0] for t in flows})))
    return ', '.join(sorted(t for t in tests if '/' not in t) + ([f'{len(shots)} page shots'] if shots else [])
                     + ([some] if flows else []) + ([f'less {skipped} of its flows'] if skipped else []))


def output(app, handbook, lights, left=''):
    jobs = dict(zip(PARTS, (app, handbook, lights)))
    ran = '; '.join(f'{name} ({n}): {described(job[str(n)])}' for name, job in jobs.items()
                    for n in range(1, PARTS[name] + 1) if job[str(n)])
    lines = [f'{name}={job["parts"]}' for name, job in jobs.items()] + [f'left={left}', f'ran={ran}']
    for name, job in jobs.items():
        lines += [f'{name}_{n}={job[str(n)]}' for n in range(1, PARTS[name] + 1)]
    return '\n'.join(lines)


def test():
    # Every flow file declares the class it's named for, and every flow named here or in the lists is a test in
    # AquaTomeUITests: a renamed one fails here, not silently on CI.
    source = {os.path.basename(f)[:-6]: open(os.path.join(TESTS_DIR, f)).read()
              for f in os.listdir(TESTS_DIR) if f.endswith('.swift')}
    for name, text in source.items():
        assert not name.endswith('Tests') or re.search(rf'class {name}\b', text), f'{name}.swift has no class {name}'
    flow_classes = set(classes())
    named = set(ELSEWHERE + SMOKE + list(TEST_SECONDS)) | {f for r in REACH.values() if isinstance(r, list) for f in r}
    for f in named:
        cls, _, t = f.partition('/')
        assert cls in flow_classes, f'no class {cls} in {UI}'
        assert not t or re.search(rf'func {t}\(\)', source[cls]), f'no {f} in {UI}'
    # Every page shot has its screen in SHOTS, so a pull request that reaches the screen takes it.
    in_class, mapped = set(re.findall(r'func (test\w*)\(', source['PageShotsFlowTests'])), {t for ts in SHOTS.values() for t in ts}
    assert in_class == mapped, f'page shots with no screen in SHOTS (flow_lists.py): {sorted(in_class - mapped)}, gone: {sorted(mapped - in_class)}'

    def jobs_of(app, hb, lt):
        return {f'{n}_{i}': job[str(i)] for n, job in zip(PARTS, (app, hb, lt)) for i in range(1, PARTS[n] + 1) if job[str(i)]}

    def runs(paths):
        """What a pull request runs, as {job part: the tests it names}, for a few changes."""
        (app, hb, lt), _ = pick(paths)
        return {j: re.findall(rf'-only-testing:{UI}/(\S+)', a) for j, a in jobs_of(app, hb, lt).items()}

    def skips(paths):
        (app, hb, lt), _ = pick(paths)
        return {j: re.findall(rf'-skip-testing:{UI}/(\S+)', a) for j, a in jobs_of(app, hb, lt).items()}

    def left(paths):
        return pick(paths)[1]

    def ran_by(paths):
        (app, hb, lt), _ = pick(paths)
        return ran(jobs_of(app, hb, lt))

    def reached(paths):
        """The flows a change can reach (what main runs for it after the merge): a set, or ALL."""
        rs = [reach(p) for p in paths]
        return ALL if ALL in rs else {f for r in rs if isinstance(r, list) for f in r}

    def runs_once(everything):
        """That a full run's arguments ({job part: arguments}) run every flow once: each class or test named by one job
        alone, and REST naming none and skipping exactly what the others name and what runs elsewhere."""
        names = [t for j, a in everything.items() if j != REST for t in re.findall(rf'-only-testing:{UI}/(\S+)', a)]
        assert len(names) == len(set(names)), sorted(t for t in names if names.count(t) > 1)
        assert '-only-testing' not in everything[REST], everything[REST]
        assert sorted(re.findall(rf'-skip-testing:{UI}/(\S+)', everything[REST])) == sorted(names + ELSEWHERE)
        assert not any('-skip-testing' in a for j, a in everything.items() if j != REST)
        return names

    # The full run, on GitHub's Macs and on the own Mac: all nine job parts; every class or test packed into one job,
    # each class whole or by test, and every test of a split class once; the page shots in job `handbook` only.
    for own_mac in (False, True):
        jobs, load = packed(own_mac)
        everything = dict(zip(PARTS, full(own_mac)))
        assert all(everything[n]['parts'] == json.dumps(list(range(1, k + 1))) for n, k in PARTS.items()), everything
        names = runs_once(jobs_of(*everything.values()))
        assert sorted(names + jobs[REST]) == sorted(u for c in flow_classes - set(ELSEWHERE) for u in units(c))
        assert all(j.startswith('handbook') for j, us in jobs.items() for u in us if u.split('/')[0] == 'PageShotsFlowTests')
        assert any(units(c) != [c] for c in flow_classes)
        # The own Mac: nothing beside the light flows, and they in job `lights` alone.
        if own_mac:
            assert all((u.split('/')[0] == 'LightFlowTests') == j.startswith('lights') for j, us in jobs.items() for u in us), jobs
        # GitHub's Macs: no job past the line, by the lists' times.
        else:
            over = {j: round(s) for j, s in load.items() if s > LINE_SECONDS}
            assert not over, (f'the full run no longer fits {sum(PARTS.values())} jobs of {LINE_SECONDS} s of flows on '
                              f'GitHub\'s Macs: {over}. A job more (PARTS here, its outputs in ios.yml), or shorter flows')

    # The run warns past the same line, from its jobs' real times (retried-tests.py).
    assert f'took > {LINE_SECONDS}:' in open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'retried-tests.py')).read()
    # The lists aren't what selects the flows: a change to them alone runs none.
    assert not machinery('apps/ios/scripts/flow_lists.py')
    assert runs(['apps/ios/scripts/flow_lists.py']) == {} and left(['apps/ios/scripts/flow_lists.py']) == ''
    # What the lists decide for a few changes: which flows run, in whichever job.
    check_lists(lambda paths: sorted(t for tests in runs(paths).values() for t in tests), left, reached, ran_by)
    # What a part runs, by test: a class less what its part skips; a test its own part both names and skips, nowhere.
    shot = 'PageShotsFlowTests/testAFish'
    got = ran({'handbook_1': only(['PageShotsFlowTests']) + f' -skip-testing:{UI}/{shot}',
               'handbook_2': only([shot]) + f' -skip-testing:{UI}/{shot}'})
    assert shot not in got and got.count('PageShotsFlowTests/testAPlant') == 1, got
    got = ran({'handbook_1': only(['PageShotsFlowTests']) + f' -skip-testing:{UI}/PageShotsFlowTests',
               'handbook_2': only([shot]) + f' -skip-testing:{UI}/PageShotsFlowTests'})
    assert got == [], got

    # Job `perf`: on a change to what it builds or checks, not on one to CI's scripts, the README, the flows.
    for paths in ([APP + 'Handbook/NativePage.swift'], ['protocols/tanks-vectors.json'], [KIT + 'Tests/TanksTests/StoreTests.swift'],
                  ['apps/ios/scripts/check-strings.py'], ['.github/workflows/ios.yml'], [f'apps/ios/{UI}/PerformanceTests.swift'],
                  [f'apps/ios/{UI}/FlowHelpers.swift'], ['apps/ios/Config/Base.xcconfig'], ['apps/ios/README.md', APP + 'OwnCopy.swift'], []):
        assert perf(paths), paths
    for paths in (['apps/ios/README.md', 'apps/ios/scripts/sim-run.py'], ['apps/ios/scripts/__pycache__/sim-run.cpython-315.pyc'],
                  [f'apps/ios/{UI}/TanksFlowTests.swift', 'docs/governance.md'], ['apps/ios/store/listing.json'],
                  ['apps/ios/scripts/flows-to-run.py']):
        assert not perf(paths), paths

    # How a pull request's flows are picked, on stand-ins for the lists, so these hold whatever the lists say: the
    # classes are real (the smoke set names them), the paths made up, and a class's time is given whole. Last: the
    # stand-ins stay.
    def totals(given):
        return {c: s / max(1, len(tests_of(c))) for c, s in given.items()}
    f = APP + 'StandIn/'
    globals().update(FLOW_SECONDS=45, SMOKE_SECONDS=35, TEST_SECONDS=totals({
        'PageShotsFlowTests': 1000, 'TankLifeFlowTests': 300, 'FactsCardFlowTests': 280, 'PlugFlowTests': 1200,
        'LightFlowTests': 2000}), REACH={
        f + 'Start.swift': ALL, f + 'Frame/': [], f + 'Notes.md': NONE, f + 'Light/': ['LightFlowTests'],
        f + 'Tank/': ['TanksFlowTests', 'TankLifeFlowTests/testAFlowOutsideTheSmokeSet',
                      'TankCheckFlowTests/testWarnsWhenTheFishDontGoTogetherAndTheTankIsTooSmall'],
        f + 'Page/': ['NativePageFlowTests', 'OfflineFlowTests', 'PageShotsFlowTests'],
        f + 'Page/Card.swift': ['FactsCardFlowTests', 'NativePageFlowTests', 'PageShotsFlowTests'],
        f + 'Shot/': ['TanksFlowTests', 'PageShotsFlowTests/testAPlant', 'PageShotsFlowTests/testAFish']})
    everything = dict(zip(PARTS, full()))
    is_full = lambda paths: pick(paths)[0] == tuple(everything.values())
    # What selects and runs the flows, and the flows' shared code: every flow. No paths at all: every flow too.
    for paths in (['.github/workflows/ios.yml'], ['apps/ios/scripts/flows-to-run.py'],
                  ['apps/ios/scripts/wait-for-simulator.sh'], ['apps/ios/scripts/retried-tests.py'],
                  ['apps/ios/scripts/shots.py'], [f + 'Notes.md', '.github/workflows/ios.yml'],
                  [f'apps/ios/{UI}/TabBar.swift'], [f'apps/ios/{UI}/FlowHelpers.swift'],
                  [f + 'Page/List.swift', f'apps/ios/{UI}/TabBar.swift'], []):
        assert is_full(paths) and left(paths) == '', paths
    # Any other change a flow can reach: the smoke set, in `app (1)` (one build), the rest left to main.
    smoke = {'app_1': SMOKE}
    for paths in ([f + 'Frame/View.swift'], [f + 'Tank/Form.swift'], [f + 'Light/Radio.swift'],
                  [f + 'Frame/View.swift', f + 'Tank/Form.swift', f + 'Notes.md']):
        assert runs(paths) == smoke, paths
    assert left([f + 'Frame/View.swift']) == ''
    # With the page shots when it can reach the pages (Mobile apps rule 6), or reach anything: a rule of every flow, a
    # path under apps/ios/ no rule names. The smoke set (350 s) fits beside them (1,000 s): one job, `handbook (1)`.
    shots = {'handbook_1': ['PageShotsFlowTests'] + SMOKE}
    for paths in ([f + 'Page/List.swift'], [f + 'Page/Card.swift'], [f + 'Start.swift'], [f + 'Unnamed.swift'],
                  ['apps/ios/Gemfile'], [f + 'Tank/Form.swift', f + 'Page/List.swift']):
        assert runs(paths) == shots, paths
    for paths in ([f + 'Start.swift'], [f + 'Unnamed.swift'], ['apps/ios/Gemfile']):
        assert left(paths) == 'every flow', paths
    # The shots of the screens it reaches, in `handbook (1)`, which uploads them, with the smoke set beside them; the
    # class's other flows it reaches left to main.
    got = runs([f + 'Shot/List.swift'])
    assert got == {'handbook_1': ['PageShotsFlowTests/testAFish', 'PageShotsFlowTests/testAPlant'] + SMOKE}, got
    assert left([f + 'Shot/List.swift']) == 'TanksFlowTests'
    assert output(*pick([f + 'Shot/List.swift'])[0]).splitlines()[4] == 'ran=handbook (1): 2 page shots, the smoke set (10 flows)'
    # With the whole class too: the class, not its shots twice.
    assert runs([f + 'Shot/List.swift', f + 'Page/List.swift']) == shots
    # Page shots past the line (6,000 s): `handbook (1)` takes them to LINE_SECONDS, the class less those `handbook (2)`
    # takes, and every shot runs once.
    kept = dict(TEST_SECONDS)
    globals()['TEST_SECONDS'] = kept | totals({'PageShotsFlowTests': 6000})
    got, skip = runs([f + 'Page/List.swift']), skips([f + 'Page/List.swift'])
    assert got['handbook_1'][0] == 'PageShotsFlowTests' and all(t.startswith('PageShotsFlowTests/') for t in got['handbook_2']), got
    assert sorted(skip['handbook_1']) == sorted(got['handbook_2']) and len(got['handbook_2']) < len(tests_of('PageShotsFlowTests')) / 3, skip
    shots = [t for t in ran_by([f + 'Page/List.swift']) if t.startswith('PageShotsFlowTests/')]
    assert shots == sorted(f'PageShotsFlowTests/{t}' for t in tests_of('PageShotsFlowTests')), shots
    globals()['TEST_SECONDS'] = kept
    # Nothing where no flow reaches: a rule of none, the flows run elsewhere (`perf`, app-store.yml), outside apps/ios/.
    for paths in ([f + 'Notes.md'],
                  [f'apps/ios/{UI}/StoreShotsFlowTests.swift', f'apps/ios/{UI}/PerformanceTests.swift'],
                  ['docs/governance.md', 'apps/site/src/pages/vi/index.astro', '.github/workflows/ci.yml']):
        assert runs(paths) == {} and left(paths) == '', paths
    # A flow file runs its class whole, so a check added or changed is seen to pass, packed with the smoke set's others
    # when they fit: one job.
    got = runs([f'apps/ios/{UI}/TankLifeFlowTests.swift'])
    assert got == {'app_1': ['TankLifeFlowTests'] + [t for t in SMOKE if not t.startswith('TankLife')]}, got
    # A class not in the lists counts FLOW_SECONDS a test: AccountFlowTests' (under 1,150 s), with the smoke set, fit.
    assert seconds('AccountFlowTests') < 1150, seconds('AccountFlowTests')
    assert runs([f'apps/ios/{UI}/AccountFlowTests.swift']) == {
        'app_1': ['AccountFlowTests'] + [t for t in SMOKE if not t.startswith('Account')]}
    # A new class, with no file yet: one test's worth.
    assert runs([f'apps/ios/{UI}/AFishIDFlowTests.swift']) == {'app_1': ['AFishIDFlowTests'] + SMOKE}
    # Past PACK_SECONDS (1,200 s and 350 s), a second job: the longest first, into `app (1)`, then the next in order.
    got = runs([f'apps/ios/{UI}/PlugFlowTests.swift'])
    assert got == {'app_1': ['PlugFlowTests'], 'handbook_2': SMOKE}, got
    # A class counted by its tests: ReaderPostFlowTests' fourteen (630 s) don't fit beside the page shots (1,000 s), the
    # smoke set (350 s) does.
    got = runs([f'apps/ios/{UI}/ReaderPostFlowTests.swift', f + 'Page/List.swift'])
    assert got == {'handbook_1': ['PageShotsFlowTests'] + SMOKE, 'app_1': ['ReaderPostFlowTests']}, got
    # Past four jobs' worth, the rest join the least loaded: every class still runs once.
    many = ['PlugFlowTests', 'PhotoViewerFlowTests', 'ReaderPostFlowTests', 'TanksFlowTests', 'AccountFlowTests']
    kept = dict(TEST_SECONDS)
    globals()['TEST_SECONDS'] = kept | totals({c: 1400 for c in many})
    got = runs([f'apps/ios/{UI}/{c}.swift' for c in many])
    assert sorted(got) == ['app_1', 'app_2', 'handbook_1', 'handbook_2'], got
    assert sorted(t for ts in got.values() for t in ts) == sorted(many + [t for t in SMOKE if t.split('/')[0] not in many])
    # Each to the least loaded: the fifth class to the first of four equal jobs, then the smoke set to the next.
    assert got['app_1'] == ['AccountFlowTests', 'TanksFlowTests'], got
    assert got['handbook_2'] == ['PhotoViewerFlowTests'] + [t for t in SMOKE if t.split('/')[0] not in many], got
    globals()['TEST_SECONDS'] = kept
    # What each job part runs, by class, for the notice.
    assert output(*pick([f'apps/ios/{UI}/PlugFlowTests.swift'])[0]).splitlines()[4] == (
        'ran=app (1): PlugFlowTests; handbook (2): the smoke set (10 flows)')
    # A class past SPLIT_SECONDS goes by test (the light flows' 2,000 s): its tests in as many jobs as hold them, the
    # class whole in the one with the most of them, less the tests the others name. Every test runs once.
    light = tests_of('LightFlowTests')
    got, skip = runs([f'apps/ios/{UI}/LightFlowTests.swift']), skips([f'apps/ios/{UI}/LightFlowTests.swift'])
    at = [j for j, ts in got.items() if 'LightFlowTests' in ts]
    assert len(at) == 1 and len(got) > 1, got
    others = [t for j, ts in got.items() if j != at[0] for t in ts if t.startswith('LightFlowTests/')]
    assert sorted(skip[at[0]]) == sorted(others) and not any(skip[j] for j in got if j != at[0]), skip
    assert len(others) == len(set(others)) and len(others) < len(light), others
    every_name = [t for ts in got.values() for t in ts]
    assert len(every_name) == len(set(every_name)), got
    assert output(*pick([f'apps/ios/{UI}/LightFlowTests.swift'])[0]).splitlines()[4].startswith('ran=app (1): LightFlowTests, ')

    # A test the reading of its file misses (one in an extension in another file, or declared some way the pattern
    # doesn't match) still runs: in a pull request, in its class's job, which runs the class less the others' tests;
    # in the full run, in REST, which skips only what the others name.
    hidden = light[0]
    globals()['tests_of'] = lambda c, real=tests_of: [t for t in real(c) if not (c == 'LightFlowTests' and t == hidden)]
    got, skip = runs([f'apps/ios/{UI}/LightFlowTests.swift']), skips([f'apps/ios/{UI}/LightFlowTests.swift'])
    assert not any(t.endswith('/' + hidden) for ts in list(got.values()) + list(skip.values()) for t in ts), (got, skip)
    assert any('LightFlowTests' in ts for ts in got.values()), got
    names = runs_once(jobs_of(*full()))
    assert f'LightFlowTests/{hidden}' not in names and any(n.startswith('LightFlowTests/') for n in names), names
    # And a class the reading of the files misses runs in REST in the full run: it skips no class it isn't told to.
    globals()['classes'] = lambda real=classes: [c for c in real() if c != 'WholePhotoFlowTests']
    everything = jobs_of(*full())
    assert 'WholePhotoFlowTests' not in everything[REST] and 'WholePhotoFlowTests' not in ' '.join(everything.values())

    # With the code it checks: its class and the page shots run; the other classes it reaches are left to main.
    # The page shots in `handbook (1)` first, whose step uploads them; then the smoke set (315 s) beside them, and the
    # facts card's class (280 s), which no longer fits there, in `app (1)`.
    paths = [f + 'Page/Card.swift', f'apps/ios/{UI}/FactsCardFlowTests.swift']
    assert runs(paths) == {'handbook_1': ['PageShotsFlowTests'] + [t for t in SMOKE if not t.startswith('FactsCard')],
                           'app_1': ['FactsCardFlowTests']}, runs(paths)
    assert left(paths) == 'NativePageFlowTests', left(paths)
    # What it leaves to main: the classes of the flows it reaches that it doesn't run, a smoke test's class among them
    # (TanksFlowTests), but not a flow the smoke set runs (the tank-mates check's).
    assert left([f + 'Tank/Form.swift']) == 'TankLifeFlowTests TanksFlowTests', left([f + 'Tank/Form.swift'])
    assert left([f + 'Page/List.swift']) == 'NativePageFlowTests OfflineFlowTests'
    assert left([f + 'Light/Radio.swift']) == 'LightFlowTests'

if __name__ == '__main__':
    if sys.argv[1:] == ['--test']:
        test()
    elif sys.argv[1:] in (['--full'], ['--full', '--own-mac']):
        print(output(*full(own_mac='--own-mac' in sys.argv)))
    else:
        paths = [l.strip() for l in sys.stdin if l.strip()]
        jobs, left = pick(paths)
        print(output(*jobs, left))
        print(f'perf={str(perf(paths)).lower()}')
