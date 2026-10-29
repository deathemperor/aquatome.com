-- Reader photos for species pages. Name only; no email, account or IP. The raw upload (with any EXIF) lives in the
-- private UPLOADS bucket until the nightly moderation pass, which publishes a re-encoded copy to the media bucket or drops it.
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  entity_ref TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'removed')),
  url TEXT,
  thumb TEXT,
  width INTEGER,
  height INTEGER,
  delete_hash TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX photos_entity ON photos (entity_ref, status, created_at);
CREATE INDEX photos_status ON photos (status, created_at);
