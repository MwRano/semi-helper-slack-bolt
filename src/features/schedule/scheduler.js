const { getAllSchedules, markResultPosted } = require('./store');
const { buildResultBlocks } = require('./resultViews');

const CHECK_INTERVAL_MS = 60 * 1000; // 1分ごとにチェック

/**
 * 締め切りチェックを開始する
 * @param {import('@slack/bolt').App} app
 */
function startDeadlineChecker(app) {
    app.logger.info('⏰ 締め切りチェッカーを開始しました（1分間隔）');

    setInterval(async () => {
        const now = Math.floor(Date.now() / 1000); // Unix timestamp
        const schedules = getAllSchedules();

        for (const [scheduleId, schedule] of schedules) {
            // 既に結果投稿済み or 締め切りまだ → スキップ
            if (schedule.resultPosted || schedule.deadline > now) {
                continue;
            }

            // 締め切り到達 → 結果を投稿
            try {
                const result = buildResultBlocks(scheduleId);
                if (!result) continue;

                await app.client.chat.postMessage({
                    channel: schedule.channelId,
                    blocks: result.blocks,
                    text: result.text,
                });

                markResultPosted(scheduleId);

                app.logger.info('========================================');
                app.logger.info(`📊 回答一覧を投稿しました: ${scheduleId}`);
                app.logger.info(`  回答者数: ${Object.keys(schedule.responses).length}名`);
                app.logger.info('========================================');
            } catch (error) {
                app.logger.error(`回答一覧の投稿に失敗しました (${scheduleId}):`, error);
            }
        }
    }, CHECK_INTERVAL_MS);
}

module.exports = { startDeadlineChecker };
