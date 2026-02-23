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
        ...data,
        createdAt: new Date().toISOString(),
        responses: {},  // { userId: { slots: {...}, note: '' } }
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

module.exports = { saveSchedule, getSchedule, saveResponse, generateScheduleId };
