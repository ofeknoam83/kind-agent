import type Database from 'better-sqlite3';
import type { Chat, ChatMessage } from '../../shared/types';

export class ChatRepository {
  private stmts: ReturnType<typeof this.prepareStatements>;

  constructor(private db: Database.Database) {
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      upsertChat: this.db.prepare(`
        INSERT INTO chats (id, name, is_group, last_msg_ts)
        VALUES (@id, @name, @isGroup, @lastMsgTs)
        ON CONFLICT(id) DO UPDATE SET
          name = CASE
            WHEN excluded.name NOT IN ('Unknown', 'Group') THEN excluded.name
            WHEN chats.name IN ('Unknown', 'Group') THEN excluded.name
            ELSE chats.name
          END,
          last_msg_ts = MAX(chats.last_msg_ts, excluded.last_msg_ts)
      `),

      insertMessage: this.db.prepare(`
        INSERT OR IGNORE INTO messages (id, chat_id, sender_jid, sender_name, body, timestamp, from_me)
        VALUES (@id, @chatId, @senderJid, @senderName, @body, @timestamp, @fromMe)
      `),

      listChats: this.db.prepare(`
        SELECT
          c.id,
          c.name,
          c.is_group as isGroup,
          c.last_msg_ts as lastMessageTimestamp,
          c.category,
          COUNT(m.id) as messageCount
        FROM chats c
        LEFT JOIN messages m ON m.chat_id = c.id
        GROUP BY c.id
        ORDER BY c.last_msg_ts DESC
      `),

      setCategory: this.db.prepare(`
        UPDATE chats SET category = @category WHERE id = @id
      `),

      getMessages: this.db.prepare(`
        SELECT id, chat_id as chatId, sender_jid as senderJid, sender_name as senderName,
               body, timestamp, from_me as fromMe
        FROM messages
        WHERE chat_id = @chatId AND (@beforeTs IS NULL OR timestamp < @beforeTs)
        ORDER BY timestamp DESC
        LIMIT @limit
      `),

      getMessagesAfter: this.db.prepare(`
        SELECT id, chat_id as chatId, sender_jid as senderJid, sender_name as senderName,
               body, timestamp, from_me as fromMe
        FROM messages
        WHERE chat_id = @chatId AND timestamp > @afterTs
        ORDER BY timestamp ASC
      `),

      getMessageCount: this.db.prepare(`
        SELECT COUNT(*) as count FROM messages WHERE chat_id = @chatId
      `),
    };
  }

  /** Upsert a chat and batch-insert messages. Runs in a transaction. */
  upsertChatWithMessages(chat: Omit<Chat, 'messageCount'>, messages: ChatMessage[]): void {
    const tx = this.db.transaction(() => {
      this.stmts.upsertChat.run({
        id: chat.id,
        name: chat.name,
        isGroup: chat.isGroup ? 1 : 0,
        lastMsgTs: chat.lastMessageTimestamp,
      });

      for (const msg of messages) {
        this.stmts.insertMessage.run({
          id: msg.id,
          chatId: msg.chatId,
          senderJid: msg.senderJid,
          senderName: msg.senderName,
          body: msg.body,
          timestamp: msg.timestamp,
          fromMe: msg.fromMe ? 1 : 0,
        });
      }
    });
    tx();
  }

  listChats(): Chat[] {
    return this.stmts.listChats.all() as Chat[];
  }

  getMessages(chatId: string, limit: number, beforeTimestamp?: number): ChatMessage[] {
    return this.stmts.getMessages.all({
      chatId,
      beforeTs: beforeTimestamp ?? null,
      limit,
    }) as ChatMessage[];
  }

  /** Get all messages after a timestamp (for incremental summarization). */
  getMessagesAfter(chatId: string, afterTimestamp: number): ChatMessage[] {
    return this.stmts.getMessagesAfter.all({
      chatId,
      afterTs: afterTimestamp,
    }) as ChatMessage[];
  }

  /** Set the category for a chat. */
  setCategory(chatId: string, category: string | null): void {
    this.stmts.setCategory.run({ id: chatId, category });
  }

  /** Get chats with new message counts since a given timestamp, sorted by count desc. */
  getChatsWithNewMessagesSince(sinceTimestamp: number): Array<{ chatId: string; newMessageCount: number }> {
    const stmt = this.db.prepare(`
      SELECT chat_id as chatId, COUNT(*) as newMessageCount
      FROM messages
      WHERE timestamp > @sinceTs
      GROUP BY chat_id
      ORDER BY newMessageCount DESC
    `);
    return stmt.all({ sinceTs: sinceTimestamp }) as Array<{ chatId: string; newMessageCount: number }>;
  }
}
