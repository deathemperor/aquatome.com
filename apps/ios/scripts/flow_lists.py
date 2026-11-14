"""The lists flows-to-run.py reads: which job runs a class of flows (HANDBOOK), and what a path can reach (REACH).

A pull request that changes only this file runs no flow: these lists decide which flows a pull request that reaches
these paths runs and leaves to main (main runs every flow, HANDBOOK deciding only which job runs a class), and
`flows-to-run.py --test` checks them on every run of ios.yml, a draft's too. How the jobs' halves are cut and the smoke set are in flows-to-run.py, whose change runs every flow.
`check` holds what the lists decide for a few changes; flows-to-run.py's own checks of how it picks use stand-ins.
"""

UI = 'AquaTomeUITests'

# The flows of the handbook and of what a tank reads from it (its fish, plants and guides, the tank-mates check), run by
# job `handbook` (on GitHub's Macs a full run puts some beside the light flows: WITH_LIGHTS in flows-to-run.py); job
# `app` runs every other flow but the lights', so a class missing here still runs, in `app`.
HANDBOOK = ['HandbookFlowTests', 'FactsCardFlowTests', 'ReadingFlowTests', 'NativePageFlowTests', 'OfflineFlowTests',
            'TankCheckFlowTests', 'TankLifeFlowTests', 'PageShotsFlowTests', 'FishIdFlowTests', 'TankVolumeFlowTests',
            'TankMatesFlowTests', 'VideoFlowTests',
            'TelemetryFlowTests']

# What a class of flows takes on GitHub's Macs, in seconds, for packing a pull request's few flows into one job
# (flows-to-run.py): the sum of each test's median in the logs of 2026-11-06's runs, the flows' animations off. A class
# not named here counts FLOW_SECONDS a test; light flows are never packed (their halves already fill a job each).
# The edge swipes' classes from #1171's run on 9fecd66 (2026-11-13): about 190 s a test.
CLASS_SECONDS = {'FactsCardFlowTests': 280, 'FishIdFlowTests': 486, 'HandbookFlowTests': 632,
                 'FishPageEdgeSwipeFlowTests': 570, 'GuideEdgeSwipeFlowTests': 570, 'PostEdgeSwipeFlowTests': 570,
                 'NativePageFlowTests': 648, 'OfflineFlowTests': 225, 'PageShotsFlowTests': 2100, 'PlugFlowTests': 744,
                 'ReadingFlowTests': 69, 'TankCheckFlowTests': 67, 'TankLifeFlowTests': 280, 'TelemetryFlowTests': 136,
                 'VideoFlowTests': 330}
FLOW_SECONDS = 45
# One page shot: 1,770 s for the 48 of 2026-11-08's pull requests (37 s each; the class's 2,100 above is 57 of them).
SHOT_SECONDS = 37

