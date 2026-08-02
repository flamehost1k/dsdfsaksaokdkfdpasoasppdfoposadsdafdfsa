const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', Object.freeze({
    closeWindow: () => ipcRenderer.send('close-window'),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    maximizeWindow: () => ipcRenderer.send('maximize-window'),
    apiRequest: (payload) => ipcRenderer.invoke('api-request', payload),
    getHWID: () => ipcRenderer.invoke('get-hwid'),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    openTelegramAuth: () => ipcRenderer.invoke('open-telegram-auth'),
}));
