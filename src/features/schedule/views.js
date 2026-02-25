const { generateTimeSlotOptions, getDefaultTimeSlots } = require('../../utils/timeSlots');
const { getChannelSettings } = require('./store');
const { config } = require('../../config/index');

/**
 * 来週の月曜日の日付を返す（YYYY-MM-DD）
 */
function getNextMonday(offsetBaseDate = new Date(), startOffsetDays = undefined) {
    const now = new Date(offsetBaseDate);
    if (startOffsetDays !== undefined) {
        now.setDate(now.getDate() + startOffsetDays);
        return formatDate(now);
    }
    const day = now.getDay();
    const daysUntilNextMonday = day === 0 ? 1 : 8 - day;
    const nextMonday = new Date(now);
    nextMonday.setDate(now.getDate() + daysUntilNextMonday);
    return formatDate(nextMonday);
}

/**
 * 来週の金曜日の日付を返す（YYYY-MM-DD）
 */
function getNextFriday(offsetBaseDate = new Date(), endOffsetDays = undefined) {
    const now = new Date(offsetBaseDate);
    if (endOffsetDays !== undefined) {
        now.setDate(now.getDate() + endOffsetDays);
        return formatDate(now);
    }
    const day = now.getDay();
    const daysUntilNextMonday = day === 0 ? 1 : 8 - day;
    const nextFriday = new Date(now);
    nextFriday.setDate(now.getDate() + daysUntilNextMonday + 4);
    return formatDate(nextFriday);
}

/**
 * 現在から2日後のUnixタイムスタンプを返す
 */
function getDeadlineTimestamp(offsetHours = undefined) {
    const deadline = new Date();
    if (offsetHours !== undefined) {
        deadline.setHours(deadline.getHours() + offsetHours);
        deadline.setMinutes(0, 0, 0);
        return Math.floor(deadline.getTime() / 1000);
    }
    deadline.setDate(deadline.getDate() + 2);
    deadline.setSeconds(0, 0);
    return Math.floor(deadline.getTime() / 1000);
}

/**
 * Date を YYYY-MM-DD 形式にフォーマット
 */
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * 時間枠モード選択用のラジオボタンブロック
 */
function buildModeSelectBlock(currentMode) {
    return {
        type: 'input',
        block_id: 'time_slot_mode_block',
        dispatch_action: true,
        element: {
            type: 'radio_buttons',
            action_id: 'time_slot_mode',
            initial_option: currentMode === 'time'
                ? { text: { type: 'plain_text', text: '⏱️ 時間ベース' }, value: 'time' }
                : { text: { type: 'plain_text', text: '🎓 限ベース' }, value: 'period' },
            options: [
                { text: { type: 'plain_text', text: '🎓 限ベース' }, value: 'period' },
                { text: { type: 'plain_text', text: '⏱️ 時間ベース' }, value: 'time' },
            ],
        },
        label: { type: 'plain_text', text: 'モード選択' },
    };
}

/**
 * 時間枠選択ブロックを生成
 * renderCount を block_id に含めることで、切替時に選択値を強制リセットする
 */
function buildTimeSlotSelectBlock(mode, renderCount = 0, showDefaults = true, channelSettings = undefined) {
    const options = generateTimeSlotOptions(mode);
    let defaults = undefined;

    if (showDefaults) {
        if (channelSettings && channelSettings.timeSlots && channelSettings.mode === mode) {
            defaults = options.filter(opt => channelSettings.timeSlots.includes(opt.value));
        } else {
            defaults = getDefaultTimeSlots(mode);
        }
    }

    return {
        type: 'input',
        block_id: `time_slots_block_${renderCount}`,
        element: {
            type: 'multi_static_select',
            action_id: 'time_slots',
            placeholder: { type: 'plain_text', text: '候補の時間枠を選択' },
            options,
            ...(defaults && defaults.length > 0 && { initial_options: defaults }),
        },
        label: { type: 'plain_text', text: '候補時間帯（複数選択可）' },
    };
}

/**
 * 一括クリアボタンブロック
 */
function buildClearButtonBlock() {
    return {
        type: 'actions',
        block_id: 'clear_actions_block',
        elements: [
            {
                type: 'button',
                text: { type: 'plain_text', text: '🗑️ 時間枠をすべてクリア' },
                action_id: 'clear_time_slots',
                style: 'danger',
            },
        ],
    };
}

/**
 * 日程調整モーダルのビュー定義を生成
 * @param {string} channelId - チャンネルID
 * @param {string} mode - 'period' | 'time'
 * @param {Object} currentValues - 現在の入力値（モーダル更新時に保持するため）
 * @param {number} renderCount - レンダーカウンター（block_id を変えて選択値をリセット）
 * @param {boolean} showDefaults - デフォルト値を表示するか
 * @param {string} [messageTs] - モーダルを開いた際の元メッセージのタイムスタンプ
 */
