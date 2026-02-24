const { buildScheduleModalView } = require('./views');
const { buildResponseModalView } = require('./responseViews');
const { buildResultModalView } = require('./resultViews');
const { getSchedule } = require('./store');
const { getBusySlots } = require('./googleCalendarService');

/**
 * 「日程調整を設定する」ボタンクリック時のハンドラー
 */
const openModalAction = async ({ ack, body, client, logger }) => {
    await ack();

    try {
        const channelId = body.channel.id;
        const messageTs = body.message?.ts;

        await client.views.open({
            trigger_id: body.trigger_id,
            view: buildScheduleModalView(channelId, 'period', {}, 0, true, messageTs),
        });

        logger.info('📅 日程調整モーダルを表示しました');
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
        const view = buildResponseModalView(scheduleId);

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

/**
 * 「結果一覧を確認する」ボタンクリック時のハンドラー
 * → 結果一覧モーダルを表示する
 */
const openResultModalAction = async ({ ack, body, client, logger }) => {
    await ack();

    try {
        const scheduleId = body.actions[0].value;
        const schedule = getSchedule(scheduleId);

        if (!schedule) {
            logger.error(`スケジュールが見つかりません: ${scheduleId}`);
            return;
        }

        // 先生の予定を考慮する場合のみ Google Calendar を呼び出す
        const busySlots = schedule.includeTeacher !== false
            ? await getBusySlots(schedule.startDate, schedule.endDate, schedule.timeSlots)
            : {};

        const view = buildResultModalView(scheduleId, busySlots);

        if (!view) {
            logger.error(`結果モーダルを生成できませんでした: ${scheduleId}`);
            return;
        }

        await client.views.open({
            trigger_id: body.trigger_id,
            view,
        });

        logger.info(`📊 結果確認用モーダルを表示しました (${scheduleId})`);
    } catch (error) {
        logger.error('結果確認用モーダルの表示に失敗しました:', error);
    }
};

module.exports = { openModalAction, switchModeAction, clearTimeSlotsAction, openResponseModalAction, openResultModalAction };
