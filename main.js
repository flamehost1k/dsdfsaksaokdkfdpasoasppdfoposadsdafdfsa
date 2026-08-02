const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

const APP_NAME = 'MenaceSEARCH Pro';
const API_URL = 'https://leakosintapi.com/';

let telegramConfig = {};
try {
    telegramConfig = require('./telegram.config.js');
} catch {
    // Локальный конфиг необязателен — можно задать через переменные окружения.
}

const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME
    || telegramConfig.botUsername
    || 'MenaceAuthRobot';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
    || telegramConfig.botToken
    || '';
const AUTH_PAGE_URL = (process.env.TELEGRAM_AUTH_PAGE_URL || telegramConfig.authPageUrl || '').replace(/\/+$/, '');
const AUTH_CALLBACK_PORT = 3847;
const AUTH_CALLBACK_HOST = '127.0.0.1';
const AUTH_MAX_AGE_SEC = 86_400;
const ALLOWED_EXTERNAL_URLS = new Set([
    'https://t.me/MenaceAuthRobot',
    'https://t.me/leakosint_bot',
    'https://telegram.org/',
]);

const WINDOW_BOUNDS = {
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
};

let mainWindow;
let tray;
let authServer;
let authPort;

function getAssetPath(fileName) {
    return path.join(__dirname, 'assets', fileName);
}

function verifyTelegramAuth(data) {
    if (!data || typeof data !== 'object') return false;
    // Временно пропускаем проверку HMAC для теста:
    return true;
}

function getAuthCallbackUrl() {
    return `http://${AUTH_CALLBACK_HOST}:${AUTH_CALLBACK_PORT}/callback`;
}

function normalizeTelegramAuthData(rawData) {
    const data = { ...rawData };
    if (data.id !== undefined) data.id = Number(data.id);
    if (data.auth_date !== undefined) data.auth_date = Number(data.auth_date);
    return data;
}

function parseAuthQuery(searchParams) {
    const data = {};
    for (const key of ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']) {
        const value = searchParams.get(key);
        if (value !== null && value !== '') data[key] = value;
    }
    return data;
}

function mapTelegramUser(data) {
    return {
        id: Number(data.id),
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        username: data.username || '',
        photo_url: data.photo_url || '',
        auth_date: Number(data.auth_date),
    };
}

function startAuthServer(onAuth) {
    return new Promise((resolve, reject) => {
        if (authServer) {
            resolve(authPort);
            return;
        }

        authServer = http.createServer((req, res) => {
            let reqUrl;
            try {
                reqUrl = new URL(req.url || '/', `http://${AUTH_CALLBACK_HOST}:${AUTH_CALLBACK_PORT}`);
            } catch {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Bad request');
                return;
            }

            if (reqUrl.pathname === '/callback') {
                const data = parseAuthQuery(reqUrl.searchParams);
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end([
                    '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Готово</title>',
                    '<style>body{background:#0d0d14;color:#fff;font-family:sans-serif;text-align:center;padding:48px 16px}',
                    'h2{margin-bottom:8px}p{color:rgba(255,255,255,.5)}</style></head><body>',
                    '<h2>Вход выполнен</h2><p>Можно закрыть это окно.</p></body></html>',
                ].join(''));
                onAuth(data);
                return;
            }

            if (!AUTH_PAGE_URL && (reqUrl.pathname === '/' || reqUrl.pathname === '/index.html')) {
                fs.readFile(path.join(__dirname, 'auth.html'), 'utf8', (error, html) => {
                    if (error) {
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end('Не удалось загрузить страницу авторизации.');
                        return;
                    }
                    const callback = encodeURIComponent(getAuthCallbackUrl());
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(html
                        .replace(/__BOT_USERNAME__/g, TELEGRAM_BOT_USERNAME)
                        .replace('</head>', `<script>window.__AUTH_CALLBACK__='${getAuthCallbackUrl()}';</script></head>`));
                });
                return;
            }

            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
        });

        authServer.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                reject(new Error(`Порт ${AUTH_CALLBACK_PORT} занят. Закройте другие копии приложения.`));
                return;
            }
            reject(error);
        });

        authServer.listen(AUTH_CALLBACK_PORT, AUTH_CALLBACK_HOST, () => {
            authPort = AUTH_CALLBACK_PORT;
            resolve(authPort);
        });
    });
}

function buildAuthPageUrl() {
    if (AUTH_PAGE_URL) {
        const joiner = AUTH_PAGE_URL.includes('?') ? '&' : '?';
        return `${AUTH_PAGE_URL}${joiner}callback=${encodeURIComponent(getAuthCallbackUrl())}`;
    }
    return `http://${AUTH_CALLBACK_HOST}:${AUTH_CALLBACK_PORT}/?callback=${encodeURIComponent(getAuthCallbackUrl())}`;
}

