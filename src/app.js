const { App } = require('@slack/bolt');

require('dotenv').config();

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN,
    port: process.env.PORT || 3000
});

// 「日程調整」を含むメッセージを受信したときの処理
app.message('日程調整', async ({ message, say, logger }) => {
    logger.info('📅 日程調整コマンドを受信しました');
    await say(`<@${message.user}> 📅 日程調整のリクエストを受け付けました！`);
});

(async () => {
    await app.start();

    app.logger.info('⚡️ Bolt app is running!');
})();