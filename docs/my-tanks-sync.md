# My tanks: data model and merge

"Bể của tôi" keeps a reader's tanks and devices on the device first (browser storage on the web, the app's own store on
iOS). Signing in is optional: it backs the same records up to the account and syncs them between the web and the app.
This file is the contract both clients follow.

In the app, the site's pages (its tools save to "Bể của tôi") see the app's store, not one of their own: before a page's
scripts run, the app puts its store in the page's `localStorage['aq.tanks']`, hands an open page each change to it (a
`storage` event, as another tab's save), and each save the page makes comes back to the app and is merged as below
(`apps/ios/AquaTomeKit/Sources/Handbook/PageBridge.swift`). Only the site's own pages, over https, take part. A store the
app is leaving alone (newer, unreadable), or can't save, isn't handed to pages, and a page's store of another version
is never written over.

- Schema: `packages/schema/src/tanks.ts` (zod). JSON Schema for other languages: `protocols/tanks.schema.json`
  (generated; a test fails when it is stale).
- Test cases both clients run: `protocols/tanks-vectors.json` (`valid`, `invalid`, `merge`, `litres`).

## Records

A store is `{ v: 1, tanks: [...], devices: [...] }`. Tanks and devices are separate records, so changing a light's
levels on the phone can't overwrite the tank's notes edited on the web at the same time.

| Record | Holds |
| --- | --- |
| Tank | name, `dims` (inside L × W × H, cm) and/or `litres`, substrate, species `{id, count?}` and plants `{id}` by page id, notes |
| Device | `tankId`, kind (`light`, `plug`), brand, model, nickname. Lights: Bluetooth name, saved schedules, last manual levels, last clock sync. Plugs: the maker's device id (`remoteId`) and the outlets named on the tank (`outlets`: code, role, label; docs/smart-plugs.md) |
| Tombstone | `{ id, updatedAt, deletedAt }` and nothing else: what is left of a deleted tank or device |

Tanks and devices have `id`, `createdAt` and `updatedAt`; a tombstone has `id`, `updatedAt` and `deletedAt` only.

Why devices keep schedules and levels: a Chihiros light reports its clock (status reply `0xfe`, bytes 6–8: ISO weekday,
hour, minute; `00 00 xx` after a power cut reset it) but not its sunrise/sunset schedule (`a5 19`) or its manual levels.
What we wrote is the only record of them: `schedules`, `activeScheduleId` and `manual`.

- **Ids**: lowercase UUIDs, made by the client that creates the record (`crypto.randomUUID()`; on iOS
  `UUID().uuidString.lowercased()`).
- **Timestamps**: real UTC instants with milliseconds, exactly `2026-10-31T12:00:00.000Z`. One form only, so comparing the strings
  compares the times on every platform.
- **Species and plants** are page ids (`paracheirodon-axelrodi`), the same in every language, never slugs or names.
- **Litres**: `litres` when set (round and corner tanks, from the volume tool), else `l × w × h / 1000` of `dims`.
- **Open values**: `kind`, `brand`, `substrate` and an outlet's `role` are strings with known values (`KNOWN` in the schema). A client shows
  a value it doesn't know as it is and keeps it.
- **Unknown keys are kept**, at every level (a tank's `dims`, a species entry, a schedule, `manual`, a tombstone). A
  client saves a record with every key it read, including ones a newer client wrote. Only then can an older app edit a
  record without erasing what a newer one added.
- **Absent, not null**: an optional key with no value is left out; `null` is refused.
- **Lengths** (names up to 80, notes up to 4000) count Unicode code points (Swift `unicodeScalars.count`). Names must have
  something besides spaces; writers trim them, readers take them as they are.
- **One record per id** in each list of a store.
- **`v`**: a client that reads a store whose `v` it doesn't know leaves it as it is and doesn't sync it.
- **Schedules**: `on`/`off` as `HH:MM`; `off` of `00:00` means midnight at the end of the day; `off` after `on` the same
  day; the ramp at most half the time lit; levels 0–100 in the light's channel order (Chihiros: the model's channels,
  from the Bluetooth name's prefix, as in `protocols/chihiros-vectors.json` `modelOf`).

## Writing

- Any change to a record sets its `updatedAt` with `stamp(now, copy.updatedAt)`: now, or 1 ms after the copy being
  changed when this device's clock is behind it. A change made after seeing a copy then always wins over that copy,
  even from a device whose clock is slow. A device's manual levels, clock sync and saved schedules are all part of the
  device record.
- Deleting a record replaces it with a tombstone, stamped the same way (`tombstone(copy, now)`: `updatedAt` =
  `deletedAt`). Deleting a tank also tombstones its devices.
- A device whose tank is missing or deleted is not shown (it can arrive before its tank, or after it was deleted
  elsewhere).
- Limits: a reader can make up to 50 live tanks and 100 live devices (`MAX_TANKS`, `MAX_DEVICES`; tombstones don't
  count). A merge can go past that (signing in joins two stores); an account holds at most 200 and 400
  (`STORED_MAX`), and the server refuses a sync that would go past them. The device keeps its copy either way.

## Merging two copies

Per record, by id (`mergeRecords`, `newer` in the schema):

1. A record only one side has is kept.
2. Otherwise the copy with the later `updatedAt` wins, whole. Fields are not merged.
3. Same `updatedAt`: a tombstone wins over a live copy; between two live copies, the copy already kept stays (on the
   server: the account's).

So a delete removes a record edited before it, and an edit made after a delete brings the record back. The result is
sorted by id. A list that holds an id twice (it shouldn't) gives the same result everywhere: every copy goes through the
rules in order, all of the kept list, then all of the incoming one.

The merge is not symmetric on exact ties (rule 3), so only one place decides: the server. It merges what a client sends
into the account's copy, one request at a time, and the client takes the server's result as its own.

### Clocks

Last writer wins by the writers' clocks. The server sets an `updatedAt` later than its own clock to its own time
before merging, so a phone with a clock running fast can't win every later merge. A clock running slow makes that
device's edits lose to edits made elsewhere that it hadn't seen yet; accepted. Edits it had seen can't win over it:
`stamp` puts its change after them.

### Records the server refuses

The server checks each record on its own. One that doesn't validate (a newer client's value an older server refuses,
a name too long) is left out and listed in the reply; the rest are merged. The client keeps the refused record.

### Signing in

The records on the device are sent to the account and merged by the rules above. Nothing is lost on either side: tanks
made before signing in join the account's. Signing out keeps the device's copy; deleting the account deletes the
account's copy only.

### Tombstones

The server stores a tombstone as its three keys only, and keeps the newest 1000 tombstones of each kind per account.
A device offline for so long that more than 1000 newer deletes happened since could bring back the oldest deleted
records with an older copy; accepted.

### Limits on the server

Per account: 200 live tanks, 400 live devices, 1 MB of live records, one sync at a time. A sync past them is refused
whole (`too_many`, `busy`); the device keeps its copy.
