"""The lists flows-to-run.py reads: which job runs a class of flows (HANDBOOK), and what a path can reach (REACH).

A pull request that changes only this file runs no flow: these lists decide which flows a pull request that reaches
these paths runs and leaves to main (main runs every flow, HANDBOOK deciding only which job runs a class), and
`flows-to-run.py --test` checks them on every run of ios.yml, a draft's too. How the jobs' halves are cut and the smoke set are in flows-to-run.py, whose change runs every flow.
`check` holds what the lists decide for a few changes; flows-to-run.py's own checks of how it picks use stand-ins.
"""

UI = 'AquaTomeUITests'

# The flows of the handbook and of what a tank reads from it (its fish, plants and guides, the tank-mates check), run by
# job `handbook`; job `app` runs every other flow but the lights', so a class missing here still runs, in `app`.
HANDBOOK = ['HandbookFlowTests', 'FactsCardFlowTests', 'ReadingFlowTests', 'NativePageFlowTests', 'OfflineFlowTests',
            'TankCheckFlowTests', 'TankLifeFlowTests', 'PageShotsFlowTests', 'FishIdFlowTests', 'TankVolumeFlowTests',
            'VideoFlowTests',
            'TelemetryFlowTests']

# What a class of flows takes on GitHub's Macs, in seconds, for packing a pull request's few flows into one job
# (flows-to-run.py): the sum of each test's median in the logs of 2026-11-06's runs, the flows' animations off. A class
# not named here counts FLOW_SECONDS a test; light flows are never packed (their halves already fill a job each).
CLASS_SECONDS = {'FactsCardFlowTests': 280, 'FishIdFlowTests': 486, 'HandbookFlowTests': 632,
                 'NativePageFlowTests': 648, 'OfflineFlowTests': 225, 'PageShotsFlowTests': 1073, 'PlugFlowTests': 744,
                 'ReadingFlowTests': 69, 'TankCheckFlowTests': 67, 'TankLifeFlowTests': 280, 'TelemetryFlowTests': 136,
                 'VideoFlowTests': 330}
FLOW_SECONDS = 45

# What a path can reach. The longest prefix that matches a path decides: a list of flows (a class, or one of its
# tests), with the smoke set; [] for the smoke set alone; ALL for every flow; NONE for no flow (job `kit`, `perf` or
# another workflow checks it). Read from the flows (the screens and launch arguments each uses, the accessibility
# identifiers it asks for) and the app (which screens show which views, and what they read).
NONE, ALL = None, 'all'
APP, KIT = 'apps/ios/AquaTome/', 'apps/ios/AquaTomeKit/'
# Every screen of the handbook: its flows, and those that start from a page (a comment posted, a fish put on a tank).
HANDBOOK_SCREENS = ['HandbookFlowTests', 'FactsCardFlowTests', 'NativePageFlowTests', 'OfflineFlowTests',
                    'PageShotsFlowTests', 'ReadingFlowTests', 'ReaderPostFlowTests', 'TankLifeFlowTests', 'FishIdFlowTests', 'VideoFlowTests']
# The handbook's model and the kit's Handbook: its screens, the tanks tab's parts that read it (the tank-mates check,
# a tank's fish and plants, its guides), and the tank volume tool, which search and a page's links open (AppScreen).
# Also the anonymous statistics, which wait for the index's flag.
HANDBOOK_MODEL = HANDBOOK_SCREENS + ['TankCheckFlowTests', 'TanksFlowTests/testListsATanksFishAndPlantsAndOpensTheirPages',
                                     'TankVolumeFlowTests', 'TelemetryFlowTests']
