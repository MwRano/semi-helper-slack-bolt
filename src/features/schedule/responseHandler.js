const { saveResponse, getSchedule } = require('./store');

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
            text: `✅ <@${userId}> が日程を回答しました（🟢${counts.available} 🟡${counts.maybe} 🔴${counts.unavailable}）`,
        });
    } catch (error) {
        logger.error('回答の保存に失敗しました:', error);
    }
};

module.exports = { responseHandler };
