import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import { DB_FILENAME } from '../shared/constants';

let db: Database.Database | null = null;

/**
 * Returns the singleton database connection.
 * Creates the DB file + runs schema on first call.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, DB_FILENAME);

  db = new Database(dbPath);

  // Critical pragmas for correctness and performance.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  return db;
}

/**
 * Schema is inlined because Vite bundles JS but doesn't copy .sql files
 * to the output directory. fs.readFileSync('schema.sql') fails at runtime.
 */
function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      is_group    INTEGER NOT NULL DEFAULT 0,
      last_msg_ts INTEGER NOT NULL DEFAULT 0,
      category    TEXT DEFAULT NULL,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_jid  TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      body        TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      from_me     INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_ts ON messages(chat_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);

    CREATE TABLE IF NOT EXISTS summaries (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id           TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      summary           TEXT NOT NULL,
      action_items      TEXT NOT NULL DEFAULT '[]',
      unresolved_questions TEXT NOT NULL DEFAULT '[]',
      extra_data        TEXT NOT NULL DEFAULT '{}',
      provider          TEXT NOT NULL,
      model             TEXT NOT NULL,
      message_count     INTEGER NOT NULL,
      time_range_start  INTEGER NOT NULL,
      time_range_end    INTEGER NOT NULL,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_summaries_chat ON summaries(chat_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS provider_configs (
      type       TEXT PRIMARY KEY,
      label      TEXT NOT NULL,
      base_url   TEXT NOT NULL,
      model      TEXT NOT NULL,
      active     INTEGER NOT NULL DEFAULT 0
    );

    INSERT OR IGNORE INTO provider_configs (type, label, base_url, model, active) VALUES
      ('openai',   'OpenAI',    'https://api.openai.com/v1',    'gpt-4o',        0),
      ('lmstudio', 'LM Studio', 'http://localhost:1234/v1',     'default',       0),
      ('ollama',   'Ollama',    'http://localhost:11434',        'llama3.2',      1);
  `);

  // Migration: add extra_data column for existing databases
  const columns = database.pragma('table_info(summaries)') as Array<{ name: string }>;
  const hasExtraData = columns.some((col) => col.name === 'extra_data');
  if (!hasExtraData) {
    database.exec(`ALTER TABLE summaries ADD COLUMN extra_data TEXT NOT NULL DEFAULT '{}'`);
  }

  // Migration: add category column to chats for existing databases
  const chatColumns = database.pragma('table_info(chats)') as Array<{ name: string }>;
  const hasCategory = chatColumns.some((col) => col.name === 'category');
  if (!hasCategory) {
    database.exec(`ALTER TABLE chats ADD COLUMN category TEXT DEFAULT NULL`);
  }

  // Ensure Ollama is the default active provider for existing databases
  const activeCount = (database.prepare(
    `SELECT COUNT(*) as cnt FROM provider_configs WHERE active = 1`
  ).get() as { cnt: number }).cnt;
  if (activeCount === 0) {
    database.exec(`UPDATE provider_configs SET active = 1 WHERE type = 'ollama'`);
  }

  // Fix: recalculate last_msg_ts from actual message timestamps.
  // Previous versions used Date.now() for metadata messages, which corrupted sort order.
  database.exec(`
    UPDATE chats SET last_msg_ts = COALESCE(
      (SELECT MAX(timestamp) FROM messages WHERE messages.chat_id = chats.id),
      0
    )
  `);
}

/**
 * Gracefully close the database. Call this on app quit.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
