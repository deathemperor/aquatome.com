# Owner push: the daily report's delivery and the phones it notifies

What the iOS app needs from the site for the owner to get the daily report as a notification, and to switch email and
push from the dashboard. The site's side is built (`apps/site/worker/daily/`, `apps/site/worker/owner-api.ts`). This
file holds the parts `protocols/owner-dashboard.openapi.json` doesn't have yet, for the native lead to put there; then
it can go.

## Already in the contract

- **The `actions` block**: `{kind: "actions", actions: [Action, …]}` (at least one), buttons on their own. Each sends
  its request as an `Action` does, then the section is read again. An app that doesn't know the kind skips it.
- **The `bao-cao` section** ("Báo cáo hằng ngày"), last in the dashboard's `sections`. It holds:
  - a note with the delivery's state;
  - an `actions` block with two buttons: email on or off, and push on or off;
  - the reports as a table, each row opening its page.
- `protocols/owner-dashboard-vectors.json` has the section's sample reply (`section bao-cao`).

The section's push button is the server-side switch: off, no notification goes to any phone, registered or not. Each
phone's own registration is the app's native row "Nhận thông báo trên máy này", not a block.

## To add: two paths

Both answer only the owner's live app session (`Authorization: Bearer <token>`), as every `/api/owner/*` path does:
401 `signed_out` without one, 404 `not_found` for another account's, both before any other check. Errors are
`{error, message?}` (`#/components/schemas/Error`); `message` is Vietnamese, to show. Any of them may answer 503
`unavailable` when the server can't read or write its storage. Every reply is `cache-control: no-store` and
`x-robots-tag: noindex, nofollow`.

`protocols/owner-dashboard-vectors.json` already has the Worker's own replies for both paths, in order on one server:

- "register a phone", then "register the same phone again";
- the three refusals;
- "signed out: register a phone" and "not the owner: register a phone";
- "unregister a phone";
- "turn the report's notification on" and "a report setting that isn't true or false".

Until the contract lists the paths, the site's test holds those replies to this file: an error is the contract's
`Error`, and a 200 is `{ok: true, changed}`. Once the contract has the paths, take them out of `PENDING` in
`apps/site/worker/test/owner-api.test.ts`, so the replies are checked against the contract like every other.

### `POST /api/owner/report-settings`

What the `bao-cao` section's buttons send. One switch or both:

```json
{ "email": false }
{ "push": true }
{ "email": true, "push": true }
```

200, the settings as they are now; `changed` is false when they already were so:

```json
{ "ok": true, "changed": true, "email": false, "push": true }
```

| Status | `error` | When |
| --- | --- | --- |
| 400 | `bad_request` | not JSON, no switch, a switch that isn't true or false, or another field (`message`: "email và/hoặc push (true/false).") |
| 401 | `signed_out` | no live app session |
| 404 | `not_found` | another account's app session |
| 405 | `method` | not POST (`allow: POST`) |
| 503 | `unavailable` | storage down |

Unset, the settings are email on and push off.

### `POST /api/owner/push-token` and `DELETE /api/owner/push-token`

The app's native row. **POST** registers this phone:

- at each launch while the row is on;
- when the row is turned on.

It is an upsert. The same token again moves its last-seen time and makes no second copy.

```json
{ "token": "<the device token, lowercase hex>", "environment": "production" }
```

- `token`: the APNs device token as lowercase hex, 16 to 100 bytes (64 hex digits today).
- `environment`: `"sandbox"` from debug builds, `"production"` from TestFlight and App Store builds. The server sends
  each token to the matching APNs host.

**DELETE** unregisters it, when the row is turned off or before the owner signs out:

```json
{ "token": "<the same token>" }
```

200 for both:

```json
{ "ok": true, "changed": true }
```

`changed` on POST: the token is new here, its environment changed, or it moved to this session (false when only the time
moved). On DELETE: the token was there.

| Status | `error` | When |
| --- | --- | --- |
| 400 | `bad_request` | not JSON, a token that isn't lowercase hex of that length, an `environment` that isn't one of the two (POST), or another field; DELETE takes `token` alone (`message`: what it takes) |
| 401 | `signed_out` | no live app session |
| 404 | `not_found` | another account's app session |
| 405 | `method` | not POST or DELETE (`allow: POST, DELETE`) |
| 503 | `unavailable` | storage down |

The server keeps the 10 phones seen last. Each token is tied to the app session that posted it last. The server stores
the session's id (the bearer's hash), never the bearer, and a POST in a new session moves the token there.

Before each report, the server drops every token whose session is no longer live, checked the way every `/api/owner/*`
call checks one:
- signed out;
- expired;
- the account deleted, or no longer the owner's.

So a phone whose session ended without its DELETE (offline at sign-out, signed out on the web, expired) gets nothing.

It also drops a token when APNs answers 410, or 400 `BadDeviceToken`. An app that posts at each launch, signed in, puts
a dropped phone back.

## The notification

One alert per registered phone, when a report is made at 07:00 Vietnam time (or a run started by hand) and the push
switch is on:

```json
{
  "aps": {
    "alert": { "title": "AquaTome", "body": "AquaTome daily · 6 Nov · 2 need care\nengine.yml failing since 5 Nov" },
    "thread-id": "daily-report"
  },
  "url": "https://aquatome.com/_ab/bao-cao/1234567890/"
}
```

- **`body`**: the report's subject, then the first thing that needs care, if there is one. English, as the report is.
  At most 400 characters.
- **`url`**: the report's page on the dashboard, always https on aquatome.com. The app opens it on a tap, and ignores a
  `url` that isn't. The page opens to the owner signed in on the web; signed out, it shows the site's sign-in, which
  brings the owner back to it.
- **Headers**: `apns-topic: com.aquatome.app`, `apns-push-type: alert`, `apns-collapse-id: daily-report-<run id>`. A
  report is pushed once; the collapse id keeps a second copy from stacking.
- **No sound or badge** is set.

The log row on `/_ab/bao-cao/` (and the section's table) says what went out: the mail, the number of phones notified,
or why not:

- "chưa có khóa APNs": the APNs key isn't set;
- "chưa có điện thoại nào đăng ký": no phone is registered in a live session;
- "Bỏ n điện thoại": phones dropped (their session ended, or APNs no longer knows them), not a failure;
- APNs' reason, such as `InvalidProviderToken`, when APNs refused.

## The site's secrets

Sent from the Worker, signed with an APNs auth key:

- `APNS_KEY`: the `.p8` file's contents;
- `APNS_KEY_ID`: its Key ID;
- the team: the `APPLE_TEAM_ID` the site's Apple sign-in already uses.

Without the key, push is skipped and the log says so.
