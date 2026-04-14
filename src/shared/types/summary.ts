/** The structured output of a summarization run. */
export interface SummaryResult {
  /** DB-assigned ID */
  id: number;
  /** Which chat was summarized */
  chatId: string;
  /** Human-readable summary paragraphs (legacy, still populated for backwards compat) */
  summary: string;
  /** Extracted action items */
  actionItems: ActionItem[];
  /** Questions that were raised but not resolved in the conversation */
  unresolvedQuestions: string[];
  /** Which provider produced this summary */
  provider: string;
  /** Model identifier (e.g. "gpt-4o", "llama3.2:8b") */
  model: string;
  /** Number of messages that went into this summary */
  messageCount: number;
  /** Time range of messages [start, end] as unix epoch seconds */
  timeRange: [number, number];
  /** When this summary was created (unix epoch seconds) */
  createdAt: number;

  // ── New structured fields ───────────────────────────────────
  /** TL;DR - 2-3 line max overview */
  tldr: string;
  /** Key topics discussed in the conversation */
  keyTopics: string[];
  /** Decisions that were made, with context */
  decisionsMade: string[];
  /** What is expected from the user (explicit + implicit expectations) */
  expectedFromMe: string[];
  /** Risks, blockers, confusion, delays */
  risks: string[];
  /** Useful context (only if needed) */
  usefulContext: string[];
  /** Overall tone / sentiment of the conversation */
  tone: string;
}

export interface ActionItem {
  /** Who is responsible (extracted from conversation) */
  assignee: string | null;
  /** What needs to be done */
  description: string;
  /** Optional deadline mentioned in conversation */
  deadline: string | null;
  /** Priority level */
  priority: 'high' | 'medium' | 'low' | null;
  /** LLM self-assessed confidence (1=speculative, 3=reasonable, 5=explicit) */
  confidence?: number;
}

/** Action item persisted in the action_items table with status tracking. */
export interface TrackedActionItem {
  id: number;
  summaryId: number | null;
  chatId: string;
  description: string;
  assignee: string | null;
  deadline: string | null;
  priority: 'high' | 'medium' | 'low' | null;
  confidence: number;
  status: 'open' | 'done' | 'dismissed';
  createdAt: number;
  resolvedAt: number | null;
}

/** Extra structured data stored alongside a summary (persisted as JSON). */
export interface SummaryExtraData {
  tldr: string;
  keyTopics: string[];
  decisionsMade: string[];
  expectedFromMe: string[];
  risks: string[];
  usefulContext: string[];
  tone: string;
}

/** Default extra data for backwards compatibility with old summaries. */
export const DEFAULT_EXTRA_DATA: SummaryExtraData = {
  tldr: '',
  keyTopics: [],
  decisionsMade: [],
  expectedFromMe: [],
  risks: [],
  usefulContext: [],
  tone: '',
};

/** Request to create a new summary. Sent from renderer -> main via IPC. */
export interface SummarizeRequest {
  chatId: string;
  /** Summarize messages after this timestamp. Null = all unsummarized messages. */
  afterTimestamp: number | null;
  /** Override default provider for this request */
  provider?: string;
}
