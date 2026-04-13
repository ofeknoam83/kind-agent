
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kindsAgent', {
  connect: () => ipcRenderer.invoke('connector:connect'),
  status: () => ipcRenderer.invoke('connector:status'),
  qr: () => ipcRenderer.invoke('connector:qr'),
  chats: () => ipcRenderer.invoke('chats:list'),
  summary: (id) => ipcRenderer.invoke('summary:get', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  testBackend: () => ipcRenderer.invoke('settings:testBackend'),
  discoverModels: () => ipcRenderer.invoke('settings:discoverModels'),
  saveOpenAIKey: (value) => ipcRenderer.invoke('secret:saveOpenAIKey', value),
  clearOpenAIKey: () => ipcRenderer.invoke('secret:clearOpenAIKey')
});
