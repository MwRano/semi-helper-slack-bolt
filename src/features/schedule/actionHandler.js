const { buildScheduleModalView } = require('./views');
const { buildResponseModalView } = require('./responseViews');
const { getSchedule, getChannelSettings } = require('./store');
const { getBusySlots } = require('./googleCalendarService');
const { config } = require('../../config/index');

/**
 * 「ゼミ日程調整を設定する」ボタンクリック時のハンドラー
 */
const openModalAction = async ({ ack, body, client, logger }) => {
    await ack();

    try {
        const channelId = body.channel.id;
        const messageTs = body.message?.ts;

        const savedSettings = await getChannelSettings(channelId) || {};
        const initialMode = savedSettings.mode || config.timeSlot.mode || 'period';

        await client.views.open({
            trigger_id: body.trigger_id,
            view: buildScheduleModalView(channelId, initialMode, {}, 0, true, messageTs),
        });

        logger.info('📅 ゼミ日程調整モーダルを表示しました');
    } catch (error) {
        logger.error('モーダルの表示に失敗しました:', error);
    }
};

/**
 * view の state.values から現在の入力値を取得するヘルパー
 */
function extractCurrentValues(values) {
    return {
        startDate: values.start_date_block?.start_date?.selected_date,
        endDate: values.end_date_block?.end_date?.selected_date,
        deadline: values.deadline_block?.deadline?.selected_date_time,
        remindHours: values.remind_hours_block?.remind_hours?.selected_options?.map(opt => opt.value),
        includeTeacher: values.include_teacher_block?.include_teacher?.selected_options?.some(opt => opt.value === 'include_teacher'),
    };
}

/**
 * 時間枠モード切替時のハンドラー
 * → renderCount を増やしてモーダルを更新（選択値をリセット）
 */
const switchModeAction = async ({ ack, body, client, logger }) => {
    await ack();

    try {
        const view = body.view;
        const values = view.state.values;
        const metadata = JSON.parse(view.private_metadata);

        const selectedMode = values.time_slot_mode_block.time_slot_mode.selected_option.value;
        const currentValues = extractCurrentValues(values);
        const newRenderCount = (metadata.renderCount || 0) + 1;

        await client.views.update({
            view_id: view.id,
            hash: view.hash,
            view: buildScheduleModalView(metadata.channel, selectedMode, currentValues, newRenderCount, true, metadata.messageTs),
        });

        logger.info(`📅 時間枠モードを「${selectedMode}」に切り替えました`);
    } catch (error) {
        logger.error('モーダルの更新に失敗しました:', error);
    }
};

/**
 * 時間枠一括クリアボタンのハンドラー
 * → renderCount を増やして選択値をリセット（デフォルト値なし）
 */
const clearTimeSlotsAction = async ({ ack, body, client, logger }) => {
    await ack();

    try {
        const view = body.view;
        const values = view.state.values;
        const metadata = JSON.parse(view.private_metadata);

        const currentMode = values.time_slot_mode_block.time_slot_mode.selected_option.value;
        const currentValues = extractCurrentValues(values);
        const newRenderCount = (metadata.renderCount || 0) + 1;

        await client.views.update({
            view_id: view.id,
            hash: view.hash,
            view: buildScheduleModalView(metadata.channel, currentMode, currentValues, newRenderCount, false, metadata.messageTs),
        });

        logger.info('📅 時間枠をすべてクリアしました');
    } catch (error) {
        logger.error('時間枠のクリアに失敗しました:', error);
    }
};

/**
 * 「日程を入力する」ボタンクリック時のハンドラー
 * → 回答用モーダルを表示する
 */
const openResponseModalAction = async ({ ack, body, client, logger }) => {
    await ack();

    try {
        const scheduleId = body.actions[0].value;
        const view = await buildResponseModalView(scheduleId);

        if (!view) {
            logger.error(`スケジュールが見つかりません: ${scheduleId}`);
            return;
        }

        await client.views.open({
            trigger_id: body.trigger_id,
            view,
        });

        logger.info(`📝 回答用モーダルを表示しました (${scheduleId})`);
    } catch (error) {
        logger.error('回答用モーダルの表示に失敗しました:', error);
    }
};

module.exports = { openModalAction, switchModeAction, clearTimeSlotsAction, openResponseModalAction };
