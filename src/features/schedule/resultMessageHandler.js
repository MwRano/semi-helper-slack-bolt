const { getAllSchedules } = require('./store');
const { generatePDF } = require('./resultViews');
const { getBusySlots } = require('./googleCalendarService');

/**
 * 「けっか」メッセージを受信したときのハンドラー
 * 現在進行中の日程調整の途中結果（PDF）をスレッドに投稿する
 */
const resultMessageHandler = async ({ message, say, client, logger }) => {
    try {
        const channel = message.channel;
        const allSchedules = getAllSchedules();
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

        logger.info(`📊 途中結果の要求を受信しました (スケジュール: ${activeScheduleId})`);

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
        const { pdfBuffer, notes } = generatePDF(activeScheduleId, busySlots);

        // 現在の回答者数を計算
        const respondedCount = Object.keys(activeSchedule.responses || {}).length;

        let initialComment = `<@${message.user}> 現在の回答状況です（途中経過: ${respondedCount}名回答済み）📊\nこちらのPDFで結果をご確認いただけます。`;
        if (notes && notes.length > 0) {
            initialComment += `\n\n*📝 備考まとめ*\n${notes.join('\n')}`;
        }

        // メッセージまたはスレッドにファイルを投稿
        await client.files.uploadV2({
            channel_id: channel,
            thread_ts: activeSchedule.threadTs || message.ts,
            file: pdfBuffer,
            filename: `schedule_intermediate_result_${activeSchedule.startDate}_${activeSchedule.endDate}.pdf`,
            title: `📅 ゼミ日程調整 途中経過 (${activeSchedule.startDate} 〜 ${activeSchedule.endDate})`,
            initial_comment: initialComment
        });

        // ユーザーが「ちょうせいけっか（けっか）」と打った場所と、PDFの投稿先スレッドが違う場合は返信する
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
                ? `<@${message.user}> 元の調整スレッドに途中経過を投稿しました！\n👉 ${threadUrl}`
                : `<@${message.user}> 元の調整スレッドに途中経過を投稿しました！`;

            await say({
                text: replyText,
                thread_ts: message.ts
            });
        }

    } catch (error) {
        logger.error('途中結果の送信に失敗しました:', error);
        await say({
            text: `<@${message.user}> 途中結果の取得中にエラーが発生しました。`,
            thread_ts: message.ts
        });
    }
};

module.exports = { resultMessageHandler };
