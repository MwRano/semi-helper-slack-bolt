const { getAllSchedules, markResultPosted, markRemindedHour } = require('./store');
const { buildResultBlocks } = require('./resultViews');
const { getBusySlots } = require('./googleCalendarService');

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
            // ----- 1. リマインド処理 -----
            // まだ結果が投稿されていない場合
            if (!schedule.resultPosted) {
                const remindHours = schedule.remindHours || [24, 1]; // フォールバック
                const remindedHours = schedule.remindedHours || [];

                for (const hour of remindHours) {
                    if (remindedHours.includes(hour)) continue;

                    const remindTime = schedule.deadline - (hour * 60 * 60);
                    if (now >= remindTime) {
                        try {
                            const channelMembersRes = await app.client.conversations.members({
                                channel: schedule.channelId,
                            });

                            const botInfo = await app.client.auth.test();
                            const botUserId = botInfo.user_id;

                            const respondedUsers = Object.keys(schedule.responses);
                            const unrespondedMembers = channelMembersRes.members.filter(
                                (id) => id !== botUserId && !respondedUsers.includes(id)
                            );

                            if (unrespondedMembers.length > 0) {
                                const mentions = unrespondedMembers.map((id) => `<@${id}>`).join(' ');
                                await app.client.chat.postMessage({
                                    channel: schedule.channelId,
                                    thread_ts: schedule.threadTs,
                                    text: `🔔 *リマインド*\n${mentions}\n締め切りまで残り約${hour}時間となりました。まだ回答されていない方はご回答をお願いします！`,
                                });
                                app.logger.info(`🔔 リマインドを送信しました: ${scheduleId} (${hour}時間前, ${unrespondedMembers.length}名へ)`);
                            }

                            // 人数にかかわらず、フラグを立てて二重送信を防ぐ
                            markRemindedHour(scheduleId, hour);
                        } catch (error) {
                            app.logger.error(`リマインド処理に失敗しました (${scheduleId}):`, error);
                        }
                    }
                }
            }

            // ----- 2. 締め切り処理 -----
            // 既に結果投稿済み or 締め切りまだ → スキップ
            if (schedule.resultPosted || schedule.deadline > now) {
                continue;
            }

            // 締め切り到達 → 結果を投稿
            try {
                // Google Calendar からビジー情報を取得
                const busySlots = await getBusySlots(schedule.startDate, schedule.endDate, schedule.timeSlots);
                const result = buildResultBlocks(scheduleId, busySlots);
                if (!result) continue;

                await app.client.chat.postMessage({
                    channel: schedule.channelId,
                    thread_ts: schedule.threadTs,
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
