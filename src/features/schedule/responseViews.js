const { getSchedule } = require('./store');

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * ◯ △ ✕ の選択肢
 */
const AVAILABILITY_OPTIONS = [
    { text: { type: 'plain_text', text: '🟢 参加可能' }, value: 'available' },
    { text: { type: 'plain_text', text: '🟡 未定' }, value: 'maybe' },
    { text: { type: 'plain_text', text: '🔴 参加不可' }, value: 'unavailable' },
];

/** デフォルト: ◯ 参加可能 */
const DEFAULT_OPTION = AVAILABILITY_OPTIONS[0];

/**
 * 開始日〜終了日の平日リストを生成
 */
function getWeekdaysBetween(startDateStr, endDateStr) {
    const dates = [];
    const current = new Date(startDateStr + 'T00:00:00');
    const end = new Date(endDateStr + 'T00:00:00');

    while (current <= end) {
        const day = current.getDay();
        if (day >= 1 && day <= 5) {
            const m = current.getMonth() + 1;
            const d = current.getDate();
            dates.push({
                dateStr: `${current.getFullYear()}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
                label: `${m}/${d}(${WEEKDAYS_JA[day]})`,
            });
        }
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

/**
 * 回答用モーダルのビュー定義を生成
 * @param {string} scheduleId - スケジュールID
 * @returns {Object|null} Block Kit の view オブジェクト
 */
async function buildResponseModalView(scheduleId) {
    const schedule = await getSchedule(scheduleId);
    if (!schedule) return null;

    const { startDate, endDate, timeSlots } = schedule;
    const weekdays = getWeekdaysBetween(startDate, endDate);

    const blocks = [];

    // ヘッダー情報
    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: `*調整期間:* ${startDate} 〜 ${endDate}\n各日程・時間帯ごとに参加可否を選択してください。`,
        },
    });
    blocks.push({ type: 'divider' });

    // 日付ごとにセクションを生成
    for (const day of weekdays) {
        // 日付ヘッダー
        blocks.push({
            type: 'header',
            text: { type: 'plain_text', text: `📅 ${day.label}` },
        });

        // 各時間枠の選択
        for (const slot of timeSlots) {
            blocks.push({
                type: 'input',
                block_id: `resp_${day.dateStr}_${slot.value}`,
                element: {
                    type: 'static_select',
                    action_id: 'availability',
                    options: AVAILABILITY_OPTIONS,
                    initial_option: DEFAULT_OPTION,
                },
                label: { type: 'plain_text', text: slot.text.text },
            });
        }

        blocks.push({ type: 'divider' });
    }

    // 備考欄
    blocks.push({
        type: 'input',
        block_id: 'response_note_block',
        optional: true,
        element: {
            type: 'plain_text_input',
            action_id: 'response_note',
            multiline: true,
            placeholder: { type: 'plain_text', text: '備考があれば入力してください（任意）' },
        },
        label: { type: 'plain_text', text: '📝 備考' },
    });

    return {
        type: 'modal',
        callback_id: 'schedule_response_modal',
        private_metadata: JSON.stringify({ scheduleId }),
        title: {
            type: 'plain_text',
            text: '📝 日程入力',
        },
        submit: {
            type: 'plain_text',
            text: '回答する',
        },
        close: {
            type: 'plain_text',
            text: 'キャンセル',
        },
        blocks,
    };
}

module.exports = { buildResponseModalView };
