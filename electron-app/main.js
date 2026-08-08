const {
    app,
    BrowserWindow,
    ipcMain,
    Menu,
    Tray,
    nativeImage,
    shell,
    globalShortcut
} = require('electron');

const path = require('path');
const http = require('http');
const fs = require('fs');
const { machineIdSync } = require('node-machine-id');

const APP_NAME = 'MenaceSEARCH Pro';

// =========================
// API
// =========================

const BACKEND_URL =
    process.env.MENACESEARCH_BACKEND_URL ||
    'https://menacesearch-backend.onrender.com';

const SEARCH_API_URL =
    process.env.SEARCH_API_URL ||
    'https://leakosintapi.com/';

// =========================
// TELEGRAM
// =========================

let telegramConfig = {};

try {
    telegramConfig = require('./telegram.config.js');
} catch {
    telegramConfig = {};
}

const TELEGRAM_BOT_USERNAME =
    process.env.TELEGRAM_BOT_USERNAME ||
    telegramConfig.botUsername ||
    'MenaceAuthRobot';

const TELEGRAM_AUTH_PAGE_URL =
    process.env.TELEGRAM_AUTH_PAGE_URL ||
    telegramConfig.authPageUrl ||
    'https://flamehost1k.github.io/dsdfsaksaokdkfdpasoasppdfoposadsdafdfsa/auth.html';

const AUTH_CALLBACK_PORT = 3847;
const AUTH_CALLBACK_HOST = '127.0.0.1';

// =========================
// EXTERNAL URLS
// =========================

const ALLOWED_EXTERNAL_URLS = new Set([
    'https://t.me/MenaceAuthRobot',
    'https://t.me/leakosint_bot',
    'https://telegram.org/',
    'https://discord.gg/brodyagi'
]);

// =========================
// WINDOW
// =========================

const WINDOW_BOUNDS = {
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700
};

// =========================
// GLOBALS
// =========================

let mainWindow = null;
let tray = null;

let authServer = null;
let authPort = null;
let activeAuthAttempt = null;

// =========================
// HELPERS
// =========================

function getAssetPath(fileName) {
    return path.join(__dirname, 'assets', fileName);
}

function getAuthCallbackUrl() {
    return `http://${AUTH_CALLBACK_HOST}:${AUTH_CALLBACK_PORT}/callback`;
}

function normalizeTelegramAuthData(rawData) {
    if (!rawData || typeof rawData !== 'object') {
        return null;
    }

    const data = {
        id: rawData.id,
        first_name: rawData.first_name || '',
        last_name: rawData.last_name || '',
        username: rawData.username || '',
        photo_url: rawData.photo_url || '',
        auth_date: rawData.auth_date,
        hash: rawData.hash
    };

    if (data.id !== undefined) {
        data.id = Number(data.id);
    }

    if (data.auth_date !== undefined) {
        data.auth_date = Number(data.auth_date);
    }

    return data;
}

function parseAuthQuery(searchParams) {
    const data = {};

    const fields = [
        'id',
        'first_name',
        'last_name',
        'username',
        'photo_url',
        'auth_date',
        'hash'
    ];

    for (const key of fields) {
        const value = searchParams.get(key);

        if (value !== null && value !== '') {
            data[key] = value;
        }
    }

    return normalizeTelegramAuthData(data);
}

// =========================
// BACKEND REQUEST
// =========================

async function backendRequest(endpoint, options = {}) {
    // Проверяем, что endpoint — строка
    if (typeof endpoint !== 'string') {
        throw new Error('Endpoint должен быть строкой');
    }

    const url =
        endpoint.startsWith('http://') ||
        endpoint.startsWith('https://')
            ? endpoint
            : `${BACKEND_URL}${endpoint}`;

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, options.timeout || 20000);

    try {
        const headers = {
            Accept: 'application/json',
            ...(options.headers || {})
        };

        if (options.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
            method: options.method || 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: controller.signal
        });

        const text = await response.text();

        let data = null;

        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            data = {
                raw: text
            };
        }

        return {
            ok: response.ok,
            status: response.status,
            data,
            error:
                data?.error ||
                data?.message ||
                (!response.ok
                    ? `HTTP ${response.status}`
                    : null)
        };
    } catch (error) {
        return {
            ok: false,
            status: 0,
            data: null,
            error:
                error?.name === 'AbortError'
                    ? 'Превышено время ожидания ответа серверу.'
                    : `Ошибка соединения с сервером: ${
                          error?.message || 'неизвестная ошибка'
                      }`
        };
    } finally {
        clearTimeout(timeout);
    }
}

