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
                        text: `<@${message.user}> \n📅 日程調整を開始します。\n下のボタンをクリックして、詳細を設定してください。\n\n*デフォルト設定:*\n• 調整期間: 来週月曜〜金曜\n• 締め切り: 2日後\n• 時間枠: 限ベース（1〜4限）\n• リマインド: 24時間前 / 1時間前\n• 先生の予定: 考慮する`,
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
            ],
            text: '📅 日程調整を開始します',
        });
    } catch (error) {
        logger.error('メッセージの送信に失敗しました:', error);
    }
};

module.exports = { messageHandler };
