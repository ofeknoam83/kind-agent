import type { SummarizationProvider, SummarizeInput, SummarizeOutput } from './base';
import { SYSTEM_PROMPT, formatTranscript, parseProviderResponse } from './base';

interface LMStudioProviderConfig {
  baseUrl: string;
  model: string;
}

/**
 * LM Studio provider.
 * LM Studio exposes an OpenAI-compatible REST API at /v1/chat/completions.
 * No API key required — it runs locally.
 */
export class LMStudioProvider implements SummarizationProvider {
  readonly type = 'lmstudio';

  constructor(private config: LMStudioProviderConfig) {}

  async healthCheck() {
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        return { reachable: false, models: [], error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { data: { id: string }[] };
      return { reachable: true, models: data.data.map((m) => m.id) };
    } catch (err) {
      return { reachable: false, models: [], error: String(err) };
    }
  }

  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    const transcript = formatTranscript(input.messages, input.chatName, input.isGroup);

    const userMessage = input.previousSummary
      ? `Previous summary for context:\n${input.previousSummary}\n\n---\n\nNew messages to summarize:\n${transcript}`
      : transcript;

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      }),
      signal: AbortSignal.timeout(300_000), // Local models can be slow
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LM Studio error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };

    return parseProviderResponse(data.choices[0].message.content);
  }
}
