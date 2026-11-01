# Smart plugs: Tuya (Smart Life) and eWeLink (Sonoff)

Aquarium keepers in Vietnam time their CO2, lights and filter with Wi-Fi power strips: Tuya "Smart Life" strips sold
by aquascape shops, and Sonoff switches on eWeLink (docs/research/aquarium-device-control.md). AquaTome shows the
outlets on each tank, named for what is plugged in ("ổ 2 = CO2"), and switches them, in the app and later on the site.

These are cloud devices: a phone or a browser can't reach them on the local network the way the app reaches a
Chihiros light. They're reached through the maker's cloud, with keys the cloud gives.

## Tuya: the reader's own cloud project, keys on the phone

The route the app takes today. Each reader makes their own Tuya cloud project (free), links their Smart Life account
to it, and enters the project's keys in the app once; the app then calls Tuya's cloud itself
(`apps/ios/AquaTomeKit/Sources/Plugs/TuyaPlugs.swift`). No AquaTome account and no AquaTome server are involved.

Why: Tuya's OAuth ("sign in with Smart Life and approve AquaTome") is only for a company's own branded app, and the
free IoT Core trial is for a person's own, non-commercial use. So AquaTome can't hold one project for every reader;
each reader brings their own. A request to Tuya for an authorization of Smart Life for AquaTome itself (as Home
Assistant has, by QR code) is filed; if it comes through, it becomes another `PlugSource`, and nothing else changes.

The setup, as the app's "Thiết lập ổ cắm" screen walks it (once, on a computer):

1. Create a Tuya developer account at platform.tuya.com.
2. Cloud → Development → Create Cloud Project: industry "Smart Home", development method "Smart Home", and the data
   center of the reader's Smart Life account.
3. Turn on the IoT Core trial (Cloud → Cloud Services → IoT Core).
4. In the project, Devices → Link App Account → Add App Account, and scan the QR code with Smart Life (Me → the scan
   icon).
5. Copy the project's Access ID and Access Secret (its Overview page) into the app, pick the data center (Western
   America by default; also Eastern America, Central Europe, Western Europe, India, China), and press "Kiểm tra": the
   app reads the list, and keeps the keys only once that works.

The free trial lasts about a month and must be renewed in the console (up to 6 months at a time). Run out, the app
says so plainly (Tuya's code 28841002, "cloud development plan expired") and can't switch; the strips' own timers keep
running. Wrong keys or the wrong data center (1001, 1004, 1005), no IoT Core (28841001, 28841101, 28841105), calls
used up (28841004, 28841104) and the phone's clock being off (1013) are each said plainly too; a project with no
Smart Life account linked lists no devices, and the app says to scan the QR code. Tuya refusing the project its
devices (1106, "permission deny": no account linked, another account, or another data center) says the same, and to
check the data center.

What the app asks of Tuya: a token (`/v1.0/token`, kept until a minute before it expires; codes 1010, 1011 and 1012
get a new one and the request is asked once more, nothing else is retried), the devices of the linked account
(`/v1.0/iot-01/associated-users/devices`, page by page; each carries its status), the names the reader gave the
outlets in Smart Life (`/v1.0/devices/{id}/multiple-names`), and for a switch, one command
(`/v1.0/iot-03/devices/{id}/commands`) and the outlet read back (`/v1.0/iot-03/devices/{id}/status`). Requests are
signed with HMAC-SHA256 as https://developer.tuya.com/en/docs/iot/new-singnature says.

**eWeLink** (Sonoff): coming later. OAuth on eWeLink's page, on its free developer tier with a monthly call limit;
the developer account's review is pending.

## What's kept where

- **The keys**: in the iPhone's Keychain, as one generic password (Access ID, Access Secret, data center), this device
  only (`AfterFirstUnlockThisDeviceOnly`, not synced, not in a backup restored elsewhere). Never in UserDefaults,
  never logged, never sent anywhere but to Tuya, never to AquaTome. "Xóa khóa" deletes them; so does reinstalling the
  app. The simulator's stand-in cloud keeps its made-up keys in memory only.
- **The plugs on a tank**: device records in "Bể của tôi" (below), synced like the lights if the reader signs in.
  They hold the maker's device id and the outlets' names, never a state or a key.
- **The live state** (on, off, online): read from Tuya each time, never stored.
- No device ids, Tuya user ids, keys or tokens in the repository (it is public), in logs, or in analytics.

## The server route (parked)

AquaTome's server (the site's worker) holding each reader's link, with the makers' keys as worker secrets, was the
first design: `protocols/plugs.openapi.json`, and PR #291 (Tuya's list and switch, by the owner's own link). It is
parked: Tuya's OAuth is for branded apps only, and the trial forbids commercial use. The contract stays as the record
of that design, and as the shape a server route would take if a maker opens linking to everyone.

