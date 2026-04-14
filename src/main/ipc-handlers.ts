import { ipcMain, type BrowserWindow } from 'electron';
import { ZodError } from 'zod';
import { IpcChannels, IpcEvents, channelValidators } from '../shared/ipc';
import type { SummarizeRequest } from '../shared/types';
import { getDb } from '../db/connection';
import { ChatRepository } from '../db/repositories/chat-repository';
import { SummaryRepository } from '../db/repositories/summary-repository';
import { ProviderRepository } from '../db/repositories/provider-repository';
import { createProvider } from '../providers/provider-factory';
import { BaileysClient } from '../connector/whatsapp/baileys-client';
import { setApiKey, getAllApiKeys } from './keychain';

/**
 * Registers all IPC handlers.
 *
 * Architecture:
 * - Every handler validates input via Zod before processing.
 * - Errors are caught and returned as structured { error: string } objects.
 * - The renderer NEVER gets raw stack traces in production.
 * - Handlers do NOT access the database directly — they go through repositories.
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  const db = getDb();
  const chatRepo = new ChatRepository(db);
  const summaryRepo = new SummaryRepository(db);
  const providerRepo = new ProviderRepository(db);
  const baileysClient = new BaileysClient();

  // ── WhatsApp connection ──────────────────────────────────

  // Forward connection state changes to renderer
  baileysClient.on('connection-state', (state) => {
    mainWindow.webContents.send(IpcEvents.WHATSAPP_STATE_CHANGED, state);
  });

  // Forward new messages to renderer + persist to DB
  baileysClient.on('messages', (messages) => {
    // Group by chat and persist
    const byChatId = new Map<string, typeof messages>();
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
          name: msgs[0].senderName, // Will be overwritten by group name
          isGroup: chatId.endsWith('@g.us'),
          lastMessageTimestamp: maxTs,
        },
        msgs
      );
    }

    mainWindow.webContents.send(IpcEvents.NEW_MESSAGES, messages);
  });

  ipcMain.handle(IpcChannels.WHATSAPP_CONNECT, async () => {
    try {
      await baileysClient.connect();
      return { success: true };
    } catch (err) {
      return { error: String(err) };
    }
  });

  ipcMain.handle(IpcChannels.WHATSAPP_DISCONNECT, async () => {
    await baileysClient.disconnect();
    return { success: true };
  });

  ipcMain.handle(IpcChannels.WHATSAPP_GET_STATE, () => {
    return baileysClient.getState();
  });

  // ── Chats ────────────────────────────────────────────────

  ipcMain.handle(IpcChannels.CHATS_LIST, () => {
    return chatRepo.listChats();
  });

  ipcMain.handle(IpcChannels.CHATS_GET_MESSAGES, (_event, rawPayload: unknown) => {
    return withValidation('chats:get-messages', rawPayload, (payload) => {
      return chatRepo.getMessages(payload.chatId, payload.limit, payload.beforeTimestamp);
    });
  });

  // ── Summarization ────────────────────────────────────────

  ipcMain.handle(IpcChannels.SUMMARIZE_RUN, async (_event, rawPayload: unknown) => {
    return withValidation('summarize:run', rawPayload, async (payload) => {
      const providerConfig = payload.provider
        ? providerRepo.listAll().find((p) => p.type === payload.provider)
        : providerRepo.getActive();

      if (!providerConfig) {
        throw new Error('No active summarization provider configured.');
      }

      const apiKeys = getAllApiKeys();
      const provider = createProvider(providerConfig, apiKeys);

      // Get messages for summarization
      const messages = payload.afterTimestamp
        ? chatRepo.getMessagesAfter(payload.chatId, payload.afterTimestamp)
        : chatRepo.getMessages(payload.chatId, 2000);

      if (messages.length === 0) {
        throw new Error('No messages to summarize.');
      }

      // Check for previous summary (incremental summarization)
      const latestSummary = summaryRepo.getLatestForChat(payload.chatId);

      // Notify renderer that summarization is in progress
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
      return summaryRepo.listByChat(payload.chatId, payload.limit);
    });
  });

  ipcMain.handle(IpcChannels.SUMMARIZE_GET, (_event, rawPayload: unknown) => {
    return withValidation('summarize:get', rawPayload, (payload) => {
      return summaryRepo.getById(payload.id);
    });
  });

  // ── Providers ────────────────────────────────────────────

  ipcMain.handle(IpcChannels.PROVIDERS_LIST, () => {
    return providerRepo.listAll();
  });

  ipcMain.handle(IpcChannels.PROVIDERS_UPDATE, (_event, rawPayload: unknown) => {
    return withValidation('providers:update', rawPayload, (payload) => {
      providerRepo.update(payload);
      return { success: true };
    });
  });

  ipcMain.handle(IpcChannels.PROVIDERS_HEALTH, async (_event, providerType?: string) => {
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
  });

  ipcMain.handle(IpcChannels.PROVIDERS_SET_API_KEY, (_event, rawPayload: unknown) => {
    return withValidation('providers:set-api-key', rawPayload, (payload) => {
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
