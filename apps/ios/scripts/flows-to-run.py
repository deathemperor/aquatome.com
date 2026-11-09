#!/usr/bin/env python3
"""Which simulator flows each flow job of ios.yml runs (`app`, `handbook` and `lights`, in two halves each), as
xcodebuild's -only-testing and -skip-testing arguments.

`--full`: every flow, as main runs them (after merges, nightly and by hand) and a pull request labelled `ios-full`;
`--full --own-mac` on the repository's own Mac, which runs jobs `app` and `handbook` on three simulators at once and
the light flows on one, so nothing goes beside the light flows there (WITH_LIGHTS).
Otherwise the changed paths of a pull request come on stdin, one a line. A pull request runs:
- the smoke set (SMOKE, a few flows across the app's main journeys), when its change can reach any flow;
- the whole class of each flow file it changes, so a check added or changed is seen to pass;
- the page shots of the screens its change reaches (PageShotsFlowTests, by screen in flow_lists.py's SHOTS, in
  `handbook (1)`, which uploads them), for their before and after (docs/governance.md, Mobile apps rule 6): the whole
  class when it can reach every flow or edits the class, and on main;
- every flow, when it changes what selects and runs the flows, or the flows' shared code (MACHINERY).
Those flows go into as few jobs as hold them (`pack`): each job builds the app and holds one of GitHub's five Macs. The
light flows keep their two halves.
The lists it reads (flow_lists.py: which job runs a class, and what each path can reach) aren't among them: a change to
them alone runs no flow, and `--test` checks them on every run. The other flows its change can reach (REACH) run on main
after the merge, and nightly; `left=` names their classes, for a notice. The owner's call of 2026-11-05: a pull
request's run of every flow it reached held GitHub's Macs for one to two and a half hours.

Prints `app=[halves]`, `app_1=`, `app_2=`, `handbook=[halves]`, `handbook_1=`, `handbook_2=`, `lights=[halves]`,
`lights_1=`, `lights_2=`, `left=` and `ran=` (what each job half runs, by class, for a notice) for $GITHUB_OUTPUT: a
job's half with no arguments is left out, and a job with no halves is skipped. `--test` checks how it picks (on stand-ins for the lists), what the lists decide for a few changes
(flow_lists.check), and that every flow named here or in the lists is in AquaTomeUITests; it prints nothing.

A pull request with no paths runs every flow. A path under apps/ios/ that no rule names reaches every flow: the smoke
set and the page shots run, and main runs the rest.
"""
import json, os, re, sys

sys.dont_write_bytecode = True  # importing the lists leaves no __pycache__ in the checkout
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flow_lists import ALL, APP, CLASS_SECONDS, FLOW_SECONDS, HANDBOOK, KIT, NONE, REACH, SHOT_SECONDS, SHOTS, UI, check as check_lists

TESTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', UI)

# The first half, run by `handbook (1)` with the page shots; `handbook (2)` runs the rest of HANDBOOK, so a class added
# there later runs in it. Split by their times on #677's run of 2026-11-07 (42352065312), where every job neared its
# hour and `handbook (2)`, 3,033 s of flows and about ten minutes of build and simulator, passed them all and stopped at
# it: 1,984 s here, 1,907 s in the rest, the others of HANDBOOK beside the light flows (WITH_LIGHTS). The page shots then
# grew to 57: on #758's full run of 2026-11-08 this half, NativePageFlowTests with them, ran 66 minutes of tests and
# stopped at the 75-minute limit, while #911's other half took 44 minutes. So the shots run here alone, and
# NativePageFlowTests (648 s) with the rest.
HANDBOOK_FIRST = ['PageShotsFlowTests']
# The light flows' first half, run by `lights (1)`; `lights (2)` runs the rest of LightFlowTests, so a flow added later
# runs there. Split by their times on main's run of 2026-11-01 (1,034 s and 1,017 s).
LIGHT_FIRST = [
    'testADroppedLightConnectsAgainWithoutAScan', 'testALightThatDropsMidTestIsKeptAsSetByHandUntilTheoLich',
    'testALightThatDropsWhileBeingReadCanBeConnectedAgain',
    'testASavedLightIsListedAfterARelaunchAndConnectsWithWhatWasWritten', 'testDisconnectGoesBackToFindingLights',
    'testDisconnectWhileReadingTheLightReportsNothing', 'testLeavingTheAppPutsATestColourBackOnTheScheduleWithOneFrame',
    'testOldFirmwareCannotWriteSchedules', 'testRenamesAndForgetsTheLight',
    'testSchedulesWrittenAreListedOnlyWhileTheLightIsConnected', 'testTheDayPreviewStopsAtOnceOnTheScreenAndOnTheLight',
    'testTheLightsOwnScheduleIsNeverShownAsWhatItRuns', 'testThePlanIsKeptWithoutALight',
    'testTheWriteBarStaysInViewAndSaysWhatWillBeWritten', 'testWritesAPresetThenAnotherThenUndoesBackToTheFirst',
    'testWritingAScheduleEndsTheManualLevels']
