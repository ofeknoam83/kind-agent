import type { ChatMessage, ActionItem } from '../shared/types';

/**
 * Every summarization provider implements this interface.
 * The engine calls summarize() and expects structured output.
 *
 * Providers are stateless — config is injected at construction time.
 */
export interface SummarizationProvider {
  readonly type: string;

  /** Verify the provider is reachable and return available models. */
  healthCheck(): Promise<{ reachable: boolean; models: string[]; error?: string }>;

  /** Summarize a batch of messages. Must return structured output. */
  summarize(request: SummarizeInput): Promise<SummarizeOutput>;
}

export interface SummarizeInput {
  messages: ChatMessage[];
  /** Name of the chat for context. */
  chatName: string;
  /** Previous summary to build on (incremental summarization). */
  previousSummary?: string;
}

export interface SummarizeOutput {
  summary: string;
  actionItems: ActionItem[];
  unresolvedQuestions: string[];
}

/**
 * System prompt used by all providers.
 * Providers send this as the system message and format the chat
 * transcript as the user message.
 */
export const SYSTEM_PROMPT = `You are a WhatsApp chat summarizer. You will receive a transcript of a WhatsApp conversation.

Produce a JSON response with exactly this structure:
{
  "summary": "A clear, concise summary of the conversation in 2-5 paragraphs. Focus on key decisions, topics discussed, and outcomes.",
  "actionItems": [
    {
      "assignee": "Person name or null if unassigned",
      "description": "What needs to be done",
      "deadline": "Mentioned deadline or null"
    }
  ],
  "unresolvedQuestions": [
    "Questions that were raised but not answered in the conversation"
  ]
}

Rules:
- Output ONLY valid JSON. No markdown, no code fences, no explanation.
- If there are no action items, return an empty array.
- If there are no unresolved questions, return an empty array.
- Preserve the original language of the conversation in the summary.
- Attribute action items to specific people when possible.
- Be concise but complete.`;

/**
 * Format a message array into a transcript string for the LLM.
 */
export function formatTranscript(messages: ChatMessage[], chatName: string): string {
  const header = `Chat: ${chatName}\nMessages: ${messages.length}\n---\n`;
  const lines = messages.map(
    (m) => `[${new Date(m.timestamp * 1000).toISOString()}] ${m.senderName}: ${m.body}`
  );
  return header + lines.join('\n');
}

/**
 * Parse the LLM's JSON response into structured output.
 * Handles common LLM quirks (markdown fences, trailing commas).
 */
export function parseProviderResponse(raw: string): SummarizeOutput {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(cleaned);

  return {
    summary: String(parsed.summary ?? ''),
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((item: Record<string, unknown>) => ({
          assignee: item.assignee && item.assignee !== 'null' && item.assignee !== 'None'
            ? String(item.assignee) : null,
          description: String(item.description ?? ''),
          deadline: item.deadline && item.deadline !== 'null' && item.deadline !== 'None'
            ? String(item.deadline) : null,
        }))
      : [],
    unresolvedQuestions: Array.isArray(parsed.unresolvedQuestions)
      ? parsed.unresolvedQuestions.map(String)
      : [],
  };
}
