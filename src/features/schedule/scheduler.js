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
                // 先生の予定を考慮する場合のみ Google Calendar を呼び出す
                const busySlots = schedule.includeTeacher !== false
                    ? await getBusySlots(schedule.startDate, schedule.endDate, schedule.timeSlots)
                    : {};
                const result = buildResultBlocks(scheduleId, busySlots);
                if (!result) continue;

                await app.client.chat.postMessage({
                    channel: schedule.channelId,
                    thread_ts: schedule.threadTs,
                    blocks: result.blocks,
                    text: result.text,
                });

                markResultPosted(scheduleId);

                // スレッドの親メッセージ（フォーム）を更新してボタンを消す
                try {
                    const deadlineDate = new Date(schedule.deadline * 1000);
                    const deadlineText = deadlineDate.toLocaleString('ja-JP', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                    });

                    await app.client.chat.update({
                        channel: schedule.channelId,
                        ts: schedule.threadTs,
                        blocks: [
                            {
                                type: 'header',
                                text: {
                                    type: 'plain_text',
                                    text: '📅 日程調整',
                                },
                            },
                            {
                                type: 'section',
                                text: {
                                    type: 'mrkdwn',
                                    text: `*作成者:* <@${schedule.creatorId}>　|　*締め切り:* ${deadlineText}`,
                                },
                            },
                            {
                                type: 'context',
                                elements: [
                                    {
                                        type: 'mrkdwn',
                                        text: '⚠️ 締め切りを過ぎたため、受付を終了しました。',
                                    },
                                ],
                            },
                        ],
                        text: '📅 日程調整の受付が終了しました',
                    });
                } catch (updateErr) {
                    app.logger.warn(`親メッセージの更新（ボタン無効化）に失敗しました: ${scheduleId}`, updateErr);
                }

                // チャンネルメンション用メッセージを削除する
                if (schedule.channelMentionTs) {
                    try {
                        await app.client.chat.delete({
                            channel: schedule.channelId,
                            ts: schedule.channelMentionTs,
                        });
                    } catch (deleteErr) {
                        app.logger.warn(`チャンネルメンション用メッセージの削除に失敗しました: ${scheduleId}`, deleteErr);
                    }
                }

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
