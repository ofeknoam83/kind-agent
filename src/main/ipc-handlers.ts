import { ipcMain, type BrowserWindow } from 'electron';
import { ZodError } from 'zod';
import { IpcChannels, IpcEvents, channelValidators } from '../shared/ipc';
import type { ChatMessage } from '../shared/types';
import { getDb, closeDb } from '../db/connection';
import { ChatRepository } from '../db/repositories/chat-repository';
import { SummaryRepository } from '../db/repositories/summary-repository';
import { ProviderRepository } from '../db/repositories/provider-repository';
import { createProvider } from '../providers/provider-factory';
import { BaileysClient } from '../connector/whatsapp/baileys-client';
import { setApiKey, getAllApiKeys } from './keychain';

/**
 * All imports are static (Vite bundles them).
 * But DB + Baileys are initialized lazily on first IPC call.
 */

let chatRepo: ChatRepository | null = null;
let summaryRepo: SummaryRepository | null = null;
let providerRepo: ProviderRepository | null = null;
let baileysClient: BaileysClient | null = null;

function ensureRepos() {
  if (!chatRepo) {
    const db = getDb();
    chatRepo = new ChatRepository(db);
    summaryRepo = new SummaryRepository(db);
    providerRepo = new ProviderRepository(db);
  }
  return { chatRepo: chatRepo!, summaryRepo: summaryRepo!, providerRepo: providerRepo! };
}