function buildScheduleModalView(channelId, mode = 'period', currentValues = {}, renderCount = 0, showDefaults = true, messageTs = null) {
    const channelSettings = getChannelSettings(channelId);
    const isInitialRender = Object.keys(currentValues).length === 0;

    let initialRemindHours = (config.defaults && config.defaults.remindHours) || ['24', '1'];
    let initialIncludeTeacher = (config.defaults && config.defaults.includeTeacher !== undefined) ? config.defaults.includeTeacher : true;
    let initialStartOffsetDays = config.defaults?.periodOffsetDays?.start;
    let initialEndOffsetDays = config.defaults?.periodOffsetDays?.end;
    let initialDeadLineOffsetHours = config.defaults?.deadLineOffsetHours;

    if (isInitialRender && channelSettings) {
        if (channelSettings.remindHours !== undefined) initialRemindHours = channelSettings.remindHours.map(String);
        if (channelSettings.includeTeacher !== undefined) initialIncludeTeacher = channelSettings.includeTeacher;
        if (channelSettings.startOffsetDays !== undefined) initialStartOffsetDays = channelSettings.startOffsetDays;
        if (channelSettings.endOffsetDays !== undefined) initialEndOffsetDays = channelSettings.endOffsetDays;
        if (channelSettings.deadLineOffsetHours !== undefined) initialDeadLineOffsetHours = channelSettings.deadLineOffsetHours;
    }

    if (!isInitialRender) {
        if (currentValues.remindHours !== undefined) initialRemindHours = currentValues.remindHours;
        if (currentValues.includeTeacher !== undefined) initialIncludeTeacher = currentValues.includeTeacher;
    }

    return {
        type: 'modal',
        callback_id: 'schedule_adjustment_modal',
        private_metadata: JSON.stringify({ channel: channelId, mode, renderCount, messageTs }),
        title: {
            type: 'plain_text',
            text: '📅 日程調整',
        },
        submit: {
            type: 'plain_text',
            text: '作成する',
        },
        close: {
            type: 'plain_text',
            text: 'キャンセル',
        },
        blocks: [
            // ===== 日程調整期間 =====
            {
                type: 'header',
                text: { type: 'plain_text', text: '📆 日程調整期間' },
            },
            {
                type: 'input',
                block_id: 'start_date_block',
                element: {
                    type: 'datepicker',
                    action_id: 'start_date',
                    initial_date: currentValues.startDate || getNextMonday(new Date(), initialStartOffsetDays),
                    placeholder: { type: 'plain_text', text: '開始日を選択' },
                },
                label: { type: 'plain_text', text: '開始日' },
            },
            {
                type: 'input',
                block_id: 'end_date_block',
                element: {
                    type: 'datepicker',
                    action_id: 'end_date',
                    initial_date: currentValues.endDate || getNextFriday(new Date(), initialEndOffsetDays),
                    placeholder: { type: 'plain_text', text: '終了日を選択' },
                },
                label: { type: 'plain_text', text: '終了日' },
            },
            { type: 'divider' },

            // ===== 締め切り =====
            {
                type: 'header',
                text: { type: 'plain_text', text: '⏰ 回答締め切り' },
            },
            {
                type: 'input',
                block_id: 'deadline_block',
                element: {
                    type: 'datetimepicker',
                    action_id: 'deadline',
                    initial_date_time: currentValues.deadline || getDeadlineTimestamp(initialDeadLineOffsetHours),
                },
                label: { type: 'plain_text', text: '締め切り日時' },
            },
            { type: 'divider' },
            // ===== 時間枠 =====
            {
                type: 'header',
                text: { type: 'plain_text', text: '🕐 時間枠' },
            },
            buildModeSelectBlock(mode),
            buildTimeSlotSelectBlock(mode, renderCount, showDefaults, isInitialRender ? channelSettings : undefined),
            buildClearButtonBlock(),
            { type: 'divider' },

            // ===== リマインド =====
            {
                type: 'input',
                block_id: 'remind_hours_block',
                optional: true,
                element: {
                    type: 'multi_static_select',
                    action_id: 'remind_hours',
                    placeholder: { type: 'plain_text', text: 'リマインドのタイミングを選択' },
                    options: [
                        { text: { type: 'plain_text', text: '48時間前' }, value: '48' },
                        { text: { type: 'plain_text', text: '24時間前' }, value: '24' },
                        { text: { type: 'plain_text', text: '12時間前' }, value: '12' },
                        { text: { type: 'plain_text', text: '6時間前' }, value: '6' },
                        { text: { type: 'plain_text', text: '3時間前' }, value: '3' },
                        { text: { type: 'plain_text', text: '1時間前' }, value: '1' },
                    ],
                    initial_options: initialRemindHours.map(hourStr => ({
                        text: { type: 'plain_text', text: `${hourStr}時間前` }, value: hourStr
                    })),
                },
                label: { type: 'plain_text', text: 'リマインド通知（複数選択可）' },
            },
            { type: 'divider' },

            // ===== 先生の予定 =====
            {
                type: 'input',
                block_id: 'include_teacher_block',
                optional: true,
                element: {
                    type: 'checkboxes',
                    action_id: 'include_teacher',
                    options: [
                        {
                            text: { type: 'plain_text', text: '予定を考慮（Google Calendar連携）' },
                            value: 'include_teacher',
                        },
                    ],
                    ...(initialIncludeTeacher ? {
                        initial_options: [
                            {
                                text: { type: 'plain_text', text: '予定を考慮（Google Calendar連携）' },
                                value: 'include_teacher',
                            },
                        ],
                    } : {})
                },
                label: { type: 'plain_text', text: '🎓 先生の予定' },
            },
            { type: 'divider' },

            // ===== 設定の保存 =====
            {
                type: 'input',
                block_id: 'save_default_block',
                optional: true,
                element: {
                    type: 'checkboxes',
                    action_id: 'save_default',
                    options: [
                        {
                            text: { type: 'plain_text', text: '📝 この「期間/締め切り/時間枠/通知/先生の予定」を次回のデフォルト値として保存する' },
                            value: 'save_as_default',
                        },
                    ],
                },
                label: { type: 'plain_text', text: '設定のロック' },
            },
        ],
    };
}

module.exports = { buildScheduleModalView };
