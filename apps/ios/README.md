# AquaTome for iOS

The native app: device control (Chihiros lights first) and the handbook. SwiftUI, iOS 17+.

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

- **A real iPhone:** copy `Config/Local.xcconfig.example` to `Config/Local.xcconfig` and put your team ID in it. The
  public project never holds the team ID.

A new string in the code: add its Indonesian and Thai to `Localizable.xcstrings` (Xcode adds the key when it builds);
`check-strings.py` fails CI otherwise. Reuse the site's translation when the Vietnamese is the same
(`apps/site/src/i18n/{id,th}.json`).

## TestFlight

`.github/workflows/testflight.yml` signs the app and uploads it to TestFlight, where the internal group "Owner" gets
each build by itself:

- on every push to main that changes `apps/ios/` or `protocols/`
- on Mondays at 09:00 Vietnam time, when main moved since the last upload (or that build is 60 days old: TestFlight
  builds expire after 90)
- by hand (Actions → testflight → Run workflow)

Signing is Xcode's automatic, cloud-managed signing with the App Store Connect API key (secret
`APP_STORE_CONNECT_API_KEY`; variables `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APPLE_TEAM_ID`):
no certificate or profile is in the repository. The build number is the workflow's run number. A pull request that
changes the project, `Config/` or the workflow signs and exports without uploading.

## AquaTomeKit

`AquaTomeKit/` is a Swift package with the device code, no UI:

| Module | What |
| --- | --- |
| `Chihiros` | Frames and replies (a port of the site's `apps/site/src/scripts/chihiros.ts`), `LightSession` (the order and pace the light accepts), `FakeLight` (tests, simulator) |
| `ChihirosBLE` | CoreBluetooth: scan for lights, connect, acknowledged writes |
| `light-harness` | A Mac command line that drives a real light through the same code |
| `Tanks` | "Bể của tôi": the site's tank and device records (`packages/schema/src/tanks.ts`), checked and merged as `docs/my-tanks-sync.md` says |

```sh
cd apps/ios/AquaTomeKit
swift test
```

The tests read `protocols/chihiros-vectors.json` and `protocols/tanks-vectors.json`, the same vectors as the site's
tests. A protocol or schema change updates the vectors and both implementations together.

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