# The first half of job `app` (every other flow) on main's runs, by `app (1)`; `app (2)` runs the
# rest, so a class added later runs there. Split by their times on GitHub's Macs in #553's run of 2026-11-05 (the whole
# job stopped at its hour, about a minute a test): about 2,000 s here, 2,070 in the rest, counting the tests that run
# never reached at their class's average. Measured again with the flows' animations off (#549's run 42023734393, where
# the whole job took 58 minutes): 1,488 s here and 1,591 s in the rest, each half about 33 minutes with its build.
# Then (#677's run) 1,457 s here and 2,628 s in the rest: the tanks' flows moved here, 1,872 s, and two classes beside
# the light flows (WITH_LIGHTS), 1,845 s left.
APP_FIRST = ['ReaderPostFlowTests', 'AccountFlowTests', 'AppIconFlowTests', 'TanksFlowTests']
# Classes a full run on GitHub's Macs puts beside each half of the light flows (832 s and 1,114 s in #677's run), out of
# the others' jobs: about 1,900 s of flows in each of the six, 40 to 52 minutes a job with its build (#746's run on GitHub's Macs). A pull request's
# light flows run without them, and so does the own Mac's full run: its light jobs run one simulator, and its light
# flows there already take 17 and 29 minutes of tests, 1.25 to 1.5 times GitHub's (main's runs of 2026-11-07).
# Then `app (2)` reached its 75 minutes on #890's run (2026-11-08) with 3,814 s of flows, all passed (ScrollEnd 924,
# Owner 916, PhotoViewer 752, V2 571, Plug 521, ProfilePicture 129), while the light halves took 37 to 49 minutes on
# the full runs of 2026-11-07 and 08: Plug and V2 went beside them, about 2,700 s left there.
WITH_LIGHTS = {'1': ['TankVolumeFlowTests', 'TankLifeFlowTests', 'TankMatesFlowTests', 'TelemetryFlowTests', 'PlugFlowTests'],
               '2': ['FactsCardFlowTests', 'OfflineFlowTests', 'ViAtRootFlowTests', 'AppLinkFlowTests', 'V2FlowTests']}
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
# about an hour at a time. The page shots go in `handbook (1)`, whose step uploads them; then the rest, longest first,
# into the first job with room, the jobs taken in PACK_ORDER. Past four jobs' worth, the rest join the least loaded.
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


def halves(one, two):
    return {'1': one, '2': two, 'halves': json.dumps([n for n, a in ((1, one), (2, two)) if a])}


def seconds(test):
    """What a class of flows, or one flow ('Class/test'), takes on GitHub's Macs: CLASS_SECONDS, or FLOW_SECONDS a test;
    one of the smoke set's flows, SMOKE_SECONDS; a page shot, SHOT_SECONDS."""
    if '/' in test:
        return SMOKE_SECONDS if test in SMOKE else SHOT_SECONDS if test.startswith('PageShotsFlowTests/') else FLOW_SECONDS
    if test in CLASS_SECONDS:
        return CLASS_SECONDS[test]
    path = os.path.join(TESTS_DIR, f'{test}.swift')
    return FLOW_SECONDS * max(1, len(re.findall(r'func test\w*\(', open(path).read())) if os.path.exists(path) else 1)