// =========================
// SERVER AUTH
// =========================

async function authenticateTelegramOnServer(rawData) {
    const authData = normalizeTelegramAuthData(rawData);

    if (!authData) {
        throw new Error(
            'Telegram не вернул данные авторизации.'
        );
    }

    if (!authData.id) {
        throw new Error(
            'Telegram ID отсутствует в ответе.'
        );
    }

    if (!authData.auth_date) {
        throw new Error(
            'Дата авторизации Telegram отсутствует.'
        );
    }

    if (!authData.hash) {
        throw new Error(
            'Подпись Telegram отсутствует.'
        );
    }

    console.log(
        '[auth] Отправляем данные Telegram на сервер...'
    );

    const result = await backendRequest(
        '/api/auth/telegram',
        {
            method: 'POST',
            body: authData,
            timeout: 20000
        }
    );

    console.log(
        '[auth] Ответ сервера:',
        result.status,
        result.data
    );

    if (!result.ok) {
        throw new Error(
            result.error ||
            'Сервер отклонил авторизацию.'
        );
    }

    if (!result.data?.success) {
        throw new Error(
            result.data?.error ||
            'Сервер не подтвердил авторизацию.'
        );
    }

    if (!result.data?.user || !result.data?.token) {
        throw new Error(
            'Сервер не вернул пользователя или session token.'
        );
    }

    return {
        user: result.data.user,
        token: result.data.token
    };
}

// =========================
// AUTH SERVER
// =========================

