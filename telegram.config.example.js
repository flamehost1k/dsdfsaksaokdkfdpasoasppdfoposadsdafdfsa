module.exports = {
    botUsername: 'MenaceAuthRobot',
    botToken: '8712904392:AAGMl7OBly82D2zD7Wt2vyfjqSg4B4nfio8',

    // URL страницы входа с HTTPS (обязательно для Telegram Login Widget).
    //
    // Бесплатные варианты (покупать домен НЕ нужно):
    //
    // 1) GitHub Pages (постоянный, рекомендуется):
    //    - создайте репозиторий, загрузите папку auth-host как index.html
    //    - Settings → Pages → Deploy from branch → main
    //    - получите адрес: https://ВАШ_ЛОГИН.github.io/ИМЯ_РЕПО/
    //    - в @BotFather: /setdomain → ВАШ_ЛОГИН.github.io  (без https://)
    //
    // 2) ngrok (быстрый тест, URL меняется при перезапуске):
    //    - ngrok http 3847
    //    - в @BotFather: /setdomain → xxxx.ngrok-free.app
    //    - authPageUrl: 'https://xxxx.ngrok-free.app/'
    //
    authPageUrl: '',
};