# What a path can reach. The longest prefix that matches a path decides: a list of flows (a class, or one of its
# tests), with the smoke set; [] for the smoke set alone; ALL for every flow; NONE for no flow (job `kit`, `perf` or
# another workflow checks it). Read from the flows (the screens and launch arguments each uses, the accessibility
# identifiers it asks for) and the app (which screens show which views, and what they read).
NONE, ALL = None, 'all'
APP, KIT = 'apps/ios/AquaTome/', 'apps/ios/AquaTomeKit/'
# The page shots (PageShotsFlowTests) by the screen each takes, for a change's before and after: a pull request takes
# those of the screens its change reaches (the whole class when it can reach every flow, or edits the class), and main
# takes them all. The whole class took 30 minutes of a pull request's run on GitHub's Macs (2026-11-08).
SHOTS = {
    # A page the app draws, top to bottom: a fish (light, dark, large text), a plant, a guide, a video series, a kind of kit.
    'pages': ['testAFish', 'testAFishInTheDark', 'testAFishInLargeText', 'testAPlant', 'testAGuide', 'testAVideoSeries',
              'testAKindOfKit', 'testAKindOfKitInTheDark'],
    'video': ['testAVideoPlaying'],
    # The photo viewer over a fish's gallery.
    'viewer': ['testTheGalleryViewer', 'testTheGalleryViewerInTheDark', 'testTheGalleryViewerInLargeText',
               'testThePhotoGrid', 'testThePhotoGridInTheDark', 'testThePhotoGridInTheLargestText'],
    # A search's results under its chips (HandbookView, its rows HomeList's).
    'search': ['testASearch', 'testASearchInTheDark', 'testASearchInTheLargestText', 'testASearchInTheLargestTextInTheDark',
               'testASearchFindingMoreThanItLists', 'testAKindASearchFindsNoneOf',
               'testAKindASearchFindsNoneOfInTheLargestText'],
    # Tìm's home: its tools, its kit section and a long list, what's new and its list.
    'tools': ['testTheToolsOnTim', 'testTheToolsOnTimInTheDark', 'testTheToolsOnTimInTheLargestText'],
    'home': ['testKitOnTheHomeAndALongList', 'testKitOnTheHomeAndALongListInTheDark', 'testWhatsNew', 'testWhatsNewInTheDark',
             'testTheHome', 'testTheHomeOnANewPhone', 'testTheHomeInTheDark', 'testTheHomeInTheLargestText'],
    # The tab bar over a fish's text and over Tìm's photos.
    'tab-bar': ['testTheTabBarOverText', 'testTheTabBarOverTextInTheDark', 'testTheTabBarOverPhotos',
                'testTheTabBarOverPhotosInTheDark'],
    'fish-id': ['testFishId', 'testFishIdInTheDark'],
    'icons': ['testTheAppIcons', 'testTheAppIconsInTheDark'],
    # The light's card warning of its outlet's timer; the tab top to bottom and the Week Aqua screen, in v2, light and dark.
    'light': ['testALightsCardWarningOfItsOutletsTimer', 'testTheLightsTab', 'testTheLightsTabInTheDark',
              'testTheWeekAquaScreen', 'testTheWeekAquaScreenInTheDark'],
    'tanks': ['testTheTanksList'],
    # The Tài khoản sheet signed out and signed in as the owner (whose row is on it).
    'account': ['testSigningIn', 'testSigningInInTheDark', 'testSigningInInTheLargestText', 'testTheAccountSignedIn',
                'testTheAccountSignedInInTheDark', 'testTheAccountSignedInInTheLargestText'],
    'owner': ['testTheOwnersDashboard', 'testTheOwnersDashboardInTheDark', 'testTheOwnersDashboardInTheLargestText',
              'testTheOwnersNeedsInTheLargestText', 'testTheOwnersDashboardWithNothingToDo', 'testTheDailyReportsDelivery', 'testAnOwnersSection',
              'testAnOwnersSectionInTheDark', 'testAnOwnersSectionInTheLargestText', 'testTheOwnersComments',
              'testTheOwnersCommentsInTheDark', 'testTheOwnersCommentsInTheLargestText', 'testTheDailyReportsSettings'],
    'v2': ['testV2', 'testV2InTheDark', 'testV2InTheLargestText', 'testV2InMalayInTheDarkAtTheLargestText'],
}


def shots(*screens):
    return [f'PageShotsFlowTests/{t}' for s in screens for t in SHOTS[s]]


# The handbook's screens' shots: those a change to its model, or to one of its files with no rule of its own, reaches.
HANDBOOK_SHOTS = shots('pages', 'video', 'viewer', 'search', 'tools', 'home', 'tab-bar', 'fish-id')
# Every screen of the handbook: its flows, and those that start from a page (a comment posted, a fish put on a tank).
HANDBOOK_FLOWS = ['HandbookFlowTests', 'FactsCardFlowTests', 'NativePageFlowTests',
                  'OfflineFlowTests', 'ReadingFlowTests', 'ReaderPostFlowTests', 'TankLifeFlowTests', 'FishIdFlowTests',
                  'VideoFlowTests', 'ChatFlowTests']
HANDBOOK_SCREENS = HANDBOOK_FLOWS + HANDBOOK_SHOTS
# The handbook's model and the kit's Handbook: its screens, the tanks tab's parts that read it (the tank-mates check,
# a tank's fish and plants, its guides), and the tank volume and tank-mates tools, which search and a page's links open
# (AppScreen).
# Also the anonymous statistics, which wait for the index's flag.
HANDBOOK_MODEL = HANDBOOK_SCREENS + ['TankCheckFlowTests', 'TanksFlowTests/testListsATanksFishAndPlantsAndOpensTheirPages',
                                     'TankVolumeFlowTests', 'TankMatesFlowTests', 'TelemetryFlowTests', 'GuideTopFlowTests']
# A page open (PageView), or drawn by the app (NativePage): the flows that open one. In v2, a guide's top
# (GuideTopFlowTests) and the flows that open a guide on Hôm nay and go back from it.
PAGES = ['NativePageFlowTests', 'FactsCardFlowTests', 'ReaderPostFlowTests', 'ReadingFlowTests',
         'PhotoGridFlowTests', 'TankLifeFlowTests', 'HandbookFlowTests/testAPageOpensInTheApp',
         'TanksFlowTests/testListsATanksFishAndPlantsAndOpensTheirPages', 'VideoFlowTests',
         'TelemetryFlowTests', 'ChatFlowTests', 'GuideTopFlowTests',
         'V2FlowTests/testAGuideOpensOnItsPhotoAndNameWhileItsPageIsRead', 'GuideEdgeSwipeFlowTests',
         'V2FlowTests/testNoPageOffersTheWholePageWhereverItsOpenedFrom'] + shots('pages', 'video', 'viewer', 'home', 'tab-bar')