## Switching mains power

A plug switches mains power to a CO2 solenoid, a heater or a filter. So:

- **Only on a reader's tap.** Nothing switches on its own in this first version: no schedules, no rules. Clients send a
  switch only while the reader taps it, online: never through the tanks' save-then-sync path, no outbox, no retry, nothing
  queued while offline.
- **A switch sets a state; it never toggles.** `{on: true}` twice leaves the outlet on, so a double tap or a repeated
  request does no harm.
- **What the plug reports, not what was asked.** After a command the outlet is read back every 600 ms until the plug
  reports the state asked for (up to 3 seconds by the clock: a slow read counts, and none is waited on past them); the
  app never shows a switch as changed before the plug says so.
  Unconfirmed, or the answer lost (Tuya's error, no network), it reads the list again once, and doesn't send the switch
  again. A heater or CO2 outlet asks the reader to confirm first, either way: the wrong state can harm the fish, and
  which way is dangerous depends on the tank and the hour. So does an outlet with no role, or one the app doesn't
  know: it could be either.
- **The strips' own timers are left alone.** They keep running when AquaTome or the maker's cloud is down,
  which is the failure to want. AquaTome doesn't read or write them yet.
- Offline plugs are shown as offline; a command to one is refused (Tuya's 2001, or listed offline), not queued.

## Staying within the makers' limits

Tuya's trial has a call quota per project, so per reader: the app asks for the list when a tank's screen opens or is
pulled to refresh, never on a timer (a list is one token while it lasts, a page of devices, and one call per strip for
its outlets' names; a switch is one command and up to five reads), and gives Tuya 8 seconds before calling it
unreachable. Calls used up show as such, not as broken. eWeLink's free tier allows 50,000 calls a month per region,
at most one call per 500 ms.

## Plugs on a tank

A plug's device record: `kind: "plug"`, `brand` the maker (`tuya`, `ewelink`), `remoteId` the maker's device id, and
`outlets`, each with its `code` (the maker's switch code: Tuya's `switch_1`…; eWeLink's `switch` for a single outlet, else
the outlet's number from 0), what it powers (`role`: `light`, `co2`, `filter`, `heater`,
`air`, `fan`, `other`; open, like `kind`) and an optional `label`. A strip is on one tank; its outlets are named there.
The live state (on, off, online) is never stored: it comes from the maker's cloud each time.

The site's "Bể của tôi" keeps a synced tank's plug records as they are but doesn't show them yet (only lights are
listed, and counted when a tank is deleted). App builds from before plugs list them among a tank's lights.

## Later

- Timing CO2 with the light's schedule (an outlet with `role: "co2"` on the same tank as a light), once switching has
  run safely for a while. That writes the strip's own timers, so they still run without AquaTome.
- Plugs on the site's "Bể của tôi".

## For the owner

- A read-only check against the owner's own project: `AQUATOME_TUYA_LIVE=1` with `TUYA_ACCESS_ID` and
  `TUYA_ACCESS_SECRET` in the environment, then `swift test --filter liveListRead` in `apps/ios/AquaTomeKit`. It reads
  the list once, switches nothing, and prints counts only.
- eWeLink: the free tier allows 50,000 calls a month per region; ask CoolKit (bd@coolkit.cn) for the paid tier's price
  before a public launch.
