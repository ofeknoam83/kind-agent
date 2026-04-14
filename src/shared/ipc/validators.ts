import { z } from 'zod';

// ── Request validators (renderer -> main) ─────────────────────────────

export const GetMessagesRequest = z.object({
  chatId: z.string().min(1),
  limit: z.number().int().min(1).max(5000).default(500),
  beforeTimestamp: z.number().optional(),
});

export const SummarizeRunRequest = z.object({
  chatId: z.string().min(1),
  afterTimestamp: z.number().nullable(),
  provider: z.enum(['openai', 'lmstudio', 'ollama']).optional(),
});

export const ProviderUpdateRequest = z.object({
  type: z.enum(['openai', 'lmstudio', 'ollama']),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  active: z.boolean(),
});

export const SetApiKeyRequest = z.object({
  provider: z.enum(['openai', 'lmstudio', 'ollama']),
  apiKey: z.string().min(1),
});

export const SettingsSetRequest = z.object({
  key: z.string().min(1),
  value: z.unknown(),
});

export const SummaryListRequest = z.object({
  chatId: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const SummaryGetRequest = z.object({
  id: z.number().int().positive(),
});

// ── Validator map keyed by channel ────────────────────────────────────
// Used in main process to validate incoming IPC payloads.

export const channelValidators = {
  'chats:get-messages': GetMessagesRequest,
  'summarize:run': SummarizeRunRequest,
  'summarize:list': SummaryListRequest,
  'summarize:get': SummaryGetRequest,
  'providers:update': ProviderUpdateRequest,
  'providers:set-api-key': SetApiKeyRequest,
  'settings:set': SettingsSetRequest,
} as const;