def pack(units):
    """Units of flows (lists of tests, each unit kept in one job) into job halves: {job half: tests}."""
    jobs, load = {}, {}
    shots = [u for u in units if any(t.split('/')[0] == 'PageShotsFlowTests' for t in u)]
    rest = sorted((u for u in units if u not in shots), key=lambda u: (-sum(map(seconds, u)), u))
    for unit in shots + rest:
        secs = sum(map(seconds, unit))
        job = 'handbook_1' if unit in shots else (
            next((j for j in jobs if load[j] + secs <= PACK_SECONDS), None)
            or next((j for j in PACK_ORDER if j not in jobs), None) or min(jobs, key=load.get))
        jobs.setdefault(job, []).extend(unit)
        load[job] = load.get(job, 0) + secs
    # Classes first, then single flows (the page shots), then the smoke set's flows in their order.
    return {j: sorted(t for t in ts if '/' not in t) + sorted(t for t in ts if '/' in t and t not in SMOKE)
            + [t for t in SMOKE if t in ts] for j, ts in jobs.items()}


def lights(beside=True):
    """The light flows' halves; in a full run (`beside`), with the classes WITH_LIGHTS puts beside them."""
    lights_1 = only([f'LightFlowTests/{t}' for t in LIGHT_FIRST] + (WITH_LIGHTS['1'] if beside else []))
    lights_2 = ' '.join([f'-only-testing:{UI}/LightFlowTests'] + [f'-skip-testing:{UI}/LightFlowTests/{t}' for t in LIGHT_FIRST]
                        + ([only(WITH_LIGHTS['2'])] if beside else []))
    return halves(lights_1, lights_2)


def full(own_mac=False):
    """Every flow, in each job's halves; on the own Mac (`own_mac`), none beside the light flows."""
    beside = [] if own_mac else WITH_LIGHTS['1'] + WITH_LIGHTS['2']
    rest = [c for c in HANDBOOK if c not in HANDBOOK_FIRST + beside]
    # Job `app`'s second half skips the others' flows rather than naming its own, so a new class runs in it.
    skipped = dict.fromkeys(ELSEWHERE + ['LightFlowTests'] + HANDBOOK + APP_FIRST + beside)
    app = halves(only(APP_FIRST), ' '.join(f'-skip-testing:{UI}/{c}' for c in skipped))
    return app, halves(only(HANDBOOK_FIRST), only(rest)), lights(beside=not own_mac)


def pick(paths):
    """Each job's arguments for a pull request (app, handbook halves, lights halves), and the classes of the flows its
    change can reach that it leaves to main's run after the merge ('every flow' when it can reach them all)."""
    if not paths or any(machinery(p) for p in paths):
        return full(), ''
    reaches = [reach(p) for p in paths]
    if all(r is NONE for r in reaches):
        return (halves('', ''), halves('', ''), halves('', '')), ''
    every = ALL in reaches
    flows = {f for r in reaches if isinstance(r, list) for f in r}
    # The classes it runs whole: its own flow files', and the page shots when it can reach every flow.
    whole = {m.group(1) for p in paths if (m := FLOW_FILE.fullmatch(p)) and m.group(1) not in ELSEWHERE}
    if every or 'PageShotsFlowTests' in flows:
        whole.add('PageShotsFlowTests')
    # Else the shots of the screens it reaches, as one unit (in `handbook (1)`, which uploads them).
    shots = [] if 'PageShotsFlowTests' in whole else sorted(f for f in flows if f.startswith('PageShotsFlowTests/'))
    # The smoke set runs as one unit, and each class whole; the light flows in their halves, as main splits them.
    smoke = [t for t in SMOKE if t.split('/')[0] not in whole]
    jobs = pack([[c] for c in sorted(whole) if c != 'LightFlowTests'] + ([shots] if shots else []) + ([smoke] if smoke else []))
    lights_run = lights(beside=False) if 'LightFlowTests' in whole else halves('', '')
    left = 'every flow' if every else ' '.join(sorted({f.split('/')[0] for f in flows
                                                       if f not in smoke + shots and f.split('/')[0] not in whole}))
    app, handbook = (halves(only(jobs.get(f'{n}_1', [])), only(jobs.get(f'{n}_2', []))) for n in ('app', 'handbook'))
    return (app, handbook, lights_run), left


def described(args):
    """A job half's xcodebuild arguments, by class: its classes, the smoke set's flows, other single flows."""
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
    ran = '; '.join(f'{name} ({n}): {described(job[n])}' for name, job in (('app', app), ('handbook', handbook),
                                                                           ('lights', lights)) for n in '12' if job[n])
    lines = [f'app={app["halves"]}', f'handbook={handbook["halves"]}', f'lights={lights["halves"]}', f'left={left}',
             f'ran={ran}']
    for name, job in (('app', app), ('handbook', handbook), ('lights', lights)):
        lines += [f'{name}_{n}={job[n]}' for n in '12']
    return '\n'.join(lines)


