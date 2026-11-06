#!/usr/bin/env python3
"""Which simulator flows each flow job of ios.yml runs (`app`, `handbook` and `lights`, in two halves each), as
xcodebuild's -only-testing and -skip-testing arguments.

`--full`: every flow, as main runs them (after merges, nightly and by hand) and a pull request labelled `ios-full`.
Otherwise the changed paths of a pull request come on stdin, one a line. A pull request runs:
- the smoke set (SMOKE, a few flows across the app's main journeys, in `app (1)`), when its change can reach any flow;
- the whole class of each flow file it changes, in that class's job, so a check added or changed is seen to pass;
- the page shots (PageShotsFlowTests, in `handbook (1)`), when its change can reach the pages, for their before and
  after (docs/governance.md, Mobile apps rule 6);
- every flow, when it changes what selects and runs the flows, or the flows' shared code (MACHINERY).
The lists it reads (flow_lists.py: which job runs a class, and what each path can reach) aren't among them: a change to
them alone runs no flow, and `--test` checks them on every run. The other flows its change can reach (REACH) run on main
after the merge, and nightly; `left=` names their classes, for a notice. The owner's call of 2026-11-05: a pull
request's run of every flow it reached held GitHub's Macs for one to two and a half hours.

Prints `app=[halves]`, `app_1=`, `app_2=`, `handbook=[halves]`, `handbook_1=`, `handbook_2=`, `lights=[halves]`,
`lights_1=`, `lights_2=` and `left=` for $GITHUB_OUTPUT: a job's half with no arguments is left out, and a job with no
halves is skipped. `--test` checks how it picks (on stand-ins for the lists), what the lists decide for a few changes
(flow_lists.check), and that every flow named here or in the lists is in AquaTomeUITests; it prints nothing.

A pull request with no paths runs every flow. A path under apps/ios/ that no rule names reaches every flow: the smoke
set and the page shots run, and main runs the rest.
"""
import json, os, re, sys

sys.dont_write_bytecode = True  # importing the lists leaves no __pycache__ in the checkout
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from flow_lists import ALL, APP, HANDBOOK, KIT, NONE, REACH, UI, check as check_lists

TESTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', UI)

# The first half, run by `handbook (1)` with the page shots; `handbook (2)` runs the rest of HANDBOOK, so a class added
# there later runs in it. Split by their times on #400's run of 2026-11-03 (the whole job past its hour): 1,647 s here,
# 1,182 s in the rest before the tank volume flows' 605 s join it.
HANDBOOK_FIRST = ['NativePageFlowTests', 'PageShotsFlowTests', 'FactsCardFlowTests', 'ReadingFlowTests',
                  'TankCheckFlowTests']
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
# The first half of job `app` (every other flow), run by `app (1)` with a pull request's smoke set; `app (2)` runs the
# rest, so a class added later runs there. Split by their times on GitHub's Macs in #553's run of 2026-11-05 (the whole
# job stopped at its hour, about a minute a test): about 2,000 s here, 2,070 in the rest, counting the tests that run
# never reached at their class's average. Measured again with the flows' animations off (#549's run 42023734393, where
# the whole job took 58 minutes): 1,488 s here and 1,591 s in the rest, each half about 33 minutes with its build.
APP_FIRST = ['ReaderPostFlowTests', 'AccountFlowTests', 'AppIconFlowTests']
# Run elsewhere: the performance tests by job `perf`, the App Store's screenshots by app-store.yml.
ELSEWHERE = ['PerformanceTests', 'StoreShotsFlowTests']

# On every pull request that changes the app, in job `app`: one or two flows a journey, chosen by their time on GitHub's
# Macs (the median of 5 to 7 runs, 2026-11-02 to 04): 344 s together, under 6 minutes after the build.
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
    'OfflineFlowTests/testKeepsAShelfAtOnceOnWiFiListsItInOnePlaceAndLetsItGo',  # a shelf kept for offline (33 s)
]


# What selects and runs the flows, and the flows' shared code (a file of AquaTomeUITests that isn't a class's own, as
# TabBar.swift, or a helper every flow's launch goes through): a pull request that changes them runs every flow, as only
# a run of each job tries them. Not the lists (flow_lists.py says why).
MACHINERY = ['.github/workflows/ios.yml', 'apps/ios/scripts/flows-to-run.py', 'apps/ios/scripts/wait-for-simulator.sh',
             'apps/ios/scripts/retried-tests.py', 'apps/ios/scripts/shots.py']
