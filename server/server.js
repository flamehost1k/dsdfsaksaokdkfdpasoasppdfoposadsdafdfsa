require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const crypto = require('crypto'); // Встроенный модуль Node.js, ставить не нужно!

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;

// 1. Инициализация БД (файл создастся автоматически)
const db = new Database('./database.sqlite');

// Создаём таблицу пользователей
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        username TEXT,
        first_name TEXT,
        photo_url TEXT,
        plan TEXT DEFAULT 'free',
        is_admin INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// 2. Валидация HMAC-SHA256 от Telegram
function verifyTelegramAuth(data) {
    const { hash, ...userData } = data;
    if (!hash || !BOT_TOKEN) return false;

    const checkString = Object.keys(userData)
        .sort()
        .map(key => `${key}=${userData[key]}`)
        .join('\n');

    const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
    const hmac = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    return hmac === hash;
}

// 3. Авторизация / Регистрация
app.post('/api/auth/telegram', (req, res) => {
    const authData = req.body;

    if (!verifyTelegramAuth(authData)) {
        return res.status(403).json({ error: 'Недействительные данные авторизации Telegram!' });
    }

    const { id, username, first_name, photo_url } = authData;

    const stmt = db.prepare(`
        INSERT INTO users (telegram_id, username, first_name, photo_url)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            photo_url = excluded.photo_url
    `);

    try {
        stmt.run(String(id), username || '', first_name || '', photo_url || '');
        const user = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(String(id));
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Список всех пользователей для Админки
app.get('/api/admin/users', (req, res) => {
    try {
        const users = db.prepare(`SELECT * FROM users ORDER BY created_at DESC`).all();
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Сервер запущен на http://localhost:${PORT}`));