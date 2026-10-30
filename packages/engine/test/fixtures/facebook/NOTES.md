# Facebook fixtures

Captured 2026-10-30 **logged out** (`scripts/fb-recon.ts --logged-out --headless`), trimmed by `scripts/fb-fixtures.ts`
to the data subtrees the parsers read (comments, reactions, tracking and other people removed; the repo is public).
Re-capture logged in with the spare account once it exists, and re-run the parser tests.

What the parsers key on (Relay data in `<script type="application/json">`, and `/api/graphql/` responses when scrolling):
- Post: an object `__typename: "Story"` with `post_id`, `creation_time` (unix s), `permalink_url`, `actors[0].id`
  (Jim = `100008605184261`). Text: `comet_sections.content.story.message.text`. Photos: `__typename: "Photo"` nodes in
  `attachments` (several: `all_subattachments.count` + `.nodes[].media`). Reshare: `attached_story`.
- Album grid (`media/set/?set=a.<id>`): `grid_media.edges[].node` Photo nodes: `image.uri` (scaled ~843 px),
  `viewer_image` (full size, no URL), `accessibility_caption` (Facebook's auto description), `is_playable` (video).
- Albums tab: the data has `Album` ids but not titles, so `albumsIn` reads `a[href*="media/set/?set=a."]`; the title
  is the first span with its own text. Seen logged out: Cover photos (379 items), Photos (2,405), Profile pictures (88).
- Photo page (`photo/?fbid=<id>`): logged out it redirects to `/login/?next=…`. Logged in: assumed to carry the Photo
  node with its largest `image` (not yet captured: `photoFull` takes the widest `{uri,width}` on any Photo node with that id).
- Login wall: `"USER_ID":"0"` in the page data, or a `/login` path; checkpoint: a `/checkpoint` path.

Synthetic (in the tests, real shape, made-up ids): a post with text, a multi-photo post with held-back photos,
a reshare, a post by someone else, a video post, a photo page with several image sizes.
