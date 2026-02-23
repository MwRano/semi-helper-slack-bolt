const { saveResponse, getSchedule, markResultPosted } = require('./store');
const { buildResultBlocks } = require('./resultViews');
const { getBusySlots } = require('./googleCalendarService');

/**
 * 回答モーダル送信時のハンドラー
 * → 回答データを保存し、チャンネルに通知する
 */
const responseHandler = async ({ ack, body, view, client, logger }) => {
    await ack();

    try {
        const values = view.state.values;
        const { scheduleId } = JSON.parse(view.private_metadata);
        const userId = body.user.id;

        // resp_ で始まる block_id から回答データを抽出
        const slots = {};
        for (const blockId of Object.keys(values)) {
            if (blockId.startsWith('resp_')) {
                // block_id: "resp_2026-03-02_1" → slotKey: "2026-03-02_1"
                const slotKey = blockId.replace('resp_', '');
                slots[slotKey] = values[blockId].availability.selected_option.value;
            }
        }

        // 備考を取得
        const note = values.response_note_block?.response_note?.value || '';

        // 表示名を取得
        let displayName = userId;
        try {
            const userInfo = await client.users.info({ user: userId });
            displayName =
                userInfo.user.profile.display_name ||
                userInfo.user.real_name ||
                userInfo.user.name;
        } catch (e) {
            logger.warn(`ユーザー情報の取得に失敗しました(users:read権限が不足している可能性があります): ${e.message}`);
            // フォールバック: body.user.name があれば使用、なければ ID そのまま
            displayName = body.user.name || userId;
        }

        // 保存
        saveResponse(scheduleId, userId, { slots, note, displayName });

        const schedule = getSchedule(scheduleId);

        // ◯ △ ✕ のカウント
        const counts = { available: 0, maybe: 0, unavailable: 0 };
        for (const state of Object.values(slots)) {
            counts[state]++;
        }

        logger.info('========================================');
        logger.info('✅ 回答が送信されました');
        logger.info(`  ユーザー: ${userId}`);
        logger.info(`  スケジュール: ${scheduleId}`);
        logger.info(`  🟢 ${counts.available}件 / 🟡 ${counts.maybe}件 / 🔴 ${counts.unavailable}件`);
        if (note) logger.info(`  📝 備考: ${note}`);
        logger.info('========================================');

        // チャンネルに通知
        await client.chat.postMessage({
            channel: schedule.channelId,
            thread_ts: schedule.threadTs,
            text: `✅ <@${userId}> が日程を回答しました（🟢${counts.available} 🟡${counts.maybe} 🔴${counts.unavailable}）`,
        });

        // 全員が回答したかチェック
        if (!schedule.resultPosted) {
            try {
                // チャンネルのメンバーを取得
                const channelMembersRes = await client.conversations.members({
                    channel: schedule.channelId,
                });
                // botは除く必要があればここでフィルタリング等を行いますが、
                // 一旦「チャンネルにいるユーザーのリスト」と「回答したユーザーのリスト」を比較

                // botユーザー情報を取得（自分自身を除外するため）
                const botInfo = await client.auth.test();
                const botUserId = botInfo.user_id;

                const members = channelMembersRes.members.filter(id => id !== botUserId);
                const respondedUsers = Object.keys(schedule.responses);

                // メンバーが全員回答済みかチェック
                const allResponded = members.every(memberId => respondedUsers.includes(memberId));

                if (allResponded) {
                    logger.info(`🎉 チャンネルメンバー全員（${members.length}名）が回答しました。結果を投稿します。`);

                    // Google Calendar からビジー情報を取得
                    const busySlots = await getBusySlots(schedule.startDate, schedule.endDate, schedule.timeSlots);
                    const result = buildResultBlocks(scheduleId, busySlots);
                    if (result) {
                        await client.chat.postMessage({
                            channel: schedule.channelId,
                            thread_ts: schedule.threadTs,
                            blocks: result.blocks,
                            text: result.text,
                        });
                        markResultPosted(scheduleId);
                    }
                }
            } catch (err) {
                logger.error('全員回答のチェック中にエラーが発生しました:', err);
            }
        }
    } catch (error) {
        logger.error('回答の保存に失敗しました:', error);
    }
};

module.exports = { responseHandler };
