require('dotenv').config();

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = String(process.env.BOT_TOKEN || '').trim();
const ADMIN_TELEGRAM_ID = String(process.env.ADMIN_TELEGRAM_ID || '8148135765').trim();
const SESSION_SECRET = String(process.env.SESSION_SECRET || '').trim();

if (!BOT_TOKEN) console.warn('[config] BOT_TOKEN is not set');
if (!SESSION_SECRET) console.warn('[config] SESSION_SECRET is not set');

const allowedOrigins = [
    'https://flamehost1k.github.io',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3847',
    'http://127.0.0.1:3847'
];

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('CORS origin not allowed'));
    },
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
    res.json({
        ok: true,
        service: 'MenaceSEARCH backend',
        status: 'online',
        time: new Date().toISOString()
    });
});

app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE,
    username TEXT DEFAULT '',
    first_name TEXT DEFAULT '',
    photo_url TEXT DEFAULT '',
    plan TEXT DEFAULT 'basic',
    plan_expiry DATETIME,
    queries_used INTEGER DEFAULT 0,
    total_queries INTEGER DEFAULT 0,
    hwid TEXT,
    is_admin INTEGER DEFAULT 0,
    is_premium INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

function publicUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        telegram_id: row.telegram_id,
        username: row.username || '',
        first_name: row.first_name || '',
        photo_url: row.photo_url || '',
        plan: row.plan || 'basic',
        plan_expiry: row.plan_expiry || null,
        queries_used: Number(row.queries_used || 0),
        total_queries: Number(row.total_queries || 0),
        hwid: row.hwid || null,
        is_admin: Number(row.is_admin) === 1,
        is_premium: Number(row.is_premium) === 1,
        created_at: row.created_at
    };
}

function verifyTelegramAuth(data) {
    if (!BOT_TOKEN || !data || typeof data !== 'object') return false;

    const { hash, ...raw } = data;
    if (!hash || !raw.id || !raw.auth_date) return false;

    const checkData = {};
    for (const [key, value] of Object.entries(raw)) {
        if (value !== undefined && value !== null && value !== '') {
            checkData[key] = String(value);
        }
    }

    const checkString = Object.keys(checkData)
        .sort()
        .map(key => `${key}=${checkData[key]}`)
        .join('\n');

    const secretKey = crypto.createHash('sha256').update(BOT_TOKEN).digest();
    const expected = crypto
        .createHmac('sha256', secretKey)
        .update(checkString)
        .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(hash), 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

    const age = Math.floor(Date.now() / 1000) - Number(raw.auth_date);
    return Number.isFinite(age) && age >= -300 && age <= 86400;
}

function signSession(payload) {
    if (!SESSION_SECRET) throw new Error('SESSION_SECRET is not configured');
    const body = Buffer.from(JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000)
    })).toString('base64url');

    const signature = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(body)
        .digest('base64url');

    return `${body}.${signature}`;
}

function verifySession(token) {
    if (!SESSION_SECRET || !token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [body, signature] = parts;
    const expected = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(body)
        .digest('base64url');

    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        const age = Math.floor(Date.now() / 1000) - Number(payload.iat || 0);
        if (!payload.userId || !Number.isFinite(age) || age < 0 || age > 30 * 86400) return null;
        return payload;
    } catch {
        return null;
    }
}

function getToken(req) {
    const auth = String(req.headers.authorization || '');
    if (auth.toLowerCase().startsWith('bearer ')) {
        return auth.slice(7).trim();
    }
    return null;
}

function requireAuth(req, res, next) {
    const session = verifySession(getToken(req));
    if (!session) return res.status(401).json({ success: false, error: 'Сессия недействительна или истекла' });

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(session.userId);
    if (!row) return res.status(401).json({ success: false, error: 'Пользователь не найден' });

    req.user = row;
    req.session = session;
    next();
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
        const isConfiguredAdmin = String(req.user.telegram_id) === ADMIN_TELEGRAM_ID;
        const isDbAdmin = Number(req.user.is_admin) === 1;

        if (!isConfiguredAdmin && !isDbAdmin) {
            return res.status(403).json({ success: false, error: 'Доступ только для администратора' });
        }

        // ADMIN_TELEGRAM_ID всегда имеет админские права.
        if (isConfiguredAdmin && Number(req.user.is_admin) !== 1) {
            db.prepare(`
                UPDATE users
                SET is_admin = 1, is_premium = 1, plan = 'business'
                WHERE id = ?
            `).run(req.user.id);
            req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        }

        next();
    });
}

