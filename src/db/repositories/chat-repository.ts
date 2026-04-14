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
          name = excluded.name,
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
          COUNT(m.id) as messageCount
        FROM chats c
        LEFT JOIN messages m ON m.chat_id = c.id
        GROUP BY c.id
        ORDER BY c.last_msg_ts DESC
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
}
