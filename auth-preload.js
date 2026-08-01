// auth-preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('authAPI', {
    submitAuth: (userData) => ipcRenderer.send('telegram-auth-data', userData)
});
