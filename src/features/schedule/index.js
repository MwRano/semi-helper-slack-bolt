const { messageHandler } = require('./messageHandler');
const { openModalAction, switchModeAction, clearTimeSlotsAction, openResponseModalAction } = require('./actionHandler');
const { viewHandler } = require('./viewHandler');
const { responseHandler } = require('./responseHandler');
const { startDeadlineChecker } = require('./scheduler');

/**
 * 日程調整機能のリスナーを登録
 * @param {import('@slack/bolt').App} app
 */
function registerScheduleFeature(app) {
    // 「ちょうせい」メッセージ → ボタン付きメッセージを返す
    app.message('ちょうせい', messageHandler);

    // ボタンクリック → 作成モーダルを表示
    app.action('open_schedule_modal', openModalAction);

    // 時間枠モード切替 → モーダルを更新
    app.action('time_slot_mode', switchModeAction);

    // 時間枠一括クリア
    app.action('clear_time_slots', clearTimeSlotsAction);

    // モーダル送信 → チャンネルに通知
    app.view('schedule_adjustment_modal', viewHandler);

    // 日程入力ボタン → 回答用モーダルを表示
    app.action('open_response_modal', openResponseModalAction);


    // 回答モーダル送信 → 回答を保存しチャンネルに通知
    app.view('schedule_response_modal', responseHandler);

    // 締め切りチェッカーを開始
    startDeadlineChecker(app);
}

module.exports = { registerScheduleFeature };
