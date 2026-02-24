const { App } = require('@slack/bolt');
const { config } = require('./config');
const { registerFeatures } = require('./features');
const { startHealthCheckServer } = require('./utils/healthCheck');

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

        // 本番環境（デプロイ時）のみ、死活監視用のダミーサーバーを起動する
        if (process.env.NODE_ENV === 'production') {
            startHealthCheckServer(config.port);
        } else {
            app.logger.info('開発環境のため、ヘルスチェックサーバーは起動しません。');
        }
    } catch (error) {
        app.logger.error('Failed to start the app', error);
    }
})();