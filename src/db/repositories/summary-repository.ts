import type Database from 'better-sqlite3';
import type { SummaryResult, ActionItem } from '../../shared/types';

export class SummaryRepository {
  private stmts: ReturnType<typeof this.prepareStatements>;

  constructor(private db: Database.Database) {
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      insert: this.db.prepare(`
        INSERT INTO summaries (chat_id, summary, action_items, unresolved_questions,
                               provider, model, message_count, time_range_start, time_range_end)
        VALUES (@chatId, @summary, @actionItems, @unresolvedQuestions,
                @provider, @model, @messageCount, @timeRangeStart, @timeRangeEnd)
      `),

      listByChat: this.db.prepare(`
        SELECT * FROM summaries WHERE chat_id = @chatId ORDER BY created_at DESC LIMIT @limit
      `),

      getById: this.db.prepare(`
        SELECT * FROM summaries WHERE id = @id
      `),

      getLatestForChat: this.db.prepare(`
        SELECT * FROM summaries WHERE chat_id = @chatId ORDER BY created_at DESC LIMIT 1
      `),
    };
  }

  insert(result: Omit<SummaryResult, 'id' | 'createdAt'>): number {
    const info = this.stmts.insert.run({
      chatId: result.chatId,
      summary: result.summary,
      actionItems: JSON.stringify(result.actionItems),
      unresolvedQuestions: JSON.stringify(result.unresolvedQuestions),
      provider: result.provider,
      model: result.model,
      messageCount: result.messageCount,
      timeRangeStart: result.timeRange[0],
      timeRangeEnd: result.timeRange[1],
    });
    return Number(info.lastInsertRowid);
  }

  listByChat(chatId: string, limit: number): SummaryResult[] {
    const rows = this.stmts.listByChat.all({ chatId, limit }) as RawSummaryRow[];
    return rows.map(deserializeRow);
  }

  getById(id: number): SummaryResult | null {
    const row = this.stmts.getById.get({ id }) as RawSummaryRow | undefined;
    return row ? deserializeRow(row) : null;
  }

  getLatestForChat(chatId: string): SummaryResult | null {
    const row = this.stmts.getLatestForChat.get({ chatId }) as RawSummaryRow | undefined;
    return row ? deserializeRow(row) : null;
  }
}

// ── Internal ──────────────────────────────────────────────────────────

interface RawSummaryRow {
  id: number;
  chat_id: string;
  summary: string;
  action_items: string;
  unresolved_questions: string;
  provider: string;
  model: string;
  message_count: number;
  time_range_start: number;
  time_range_end: number;
  created_at: number;
}

function deserializeRow(row: RawSummaryRow): SummaryResult {
  return {
    id: row.id,
    chatId: row.chat_id,
    summary: row.summary,
    actionItems: JSON.parse(row.action_items) as ActionItem[],
    unresolvedQuestions: JSON.parse(row.unresolved_questions) as string[],
    provider: row.provider,
    model: row.model,
    messageCount: row.message_count,
    timeRange: [row.time_range_start, row.time_range_end],
    createdAt: row.created_at,
  };
}