def test():
    # Every flow file declares the class it's named for, and every flow named here or in the lists is a test in
    # AquaTomeUITests: a renamed one fails here, not silently on CI.
    source = {os.path.basename(f)[:-6]: open(os.path.join(TESTS_DIR, f)).read()
              for f in os.listdir(TESTS_DIR) if f.endswith('.swift')}
    for name, text in source.items():
        assert not name.endswith('Tests') or re.search(rf'class {name}\b', text), f'{name}.swift has no class {name}'
    classes = {c for s in source.values() for c in re.findall(r'class (\w+): XCTestCase', s)}
    named = set(HANDBOOK + HANDBOOK_FIRST + APP_FIRST + WITH_LIGHTS['1'] + WITH_LIGHTS['2'] + ELSEWHERE + SMOKE
                + ['LightFlowTests/' + t for t in LIGHT_FIRST])
    named |= {f for r in REACH.values() if isinstance(r, list) for f in r}
    for f in named:
        cls, _, t = f.partition('/')
        assert cls in classes, f'no class {cls} in {UI}'
        assert not t or re.search(rf'func {t}\(\)', source[cls]), f'no {f} in {UI}'
    assert set(HANDBOOK_FIRST) <= set(HANDBOOK)
    # Every page shot has its screen in SHOTS, so a pull request that reaches the screen takes it.
    in_class, mapped = set(re.findall(r'func (test\w*)\(', source['PageShotsFlowTests'])), {t for ts in SHOTS.values() for t in ts}
    assert in_class == mapped, f'page shots with no screen in SHOTS (flow_lists.py): {sorted(in_class - mapped)}, gone: {sorted(mapped - in_class)}'

    def runs(paths):
        """What a pull request runs, as {job half: tests}, for a few changes."""
        (app, hb, lt), _ = pick(paths)
        jobs = {'app_1': app['1'], 'app_2': app['2'], 'handbook_1': hb['1'], 'handbook_2': hb['2'],
                'lights_1': lt['1'], 'lights_2': lt['2']}
        return {j: a.replace(f'-only-testing:{UI}/', '').split() for j, a in jobs.items() if a}

    def left(paths):
        return pick(paths)[1]

    def reached(paths):
        """The flows a change can reach (what main runs for it after the merge): a set, or ALL."""
        rs = [reach(p) for p in paths]
        return ALL if ALL in rs else {f for r in rs if isinstance(r, list) for f in r}

    # The full suite, on GitHub's Macs and on the own Mac: both halves of each, and every class in one job (the light
    # flows in their two halves): named by one, or left to `app (2)`, which skips the named ones and those run elsewhere.
    assert set(APP_FIRST) <= classes - set(HANDBOOK + ELSEWHERE + ['LightFlowTests']), APP_FIRST
    for own_mac in (False, True):
        everything = dict(zip(('app', 'handbook', 'lights'), full(own_mac)))
        assert everything['app']['halves'] == everything['handbook']['halves'] == everything['lights']['halves'] == '[1, 2]'
        named_in = {}
        for name, job in everything.items():
            for n in '12':
                for c in {t.split('/')[0] for t in re.findall(rf'-only-testing:{UI}/(\S+)', job[n])}:
                    named_in.setdefault(c, []).append(f'{name}_{n}')
        assert all(len(js) == 1 or c == 'LightFlowTests' for c, js in named_in.items()), named_in
        left_to_app = classes - set(named_in) - set(ELSEWHERE)
        assert left_to_app and all(f'-skip-testing:{UI}/{c}' not in everything['app']['2'] for c in left_to_app), left_to_app
        assert all(f'-skip-testing:{UI}/{c}' in everything['app']['2'] for c in list(named_in) + ELSEWHERE), everything['app']['2']
        # Beside the light flows on GitHub's Macs only.
        beside = {c for c, js in named_in.items() if any(j.startswith('lights') for j in js)} - {'LightFlowTests'}
        assert beside == (set() if own_mac else set(WITH_LIGHTS['1'] + WITH_LIGHTS['2'])), beside
    # The lists aren't what selects the flows: a change to them alone runs none.
    assert not machinery('apps/ios/scripts/flow_lists.py')
    assert runs(['apps/ios/scripts/flow_lists.py']) == {} and left(['apps/ios/scripts/flow_lists.py']) == ''
    # What the lists decide for a few changes: which flows run, in whichever job.
    check_lists(lambda paths: sorted(t for tests in runs(paths).values() for t in tests), left, reached)

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
    # classes are real (the halves and the smoke set name them), the paths made up. Last: the stand-ins stay.
    f = APP + 'StandIn/'
    globals().update(HANDBOOK=HANDBOOK_FIRST + ['TankLifeFlowTests', 'OfflineFlowTests'], FLOW_SECONDS=45, SMOKE_SECONDS=35, CLASS_SECONDS={
        'PageShotsFlowTests': 1000, 'TankLifeFlowTests': 300, 'FactsCardFlowTests': 280, 'PlugFlowTests': 1200}, REACH={
        f + 'Start.swift': ALL, f + 'Frame/': [], f + 'Notes.md': NONE, f + 'Light/': ['LightFlowTests'],
        f + 'Tank/': ['TanksFlowTests', 'TankLifeFlowTests/testAFlowOutsideTheSmokeSet',
                      'TankCheckFlowTests/testWarnsWhenTheFishDontGoTogetherAndTheTankIsTooSmall'],
        f + 'Page/': ['NativePageFlowTests', 'OfflineFlowTests', 'PageShotsFlowTests'],
        f + 'Page/Card.swift': ['FactsCardFlowTests', 'NativePageFlowTests', 'PageShotsFlowTests'],
        f + 'Shot/': ['TanksFlowTests', 'PageShotsFlowTests/testAPlant', 'PageShotsFlowTests/testAFish']})
    everything = dict(zip(('app', 'handbook', 'lights'), full()))
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
    # Nothing where no flow reaches: a rule of none, the flows run elsewhere (`perf`, app-store.yml), outside apps/ios/.
    for paths in ([f + 'Notes.md'],
                  [f'apps/ios/{UI}/StoreShotsFlowTests.swift', f'apps/ios/{UI}/PerformanceTests.swift'],
                  ['docs/governance.md', 'apps/site/src/pages/vi/index.astro', '.github/workflows/ci.yml']):
        assert runs(paths) == {} and left(paths) == '', paths
    # A flow file runs its class whole, so a check added or changed is seen to pass, packed with the smoke set's others
    # when they fit: one job.
    got = runs([f'apps/ios/{UI}/TankLifeFlowTests.swift'])
    assert got == {'app_1': ['TankLifeFlowTests'] + [t for t in SMOKE if not t.startswith('TankLife')]}, got
    # A class with no time of its own counts FLOW_SECONDS a test: AccountFlowTests' ten, with the smoke set, fit.
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
    globals()['CLASS_SECONDS'] = dict(CLASS_SECONDS, **{c: 1400 for c in many})
    got = runs([f'apps/ios/{UI}/{c}.swift' for c in many])
    assert sorted(got) == ['app_1', 'app_2', 'handbook_1', 'handbook_2'], got
    assert sorted(t for ts in got.values() for t in ts) == sorted(many + [t for t in SMOKE if t.split('/')[0] not in many])
    # Each to the least loaded: the fifth class to the first of four equal jobs, then the smoke set to the next.
    assert got['app_1'] == ['AccountFlowTests', 'TanksFlowTests'], got
    assert got['handbook_2'] == ['PhotoViewerFlowTests'] + [t for t in SMOKE if t.split('/')[0] not in many], got
    globals()['CLASS_SECONDS'] = {k: v for k, v in CLASS_SECONDS.items() if k not in many} | {'PlugFlowTests': 1200}
    # What each job half runs, by class, for the notice.
    assert output(*pick([f'apps/ios/{UI}/PlugFlowTests.swift'])[0]).splitlines()[4] == (
        'ran=app (1): PlugFlowTests; handbook (2): the smoke set (10 flows)')
    # The light flows are never packed: both halves, as main runs them, and the rest packed apart.
    got = runs([f'apps/ios/{UI}/LightFlowTests.swift'])
    assert got['app_1'] == [t for t in SMOKE if not t.startswith('Light')], got
    assert got['lights_1'] == ['LightFlowTests/' + t for t in LIGHT_FIRST], got
    # The light halves as the own Mac's full run has them.
    assert pick([f'apps/ios/{UI}/LightFlowTests.swift'])[0][2] == full(own_mac=True)[2]
    assert not any(c in pick([f'apps/ios/{UI}/LightFlowTests.swift'])[0][2][n] for n in '12' for c in WITH_LIGHTS[n])
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
