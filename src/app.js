const { App } = require('@slack/bolt');
const { config } = require('./config');
const { registerFeatures } = require('./features');

const app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
    socketMode: true,
    appToken: config.slack.appToken,
    port: config.port,
});

// 全機能のリスナーを登録
registerFeatures(app);

// アプリ起動
(async () => {
    try {
        await app.start();
        app.logger.info('⚡️ Bolt app is running!');
    } catch (error) {
        app.logger.error('Failed to start the app', error);
    }
})();