# MenaceSEARCH Pro — GitHub/Render ready

## GitHub Pages

Upload the contents of `github-pages/` to the ROOT of the GitHub Pages repository.

The final file must be:

`auth.html`

Expected URL:

https://flamehost1k.github.io/dsdfsaksaokdkfdpasoasppdfoposadsdafdfsa/auth.html

Telegram widget username is `MenaceAuthRobot`.

## Render

Deploy the `server/` directory as the Render web service.

Environment variables:

PORT=3000
BOT_TOKEN=YOUR_NEW_BOT_TOKEN
ADMIN_TELEGRAM_ID=8148135765
SESSION_SECRET=YOUR_LONG_RANDOM_SECRET
DATABASE_PATH=./database.sqlite

Do NOT put BOT_TOKEN in GitHub.

## Electron

Use the complete `electron-app/` directory as the Electron project.

The Electron app sends Telegram auth data to Render, receives a signed session token, and uses that token for `/api/auth/me` and admin endpoints.

## Important

The Telegram bot token previously exposed in the project must be rotated in BotFather.