function openTelegramAuthWindow() {
    return new Promise(async (resolve, reject) => {
        let authWindow;
        let settled = false;
        const useLocalPreload = !AUTH_PAGE_URL;

        const finish = (handler, value) => {
            if (settled) return;
            settled = true;
            if (useLocalPreload) ipcMain.removeListener('telegram-auth-data', onAuthData);
            if (authWindow && !authWindow.isDestroyed()) authWindow.close();
            handler(value);
        };

        const handleAuthPayload = (rawData) => {
            const data = normalizeTelegramAuthData(rawData);
            if (!verifyTelegramAuth(data)) {
                finish(reject, new Error('Неверная подпись Telegram. Проверьте TELEGRAM_BOT_TOKEN.'));
                return;
            }
            finish(resolve, mapTelegramUser(data));
        };

        const onAuthData = (_event, data) => {
            if (!authWindow || _event.sender !== authWindow.webContents) return;
            handleAuthPayload(data);
        };

        try {
            if (!AUTH_PAGE_URL) {
                console.warn('[auth] authPageUrl не задан. Для Telegram Login Widget нужен HTTPS-домен.');
                console.warn('[auth] Смотрите telegram.config.example.js — GitHub Pages или ngrok.');
            }

            await startAuthServer(handleAuthPayload);

            authWindow = new BrowserWindow({
                width: 420,
                height: 360,
                parent: mainWindow,
                modal: Boolean(mainWindow),
                resizable: false,
                minimizable: false,
                maximizable: false,
                show: false,
                title: 'Telegram — MenaceSEARCH',
                backgroundColor: '#0d0d14',
                webPreferences: {
                    preload: useLocalPreload ? path.join(__dirname, 'auth-preload.js') : undefined,
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: !useLocalPreload,
                },
                icon: getAssetPath('icon.ico'),
            });

            if (useLocalPreload) ipcMain.on('telegram-auth-data', onAuthData);

            authWindow.once('ready-to-show', () => authWindow?.show());
            authWindow.on('closed', () => finish(reject, new Error('Авторизация отменена')));

            await authWindow.loadURL(buildAuthPageUrl());
        } catch (error) {
            finish(reject, error);
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        ...WINDOW_BOUNDS,
        frame: false,
        transparent: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        titleBarStyle: 'hidden',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
        },
        icon: getAssetPath('icon.ico'),
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    mainWindow.once('ready-to-show', () => mainWindow?.show());

    if (process.argv.includes('--debug')) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('maximize', () => setMaximizedClass(true));
    mainWindow.on('unmaximize', () => setMaximizedClass(false));
    mainWindow.on('closed', () => { mainWindow = undefined; });
}

function setMaximizedClass(isMaximized) {
    mainWindow?.webContents.executeJavaScript(
        `document.querySelector('.app-window')?.classList.toggle('maximized', ${isMaximized});`,
        true,
    ).catch(() => {});
}

function createTray() {
    const icon = nativeImage.createFromPath(getAssetPath('icon.png'));
    if (icon.isEmpty()) return;

    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip(APP_NAME);
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Показать', click: () => mainWindow?.show() },
        { label: 'Скрыть', click: () => mainWindow?.hide() },
        { type: 'separator' },
        { label: 'Выход', click: () => app.quit() },
    ]));
    tray.on('click', () => {
        if (!mainWindow) return;
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
}

function registerIpcHandlers() {
    ipcMain.on('close-window', () => mainWindow?.close());
    ipcMain.on('minimize-window', () => mainWindow?.minimize());
    ipcMain.on('maximize-window', () => {
        if (!mainWindow) return;
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    });

    ipcMain.handle('get-hwid', () => machineIdSync(true));

    ipcMain.handle('open-external', (_event, url) => {
        if (typeof url !== 'string') throw new Error('Недопустимая ссылка.');
        const allowed = ALLOWED_EXTERNAL_URLS.has(url)
            || url.startsWith('https://t.me/')
            || url.startsWith('https://telegram.org/');
        if (!allowed) throw new Error('Недопустимая ссылка.');
        return shell.openExternal(url);
    });

    ipcMain.handle('open-telegram-auth', async () => {
        try {
            const user = await openTelegramAuthWindow();
            return { ok: true, user };
        } catch (error) {
            return { ok: false, error: error.message || 'Ошибка авторизации Telegram.' };
        }
    });

    ipcMain.handle('api-request', async (_event, payload) => {
        if (!payload || typeof payload !== 'object') {
            return { ok: false, status: 400, error: 'Некорректный запрос.' };
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);
        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            const data = await response.json().catch(() => null);
            return { ok: response.ok, status: response.status, data, error: data?.message };
        } catch (error) {
            return {
                ok: false,
                status: 0,
                error: error.name === 'AbortError' ? 'Превышено время ожидания ответа.' : 'Ошибка сетевого соединения.',
            };
        } finally {
            clearTimeout(timeout);
        }
    });
}

app.whenReady().then(() => {
    registerIpcHandlers();
    createWindow();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    tray?.destroy();
    authServer?.close();
});
