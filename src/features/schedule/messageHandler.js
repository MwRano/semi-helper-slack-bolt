/**
 * 「日程調整」を含むメッセージを受信したときのハンドラー
 * → ボタン付きメッセージを返す（ボタンクリックでモーダルを開く）
 */
const messageHandler = async ({ message, say, logger }) => {
    try {
        logger.info('========================================');
        logger.info('📅 日程調整コマンドを受信しました');
        logger.info(`  ユーザー: ${message.user}`);
        logger.info(`  チャンネル: ${message.channel}`);
        logger.info('========================================');

        await say({
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${message.user}> \n📅 日程調整を開始します。`,
                    },
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '📅 日程調整を設定する' },
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
                            text: 'デフォルト: 来週月〜金 / 1〜4限 / 締切2日後 / リマインド24h・1h前 / 先生の予定考慮',
                        },
                    ],
                },
            ],
            text: '📅 日程調整を開始します',
        });
    } catch (error) {
        logger.error('メッセージの送信に失敗しました:', error);
    }
};

module.exports = { messageHandler };
