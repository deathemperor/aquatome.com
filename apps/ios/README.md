# AquaTome for iOS

The native app: device control (Chihiros lights first) and the handbook. SwiftUI, iOS 17+.

Three tabs: **Tìm** opens on a home of shelves as the site arranges its pages (fish groups, plants by where they go,
guides by subject, the video series and video guides, tools, the glossary by letter; fish filtered to a tank, its water and difficulty, plants to its
light and CO₂, as the site's lists filter them), searches and browses the handbook natively, draws the guides, fish, plants, glossary terms and video series itself from the site's pages as blocks (`/app/pages/`; a fish's gallery, tank-mates, Vietnamese climate, breeds, videos and the sources behind its figures, a series' guides as cards, each photo credited, and its readers' photos and comments as the site has them, a reader signed in to aquatome.com posting their own (a photo shrunk and stripped of its location first, with their consent, and the link that takes it back shown once, to keep rather than tap), and any reader, signed in or not, reporting another's comment or photo or blocking who posted it on this phone (App Store guideline 1.2; the blocked listed in the tanks tab to let back),
kept on the phone with their pictures, so a guide read once reads offline, and a shelf of guides can be kept for offline at once, asking first on mobile data and not with too little room, stopped with nothing half-kept, the kept pages listed in one place on the Tìm home and let go of there; a group named in a page opens the app's shelf of that group; a part it can't draw opens the web page, and a page of the site it can't draw, the web page in the app),
and opens the other pages of aquatome.com in the app (kept on the phone for reading offline, without ads; videos
and the pages they link to become native the same way, tools stay web pages until rebuilt), a fish's facts under its name as the site's data card has them (temperature, pH, hardness, size, lifespan, the shortest tank,
difficulty as the site's coloured word and its "6/8"; the sources behind each and whose text it is under them; its temperament and smallest school under its tank-mates) and a plant's care (difficulty, light, CO₂, growth, where it goes), from the index on the phone, so offline too, and the pages saved to read later and read last; **Bể của tôi** keeps the reader's tanks (name, inside size and litres,
substrate, notes, the fish and plants on it, each opening its page; put on from a fish or plant page, or from the tank, a fish with how many, and swiped to change the number or take one off; one the handbook has no page for put on by name, marked "chưa có trang" until a page has its scientific name, and sent once, with no account, as a name readers want pages for; checked as the site's tank-mates tool checks them: whether they go together, and whether the tank is big and long enough; and the guides that name them, the video guides apart) on the phone with no account, in the same store the
site uses, and shares a copy as JSON; **Đèn** controls the lights, and each light connected is kept on a tank with the
schedules written to it (as the site does). A tank also shows its Smart Life power strips ("Ổ cắm"), each outlet
named for what it powers, with its switch: the app calls Tuya's cloud itself, with the reader's own Tuya project keys
kept in the Keychain, and no AquaTome account (docs/smart-plugs.md). A light's card warns when the outlet the reader
picked for it has a Smart Life timer that cuts its power, which stops the light's clock.

The site's pages in the app share the reader's tanks with it (`PageBridge`): the tools' "Lưu vào Bể của tôi" saves to
the app's tanks, merged record by record, and each page sees them. A link to "Bể của tôi" or the Chihiros page, and
those tools in the handbook, open the app's own tab (`AppScreen`); the tools' "Xem trong Bể của tôi →" opens the tank
just saved. The fish-ID tool is the app's own screen too (`FishIdView`): a photo from the library or the camera, one fish
boxed on it if the reader likes, shrunk and stripped as the site's page sends it, and sent as the reader's aquatome.com
account (`protocols/fishid.openapi.json`: a bearer in place of the page's Turnstile check, counted per account); the
guesses as the site shows them, each page opening in the app. Signed out, the sign-in comes first. Claude has up to
25 s on the Worker, so the request waits 65 s and the screen says so after the first seconds; meanwhile the photo can't
be changed, so its guesses come in under it.

Signing in (Sign in with Apple, Google, a code sent by email, or a passkey) syncs the tanks with an aquatome.com account, as
the site's page does: the token is in the Keychain, on this phone only. Google's sign-in has no Google SDK (the size
budget): Google's own page opens in the system's browser sheet (`ASWebAuthenticationSession`, OAuth 2.0 for installed
apps, a code with PKCE), the app exchanges the code at Google for the ID token (an iOS client has no secret), and the
server checks that token as it checks Apple's (`GoogleOAuth`). "Thêm passkey" adds one made on the phone, as on
the site: more than 10 minutes after signing in, the server asks for a sign-in first, and one to the same account
carries on. The email sign-in's
Turnstile check runs in a web view on the site's page for it (`/api/v1/auth/email/turnstile`), since Turnstile runs
only in a web page on the site's host. Passkeys are aquatome.com's, shared with the app through its webcredentials
association (`Config/AquaTome.entitlements` and the site's `/.well-known/apple-app-site-association`); only a signed
build on an iPhone can use them, so the simulator never runs the real passkey sheet.
A debug build on the simulator (every UI and performance test) gets a stand-in server, Apple sheet, Google page and token
endpoint (`FakeGoogle`; `-fake-google cancel` closes the page), passkey sheet and Turnstile check inside the app instead
(`AquaTome/Account/FakeServer.swift`; accounts on with `-fake-accounts on`;
every emailed code is `123456`; `-seed-passkey` gives an account the stand-in's passkey; a session kept from an earlier
launch counts as signed in long ago), so no test reaches
aquatome.com; `-real-accounts` tries the real server from the simulator.
Likewise for the plugs: a stand-in Tuya cloud with made-up keys and strips (`PlugsModel.forSimulator`;
`-seed-tuya-keys` starts with its keys entered), so no test reaches Tuya; `-real-tuya` tries Tuya itself.
And for the handbook: `-fixed-handbook` gives a small fixed index and guide pages (`HandbookIndex.fixture`), and each of
the site's web pages opens as a stand-in page naming its path (`WebPage.standIn`), so no test reaches aquatome.com.

## The app

```text
AquaTome.xcodeproj   # folders are synchronized: new files need no project edits
AquaTome/            # the app (Vietnamese source strings; Indonesian and Thai in Localizable.xcstrings)
AquaTomeUITests/     # the main flows, on the simulator's fake light
Config/Base.xcconfig # includes Local.xcconfig (git-ignored) for signing
```

- **Simulator:** no setup. It has no Bluetooth, so the app gets a fake light (`FakeRadio`) that answers like the real
  one. The UI tests run there:

  ```sh
  xcodebuild test -project AquaTome.xcodeproj -scheme AquaTome -destination 'platform=iOS Simulator,name=iPhone 17'
  python3 scripts/check-strings.py ~/Library/Developer/Xcode/DerivedData/AquaTome-*   # translations
  ```

  The lights flows (`AquaTomeUITests/LightFlowTests`) follow the site's Chihiros page; the fake light's launch arguments
  (a slow or lost clock, old firmware, a drop, no Bluetooth…) are listed on `FakeRadio` (`AquaTome/Lights/Radio.swift`).
  The photo viewer's flows (`AquaTomeUITests/PhotoViewerFlowTests`) use stand-in photos (`-fixed-pictures`), a gallery's
  full photos held back 20 s (`-slow-pictures`), pictures that don't come (`-fail-pictures <part of their address>`)
  and a gallery of 28 (`-large-gallery`); in debug builds the viewer shows the tests which full photos it fetched and
  which it stopped on their way (with `-slow-pictures`; `PictureLog`), and the size of the picture it shows.

  A change to how a screen looks shows it before and after (`docs/governance.md`, Mobile apps rule 6):
  `AquaTomeUITests/PageShotsFlowTests` screenshots a fish, a plant, a guide and the fish-ID screen top to bottom, light
  and dark, and CI's job `handbook (1)` uploads them as the `ios-page-shots` artifact whenever it runs them: every run on main, and a pull
  request whose change can reach the pages, or labelled `ios-full`. Locally:

  ```sh
  xcodebuild test -project AquaTome.xcodeproj -scheme AquaTome -destination 'platform=iOS Simulator,name=iPhone 17' \
    -resultBundlePath /tmp/shots.xcresult -only-testing:AquaTomeUITests/PageShotsFlowTests
  python3 scripts/shots.py /tmp/shots.xcresult /tmp/shots
  ```

- **A real iPhone:** copy `Config/Local.xcconfig.example` to `Config/Local.xcconfig` and put your team ID in it. The
  public project never holds the team ID.

A new string in the code: add its Indonesian and Thai to `Localizable.xcstrings` (Xcode adds the key when it builds);
`check-strings.py` fails CI otherwise. Reuse the site's translation when the Vietnamese is the same
(`apps/site/src/i18n/{id,th}.json`).

## TestFlight

`.github/workflows/testflight.yml` signs the app and uploads it to TestFlight, where the internal group "Owner" gets
each build by itself:

- on every push to main that changes `apps/ios/` or `protocols/`
- on Mondays at 09:00 Vietnam time, when `apps/ios/`, `protocols/` or the workflow changed since the last upload (or
  that build is 60 days old: TestFlight builds expire after 90)
- by hand (Actions → "iOS app: TestFlight upload" → Run workflow)

Signing is Xcode's automatic, cloud-managed signing with the App Store Connect API key (secret
`APP_STORE_CONNECT_API_KEY`; variables `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APPLE_TEAM_ID`):
no certificate or profile is in the repository. Only the export signs: the archive is built unsigned and carries its
entitlements in an ad-hoc signature, because signing the archive on a fresh runner makes a new development certificate
each time, until Apple's cap stops the build. The job signs a local copy first and checks it has every entitlement in
`Config/AquaTome.entitlements`; only then does it export again to App Store Connect. The build number is the workflow's run number. A pull request that changes the project,
`Config/` or the workflow signs and exports without uploading.

Each upload's "What to Test" lists the pull requests merged into the app since the last upload, newest first, their
titles in plain words (`scripts/testflight-notes.py`, at most TestFlight's 4,000 bytes, without the "<" and emoji it
refuses). It's set in English once Apple has processed the build, in en-US, Vietnamese and any language the build
already has; a note that can't be set is a warning, not a failed upload.

## App Store listing

`store/listing.json` is the App Store listing: its copy in Vietnamese (the primary language), Indonesian and Thai, the
categories, a free price in every territory, the content rights, the age rating answers and the notes for App Review.
`.github/workflows/app-store.yml` applies it with `scripts/asc-listing.mjs`:

- a pull request that changes it is checked against Apple's limits (`--check`, whose own test is `--test`), and gets
  what App Store Connect has now beside it (`--report`)
- by hand (Actions → "iOS app: App Store listing" → Run workflow), it makes the screenshots and keeps them with the run:
  `AquaTomeUITests/StoreShotsFlowTests`, six screens in each language, on an iPhone 17 Pro Max (6.9"), an iPhone 17
  (6.3", the iPhone set Apple requires) and an iPad Pro 13-inch, from aquatome.com's handbook and the simulator's stand-in light and plugs (`scripts/store-shots.py` exports
  them). With "apply" ticked, it also writes the listing and the screenshots to App Store Connect (`--apply`).

The script never submits the app for review, attaches a build or releases it: its requests for those are refused before
they're sent. The App Review contact is entered on the App Store Connect website, never here.

## Performance budgets

`AquaTomeUITests/PerformanceTests` measures launch (to the first screen answering touches) and flinging through 800 fish
(`-large-handbook`: the app's CPU time and peak memory). Job `perf` runs them on a GitHub-hosted Mac's simulator, archives the app
unsigned for its size, and `scripts/check-perf.py` checks each median against `perf-budgets.json`; a budgeted measurement
that's missing or reads 0 fails. The simulator reports no scroll hitches, so the list is budgeted by the CPU time it
costs (1.7% apart run to run on CI); the runners' virtual Macs read CPU instructions as 0.
Budgets only tighten (`docs/governance.md`, Mobile apps rule 5). They're kept in that file rather than an Xcode
`.xcbaseline`, which belongs to one machine model and would silently stop applying when the hosted runners change.

The app icons a reader chooses (`AppIconPicker`, drawn by `scripts/app-icons.py`) are much of the app's size: 32
alternates at home-screen sizes only (iPhone 60 pt @2x/@3x, iPad 76 and 83.5 pt @2x; iOS scales them down for
Spotlight, Settings and notifications), measured on one Mac, 2026-11-03 (the previews 2026-11-04):

| Icons | Archive (all devices) | One iPhone (phone @3x)* |
| --- | --- | --- |
| 23 fish | 3,921.7 kB | 924.0 kB |
| 6 seasonal | 882.4 kB | 207.6 kB |
| 3 earlier designs | 58.5 kB | 13.5 kB |
| Their previews in the picker (33, with the default's) | 297.5 kB | 183.1 kB |
| The app without them | 3,078.1 kB | 3,052.7 kB |
| The app with them | 8,229.9 kB | 4,395.5 kB |

\* An estimate: `assetutil` thinning of the archive's `Assets.car` for an iPhone at @3x, the rest as archived (the
binary is arm64 only). Not an App Store export's thinning report, which needs signing. The size budget is on the
archive. Each icon cost about 150 kB there and 40 kB on one iPhone, before quantizing: its gradients barely compress
(CoreUI keeps each size as ARGB, lzfse), where the flat earlier designs cost 20 kB. With the 40, 29 and 20 pt sizes too
the archive was 10,625 kB. An icon set doesn't load as an image, so the picker shows each icon from a preview at its 64
points, @2x and @3x, stored lossy: 308 kB for the 33 by actool alone, where lossless pictures are 1,178 kB and SVG 2,233
kB (actool keeps three pictures of an SVG beside it). The last row also has #445's code (+18 kB).

The default since 2026-11-04, the round fish with leaf fins (the owner's choice; the AT stays an alternate), costs more
than the AT did. Its 1024 is kept for iPhone and iPad (one universal entry; actool writes one for each, and a device gets
its own), in three looks: as drawn, dark and tinted. They are gradients, which CoreUI stores as ARGB, lzfse, whatever the
asset catalog says, so `app-icons.py` quantizes each (pngquant, dithered, 256 colours): the drawn one costs 246.4 kB a
device where it cost 467.9 lossless, alike at home-screen and App Store sizes (faint rings around its glows only at full
size). Without dithering it bands; without its glows it would cost 155 kB lossless but look flatter. Per device: the
drawn 1024 246.4 kB (the AT's 25.3), dark 89.1, tinted 33.7; the home-screen PNGs beside the app 49.2 kB (the AT's 8.5).
With the picker's three new alternates (a book-page fin, a magnifier, the AT) and their previews, the archive is 9,367.4
kB, 4,933.5 kB on one iPhone (the same estimate).

The alternates drawn by `app-icons.py` (34 of them; the AT, flat and hand-drawn, isn't: its gamma moves its colour) are
quantized the same way since 2026-11-04: Assets.car 6,243.8 → 3,171.9 kB, so the archive is 6,295.5 kB, 4,211.8 kB on
one iPhone (the table above is from before). At home-screen size each looks as it did; zoomed in with the contrast
pushed, the dark glows show faint grain, and one glow's edge faint rings; no bands.

Release builds optimize for size (`-Osize`: the project's Release setting, and `swiftSettings` for the kit's modules):
the app does nothing CPU-heavy, and its archive is 10% smaller (1,310 → 1,180 kB, 2026-11-01). The performance tests run
Debug builds, so they don't see it.

## The flows on CI

`ios.yml` runs the UI flows in two tiers:

- **A pull request** runs the smoke set, ten flows across the app's main journeys (the app starts and its tabs open, a
  search opens a page the app draws, a fish's facts, a tank made and a fish put on it, the tank-mates check, the fake
  light connected and a preset written, a sign-in on the stand-in server, a shelf kept for offline: about 6 minutes
  after the build), when its change can reach any flow. With it: the whole class of each flow file it edits, in that
  class's job, so a check added or changed is seen to pass; and the page shots, when its change can reach the pages
  (governance rule 6). The other flows its change can reach run on main after the merge: `scripts/flows-to-run.py`
  maps the app's folders and files to them, and the job "which flows this change needs" names their classes in a
  notice. Label the pull request `ios-full` to run them on it, as on a change to a model many flows share
  (LightsModel, HandbookModel's fixture, AccountModel). `ios.yml`, `flows-to-run.py`, the scripts the flow jobs run
  and the flows' shared code (a file in `AquaTomeUITests` that isn't a class's own) run every flow. The script's
  `--test` fails when a flow it names is renamed. Jobs `kit` and `perf` (with the translations) run on every ready
  pull request. Until 2026-11-05 a pull request also ran every flow its change could reach, one to two and a half
  hours of GitHub's Macs: the owner chose this instead.
- **Every flow** runs on main after merges, every night at 02:30 Vietnam time on main (without `perf`: each change was
  measured by its pull request's run), by hand (Actions → "iOS app: build and tests" → Run workflow), and on a pull
  request labelled `ios-full`. Adding a label runs the pull request again, in place of its run in progress: `ios-full`
  with every flow, any other label as a push would. A main run that started is never cancelled; of those waiting for
  it, only the newest is kept (a merge, the nightly run or one by hand), and it covers every merge since the last run
  (a full run for each merge held the own Mac for hours when several merged at once). So a run by hand on main that is
  still waiting is dropped when a merge lands, and a break main's run catches may come from any merge since its last
  run.

A failed job on main's run opens an issue labelled `ios-main-red` (job `report`), or comments on the one open; main's
next run with every job passed closes it. A break that only main's run catches is fixed forward first, in a pull request
of its own. If the notice on the pull request that broke it didn't name the flow, give `flows-to-run.py` the rule that
would have.

## CI's own Mac

Jobs `kit`, `app`, `handbook` and `lights` of `ios.yml` run on the repository's own Mac (self-hosted runners, label
`aquatome`) for main (after merges, the nightly run and a run by hand) and for pull requests its owner opens from this
repository's own branches. GitHub's Macs keep everything else: a fork's or a bot's pull request (the automatic fixes'),
and job `perf` (its budgets are GitHub's Macs' readings). The Mac has two runners, `aquatome-mac-1` and
`aquatome-mac-2`, each running one job at a time, so the jobs take turns two at a time.

The runners run as that Mac's user, with its keys. `ios.yml` only routes: a fork's pull request runs its own copy of
the workflows, which can name the label. What keeps others' code off the Mac is each runner's job-started hook
(`ACTIONS_RUNNER_HOOK_JOB_STARTED` in its `.env`, a script outside the repository): any job but one of main's (a push,
the nightly run, a run by hand) or a pull request from the owner off one of this repository's branches fails before its
first step. Approving an outside contributor's run (required for every one, by the repository's Actions setting) runs
their workflows, on GitHub's Macs if the hook holds; read them first.

- Off, when the Mac is away or asleep: `gh variable set IOS_LOCAL_RUNNER --body off`. New runs then go to GitHub's Macs;
  runs already queued for the Mac wait for it. "Re-run failed jobs" keeps where the jobs ran: re-run all jobs instead.
  `--body on` brings them back.
- The runners: each in `~/actions-runner/<name>`, registered with `--labels aquatome` and run as a login service
  (`./svc.sh install && ./svc.sh start`), their hook in `~/actions-runner/hooks/`. The Mac must not sleep. They build
  with that Mac's own Xcode, which can be newer than GitHub's.
- Their simulators: one each, `aquatome-ci-1` for `aquatome-mac-1` and `aquatome-ci-2` for `aquatome-mac-2`, made with
  `xcrun simctl create aquatome-ci-<n> "iPhone 17" com.apple.CoreSimulator.SimRuntime.iOS-26-5`, with its id in that
  runner's `.env` as `AQ_CI_UDID=<id>`. The simulator jobs' `scripts/wait-for-simulator.sh` erases it first, points
  xcodebuild at it, and shuts it down after. The flow jobs run xcodebuild with `exec`, so a cancelled job's stop
  reaches it; as a net under that, the script also stops any xcodebuild still working in that runner's own checkout
  (after a job, and before the next) and clears `build/` before a job. Two runners never share one (each would erase
  the other's mid-test), and nothing else on that Mac may use a simulator named `aquatome-ci-*`.

## AquaTomeKit

`AquaTomeKit/` is a Swift package with the device code, no UI:

| Module | What |
| --- | --- |
| `Chihiros` | Frames and replies (a port of the site's `apps/site/src/scripts/chihiros.ts`), the timeline's rules as the site's light page has them (`Plan.swift`: handles kept apart, ramps that fit, the day's curve, the day preview's pace; `Colour.swift`: the colour a mix shows, a tank lit by it, the looks), `LightSession` (the order and pace the light accepts, and going back to the schedule after levels set by hand), `FakeLight` (tests, simulator) |
| `ChihirosBLE` | CoreBluetooth: scan for lights, connect, acknowledged writes |
| `light-harness` | A Mac command line that drives a real light through the same code |
| `Tanks` | "Bể của tôi": the site's tank and device records (`packages/schema/src/tanks.ts`), checked and merged as `docs/my-tanks-sync.md` says; a plug put on a tank and its outlets named (`PlugRecord`), the outlet a light is plugged into (`PowerOutlet`) |
| `Handbook` | The site's page index for the app (`/app/<lang>.json`, `apps/site/src/lib/app-index.ts`), with each fish's figures and behaviour under the tank-mates tool's names, each guide's subject and the fish and plants it names, a video guide's length, the video series, and each tool's own words for search, what it's browsed by (fish groups, plant care, the site's home picks and its words for them), the pages as blocks to draw natively (`PageDoc`, `/app/pages/`, read leniently: a block it can't read is "open on the web"; `PageCache` keeps their shards on the phone, read again once a run), and searching it: without accents, đ as d, any word order, a page named what was searched for first (by its name, scientific name or another name, as the site's search ranks it: "bảy màu" finds Cá bảy màu before Bảy màu Koi), a tool's own words after every name; where a link in a page goes (`PageRoute`, `AppScreen`, whose `page` case is a page the index lists, opened on the tab in front; `ShopLink`, the site's /go/ links, which our own copies resolve under their mark before opening the shop); the script that shares the tanks with a page (`PageBridge`, tested in JavaScriptCore); the fish-ID tool's request and answers (`FishId`) |
| `TankCheck` | A tank's fish checked as the site's tank-mates tool checks them: the site's own code (`apps/site/src/scripts/tank-check.ts`), bundled into `tank-check.js` by `apps/site/scripts/app-tank-check.mjs` and run in JavaScriptCore, never ported. The site's tests fail when the bundle is older than the site's code. A breed that is a form of a species (`of` in the index) goes to it as that species, and the check makes a species and its breeds one fish |
| `AccountSync` | Signing in to an aquatome.com account and syncing "Bể của tôi" with it (`protocols/accounts.openapi.json`): a bearer token, no cookies; Google's sign-in without its SDK (`GoogleOAuth`: its page, its answer, the code exchanged with PKCE); `FakeAccounts`, the server in process, and `FakeGoogle`, Google's page and token endpoint in process (tests, simulator), the fish-ID tool's too |
| `Plugs` | Smart plugs (docs/smart-plugs.md): `PlugSource`, where they come from (`TuyaPlugs`: Tuya's cloud with the reader's project keys, signed requests, the list, a switch read back, a strip's timers read: `PlugTimer`, once per light's card: `OutletTimers`), `PlugBoard`, what the app shows and the switching rules, whichever source it is; `FakeTuya`, Tuya's cloud in process (tests, simulator) |

```sh
cd apps/ios/AquaTomeKit
swift test
```

A read-only check of the Tuya route against a real project (the owner's): `AQUATOME_TUYA_LIVE=1` with `TUYA_ACCESS_ID`
and `TUYA_ACCESS_SECRET` set, `swift test --filter liveListRead`. It reads the list once, switches nothing, and prints
counts only.

The tests read `protocols/chihiros-vectors.json`, `protocols/tanks-vectors.json`, `protocols/tankmates-vectors.json`,
`protocols/filter-vectors.json`, `protocols/search-vectors.json`, `protocols/page-vectors.json` and
`protocols/unlisted-vectors.json`, the same vectors as the site's tests. A protocol or schema change updates the vectors
and both implementations together.

## Testing on a real light

The iOS Simulator has no Bluetooth. Drive the light from a Mac with the harness, from a terminal that has Bluetooth
permission:

```sh
swift run light-harness status                       # firmware, clock, saved schedule
swift run light-harness write 13:00 19:00 15 40 50 60
swift run light-harness clock-at 03:07               # a wrong clock…
swift run light-harness clock                        # …set right again
swift run light-harness restore                      # always, at the end
```

`restore` writes the owner's everyday schedule (12:00–20:00, 70% red/green/blue, 30-minute ramp) and checks the light
reports it. Light names carry the device's address, so the harness doesn't print them; keep them out of the repository.
