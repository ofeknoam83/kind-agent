-- WhatsApp Summarizer SQLite Schema
-- All timestamps are Unix epoch seconds (INTEGER).
-- FKs enforced via PRAGMA foreign_keys = ON (set at connection time).

CREATE TABLE IF NOT EXISTS chats (
  id          TEXT PRIMARY KEY,  -- WhatsApp JID
  name        TEXT NOT NULL,
  is_group    INTEGER NOT NULL DEFAULT 0,  -- boolean
  last_msg_ts INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,  -- WhatsApp message ID
  chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_jid  TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  timestamp   INTEGER NOT NULL,
  from_me     INTEGER NOT NULL DEFAULT 0,  -- boolean
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);

CREATE TABLE IF NOT EXISTS summaries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id           TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  summary           TEXT NOT NULL,
  action_items      TEXT NOT NULL DEFAULT '[]',   -- JSON array of ActionItem
  unresolved_questions TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  extra_data        TEXT NOT NULL DEFAULT '{}',   -- JSON: tldr, keyTopics, decisionsMade, expectedFromMe, risks, usefulContext, tone
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  message_count     INTEGER NOT NULL,
  time_range_start  INTEGER NOT NULL,
  time_range_end    INTEGER NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_summaries_chat ON summaries(chat_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provider_configs (
  type       TEXT PRIMARY KEY,  -- 'openai' | 'lmstudio' | 'ollama'
  label      TEXT NOT NULL,
  base_url   TEXT NOT NULL,
  model      TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 0
);

-- Seed default providers
INSERT OR IGNORE INTO provider_configs (type, label, base_url, model, active) VALUES
  ('openai',   'OpenAI',    'https://api.openai.com/v1',    'gpt-4o',        0),
  ('lmstudio', 'LM Studio', 'http://localhost:1234/v1',     'default',       0),
  ('ollama',   'Ollama',    'http://localhost:11434',        'llama3.2:8b',   1);