function startAuthServer() {
    return new Promise((resolve, reject) => {
        if (authServer) {
            resolve(authPort);
            return;
        }

        authServer = http.createServer(
            async (req, res) => {
                let requestUrl;

                try {
                    requestUrl = new URL(
                        req.url || '/',
                        `http://${AUTH_CALLBACK_HOST}:${AUTH_CALLBACK_PORT}`
                    );
                } catch {
                    res.writeHead(400, {
                        'Content-Type':
                            'text/plain; charset=utf-8'
                    });

                    res.end('Bad request');
                    return;
                }

                // =========================
                // TELEGRAM CALLBACK
                // =========================

                if (requestUrl.pathname === '/callback') {
                    const attempt = activeAuthAttempt;

                    if (!attempt) {
                        res.writeHead(400, {
                            'Content-Type':
                                'text/html; charset=utf-8'
                        });

                        res.end(`
                            <!doctype html>
                            <html lang="ru">
                            <head>
                                <meta charset="UTF-8">
                                <title>Ошибка авторизации</title>
                            </head>
                            <body style="
                                background:#0d0d14;
                                color:#fff;
                                font-family:Arial,sans-serif;
                                text-align:center;
                                padding:50px 20px;
                            ">
                                <h2>Ссылка авторизации устарела</h2>
                                <p style="color:#999;">
                                    Вернитесь в приложение и начните вход заново.
                                </p>
                            </body>
                            </html>
                        `);

                        return;
                    }

                    const telegramData =
                        parseAuthQuery(
                            requestUrl.searchParams
                        );

                    try {
                        const authResult =
                            await authenticateTelegramOnServer(
                                telegramData
                            );

                        res.writeHead(200, {
                            'Content-Type':
                                'text/html; charset=utf-8'
                        });

                        res.end(`
                            <!doctype html>
                            <html lang="ru">
                            <head>
                                <meta charset="UTF-8">
                                <title>Авторизация успешна</title>
                                <style>
                                    body {
                                        background:#0d0d14;
                                        color:#fff;
                                        font-family:Arial,sans-serif;
                                        text-align:center;
                                        padding:50px 20px;
                                    }

                                    h2 {
                                        margin-bottom:10px;
                                    }

                                    p {
                                        color:rgba(255,255,255,.5);
                                    }

                                    .ok {
                                        width:64px;
                                        height:64px;
                                        margin:0 auto 20px;
                                        border-radius:50%;
                                        display:flex;
                                        align-items:center;
                                        justify-content:center;
                                        background:#1e9e5a;
                                        font-size:28px;
                                    }
                                </style>
                            </head>

                            <body>
                                <div class="ok">✓</div>

                                <h2>
                                    Авторизация выполнена
                                </h2>

                                <p>
                                    Пользователь сохранён на сервере.
                                </p>

                                <p>
                                    Это окно можно закрыть.
                                </p>
                            </body>
                            </html>
                        `);

                        attempt.onAuth({
                            ok: true,
                            user: authResult.user,
                            token: authResult.token
                        });
                    } catch (error) {
                        console.error(
                            '[auth] Серверная авторизация:',
                            error
                        );

                        res.writeHead(403, {
                            'Content-Type':
                                'text/html; charset=utf-8'
                        });

                        res.end(`
                            <!doctype html>
                            <html lang="ru">
                            <head>
                                <meta charset="UTF-8">
                                <title>Ошибка авторизации</title>
                                <style>
                                    body {
                                        background:#0d0d14;
                                        color:#fff;
                                        font-family:Arial,sans-serif;
                                        text-align:center;
                                        padding:50px 20px;
                                    }

                                    .error {
                                        width:64px;
                                        height:64px;
                                        margin:0 auto 20px;
                                        border-radius:50%;
                                        display:flex;
                                        align-items:center;
                                        justify-content:center;
                                        background:#b52b3a;
                                        font-size:28px;
                                    }

                                    .message {
                                        color:#ff6b7a;
                                        margin-top:15px;
                                    }
                                </style>
                            </head>

                            <body>
                                <div class="error">!</div>

                                <h2>
                                    Авторизация не выполнена
                                </h2>

                                <p class="message">
                                    ${String(
                                        error?.message ||
                                            'Ошибка сервера'
                                    )
                                        .replace(
                                            /&/g,
                                            '&amp;'
                                        )
                                        .replace(
                                            /</g,
                                            '&lt;'
                                        )
                                        .replace(
                                            />/g,
                                            '&gt;'
                                        )}
                                </p>

                                <p style="color:#777;">
                                    Вернитесь в приложение и попробуйте снова.
                                </p>
                            </body>
                            </html>
                        `);

                        attempt.onAuth({
                            ok: false,
                            error:
                                error?.message ||
                                'Ошибка серверной авторизации.'
                        });
                    }

                    return;
                }

                // =========================
                // LOCAL AUTH PAGE
                // =========================

                if (
                    requestUrl.pathname === '/' ||
                    requestUrl.pathname === '/index.html'
                ) {
                    const localAuthPaths = [
                        path.join(
                            __dirname,
                            'auth.html'
                        ),
                        path.join(
                            __dirname,
                            'server',
                            'auth.html'
                        ),
                        path.join(
                            __dirname,
                            'auth-host',
                            'index.html'
                        )
                    ];

                    const localAuthPath =
                        localAuthPaths.find(
                            candidate =>
                                fs.existsSync(candidate)
                        );

                    if (!localAuthPath) {
                        res.writeHead(404, {
                            'Content-Type':
                                'text/plain; charset=utf-8'
                        });

                        res.end(
                            'Страница авторизации не найдена.'
                        );

                        return;
                    }

                    fs.readFile(
                        localAuthPath,
                        'utf8',
                        (error, html) => {
                            if (error) {
                                res.writeHead(500, {
                                    'Content-Type':
                                        'text/plain; charset=utf-8'
                                });

                                res.end(
                                    'Не удалось загрузить страницу авторизации.'
                                );

                                return;
                            }

                            const callback =
                                getAuthCallbackUrl();

                            const preparedHtml =
                                html
                                    .replace(
                                        /__BOT_USERNAME__/g,
                                        TELEGRAM_BOT_USERNAME
                                    )
                                    .replace(
                                        '</head>',
                                        `
<script>
window.__AUTH_CALLBACK__ =
    ${JSON.stringify(callback)};
</script>
</head>
`
                                    );

                            res.writeHead(200, {
                                'Content-Type':
                                    'text/html; charset=utf-8'
                            });

                            res.end(preparedHtml);
                        }
                    );

                    return;
                }

                // =========================
                // NOT FOUND
                // =========================

                res.writeHead(404, {
                    'Content-Type':
                        'text/plain; charset=utf-8'
                });

                res.end('Not found');
            }
        );

        authServer.on(
            'error',
            error => {
                authServer = null;
                authPort = null;

                if (error.code === 'EADDRINUSE') {
                    reject(
                        new Error(
                            `Порт ${AUTH_CALLBACK_PORT} уже занят.`
                        )
                    );

                    return;
                }

                reject(error);
            }
        );

        authServer.listen(
            AUTH_CALLBACK_PORT,
            AUTH_CALLBACK_HOST,
            () => {
                authPort = AUTH_CALLBACK_PORT;

                console.log(
                    `[auth] Callback: ${getAuthCallbackUrl()}`
                );

                resolve(authPort);
            }
        );
    });
}

