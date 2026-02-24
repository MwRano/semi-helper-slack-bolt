const { getAllSchedules, markResultPosted, markRemindedHour, markOverdueRemindedDay, addRemindMessage } = require('./store');
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
                                const permalinkRes = await app.client.chat.getPermalink({
                                    channel: schedule.channelId,
                                    message_ts: schedule.threadTs
                                });
                                const permalink = permalinkRes.permalink;

                                for (const userId of unrespondedMembers) {
                                    const res = await app.client.chat.postMessage({
                                        channel: userId,
                                        text: `🔔 *リマインド*\n<@${userId}>\n締め切りまで残り約${hour}時間となりました。\n<${permalink}|こちらのメッセージ>から日程のご回答をお願いします！`,
                                    });
                                    addRemindMessage(scheduleId, userId, res.channel, res.ts);
                                }
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

            // ----- 2. 締め切り超過後の定期リマインド -----
            if (now > schedule.deadline) {
                const overdueDays = Math.floor((now - schedule.deadline) / (24 * 60 * 60));
                if (overdueDays >= 0) {
                    const overdueRemindedDays = schedule.overdueRemindedDays || [];
                    if (!overdueRemindedDays.includes(overdueDays)) {
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
                                const permalinkRes = await app.client.chat.getPermalink({
                                    channel: schedule.channelId,
                                    message_ts: schedule.threadTs
                                });
                                const permalink = permalinkRes.permalink;

                                for (const userId of unrespondedMembers) {
                                    const textMessage = overdueDays === 0
                                        ? `⚠️ *未回答リマインド*\n<@${userId}>\n日程調整の締め切りを過ぎました。\n<${permalink}|こちらのメッセージ>から日程のご回答をお願いします🙏`
                                        : `⚠️ *未回答リマインド*\n<@${userId}>\n日程調整の締め切りを過ぎています（${overdueDays}日経過）。\n<${permalink}|こちらのメッセージ>から日程のご回答をお願いします🙏`;

                                    const res = await app.client.chat.postMessage({
                                        channel: userId,
                                        text: textMessage,
                                    });
                                    addRemindMessage(scheduleId, userId, res.channel, res.ts);
                                }
                                app.logger.info(`⚠️ 超過リマインドを送信しました: ${scheduleId} (${overdueDays}日経過, ${unrespondedMembers.length}名へ)`);
                            }

                            // 未回答がいなくても経過日数フラグは立ててスキップする
                            markOverdueRemindedDay(scheduleId, overdueDays);
                        } catch (error) {
                            app.logger.error(`超過リマインド処理に失敗しました (${scheduleId}):`, error);
                        }
                    }
                }
            }

        }
    }, CHECK_INTERVAL_MS);
}

module.exports = { startDeadlineChecker };
