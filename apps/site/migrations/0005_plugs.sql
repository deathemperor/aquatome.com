-- Smart plugs (worker/plugs, docs/smart-plugs.md): a maker's account (Tuya, eWeLink) linked to an AquaTome account.
-- provider_uid: the maker's user id for that account. One link per maker per account.
CREATE TABLE plug_links (
  user_id TEXT NOT NULL REFERENCES users (id),
  provider TEXT NOT NULL CHECK (provider IN ('tuya', 'ewelink')),
  provider_uid TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);
