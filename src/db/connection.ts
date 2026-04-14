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

    CREATE TABLE IF NOT EXISTS action_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      summary_id    INTEGER REFERENCES summaries(id) ON DELETE SET NULL,
      chat_id       TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      description   TEXT NOT NULL,
      assignee      TEXT,
      deadline      TEXT,
      priority      TEXT,
      confidence    INTEGER NOT NULL DEFAULT 3,
      status        TEXT NOT NULL DEFAULT 'open',
      fingerprint   TEXT NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      resolved_at   INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_action_items_chat ON action_items(chat_id, status);
    CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status, priority, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_action_items_dedup
      ON action_items(chat_id, fingerprint) WHERE status = 'open';

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

  // Backfill: populate action_items table from existing summaries' JSON
  backfillActionItems(database);
}

/**
 * Populate the action_items table from existing summaries that have
 * action items in their JSON column but no corresponding rows in action_items.
 */
function backfillActionItems(database: Database.Database): void {
  const count = (database.prepare(
    `SELECT COUNT(*) as cnt FROM action_items`
  ).get() as { cnt: number }).cnt;
  if (count > 0) return; // Already populated

  const summaries = database.prepare(`
    SELECT id, chat_id, action_items, created_at FROM summaries
    WHERE action_items != '[]'
    ORDER BY created_at DESC
  `).all() as Array<{ id: number; chat_id: string; action_items: string; created_at: number }>;

  if (summaries.length === 0) return;

  const insert = database.prepare(`
    INSERT OR IGNORE INTO action_items
      (summary_id, chat_id, description, assignee, deadline, priority, confidence, fingerprint, created_at)
    VALUES
      (@summaryId, @chatId, @description, @assignee, @deadline, @priority, @confidence, @fingerprint, @createdAt)
  `);

  const tx = database.transaction(() => {
    for (const row of summaries) {
      let items: Array<{
        description?: string;
        assignee?: string | null;
        deadline?: string | null;
        priority?: string | null;
        confidence?: number;
      }>;
      try {
        items = JSON.parse(row.action_items);
        if (!Array.isArray(items)) continue;
      } catch { continue; }

      for (const item of items) {
        if (!item.description || item.description.length < 3) continue;
        const desc = String(item.description);
        // Simple fingerprint matching the repository's logic
        const normalized = desc.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 120);
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
          hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
        }
        const fp = `${row.chat_id.slice(0, 20)}:${hash.toString(36)}`;

        const assignee = item.assignee && item.assignee !== 'null' && item.assignee !== 'None'
          ? String(item.assignee) : null;
        const deadline = item.deadline && item.deadline !== 'null' && item.deadline !== 'None'
          ? String(item.deadline) : null;
        const validPriorities = new Set(['high', 'medium', 'low']);
        const priority = typeof item.priority === 'string' && validPriorities.has(item.priority.toLowerCase())
          ? item.priority.toLowerCase() : null;

        insert.run({
          summaryId: row.id,
          chatId: row.chat_id,
          description: desc,
          assignee,
          deadline,
          priority,
          confidence: item.confidence ?? 3,
          fingerprint: fp,
          createdAt: row.created_at,
        });
      }
    }
  });
  tx();

  const inserted = (database.prepare(
    `SELECT COUNT(*) as cnt FROM action_items`
  ).get() as { cnt: number }).cnt;
  console.log(`[DB] Backfilled ${inserted} action items from existing summaries`);
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
