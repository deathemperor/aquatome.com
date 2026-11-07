-- A reader's past chat conversations, for the list (protocols/chat.openapi.json, /api/chat/conversations): one row for each
-- conversation with a turn. Their questions and answers stay in R2 with the conversation (worker/chat/store.ts); no answer
-- is ever here. account: the account's keyed hash, as that store has it (chatAccount). title: the first question's text.
-- start: where it started, as JSON (from, about, identified). first_at, last_at: its first and last question's times.
-- questions: how many it has. continues: the conversation it carried on. hidden: 1 once the reader hid it (the list's
-- "Ẩn"), which only takes it off their list: it stays until the account is deleted, and goes with it.
CREATE TABLE chat_conversations (
  account TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  start TEXT NOT NULL DEFAULT '{}',
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL,
  questions INTEGER NOT NULL,
  continues TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (account, id)
);
