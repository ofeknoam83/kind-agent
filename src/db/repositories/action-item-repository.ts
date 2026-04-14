import type Database from 'better-sqlite3';
import type { ActionItem, TrackedActionItem } from '../../shared/types';

/**
 * Compute a dedup fingerprint for an action item.
 * Uses chatId + normalized description to catch near-duplicates
 * across multiple auto-summarize runs.
 */
function fingerprint(chatId: string, description: string): string {
  const normalized = description
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '') // keep Unicode letters+numbers (Hebrew support)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  // Simple hash — collision-resistant enough for dedup
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  return `${chatId.slice(0, 20)}:${hash.toString(36)}`;
}

export class ActionItemRepository {
  private stmts: ReturnType<typeof this.prepareStatements>;

  constructor(private db: Database.Database) {
    this.stmts = this.prepareStatements();
  }

  private prepareStatements() {
    return {
      insert: this.db.prepare(`
        INSERT OR IGNORE INTO action_items
          (summary_id, chat_id, description, assignee, deadline, priority, confidence, fingerprint)
        VALUES
          (@summaryId, @chatId, @description, @assignee, @deadline, @priority, @confidence, @fingerprint)
      `),

      listOpen: this.db.prepare(`
        SELECT id, summary_id as summaryId, chat_id as chatId, description,
               assignee, deadline, priority, confidence, status,
               created_at as createdAt, resolved_at as resolvedAt
        FROM action_items
        WHERE status = 'open'
        ORDER BY
          CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
          created_at DESC
      `),

      listOpenForChat: this.db.prepare(`
        SELECT id, summary_id as summaryId, chat_id as chatId, description,
               assignee, deadline, priority, confidence, status,
               created_at as createdAt, resolved_at as resolvedAt
        FROM action_items
        WHERE status = 'open' AND chat_id = @chatId
        ORDER BY
          CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
          created_at DESC
      `),

      listRecent: this.db.prepare(`
        SELECT id, summary_id as summaryId, chat_id as chatId, description,
               assignee, deadline, priority, confidence, status,
               created_at as createdAt, resolved_at as resolvedAt
        FROM action_items
        WHERE status IN ('open', 'done')
          AND created_at > @sinceTs
        ORDER BY
          CASE status WHEN 'open' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
          CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
          created_at DESC
        LIMIT @limit
      `),

      markDone: this.db.prepare(`
        UPDATE action_items SET status = 'done', resolved_at = unixepoch() WHERE id = @id
      `),

      dismiss: this.db.prepare(`
        UPDATE action_items SET status = 'dismissed', resolved_at = unixepoch() WHERE id = @id
      `),

      dismissAll: this.db.prepare(`
        UPDATE action_items SET status = 'dismissed', resolved_at = unixepoch() WHERE status = 'open'
      `),

      undone: this.db.prepare(`
        UPDATE action_items SET status = 'open', resolved_at = NULL WHERE id = @id
      `),
    };
  }

  /**
   * Insert action items from a new summary, deduplicating against existing open items.
   * Returns the number of new items inserted.
   */
  insertFromSummary(summaryId: number, chatId: string, items: ActionItem[]): number {
    let inserted = 0;
    const tx = this.db.transaction(() => {
      for (const item of items) {
        if (!item.description || item.description.length < 3) continue;
        // Skip low-confidence items
        const confidence = item.confidence ?? 3;
        if (confidence < 2) continue;

        const fp = fingerprint(chatId, item.description);
        const result = this.stmts.insert.run({
          summaryId,
          chatId,
          description: item.description,
          assignee: item.assignee && item.assignee !== 'null' && item.assignee !== 'None'
            ? item.assignee : null,
          deadline: item.deadline && item.deadline !== 'null' && item.deadline !== 'None'
            ? item.deadline : null,
          priority: item.priority || null,
          confidence,
          fingerprint: fp,
        });
        if (result.changes > 0) inserted++;
      }
    });
    tx();
    return inserted;
  }

  /** List all open action items, optionally filtered by chat. */
  listOpen(chatId?: string): TrackedActionItem[] {
    if (chatId) {
      return this.stmts.listOpenForChat.all({ chatId }) as TrackedActionItem[];
    }
    return this.stmts.listOpen.all() as TrackedActionItem[];
  }

  /** List recent open + done items (for Dashboard). */
  listRecent(sinceTimestamp: number, limit = 50): TrackedActionItem[] {
    return this.stmts.listRecent.all({ sinceTs: sinceTimestamp, limit }) as TrackedActionItem[];
  }

  /** Mark an action item as done. */
  markDone(id: number): void {
    this.stmts.markDone.run({ id });
  }

  /** Dismiss an action item (hide permanently). */
  dismiss(id: number): void {
    this.stmts.dismiss.run({ id });
  }

  /** Dismiss all open action items. */
  dismissAll(): void {
    this.stmts.dismissAll.run();
  }

  /** Re-open a done/dismissed item. */
  undone(id: number): void {
    this.stmts.undone.run({ id });
  }
}