FLOW_FILE = re.compile(f'apps/ios/{UI}/(\\w+Tests)\\.swift')


def machinery(path):
    return path in MACHINERY or (path.startswith(f'apps/ios/{UI}/') and not FLOW_FILE.fullmatch(path))


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


def full():
    rest = [c for c in HANDBOOK if c not in HANDBOOK_FIRST]
    # Job `app`'s second half skips the others' flows rather than naming its own, so a new class runs in it.
    app = halves(only(APP_FIRST),
                 ' '.join(f'-skip-testing:{UI}/{c}' for c in ELSEWHERE + ['LightFlowTests'] + HANDBOOK + APP_FIRST))
    lights_1 = only(f'LightFlowTests/{t}' for t in LIGHT_FIRST)
    lights_2 = ' '.join([f'-only-testing:{UI}/LightFlowTests'] +
                        [f'-skip-testing:{UI}/LightFlowTests/{t}' for t in LIGHT_FIRST])
    return app, halves(only(HANDBOOK_FIRST), only(rest)), halves(lights_1, lights_2)


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
    # The classes it runs whole: its own flow files', and the page shots when it can reach them.
    whole = {m.group(1) for p in paths if (m := FLOW_FILE.fullmatch(p)) and m.group(1) not in ELSEWHERE}
    if every or 'PageShotsFlowTests' in flows:
        whole.add('PageShotsFlowTests')
    # The smoke set runs in `app (1)`, beside the classes there, so it adds no build; a whole class runs in its own job,
    # the halves as main splits them.
    smoke = [t for t in SMOKE if t.split('/')[0] not in whole]
    app = [c for c in sorted(whole) if c not in HANDBOOK + ['LightFlowTests']]
    handbook = halves(only(sorted(c for c in whole if c in HANDBOOK_FIRST)),
                      only(sorted(c for c in whole if c in HANDBOOK and c not in HANDBOOK_FIRST)))
    lights = full()[2] if 'LightFlowTests' in whole else halves('', '')
    left = 'every flow' if every else ' '.join(sorted({f.split('/')[0] for f in flows
                                                       if f not in smoke and f.split('/')[0] not in whole}))
    app = halves(only([c for c in app if c in APP_FIRST] + smoke), only([c for c in app if c not in APP_FIRST]))
    return (app, handbook, lights), left


