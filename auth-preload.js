<<<<<<< HEAD
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('authAPI', Object.freeze({
    submitAuth: (data) => ipcRenderer.send('telegram-auth-data', data),
}));
=======
// auth-preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('authAPI', {
    submitAuth: (userData) => ipcRenderer.send('telegram-auth-data', userData)
});
>>>>>>> e545f46a604e756138f3e9ba39c457033ca10a49
