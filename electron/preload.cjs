'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal safe API to the renderer if needed in the future.
// Currently the app is self-contained and needs no native APIs.
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
});
