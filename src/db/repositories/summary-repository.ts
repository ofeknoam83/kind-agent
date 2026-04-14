import type Database from 'better-sqlite3';
import type { SummaryResult, ActionItem, SummaryExtraData } from '../../shared/types';
import { DEFAULT_EXTRA_DATA } from '../../shared/types';

export class SummaryRepository {
  private stmts: ReturnType<typeof this.prepareStatements>;

  constructor(private db: Database.Database) {
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      insert: this.db.prepare(`
        INSERT INTO summaries (chat_id, summary, action_items, unresolved_questions, extra_data,
                               provider, model, message_count, time_range_start, time_range_end)
        VALUES (@chatId, @summary, @actionItems, @unresolvedQuestions, @extraData,
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
    const extraData: SummaryExtraData = {
      tldr: result.tldr ?? '',
      keyTopics: result.keyTopics ?? [],
      decisionsMade: result.decisionsMade ?? [],
      expectedFromMe: result.expectedFromMe ?? [],
      risks: result.risks ?? [],
      usefulContext: result.usefulContext ?? [],
      tone: result.tone ?? '',
    };

    const info = this.stmts.insert.run({
      chatId: result.chatId,
      summary: result.summary,
      actionItems: JSON.stringify(result.actionItems),
      unresolvedQuestions: JSON.stringify(result.unresolvedQuestions),
      extraData: JSON.stringify(extraData),
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

  /** Get all summaries created after a timestamp, across all chats. */
  getRecentSummaries(sinceTimestamp: number, limit: number = 50): SummaryResult[] {
    const stmt = this.db.prepare(`
      SELECT * FROM summaries WHERE created_at > @sinceTs ORDER BY created_at DESC LIMIT @limit
    `);
    const rows = stmt.all({ sinceTs: sinceTimestamp, limit }) as RawSummaryRow[];
    return rows.map(deserializeRow);
  }
}

// ── Internal ──────────────────────────────────────────────────────────

interface RawSummaryRow {
  id: number;
  chat_id: string;
  summary: string;
  action_items: string;
  unresolved_questions: string;
  extra_data?: string;
  provider: string;
  model: string;
  message_count: number;
  time_range_start: number;
  time_range_end: number;
  created_at: number;
}

function deserializeRow(row: RawSummaryRow): SummaryResult {
  const extra: SummaryExtraData = row.extra_data
    ? { ...DEFAULT_EXTRA_DATA, ...JSON.parse(row.extra_data) }
    : { ...DEFAULT_EXTRA_DATA };

  // Ensure action items have the priority field (backwards compat with old data)
  const actionItems = (JSON.parse(row.action_items) as Array<ActionItem & { priority?: string | null }>).map(
    (item) => ({
      ...item,
      priority: (item.priority as ActionItem['priority']) ?? null,
    })
  );

  return {
    id: row.id,
    chatId: row.chat_id,
    summary: row.summary,
    actionItems,
    unresolvedQuestions: JSON.parse(row.unresolved_questions) as string[],
    provider: row.provider,
    model: row.model,
    messageCount: row.message_count,
    timeRange: [row.time_range_start, row.time_range_end],
    createdAt: row.created_at,
    // Spread extra data fields
    tldr: extra.tldr,
    keyTopics: extra.keyTopics,
    decisionsMade: extra.decisionsMade,
    expectedFromMe: extra.expectedFromMe,
    risks: extra.risks,
    usefulContext: extra.usefulContext,
    tone: extra.tone,
  };
}
