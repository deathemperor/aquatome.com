-- A reader sees their own photos (protocols/talk.openapi.json, /api/v1/talk/photos/mine): why one was turned down, as a
-- code the app words in the reader's language (face, species, quality, unsafe, advert, not_photo, other; 'withdrawn' when
-- the reader took it back, which their list leaves out), and the page it was sent for when moderation moved it to the
-- right fish's page. `reason` stays the moderator's own words, for the owner's dashboard.
ALTER TABLE photos ADD COLUMN why TEXT;
ALTER TABLE photos ADD COLUMN moved_from TEXT;
