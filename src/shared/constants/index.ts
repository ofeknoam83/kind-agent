/** Default provider endpoints. */
export const DEFAULT_PROVIDERS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  lmstudio: {
    baseUrl: 'http://localhost:1234/v1',
    model: 'default',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2:8b',
  },
} as const;

/** Maximum messages to feed into a single summarization call. */
export const MAX_MESSAGES_PER_SUMMARY = 2000;

/** Batching: how many messages to accumulate before auto-summarize prompt. */
export const AUTO_SUMMARIZE_THRESHOLD = 500;

/** SQLite database filename. */
export const DB_FILENAME = 'whatsapp-summarizer.db';

/** Baileys auth state directory name. */
export const AUTH_DIR = 'auth_info_baileys';