# The app's icon picker: its flows, and its shots.
ICONS = ['AppIconFlowTests'] + shots('icons')
# The light flows of the outlet a light is plugged into, on the stand-in Tuya cloud: its timers read, the pick taken
# back, a light said not to be on one, and a timer told in the plug's zone on a phone in another.
LIGHT_OUTLET = ['LightFlowTests/' + t for t in (
    'testWarnsWhenTheLightsOutletHasATimerThatCutsItsPower', 'testTakingTheOutletBackAsksAgainAndDropsTheWarning',
    'testALightNotOnASmartPlugIsAskedNoMoreOnThisPhone', 'testAnOutletsTimerInAnotherZoneSaysWhose')]
# The light flows that start from a tank or keep a light on one (the outlet it's plugged into, too).
LIGHTS_ON_TANKS = ['LightFlowTests/' + t for t in (
    'testKeepsTheLightAndWhatWasWrittenOnATank', 'testALightOnATankOpensOnTheLightsTabAndConnects',
    'testALightOnATankOpensTheConnectedLightAsItIs',
    'testASavedLightIsListedAfterARelaunchAndConnectsWithWhatWasWritten',
    'testWeekAquaKeepsTheGroupOnATankAndConnectsItFromThere')] + LIGHT_OUTLET
CONNECT_SENT = 'TelemetryFlowTests/testConnectingTheLightIsSentWithoutTheLightsNameOrTheAccount'
LOVE_ECOLOGY = 'LightFlowTests/testTheOwnersLoveEcologyLightTakesOffThenAColour'
# The tanks tab: a tank's own flows, its plugs section and its hint that opens the Tài khoản sheet (where the account and
# the posters blocked are, not here), a page's links and the handbook's tools that open it, and the lights kept on a tank.
TANKS_TAB = ['TanksFlowTests', 'TankLifeFlowTests', 'TankCheckFlowTests', 'AccountFlowTests', 'PlugFlowTests',
             'NativePageFlowTests/testALinkFromTheTanksTabOpensOnTheTanksTab',
             'NativePageFlowTests/testAGroupFromTheTanksTabOpensOnTheTanksTab',
             'NativePageFlowTests/testAToolItNamesOpensItsTab', 'HandbookFlowTests/testFiltersTheFishToMyTank',
             'HandbookFlowTests/testFiltersThePlantsToTheTanksLight',
             'ReaderPostFlowTests/testABlockedPosterIsListedInTheAccountSheet', 'TankVolumeFlowTests',
             'TankMatesFlowTests', 'TelemetryFlowTests'] + LIGHTS_ON_TANKS
KEPT_ROW = 'OfflineFlowTests/testTheAccountSheetCountsTheKeptPagesAndOpensTheirShelfOnTim'
ACCOUNT_SHEET = ['AccountFlowTests', 'ReaderPostFlowTests', 'FishIdFlowTests', 'OwnerFlowTests', 'TelemetryFlowTests',
                 'ProfilePictureFlowTests'] + shots('account')
