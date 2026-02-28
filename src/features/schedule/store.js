/**
 * ゼミ日程調整データのPostgreSQLストア
 */
const { pool } = require('../../db/client');

/**
 * DBの行をスケジュールオブジェクト（camelCase）に変換
 * @param {Object} row
 * @returns {Object|undefined}
 */
function mapRowToSchedule(row) {
    if (!row) return undefined;
    return {
        id: row.id,
        creatorId: row.creator_id,
        creatorName: row.creator_name,
        channelId: row.channel_id,
        startDate: row.start_date,
        endDate: row.end_date,
        deadline: Number(row.deadline),
        timeSlots: row.time_slots || [],
        remindHours: row.remind_hours || [],
        includeTeacher: row.include_teacher,
        responses: row.responses || {},
        resultPosted: row.result_posted,
        isClosed: row.is_closed,
        remindedHours: row.reminded_hours || [],
        overdueRemindedDays: row.overdue_reminded_days || [],
        threadTs: row.thread_ts,
        channelMentionTs: row.channel_mention_ts,
        remindMessages: row.remind_messages || {},
        createdAt: row.created_at,
    };
}

/**
 * スケジュールを保存
 * @param {string} id - スケジュールID
 * @param {Object} data - スケジュールデータ
 */
async function saveSchedule(id, data) {
    await pool.query(
        `INSERT INTO schedules (
            id, creator_id, creator_name, channel_id,
            start_date, end_date, deadline,
            time_slots, remind_hours, include_teacher,
            responses, result_posted, is_closed,
            reminded_hours, overdue_reminded_days, remind_messages,
            created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())`,
        [
            id,
            data.creatorId,
            data.creatorName || null,
            data.channelId,
            data.startDate,
            data.endDate,
            data.deadline,
            JSON.stringify(data.timeSlots || []),
            data.remindHours || [24, 1],
            data.includeTeacher !== false,
            JSON.stringify({}),
            false,
            false,
            [],
            [],
            JSON.stringify({}),
        ]
    );
}

/**
 * スケジュールを取得
 * @param {string} id
 * @returns {Promise<Object|undefined>}
 */
async function getSchedule(id) {
    const result = await pool.query('SELECT * FROM schedules WHERE id = $1', [id]);
    return mapRowToSchedule(result.rows[0]);
}

/**
 * メンバーの回答を保存
 * @param {string} scheduleId
 * @param {string} userId
 * @param {Object} responseData - { slots: {...}, note: '', displayName: '' }
 */
async function saveResponse(scheduleId, userId, responseData) {
    const responseWithTimestamp = {
        ...responseData,
        respondedAt: new Date().toISOString(),
    };
    await pool.query(
        `UPDATE schedules
         SET responses = responses || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify({ [userId]: responseWithTimestamp }), scheduleId]
    );
}

/**
 * ユニークなスケジュールIDを生成（同期・DB不要）
 */
function generateScheduleId() {
    return `sch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * アクティブな（未終了）スケジュールを全て取得し、Map として返す
 * @returns {Promise<Map<string, Object>>}
 */
async function getAllSchedules() {
    const result = await pool.query(
        'SELECT * FROM schedules WHERE result_posted = false AND is_closed = false'
    );
    const map = new Map();
    for (const row of result.rows) {
        map.set(row.id, mapRowToSchedule(row));
    }
    return map;
}

/**
 * 結果投稿済みフラグをセット
 */
async function markResultPosted(scheduleId) {
    await pool.query(
        'UPDATE schedules SET result_posted = true WHERE id = $1',
        [scheduleId]
    );
}

/**
 * 手動または自動で受付を終了したフラグをセット
 */
async function markAsClosed(scheduleId) {
    await pool.query(
        'UPDATE schedules SET result_posted = true, is_closed = true WHERE id = $1',
        [scheduleId]
    );
}

/**
 * 指定した時間のリマインド済みフラグをセット
 */
async function markRemindedHour(scheduleId, hour) {
    await pool.query(
        `UPDATE schedules
         SET reminded_hours = array_append(reminded_hours, $1)
         WHERE id = $2 AND NOT ($1 = ANY(reminded_hours))`,
        [hour, scheduleId]
    );
}

/**
 * チャンネルのメッセージタイムスタンプ(threadTs)を保存
 */
async function updateScheduleThreadTs(id, threadTs) {
    await pool.query(
        'UPDATE schedules SET thread_ts = $1 WHERE id = $2',
        [threadTs, id]
    );
}

/**
 * チャンネルメンション用メッセージのタイムスタンプを保存
 */
async function saveChannelMentionTs(id, ts) {
    await pool.query(
        'UPDATE schedules SET channel_mention_ts = $1 WHERE id = $2',
        [ts, id]
    );
}

/**
 * 締め切り超過後のリマインド済み日数をセット
 */
async function markOverdueRemindedDay(scheduleId, day) {
    await pool.query(
        `UPDATE schedules
         SET overdue_reminded_days = array_append(overdue_reminded_days, $1)
         WHERE id = $2 AND NOT ($1 = ANY(overdue_reminded_days))`,
        [day, scheduleId]
    );
}

/**
 * リマインドメッセージのタイムスタンプを保存（あとで削除するため）
 */
async function addRemindMessage(scheduleId, userId, channel, ts) {
    await pool.query(
        `UPDATE schedules
         SET remind_messages = jsonb_set(
             remind_messages,
             ARRAY[$1],
             COALESCE(remind_messages->$1, '[]'::jsonb) || $2::jsonb,
             true
         )
         WHERE id = $3`,
        [userId, JSON.stringify([{ channel, ts }]), scheduleId]
    );
}

/**
 * 送信済みのリマインドメッセージ一覧を取得し、リストからクリアする（トランザクション）
 */
async function popRemindMessages(scheduleId, userId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const selectResult = await client.query(
            'SELECT remind_messages->$1 AS msgs FROM schedules WHERE id = $2',
            [userId, scheduleId]
        );
        const msgs = selectResult.rows[0]?.msgs || [];
        await client.query(
            'UPDATE schedules SET remind_messages = remind_messages - $1 WHERE id = $2',
            [userId, scheduleId]
        );
        await client.query('COMMIT');
        return msgs;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

/**
 * チャンネルごとの設定を保存
 */
async function saveChannelSettings(channelId, settings) {
    await pool.query(
        `INSERT INTO channel_settings (channel_id, settings, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (channel_id) DO UPDATE
         SET settings = $2, updated_at = NOW()`,
        [channelId, JSON.stringify(settings)]
    );
}

/**
 * チャンネルごとの設定を取得
 * @param {string} channelId
 * @returns {Promise<Object|null>}
 */
async function getChannelSettings(channelId) {
    const result = await pool.query(
        'SELECT settings FROM channel_settings WHERE channel_id = $1',
        [channelId]
    );
    return result.rows[0]?.settings || null;
}

/**
 * チャンネルごとの設定をクリア（デフォルトに戻す）
 */
async function clearChannelSettings(channelId) {
    await pool.query(
        'DELETE FROM channel_settings WHERE channel_id = $1',
        [channelId]
    );
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
