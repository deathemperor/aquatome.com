#!/usr/bin/env python3
"""Which simulator flows each flow job of ios.yml runs (`app`, and `handbook` and `lights` in two halves each), as
xcodebuild's -only-testing and -skip-testing arguments.

`--full`: every flow, as main runs them (after merges, nightly and by hand) and a pull request labelled `ios-full`.
Otherwise the changed paths of a pull request come on stdin, one a line: it runs the smoke set (SMOKE, a few flows
across the app's main journeys, in job `app`) and the flows its change can reach (REACH): a whole class in its own job,
a few of a class's tests in `app`, beside the smoke set, so they add no build. Prints `app=`,
`handbook=[halves]`, `handbook_1=`, `handbook_2=`, `lights=[halves]`, `lights_1=` and `lights_2=` for $GITHUB_OUTPUT: a
job with no arguments, or no halves, is skipped. `--test` checks the rules on a few changes, and that every flow named
here is in AquaTomeUITests; it prints nothing.

It fails closed: a path under apps/ios/ that no rule names, or a pull request with no paths, runs every flow, as does a
change to the app's start, to ios.yml or to a script the flow jobs run.
"""
import json, os, re, sys

UI = 'AquaTomeUITests'
TESTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', UI)

# The flows of the handbook and of what a tank reads from it (its fish, plants and guides, the tank-mates check), run by
# job `handbook`; job `app` runs every other flow but the lights', so a class missing here still runs, in `app`.
HANDBOOK = ['HandbookFlowTests', 'FactsCardFlowTests', 'ReadingFlowTests', 'NativePageFlowTests', 'OfflineFlowTests',
            'TankCheckFlowTests', 'TankLifeFlowTests', 'PageShotsFlowTests', 'FishIdFlowTests']
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

# What a path can reach. The longest prefix that matches a path decides: a list of flows (a class, or one of its
# tests), with the smoke set; [] for the smoke set alone; ALL for every flow; NONE for no flow (job `kit`, `perf` or
# another workflow checks it). Read from the flows (the screens and launch arguments each uses, the accessibility
# identifiers it asks for) and the app (which screens show which views, and what they read).
NONE, ALL = None, 'all'
APP, KIT = 'apps/ios/AquaTome/', 'apps/ios/AquaTomeKit/'
# Every screen of the handbook: its flows, and those that start from a page (a comment posted, a fish put on a tank).
HANDBOOK_SCREENS = ['HandbookFlowTests', 'FactsCardFlowTests', 'NativePageFlowTests', 'OfflineFlowTests',
                    'PageShotsFlowTests', 'ReadingFlowTests', 'ReaderPostFlowTests', 'TankLifeFlowTests', 'FishIdFlowTests']
# The handbook's model and the kit's Handbook: its screens, and the tanks tab's parts that read it (the tank-mates check,
# a tank's fish and plants, its guides).
HANDBOOK_MODEL = HANDBOOK_SCREENS + ['TankCheckFlowTests', 'TanksFlowTests/testListsATanksFishAndPlantsAndOpensTheirPages']
# A page open (PageView), or drawn by the app (NativePage): the flows that open one.
PAGES = ['NativePageFlowTests', 'PageShotsFlowTests', 'FactsCardFlowTests', 'ReaderPostFlowTests', 'ReadingFlowTests',
         'TankLifeFlowTests', 'HandbookFlowTests/testAPageOpensInTheApp',
         'TanksFlowTests/testListsATanksFishAndPlantsAndOpensTheirPages']
# The app's icon picker: its flows, and its screenshots (the whole class, run by `handbook (1)`, which keeps them).
ICONS = ['AppIconFlowTests', 'PageShotsFlowTests']
# The light flows of the outlet a light is plugged into, on the stand-in Tuya cloud: its timers read, the pick taken
# back, a light said not to be on one, and a timer told in the plug's zone on a phone in another.
LIGHT_OUTLET = ['LightFlowTests/' + t for t in (
    'testWarnsWhenTheLightsOutletHasATimerThatCutsItsPower', 'testTakingTheOutletBackAsksAgainAndDropsTheWarning',
    'testALightNotOnASmartPlugIsAskedNoMoreOnThisPhone', 'testAnOutletsTimerInAnotherZoneSaysWhose')]