// =========================
// AUTH PAGE URL
// =========================

function buildAuthPageUrl() {
    const callbackUrl =
        getAuthCallbackUrl();

    const separator =
        TELEGRAM_AUTH_PAGE_URL.includes('?')
            ? '&'
            : '?';

    return (
        `${TELEGRAM_AUTH_PAGE_URL}` +
        `${separator}callback=` +
        encodeURIComponent(callbackUrl)
    );
}

// =========================
// TELEGRAM AUTH
// =========================

function openTelegramAuthWindow() {
    return new Promise(
        async (resolve, reject) => {
            let settled = false;
            let authTimeout = null;

            const attemptId =
                `${Date.now()}-${Math.random()
                    .toString(16)
                    .slice(2)}`;

            const finish = (
                handler,
                value
            ) => {
                if (settled) {
                    return;
                }

                settled = true;

                if (authTimeout) {
                    clearTimeout(authTimeout);
                    authTimeout = null;
                }

                if (
                    activeAuthAttempt?.id ===
                    attemptId
                ) {
                    activeAuthAttempt = null;
                }

                handler(value);
            };

            const handleAuthPayload =
                result => {
                    if (!result?.ok) {
                        finish(
                            reject,
                            new Error(
                                result?.error ||
                                'Ошибка серверной авторизации.'
                            )
                        );

                        return;
                    }

                    if (!result.user || !result.token) {
                        finish(
                            reject,
                            new Error(
                                'Сервер не вернул пользователя или session token.'
                            )
                        );

                        return;
                    }

                    finish(resolve, {
                        user: result.user,
                        token: result.token
                    });
                };

            try {
                if (
                    activeAuthAttempt?.onAbort
                ) {
                    activeAuthAttempt.onAbort();
                }

                activeAuthAttempt = {
                    id: attemptId,

                    onAuth:
                        handleAuthPayload,

                    onAbort: () => {
                        finish(
                            reject,
                            new Error(
                                'Запущена новая попытка авторизации.'
                            )
                        );
                    }
                };

                await startAuthServer();

                const authUrl =
                    buildAuthPageUrl();

                console.log(
                    '[auth] Открываем страницу:',
                    authUrl
                );

                await shell.openExternal(
                    authUrl
                );

                authTimeout = setTimeout(
                    () => {
                        if (!settled) {
                            finish(
                                reject,
                                new Error(
                                    'Истекло время ожидания авторизации Telegram.'
                                )
                            );
                        }
                    },
                    180000
                );
            } catch (error) {
                finish(
                    reject,
                    error
                );
            }
        }
    );
}

// =========================
// MAIN WINDOW
// =========================

function createWindow() {
    mainWindow =
        new BrowserWindow({
            ...WINDOW_BOUNDS,

            frame: false,
            transparent: true,
            hasShadow: false,
            backgroundColor: '#00000000',
            titleBarStyle: 'hidden',
            show: false,

            webPreferences: {
                preload:
                    path.join(
                        __dirname,
                        'preload.js'
                    ),

                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                backgroundThrottling: false
            },

            icon:
                getAssetPath(
                    'icon.ico'
                )
        });

    mainWindow.loadFile(
        path.join(
            __dirname,
            'index.html'
        )
    );

    mainWindow.once(
        'ready-to-show',
        () => {
            mainWindow?.show();
        }
    );

    if (
        process.argv.includes(
            '--debug'
        )
    ) {
        mainWindow.webContents.openDevTools({
            mode: 'detach'
        });
    }

    mainWindow.on(
        'maximize',
        () =>
            setMaximizedClass(true)
    );

    mainWindow.on(
        'unmaximize',
        () =>
            setMaximizedClass(false)
    );

    mainWindow.on(
        'enter-full-screen',
        () =>
            setMaximizedClass(true)
    );

    mainWindow.on(
        'leave-full-screen',
        () =>
            setMaximizedClass(
                mainWindow?.isMaximized() ||
                    false
            )
    );

    mainWindow.on(
        'closed',
        () => {
            mainWindow = null;
        }
    );
}

function setMaximizedClass(
    isMaximized
) {
    if (!mainWindow) {
        return;
    }

    mainWindow.webContents
        .executeJavaScript(
            `
            document
                .querySelector('.app-window')
                ?.classList
                .toggle(
                    'maximized',
                    ${Boolean(isMaximized)}
                );
            `,
            true
        )
        .catch(() => {});
}