# A page open (PageView), or drawn by the app (NativePage): the flows that open one.
PAGES = ['NativePageFlowTests', 'PageShotsFlowTests', 'FactsCardFlowTests', 'ReaderPostFlowTests', 'ReadingFlowTests',
         'TankLifeFlowTests', 'HandbookFlowTests/testAPageOpensInTheApp',
         'TanksFlowTests/testListsATanksFishAndPlantsAndOpensTheirPages', 'VideoFlowTests', 'TelemetryFlowTests']
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
CONNECT_SENT = 'TelemetryFlowTests/testConnectingTheLightIsSentWithoutTheLightsNameOrTheAccount'
# The tanks tab: a tank's own flows, its account and plugs sections, a page's links and the handbook's tools that open it,
# the posters blocked from it, and the lights kept on a tank.
TANKS_TAB = ['TanksFlowTests', 'TankLifeFlowTests', 'TankCheckFlowTests', 'AccountFlowTests', 'PlugFlowTests',
             'NativePageFlowTests/testALinkFromTheTanksTabOpensOnTheTanksTab',
             'NativePageFlowTests/testAGroupFromTheTanksTabOpensOnTheTanksTab',
             'NativePageFlowTests/testAToolItNamesOpensItsTab', 'HandbookFlowTests/testFiltersTheFishToMyTank',
             'HandbookFlowTests/testFiltersThePlantsToTheTanksLight',
             'ReaderPostFlowTests/testABlockedPosterIsListedInTheTanksTab', 'TankVolumeFlowTests',
             'TelemetryFlowTests'] + LIGHTS_ON_TANKS
