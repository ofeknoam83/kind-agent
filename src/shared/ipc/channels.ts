/**
 * Exhaustive IPC channel registry.
 *
 * RULES:
 * 1. Every channel used in ipcMain.handle / ipcRenderer.invoke MUST be listed here.
 * 2. Renderer code never calls ipcRenderer directly — it goes through the preload bridge.
 * 3. Each channel has a typed request and response. Validated at both ends.
 */
export const IpcChannels = {
  // ── WhatsApp connection ──────────────────────────────────
  WHATSAPP_CONNECT: 'whatsapp:connect',
  WHATSAPP_DISCONNECT: 'whatsapp:disconnect',
  WHATSAPP_LOGOUT: 'whatsapp:logout',
  WHATSAPP_GET_STATE: 'whatsapp:get-state',

  // ── Chats ────────────────────────────────────────────────
  CHATS_LIST: 'chats:list',
  CHATS_GET_MESSAGES: 'chats:get-messages',
  CHATS_SET_CATEGORY: 'chats:set-category',

  // ── Summarization ────────────────────────────────────────
  SUMMARIZE_RUN: 'summarize:run',
  SUMMARIZE_LIST: 'summarize:list',
  SUMMARIZE_GET: 'summarize:get',
  SUMMARIZE_RECENT: 'summarize:recent',

  // ── Provider management ──────────────────────────────────
  PROVIDERS_LIST: 'providers:list',
  PROVIDERS_UPDATE: 'providers:update',
  PROVIDERS_HEALTH: 'providers:health',
  PROVIDERS_SET_API_KEY: 'providers:set-api-key',

  // ── Settings ─────────────────────────────────────────────
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

/**
 * Events pushed from main -> renderer (one-way, via webContents.send).
 * These are NOT request/response — they are push notifications.
 */
export const IpcEvents = {
  WHATSAPP_STATE_CHANGED: 'event:whatsapp-state-changed',
  NEW_MESSAGES: 'event:new-messages',
  SUMMARIZE_PROGRESS: 'event:summarize-progress',
  AUTO_SUMMARIZE_COMPLETE: 'event:auto-summarize-complete',
} as const;

export type IpcEvent = (typeof IpcEvents)[keyof typeof IpcEvents];
