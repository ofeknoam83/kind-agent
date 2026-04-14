import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
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

function runMigrations(database: Database.Database): void {
  const schemaPath = path.join(__dirname, 'schema.sql');
  // In packaged app, schema.sql is bundled alongside the compiled JS.
  // During dev, it's resolved relative to dist/db/.
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
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
