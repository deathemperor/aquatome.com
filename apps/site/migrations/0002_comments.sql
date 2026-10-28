-- Name-only comments. No email, account or IP is stored.
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  entity_ref TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'held', 'removed')),
  helpful INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX comments_entity ON comments (entity_ref, status, created_at);
CREATE INDEX comments_status ON comments (status, created_at);
