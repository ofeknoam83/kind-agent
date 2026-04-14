import type { SummarizationProvider, SummarizeInput, SummarizeOutput } from './base';
import { SYSTEM_PROMPT, formatTranscript, parseProviderResponse } from './base';

interface OllamaProviderConfig {
  baseUrl: string;
  model: string;
}

/**
 * Ollama provider.
 * Uses Ollama's native /api/chat endpoint (NOT OpenAI-compatible).
 * This gives us access to Ollama-specific features like format: "json".
 */
export class OllamaProvider implements SummarizationProvider {
  readonly type = 'ollama';

  constructor(private config: OllamaProviderConfig) {}

  async healthCheck() {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        return { reachable: false, models: [], error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as { models: { name: string }[] };
      return { reachable: true, models: data.models.map((m) => m.name) };
    } catch (err) {
      return { reachable: false, models: [], error: String(err) };
    }
  }

  async summarize(input: SummarizeInput): Promise<SummarizeOutput> {
    const transcript = formatTranscript(input.messages, input.chatName);

    const userMessage = input.previousSummary
      ? `Previous summary for context:\n${input.previousSummary}\n\n---\n\nNew messages to summarize:\n${transcript}`
      : transcript;

    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        format: 'json',
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 4096,
        },
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
      message: { content: string };
    };

    return parseProviderResponse(data.message.content);
  }
}
