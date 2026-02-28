const { getChannelSettings } = require('./store');

/**
 * 「ゼミ日程調整」を含むメッセージを受信したときのハンドラー
 * → ボタン付きメッセージを返す（ボタンクリックでモーダルを開く）
 */
const messageHandler = async ({ message, say, logger }) => {
    try {
        logger.info('========================================');
        logger.info('📅 ゼミ日程調整コマンドを受信しました');
        logger.info(`  ユーザー: ${message.user}`);
        logger.info(`  チャンネル: ${message.channel}`);
        logger.info('========================================');

        const settings = await getChannelSettings(message.channel);
        let defaultText = 'デフォルト: 来週月〜金 / 1〜4限 / 締切2日後 / 通知24h・1h前 / 先生の予定考慮';

        if (settings) {
            const startStr = settings.startOffsetDays !== undefined ? `+${settings.startOffsetDays}日` : '来週月';
            const endStr = settings.endOffsetDays !== undefined ? `+${settings.endOffsetDays}日` : '来週金';
            const modeStr = settings.mode === 'time' ? '時間ベース' : '限ベース';
            let slotsStr = '指定枠';
            if (settings.timeSlots?.length > 0) {
                if (settings.mode === 'period') {
                    slotsStr = settings.timeSlots.map(s => s + '限').join('・');
                } else {
                    slotsStr = `${settings.timeSlots.length}枠`;
                }
            }
            const deadlineStr = settings.deadLineOffsetHours !== undefined ? `締切${Math.round(settings.deadLineOffsetHours / 24)}日後` : '締切+2日';
            const remindStr = settings.remindHours?.length > 0 ? `通知${settings.remindHours.join('・')}h前` : '通知なし';
            const teacherStr = settings.includeTeacher ? '先生の予定考慮あり' : '先生の予定考慮なし';

            defaultText = `📝 チャンネル設定適用中: 期間(${startStr}〜${endStr}) / ${modeStr}(${slotsStr}) / ${deadlineStr} / ${remindStr} / ${teacherStr}`;
        }

        await say({
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${message.user}> 下記のボタンを押してゼミ日程調整フォームを作成してください。`,
                    },
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '📅 ゼミ日程調整フォーム作成' },
                            action_id: 'open_schedule_modal',
                            style: 'primary',
                        },
                    ],
                },
                {
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: defaultText,
                        },
                    ],
                },
            ],
            text: '📅 ゼミ日程調整を開始します',
        });
    } catch (error) {
        logger.error('メッセージの送信に失敗しました:', error);
    }
};

module.exports = { messageHandler };