def output(app, handbook, lights, left=''):
    lines = [f'app={app["halves"]}', f'handbook={handbook["halves"]}', f'lights={lights["halves"]}', f'left={left}']
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
    named = set(HANDBOOK + HANDBOOK_FIRST + ELSEWHERE + SMOKE + ['LightFlowTests/' + t for t in LIGHT_FIRST])
    named |= {f for r in REACH.values() if isinstance(r, list) for f in r}
    for f in named:
        cls, _, t = f.partition('/')
        assert cls in classes, f'no class {cls} in {UI}'
        assert not t or re.search(rf'func {t}\(\)', source[cls]), f'no {f} in {UI}'
    assert set(HANDBOOK_FIRST) <= set(HANDBOOK)

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

    # The full suite: both halves of each, every class of `app` in one of its halves (the second skips the first's).
    everything = dict(zip(('app', 'handbook', 'lights'), full()))
    assert everything['app']['halves'] == everything['handbook']['halves'] == everything['lights']['halves'] == '[1, 2]'
    assert set(APP_FIRST) <= classes - set(HANDBOOK + ELSEWHERE + ['LightFlowTests']), APP_FIRST
    assert all(f'-skip-testing:{UI}/{c}' in everything['app']['2'] for c in APP_FIRST)
    # The lists aren't what selects the flows: a change to them alone runs none.
    assert not machinery('apps/ios/scripts/flow_lists.py')
    assert runs(['apps/ios/scripts/flow_lists.py']) == {} and left(['apps/ios/scripts/flow_lists.py']) == ''
    # What the lists decide for a few changes.
    check_lists(runs, left, reached)

    # How a pull request's flows are picked, on stand-ins for the lists, so these hold whatever the lists say: the
    # classes are real (the halves and the smoke set name them), the paths made up. Last: the stand-ins stay.
    f = APP + 'StandIn/'
    globals().update(HANDBOOK=HANDBOOK_FIRST + ['TankLifeFlowTests', 'OfflineFlowTests'], REACH={
        f + 'Start.swift': ALL, f + 'Frame/': [], f + 'Notes.md': NONE, f + 'Light/': ['LightFlowTests'],
        f + 'Tank/': ['TanksFlowTests', 'TankLifeFlowTests/testAFlowOutsideTheSmokeSet',
                      'TankCheckFlowTests/testWarnsWhenTheFishDontGoTogetherAndTheTankIsTooSmall'],
        f + 'Page/': ['NativePageFlowTests', 'OfflineFlowTests', 'PageShotsFlowTests'],
        f + 'Page/Card.swift': ['FactsCardFlowTests', 'NativePageFlowTests', 'PageShotsFlowTests']})
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
    # path under apps/ios/ no rule names.
    shots = dict(smoke, handbook_1=['PageShotsFlowTests'])
    for paths in ([f + 'Page/List.swift'], [f + 'Page/Card.swift'], [f + 'Start.swift'], [f + 'Unnamed.swift'],
                  ['apps/ios/Gemfile'], [f + 'Tank/Form.swift', f + 'Page/List.swift']):
        assert runs(paths) == shots, paths
    for paths in ([f + 'Start.swift'], [f + 'Unnamed.swift'], ['apps/ios/Gemfile']):
        assert left(paths) == 'every flow', paths
    # Nothing where no flow reaches: a rule of none, the flows run elsewhere (`perf`, app-store.yml), outside apps/ios/.
    for paths in ([f + 'Notes.md'],
                  [f'apps/ios/{UI}/StoreShotsFlowTests.swift', f'apps/ios/{UI}/PerformanceTests.swift'],
                  ['docs/governance.md', 'apps/site/src/pages/vi/index.astro', '.github/workflows/ci.yml']):
        assert runs(paths) == {} and left(paths) == '', paths
    # A flow file runs its class, in its own job's half, so a check added or changed is seen to pass; the smoke set's
    # others run in `app (1)`.
    got = runs([f'apps/ios/{UI}/TankLifeFlowTests.swift'])
    assert got == {'app_1': [t for t in SMOKE if not t.startswith('TankLife')], 'handbook_2': ['TankLifeFlowTests']}, got
    assert runs([f'apps/ios/{UI}/AccountFlowTests.swift']) == {
        'app_1': ['AccountFlowTests'] + [t for t in SMOKE if not t.startswith('Account')]}
    assert runs([f'apps/ios/{UI}/PlugFlowTests.swift']) == {'app_1': SMOKE, 'app_2': ['PlugFlowTests']}
    # A new class: in `app (2)`, as main's run puts it.
    assert runs([f'apps/ios/{UI}/AFishIDFlowTests.swift']) == {'app_1': SMOKE, 'app_2': ['AFishIDFlowTests']}
    got = runs([f'apps/ios/{UI}/LightFlowTests.swift'])
    assert got['app_1'] == [t for t in SMOKE if not t.startswith('Light')], got
    assert got['lights_1'] == ['LightFlowTests/' + t for t in LIGHT_FIRST], got
    assert pick([f'apps/ios/{UI}/LightFlowTests.swift'])[0][2]['2'] == everything['lights']['2']
    # With the code it checks: its class and the page shots run; the other classes it reaches are left to main.
    paths = [f + 'Page/Card.swift', f'apps/ios/{UI}/FactsCardFlowTests.swift']
    assert runs(paths) == {'app_1': [t for t in SMOKE if not t.startswith('FactsCard')],
                           'handbook_1': ['FactsCardFlowTests', 'PageShotsFlowTests']}, runs(paths)
    assert left(paths) == 'NativePageFlowTests', left(paths)
    # What it leaves to main: the classes of the flows it reaches that it doesn't run, a smoke test's class among them
    # (TanksFlowTests), but not a flow the smoke set runs (the tank-mates check's).
    assert left([f + 'Tank/Form.swift']) == 'TankLifeFlowTests TanksFlowTests', left([f + 'Tank/Form.swift'])
    assert left([f + 'Page/List.swift']) == 'NativePageFlowTests OfflineFlowTests'
    assert left([f + 'Light/Radio.swift']) == 'LightFlowTests'

if __name__ == '__main__':
    if sys.argv[1:] == ['--test']:
        test()
    elif sys.argv[1:] == ['--full']:
        print(output(*full()))
    else:
        jobs, left = pick([l.strip() for l in sys.stdin if l.strip()])
        print(output(*jobs, left))
