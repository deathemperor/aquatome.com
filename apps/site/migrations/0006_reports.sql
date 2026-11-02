-- Readers' reports of a public comment or photo (POST /api/v1/report, protocols/talk.openapi.json). The reporter is an
-- HMAC of the account or the address, never the account id or address itself: one row per reporter and item.
CREATE TABLE reports (
  kind TEXT NOT NULL CHECK (kind IN ('comment', 'photo')),
  item_id TEXT NOT NULL,
  reporter TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (kind, item_id, reporter)
);