REACH = {
    # The app's start (it routes a page's links to the tabs, wires a tank's wanted names and pages, sends the lights back
    # to their schedule when the app leaves, syncs the account), and what selects and runs the flows: every flow, as
    # a change to them is otherwise untried until main.
    APP + 'AquaTomeApp.swift': ALL, '.github/workflows/ios.yml': ALL, 'apps/ios/scripts/flows-to-run.py': ALL,
    'apps/ios/scripts/wait-for-simulator.sh': ALL, 'apps/ios/scripts/retried-tests.py': ALL,
    'apps/ios/scripts/shots.py': ALL,
    # These lists: they decide what a pull request runs, not what the app does (main runs every flow), and
    # `flows-to-run.py --test` checks them on every run of ios.yml.
    'apps/ios/scripts/flow_lists.py': NONE,
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
    APP + 'Handbook/TankVolumeView.swift': ['TankVolumeFlowTests'],
    APP + 'Handbook/ReaderSafety.swift': ['ReaderPostFlowTests', 'NativePageFlowTests'],
    APP + 'Tanks/': TANKS_TAB,
    # It shows the owner's dashboard's row, and opens it.
    APP + 'Tanks/TanksView.swift': TANKS_TAB + ['OwnerFlowTests'],
    APP + 'Tanks/TankCheckView.swift': ['TankCheckFlowTests',
                                        'TankLifeFlowTests/testAddsAFishWithoutAPageByNameSendsItOnceAndKeepsItAfterARelaunch'],
    APP + 'Tanks/TankGuides.swift': ['TankLifeFlowTests', 'NativePageFlowTests/testALinkFromTheTanksTabOpensOnTheTanksTab',
                                     'NativePageFlowTests/testAGroupFromTheTanksTabOpensOnTheTanksTab'],
    APP + 'Tanks/TankLife.swift': ['TankLifeFlowTests', 'TankCheckFlowTests', 'TanksFlowTests', 'NativePageFlowTests'],
    APP + 'Tanks/TankForm.swift': ['TanksFlowTests', 'TankLifeFlowTests', 'PlugFlowTests', 'AccountFlowTests'],
    APP + 'Tanks/CappedField.swift': ['TanksFlowTests', 'TankLifeFlowTests', 'PlugFlowTests', 'AccountFlowTests'],
    # The anonymous statistics: their own flows; and a light connected is one of the events sent.
    APP + 'Telemetry/': ['TelemetryFlowTests'], KIT + 'Sources/Telemetry/': ['TelemetryFlowTests'],
    APP + 'Lights/': ['LightFlowTests', CONNECT_SENT],
    # The light's card, which the page shots also take (with its outlet's warning), for a change's before and after.
    APP + 'Lights/LightsView.swift': ['LightFlowTests', CONNECT_SENT, 'PageShotsFlowTests'],
    APP + 'Lights/LightOutlet.swift': ['LightFlowTests', CONNECT_SENT, 'PageShotsFlowTests'],
    APP + 'Plugs/': ['PlugFlowTests'] + LIGHT_OUTLET,
    # Fish ID sends as the reader's account (signed out, its sign-in comes first); the account also holds the owner's
    # dashboard (its session, and signing out on a 401).
    APP + 'Account/': ['AccountFlowTests', 'ReaderPostFlowTests', 'FishIdFlowTests', 'OwnerFlowTests'],
    # The stand-in server also takes the names readers want pages for (a fish put on a tank by name), and serves the
    # owner's dashboard.
    APP + 'Account/FakeServer.swift': ['AccountFlowTests', 'ReaderPostFlowTests', 'TankLifeFlowTests', 'FishIdFlowTests',
                                       'OwnerFlowTests'],
    # Its page shots too: the overview and a section.
    APP + 'Owner/': ['OwnerFlowTests', 'PageShotsFlowTests'],
    KIT + 'Sources/Handbook/': HANDBOOK_MODEL,
    KIT + 'Sources/TankCheck/': ['TankCheckFlowTests', 'TankLifeFlowTests'],
    # Also the fish filtered to a tank (ShelfFilter reads its size), and the tank volume tool (Volume, VolumeForm).
    KIT + 'Sources/Tanks/': ['TanksFlowTests', 'TankLifeFlowTests', 'TankCheckFlowTests', 'AccountFlowTests',
                             'PlugFlowTests', 'HandbookFlowTests/testFiltersTheFishToMyTank',
                             'TankVolumeFlowTests'] + LIGHTS_ON_TANKS,
    KIT + 'Sources/AccountSync/': ['AccountFlowTests', 'ReaderPostFlowTests', 'TankLifeFlowTests', 'FishIdFlowTests',
                                   'OwnerFlowTests'],
    KIT + 'Sources/Plugs/': ['PlugFlowTests'] + LIGHT_OUTLET,
    KIT + 'Sources/Chihiros/': ['LightFlowTests', CONNECT_SENT],
    # A Mac command line, not in the app: the kit's step in job `perf` builds it (job `kit`, nightly).
    KIT + 'Sources/light-harness/': NONE,
    # Not in the app yet: the kit's tests (job `perf`; `kit` nightly) test it. The light's flows, once the Đèn tab
    # sends its commands.
    KIT + 'Sources/FishLamp/': NONE,
    KIT + 'Tests/': NONE, 'protocols/': NONE,
    # The owner's dashboard's flows read it: the stand-in server serves its replies.
    'protocols/owner-dashboard-vectors.json': ['OwnerFlowTests', 'PageShotsFlowTests'], 'apps/ios/README.md': NONE, 'apps/ios/.gitignore': NONE,
    'apps/ios/perf-budgets.json': NONE, 'apps/ios/scripts/check-perf.py': NONE,
    # Run by job `perf`, which runs on every ready pull request.
    'apps/ios/scripts/check-strings.py': NONE,
    'apps/ios/scripts/asc-build-state.mjs': NONE, 'apps/ios/scripts/testflight-notes.py': NONE,
    # The App Store's screenshots and listing (app-store.yml).
    'apps/ios/store/': NONE, 'apps/ios/scripts/asc-listing.mjs': NONE, 'apps/ios/scripts/store-shots.py': NONE,
}