REACH = {
    # The app's start (it routes a page's links to the tabs, wires a tank's wanted names and pages, sends the lights back
    # to their schedule when the app leaves, syncs the account), and what selects and runs the flows: every flow, as
    # a change to them is otherwise untried until main.
    APP + 'AquaTomeApp.swift': ALL, '.github/workflows/ios.yml': ALL, 'apps/ios/scripts/flows-to-run.py': ALL,
    'apps/ios/scripts/wait-for-simulator.sh': ALL, 'apps/ios/scripts/retried-tests.py': ALL,
    'apps/ios/scripts/shots.py': ALL,
    # The other scripts: CI's and the App Store's, none in the app. sim-run.py runs each flow job's tests: the smoke set.
    'apps/ios/scripts/': NONE, 'apps/ios/scripts/sim-run.py': [], 'apps/ios/design/': NONE,
    # These lists: they decide what a pull request runs, not what the app does (main runs every flow), and
    # `flows-to-run.py --test` checks them on every run of ios.yml.
    'apps/ios/scripts/flow_lists.py': NONE,
    # What every screen sits in, or builds the app and its flows: the smoke set.
    APP + 'OwnCopy.swift': [], APP + 'Assets.xcassets/': [], 'apps/ios/AquaTome.xcodeproj/': [], 'apps/ios/Config/': [],
    # The icons a reader chooses: the picker, the icon sets and their previews (app-icons.py writes them).
    APP + 'AppIcon/': ICONS, APP + 'Assets.xcassets/AppIcon': ICONS, 'apps/ios/scripts/app-icons.py': NONE,
    # Its row in the Tài khoản sheet opens it.
    APP + 'AppIcon/AppIconPicker.swift': ICONS + ['AccountFlowTests/testTheAccountIsInTheProfileSheetFromEveryTab'],
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
    # Tìm, which is v2's search tab too: a fish found there opens v2's page.
    APP + 'Handbook/HandbookView.swift': HANDBOOK_SCREENS + ['V2FlowTests'],
    # Tìm's home: the handbook's screens start there, the volume tool opens from its tile, and the root form's reading
    # list is read there.
    APP + 'Handbook/HomeList.swift': HANDBOOK_FLOWS + ['TankVolumeFlowTests', 'ViAtRootFlowTests']
                                     + shots('search', 'tools', 'home', 'tab-bar'),
    # The handbook's screens with a shot of their own: the handbook's flows, and their shots.
    APP + 'Handbook/BrowseView.swift': HANDBOOK_FLOWS + shots('home'),
    APP + 'Handbook/PhotoViewer.swift': HANDBOOK_FLOWS + ['PhotoViewerFlowTests', 'PhotoGridFlowTests'] + shots('viewer'),
    APP + 'Handbook/PagePlayer.swift': HANDBOOK_FLOWS + shots('video'),
    APP + 'Handbook/FishIdView.swift': HANDBOOK_FLOWS + shots('fish-id'),
    APP + 'Handbook/PageView.swift': PAGES,
    # The way round v2's fish page and a guide, the owner's alone for now.
    APP + 'Handbook/PageNavigator.swift': ['V2FlowTests', 'GuideTopFlowTests'],
    # Its pictures are kept for offline too (PageImages).
    APP + 'Handbook/NativePage.swift': PAGES + ['OfflineFlowTests'],
    APP + 'Handbook/FactsCard.swift': ['FactsCardFlowTests', 'NativePageFlowTests'] + shots('pages'),
    APP + 'Handbook/KeepOffline.swift': ['OfflineFlowTests'],
    # The photo grid: its flows, and its shots (with the viewer's, which it opens).
    APP + 'Handbook/PhotoGrid.swift': ['PhotoGridFlowTests'] + shots('viewer'),
    # Every page's pictures, the viewer's and the grid's, fetched and kept for offline: the grid's flows count its fetches.
    APP + 'Handbook/PageImages.swift': HANDBOOK_SCREENS + ['PhotoViewerFlowTests', 'PhotoGridFlowTests', 'OfflineFlowTests'],
    # Worked out in the kit (job `kit`), drawn only by the grid.
    KIT + 'Sources/Handbook/PhotoRows.swift': ['PhotoGridFlowTests'],
    APP + 'Handbook/ReaderPost.swift': ['ReaderPostFlowTests'],
    # The photo picker both screens open (the flows hand them a photo, as picked).
    APP + 'Handbook/ImagePicker.swift': ['FishIdFlowTests', 'ReaderPostFlowTests'],
    # The waits a flow moves on itself (`-test-gates`): only the fish-ID flows open them (the page shots' fish-ID screens
    # get the plain wait it replaced, as with FakeServer's).
    APP + 'TestGate.swift': ['FishIdFlowTests'],
    APP + 'Handbook/TankVolumeView.swift': ['TankVolumeFlowTests'],
    # Its flows, and a fish page's link that opens it.
    APP + 'Handbook/TankMatesView.swift': ['TankMatesFlowTests', 'NativePageFlowTests/testTheTankMatesToolOpensSetToTheFish'],
    APP + 'Handbook/ReaderSafety.swift': ['ReaderPostFlowTests', 'NativePageFlowTests'],
    APP + 'Tanks/': TANKS_TAB,
    # The tanks list, which the page shots also take (empty, and with a tank), for a change's before and after.
    APP + 'Tanks/TanksView.swift': TANKS_TAB + shots('tanks'),
    # The check's section, which the tank-mates tool shows too.
    APP + 'Tanks/TankCheckView.swift': ['TankCheckFlowTests', 'TankMatesFlowTests',
                                        'TankLifeFlowTests/testAddsAFishWithoutAPageByNameSendsItOnceAndKeepsItAfterARelaunch'],
    APP + 'Tanks/TankGuides.swift': ['TankLifeFlowTests', 'NativePageFlowTests/testALinkFromTheTanksTabOpensOnTheTanksTab',
                                     'NativePageFlowTests/testAGroupFromTheTanksTabOpensOnTheTanksTab'],
    APP + 'Tanks/TankLife.swift': ['TankLifeFlowTests', 'TankCheckFlowTests', 'TanksFlowTests', 'NativePageFlowTests',
                                   'V2FlowTests/testAFishPutOnATankFromItsPageOpensTheTank'],
    APP + 'Tanks/TankForm.swift': ['TanksFlowTests', 'TankLifeFlowTests', 'PlugFlowTests', 'AccountFlowTests'],
    APP + 'Tanks/CappedField.swift': ['TanksFlowTests', 'TankLifeFlowTests', 'PlugFlowTests', 'AccountFlowTests'],
    # The anonymous statistics: their own flows; and a light connected is one of the events sent.
    APP + 'Telemetry/': ['TelemetryFlowTests'], KIT + 'Sources/Telemetry/': ['TelemetryFlowTests'],
    # Its switch, a row of the Tài khoản sheet.
    APP + 'Telemetry/TelemetrySwitch.swift': ACCOUNT_SHEET,
    APP + 'Lights/': ['LightFlowTests', CONNECT_SENT],
    # The light's card, which the page shots also take (with its outlet's warning), for a change's before and after.
    APP + 'Lights/LightsView.swift': ['LightFlowTests', CONNECT_SENT] + shots('light') + [
                                      'AccountFlowTests/testTheAccountIsInTheProfileSheetFromEveryTab'],
    APP + 'Lights/LightOutlet.swift': ['LightFlowTests', CONNECT_SENT] + shots('light'),
    # The Week Aqua screen, which the page shots take too.
    APP + 'Lights/WeekAquaView.swift': ['LightFlowTests', CONNECT_SENT] + shots('light'),
    APP + 'Plugs/': ['PlugFlowTests'] + LIGHT_OUTLET,
    # Fish ID sends as the reader's account (signed out, its sign-in comes first); the account also holds the owner's
    # dashboard (its session, and signing out on a 401).
    APP + 'Account/': ['AccountFlowTests', 'ReaderPostFlowTests', 'FishIdFlowTests', 'OwnerFlowTests', 'ProfilePictureFlowTests', 'ChatFlowTests'],
    # The Tài khoản sheet and the button that opens it on every tab: the flows that go through it (the account, the
    # blocked, the owner's dashboard, the anonymous statistics' switch), and the page shots, which take it; its card's
    # Apple and Google buttons too.
    # The sheet's row for the pages kept offline opens their shelf on Tìm: the offline flow that checks it too.
    APP + 'Account/AccountView.swift': ACCOUNT_SHEET + [KEPT_ROW], APP + 'Account/ProfileButton.swift': ACCOUNT_SHEET,
    APP + 'Account/AccountSection.swift': ACCOUNT_SHEET, APP + 'Account/AppleSignIn.swift': ACCOUNT_SHEET,
    # The account's picture: on the profile button every flow through the sheet taps, and its row on the sheet.
    APP + 'ProfilePictures/': ACCOUNT_SHEET, APP + 'Assets.xcassets/ProfilePictures/': ['ProfilePictureFlowTests'],
    'protocols/profile-pictures.json': ['ProfilePictureFlowTests'],
    APP + 'Account/GoogleSignIn.swift': ACCOUNT_SHEET, APP + 'Account/Appearance.swift': ACCOUNT_SHEET,
    # v2, the app's look since 2026-11-08: its own flows (the switch, its tabs, a link into it, a fish put on a tank from
    # its page), and its page shots. Its root, which every flow on v2 runs through, reaches them all, as AquaTomeApp does.
    APP + 'V2/': ['V2FlowTests', 'BrowseShelvesFlowTests'] + shots('v2'),
    APP + 'V2/V2Root.swift': ALL,
    # The stand-in server also takes the names readers want pages for (a fish put on a tank by name), and serves the
    # owner's dashboard.
    APP + 'Account/FakeServer.swift': ['AccountFlowTests', 'ReaderPostFlowTests', 'TankLifeFlowTests', 'FishIdFlowTests',
                                       'OwnerFlowTests', 'ChatFlowTests'],
    # The stand-in chat: the chat's flows alone.
    APP + 'Account/FakeChat.swift': ['ChatFlowTests'],
    # The chat screen, opened from a fish's page and fish ID's result.
    APP + 'Chat/': ['ChatFlowTests'],
    # Its page shots too: the overview and a section.
    APP + 'Owner/': ['OwnerFlowTests'] + shots('owner'),
    # Its row, in the Tài khoản sheet (and none signed out).
    APP + 'Owner/OwnerEntry.swift': ['OwnerFlowTests', 'AccountFlowTests/testTheAccountIsInTheProfileSheetFromEveryTab']
                                    + shots('owner', 'account'),
    KIT + 'Sources/Handbook/': HANDBOOK_MODEL,
    # The chat's contract, the event stream it's read from and the answer as the screen draws it: the chat's flows
    # (job `kit` tests them too).
    KIT + 'Sources/Handbook/Chat.swift': ['ChatFlowTests'], KIT + 'Sources/Handbook/ChatReply.swift': ['ChatFlowTests'],
    KIT + 'Sources/Handbook/ServerEvents.swift': ['ChatFlowTests'],
    KIT + 'Sources/TankCheck/': ['TankCheckFlowTests', 'TankLifeFlowTests', 'TankMatesFlowTests'],
    # Also the fish filtered to a tank (ShelfFilter reads its size), and the tank volume tool (Volume, VolumeForm).
    KIT + 'Sources/Tanks/': ['TanksFlowTests', 'TankLifeFlowTests', 'TankCheckFlowTests', 'AccountFlowTests',
                             'PlugFlowTests', 'HandbookFlowTests/testFiltersTheFishToMyTank',
                             'TankVolumeFlowTests', 'TankMatesFlowTests'] + LIGHTS_ON_TANKS,
    KIT + 'Sources/AccountSync/': ['AccountFlowTests', 'ReaderPostFlowTests', 'TankLifeFlowTests', 'FishIdFlowTests',
                                   'OwnerFlowTests', 'ProfilePictureFlowTests', 'ChatFlowTests'],
    KIT + 'Sources/Plugs/': ['PlugFlowTests'] + LIGHT_OUTLET,
    KIT + 'Sources/Chihiros/': ['LightFlowTests', CONNECT_SENT],
    # Week Aqua lights, on the lights tab beside the Chihiros ones.
    KIT + 'Sources/WeekAqua/': ['LightFlowTests'],
    # A Mac command line, not in the app: the kit's step in job `perf` builds it (job `kit`, nightly).
    KIT + 'Sources/light-harness/': NONE,
    # The owner's Love Ecology light's card on the Đèn tab plays its recordings back.
    KIT + 'Sources/FishLamp/': [LOVE_ECOLOGY],
    KIT + 'Tests/': NONE, 'protocols/': NONE,
    # The owner's dashboard's flows read it: the stand-in server serves its replies, and the owner's row counts its to-dos.
    'protocols/owner-dashboard-vectors.json': ['OwnerFlowTests', 'AccountFlowTests/testTheOwnersRowCountsTheOverviewsToDos']
                                              + shots('owner'),
    # The sample's waiting photos, which the stand-in server serves to the dashboard's flows.
    'apps/site/e2e/photos/': ['OwnerFlowTests'] + shots('owner'), 'apps/ios/README.md': NONE, 'apps/ios/.gitignore': NONE,
    # The stand-in chat streams the chat's recorded answers.
    'protocols/chat-stream-': ['ChatFlowTests'],
    'apps/ios/perf-budgets.json': NONE, 'apps/ios/scripts/check-perf.py': NONE,
    # Run by job `perf`, which runs on every ready pull request that changes what it builds or checks.
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
                  [APP + 'Lights/Radio.swift'], [KIT + 'Sources/Chihiros/Frames.swift'],
                  [KIT + 'Sources/Tanks/TankStore.swift'], [APP + 'Plugs/PlugsModel.swift'], [APP + 'Localizable.xcstrings'],
                  [APP + 'Handbook/KeepOffline.swift'], [APP + 'Tanks/TankCheckView.swift'], ['apps/ios/scripts/sim-run.py']):
        assert runs(paths) == smoke, paths
    # With the shots of the screens it reaches: a page, Tìm's home, the light's card, the icons, the tanks list, the
    # Tài khoản sheet, the owner's dashboard, v2; the handbook's model or a file of it with no rule, the handbook's.
    for paths, screens in (([APP + 'Handbook/HomeList.swift'], ('search', 'tools', 'home', 'tab-bar')),
                           ([APP + 'Handbook/NativePage.swift'], ('pages', 'video', 'viewer', 'home', 'tab-bar')),
                           ([APP + 'Handbook/FactsCard.swift'], ('pages',)), ([APP + 'Handbook/PhotoViewer.swift'], ('viewer',)),
                           ([APP + 'Handbook/PhotoGrid.swift'], ('viewer',)),
                           ([APP + 'Handbook/BrowseView.swift'], ('home',)), ([APP + 'Handbook/FishIdView.swift'], ('fish-id',)),
                           ([APP + 'Lights/LightsView.swift'], ('light',)), ([APP + 'Lights/LightOutlet.swift'], ('light',)),
                           ([APP + 'Lights/WeekAquaView.swift'], ('light',)),
                           ([APP + 'AppIcon/AppIconPicker.swift'], ('icons',)), ([APP + 'Tanks/TanksView.swift'], ('tanks',)),
                           ([APP + 'Account/AccountSection.swift'], ('account',)),
                           ([APP + 'Owner/OwnerBlocks.swift'], ('owner',)), (['protocols/owner-dashboard-vectors.json'], ('owner',)),
                           ([APP + 'Owner/OwnerEntry.swift'], ('owner', 'account')), ([APP + 'V2/Today.swift'], ('v2',)),
                           ([APP + 'Handbook/HomeList.swift', APP + 'V2/Today.swift'], ('search', 'tools', 'home', 'tab-bar', 'v2'))):
        assert runs(paths) == sorted(smoke + shots(*screens)), paths
    for paths in ([APP + 'Handbook/HandbookModel.swift'], [KIT + 'Sources/Handbook/Handbook.swift'],
                  [APP + 'Handbook/HandbookView.swift']):
        assert runs(paths) == sorted(smoke + HANDBOOK_SHOTS), paths
    # Every page shot, the class whole, when it reaches every flow (the app's start, a path no rule names), or edits it.
    for paths in ([APP + 'AquaTomeApp.swift'], [APP + 'FishID/FishIDView.swift'], [KIT + 'Sources/FishID/Model.swift'],
                  ['apps/ios/Gemfile'], [f'apps/ios/{UI}/PageShotsFlowTests.swift']):
        assert runs(paths) == sorted(smoke + ['PageShotsFlowTests']), paths
    for paths in ([APP + 'AquaTomeApp.swift'], [APP + 'Telemetry.swift'], ['apps/ios/Gemfile']):
        assert left(paths) == 'every flow', paths
    # Nothing: the kit's tests, the vectors, the budgets, the catalog's Info.plist strings, the scripts `perf` runs, the
    # App Store's screenshots and listing (app-store.yml).
    for paths in (['protocols/tanks-vectors.json', 'apps/ios/perf-budgets.json', APP + 'InfoPlist.xcstrings',
                   KIT + 'Tests/TanksTests/StoreTests.swift', 'apps/ios/scripts/testflight-notes.py',
                   'apps/ios/scripts/check-strings.py', 'apps/ios/scripts/check-perf.py',
                   KIT + 'Sources/light-harness/main.swift',
                   'apps/ios/README.md'],
                  ['apps/ios/store/listing.json', 'apps/ios/scripts/asc-listing.mjs', 'apps/ios/scripts/store-shots.py'],
                  ['apps/ios/scripts/a-new-script.sh', 'apps/ios/design/at-1024.png']):
        assert runs(paths) == [] and left(paths) == '', paths
    assert reached([KIT + 'Sources/FishLamp/love-ecology.json']) == {LOVE_ECOLOGY}
    # What it leaves to main: the classes of the flows it reaches that it doesn't run.
    assert left([APP + 'Handbook/HomeList.swift']) == ' '.join(sorted(set(HANDBOOK_FLOWS + ['TankVolumeFlowTests', 'ViAtRootFlowTests'])))
    assert left([APP + 'Lights/Radio.swift']) == 'LightFlowTests TelemetryFlowTests'
    assert left([APP + 'Tanks/TankCheckView.swift']) == 'TankCheckFlowTests TankLifeFlowTests TankMatesFlowTests'

    # What a change reaches, which main runs after the merge (read from the flows and the app).
    assert reached([APP + 'AquaTomeApp.swift']) == reached([APP + 'FishID/FishIDView.swift']) == ALL
    got = reached([APP + 'Handbook/HandbookModel.swift'])
    assert got == reached([KIT + 'Sources/Handbook/Handbook.swift']), got
    assert set(HANDBOOK) - {'PageShotsFlowTests'} | set(HANDBOOK_SHOTS) <= got, got
    assert 'TanksFlowTests/testListsATanksFishAndPlantsAndOpensTheirPages' in got, got
    got = reached([APP + 'Handbook/NativePage.swift'])
    assert {'OfflineFlowTests', 'TankLifeFlowTests', 'HandbookFlowTests/testAPageOpensInTheApp'} <= got, got
    assert reached([APP + 'Handbook/KeepOffline.swift']) == {'OfflineFlowTests'}
    assert reached([APP + 'Handbook/PhotoGrid.swift']) == {'PhotoGridFlowTests', *shots('viewer')}
    assert {'PhotoGridFlowTests', 'PhotoViewerFlowTests', 'OfflineFlowTests'} | set(HANDBOOK_SCREENS) <= reached([APP + 'Handbook/PageImages.swift'])
    assert 'PhotoViewerFlowTests' in reached([APP + 'Handbook/PhotoViewer.swift'])
    assert reached([KIT + 'Sources/Handbook/PhotoRows.swift']) == {'PhotoGridFlowTests'}
    assert 'PhotoGridFlowTests' in reached([APP + 'Handbook/NativePage.swift'])
    # The tank-mates tool: its own flows.
    assert reached([APP + 'Handbook/TankMatesView.swift']) == {'TankMatesFlowTests', 'NativePageFlowTests/testTheTankMatesToolOpensSetToTheFish'}
    assert 'TankMatesFlowTests' in runs([f'apps/ios/{UI}/TankMatesFlowTests.swift'])
    assert reached([APP + 'Tanks/TankGuides.swift']) == {
        'TankLifeFlowTests', 'NativePageFlowTests/testALinkFromTheTanksTabOpensOnTheTanksTab',
        'NativePageFlowTests/testAGroupFromTheTanksTabOpensOnTheTanksTab'}
    assert 'AccountFlowTests' in reached([APP + 'Tanks/CappedField.swift'])
    got = reached([KIT + 'Sources/Tanks/TankStore.swift'])
    assert 'HandbookFlowTests/testFiltersTheFishToMyTank' in got and set(LIGHTS_ON_TANKS) <= got, got
    assert reached([APP + 'Lights/Radio.swift']) == reached([KIT + 'Sources/Chihiros/Frames.swift']) == {'LightFlowTests', CONNECT_SENT}
    assert reached([APP + 'Lights/LightOutlet.swift']) == reached([APP + 'Lights/WeekAquaView.swift']) == {
        'LightFlowTests', CONNECT_SENT, *shots('light')}
    assert reached([KIT + 'Sources/WeekAqua/WeekAquaSession.swift']) == {'LightFlowTests'}
    # The tab's first screen also has the profile button, which the account's flow opens the sheet from.
    assert reached([APP + 'Lights/LightsView.swift']) == {'LightFlowTests', CONNECT_SENT, *shots('light'),
                                                          'AccountFlowTests/testTheAccountIsInTheProfileSheetFromEveryTab'}
    # The owner's dashboard: its flows and its page shots, and the tanks tab's with them where its row is; its vectors
    # reach them too, and the owner's row, which counts the overview's to-dos.
    assert reached([APP + 'Owner/OwnerBlocks.swift']) == {'OwnerFlowTests', *shots('owner')}
    assert reached(['protocols/owner-dashboard-vectors.json']) == reached([APP + 'Owner/OwnerText.swift']) | {'AccountFlowTests/testTheOwnersRowCountsTheOverviewsToDos'}
    # The tanks list takes the page shots; the Tài khoản sheet and its button, every flow that goes through the sheet and
    # the page shots too; the account's other files, its flows alone.
    assert set(shots('tanks')) <= reached([APP + 'Tanks/TanksView.swift'])
    assert 'OwnerFlowTests' not in reached([APP + 'Tanks/TanksView.swift'])
    for screen in ('Account/AccountSection.swift', 'Account/ProfileButton.swift', 'Account/AppleSignIn.swift',
                   'Account/Appearance.swift', 'Telemetry/TelemetrySwitch.swift'):
        assert reached([APP + screen]) == set(ACCOUNT_SHEET), screen
    assert reached([APP + 'Account/AccountView.swift']) == set(ACCOUNT_SHEET) | {KEPT_ROW}
    assert not any(f.startswith('PageShotsFlowTests') for f in reached([APP + 'Account/AccountModel.swift']))
    # The rows of the sheet from other folders: the statistics' switch takes the sheet's flows; the owner's row and the
    # icon picker's, the flow that checks the sheet's rows.
    assert reached([APP + 'Telemetry/TelemetrySwitch.swift']) == set(ACCOUNT_SHEET)
    for row in ('Owner/OwnerEntry.swift', 'AppIcon/AppIconPicker.swift'):
        assert 'AccountFlowTests/testTheAccountIsInTheProfileSheetFromEveryTab' in reached([APP + row]), row
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
    assert reached([APP + 'Handbook/ImagePicker.swift']) == {'FishIdFlowTests', 'ReaderPostFlowTests'}
    assert reached([APP + 'TestGate.swift']) == {'FishIdFlowTests'}
    # The chat: its contract and its stand-in reach its flows alone; its entries, a fish's page and fish ID's result.
    for p in (KIT + 'Sources/Handbook/Chat.swift', KIT + 'Sources/Handbook/ServerEvents.swift', APP + 'Chat/ChatView.swift',
              APP + 'Account/FakeChat.swift', 'protocols/chat-stream-species.sse'):
        assert reached([p]) == {'ChatFlowTests'}, p
    for p in (APP + 'Handbook/PageView.swift', APP + 'Handbook/FishIdView.swift', APP + 'Account/AccountModel.swift'):
        assert 'ChatFlowTests' in reached([p]), p
    # The catalog: the two flows that read its Indonesian.
    assert reached([APP + 'Localizable.xcstrings']) == {
        'HandbookFlowTests/testAVideosLengthReadsAsTheSiteWritesItInIndonesianToo',
        'LightFlowTests/testTheWriteBarKeepsItsTimesWholeBesideALongerButton'}
    # A video guide: the handbook's screens and the pages the app draws reach its flows.
    assert 'VideoFlowTests' in reached([APP + 'Handbook/HomeList.swift'])
    assert 'VideoFlowTests' in reached([APP + 'Handbook/NativePage.swift'])
