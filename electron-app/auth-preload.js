const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('authAPI', Object.freeze({
    submitAuth: data => ipcRenderer.send('telegram-auth-data', data)
}));
