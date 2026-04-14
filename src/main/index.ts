import { app, BrowserWindow, session } from 'electron';
import path from 'node:path';
import { closeDb } from '../db/connection';
import { registerIpcHandlers } from './ipc-handlers';

// Enforce single instance — WhatsApp only allows one connection per device.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // macOS native look
    webPreferences: {
      // ── SECURITY: These are non-negotiable ──────────────
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,    // Renderer can't access Node.js
      nodeIntegration: false,    // No require() in renderer
      sandbox: true,             // OS-level sandboxing
      webSecurity: true,         // Enforce same-origin policy
      allowRunningInsecureContent: false,

      // Disable features we don't need
      webviewTag: false,
      navigateOnDragDrop: false,
    },
  });

  // ── Content Security Policy ──────────────────────────────
  // Lock down what the renderer can load. No inline scripts, no eval,
  // only connect to known local provider endpoints.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'", // Required for CSS-in-JS
            "img-src 'self' data:", // QR codes are data URIs
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

  // ── Prevent navigation and new window creation ───────────
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Register IPC handlers (must happen before renderer loads)
  registerIpcHandlers(mainWindow);

  // Load the renderer.
  // In development, Vite dev server; in production, the built HTML.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
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
  closeDb();
  app.quit();
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ── Electron Forge Vite plugin globals ─────────────────────
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
