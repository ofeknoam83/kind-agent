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
  tldr: string;
  keyTopics: string[];
  decisionsMade: string[];
  expectedFromMe: string[];
  risks: string[];
  usefulContext: string[];
  tone: string;
}

/**
 * System prompt used by all providers.
 * Providers send this as the system message and format the chat
 * transcript as the user message.
 */
export const SYSTEM_PROMPT = `You are an expert WhatsApp chat summarizer. You will receive a transcript of a WhatsApp conversation.

Produce a JSON response with exactly this structure:

{
  "tldr": "2-3 line max high-level overview of what this conversation is about and what happened.",
  "keyTopics": [
    "Topic 1",
    "Topic 2"
  ],
  "decisionsMade": [
    "Decision X was made because of Y"
  ],
  "unresolvedQuestions": [
    "Question raised by Person - why it matters"
  ],
  "actionItems": [
    {
      "assignee": "Person name or null if unassigned",
      "description": "What needs to be done",
      "deadline": "Mentioned deadline or null",
      "priority": "high | medium | low or null if unclear"
    }
  ],
  "expectedFromMe": [
    "Explicit or implicit expectation on the reader / user"
  ],
  "risks": [
    "Blockers, confusion, delays, or issues raised"
  ],
  "usefulContext": [
    "Background info, links, references only if needed"
  ],
  "tone": "Overall tone/sentiment of the conversation and any notable emotional signals"
}

Rules:
- Output ONLY valid JSON. No markdown, no code fences, no explanation.
- If any section has no items, return an empty array (or empty string for tone/tldr).
- Preserve the original language of the conversation in all output.
- Be concise but complete. Do not invent information not present in the conversation.

Action items — STRICT rules:
- ONLY extract action items that someone in the conversation EXPLICITLY committed to, was asked to do, or was assigned.
- A real action item sounds like: "I'll do X", "Can you handle Y?", "Let's schedule Z", "Please send the report by Friday".
- Do NOT extract action items from quoted, forwarded, or draft messages that someone shared for review or approval. If someone says "here's what I plan to send" or shares a screenshot/draft, the CONTENT of that draft is NOT an action item — the action is "review/approve the draft" at most.
- Do NOT infer tasks that were never discussed. If no one asked for it, it's not an action item.
- When in doubt, leave it out. Fewer accurate items are better than many hallucinated ones.
- Attribute to specific people when possible. Set priority based on urgency/importance. Use null if unclear.

Expected from me:
- Only include expectations that were DIRECTLY stated or clearly implied toward the reader.
- Do not fabricate expectations from tangential context or from content inside shared/forwarded/quoted messages.

Risks:
- Highlight any blockers, sources of confusion, potential delays, or misalignments.

Tone:
- Describe the overall sentiment (e.g. "Collaborative and upbeat", "Tense, with frustration from X about Y").`;

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

  const tldr = String(parsed.tldr ?? parsed.summary ?? '');

  // Build a formatted summary string from the structured data for backwards compat
  const summaryParts: string[] = [];
  if (tldr) summaryParts.push(tldr);
  if (Array.isArray(parsed.keyTopics) && parsed.keyTopics.length > 0) {
    summaryParts.push('Key Topics: ' + parsed.keyTopics.join(', '));
  }
  if (Array.isArray(parsed.decisionsMade) && parsed.decisionsMade.length > 0) {
    summaryParts.push('Decisions: ' + parsed.decisionsMade.join('; '));
  }
  const summary = summaryParts.length > 0 ? summaryParts.join('\n\n') : String(parsed.summary ?? '');

  const validPriorities = new Set(['high', 'medium', 'low']);

  return {
    summary,
    tldr,
    keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.map(String) : [],
    decisionsMade: Array.isArray(parsed.decisionsMade) ? parsed.decisionsMade.map(String) : [],
    actionItems: Array.isArray(parsed.actionItems)
      ? parsed.actionItems.map((item: Record<string, unknown>) => ({
          assignee: item.assignee && item.assignee !== 'null' && item.assignee !== 'None'
            ? String(item.assignee) : null,
          description: String(item.description ?? ''),
          deadline: item.deadline && item.deadline !== 'null' && item.deadline !== 'None'
            ? String(item.deadline) : null,
          priority: typeof item.priority === 'string' && validPriorities.has(item.priority.toLowerCase())
            ? item.priority.toLowerCase() as 'high' | 'medium' | 'low' : null,
        }))
      : [],
    unresolvedQuestions: Array.isArray(parsed.unresolvedQuestions)
      ? parsed.unresolvedQuestions.map(String)
      : [],
    expectedFromMe: Array.isArray(parsed.expectedFromMe) ? parsed.expectedFromMe.map(String) : [],
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String) : [],
    usefulContext: Array.isArray(parsed.usefulContext) ? parsed.usefulContext.map(String) : [],
    tone: String(parsed.tone ?? ''),
  };
}
