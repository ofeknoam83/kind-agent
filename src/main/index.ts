import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { registerIpcHandlers, closeDb, ensureRepos } from './ipc-handlers';
import { startOllama, stopOllama } from './ollama-manager';
import { startAutoSummarize, stopAutoSummarize } from './auto-summarize';

// Enforce single instance — WhatsApp only allows one connection per device.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Auto-start Ollama if installed
  startOllama();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // macOS native look
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
    },
  });

  // ── CSP: only enforce in production ──────────────────────
  // In dev, Vite injects scripts/websockets that CSP would block.
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "connect-src 'self'",
              "font-src 'self'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'none'",
              "frame-ancestors 'none'",
            ].join('; '),
          ],
        },
      });
    });
  }

  // ── Prevent navigation and new window creation ───────────
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Register IPC handlers
  try {
    registerIpcHandlers(mainWindow);
  } catch (err) {
    console.error('Failed to register IPC handlers:', err);
  }

  // Start/stop auto-summarize daemon based on WhatsApp connection state
  const { ipcMain: ipcMainModule } = require('electron');
  // Listen for connection state changes to auto-start/stop daemon
  mainWindow.webContents.on('ipc-message', (_event: unknown, channel: string) => {
    // We piggy-back on the state-changed event that the IPC handler already sends
  });

  // We listen to the push event from the IPC handler side.
  // The BaileysClient emits 'connection-state' which triggers webContents.send.
  // We intercept by patching webContents.send to detect connected/disconnected.
  const origSend = mainWindow.webContents.send.bind(mainWindow.webContents);
  mainWindow.webContents.send = (channel: string, ...args: unknown[]) => {
    origSend(channel, ...args);
    if (channel === 'event:whatsapp-state-changed') {
      const state = args[0] as { status: string };
      if (state?.status === 'connected') {
        startAutoSummarize(mainWindow!, ensureRepos);
      } else if (state?.status === 'disconnected') {
        stopAutoSummarize();
      }
    }
  };

  // Open DevTools in development
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }
}

// ── App lifecycle ──────────────────────────────────────────

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  stopAutoSummarize();
  stopOllama();
  try { closeDb(); } catch { /* DB may not have been initialized */ }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ── Electron Forge Vite plugin globals ─────────────────────
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