function ensureBaileys(mainWindow: BrowserWindow) {
  if (!baileysClient) {
    baileysClient = new BaileysClient();

    baileysClient.on('connection-state', (state) => {
      mainWindow.webContents.send(IpcEvents.WHATSAPP_STATE_CHANGED, state);
    });

    baileysClient.on('messages', (messages: ChatMessage[]) => {
      const { chatRepo } = ensureRepos();
      const byChatId = new Map<string, ChatMessage[]>();
      for (const msg of messages) {
        const existing = byChatId.get(msg.chatId) ?? [];
        existing.push(msg);
        byChatId.set(msg.chatId, existing);
      }

      for (const [chatId, msgs] of byChatId) {
        const maxTs = Math.max(...msgs.map((m) => m.timestamp));
        chatRepo.upsertChatWithMessages(
          {
            id: chatId,
            name: msgs[0].senderName,
            isGroup: chatId.endsWith('@g.us'),
            lastMessageTimestamp: maxTs,
          },
          msgs
        );
      }

      mainWindow.webContents.send(IpcEvents.NEW_MESSAGES, messages);
    });
  }
  return baileysClient;
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ── WhatsApp ─────────────────────────────────────────────

  ipcMain.handle(IpcChannels.WHATSAPP_CONNECT, async () => {
    try {
      await ensureBaileys(mainWindow).connect();
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IpcChannels.WHATSAPP_DISCONNECT, async () => {
    try {
      await ensureBaileys(mainWindow).disconnect();
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IpcChannels.WHATSAPP_GET_STATE, () => {
    try {
      return ensureBaileys(mainWindow).getState();
    } catch {
      return { status: 'disconnected' };
    }
  });

  // ── Chats ────────────────────────────────────────────────

  ipcMain.handle(IpcChannels.CHATS_LIST, () => {
    try {
      return ensureRepos().chatRepo.listChats();
    } catch {
      return [];
    }
  });

  ipcMain.handle(IpcChannels.CHATS_GET_MESSAGES, (_event, rawPayload: unknown) => {
    return withValidation('chats:get-messages', rawPayload, (payload) => {
      return ensureRepos().chatRepo.getMessages(payload.chatId, payload.limit, payload.beforeTimestamp);
    });
  });

  // ── Summarization ────────────────────────────────────────

  ipcMain.handle(IpcChannels.SUMMARIZE_RUN, async (_event, rawPayload: unknown) => {
    return withValidation('summarize:run', rawPayload, async (payload) => {
      const { chatRepo, summaryRepo, providerRepo } = ensureRepos();

      const providerConfig = payload.provider
        ? providerRepo.listAll().find((p) => p.type === payload.provider)
        : providerRepo.getActive();

      if (!providerConfig) {
        throw new Error('No active summarization provider configured.');
      }

      const apiKeys = getAllApiKeys();
      const provider = createProvider(providerConfig, apiKeys);

      const messages = payload.afterTimestamp
        ? chatRepo.getMessagesAfter(payload.chatId, payload.afterTimestamp)
        : chatRepo.getMessages(payload.chatId, 2000);

      if (messages.length === 0) {
        throw new Error('No messages to summarize.');
      }

      const latestSummary = summaryRepo.getLatestForChat(payload.chatId);

      mainWindow.webContents.send(IpcEvents.SUMMARIZE_PROGRESS, {
        chatId: payload.chatId,
        status: 'running',
        messageCount: messages.length,
      });

      const result = await provider.summarize({
        messages,
        chatName: chatRepo.listChats().find((c) => c.id === payload.chatId)?.name ?? 'Unknown',
        previousSummary: latestSummary?.summary,
      });

      const timestamps = messages.map((m) => m.timestamp);
      const id = summaryRepo.insert({
        chatId: payload.chatId,
        ...result,
        provider: providerConfig.type,
        model: providerConfig.model,
        messageCount: messages.length,
        timeRange: [Math.min(...timestamps), Math.max(...timestamps)],
      });

      mainWindow.webContents.send(IpcEvents.SUMMARIZE_PROGRESS, {
        chatId: payload.chatId,
        status: 'complete',
      });

      return summaryRepo.getById(id);
    });
  });

  ipcMain.handle(IpcChannels.SUMMARIZE_LIST, (_event, rawPayload: unknown) => {
    return withValidation('summarize:list', rawPayload, (payload) => {
      return ensureRepos().summaryRepo.listByChat(payload.chatId, payload.limit);
    });
  });

  ipcMain.handle(IpcChannels.SUMMARIZE_GET, (_event, rawPayload: unknown) => {
    return withValidation('summarize:get', rawPayload, (payload) => {
      return ensureRepos().summaryRepo.getById(payload.id);
    });
  });

  // ── Providers ────────────────────────────────────────────

  ipcMain.handle(IpcChannels.PROVIDERS_LIST, () => {
    try {
      return ensureRepos().providerRepo.listAll();
    } catch {
      return [];
    }
  });

  ipcMain.handle(IpcChannels.PROVIDERS_UPDATE, (_event, rawPayload: unknown) => {
    return withValidation('providers:update', rawPayload, (payload) => {
      ensureRepos().providerRepo.update(payload);
      return { success: true };
    });
  });

  ipcMain.handle(IpcChannels.PROVIDERS_HEALTH, async (_event, providerType?: string) => {
    try {
      const { providerRepo } = ensureRepos();
      const configs = providerRepo.listAll();
      const apiKeys = getAllApiKeys();
      const results = [];

      for (const config of configs) {
        if (providerType && config.type !== providerType) continue;
        try {
          const provider = createProvider(config, apiKeys);
          const health = await provider.healthCheck();
          results.push({ type: config.type, ...health });
        } catch (err) {
          results.push({ type: config.type, reachable: false, models: [], error: String(err) });
        }
      }
      return results;
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle(IpcChannels.PROVIDERS_SET_API_KEY, (_event, rawPayload: unknown) => {
    return withValidation('providers:set-api-key', rawPayload, (payload) => {
      setApiKey(payload.provider, payload.apiKey);
      return { success: true };
    });
  });
}

// Re-export for app cleanup
export { closeDb };

// ── Validation helper ─────────────────────────────────────────────────

type ValidatorKey = keyof typeof channelValidators;

function withValidation<K extends ValidatorKey, R>(
  channel: K,
  rawPayload: unknown,
  handler: (validated: ReturnType<(typeof channelValidators)[K]['parse']>) => R
): R | { error: string } {
  try {
    const validator = channelValidators[channel];
    const validated = validator.parse(rawPayload);
    return handler(validated as ReturnType<(typeof channelValidators)[K]['parse']>);
  } catch (err) {
    if (err instanceof ZodError) {
      return { error: `Validation error: ${err.errors.map((e) => e.message).join(', ')}` };
    }
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
