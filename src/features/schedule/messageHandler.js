/**
 * 「日程調整」を含むメッセージを受信したときのハンドラー
 * → ボタン付きメッセージを返す（ボタンクリックでモーダルを開く）
 */
const messageHandler = async ({ message, client, logger }) => {
    try {
        logger.info('========================================');
        logger.info('📅 日程調整コマンドを受信しました');
        logger.info(`  ユーザー: ${message.user}`);
        logger.info(`  チャンネル: ${message.channel}`);
        logger.info('========================================');

        await client.chat.postEphemeral({
            channel: message.channel,
            user: message.user,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `<@${message.user}> \n📅 日程調整を開始します。\n下のボタンをクリックして、詳細を設定してください。`,
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
