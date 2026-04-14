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
  suggestedCategory: string;
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
    "Things explicitly requested from ME (the person reading this summary)"
  ],
  "risks": [
    "Blockers, confusion, delays, or issues raised"
  ],
  "usefulContext": [
    "Background info, links, references only if needed"
  ],
  "tone": "Overall tone/sentiment of the conversation and any notable emotional signals",
  "suggestedCategory": "Work | School | Kindergarten | Family | Friends | Other"
}

Rules:
- Output ONLY valid JSON. No markdown, no code fences, no explanation.
- If any section has no items, return an empty array (or empty string for tone/tldr).
- Preserve the original language of the conversation in all output.
- Be concise but complete. Do not invent information not present in the conversation.

CRITICAL — Understand intent, not just text:
WhatsApp conversations often include PASTED/FORWARDED content that is NOT part of the conversation itself. You MUST recognize these patterns:
- Someone pastes a draft message they plan to send to someone else, then asks "can I send?", "what do you think?", "approve?" → The pasted content is a DRAFT FOR REVIEW. The actual conversation is about approving the draft. Do NOT extract action items or expectations from the draft's content.
- Someone forwards a message from another chat → The forwarded content is CONTEXT, not an action item.
- Someone shares a screenshot or long text block followed by a short reaction → The block is SHARED CONTENT, the reaction is the real conversation.
- When someone says "sent!" after sharing a draft → The action is ALREADY DONE, not pending.

Action items — STRICT rules:
- ONLY extract action items that someone in the conversation EXPLICITLY committed to, was directly asked to do, or was assigned.
- A real action item: "I'll do X", "Can you handle Y?", "Please send the report by Friday".
- NOT an action item: content inside a pasted draft, text from a forwarded message, things mentioned in passing, things already completed ("sent!", "done!", "handled").
- Do NOT infer tasks that were never discussed. If no one asked for it, it's not an action item.
- When in doubt, leave it out. Fewer accurate items are far better than hallucinated ones.
- Attribute to specific people when possible. Set priority based on urgency/importance. Use null if unclear.
- Descriptions MUST be specific and self-contained. The reader should understand what needs to be done WITHOUT reading the full conversation. Include WHO needs to do it, WHAT exactly, and WHY.
  BAD: "Review flow changes"
  GOOD: "Alexandra needs to review the new checkout flow — there are bugs with the clickable upgrade button and items not being added to cart"
  BAD: "Schedule a meeting"
  GOOD: "Yoav to schedule a follow-up call with Asi this week to discuss growth goals and bottlenecks"

expectedFromMe — STRICT rules:
- "Me" is the person READING this summary (the app user). They may or may not be a participant in the conversation.
- ONLY include things that were explicitly directed at the reader or that the reader clearly needs to act on.
- If someone in the group asks another specific person to do something, that is NOT "expected from me" unless "me" is that specific person.
- General group requests like "everyone please..." or tasks clearly waiting on the reader qualify.
- When in doubt, return an empty array. Do not guess.

Risks:
- Highlight any blockers, sources of confusion, potential delays, or misalignments.

Tone:
- Describe the overall sentiment (e.g. "Collaborative and upbeat", "Tense, with frustration from X about Y").

suggestedCategory:
- Classify this conversation into ONE category based on its content and participants.
- Work = professional, business, projects, clients, colleagues.
- School = children's school related (parents groups, teacher comms, homework).
- Kindergarten = daycare/kindergarten/gan related.
- Family = family members, personal family matters.
- Friends = social, personal, casual with friends.
- Other = doesn't fit any above.`;

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
    suggestedCategory: String(parsed.suggestedCategory ?? 'Other'),
  };
}