# The light flows that start from a tank or keep a light on one (the outlet it's plugged into, too).
LIGHTS_ON_TANKS = ['LightFlowTests/' + t for t in (
    'testKeepsTheLightAndWhatWasWrittenOnATank', 'testALightOnATankOpensOnTheLightsTabAndConnects',
    'testALightOnATankOpensTheConnectedLightAsItIs',
    'testASavedLightIsListedAfterARelaunchAndConnectsWithWhatWasWritten')] + LIGHT_OUTLET
REACH = {
    # The app's start (it routes a page's links to the tabs, wires a tank's wanted names and pages, sends the lights back
    # to their schedule when the app leaves, syncs the account), and what selects and runs the flows: every flow, as
    # a change to them is otherwise untried until main.
    APP + 'AquaTomeApp.swift': ALL, '.github/workflows/ios.yml': ALL, 'apps/ios/scripts/flows-to-run.py': ALL,
    'apps/ios/scripts/wait-for-simulator.sh': ALL, 'apps/ios/scripts/retried-tests.py': ALL,
    'apps/ios/scripts/shots.py': ALL,
    # What every screen sits in, or builds the app and its flows: the smoke set.
    APP + 'OwnCopy.swift': [], APP + 'Assets.xcassets/': [], 'apps/ios/AquaTome.xcodeproj/': [], 'apps/ios/Config/': [],
    # The icons a reader chooses: the picker, the icon sets and their previews (app-icons.py writes them).
    APP + 'AppIcon/': ICONS, APP + 'Assets.xcassets/AppIcon': ICONS, 'apps/ios/scripts/app-icons.py': NONE,
    KIT + 'Package.swift': [], f'apps/ios/{UI}/': [],
    # The Bluetooth module is built into the app, but the simulator has none: FakeRadio stands in for it in every flow.
    KIT + 'Sources/ChihirosBLE/': [],
    # The flows read the Vietnamese, which is in the code; these two read the catalog's Indonesian. The catalog is
    # checked by check-strings.py (`perf`), as are Info.plist's strings, which no flow reads.
    APP + 'Localizable.xcstrings': ['LightFlowTests/testTheWriteBarKeepsItsTimesWholeBesideALongerButton',
                                    'HandbookFlowTests/testAVideosLengthReadsAsTheSiteWritesItInIndonesianToo'],
    APP + 'InfoPlist.xcstrings': NONE, APP + 'PrivacyInfo.xcprivacy': NONE,
    APP + 'Handbook/': HANDBOOK_SCREENS,
    APP + 'Handbook/HandbookModel.swift': HANDBOOK_MODEL,
    APP + 'Handbook/PageView.swift': PAGES,
    # Its pictures are kept for offline too (PageImages).
    APP + 'Handbook/NativePage.swift': PAGES + ['OfflineFlowTests'],
    APP + 'Handbook/FactsCard.swift': ['FactsCardFlowTests', 'NativePageFlowTests', 'PageShotsFlowTests'],
    APP + 'Handbook/KeepOffline.swift': ['OfflineFlowTests'],
    APP + 'Handbook/ReaderPost.swift': ['ReaderPostFlowTests'],
    APP + 'Handbook/ReaderSafety.swift': ['ReaderPostFlowTests', 'NativePageFlowTests'],
    # The tanks tab: a tank's own flows, its account and plugs sections, a page's links and the handbook's tools that
    # open it, the posters blocked from it, and the lights kept on a tank.
    APP + 'Tanks/': ['TanksFlowTests', 'TankLifeFlowTests', 'TankCheckFlowTests', 'AccountFlowTests', 'PlugFlowTests',
                     'NativePageFlowTests/testALinkFromTheTanksTabOpensOnTheTanksTab',
                     'NativePageFlowTests/testAGroupFromTheTanksTabOpensOnTheTanksTab',
                     'NativePageFlowTests/testAToolItNamesOpensItsTab', 'HandbookFlowTests/testFiltersTheFishToMyTank',
                     'HandbookFlowTests/testFiltersThePlantsToTheTanksLight',
                     'ReaderPostFlowTests/testABlockedPosterIsListedInTheTanksTab'] + LIGHTS_ON_TANKS,
    APP + 'Tanks/TankCheckView.swift': ['TankCheckFlowTests',
                                        'TankLifeFlowTests/testAddsAFishWithoutAPageByNameSendsItOnceAndKeepsItAfterARelaunch'],
    APP + 'Tanks/TankGuides.swift': ['TankLifeFlowTests', 'NativePageFlowTests/testALinkFromTheTanksTabOpensOnTheTanksTab',
                                     'NativePageFlowTests/testAGroupFromTheTanksTabOpensOnTheTanksTab'],
    APP + 'Tanks/TankLife.swift': ['TankLifeFlowTests', 'TankCheckFlowTests', 'TanksFlowTests', 'NativePageFlowTests'],
    APP + 'Tanks/TankForm.swift': ['TanksFlowTests', 'TankLifeFlowTests', 'PlugFlowTests', 'AccountFlowTests'],
    APP + 'Tanks/CappedField.swift': ['TanksFlowTests', 'TankLifeFlowTests', 'PlugFlowTests', 'AccountFlowTests'],
    APP + 'Lights/': ['LightFlowTests'],
    # The light's card, which the page shots also take (with its outlet's warning), for a change's before and after.
    APP + 'Lights/LightsView.swift': ['LightFlowTests', 'PageShotsFlowTests'],
    APP + 'Lights/LightOutlet.swift': ['LightFlowTests', 'PageShotsFlowTests'],
    APP + 'Plugs/': ['PlugFlowTests'] + LIGHT_OUTLET,
    # Fish ID sends as the reader's account (signed out, its sign-in comes first).
    APP + 'Account/': ['AccountFlowTests', 'ReaderPostFlowTests', 'FishIdFlowTests'],
    # The stand-in server also takes the names readers want pages for (a fish put on a tank by name).
    APP + 'Account/FakeServer.swift': ['AccountFlowTests', 'ReaderPostFlowTests', 'TankLifeFlowTests', 'FishIdFlowTests'],
    KIT + 'Sources/Handbook/': HANDBOOK_MODEL,
    KIT + 'Sources/TankCheck/': ['TankCheckFlowTests', 'TankLifeFlowTests'],
    # Also the fish filtered to a tank (ShelfFilter reads its size).
    KIT + 'Sources/Tanks/': ['TanksFlowTests', 'TankLifeFlowTests', 'TankCheckFlowTests', 'AccountFlowTests',
                             'PlugFlowTests', 'HandbookFlowTests/testFiltersTheFishToMyTank'] + LIGHTS_ON_TANKS,
    KIT + 'Sources/AccountSync/': ['AccountFlowTests', 'ReaderPostFlowTests', 'TankLifeFlowTests', 'FishIdFlowTests'],
    KIT + 'Sources/Plugs/': ['PlugFlowTests'] + LIGHT_OUTLET,
    KIT + 'Sources/Chihiros/': ['LightFlowTests'],
    # A Mac command line, not in the app: job `kit` builds it.
    KIT + 'Sources/light-harness/': NONE,
    KIT + 'Tests/': NONE, 'protocols/': NONE, 'apps/ios/README.md': NONE, 'apps/ios/.gitignore': NONE,
    'apps/ios/perf-budgets.json': NONE, 'apps/ios/scripts/check-perf.py': NONE,
    # Run by job `perf`, which runs on every ready pull request.
    'apps/ios/scripts/check-strings.py': NONE,
    'apps/ios/scripts/asc-build-state.mjs': NONE, 'apps/ios/scripts/testflight-notes.py': NONE,
    # The App Store's screenshots and listing (app-store.yml).
    'apps/ios/store/': NONE, 'apps/ios/scripts/asc-listing.mjs': NONE, 'apps/ios/scripts/store-shots.py': NONE,
}