def check(runs, left, reached):
    """What these lists decide for a few changes, from flows-to-run.py's test: `runs` gives the tests a pull request
    runs, in whichever job (a sorted list: how they're packed into jobs is flows-to-run.py's, and its own test checks
    that), `left` the classes it leaves to main, `reached` what main runs after the merge (a set, or ALL)."""
    # The smoke set alone: what every screen sits in, the light's radio, the tanks, the catalog's two flows.
    smoke = runs(['apps/ios/AquaTome.xcodeproj/project.pbxproj'])
    for paths in ([APP + 'OwnCopy.swift'], ['apps/ios/Config/Base.xcconfig'], [KIT + 'Sources/ChihirosBLE/Bluetooth.swift'],
                  [APP + 'Lights/Radio.swift'], [KIT + 'Sources/Chihiros/Frames.swift'], [APP + 'Tanks/TanksView.swift'],
                  [KIT + 'Sources/Tanks/TankStore.swift'], [APP + 'Plugs/PlugsModel.swift'], [APP + 'Localizable.xcstrings'],
                  [APP + 'Handbook/KeepOffline.swift'], [APP + 'Tanks/TankCheckView.swift']):
        assert runs(paths) == smoke, paths
    # With the page shots: the pages, the light's card, the icons, and every flow's reach (the app's start, a path no
    # rule names).
    shots = sorted(smoke + ['PageShotsFlowTests'])
    for paths in ([APP + 'Handbook/HomeList.swift'], [APP + 'Handbook/NativePage.swift'], [APP + 'Handbook/FactsCard.swift'],
                  [APP + 'Handbook/HandbookModel.swift'], [KIT + 'Sources/Handbook/Handbook.swift'],
                  [APP + 'Lights/LightsView.swift'], [APP + 'Lights/LightOutlet.swift'], [APP + 'AppIcon/AppIconPicker.swift'],
                  [APP + 'AquaTomeApp.swift'], [APP + 'FishID/FishIDView.swift'], [KIT + 'Sources/FishID/Model.swift'],
                  ['apps/ios/Gemfile']):
        assert runs(paths) == shots, paths
    for paths in ([APP + 'AquaTomeApp.swift'], [APP + 'Telemetry.swift'], ['apps/ios/Gemfile']):
        assert left(paths) == 'every flow', paths
    # Nothing: the kit's tests, the vectors, the budgets, the catalog's Info.plist strings, the scripts `perf` runs, the
    # App Store's screenshots and listing (app-store.yml).
    for paths in (['protocols/tanks-vectors.json', 'apps/ios/perf-budgets.json', APP + 'InfoPlist.xcstrings',
                   KIT + 'Tests/TanksTests/StoreTests.swift', 'apps/ios/scripts/testflight-notes.py',
                   'apps/ios/scripts/check-strings.py', 'apps/ios/scripts/check-perf.py',
                   KIT + 'Sources/light-harness/main.swift', KIT + 'Sources/FishLamp/love-ecology.json',
                   'apps/ios/README.md'],
                  ['apps/ios/store/listing.json', 'apps/ios/scripts/asc-listing.mjs', 'apps/ios/scripts/store-shots.py']):
        assert runs(paths) == [] and left(paths) == '', paths
    # What it leaves to main: the classes of the flows it reaches that it doesn't run.
    assert left([APP + 'Handbook/HomeList.swift']) == ' '.join(sorted(set(HANDBOOK_SCREENS) - {'PageShotsFlowTests'}))
    assert left([APP + 'Lights/Radio.swift']) == 'LightFlowTests TelemetryFlowTests'
    assert left([APP + 'Tanks/TankCheckView.swift']) == 'TankCheckFlowTests TankLifeFlowTests'

    # What a change reaches, which main runs after the merge (read from the flows and the app).
    assert reached([APP + 'AquaTomeApp.swift']) == reached([APP + 'FishID/FishIDView.swift']) == ALL
    got = reached([APP + 'Handbook/HandbookModel.swift'])
    assert got == reached([KIT + 'Sources/Handbook/Handbook.swift']), got
    assert set(HANDBOOK) <= got and 'TanksFlowTests/testListsATanksFishAndPlantsAndOpensTheirPages' in got, got
    got = reached([APP + 'Handbook/NativePage.swift'])
    assert {'OfflineFlowTests', 'TankLifeFlowTests', 'HandbookFlowTests/testAPageOpensInTheApp'} <= got, got
    assert reached([APP + 'Handbook/KeepOffline.swift']) == {'OfflineFlowTests'}
    assert reached([APP + 'Tanks/TankGuides.swift']) == {
        'TankLifeFlowTests', 'NativePageFlowTests/testALinkFromTheTanksTabOpensOnTheTanksTab',
        'NativePageFlowTests/testAGroupFromTheTanksTabOpensOnTheTanksTab'}
    assert 'AccountFlowTests' in reached([APP + 'Tanks/CappedField.swift'])
    got = reached([KIT + 'Sources/Tanks/TankStore.swift'])
    assert 'HandbookFlowTests/testFiltersTheFishToMyTank' in got and set(LIGHTS_ON_TANKS) <= got, got
    assert reached([APP + 'Lights/Radio.swift']) == reached([KIT + 'Sources/Chihiros/Frames.swift']) == {'LightFlowTests', CONNECT_SENT}
    for card in ('LightsView.swift', 'LightOutlet.swift'):
        assert reached([APP + 'Lights/' + card]) == {'LightFlowTests', CONNECT_SENT, 'PageShotsFlowTests'}, card
    # The owner's dashboard: its flows and its page shots, and the tanks tab's with them where its row is; its vectors
    # reach them too.
    assert reached([APP + 'Owner/OwnerBlocks.swift']) == {'OwnerFlowTests', 'PageShotsFlowTests'}
    assert reached(['protocols/owner-dashboard-vectors.json']) == reached([APP + 'Owner/OwnerText.swift'])
    assert 'OwnerFlowTests' in reached([APP + 'Tanks/TanksView.swift'])
    assert 'OwnerFlowTests' not in reached([APP + 'Tanks/TankForm.swift'])
    # A new file in a folder that has a rule takes that folder's flows: the plugs', and the light's outlet's.
    assert reached([KIT + 'Sources/Plugs/NewSource.swift']) == {'PlugFlowTests'} | set(LIGHT_OUTLET)
    assert reached([APP + 'Plugs/PlugsModel.swift']) == reached([KIT + 'Sources/Plugs/NewSource.swift'])
    # The anonymous statistics: their own folders run their flows, and a light connected is one of the events sent.
    for p in (APP + 'Telemetry/TelemetryModel.swift', KIT + 'Sources/Telemetry/Outbox.swift'):
        assert reached([p]) == {'TelemetryFlowTests'}, p
    assert 'TelemetryFlowTests' in reached([APP + 'Handbook/NativePage.swift']), 'pages'
    assert 'TelemetryFlowTests' in reached([APP + 'Handbook/HandbookModel.swift']), 'the index flag'
    # Fish ID: its screen is the handbook's, and it sends as the reader's account.
    assert 'FishIdFlowTests' in reached([APP + 'Handbook/HomeList.swift'])
    for p in (APP + 'Handbook/FishIdView.swift', KIT + 'Sources/Handbook/FishId.swift', APP + 'Account/AccountModel.swift',
              KIT + 'Sources/AccountSync/Accounts.swift'):
        assert 'FishIdFlowTests' in reached([p]), p
    # The catalog: the two flows that read its Indonesian.
    assert reached([APP + 'Localizable.xcstrings']) == {
        'HandbookFlowTests/testAVideosLengthReadsAsTheSiteWritesItInIndonesianToo',
        'LightFlowTests/testTheWriteBarKeepsItsTimesWholeBesideALongerButton'}
    # A video guide: the handbook's screens and the pages the app draws reach its flows.
    assert 'VideoFlowTests' in reached([APP + 'Handbook/HomeList.swift'])
    assert 'VideoFlowTests' in reached([APP + 'Handbook/NativePage.swift'])
