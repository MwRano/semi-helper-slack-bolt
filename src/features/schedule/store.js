/**
 * 日程調整データのインメモリストア
 * TODO: 将来的にはDBに移行する
 */
const schedules = new Map();

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

module.exports = {
    saveSchedule,
    getSchedule,
    saveResponse,
    generateScheduleId,
    getAllSchedules,
    markResultPosted,
    markRemindedHour,
    updateScheduleThreadTs,
};
