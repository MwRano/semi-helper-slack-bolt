const { getAllSchedules, getSchedule, markResultPosted, markRemindedHour, markOverdueRemindedDay, addRemindMessage } = require('./store');

// メモリ上で管理するタイマーのID一覧 (キー: scheduleId_type)
const timers = new Map();

/**
 * 締め切りチェックとリマインドのタイマーを初期化する
 * アプリ起動時に未完了のスケジュールを全て取得し、必要なタイマーをセットする
 * @param {import('@slack/bolt').App} app
 */
async function startDeadlineChecker(app) {
    app.logger.info('⏰ 締め切りチェッカーを開始しました（タイマー駆動方式）');

    try {
        const schedules = await getAllSchedules();
        app.logger.info(`  -> ${schedules.size}件のアクティブなスケジュールが復元されました`);
        for (const [scheduleId, schedule] of schedules) {
            await scheduleRemindersFor(app, scheduleId, schedule);
        }
    } catch (error) {
        app.logger.error('スケジュールの初期化中にエラーが発生しました:', error);
    }
}

/**
 * 特定のスケジュールに対するリマインドタイマーを設定する
 * 新規スケジュール作成時などにも呼び出される
 * @param {import('@slack/bolt').App} app
 * @param {string} scheduleId
 * @param {Object} [scheduleData] - 省略時はDBから取得
 */
async function scheduleRemindersFor(app, scheduleId, scheduleData) {
    const schedule = scheduleData || await getSchedule(scheduleId);

    if (!schedule || schedule.resultPosted || schedule.isClosed) {
        return; // 既に終了している場合は何もしない
    }

    const now = Math.floor(Date.now() / 1000); // 現在時刻(Unix Timestamp:秒)

    // ----- 1. 締め切り前のリマインドタイマーセット -----
    const remindHours = schedule.remindHours || [24, 1];
    const remindedHours = schedule.remindedHours || [];

    for (const hour of remindHours) {
        if (remindedHours.includes(hour)) continue; // 既に送信済みならスキップ

        const remindTime = schedule.deadline - (hour * 60 * 60);
        const delayMs = (remindTime - now) * 1000;

        if (delayMs > 0) {
            // 未来の時間ならタイマーをセット
            setScheduleTimer(app, scheduleId, `remind_${hour}`, delayMs, async () => {
                await processRemind(app, scheduleId, hour);
            });
        } else {
            // アプリ停止などの理由で既に時間が過ぎていて未送信なら即座に送信
            await processRemind(app, scheduleId, hour);
        }
    }

    // ----- 2. 締め切り超過後の定期リマインドタイマーセット -----
    // 例として7日（1週間）後まで追跡してリマインドする
    const overdueRemindedDays = schedule.overdueRemindedDays || [];
    for (let overdueDays = 0; overdueDays <= 7; overdueDays++) {
        if (overdueRemindedDays.includes(overdueDays)) continue;

        const overdueTime = schedule.deadline + (overdueDays * 24 * 60 * 60);
        const delayMs = (overdueTime - now) * 1000;

        if (delayMs > 0) {
            setScheduleTimer(app, scheduleId, `overdue_${overdueDays}`, delayMs, async () => {
                await processOverdueRemind(app, scheduleId, overdueDays);
            });
        } else {
            // アプリ起動時に既に超過していた場合
            await processOverdueRemind(app, scheduleId, overdueDays);
        }
    }
}

/**
 * 内部タイマー管理ユーティリティ
 */
function setScheduleTimer(app, scheduleId, type, delayMs, callback) {
    const key = `${scheduleId}_${type}`;

    // 既存の同じタイマーがあればクリア
    if (timers.has(key)) {
        clearTimeout(timers.get(key));
    }

    // Node.jsのsetTimeoutは最大値(約24.8日: 2147483647ms)がある
    const MAX_TIMEOUT = 2147483647;
    let actualDelay = delayMs;

    if (actualDelay > MAX_TIMEOUT) {
        // 先すぎる場合は、いったん最大値でスリープしてから再計算する
        actualDelay = MAX_TIMEOUT;
        app.logger.info(`⏳ タイマー設定: ${key} は長すぎるため上限値(${actualDelay}ms)で分割します`);
        const timerId = setTimeout(() => {
            scheduleRemindersFor(app, scheduleId);
        }, actualDelay);
        timers.set(key, timerId);
        return;
    }

    const timeoutDate = new Date(Date.now() + actualDelay);
    app.logger.info(`⏳ タイマー予約: ${key} -> 発火予定: ${timeoutDate.toLocaleString()} (約${Math.round(actualDelay / 1000 / 60)}分後)`);

    const timerId = setTimeout(async () => {
        timers.delete(key);
        try {
            await callback();
            // タイマー発火後、念のため後続のタイマー設定を再計算する
            await scheduleRemindersFor(app, scheduleId);
        } catch (error) {
            app.logger.error(`タイマー実行エラー (${key}):`, error);
        }
    }, actualDelay);

    // プロセス終了をブロックしないようにする（可能であれば）
    if (timerId.unref) {
        timerId.unref();
    }

    timers.set(key, timerId);
}

