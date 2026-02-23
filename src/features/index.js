const { registerScheduleFeature } = require('./schedule');

/**
 * 全機能のリスナーを一括登録
 * @param {import('@slack/bolt').App} app
 */
function registerFeatures(app) {
    registerScheduleFeature(app);
}

module.exports = { registerFeatures };
