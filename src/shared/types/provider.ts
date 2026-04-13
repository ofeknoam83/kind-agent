/** Provider configuration stored in settings. */
export interface ProviderConfig {
  /** Unique provider key: "openai" | "lmstudio" | "ollama" */
  type: ProviderType;
  /** Display label */
  label: string;
  /** Base URL for the provider API */
  baseUrl: string;
  /** API key — only relevant for OpenAI. Stored in OS keychain, NOT in config file. */
  apiKey?: string;
  /** Model identifier to use */
  model: string;
  /** Whether this provider is currently selected */
  active: boolean;
}

export type ProviderType = 'openai' | 'lmstudio' | 'ollama';

/** Health check result for a provider. */
export interface ProviderStatus {
  type: ProviderType;
  reachable: boolean;
  models: string[];
  error?: string;
}