/**
 * リマインド本体の処理
 */
async function processRemind(app, scheduleId, hour) {
    const schedule = await getSchedule(scheduleId);
    if (!schedule || schedule.resultPosted || schedule.isClosed) return; // DBを見て既に終了していればやめる

    const remindedHours = schedule.remindedHours || [];
    if (remindedHours.includes(hour)) return; // 既に送信済みならやめる

    try {
        const channelMembersRes = await app.client.conversations.members({
            channel: schedule.channelId,
        });

        const botInfo = await app.client.auth.test();
        const botUserId = botInfo.user_id;

        const respondedUsers = Object.keys(schedule.responses || {});
        const unrespondedMembers = channelMembersRes.members.filter(
            (id) => id !== botUserId && !respondedUsers.includes(id)
        );

        if (unrespondedMembers.length > 0) {
            const permalinkRes = await app.client.chat.getPermalink({
                channel: schedule.channelId,
                message_ts: schedule.threadTs
            });
            const permalink = permalinkRes.permalink;

            for (const userId of unrespondedMembers) {
                const res = await app.client.chat.postMessage({
                    channel: userId,
                    text: `🔔 *リマインド*\n<@${userId}>\n締め切りまで残り約${hour}時間となりました。\n<${permalink}|こちらのメッセージ>から日程のご回答をお願いします！`,
                });
                await addRemindMessage(scheduleId, userId, res.channel, res.ts);
            }
            app.logger.info(`🔔 リマインドを送信しました: ${scheduleId} (${hour}時間前, ${unrespondedMembers.length}名へ)`);
        }

        await markRemindedHour(scheduleId, hour);
    } catch (error) {
        app.logger.error(`リマインド処理に失敗しました (${scheduleId}):`, error);
    }
}

/**
 * 締め切り超過後リマインド本体の処理
 */
async function processOverdueRemind(app, scheduleId, overdueDays) {
    const schedule = await getSchedule(scheduleId);
    if (!schedule || schedule.resultPosted || schedule.isClosed) return;

    const overdueRemindedDays = schedule.overdueRemindedDays || [];
    if (overdueRemindedDays.includes(overdueDays)) return;

    try {
        const channelMembersRes = await app.client.conversations.members({
            channel: schedule.channelId,
        });

        const botInfo = await app.client.auth.test();
        const botUserId = botInfo.user_id;

        const respondedUsers = Object.keys(schedule.responses || {});
        const unrespondedMembers = channelMembersRes.members.filter(
            (id) => id !== botUserId && !respondedUsers.includes(id)
        );

        if (unrespondedMembers.length > 0) {
            const permalinkRes = await app.client.chat.getPermalink({
                channel: schedule.channelId,
                message_ts: schedule.threadTs
            });
            const permalink = permalinkRes.permalink;

            for (const userId of unrespondedMembers) {
                const textMessage = overdueDays === 0
                    ? `⚠️ *未回答リマインド*\n<@${userId}>\nゼミ日程調整の締め切りを過ぎました。\n<${permalink}|こちらのメッセージ>から日程のご回答をお願いします🙏`
                    : `⚠️ *未回答リマインド*\n<@${userId}>\nゼミ日程調整の締め切りを過ぎています（${overdueDays}日経過）。\n<${permalink}|こちらのメッセージ>から日程のご回答をお願いします🙏`;

                const res = await app.client.chat.postMessage({
                    channel: userId,
                    text: textMessage,
                });
                await addRemindMessage(scheduleId, userId, res.channel, res.ts);
            }
            app.logger.info(`⚠️ 超過リマインドを送信しました: ${scheduleId} (${overdueDays}日経過, ${unrespondedMembers.length}名へ)`);
        }

        await markOverdueRemindedDay(scheduleId, overdueDays);
    } catch (error) {
        app.logger.error(`超過リマインド処理に失敗しました (${scheduleId}):`, error);
    }
}

module.exports = { startDeadlineChecker, scheduleRemindersFor };
