const { messageHandler } = require('./messageHandler');
const { openModalAction, switchModeAction, clearTimeSlotsAction } = require('./actionHandler');
const { viewHandler } = require('./viewHandler');

/**
 * 日程調整機能のリスナーを登録
 * @param {import('@slack/bolt').App} app
 */
function registerScheduleFeature(app) {
    // 「日程調整」メッセージ → ボタン付きメッセージを返す
    app.message('日程調整', messageHandler);

    // ボタンクリック → モーダルを表示
    app.action('open_schedule_modal', openModalAction);

    // 時間枠モード切替 → モーダルを更新
    app.action('time_slot_mode', switchModeAction);

    // 時間枠一括クリア
    app.action('clear_time_slots', clearTimeSlotsAction);

    // モーダル送信 → チャンネルに通知
    app.view('schedule_adjustment_modal', viewHandler);

    // 日程入力ボタン → 回答用モーダルを表示（TODO: 実装予定）
    app.action('open_response_modal', async ({ ack, logger }) => {
        await ack();
        logger.info('📝 日程入力ボタンがクリックされました（未実装）');
    });
}

module.exports = { registerScheduleFeature };
