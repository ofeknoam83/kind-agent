
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db');
const baileys = require('../connector/whatsapp/baileys-service');
const summarizer = require('./summarizer');
const settings = require('./settings-store');
const secretStore = require('./secret-store');
const baseDir = path.join(app.getPath('userData'), 'data');
function createWindow() {
  const win = new BrowserWindow({ width: 1500, height: 980, title: "Kind's agent", webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false } });
  win.loadFile(path.join(__dirname, '../renderer/kinds-agent.html'));
}
app.whenReady().then(() => {
  db.init(baseDir);
  settings.init(baseDir);
  secretStore.init(baseDir);
  baileys.onMessage((msg) => {
    db.upsertChat({ id: msg.chat_id, name: msg.chat_id, unread_count: 0, last_seen: msg.timestamp, status: 'live' });
    db.insertMessage(msg);
  });
  ipcMain.handle('connector:connect', () => baileys.connect());
  ipcMain.handle('connector:status', () => baileys.getStatus());
  ipcMain.handle('connector:qr', () => baileys.getQrCode());
  ipcMain.handle('chats:list', () => db.listChats());
  ipcMain.handle('summary:get', async (_, id) => summarizer.summarize(db.getMessages(id, 80), settings.get(), { openaiApiKey: secretStore.getSecret('openaiApiKey') }));
  ipcMain.handle('settings:get', () => ({ ...settings.get(), hasOpenAIKey: secretStore.hasSecret('openaiApiKey') }));
  ipcMain.handle('settings:save', (_, payload) => settings.save(payload || {}));
  ipcMain.handle('settings:testBackend', () => summarizer.testBackend(settings.get(), { openaiApiKey: secretStore.getSecret('openaiApiKey') }));
  ipcMain.handle('settings:discoverModels', () => summarizer.discoverModels(settings.get()));
  ipcMain.handle('secret:saveOpenAIKey', (_, value) => secretStore.setSecret('openaiApiKey', value));
  ipcMain.handle('secret:clearOpenAIKey', () => secretStore.setSecret('openaiApiKey', ''));
  createWindow();
});
