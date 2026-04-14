import { ipcMain, type BrowserWindow } from 'electron';
import { ZodError } from 'zod';
import { IpcChannels, IpcEvents, channelValidators } from '../shared/ipc';
import type { ChatMessage } from '../shared/types';

/**
 * Registers all IPC handlers.
 *
 * DB and Baileys are initialized lazily on first use — not at import time.
 * This prevents native module load failures from killing the entire app.
 */

let _deps: ReturnType<typeof initDeps> | null = null;

function getDeps(mainWindow: BrowserWindow) {
  if (!_deps) {
    _deps = initDeps(mainWindow);
  }
  return _deps;
}

function initDeps(mainWindow: BrowserWindow) {
  // These imports happen at call time, not at module load time.
  // This way if better-sqlite3 or baileys fail, we get a clear error
  // instead of a white screen.
  const { getDb } = require('../db/connection');
  const { ChatRepository } = require('../db/repositories/chat-repository');
  const { SummaryRepository } = require('../db/repositories/summary-repository');
  const { ProviderRepository } = require('../db/repositories/provider-repository');
  const { BaileysClient } = require('../connector/whatsapp/baileys-client');

  const db = getDb();
  const chatRepo = new ChatRepository(db);
  const summaryRepo = new SummaryRepository(db);
  const providerRepo = new ProviderRepository(db);
  const baileysClient = new BaileysClient();

  // Forward events to renderer
  baileysClient.on('connection-state', (state: unknown) => {
    mainWindow.webContents.send(IpcEvents.WHATSAPP_STATE_CHANGED, state);
  });

  baileysClient.on('messages', (messages: ChatMessage[]) => {
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

  return { chatRepo, summaryRepo, providerRepo, baileysClient };
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ── WhatsApp connection ──────────────────────────────────

  ipcMain.handle(IpcChannels.WHATSAPP_CONNECT, async () => {
    try {
      const { baileysClient } = getDeps(mainWindow);
      await baileysClient.connect();
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IpcChannels.WHATSAPP_DISCONNECT, async () => {
    try {
      const { baileysClient } = getDeps(mainWindow);
      await baileysClient.disconnect();
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IpcChannels.WHATSAPP_GET_STATE, () => {
    try {
      const { baileysClient } = getDeps(mainWindow);
      return baileysClient.getState();
    } catch {
      return { status: 'disconnected' };
    }
  });

  // ── Chats ────────────────────────────────────────────────

  ipcMain.handle(IpcChannels.CHATS_LIST, () => {
    try {
      const { chatRepo } = getDeps(mainWindow);
      return chatRepo.listChats();
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle(IpcChannels.CHATS_GET_MESSAGES, (_event, rawPayload: unknown) => {
    return withValidation('chats:get-messages', rawPayload, (payload) => {
      const { chatRepo } = getDeps(mainWindow);
      return chatRepo.getMessages(payload.chatId, payload.limit, payload.beforeTimestamp);
    });
  });

  // ── Summarization ────────────────────────────────────────

  ipcMain.handle(IpcChannels.SUMMARIZE_RUN, async (_event, rawPayload: unknown) => {
    return withValidation('summarize:run', rawPayload, async (payload) => {
      const { chatRepo, summaryRepo, providerRepo } = getDeps(mainWindow);
      const { createProvider } = require('../providers/provider-factory');
      const { getAllApiKeys } = require('./keychain');

      const providerConfig = payload.provider
        ? providerRepo.listAll().find((p: any) => p.type === payload.provider)
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
        chatName: chatRepo.listChats().find((c: any) => c.id === payload.chatId)?.name ?? 'Unknown',
        previousSummary: latestSummary?.summary,
      });

      const timestamps = messages.map((m: any) => m.timestamp);
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
      const { summaryRepo } = getDeps(mainWindow);
      return summaryRepo.listByChat(payload.chatId, payload.limit);
    });
  });

  ipcMain.handle(IpcChannels.SUMMARIZE_GET, (_event, rawPayload: unknown) => {
    return withValidation('summarize:get', rawPayload, (payload) => {
      const { summaryRepo } = getDeps(mainWindow);
      return summaryRepo.getById(payload.id);
    });
  });

  // ── Providers ────────────────────────────────────────────

  ipcMain.handle(IpcChannels.PROVIDERS_LIST, () => {
    try {
      const { providerRepo } = getDeps(mainWindow);
      return providerRepo.listAll();
    } catch {
      return [];
    }
  });

  ipcMain.handle(IpcChannels.PROVIDERS_UPDATE, (_event, rawPayload: unknown) => {
    return withValidation('providers:update', rawPayload, (payload) => {
      const { providerRepo } = getDeps(mainWindow);
      providerRepo.update(payload);
      return { success: true };
    });
  });

  ipcMain.handle(IpcChannels.PROVIDERS_HEALTH, async (_event, providerType?: string) => {
    try {
      const { providerRepo } = getDeps(mainWindow);
      const { createProvider } = require('../providers/provider-factory');
      const { getAllApiKeys } = require('./keychain');

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
      return [{ type: 'error', reachable: false, models: [], error: String(err) }];
    }
  });

  ipcMain.handle(IpcChannels.PROVIDERS_SET_API_KEY, (_event, rawPayload: unknown) => {
    return withValidation('providers:set-api-key', rawPayload, (payload) => {
      const { setApiKey } = require('./keychain');
      setApiKey(payload.provider, payload.apiKey);
      return { success: true };
    });
  });
}

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
