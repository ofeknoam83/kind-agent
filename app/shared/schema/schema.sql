CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unread_count INTEGER DEFAULT 0,
  last_seen TEXT,
  status TEXT DEFAULT 'tracked'
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender TEXT,
  timestamp TEXT NOT NULL,
  text TEXT,
  message_type TEXT,
  from_me INTEGER DEFAULT 0
);
