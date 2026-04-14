import type { ProviderConfig, ProviderType } from '../shared/types';
import type { SummarizationProvider } from './base';
import { OpenAIProvider } from './openai-provider';
import { LMStudioProvider } from './lmstudio-provider';
import { OllamaProvider } from './ollama-provider';

/**
 * Creates a provider instance from config.
 * API keys are passed separately — they come from the OS keychain,
 * NOT from the database or config files.
 */
export function createProvider(
  config: ProviderConfig,
  apiKeys: Partial<Record<ProviderType, string>>
): SummarizationProvider {
  switch (config.type) {
    case 'openai': {
      const apiKey = apiKeys.openai;
      if (!apiKey) {
        throw new Error('OpenAI API key not configured. Set it in Settings > Providers.');
      }
      return new OpenAIProvider({
        baseUrl: config.baseUrl,
        apiKey,
        model: config.model,
      });
    }

    case 'lmstudio':
      return new LMStudioProvider({
        baseUrl: config.baseUrl,
        model: config.model,
      });

    case 'ollama':
      return new OllamaProvider({
        baseUrl: config.baseUrl,
        model: config.model,
      });

    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}
