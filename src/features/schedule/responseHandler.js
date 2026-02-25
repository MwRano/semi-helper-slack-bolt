const { saveResponse, getSchedule, markResultPosted, popRemindMessages } = require('./store');
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

        // 表示名を取得（ペイロードから取得してAPIエラー時も名前を表示できるようにする）
        let displayName = body.user.name || body.user.username || userId;
        try {
            const userInfo = await client.users.info({ user: userId });
            displayName =
                userInfo.user.profile.display_name ||
                userInfo.user.real_name ||
                userInfo.user.name;
        } catch (e) {
            logger.warn(`ユーザー情報の取得をスキップしました (名前: ${displayName})`);
        }

        // 保存
        saveResponse(scheduleId, userId, { slots, note, displayName });

        // --- ユーザーに送られたリマインド用DMを削除 ---
        const msgsToDelete = popRemindMessages(scheduleId, userId);
        if (msgsToDelete.length > 0) {
            for (const msg of msgsToDelete) {
                try {
                    await client.chat.delete({
                        channel: msg.channel,
                        ts: msg.ts,
                    });
                } catch (delErr) {
                    logger.warn(`リマインドメッセージの削除に失敗しました (channel:${msg.channel}, ts:${msg.ts}):`, delErr);
                }
            }
        }

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
        let notifyText = `✅ *${displayName}* が日程を回答しました（🟢${counts.available} 🟡${counts.maybe} 🔴${counts.unavailable}）`;
        if (note) {
            notifyText += `\n📝 *備考:* ${note}`;
        }
        await client.chat.postMessage({
            channel: schedule.channelId,
            thread_ts: schedule.threadTs,
            text: notifyText,
        });

        // 全員が回答したかチェック
        if (!schedule.resultPosted) {
            try {
                // チャンネルのメンバーを取得
                const channelMembersRes = await client.conversations.members({
                    channel: schedule.channelId,
                });
                // botは除く必要があればここでフィルタリング等を行いますが、
                // 一旦「チャンネルにいるユーザーのリスト」と「回答したユーザーのリスト」を比較

                // botユーザー情報を取得（自分自身を除外するため）
                const botInfo = await client.auth.test();
                const botUserId = botInfo.user_id;

                const members = channelMembersRes.members.filter(id => id !== botUserId);
                const respondedUsers = Object.keys(schedule.responses);

                // メンバーが全員回答済みかチェック
                const allResponded = members.every(memberId => respondedUsers.includes(memberId));

                if (allResponded) {
                    logger.info(`🎉 チャンネルメンバー全員（${members.length}名）が回答しました。結果を投稿します。`);

                    // スレッド上で作成者にメンションし、ファイル自体をアップロードする
                    try {
                        const { generateCSV, generatePDF } = require('./resultViews');
                        const { getBusySlots } = require('./googleCalendarService');
                        const busySlots = schedule.includeTeacher !== false
                            ? await getBusySlots(schedule.startDate, schedule.endDate, schedule.timeSlots)
                            : {};
                        const csvContent = generateCSV(scheduleId, busySlots);
                        const pdfBuffer = generatePDF(scheduleId, busySlots);

                        try {
                            await client.files.uploadV2({
                                channel_id: schedule.channelId,
                                thread_ts: schedule.threadTs,
                                file: pdfBuffer,
                                filename: `schedule_result.pdf`,
                                title: '📅 日程調整 結果一覧 (PDF)',
                                initial_comment: `<@${schedule.creatorId}> 対象メンバー全員（${members.length}名）の回答が完了しました！\nこちらのPDFで結果一覧の表をご確認いただけます。`
                            });

                            await client.files.uploadV2({
                                channel_id: schedule.channelId,
                                thread_ts: schedule.threadTs,
                                content: "\uFEFF" + csvContent, // BOMを追加してExcelでの文字化けを防止
                                filename: `schedule_result.csv`,
                                title: '📅 日程調整 結果一覧 (CSV)'
                            });
                        } catch (uploadErr) {
                            logger.warn('ファイルアップロード(V2)に失敗しました', uploadErr);

                            // スコープ不足エラーの時
                            if (uploadErr.data && uploadErr.data.error === 'missing_scope') {
                                await client.chat.postMessage({
                                    channel: schedule.channelId,
                                    thread_ts: schedule.threadTs,
                                    text: `<@${schedule.creatorId}> 対象メンバー全員の回答が完了しましたが、ファイルのアップロードに失敗しました。\n⚠️ Slackアプリの設定画面 (OAuth & Permissions) にて \`files:write\` スコープを追加し、ワークスペースに再インストールしてください。`
                                });
                            }
                        }
                    } catch (notifyErr) {
                        logger.error('ファイルのアップロード（回答完了通知）に失敗しました:', notifyErr);
                    }

                    markResultPosted(scheduleId);

                    // スレッドの親メッセージ（フォーム）を更新してボタンを消す
                    try {
                        const deadlineDate = new Date(schedule.deadline * 1000);
                        const deadlineText = deadlineDate.toLocaleString('ja-JP', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                        });

                        await client.chat.update({
                            channel: schedule.channelId,
                            ts: schedule.threadTs,
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
                                        text: `*作成者:* ${schedule.creatorName ? schedule.creatorName : '<@' + schedule.creatorId + '>'}　|　*締め切り:* ${deadlineText}`,
                                    },
                                },
                                {
                                    type: 'context',
                                    elements: [
                                        {
                                            type: 'mrkdwn',
                                            text: '✅ 全員の回答が完了したため、受付を終了しました。\nスレッド内の添付ファイルをご確認ください。',
                                        },
                                    ],
                                },
                            ],
                            text: '📅 日程調整の受付が終了しました',
                        });
                    } catch (updateErr) {
                        logger.warn('親メッセージの更新（ボタン無効化）に失敗しました:', updateErr);
                    }

                    // チャンネルメンション用メッセージを削除する
                    if (schedule.channelMentionTs) {
                        try {
                            await client.chat.delete({
                                channel: schedule.channelId,
                                ts: schedule.channelMentionTs,
                            });
                        } catch (deleteErr) {
                            logger.warn('チャンネルメンション用メッセージの削除に失敗しました:', deleteErr);
                        }
                    }
                }
            } catch (err) {
                logger.error('全員回答のチェック中にエラーが発生しました:', err);
            }
        }
    } catch (error) {
        logger.error('回答の保存に失敗しました:', error);
    }
};

module.exports = { responseHandler };