// =========================
// TRAY
// =========================

function createTray() {
    const icon =
        nativeImage.createFromPath(
            getAssetPath('icon.png')
        );

    if (icon.isEmpty()) {
        return;
    }

    tray =
        new Tray(
            icon.resize({
                width: 16,
                height: 16
            })
        );

    tray.setToolTip(
        APP_NAME
    );

    tray.setContextMenu(
        Menu.buildFromTemplate([
            {
                label: 'Показать',
                click: () =>
                    mainWindow?.show()
            },

            {
                label: 'Скрыть',
                click: () =>
                    mainWindow?.hide()
            },

            {
                type: 'separator'
            },

            {
                label: 'Выход',
                click: () =>
                    app.quit()
            }
        ])
    );

    tray.on(
        'click',
        () => {
            if (!mainWindow) {
                return;
            }

            if (
                mainWindow.isVisible()
            ) {
                mainWindow.hide();
            } else {
                mainWindow.show();
            }
        }
    );
}

// =========================
// IPC
// =========================

function registerIpcHandlers() {
    // -------------------------
    // WINDOW
    // -------------------------

    ipcMain.on(
        'close-window',
        () => {
            mainWindow?.close();
        }
    );

    ipcMain.on(
        'minimize-window',
        () => {
            mainWindow?.minimize();
        }
    );

    ipcMain.on(
        'maximize-window',
        () => {
            if (!mainWindow) {
                return;
            }

            if (
                mainWindow.isMaximized()
            ) {
                mainWindow.unmaximize();
            } else {
                mainWindow.maximize();
            }
        }
    );

    // -------------------------
    // HWID
    // -------------------------

    ipcMain.handle(
        'get-hwid',
        () => {
            try {
                return machineIdSync(true);
            } catch (error) {
                console.error(
                    '[hwid]',
                    error
                );

                return 'HWID-UNKNOWN';
            }
        }
    );

    // -------------------------
    // ZOOM
    // -------------------------

    ipcMain.handle(
        'set-zoom',
        (_event, factor) => {
            const zoom =
                Number(factor);

            if (
                !Number.isFinite(
                    zoom
                ) ||
                zoom < 0.8 ||
                zoom > 1.1
            ) {
                throw new Error(
                    'Недопустимый масштаб интерфейса.'
                );
            }

            mainWindow?.webContents
                .setZoomFactor(
                    zoom
                );

            return true;
        }
    );

    // -------------------------
    // EXTERNAL
    // -------------------------

    ipcMain.handle(
        'open-external',
        (_event, url) => {
            if (
                typeof url !==
                'string'
            ) {
                throw new Error(
                    'Недопустимая ссылка.'
                );
            }

            const allowed =
                ALLOWED_EXTERNAL_URLS.has(
                    url
                ) ||
                url.startsWith(
                    'https://t.me/'
                ) ||
                url.startsWith(
                    'https://telegram.org/'
                ) ||
                url.startsWith(
                    'https://discord.gg/'
                );

            if (!allowed) {
                throw new Error(
                    'Недопустимая ссылка.'
                );
            }

            return shell.openExternal(
                url
            );
        }
    );

    // -------------------------
    // TELEGRAM AUTH
    // -------------------------

    ipcMain.handle(
        'open-telegram-auth',
        async () => {
            try {
                const user =
                    await openTelegramAuthWindow();

                return {
                    ok: true,
                    user
                };
            } catch (error) {
                console.error(
                    '[auth]',
                    error
                );

                return {
                    ok: false,

                    error:
                        error?.message ||
                        'Ошибка авторизации Telegram.'
                };
            }
        }
    );

    // -------------------------
    // BACKEND REQUEST
    // -------------------------

    ipcMain.handle(
        'backend-request',
        async (
            _event,
            request
        ) => {
            if (
                !request ||
                typeof request !==
                    'object'
            ) {
                return {
                    ok: false,
                    status: 400,
                    error:
                        'Некорректный запрос.'
                };
            }

            // Проверяем, что endpoint — строка
            if (typeof request.endpoint !== 'string') {
                return {
                    ok: false,
                    status: 400,
                    error: 'Endpoint должен быть строкой'
                };
            }

            return backendRequest(
                request.endpoint,
                {
                    method:
                        request.method ||
                        'GET',

                    headers:
                        request.headers ||
                        {},

                    body:
                        request.body,

                    timeout:
                        request.timeout ||
                        20000
                }
            );
        }
    );

    // -------------------------
    // SEARCH API
    // -------------------------

    ipcMain.handle(
        'api-request',
        async (
            _event,
            payload
        ) => {
            if (
                !payload ||
                typeof payload !==
                    'object'
            ) {
                return {
                    ok: false,
                    status: 400,
                    error:
                        'Некорректный запрос.'
                };
            }

            const controller =
                new AbortController();

            const timeout =
                setTimeout(
                    () =>
                        controller.abort(),
                    30000
                );

            try {
                const response =
                    await fetch(
                        SEARCH_API_URL,
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type':
                                    'application/json',

                                Accept:
                                    'application/json'
                            },

                            body:
                                JSON.stringify(
                                    payload
                                ),

                            signal:
                                controller.signal
                        }
                    );

                const text =
                    await response.text();

                let data = null;

                try {
                    data = text
                        ? JSON.parse(
                              text
                          )
                        : null;
                } catch {
                    data = {
                        raw: text
                    };
                }

                return {
                    ok:
                        response.ok,

                    status:
                        response.status,

                    data,

                    error:
                        data?.error ||
                        data?.message ||
                        null
                };
            } catch (error) {
                return {
                    ok: false,

                    status: 0,

                    error:
                        error?.name ===
                        'AbortError'
                            ? 'Превышено время ожидания ответа.'
                            : 'Ошибка соединения с API поиска.'
                };
            } finally {
                clearTimeout(
                    timeout
                );
            }
        }
    );

    // -------------------------
    // THEME
    // -------------------------

    ipcMain.handle(
        'set-theme',
        async (
            _event,
            theme
        ) => {
            const safeTheme =
                theme === 'light'
                    ? 'light'
                    : 'dark';

            try {
                await mainWindow?.webContents
                    .executeJavaScript(
                        `
                        document.documentElement
                            .setAttribute(
                                'data-theme',
                                ${JSON.stringify(
                                    safeTheme
                                )}
                            );

                        localStorage.setItem(
                            'theme',
                            ${JSON.stringify(
                                safeTheme
                            )}
                        );
                        `,
                        true
                    );

                return {
                    success: true
                };
            } catch (error) {
                return {
                    success: false,
                    error:
                        error?.message
                };
            }
        }
    );

    ipcMain.handle(
        'get-theme',
        async () => {
            try {
                const theme =
                    await mainWindow?.webContents
                        .executeJavaScript(
                            `
                            localStorage.getItem(
                                'theme'
                            ) || 'dark'
                            `,
                            true
                        );

                return (
                    theme ||
                    'dark'
                );
            } catch {
                return 'dark';
            }
        }
    );

    // -------------------------
    // VERSION
    // -------------------------

    ipcMain.handle(
        'get-version',
        () => {
            try {
                const pkg =
                    require(
                        './package.json'
                    );

                return (
                    pkg.version ||
                    '1.0.0'
                );
            } catch {
                return '1.0.0';
            }
        }
    );

    // -------------------------
    // BACKEND URL
    // -------------------------

    ipcMain.handle(
        'get-backend-url',
        () => {
            return BACKEND_URL;
        }
    );
}

