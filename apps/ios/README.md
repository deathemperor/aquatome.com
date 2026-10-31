# AquaTome for iOS

The native app: device control (Chihiros lights first) and the handbook. SwiftUI, iOS 17+.

## AquaTomeKit

`AquaTomeKit/` is a Swift package with the device code, no UI:

| Module | What |
| --- | --- |
| `Chihiros` | Frames and replies (a port of the site's `apps/site/src/scripts/chihiros.ts`), `LightSession` (the order and pace the light accepts), `FakeLight` (tests, simulator) |
| `ChihirosBLE` | CoreBluetooth: scan for lights, connect, acknowledged writes |
| `light-harness` | A Mac command line that drives a real light through the same code |

```sh
cd apps/ios/AquaTomeKit
swift test
```

The tests read `protocols/chihiros-vectors.json`, the same vectors as the site's tests. A protocol change updates the
vectors and both implementations together.

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
