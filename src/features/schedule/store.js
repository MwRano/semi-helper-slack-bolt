/**
 * 日程調整データのインメモリストア
 * TODO: 将来的にはDBに移行する
 */
const schedules = new Map();

/**
 * チャンネルごとの設定データ（デフォルト値）のストア
 */
const channelSettings = new Map();

/**
 * チャンネルごとの設定を保存
 * @param {string} channelId 
 * @param {Object} settings 
 */
function saveChannelSettings(channelId, settings) {
    channelSettings.set(channelId, settings);
}

/**
 * チャンネルごとの設定を取得
 * @param {string} channelId 
 * @returns {Object|undefined}
 */
function getChannelSettings(channelId) {
    return channelSettings.get(channelId);
}

/**
 * チャンネルごとの設定をクリア（デフォルトに戻す）
 * @param {string} channelId 
 */
function clearChannelSettings(channelId) {
    channelSettings.delete(channelId);
}

/**
 * スケジュールを保存
 * @param {string} id - スケジュールID
 * @param {Object} data - スケジュールデータ
 */
function saveSchedule(id, data) {
    schedules.set(id, {
        remindHours: [24, 1], // 互換性のためデフォルトを設定
        ...data,
        createdAt: new Date().toISOString(),
        responses: {},
        resultPosted: false,
        remindedHours: [],
    });
}

/**
 * スケジュールを取得
 * @param {string} id
 * @returns {Object|undefined}
 */
function getSchedule(id) {
    return schedules.get(id);
}

/**
 * メンバーの回答を保存
 * @param {string} scheduleId
 * @param {string} userId
 * @param {Object} responseData - { slots: {...}, note: '' }
 */
function saveResponse(scheduleId, userId, responseData) {
    const schedule = schedules.get(scheduleId);
    if (schedule) {
        schedule.responses[userId] = {
            ...responseData,
            respondedAt: new Date().toISOString(),
        };
    }
}

/**
 * ユニークなスケジュールIDを生成
 */
function generateScheduleId() {
    return `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 全スケジュールを取得
 */
function getAllSchedules() {
    return schedules;
}

/**
 * 結果投稿済みフラグをセット
 */
function markResultPosted(scheduleId) {
    const schedule = schedules.get(scheduleId);
    if (schedule) {
        schedule.resultPosted = true;
    }
}

/**
 * 手動または自動で受付を終了したフラグをセット
 */
function markAsClosed(scheduleId) {
    const schedule = schedules.get(scheduleId);
    if (schedule) {
        schedule.resultPosted = true; // クーロンなどの処理を行わせないため
        schedule.isClosed = true;
    }
}

/**
 * 指定した時間のリマインド済みフラグをセット
 */
function markRemindedHour(scheduleId, hour) {
    const schedule = schedules.get(scheduleId);
    if (schedule && !schedule.remindedHours.includes(hour)) {
        schedule.remindedHours.push(hour);
    }
}

/**
 * チャンネルのメッセージタイムスタンプ(threadTs)を保存
 * @param {string} id 
 * @param {string} threadTs 
 */
function updateScheduleThreadTs(id, threadTs) {
    const schedule = schedules.get(id);
    if (schedule) {
        schedule.threadTs = threadTs;
    }
}

/**
 * チャンネルメンション用メッセージのタイムスタンプを保存
 * @param {string} id 
 * @param {string} ts 
 */
function saveChannelMentionTs(id, ts) {
    const schedule = schedules.get(id);
    if (schedule) {
        schedule.channelMentionTs = ts;
    }
}

/**
 * 締め切り超過後のリマインド済み日数をセット
 * @param {string} scheduleId 
 * @param {number} day 
 */
function markOverdueRemindedDay(scheduleId, day) {
    const schedule = schedules.get(scheduleId);
    if (schedule) {
        if (!schedule.overdueRemindedDays) {
            schedule.overdueRemindedDays = [];
        }
        if (!schedule.overdueRemindedDays.includes(day)) {
            schedule.overdueRemindedDays.push(day);
        }
    }
}

/**
 * リマインドメッセージのタイムスタンプを保存（あとで削除するため）
 */
function addRemindMessage(scheduleId, userId, channel, ts) {
    const schedule = schedules.get(scheduleId);
    if (schedule) {
        if (!schedule.remindMessages) schedule.remindMessages = {};
        if (!schedule.remindMessages[userId]) schedule.remindMessages[userId] = [];
        schedule.remindMessages[userId].push({ channel, ts });
    }
}

/**
 * 送信済みのリマインドメッセージ一覧を取得し、リストからクリアする
 */
function popRemindMessages(scheduleId, userId) {
    const schedule = schedules.get(scheduleId);
    if (schedule && schedule.remindMessages && schedule.remindMessages[userId]) {
        const msgs = schedule.remindMessages[userId];
        delete schedule.remindMessages[userId];
        return msgs;
    }
    return [];
}

module.exports = {
    saveSchedule,
    getSchedule,
    saveResponse,
    generateScheduleId,
    getAllSchedules,
    markResultPosted,
    markAsClosed,
    markRemindedHour,
    updateScheduleThreadTs,
    saveChannelMentionTs,
    markOverdueRemindedDay,
    addRemindMessage,
    popRemindMessages,
    saveChannelSettings,
    getChannelSettings,
    clearChannelSettings,
};
