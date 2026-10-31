-- Accounts for "Bể của tôi" (optional sign-in that backs up and syncs saved tanks). Data kept to the minimum:
-- no names, no phone numbers, no email addresses. Email sign-in stores only a keyed hash of the address
-- (HMAC with ACCOUNT_HMAC_KEY), enough to find the account again; the address itself is used once, to send the link.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

-- Ways to sign in to an account. subject: the provider's user id (Apple, Google), the passkey's credential id, or the
-- email hash. email_hash: the hash of a verified address an identity provider gave, so an email link finds the same account.
CREATE TABLE credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL CHECK (kind IN ('apple', 'google', 'passkey', 'email')),
  subject TEXT NOT NULL,
  email_hash TEXT,
  public_key TEXT,
  counter INTEGER,
  transports TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  UNIQUE (kind, subject)
);
CREATE INDEX credentials_user ON credentials (user_id);
CREATE INDEX credentials_email ON credentials (email_hash);

-- Signed-in browsers (cookie) and apps (bearer token). id: SHA-256 of the token; the token itself is never stored.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  client TEXT NOT NULL CHECK (client IN ('web', 'app')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expiry ON sessions (expires_at);

-- One-time values with a short life: email links, sign-in nonces, passkey challenges. id: SHA-256 of what the client holds.
CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('email', 'nonce', 'passkey-login', 'passkey-register')),
  value TEXT NOT NULL,
  user_id TEXT,
  expires_at TEXT NOT NULL
);
CREATE INDEX auth_challenges_expiry ON auth_challenges (expires_at);

-- Saved tanks and devices (packages/schema TankStore records), merged per record by updatedAt (docs/my-tanks-sync.md).
CREATE TABLE tank_records (
  user_id TEXT NOT NULL REFERENCES users (id),
  kind TEXT NOT NULL CHECK (kind IN ('tank', 'device')),
  id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, id)
);

-- Request counters for sign-in limits. key: an HMAC of what is counted (an IP range, an email hash), never the value.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at TEXT NOT NULL
);
CREATE INDEX rate_limits_reset ON rate_limits (reset_at);
