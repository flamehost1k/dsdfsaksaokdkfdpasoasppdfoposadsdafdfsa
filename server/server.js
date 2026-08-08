require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const crypto = require('crypto');

const app = express();
app.use(cors({
    origin: ['https://flamehost1k.github.io', 'http://localhost:3000', 'http://localhost:3847'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(__dirname));

const BOT_TOKEN = process.env.BOT_TOKEN || '8712904392:AAGMl7OBly82D2zD7Wt2vyfjqSg4B4nfio8';

// 1. Инициализация БД
const db = new Database('./database.sqlite');

// Создаём таблицу пользователей с расширенными полями
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id TEXT UNIQUE,
        username TEXT,
        first_name TEXT,
        photo_url TEXT,
        plan TEXT DEFAULT 'free',
        plan_expiry DATETIME,
        queries_used INTEGER DEFAULT 0,
        total_queries INTEGER DEFAULT 0,
        hwid TEXT,
        is_admin INTEGER DEFAULT 0,
        is_premium INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// 2. Валидация HMAC-SHA256 от Telegram
function verifyTelegramAuth(data) {
    if (!BOT_TOKEN || !data || typeof data !== 'object' || Array.isArray(data)) return false;

    const { hash, ...checkData } = data;
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/i.test(hash)) return false;
    if (!Number.isSafeInteger(Number(checkData.id)) || Number(checkData.id) <= 0) return false;
    if (!Number.isSafeInteger(Number(checkData.auth_date))) return false;
    if (Object.values(checkData).some((value) => typeof value !== 'string' && typeof value !== 'number')) return false;

    const dataCheckString = Object.keys(checkData)
        .sort()
        .map((key) => `${key}=${checkData[key]}`)
        .join('\n');
    const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
    const expected = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
    const received = Buffer.from(hash, 'hex');
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return false;

    const authAgeSeconds = Math.floor(Date.now() / 1000) - Number(checkData.auth_date);
    if (authAgeSeconds > 86400 || authAgeSeconds < -300) return false;

    return true;
}

// 3. Авторизация / Регистрация
app.post('/api/auth/telegram', (req, res) => {
    const authData = req.body;
    console.log('[auth] Получены данные:', authData);

    if (!verifyTelegramAuth(authData)) {
        return res.status(403).json({ error: 'Недействительные данные авторизации Telegram!' });
    }

    const { id, username, first_name, photo_url } = authData;

    const stmt = db.prepare(`
        INSERT INTO users (telegram_id, username, first_name, photo_url, hwid)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
            username = excluded.username,
            first_name = excluded.first_name,
            photo_url = excluded.photo_url
    `);

    try {
        stmt.run(String(id), username || '', first_name || '', photo_url || '', '');
        const user = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(String(id));
        console.log('[auth] Пользователь авторизован:', user);
        res.json({ success: true, user });
    } catch (err) {
        console.error('[auth] Ошибка:', err);
        res.status(500).json({ error: err.message });
    }
});

// 4. Получение всех пользователей
app.get('/api/admin/users', (req, res) => {
    try {
        const users = db.prepare(`SELECT * FROM users ORDER BY created_at DESC`).all();
        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Получение пользователя по ID
app.get('/api/users/:id', (req, res) => {
    try {
        const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Получение пользователя по Telegram ID
app.get('/api/users/telegram/:telegramId', (req, res) => {
    try {
        const user = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(req.params.telegramId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        res.json({ user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Создание или обновление пользователя
app.post('/api/users', (req, res) => {
    const { telegramId, username, name, plan, planExpiry, hwid, isAdmin, isPremium, photoUrl } = req.body;
    
    if (!telegramId) {
        return res.status(400).json({ error: 'Telegram ID обязателен' });
    }

    try {
        // Проверяем, существует ли пользователь
        const existing = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(String(telegramId));
        
        if (existing) {
            // Обновляем
            const stmt = db.prepare(`
                UPDATE users SET 
                    username = ?, first_name = ?, plan = ?, plan_expiry = ?, 
                    hwid = ?, is_admin = ?, is_premium = ?, photo_url = ?
                WHERE telegram_id = 8148135765
            `);
            stmt.run(
                username || '', name || '', plan || 'free', planExpiry || null,
                hwid || '', isAdmin ? 1 : 0, isPremium ? 1 : 0,
                photoUrl || '', String(telegramId)
            );
            const user = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(String(telegramId));
            res.json({ success: true, user });
        } else {
            // Создаём
            const stmt = db.prepare(`
                INSERT INTO users (telegram_id, username, first_name, plan, plan_expiry, hwid, is_admin, is_premium, photo_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                String(telegramId), username || '', name || '', plan || 'free', planExpiry || null,
                hwid || '', isAdmin ? 1 : 0, isPremium ? 1 : 0, photoUrl || ''
            );
            const user = db.prepare(`SELECT * FROM users WHERE telegram_id = ?`).get(String(telegramId));
            res.json({ success: true, user });
        }
    } catch (err) {
        console.error('[users] Ошибка:', err);
        res.status(500).json({ error: err.message });
    }
});

// 8. Обновление подписки
app.post('/api/admin/subscription', (req, res) => {
    const { userId, plan, planExpiry } = req.body;

    if (!userId || !plan) {
        return res.status(400).json({ error: 'Не указан userId или plan' });
    }

    try {
        const stmt = db.prepare(`
            UPDATE users SET plan = ?, plan_expiry = ?, is_premium = ? 
            WHERE id = ?
        `);
        const isPremium = plan === 'pro' || plan === 'business';
        const result = stmt.run(plan, planExpiry || null, isPremium ? 1 : 0, userId);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Удаление пользователя
app.delete('/api/admin/users/:id', (req, res) => {
    const userId = req.params.id;

    try {
        const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
        if (user && user.is_admin === 1) {
            return res.status(403).json({ error: 'Нельзя удалить администратора' });
        }

        const result = db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Обновление статистики запросов
app.post('/api/users/:id/queries', (req, res) => {
    const userId = req.params.id;
    const { queriesUsed, totalQueries } = req.body;

    try {
        const stmt = db.prepare(`
            UPDATE users SET queries_used = ?, total_queries = ? 
            WHERE id = ?
        `);
        stmt.run(queriesUsed || 0, totalQueries || 0, userId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== ДОБАВЛЕНИЕ АДМИНА ПРИ ЗАПУСКЕ СЕРВЕРА =====
function ensureAdminExists() {
    const ADMIN_TELEGRAM_ID = '8148135765';
    const ADMIN_USERNAME = 'atlizup';
    
    try {
        // Проверяем, есть ли админ
        const admin = db.prepare(`SELECT * FROM users WHERE telegram_id = ? OR username = ?`).get(ADMIN_TELEGRAM_ID, ADMIN_USERNAME);
        
        if (!admin) {
            // Создаём админа
            const stmt = db.prepare(`
                INSERT INTO users (telegram_id, username, first_name, plan, is_admin)
                VALUES (?, ?, ?, ?, ?)
            `);
            stmt.run(ADMIN_TELEGRAM_ID, ADMIN_USERNAME, 'Администратор', 'business', 1);
            console.log('[init] ✅ Администратор создан в БД!');
        } else if (admin.is_admin !== 1) {
            // Обновляем существующего
            const stmt = db.prepare(`UPDATE users SET plan = 'business', is_admin = 1 WHERE id = ?`);
            stmt.run(admin.id);
            console.log('[init] ✅ Существующий пользователь обновлён до админа');
        }
    } catch (err) {
        console.error('[init] Ошибка создания админа:', err.message);
    }
}

// Вызываем при старте
ensureAdminExists();

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    ensureAdminExists(); // Ещё раз для уверенности
});