const { saveSchedule, generateScheduleId, updateScheduleThreadTs } = require('./store');

/**
 * 日程調整モーダル送信時のハンドラー
 * → 入力値を保存し、チャンネルに通知する
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

        // リマインド時間を取得（設定されていない場合は空配列）
        const remindHoursOptions = values.remind_hours_block?.remind_hours?.selected_options || [];
        const remindHours = remindHoursOptions.map(opt => parseInt(opt.value, 10));

        // 先生の予定を考慮するか
        const includeTeacherOptions = values.include_teacher_block?.include_teacher?.selected_options || [];
        const includeTeacher = includeTeacherOptions.some(opt => opt.value === 'include_teacher');

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

        // スケジュールデータを保存
        const scheduleId = generateScheduleId();
        saveSchedule(scheduleId, {
            creatorId: userId,
            channelId: channel,
            startDate,
            endDate,
            deadline,
            timeSlots,
            remindHours,
            includeTeacher,
        });

        logger.info('========================================');
        logger.info('📅 日程調整が作成されました');
        logger.info(`  スケジュールID: ${scheduleId}`);
        logger.info(`  作成者: ${userId}`);
        logger.info(`  調整期間: ${startDate} 〜 ${endDate}`);
        logger.info(`  締め切り: ${deadlineText}`);
        logger.info(`  時間枠: ${timeSlots.map((o) => o.text.text).join(', ')}`);
        logger.info('========================================');

        // @channel メンション（スレッドとは分離して通知のみ）
        await client.chat.postMessage({
            channel: channel,
            text: `<!channel> 日程調整は下記からお願いします🙏`,
        });

        // チャンネルにスレッド親メッセージを投稿
        const result = await client.chat.postMessage({
            channel: channel,
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
                        text: `*作成者:* <@${userId}>　|　*締め切り:* ${deadlineText}`,
                    },
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: { type: 'plain_text', text: '📝 日程を入力する' },
                            action_id: 'open_response_modal',
                            value: scheduleId,
                            style: 'primary',
                        },
                    ],
                },
            ],
            text: `📅 日程調整が作成されました（${startDate} 〜 ${endDate}）`,
        });

        // スレッドのtsを保存
        if (result.ts) {
            updateScheduleThreadTs(scheduleId, result.ts);
        }
    } catch (error) {
        logger.error('日程調整の通知に失敗しました:', error);
    }
};

module.exports = { viewHandler };
