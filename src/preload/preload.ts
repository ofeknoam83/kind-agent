import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels, IpcEvents } from '../shared/ipc';
import type {
  Chat,
  ChatCategory,
  ChatMessage,
  ConnectionState,
  ProviderConfig,
  ProviderStatus,
  SummaryResult,
} from '../shared/types';

/**
 * Preload bridge — the ONLY interface between renderer and main.
 *
 * Security contract:
 * 1. Only whitelisted IPC channels are exposed.
 * 2. No raw ipcRenderer access leaks to the renderer.
 * 3. Event listeners are scoped — renderer can only listen to push events.
 * 4. All methods are typed — the renderer gets autocomplete, not string channels.
 * 5. API keys are NEVER returned to the renderer.
 */

const api = {
  // ── WhatsApp ─────────────────────────────────────────────
  whatsapp: {
    connect: (): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.WHATSAPP_CONNECT),

    disconnect: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IpcChannels.WHATSAPP_DISCONNECT),

    getState: (): Promise<ConnectionState> =>
      ipcRenderer.invoke(IpcChannels.WHATSAPP_GET_STATE),

    onStateChanged: (callback: (state: ConnectionState) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: ConnectionState) =>
        callback(state);
      ipcRenderer.on(IpcEvents.WHATSAPP_STATE_CHANGED, handler);
      return () => ipcRenderer.removeListener(IpcEvents.WHATSAPP_STATE_CHANGED, handler);
    },
  },

  // ── Chats ────────────────────────────────────────────────
  chats: {
    list: (): Promise<Chat[]> =>
      ipcRenderer.invoke(IpcChannels.CHATS_LIST),

    getMessages: (
      chatId: string,
      limit?: number,
      beforeTimestamp?: number
    ): Promise<ChatMessage[]> =>
      ipcRenderer.invoke(IpcChannels.CHATS_GET_MESSAGES, {
        chatId,
        limit: limit ?? 500,
        beforeTimestamp,
      }),

    setCategory: (
      chatId: string,
      category: ChatCategory | null
    ): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.CHATS_SET_CATEGORY, { chatId, category }),

    onNewMessages: (callback: (messages: ChatMessage[]) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, messages: ChatMessage[]) =>
        callback(messages);
      ipcRenderer.on(IpcEvents.NEW_MESSAGES, handler);
      return () => ipcRenderer.removeListener(IpcEvents.NEW_MESSAGES, handler);
    },
  },

  // ── Summarization ────────────────────────────────────────
  summarize: {
    run: (
      chatId: string,
      afterTimestamp?: number | null,
      provider?: string
    ): Promise<SummaryResult | { error: string }> =>
      ipcRenderer.invoke(IpcChannels.SUMMARIZE_RUN, {
        chatId,
        afterTimestamp: afterTimestamp ?? null,
        provider,
      }),

    list: (chatId: string, limit?: number): Promise<SummaryResult[]> =>
      ipcRenderer.invoke(IpcChannels.SUMMARIZE_LIST, { chatId, limit: limit ?? 20 }),

    get: (id: number): Promise<SummaryResult | null> =>
      ipcRenderer.invoke(IpcChannels.SUMMARIZE_GET, { id }),

    recent: (sinceTimestamp: number, limit?: number): Promise<SummaryResult[]> =>
      ipcRenderer.invoke(IpcChannels.SUMMARIZE_RECENT, { sinceTimestamp, limit: limit ?? 50 }),

    onAutoSummarizeComplete: (callback: () => void): (() => void) => {
      const handler = () => callback();
      ipcRenderer.on(IpcEvents.AUTO_SUMMARIZE_COMPLETE, handler);
      return () => ipcRenderer.removeListener(IpcEvents.AUTO_SUMMARIZE_COMPLETE, handler);
    },

    onProgress: (
      callback: (progress: { chatId: string; status: string; messageCount?: number }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: { chatId: string; status: string; messageCount?: number }
      ) => callback(progress);
      ipcRenderer.on(IpcEvents.SUMMARIZE_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IpcEvents.SUMMARIZE_PROGRESS, handler);
    },
  },

  // ── System ───────────────────────────────────────────────
  system: {
    onModelPullProgress: (
      callback: (data: { model: string; status: string; progress: number }) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { model: string; status: string; progress: number }
      ) => callback(data);
      ipcRenderer.on('event:model-pull-progress', handler);
      return () => ipcRenderer.removeListener('event:model-pull-progress', handler);
    },
  },

  // ── Providers ────────────────────────────────────────────
  providers: {
    list: (): Promise<ProviderConfig[]> =>
      ipcRenderer.invoke(IpcChannels.PROVIDERS_LIST),

    update: (config: {
      type: string;
      baseUrl: string;
      model: string;
      active: boolean;
    }): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.PROVIDERS_UPDATE, config),

    healthCheck: (providerType?: string): Promise<ProviderStatus[]> =>
      ipcRenderer.invoke(IpcChannels.PROVIDERS_HEALTH, providerType),

    setApiKey: (
      provider: string,
      apiKey: string
    ): Promise<{ success?: boolean; error?: string }> =>
      ipcRenderer.invoke(IpcChannels.PROVIDERS_SET_API_KEY, { provider, apiKey }),
  },
} as const;

export type ElectronApi = typeof api;

contextBridge.exposeInMainWorld('electronApi', api);
