/**
 * 日程調整モーダル送信時のハンドラー
 * → 入力値を取得し、チャンネルに通知する
 */
const viewHandler = async ({ ack, body, view, client, logger }) => {
    await ack();

    try {
        const values = view.state.values;
        const startDate = values.start_date_block.start_date.selected_date;
        const endDate = values.end_date_block.end_date.selected_date;
        const deadline = values.deadline_block.deadline.selected_date_time;

        // block_id が動的（time_slots_block_0, _1, ...）なので検索する
        const timeSlotsBlockKey = Object.keys(values).find((k) => k.startsWith('time_slots_block_'));
        const timeSlots = values[timeSlotsBlockKey].time_slots.selected_options;

        const userId = body.user.id;
        const { channel } = JSON.parse(view.private_metadata);

        // 時間枠を見やすい文字列に変換
        const timeSlotsText = timeSlots.map((opt) => opt.text.text).join('\n• ');

        // 締め切り日時をフォーマット
        const deadlineDate = new Date(deadline * 1000);
        const deadlineText = deadlineDate.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });

        logger.info('========================================');
        logger.info('📅 日程調整が作成されました');
        logger.info(`  作成者: ${userId}`);
        logger.info(`  調整期間: ${startDate} 〜 ${endDate}`);
        logger.info(`  締め切り: ${deadlineText}`);
        logger.info(`  時間枠: ${timeSlots.map((o) => o.text.text).join(', ')}`);
        logger.info('========================================');

        // チャンネルに通知
        await client.chat.postMessage({
            channel: channel,
            blocks: [
                {
                    type: 'header',
                    text: {
                        type: 'plain_text',
                        text: '📅 日程調整が作成されました',
                    },
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*作成者:*\n<@${userId}>`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*調整期間:*\n${startDate} 〜 ${endDate}`,
                        },
                    ],
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*回答締め切り:*\n${deadlineText}`,
                        },
                        {
                            type: 'mrkdwn',
                            text: `*候補時間帯:*\n• ${timeSlotsText}`,
                        },
                    ],
                },
                { type: 'divider' },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: '📝 上記の時間帯で都合の良い日程を回答してください。',
                        },
                    ],
                },
            ],
            text: `📅 日程調整が作成されました（${startDate} 〜 ${endDate}）`,
        });
    } catch (error) {
        logger.error('日程調整の通知に失敗しました:', error);
    }
};

module.exports = { viewHandler };