def reach(path):
    """The flows `path` can reach (a list), NONE, or ALL (also when no rule names it)."""
    flow = re.fullmatch(f'apps/ios/{UI}/(\\w+Tests)\\.swift', path)
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
    # Job `app` skips the others' flows rather than naming its own, so a new class runs in it.
    app = ' '.join(f'-skip-testing:{UI}/{c}' for c in ELSEWHERE + ['LightFlowTests'] + HANDBOOK)
    lights_1 = only(f'LightFlowTests/{t}' for t in LIGHT_FIRST)
    lights_2 = ' '.join([f'-only-testing:{UI}/LightFlowTests'] +
                        [f'-skip-testing:{UI}/LightFlowTests/{t}' for t in LIGHT_FIRST])
    return app, halves(only(HANDBOOK_FIRST), only(rest)), halves(lights_1, lights_2)


def pick(paths):
    """Each job's arguments for a pull request: (app, handbook halves, lights halves)."""
    flows, app_changed = set(), False
    for p in paths:
        r = reach(p)
        if r == ALL:
            return full()
        if r is not NONE:
            flows |= set(r)
            app_changed = True
    if not paths:
        return full()
    # A test is left out when its whole class runs. The smoke set and the other single tests run in `app`, so they add
    # no build; a whole class runs in its own job, the halves as main splits them.
    whole = {f for f in flows if '/' not in f}
    tests = [f for f in sorted(flows) if '/' in f and f.split('/')[0] not in whole]
    smoke = [t for t in SMOKE if app_changed and t.split('/')[0] not in whole and t not in tests]
    app = sorted(c for c in whole if c not in HANDBOOK + ['LightFlowTests']) + tests
    handbook = halves(only(sorted(c for c in whole if c in HANDBOOK_FIRST)),
                      only(sorted(c for c in whole if c in HANDBOOK and c not in HANDBOOK_FIRST)))
    lights = full()[2] if 'LightFlowTests' in whole else halves('', '')
    return only(app + smoke), handbook, lights


