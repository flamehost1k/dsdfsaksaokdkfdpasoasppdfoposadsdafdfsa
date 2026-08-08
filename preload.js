const {
    contextBridge,
    ipcRenderer
} = require('electron');

'use strict';

contextBridge.exposeInMainWorld(
    'electronAPI',
    {
        // =====================================
        // WINDOW
        // =====================================

        closeWindow: () => {
            ipcRenderer.send(
                'close-window'
            );
        },

        minimizeWindow: () => {
            ipcRenderer.send(
                'minimize-window'
            );
        },

        maximizeWindow: () => {
            ipcRenderer.send(
                'maximize-window'
            );
        },

        // =====================================
        // HWID
        // =====================================

        getHWID: () => {
            return ipcRenderer.invoke(
                'get-hwid'
            );
        },

        // =====================================
        // TELEGRAM AUTH
        // =====================================

        openTelegramAuth: () => {
            return ipcRenderer.invoke(
                'open-telegram-auth'
            );
        },

        // =====================================
        // BACKEND
        // =====================================

        backendRequest: (
            endpoint,
            options = {}
        ) => {
            return ipcRenderer.invoke(
                'backend-request',
                {
                    endpoint,
                    method:
                        options.method ||
                        'GET',

                    headers:
                        options.headers ||
                        {},

                    body:
                        options.body,

                    timeout:
                        options.timeout
                }
            );
        },

        // =====================================
        // SEARCH API
        // =====================================

        apiRequest: (
            payload
        ) => {
            return ipcRenderer.invoke(
                'api-request',
                payload
            );
        },

        // =====================================
        // EXTERNAL LINKS
        // =====================================

        openExternal: (
            url
        ) => {
            return ipcRenderer.invoke(
                'open-external',
                url
            );
        },

        // =====================================
        // ZOOM
        // =====================================

        setZoom: (
            factor
        ) => {
            return ipcRenderer.invoke(
                'set-zoom',
                factor
            );
        },

        // =====================================
        // THEME
        // =====================================

        setTheme: (
            theme
        ) => {
            return ipcRenderer.invoke(
                'set-theme',
                theme
            );
        },

        getTheme: () => {
            return ipcRenderer.invoke(
                'get-theme'
            );
        },

        // =====================================
        // VERSION
        // =====================================

        getVersion: () => {
            return ipcRenderer.invoke(
                'get-version'
            );
        },

        // =====================================
        // BACKEND URL
        // =====================================

        getBackendUrl: () => {
            return ipcRenderer.invoke(
                'get-backend-url'
            );
        }
    }
);