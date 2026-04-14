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

export const SetCategoryRequest = z.object({
  chatId: z.string().min(1),
  category: z.enum(['School', 'Kindergarten', 'Work', 'Family', 'Friends', 'Other']).nullable(),
});

export const SummaryRecentRequest = z.object({
  sinceTimestamp: z.number().int(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const ActionItemsListRequest = z.object({
  sinceTimestamp: z.number().int().optional(),
  chatId: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

export const ActionItemIdRequest = z.object({
  id: z.number().int().positive(),
});

// ── Validator map keyed by channel ────────────────────────────────────
// Used in main process to validate incoming IPC payloads.

export const channelValidators = {
  'chats:get-messages': GetMessagesRequest,
  'chats:set-category': SetCategoryRequest,
  'summarize:run': SummarizeRunRequest,
  'summarize:list': SummaryListRequest,
  'summarize:get': SummaryGetRequest,
  'summarize:recent': SummaryRecentRequest,
  'providers:update': ProviderUpdateRequest,
  'providers:set-api-key': SetApiKeyRequest,
  'settings:set': SettingsSetRequest,
  'action-items:list': ActionItemsListRequest,
  'action-items:mark-done': ActionItemIdRequest,
  'action-items:dismiss': ActionItemIdRequest,
} as const;
