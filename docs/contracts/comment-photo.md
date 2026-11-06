# A comment's photo

What the iOS app needs to send a comment with a photo, and to show one. The site's side is built
(`apps/site/worker/comments/photo.ts`, `apps/site/worker/comments/api.ts`). This file holds what
`protocols/talk.openapi.json` doesn't have yet, for the native lead to put there; then it can go.

A comment carries at most one photo, sent with it. The photo is a reader's photo in all but where it shows: the same
file types, size, day and moderation as `POST /_p`, but it shows only under its comment, never in the page's readers'
photos (`GET /_p`), and moderation doesn't check its species (it may show a sick fin, a tank, a filter).

## Sending: `POST /_c` as multipart

A comment without a photo is the JSON post, as before (`NewComment`). With a photo, the same path takes
`multipart/form-data`, the way `POST /_p` does. The app sends its bearer, no Origin and no `token`, as for any post.

| Field | | |
| --- | --- | --- |
| `e` | required | The page's comments key, as `NewComment`. |
| `name` | required | 1–40 characters, as `NewComment`. The photo's credit too. |
| `body` | required | 2–2000 characters, as `NewComment`. |
| `consent` | required | `"1"`: the reader took the photo and agrees to its being shown with their name, as `NewPhoto`. |
| `file` | required | JPEG, PNG or WebP, at most 8 MB, as `NewPhoto`: the sender strips its location and camera data and shrinks it first (the site: 2000 px on the long side, JPEG). |
| `token` | the page's way only | Its Turnstile token. |

The request needs a `Content-Length` (one without, or past 8 MB and 64 KB of form, is `413 too large`).

The comment and its photo are stored together or not at all: the upload first, then both rows in one D1 batch, and
the upload deleted if the batch fails. A refused photo leaves no comment, and a comment it refuses leaves nothing.

## Answers

Every answer is JSON and `cache-control: no-store`. Errors are `{error}`, as the talk API's.

- **201**: `Posted`, plus the photo, waiting for moderation:

  ```json
  {
    "status": "approved",
    "comment": { "id": "…", "name": "Lộc", "body": "…", "helpful": false, "createdAt": "…", "author": "…" },
    "photo": { "status": "pending", "id": "…", "deleteUrl": "/_p/xoa/?id=…&t=…" }
  }
  ```

  `status` and `comment` are the comment's, as for a JSON post (`held`: no `comment`). The comment as it shows has no
  photo yet. `photo` has `Sent`'s shape: its `id` (for the reader's own list and for taking it back) and the private link
  that takes it back (`deleteUrl`, shown once; the site shows it as text to keep).
- **400**: `bad form` (not a form) | `bad entity` | `name must be 1–40 characters` | `comment must be 2–2000 characters` |
  `consent` | `no file` (none, or empty)
- **401**: `session` (the app's bearer is missing, expired or signed out)
- **403**: `cross-origin` | `turnstile` | `verification_required` (the page's way)
- **413**: `too large`
- **415**: `not an image` (by its bytes, not its name or type: HEIC is refused)
- **429**: `rate`: past the day's photos. A comment's photo counts against readers' photos' day, shared with
  `POST /_p`: 5 a day for the address, and 5 for the account on top. Nothing is posted or counted; the reader can
  send the comment without the photo.
- **503**: `photos_off` (no D1, R2 or Turnstile on this deployment)

The checks run in this order: the bearer or the page's Origin, the verification switch, the size, the comment's fields,
`consent`, the file, Turnstile, the photo's day, then the comment's own rules (a comment past its day, a duplicate or a
held word is held, as ever).

## Showing: `GET /_c`

A `Comment` gains an optional `photo` once its photo is published (the comment approved too: a held comment, and so
its photo, isn't listed). Nothing changes for a comment without one, and an app that doesn't know the field ignores it.

```json
{
  "id": "…", "name": "Minh", "body": "…", "helpful": false, "createdAt": "…", "author": "…",
  "photo": { "id": "…", "url": "https://media.aquatome.com/readers/….webp", "thumb": "https://media.aquatome.com/readers/…-480.webp", "width": 1200, "height": 900 }
}
```

`url` is the published photo (at most 1200 px), `thumb` its 480 px copy, `width` and `height` the full photo's. The site
shows the thumbnail under the comment's text, opening the photo viewer, credited "Ảnh của {name}" with the comment's
name and day, as readers' photos are. While the photo waits for moderation, or once it is removed, `photo` is absent.

## The rest, as readers' photos

- **Moderation**: the photo waits in the same queue (`/_p/admin`), keyed `comment:<comment id>`. Faces, adverts, unsafe
  and not-a-photo turn it down; its species isn't checked and it never moves to another page. Removing the comment
  removes its photo and files; removing the photo leaves the comment's text.
- **Reports**: `POST /api/v1/report` with `kind: "photo"` and the photo's `id` reports it as any reader's photo (a
  signed-in reader's report takes it off at once). Reporting the comment takes the comment, and so its photo, off.
- **Blocking**: the photo is its comment's; blocking the comment's `author` hides both.
- **The reader's own photos**: `GET /api/v1/talk/photos/mine` lists it with `e` set to `comment:<comment id>`, its
  status and, turned down, its `why`. `DELETE /api/v1/talk/photos/mine/{id}` takes it back; the comment stays.
- **Deleting the account** deletes its comments and their photos, files included.

## To add to `protocols/talk.openapi.json`

- `POST /_c`: a `multipart/form-data` request body beside the JSON one:

  ```json
  "NewCommentWithPhoto": {
    "type": "object",
    "required": ["e", "name", "body", "consent", "file"],
    "properties": {
      "e": { "type": "string", "description": "The page's comments key." },
      "name": { "type": "string", "minLength": 1, "maxLength": 40 },
      "body": { "type": "string", "minLength": 2, "maxLength": 2000 },
      "consent": { "type": "string", "const": "1", "description": "The reader took the photo and agrees to its being shown with their name." },
      "file": { "type": "string", "contentEncoding": "binary", "description": "JPEG, PNG or WebP, at most 8 MB; the sender strips its location and camera data and shrinks it first." },
      "token": { "type": "string", "description": "The page's way: its Turnstile token. The app sends none." }
    }
  }
  ```

- `POST /_c` responses: 400 adds `bad form | consent | no file`; new 415 `not an image` and 429 `rate`; 503 adds
  `photos_off`.
- `Posted`: an optional `photo`, `{"$ref": "#/components/schemas/Sent"}`, with a photo only.
- `Comment`: an optional `photo`:

  ```json
  "CommentPhoto": {
    "type": "object",
    "required": ["id", "url", "thumb", "width", "height"],
    "properties": {
      "id": { "type": "string", "description": "The photo's own id: reports and the reader's own list name it." },
      "url": { "type": "string" },
      "thumb": { "type": "string" },
      "width": { "type": "integer", "minimum": 1 },
      "height": { "type": "integer", "minimum": 1 }
    }
  }
  ```

- `MyPhoto.e`: "… or `comment:<comment id>` for a comment's photo, which shows under that comment".

The Worker's answers already fit the contract as it is (`Comment`, `Comments` and `Posted` allow the new field, and
`MyPhoto.e` is any string): `apps/site/worker/test/comment-photos.test.ts` checks them against it.
