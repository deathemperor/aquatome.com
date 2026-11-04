# AquaTome for iOS

The native app: device control (Chihiros lights first) and the handbook. SwiftUI, iOS 17+.

Three tabs: **Tìm** opens on a home of shelves as the site arranges its pages (fish groups, plants by where they go,
guides by subject, the video series and video guides, tools, the glossary by letter; fish filtered to a tank, its water and difficulty, plants to its
light and CO₂, as the site's lists filter them), searches and browses the handbook natively, draws the guides, fish, plants, glossary terms and video series itself from the site's pages as blocks (`/app/pages/`; a fish's gallery, tank-mates, Vietnamese climate, breeds, videos and the sources behind its figures, a series' guides as cards, each photo credited, and its readers' photos and comments as the site has them, a reader signed in to aquatome.com posting their own (a photo shrunk and stripped of its location first, with their consent, and the link that takes it back shown once), and any reader, signed in or not, reporting another's comment or photo or blocking who posted it on this phone (App Store guideline 1.2; the blocked listed in the tanks tab to let back),
kept on the phone with their pictures, so a guide read once reads offline, and a shelf of guides can be kept for offline at once, asking first on mobile data and not with too little room, stopped with nothing half-kept, the kept pages listed in one place on the Tìm home and let go of there; a group named in a page opens the app's shelf of that group; a part it can't draw opens the web page, and a page of the site it can't draw, the web page in the app),
and opens the other pages of aquatome.com in the app (kept on the phone for reading offline, without ads; videos
and the pages they link to become native the same way, tools stay web pages until rebuilt), a fish's facts under its name (size, temperature, pH, hardness, the shortest tank,
temperament, difficulty) and a plant's care (difficulty, light, CO₂, growth, where it goes), from the index on the phone, so offline too, and the pages saved to read later and read last; **Bể của tôi** keeps the reader's tanks (name, inside size and litres,
substrate, notes, the fish and plants on it, each opening its page; put on from a fish or plant page, or from the tank, a fish with how many, and swiped to change the number or take one off; one the handbook has no page for put on by name, marked "chưa có trang" until a page has its scientific name, and sent once, with no account, as a name readers want pages for; checked as the site's tank-mates tool checks them: whether they go together, and whether the tank is big and long enough; and the guides that name them, the video guides apart) on the phone with no account, in the same store the
site uses, and shares a copy as JSON; **Đèn** controls the lights, and each light connected is kept on a tank with the
schedules written to it (as the site does). A tank also shows its Smart Life power strips ("Ổ cắm"), each outlet
named for what it powers, with its switch: the app calls Tuya's cloud itself, with the reader's own Tuya project keys
kept in the Keychain, and no AquaTome account (docs/smart-plugs.md).

The site's pages in the app share the reader's tanks with it (`PageBridge`): the tools' "Lưu vào Bể của tôi" saves to
the app's tanks, merged record by record, and each page sees them. A link to "Bể của tôi" or the Chihiros page, and
those tools in the handbook, open the app's own tab (`AppScreen`); the tools' "Xem trong Bể của tôi →" opens the tank
just saved.

Signing in (Sign in with Apple, a code sent by email, or a passkey) syncs the tanks with an aquatome.com account, as
the site's page does: the token is in the Keychain, on this phone only. "Thêm passkey" adds one made on the phone, as on
the site: more than 10 minutes after signing in, the server asks for a sign-in first, and one to the same account
carries on. The email sign-in's
Turnstile check runs in a web view on the site's page for it (`/api/v1/auth/email/turnstile`), since Turnstile runs
only in a web page on the site's host. Passkeys are aquatome.com's, shared with the app through its webcredentials
association (`Config/AquaTome.entitlements` and the site's `/.well-known/apple-app-site-association`); only a signed
build on an iPhone can use them, so the simulator never runs the real passkey sheet.
A debug build on the simulator (every UI and performance test) gets a stand-in server, Apple sheet, passkey sheet and
Turnstile check inside the app instead (`AquaTome/Account/FakeServer.swift`; accounts on with `-fake-accounts on`;
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

  A change to how a screen looks shows it before and after (`docs/governance.md`, Mobile apps rule 6):
  `AquaTomeUITests/PageShotsFlowTests` screenshots a fish, a plant and a guide top to bottom, light and dark, and CI's
  job `handbook (1)` uploads them as the `ios-page-shots` artifact. Locally:

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

## Anonymous telemetry

What the privacy policy lists, to aquatome.com's own Worker, nothing to anyone else (`AquaTomeKit/Sources/Telemetry`;
`Wire.swift` holds the requests, built against the draft of `POST /api/v1/app/events` and
`POST /api/v1/app/diagnostics` until the contract is in `protocols/`):

- **Events**, in batches of up to 100 with the app's version, iOS's version, the phone's model (`iPhone17,3`), the
  language and a session id made at launch and never kept for another: `view` (a page the app draws, by its path; a
  tab, a tank's screen, a shelf), `scroll` (25, 50, 75, 100%) and `time` (30, 60, 180 s) on a page the app draws,
  `aff` (a shop link tapped there), and `action` (`light.connect`, `light.write`, `plug.switch`, `tank.add`,
  `post.comment`, `post.photo`, and `fishid` once its screen is in: whether it worked and why not, as a code). The
  site's pages shown as web pages are counted by their own script, as on the site. No account, name, device address or
  name, tank name, search text or photo: `TelemetryTests` fails on a field outside the policy's list.
- **iOS's reports** (MetricKit): a day's measures, and crashes and hangs with their call stacks, as iOS writes them.
- **When**: every 30 s and when the app goes to the background, off the main thread. They wait in a file in the caches
  folder (500 events at most, the oldest dropped; 8 reports), and after a failure the next try waits 30 s, doubling
  up to 30 minutes. Our own copies are marked as their page views are (`OwnCopy`).
- **Off** until the site's index says `telemetry: true` (`HandbookIndex.telemetry`; absent or false, the app drops what
  waits and records nothing), and whenever the reader turns off "Gửi thống kê ẩn danh" (Tài khoản; for now the end of
  Bể của tôi's list), which drops what waits too.

On the simulator the requests go to a stand-in Worker (`FakeCollector`), shown to the UI tests as `telemetry-received`
(`TelemetryFlowTests`); `-site-telemetry` gives the fixed index the site's flag, and `-telemetry-down` makes the
stand-in answer 503.

## Performance budgets

`AquaTomeUITests/PerformanceTests` measures launch (to the first screen answering touches) and flinging through 800 fish
(`-large-handbook`: the app's CPU time and peak memory). Job `app` runs them on the CI simulator, archives the app
unsigned for its size, and `scripts/check-perf.py` checks each median against `perf-budgets.json`; a budgeted measurement
that's missing or reads 0 fails. The simulator reports no scroll hitches, so the list is budgeted by the CPU time it
costs (1.7% apart run to run on CI); the runners' virtual Macs read CPU instructions as 0.
Budgets only tighten (`docs/governance.md`, Mobile apps rule 5). They're kept in that file rather than an Xcode
`.xcbaseline`, which belongs to one machine model and would silently stop applying when the hosted runners change.

Release builds optimize for size (`-Osize`: the project's Release setting, and `swiftSettings` for the kit's modules):
the app does nothing CPU-heavy, and its archive is 10% smaller (1,310 → 1,180 kB, 2026-11-01). The performance tests run
Debug builds, so they don't see it.

## AquaTomeKit

`AquaTomeKit/` is a Swift package with the device code, no UI:

| Module | What |
| --- | --- |
| `Chihiros` | Frames and replies (a port of the site's `apps/site/src/scripts/chihiros.ts`), the timeline's rules as the site's light page has them (`Plan.swift`: handles kept apart, ramps that fit, the day's curve, the day preview's pace; `Colour.swift`: the colour a mix shows, a tank lit by it, the looks), `LightSession` (the order and pace the light accepts, and going back to the schedule after levels set by hand), `FakeLight` (tests, simulator) |
| `ChihirosBLE` | CoreBluetooth: scan for lights, connect, acknowledged writes |
| `light-harness` | A Mac command line that drives a real light through the same code |
| `Tanks` | "Bể của tôi": the site's tank and device records (`packages/schema/src/tanks.ts`), checked and merged as `docs/my-tanks-sync.md` says; a plug put on a tank and its outlets named (`PlugRecord`) |
| `Handbook` | The site's page index for the app (`/app/<lang>.json`, `apps/site/src/lib/app-index.ts`), with each fish's figures and behaviour under the tank-mates tool's names, each guide's subject and the fish and plants it names, a video guide's length, the video series, and each tool's own words for search, what it's browsed by (fish groups, plant care, the site's home picks and its words for them), the pages as blocks to draw natively (`PageDoc`, `/app/pages/`, read leniently: a block it can't read is "open on the web"; `PageCache` keeps their shards on the phone, read again once a run), and searching it: without accents, đ as d, any word order, a tool's own words after every name; where a link in a page goes (`PageRoute`, `AppScreen`, whose `page` case is a page the index lists, opened on the tab in front; `ShopLink`, the site's /go/ links, which our own copies resolve under their mark before opening the shop); the script that shares the tanks with a page (`PageBridge`, tested in JavaScriptCore) |
| `TankCheck` | A tank's fish checked as the site's tank-mates tool checks them: the site's own code (`apps/site/src/scripts/tank-check.ts`), bundled into `tank-check.js` by `apps/site/scripts/app-tank-check.mjs` and run in JavaScriptCore, never ported. The site's tests fail when the bundle is older than the site's code |
| `AccountSync` | Signing in to an aquatome.com account and syncing "Bể của tôi" with it (`protocols/accounts.openapi.json`): a bearer token, no cookies; `FakeAccounts`, the server in process (tests, simulator) |
| `Telemetry` | The app's anonymous telemetry (below): the events the privacy policy lists, the queue and its sending, the site's and the reader's switches; `FakeCollector`, the Worker's endpoints in process (tests, simulator) |
| `Plugs` | Smart plugs (docs/smart-plugs.md): `PlugSource`, where they come from (`TuyaPlugs`: Tuya's cloud with the reader's project keys, signed requests, the list, a switch read back), `PlugBoard`, what the app shows and the switching rules, whichever source it is; `FakeTuya`, Tuya's cloud in process (tests, simulator) |

```sh
cd apps/ios/AquaTomeKit
swift test
```

A read-only check of the Tuya route against a real project (the owner's): `AQUATOME_TUYA_LIVE=1` with `TUYA_ACCESS_ID`
and `TUYA_ACCESS_SECRET` set, `swift test --filter liveListRead`. It reads the list once, switches nothing, and prints
counts only.

The tests read `protocols/chihiros-vectors.json`, `protocols/tanks-vectors.json`, `protocols/tankmates-vectors.json`,
`protocols/filter-vectors.json`, `protocols/page-vectors.json` and `protocols/unlisted-vectors.json`, the same vectors as
the site's tests. A protocol or schema change updates the vectors and both implementations together.

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
