# MenaceSEARCH Pro — FULL FIXED PROJECT

## Structure
- `electron-app/` — Windows/Electron application.
- `github-pages/` — ONLY the public Telegram auth page. Upload the contents of this folder to the GitHub Pages repository.
- `server/` — Render backend. Deploy this folder as the Render service.
- `docs/` — deployment notes.

## GitHub Pages
Upload `github-pages/auth.html` to the repository root. The expected URL is:
https://flamehost1k.github.io/dsdfsaksaokdkfdpasoasppdfoposadsdafdfsa/auth.html

The Telegram widget is configured for `MenaceAuthRobot`. If your bot username in BotFather is different, change that one value in `auth.html` and `electron-app/telegram.config.js`.

## Render
Deploy the `server/` folder. Set these Environment Variables:
- `PORT=3000`
- `BOT_TOKEN=<NEW BOT TOKEN>`
- `ADMIN_TELEGRAM_ID=8148135765`
- `SESSION_SECRET=<LONG RANDOM SECRET>`
- `DATABASE_PATH=./database.sqlite`

Never put BOT_TOKEN in GitHub Pages or Electron frontend files. The previously exposed token must be rotated in BotFather.

## Important
SQLite on a normal free Render filesystem is not durable across all restarts/redeploys. For permanent user storage, attach a persistent disk or move the users table to PostgreSQL.
