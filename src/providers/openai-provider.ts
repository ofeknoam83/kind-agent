import type { SummarizationProvider, SummarizeInput, SummarizeOutput } from './base';
import { SYSTEM_PROMPT, formatTranscript, formatPreviousContext, parseProviderResponse } from './base';

interface OpenAIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * OpenAI-compatible provider.
 * Works with the official OpenAI API using the chat completions endpoint.
 */
export class OpenAIProvider implements SummarizationProvider {
  readonly type = 'openai';

  constructor(private config: OpenAIProviderConfig) {}

  async healthCheck() {
    try {
      const res = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        return { reachable: false, models: [], error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { data: { id: string }[] };
      const models = data.data.map((m) => m.id);
      return { reachable: true, models };
    } catch (err) {
      return { reachable: false, models: [], error: String(err) };
    }
  }

  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    const transcript = formatTranscript(input.messages, input.chatName, input.isGroup);

    const contextBlock = input.previousContext
      ? formatPreviousContext(input.previousContext)
      : input.previousSummary
        ? `Previous summary for context:\n${input.previousSummary}\n\n`
        : '';
    const userMessage = contextBlock
      ? `${contextBlock}---\n\nNew messages to summarize:\n${transcript}`
      : transcript;

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      choices: { message: { content: string } }[];
    };

    return parseProviderResponse(data.choices[0].message.content);
  }
}