// =========================
// APP START
// =========================

app.whenReady().then(
    () => {
        registerIpcHandlers();

        createWindow();

        createTray();

        globalShortcut.register(
            'F12',
            () => {
                const win =
                    BrowserWindow.getFocusedWindow();

                if (win) {
                    win.webContents.toggleDevTools();
                }
            }
        );

        globalShortcut.register(
            'CommandOrControl+Shift+I',
            () => {
                const win =
                    BrowserWindow.getFocusedWindow();

                if (win) {
                    win.webContents.toggleDevTools();
                }
            }
        );

        app.on(
            'activate',
            () => {
                if (
                    BrowserWindow.getAllWindows()
                        .length === 0
                ) {
                    createWindow();
                }
            }
        );
    }
);

app.on(
    'window-all-closed',
    () => {
        if (
            process.platform !==
            'darwin'
        ) {
            app.quit();
        }
    }
);

app.on(
    'before-quit',
    () => {
        globalShortcut.unregisterAll();

        tray?.destroy();

        if (authServer) {
            authServer.close();
            authServer = null;
        }
    }
);

console.log(
    `[app] ${APP_NAME} запущен`
);

console.log(
    '[app] Backend:',
    BACKEND_URL
);

console.log(
    '[app] Search API:',
    SEARCH_API_URL
);

console.log(
    '[app] Telegram:',
    TELEGRAM_BOT_USERNAME
);