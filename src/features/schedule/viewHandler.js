const { saveSchedule, generateScheduleId, updateScheduleThreadTs, saveChannelMentionTs, getAllSchedules, markAsClosed, saveChannelSettings, clearChannelSettings } = require('./store');

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
        const { channel, messageTs } = JSON.parse(view.private_metadata);

        // モードの取得
        const selectedMode = values.time_slot_mode_block?.time_slot_mode?.selected_option?.value || 'period';

        const saveDefaultOptions = values.save_default_block?.save_default?.selected_options || [];
        const shouldSaveDefault = saveDefaultOptions.some(opt => opt.value === 'save_as_default');
        const shouldResetDefault = saveDefaultOptions.some(opt => opt.value === 'reset_default');

        if (shouldResetDefault) {
            clearChannelSettings(channel);
            logger.info(`🧹 チャンネル(${channel})のデフォルト設定をリセットしました。`);
        } else if (shouldSaveDefault) {
            // 現在日時からの差分を計算してデフォルト値として保存
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const todayParsed = new Date(`${todayStr}T00:00:00`);
            const startParsed = new Date(`${startDate}T00:00:00`);
            const endParsed = new Date(`${endDate}T00:00:00`);

            const startOffsetDays = Math.round((startParsed.getTime() - todayParsed.getTime()) / (1000 * 60 * 60 * 24));
            const endOffsetDays = Math.round((endParsed.getTime() - todayParsed.getTime()) / (1000 * 60 * 60 * 24));
            const deadLineOffsetHours = Math.round((deadline * 1000 - Date.now()) / (1000 * 60 * 60));

            saveChannelSettings(channel, {
                mode: selectedMode,
                timeSlots: timeSlots.map(opt => opt.value),
                remindHours: remindHours.map(String),
                includeTeacher,
                startOffsetDays,
                endOffsetDays,
                deadLineOffsetHours
            });
            logger.info(`💾 チャンネル(${channel})のデフォルト設定を保存しました。 (start+${startOffsetDays}d, end+${endOffsetDays}d, deadline+${deadLineOffsetHours}h)`);
        }

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

        // ペイロードに含まれるユーザー名を使用する（APIのスコープ不足エラーを回避）
        let creatorName = body.user.name || body.user.username || '不明なユーザー';

        try {
            // users:read スコープがあればより正確な表示名を取得可能
            const userInfo = await client.users.info({ user: userId });
            creatorName = userInfo.user.real_name || userInfo.user.name;
        } catch (e) {
            logger.warn(`ユーザー情報の取得をスキップしました (名前: ${creatorName})`);
        }

        // スケジュールデータを保存
        const scheduleId = generateScheduleId();
        saveSchedule(scheduleId, {
            creatorId: userId,
            creatorName: creatorName, // 名前も保存しておく
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
        logger.info(`  作成者: ${userId} (${creatorName})`);
        logger.info(`  調整期間: ${startDate} 〜 ${endDate}`);
        logger.info(`  締め切り: ${deadlineText}`);
        logger.info(`  時間枠: ${timeSlots.map((o) => o.text.text).join(', ')}`);
        logger.info('========================================');

        // 同じチャンネルにある未完了の過去の日程調整フォームを強制終了する
        const allSchedules = getAllSchedules();
        for (const [oldId, oldSchedule] of allSchedules.entries()) {
            if (oldId !== scheduleId && oldSchedule.channelId === channel && !oldSchedule.resultPosted && !oldSchedule.isClosed) {
                if (oldSchedule.threadTs) {
                    try {
                        const oldDeadlineDate = new Date(oldSchedule.deadline * 1000);
                        const oldDeadlineText = oldDeadlineDate.toLocaleString('ja-JP', {
                            year: 'numeric', month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                        });

                        await client.chat.update({
                            channel: oldSchedule.channelId,
                            ts: oldSchedule.threadTs,
                            blocks: [
                                {
                                    type: 'header',
                                    text: { type: 'plain_text', text: '📅 日程調整' },
                                },
                                {
                                    type: 'section',
                                    text: { type: 'mrkdwn', text: `*作成者:* ${oldSchedule.creatorName || '<@' + oldSchedule.creatorId + '>'}　|　*締め切り:* ${oldDeadlineText}` },
                                },
                                {
                                    type: 'context',
                                    elements: [
                                        {
                                            type: 'mrkdwn',
                                            text: `⚠️ 新しい日程調整が作成されたため、このフォームの受付は自動終了しました。`,
                                        },
                                    ],
                                },
                            ],
                            text: '📅 日程調整の受付が終了しました',
                        });
                        logger.info(`🔄 古い日程調整 (${oldId}) のボタンを自動無効化しました`);

                        // チャンネルメンション（リマインド用）があれば削除
                        if (oldSchedule.channelMentionTs) {
                            try {
                                await client.chat.delete({
                                    channel: oldSchedule.channelId,
                                    ts: oldSchedule.channelMentionTs,
                                });
                            } catch (delErr) {
                                logger.warn('古い通知メッセージの削除に失敗しました:', delErr);
                            }
                        }

                    } catch (updateErr) {
                        logger.error(`古い日程調整のメッセージ更新に失敗しました (${oldId}):`, updateErr);
                    }
                }
                markAsClosed(oldId);
            }
        }

        // @channel メンション（スレッドとは分離して通知のみ）
        const channelMentionMsg = await client.chat.postMessage({
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
                    type: 'context',
                    elements: [{
                        type: 'mrkdwn',
                        text:
                            `*作成者:* ${creatorName}　|　*締め切り:* ${deadlineText}\n*期間:* ${startDate} 〜 ${endDate} (${timeSlots.length}枠)　|　*先生の予定:* ${includeTeacher ? '考慮あり' : 'なし'}　|　*通知:* ${remindHours.length > 0 ? remindHours.map(h => h + '時間前').join('・') : 'なし'}\n*時間枠:* ${timeSlots.map(o => o.text.text).join(' / ')}`
                    },
                    ],
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

        // チャンネルメンション用メッセージのtsも保存（あとで削除するため）
        if (channelMentionMsg.ts) {
            saveChannelMentionTs(scheduleId, channelMentionMsg.ts);
        }

        // 元のボタンメッセージを更新（無効化）
        if (messageTs) {
            try {
                await client.chat.update({
                    channel: channel,
                    ts: messageTs,
                    blocks: [
                        {
                            type: 'context',
                            elements: [
                                {
                                    type: 'mrkdwn',
                                    text: `✅ ${creatorName} によって日程調整フォームが作成されました。`,
                                },
                            ],
                        },
                    ],
                    text: '📅 日程調整が作成されました',
                });
            } catch (updateError) {
                logger.warn('元のメッセージの更新に失敗しました:', updateError);
            }
        }
    } catch (error) {
        logger.error('日程調整の通知に失敗しました:', error);
    }
};

module.exports = { viewHandler };
