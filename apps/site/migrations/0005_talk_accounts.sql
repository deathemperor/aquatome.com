-- Comments and readers' photos sent from the app carry the account that sent them (protocols/talk.openapi.json), so
-- deleting the account deletes them. Those sent from the site's pages have none (NULL).
ALTER TABLE comments ADD COLUMN account_id TEXT REFERENCES users (id);
ALTER TABLE photos ADD COLUMN account_id TEXT REFERENCES users (id);
CREATE INDEX comments_account ON comments (account_id);
CREATE INDEX photos_account ON photos (account_id);