def output(app, handbook, lights):
    lines = [f'app={app}', f'handbook={handbook["halves"]}', f'lights={lights["halves"]}']
    for name, job in (('handbook', handbook), ('lights', lights)):
        lines += [f'{name}_{n}={job[n]}' for n in '12']
    return '\n'.join(lines)


def test():
    # Every flow file declares the class it's named for, and every flow named here is a test in AquaTomeUITests: a
    # renamed one fails here, not silently on CI.
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
        """What runs, as {job: tests}, for a few changes."""
        app, hb, lt = pick(paths)
        jobs = {'app': app, 'handbook_1': hb['1'], 'handbook_2': hb['2'], 'lights_1': lt['1'], 'lights_2': lt['2']}
        return {j: a.replace(f'-only-testing:{UI}/', '').split() for j, a in jobs.items() if a}

    everything = dict(zip(('app', 'handbook', 'lights'), full()))
    is_full = lambda paths: pick(paths) == tuple(everything.values())
    nothing = {}
    # The app's start, and what selects and runs the flows: every flow.
    for paths in ([APP + 'AquaTomeApp.swift'], ['.github/workflows/ios.yml'], ['apps/ios/scripts/flows-to-run.py'],
                  ['apps/ios/scripts/wait-for-simulator.sh'], ['apps/ios/scripts/retried-tests.py'],
                  ['apps/ios/scripts/shots.py'], ['apps/ios/README.md', '.github/workflows/ios.yml']):
        assert is_full(paths), paths
    # What every screen sits in, or builds the app and its flows: the smoke set alone, in `app` (one build).
    smoke = runs(['apps/ios/AquaTome.xcodeproj/project.pbxproj'])
    assert smoke == {'app': SMOKE}, smoke
    for paths in ([f'apps/ios/{UI}/TabBar.swift'], [f'apps/ios/{UI}/FlowHelpers.swift'], [APP + 'OwnCopy.swift'],
                  ['apps/ios/Config/Base.xcconfig'], [KIT + 'Sources/ChihirosBLE/Bluetooth.swift']):
        assert runs(paths) == smoke, paths
    for paths in (['protocols/tanks-vectors.json', 'apps/ios/perf-budgets.json', APP + 'InfoPlist.xcstrings',
                   KIT + 'Tests/TanksTests/StoreTests.swift', 'apps/ios/scripts/testflight-notes.py',
                   'apps/ios/scripts/check-strings.py', 'apps/ios/scripts/check-perf.py',
                   KIT + 'Sources/light-harness/main.swift', 'apps/ios/README.md'],
                  # The App Store's screenshots and listing (app-store.yml): no flow job runs or reads them.
                  [f'apps/ios/{UI}/StoreShotsFlowTests.swift', 'apps/ios/store/listing.json',
                   'apps/ios/scripts/asc-listing.mjs', 'apps/ios/scripts/store-shots.py'],
                  [f'apps/ios/{UI}/PerformanceTests.swift'],
                  ['docs/governance.md', 'apps/site/src/pages/vi/index.astro', '.github/workflows/ci.yml']):
        assert runs(paths) == nothing, paths
    # The catalog: the two flows that read its Indonesian, in `app` with the smoke set (no build of their own).
    got = runs([APP + 'Localizable.xcstrings'])
    assert got == {'app': ['HandbookFlowTests/testAVideosLengthReadsAsTheSiteWritesItInIndonesianToo',
                           'LightFlowTests/testTheWriteBarKeepsItsTimesWholeBesideALongerButton'] + SMOKE}, got
    # A flow file runs its class, in its own job; the smoke set's others run in `app`.
    got = runs([f'apps/ios/{UI}/TankLifeFlowTests.swift'])
    assert got == {'app': [t for t in SMOKE if not t.startswith('TankLife')], 'handbook_2': ['TankLifeFlowTests']}, got
    got = runs([f'apps/ios/{UI}/PlugFlowTests.swift'])
    assert got == {'app': ['PlugFlowTests'] + SMOKE}, got
    got = runs([f'apps/ios/{UI}/AFishIDFlowTests.swift'])  # a new class: in `app`
    assert got == {'app': ['AFishIDFlowTests'] + SMOKE}, got
    # The lights: both halves as main splits them, and the smoke set's light flow among them, not in `app`.
    got = runs([APP + 'Lights/Radio.swift'])
    assert got['app'] == [t for t in SMOKE if not t.startswith('Light')], got
    assert got['lights_1'] == ['LightFlowTests/' + t for t in LIGHT_FIRST], got
    assert pick([APP + 'Lights/Radio.swift'])[2]['2'] == everything['lights']['2']
    assert runs([KIT + 'Sources/Chihiros/Frames.swift']) == got
    # The light's card: its flows, and the page shots (which take it) in the handbook's first half.
    for card in ('LightsView.swift', 'LightOutlet.swift'):
        assert runs([APP + 'Lights/' + card]) == dict(got, handbook_1=['PageShotsFlowTests']), card
    # The handbook's screens: its halves as main splits them, and the flows from a page in `app`.
    got = runs([APP + 'Handbook/HomeList.swift'])
    assert got['handbook_1'] == sorted(set(HANDBOOK_FIRST) - {'TankCheckFlowTests'}), got
    assert got['handbook_2'] == ['FishIdFlowTests', 'HandbookFlowTests', 'OfflineFlowTests', 'TankLifeFlowTests'], got
    assert got['app'][0] == 'ReaderPostFlowTests' and 'lights_1' not in got, got
    # The handbook's model: as the kit's Handbook, the tank-mates check and a tank's fish and plants too.
    got = runs([APP + 'Handbook/HandbookModel.swift'])
    assert got == runs([KIT + 'Sources/Handbook/Handbook.swift']), got
    assert got['handbook_1'] == sorted(HANDBOOK_FIRST), got
    assert 'TanksFlowTests/testListsATanksFishAndPlantsAndOpensTheirPages' in got['app'], got
    got = runs([APP + 'Handbook/NativePage.swift'])
    assert got['handbook_2'] == ['OfflineFlowTests', 'TankLifeFlowTests'], got
    assert 'HandbookFlowTests/testAPageOpensInTheApp' in got['app'], got
    got = runs([APP + 'Handbook/KeepOffline.swift'])
    assert got['handbook_2'] == ['OfflineFlowTests'] and 'handbook_1' not in got, got
    # The tanks tab's parts: each with the flows that ask for what it shows.
    got = runs([APP + 'Tanks/TankGuides.swift'])
    assert got['handbook_2'] == ['TankLifeFlowTests'], got
    assert {'NativePageFlowTests/testALinkFromTheTanksTabOpensOnTheTanksTab',
            'NativePageFlowTests/testAGroupFromTheTanksTabOpensOnTheTanksTab'} <= set(got['app']), got
    got = runs([APP + 'Tanks/TankCheckView.swift'])
    assert got['handbook_1'] == ['TankCheckFlowTests'], got
    assert 'TankLifeFlowTests/testAddsAFishWithoutAPageByNameSendsItOnceAndKeepsItAfterARelaunch' in got['app'], got
    assert 'AccountFlowTests' in runs([APP + 'Tanks/CappedField.swift'])['app']
    # The kit's tanks: the fish filtered to a tank and the lights kept on one, single tests in `app`.
    got = runs([KIT + 'Sources/Tanks/TankStore.swift'])
    assert 'HandbookFlowTests/testFiltersTheFishToMyTank' in got['app'], got
    assert set(LIGHTS_ON_TANKS) <= set(got['app']) and 'lights_1' not in got, got
    # A test is left out when its whole class runs too.
    got = runs([KIT + 'Sources/Tanks/TankStore.swift', APP + 'Lights/Radio.swift'])
    assert got['lights_1'] == ['LightFlowTests/' + t for t in LIGHT_FIRST], got
    assert not any(t.startswith('LightFlowTests/') for t in got['app']), got
    # The tanks tab: its own classes in `app`, the others' few tests beside them.
    got = runs([APP + 'Tanks/TanksView.swift'])
    assert 'TanksFlowTests' in got['app'] and set(LIGHTS_ON_TANKS) <= set(got['app']), got
    assert 'TanksFlowTests/testAddsATankWithItsSize' not in got['app'] and 'lights_1' not in got, got
    # Fails closed: a path under apps/ios/ no rule names, or no path at all, runs every flow.
    for paths in ([APP + 'FishID/FishIDView.swift'], [APP + 'Telemetry.swift'], [KIT + 'Sources/FishID/Model.swift'],
                  ['apps/ios/Gemfile'], [], [APP + 'Handbook/HomeList.swift', APP + 'FishID/FishIDView.swift']):
        assert is_full(paths), paths
    # A new file in a folder that has a rule takes that folder's flows: the plugs', and the light's outlet's.
    assert runs([KIT + 'Sources/Plugs/NewSource.swift']) == {'app': ['PlugFlowTests'] + sorted(LIGHT_OUTLET) + SMOKE}
    assert runs([APP + 'Plugs/PlugsModel.swift']) == runs([KIT + 'Sources/Plugs/NewSource.swift'])
    # Fish ID: its screen is the handbook's, and it sends as the reader's account.
    for p in (APP + 'Handbook/FishIdView.swift', KIT + 'Sources/Handbook/FishId.swift', APP + 'Account/AccountModel.swift',
              KIT + 'Sources/AccountSync/Accounts.swift'):
        assert 'FishIdFlowTests' in runs([p]).get('handbook_2', []), p
    # The full suite: both halves of each.
    assert everything['handbook']['halves'] == everything['lights']['halves'] == '[1, 2]'


if __name__ == '__main__':
    if sys.argv[1:] == ['--test']:
        test()
    elif sys.argv[1:] == ['--full']:
        print(output(*full()))
    else:
        print(output(*pick([l.strip() for l in sys.stdin if l.strip()])))