app.post('/api/auth/telegram', (req, res) => {
    try {
        const authData = req.body || {};

        if (!verifyTelegramAuth(authData)) {
            return res.status(403).json({
                success: false,
                error: 'Недействительные данные авторизации Telegram'
            });
        }

        const telegramId = String(authData.id);
        const isAdmin = telegramId === ADMIN_TELEGRAM_ID;

        let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

        if (user) {
            db.prepare(`
                UPDATE users
                SET username = ?, first_name = ?, photo_url = ?,
                    is_admin = CASE WHEN ? = 1 THEN 1 ELSE is_admin END,
                    is_premium = CASE WHEN ? = 1 THEN 1 ELSE is_premium END,
                    plan = CASE WHEN ? = 1 THEN 'business' ELSE plan END
                WHERE telegram_id = ?
            `).run(
                authData.username || '',
                authData.first_name || '',
                authData.photo_url || '',
                isAdmin ? 1 : 0,
                isAdmin ? 1 : 0,
                isAdmin ? 1 : 0,
                telegramId
            );
        } else {
            db.prepare(`
                INSERT INTO users
                (telegram_id, username, first_name, photo_url, plan, is_admin, is_premium)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                telegramId,
                authData.username || '',
                authData.first_name || '',
                authData.photo_url || '',
                isAdmin ? 'business' : 'basic',
                isAdmin ? 1 : 0,
                isAdmin ? 1 : 0
            );
        }

        user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

        const token = signSession({ userId: user.id, telegramId });
        return res.json({
            success: true,
            token,
            user: publicUser(user)
        });
    } catch (error) {
        console.error('[auth]', error);
        return res.status(500).json({ success: false, error: 'Ошибка сервера авторизации' });
    }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, user: publicUser(fresh) });
});

app.post('/api/auth/logout', (_req, res) => {
    res.json({ success: true });
});

app.get('/api/admin/users', requireAdmin, (_req, res) => {
    const users = db.prepare('SELECT * FROM users ORDER BY created_at DESC, id DESC').all();
    res.json({ success: true, users: users.map(publicUser) });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
    try {
        const {
            telegramId,
            username = '',
            name = '',
            plan = 'basic',
            planExpiry = null,
            hwid = '',
            photoUrl = ''
        } = req.body || {};

        if (!telegramId) return res.status(400).json({ success: false, error: 'Telegram ID обязателен' });

        const tg = String(telegramId).replace(/^@/, '');
        const exists = db.prepare('SELECT id FROM users WHERE telegram_id = ?').get(tg);
        if (exists) return res.status(409).json({ success: false, error: 'Пользователь уже существует' });

        const premium = plan === 'pro' || plan === 'business' ? 1 : 0;
        const result = db.prepare(`
            INSERT INTO users
            (telegram_id, username, first_name, photo_url, plan, plan_expiry, hwid, is_premium)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tg, username, name, photoUrl, plan, planExpiry, hwid || null, premium);

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
        res.json({ success: true, user: publicUser(user) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/subscription', requireAdmin, (req, res) => {
    try {
        const { userId, plan, planExpiry = null, hwid = null } = req.body || {};
        const allowed = new Set(['basic', 'free', 'pro', 'business']);
        if (!userId || !allowed.has(plan)) {
            return res.status(400).json({ success: false, error: 'Некорректный пользователь или план' });
        }

        const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!target) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        if (Number(target.is_admin) === 1) {
            return res.status(403).json({ success: false, error: 'Нельзя изменить план администратора' });
        }

        const premium = plan === 'pro' || plan === 'business' ? 1 : 0;
        db.prepare(`
            UPDATE users
            SET plan = ?, plan_expiry = ?, is_premium = ?, hwid = ?
            WHERE id = ?
        `).run(plan, planExpiry || null, premium, hwid || null, userId);

        res.json({
            success: true,
            user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/subscription/:id', requireAdmin, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    if (Number(user.is_admin) === 1) return res.status(403).json({ success: false, error: 'Нельзя забрать подписку администратора' });

    db.prepare(`
        UPDATE users
        SET plan = 'basic', plan_expiry = NULL, is_premium = 0
        WHERE id = ?
    `).run(req.params.id);

    res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    if (Number(user.is_admin) === 1 || String(user.telegram_id) === ADMIN_TELEGRAM_ID) {
        return res.status(403).json({ success: false, error: 'Нельзя удалить администратора' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
});

app.post('/api/users/:id/queries', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (id !== Number(req.user.id)) {
        return res.status(403).json({ success: false, error: 'Недостаточно прав' });
    }

    const queriesUsed = Math.max(0, Number(req.body?.queriesUsed || 0));
    const totalQueries = Math.max(0, Number(req.body?.totalQueries || 0));

    db.prepare(`
        UPDATE users SET queries_used = ?, total_queries = ?
        WHERE id = ?
    `).run(queriesUsed, totalQueries, id);

    res.json({ success: true });
});

app.use((err, _req, res, _next) => {
    console.error('[server]', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`MenaceSEARCH backend listening on 0.0.0.0:${PORT}`);
    console.log(`Admin Telegram ID: ${ADMIN_TELEGRAM_ID}`);
});
