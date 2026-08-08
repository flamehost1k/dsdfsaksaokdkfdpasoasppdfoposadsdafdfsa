# Deployment

## 1. GitHub Pages

Delete the old root files from the Pages repository and upload:

github-pages/auth.html

Do not put it inside a `github-pages` folder on GitHub.

## 2. Render

If Render is connected to the same repository, set:

Root Directory: server
Build Command: npm install
Start Command: npm start

Environment:
PORT=3000
BOT_TOKEN=<new token>
ADMIN_TELEGRAM_ID=8148135765
SESSION_SECRET=<long random secret>
DATABASE_PATH=./database.sqlite

## 3. Electron

Use `electron-app/`.

Run:
npm install
npm start

## 4. Expected flow

Electron -> GitHub Pages auth.html -> Telegram -> 127.0.0.1:3847/callback -> Render /api/auth/telegram -> signed session token -> Electron UI.

The server is the source of truth for admin rights and user list.
