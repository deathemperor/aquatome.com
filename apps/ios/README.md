# AquaTome for iOS

The native app: device control (Chihiros lights first) and the handbook. SwiftUI, iOS 17+.

Three tabs: **Tìm** searches and browses the handbook natively and opens each page of aquatome.com in the app (kept on
the phone for reading offline, without ads); **Bể của tôi** keeps the reader's tanks (name, inside size and litres,
substrate, notes, the fish and plants on it, each opening its page; put on from a fish or plant page, or from the tank, a fish with how many, and swiped to change the number or take one off; checked as the site's tank-mates tool checks them: whether they go together, and whether the tank is big and long enough) on the phone with no account, in the same store the
site uses, and shares a copy as JSON; **Đèn** controls the lights, and each light connected is kept on a tank with the
schedules written to it (as the site does). A tank also shows its Smart Life power strips ("Ổ cắm"), each outlet
named for what it powers, with its switch: the app calls Tuya's cloud itself, with the reader's own Tuya project keys
kept in the Keychain, and no AquaTome account (docs/smart-plugs.md).

The site's pages in the app share the reader's tanks with it (`PageBridge`): the tools' "Lưu vào Bể của tôi" saves to
the app's tanks, merged record by record, and each page sees them. A link to "Bể của tôi" or the Chihiros page, and
those tools in the handbook, open the app's own tab (`AppScreen`); the tools' "Xem trong Bể của tôi →" opens the tank
just saved.

Signing in (Sign in with Apple, or a code sent by email) syncs the tanks with an aquatome.com account, as the site's
page does: the token is in the Keychain, on this phone only. The email sign-in's Turnstile check runs in a web view
on the site's page for it (`/api/v1/auth/email/turnstile`), since Turnstile runs only in a web page on the site's host.
A debug build on the simulator (every UI and performance test) gets a stand-in server, Apple sheet and Turnstile check
inside the app instead (`AquaTome/Account/FakeServer.swift`; accounts on with `-fake-accounts on`; every emailed code
is `123456`), so no test reaches aquatome.com; `-real-accounts` tries the real server from the simulator.
Likewise for the plugs: a stand-in Tuya cloud with made-up keys and strips (`PlugsModel.forSimulator`;
`-seed-tuya-keys` starts with its keys entered), so no test reaches Tuya; `-real-tuya` tries Tuya itself.

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
- by hand (Actions → testflight → Run workflow)

Signing is Xcode's automatic, cloud-managed signing with the App Store Connect API key (secret
`APP_STORE_CONNECT_API_KEY`; variables `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APPLE_TEAM_ID`):
no certificate or profile is in the repository. Only the export signs: the archive is built unsigned and carries its
entitlements in an ad-hoc signature, because signing the archive on a fresh runner makes a new development certificate
each time, until Apple's cap stops the build. The job signs a local copy first and checks it has every entitlement in
`Config/AquaTome.entitlements`; only then does it export again to App Store Connect. The build number is the workflow's run number. A pull request that changes the project,
`Config/` or the workflow signs and exports without uploading.

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
| `Handbook` | The site's page index for the app (`/app/<lang>.json`, `apps/site/src/lib/app-index.ts`), with each fish's figures and behaviour under the tank-mates tool's names and each guide's subject and the fish and plants it names, what it's browsed by (fish groups, plant care, the site's home picks and its words for them), and searching it: without accents, đ as d, any word order; where a link in a page goes (`PageRoute`, `AppScreen`); the script that shares the tanks with a page (`PageBridge`, tested in JavaScriptCore) |
| `TankCheck` | A tank's fish checked as the site's tank-mates tool checks them: the site's own code (`apps/site/src/scripts/tank-check.ts`), bundled into `tank-check.js` by `apps/site/scripts/app-tank-check.mjs` and run in JavaScriptCore, never ported. The site's tests fail when the bundle is older than the site's code |
| `AccountSync` | Signing in to an aquatome.com account and syncing "Bể của tôi" with it (`protocols/accounts.openapi.json`): a bearer token, no cookies; `FakeAccounts`, the server in process (tests, simulator) |
| `Plugs` | Smart plugs (docs/smart-plugs.md): `PlugSource`, where they come from (`TuyaPlugs`: Tuya's cloud with the reader's project keys, signed requests, the list, a switch read back), `PlugBoard`, what the app shows and the switching rules, whichever source it is; `FakeTuya`, Tuya's cloud in process (tests, simulator) |

```sh
cd apps/ios/AquaTomeKit
swift test
```

A read-only check of the Tuya route against a real project (the owner's): `AQUATOME_TUYA_LIVE=1` with `TUYA_ACCESS_ID`
and `TUYA_ACCESS_SECRET` set, `swift test --filter liveListRead`. It reads the list once, switches nothing, and prints
counts only.

The tests read `protocols/chihiros-vectors.json`, `protocols/tanks-vectors.json` and `protocols/tankmates-vectors.json`,
the same vectors as the site's tests. A protocol or schema change updates the vectors and both implementations together.

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
