/** The structured output of a summarization run. */
export interface SummaryResult {
  /** DB-assigned ID */
  id: number;
  /** Which chat was summarized */
  chatId: string;
  /** Human-readable summary paragraphs */
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
}

export interface ActionItem {
  /** Who is responsible (extracted from conversation) */
  assignee: string | null;
  /** What needs to be done */
  description: string;
  /** Optional deadline mentioned in conversation */
  deadline: string | null;
}

/** Request to create a new summary. Sent from renderer -> main via IPC. */
export interface SummarizeRequest {
  chatId: string;
  /** Summarize messages after this timestamp. Null = all unsummarized messages. */
  afterTimestamp: number | null;
  /** Override default provider for this request */
  provider?: string;
}
