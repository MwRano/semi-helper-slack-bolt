const { getAllSchedules, markAsClosed } = require('./store');
const { generatePDF } = require('./resultViews');
const { getBusySlots } = require('./googleCalendarService');

/**
 * 「しめきり」メッセージを受信したときのハンドラー
 * 現在進行中の日程調整の最終結果（PDF）をスレッドに投稿し、受付を締め切る
 */
const closeMessageHandler = async ({ message, say, client, logger }) => {
    try {
        const channel = message.channel;
        const allSchedules = await getAllSchedules();
        let activeScheduleId = null;
        let activeSchedule = null;

        // 対象チャンネルで、まだ完了・終了していないスケジュールを探す
        for (const [id, schedule] of allSchedules.entries()) {
            if (schedule.channelId === channel && !schedule.resultPosted && !schedule.isClosed) {
                activeScheduleId = id;
                activeSchedule = schedule;
                break;
            }
        }

        if (!activeScheduleId) {
            await say({
                text: `<@${message.user}> 現在このチャンネルで進行中のゼミ日程調整はありません。`,
                thread_ts: message.ts
            });
            return;
        }

        logger.info(`🔒 締め切り要求を受信しました (スケジュール: ${activeScheduleId})`);

        // 先生の予定取得
        let busySlots = {};
        if (activeSchedule.includeTeacher !== false) {
            try {
                busySlots = await getBusySlots(activeSchedule.startDate, activeSchedule.endDate, activeSchedule.timeSlots);
            } catch (err) {
                logger.warn('先生の予定取得に失敗しました', err);
            }
        }

        // PDF生成
        const { pdfBuffer, notes } = generatePDF(activeSchedule, busySlots);

        // 現在の回答者数を計算
        const respondedCount = Object.keys(activeSchedule.responses || {}).length;

        let initialComment = `<@${message.user}> 日程調整を締め切りました🔒（最終回答者数: ${respondedCount}名）\n最終結果のPDFをご確認ください。`;
        if (notes && notes.length > 0) {
            initialComment += `\n\n*📝 備考まとめ*\n${notes.join('\n')}`;
        }

        // スレッドに最終結果PDFを投稿
        await client.files.uploadV2({
            channel_id: channel,
            thread_ts: activeSchedule.threadTs || message.ts,
            file: pdfBuffer,
            filename: `schedule_final_result_${activeSchedule.startDate}_${activeSchedule.endDate}.pdf`,
            title: `📅 ゼミ日程調整 最終結果 (${activeSchedule.startDate} 〜 ${activeSchedule.endDate})`,
            initial_comment: initialComment
        });

        // DBで受付を終了（is_closed = true, result_posted = true）
        await markAsClosed(activeScheduleId);
        logger.info(`🔒 スケジュール ${activeScheduleId} を締め切りました`);

        // 「📝 日程を入力する」ボタンが残らないよう、スレッド親メッセージをボタンなしに更新する
        if (activeSchedule.threadTs) {
            try {
                const deadlineDate = new Date(activeSchedule.deadline * 1000);
                const deadlineText = deadlineDate.toLocaleString('ja-JP', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                });

                await client.chat.update({
                    channel: channel,
                    ts: activeSchedule.threadTs,
                    blocks: [
                        {
                            type: 'header',
                            text: { type: 'plain_text', text: '📅 ゼミ日程調整' },
                        },
                        {
                            type: 'section',
                            text: {
                                type: 'mrkdwn',
                                text: `*作成者:* ${activeSchedule.creatorName || '<@' + activeSchedule.creatorId + '>'}　|　*締め切り:* ${deadlineText}`,
                            },
                        },
                        {
                            type: 'context',
                            elements: [
                                {
                                    type: 'mrkdwn',
                                    text: `🔒 <@${message.user}> によって日程調整が締め切られました。新規の回答受付は終了しています。`,
                                },
                            ],
                        },
                    ],
                    text: '📅 ゼミ日程調整の受付が終了しました',
                });
                logger.info(`🔒 スレッドのボタンを受付終了表示に更新しました`);
            } catch (updateErr) {
                logger.warn('スレッドメッセージの更新に失敗しました:', updateErr);
            }
        }

        // ユーザーが「しめきり」と打った場所と、PDFの投稿先スレッドが違う場合は返信する
        if (activeSchedule.threadTs && message.ts !== activeSchedule.threadTs) {
            let threadUrl = '';
            try {
                const permalinkInfo = await client.chat.getPermalink({
                    channel: channel,
                    message_ts: activeSchedule.threadTs
                });
                if (permalinkInfo.ok) {
                    threadUrl = permalinkInfo.permalink;
                }
            } catch (err) {
                logger.warn('パーマリンクの取得に失敗しました', err);
            }

            const replyText = threadUrl
                ? `<@${message.user}> 日程調整を締め切り、最終結果を元のスレッドに投稿しました🔒\n👉 ${threadUrl}`
                : `<@${message.user}> 日程調整を締め切り、最終結果を元のスレッドに投稿しました🔒`;

            await say({
                text: replyText,
                thread_ts: message.ts
            });
        }

    } catch (error) {
        logger.error('締め切り処理に失敗しました:', error);
        await say({
            text: `<@${message.user}> 締め切り処理中にエラーが発生しました。`,
            thread_ts: message.ts
        });
    }
};

module.exports = { closeMessageHandler };
