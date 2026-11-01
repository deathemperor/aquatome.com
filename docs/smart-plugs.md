# Smart plugs: Tuya (Smart Life) and eWeLink (Sonoff)

Aquarium keepers in Vietnam time their CO2, lights and filter with Wi-Fi power strips: Tuya "Smart Life" strips sold
by aquascape shops, and Sonoff switches on eWeLink (docs/research/aquarium-device-control.md). AquaTome shows the
outlets on each tank, named for what is plugged in ("ổ 2 = CO2"), and switches them, in the app and later on the site.

These are cloud devices: a phone or a browser can't reach them directly. AquaTome's server (the site's worker) talks to
each maker's cloud for the reader, with keys only the server holds. So plugs need an AquaTome account: a reader links
their Smart Life or eWeLink account to it once.

- API between the app (and site) and the server: `protocols/plugs.openapi.json`.
- On a tank, a plug is a device record (`packages/schema/src/tanks.ts`, `kind: "plug"`), synced like the lights.

## Linking a maker's account

Built for every reader from the start: links are per AquaTome account, and each maker's link step is its own piece.
What each maker allows today:

| | How a reader links | Who can link today |
|---|---|---|
| **Tuya** (Smart Life, Tuya Smart) | OAuth: sign in on Tuya's page and approve AquaTome, as Google Home does. Tuya documents this for a cloud project, but whether it accepts Smart Life accounts (not only a company's own-brand app) is **unconfirmed** for AquaTome's project. If it doesn't, the routes are an arrangement with Tuya (as Home Assistant has) or Tuya's paid app SDK, where readers pair their strips again inside AquaTome. | The owner: the project's developer console links one Smart Life account by QR code. |
| **eWeLink** (Sonoff) | OAuth on eWeLink's page (`c2ccdn.coolkit.cc/oauth`), with the account's region returned for its API host. The free developer tier covers it, with a monthly call limit; a public launch needs the paid tier. | Nobody yet: the developer account's review is pending. |

Until a maker opens linking to everyone, `POST /api/v1/plugs/{provider}/link` answers `not_available`, and the app says
plugs are coming. Nothing else changes when it opens.

## What the server keeps

- `plug_links` (D1): AquaTome user id, maker, the maker's user id, and the maker's tokens **encrypted at rest** (AES-GCM,
  keyed by a worker secret). Deleting the link or the account deletes the row.
- Makers' keys (Tuya access id and secret; eWeLink app id and secret) are worker secrets. Without them the plug routes
  answer `not_configured`, and everything else works.
- No device ids, maker user ids or tokens in the repository (it is public), in logs, or in analytics. The owner's own
  link goes in by a hand-run command, never a committed file.

## Switching mains power

A plug switches mains power to a CO2 solenoid, a heater or a filter. So:

- **Only on a reader's tap.** Nothing switches on its own in this first version: no schedules, no rules.
- **What the plug reports, not what was asked.** After a command the server reads the outlet back and returns its
  state; the app never shows a switch as changed before the plug says so, and says when the plug hasn't confirmed.
- **The strips' own timers are left alone.** They keep running when AquaTome, the server or the maker's cloud is down,
  which is the failure to want. AquaTome doesn't read or write them yet.
- Offline plugs are shown as offline; a command to one is refused (`offline`), not queued.

## Plugs on a tank

A plug's device record: `kind: "plug"`, `brand` the maker (`tuya`, `ewelink`), `remoteId` the maker's device id, and
`outlets`, each with its `code` (the maker's switch code), what it powers (`role`: `light`, `co2`, `filter`, `heater`,
`air`, `fan`, `other`; open, like `kind`) and an optional `label`. A strip is on one tank; its outlets are named there.
The live state (on, off, online) is never stored: it comes from the server each time.

## Later

- Timing CO2 with the light's schedule (an outlet with `role: "co2"` on the same tank as a light), once switching has
  run safely for a while. That writes the strip's own timers, so they still run without AquaTome.
- Plugs on the site's "Bể của tôi", with the same API.

## For the owner

- Tuya's free IoT Core trial lasts about a month and must be renewed (up to 6 months at a time) in the developer
  console, or the keys stop working and plugs show as unreachable.
- eWeLink: the free tier allows 50,000 calls a month per region; ask CoolKit (bd@coolkit.cn) for the paid tier's price
  before a public launch.
