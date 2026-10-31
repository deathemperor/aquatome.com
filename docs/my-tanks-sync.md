# My tanks: data model and merge

"Bể của tôi" keeps a reader's tanks and devices on the device first (browser storage on the web, the app's own store on
iOS). Signing in is optional: it backs the same records up to the account and syncs them between the web and the app.
This file is the contract both clients follow.

- Schema: `packages/schema/src/tanks.ts` (zod). JSON Schema for other languages: `protocols/tanks.schema.json`
  (generated; a test fails when it is stale).
- Test cases both clients run: `protocols/tanks-vectors.json` (`valid`, `invalid`, `merge`, `litres`).

## Records

A store is `{ v: 1, tanks: [...], devices: [...] }`. Tanks and devices are separate records, so changing a light's
levels on the phone can't overwrite the tank's notes edited on the web at the same time.

| Record | Holds |
| --- | --- |
| Tank | name, `dims` (inside L × W × H, cm) and/or `litres`, substrate, species `{id, count?}` and plants `{id}` by page id, notes |
| Device | `tankId`, kind (`light`), brand, model, Bluetooth name, nickname, saved schedules, last manual levels, last clock sync |
| Tombstone | `{ id, updatedAt, deletedAt }` and nothing else: what is left of a deleted tank or device |

Every record has `id`, `createdAt` and `updatedAt`.

- **Ids**: lowercase UUIDs, made by the client that creates the record (`crypto.randomUUID()`; on iOS
  `UUID().uuidString.lowercased()`).
- **Timestamps**: UTC with milliseconds, exactly `2026-10-31T12:00:00.000Z`. One form only, so comparing the strings
  compares the times on every platform.
- **Species and plants** are page ids (`paracheirodon-axelrodi`), the same in every language, never slugs or names.
- **Litres**: `litres` when set (round and corner tanks, from the volume tool), else `l × w × h / 1000` of `dims`.
- **Open values**: `kind`, `brand` and `substrate` are strings with known values (`KNOWN` in the schema). A client shows
  a value it doesn't know as it is and keeps it.
- **Unknown keys are kept.** A client saves a record with every key it read, including ones a newer client wrote. Only
  then can an older app edit a record without erasing what a newer one added.
- **Schedules**: `on`/`off` as `HH:MM`; `off` of `00:00` means midnight at the end of the day; `off` after `on` the same
  day; the ramp at most half the time lit; levels 0–100 in the light's channel order (Chihiros: the model's channels,
  from the Bluetooth name's prefix, as in `protocols/chihiros-vectors.json` `modelOf`).

## Writing

- Any change to a record sets its `updatedAt` to now. A device's manual levels, clock sync and saved schedules are all
  part of the device record.
- Deleting a record replaces it with a tombstone (`updatedAt` = `deletedAt` = now). Deleting a tank also tombstones its
  devices.
- A device whose tank is missing or deleted is not shown (it can arrive before its tank, or after it was deleted
  elsewhere).
- Limits: 50 live tanks and 100 live devices per store; tombstones don't count.

## Merging two copies

Per record, by id (`mergeRecords`, `newer` in the schema):

1. A record only one side has is kept.
2. Otherwise the copy with the later `updatedAt` wins, whole. Fields are not merged.
3. Same `updatedAt`: a tombstone wins over a live copy; between two live copies, the copy already kept stays (on the
   server: the account's).

So a delete removes a record edited before it, and an edit made after a delete brings the record back. The result is
sorted by id.

The merge is not symmetric on exact ties (rule 3), so only one place decides: the server. It merges what a client sends
into the account's copy, one request at a time, and the client takes the server's result as its own.

### Clocks

Last writer wins by the writers' clocks. The server sets an `updatedAt` later than its own clock to its own time
before merging, so a phone with a clock running fast can't win every later merge. A clock running slow makes that
device's edits lose to others made in the meantime; accepted.

### Signing in

The records on the device are sent to the account and merged by the rules above. Nothing is lost on either side: tanks
made before signing in join the account's. Signing out keeps the device's copy; deleting the account deletes the
account's copy only.

### Tombstones

Kept as long as the account (they are a few bytes each), so a device that was offline for months can't bring a deleted
tank back with an older copy.
