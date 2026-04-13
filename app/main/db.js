const fs = require('fs');
const path = require('path');
let Database;
try { Database = require('better-sqlite3'); } catch (e) {}
class DB {
  constructor() { this.db = null; }
  init(baseDir) {
    if (!Database) return false;
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
    this.db = new Database(path.join(baseDir, 'kinds-agent.db'));
    const schema = fs.readFileSync(path.join(__dirname, '../shared/schema/schema.sql'), 'utf8');
    this.db.exec(schema);
    return true;
  }
  upsertChat(chat) {
    if (!this.db) return;
    this.db.prepare(`INSERT INTO chats (id, name, unread_count, last_seen, status)
      VALUES (@id, @name, @unread_count, @last_seen, @status)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, unread_count=excluded.unread_count, last_seen=excluded.last_seen, status=excluded.status`).run(chat);
  }
  insertMessage(msg) {
    if (!this.db) return;
    this.db.prepare(`INSERT OR IGNORE INTO messages (id, chat_id, sender, timestamp, text, message_type, from_me)
      VALUES (@id, @chat_id, @sender, @timestamp, @text, @message_type, @from_me)`).run(msg);
  }
  listChats() {
    if (!this.db) return [];
    return this.db.prepare('SELECT id, name, unread_count as unread, last_seen as lastSeen, status FROM chats ORDER BY COALESCE(last_seen, "") DESC').all();
  }
  getMessages(chatId, limit = 80) {
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT ?').all(chatId, limit);
  }
}
module.exports = new DB();
