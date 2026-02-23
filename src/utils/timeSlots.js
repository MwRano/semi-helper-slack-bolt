const { config } = require('../config');

/**
 * 時間ベースの選択肢を生成
 */
function generateTimeBased(timeConfig) {
    const { startHour, endHour, intervalMinutes } = timeConfig;
    const options = [];

    let currentMinutes = startHour * 60;
    const endMinutes = endHour * 60;

    while (currentMinutes + intervalMinutes <= endMinutes) {
        const sH = String(Math.floor(currentMinutes / 60)).padStart(2, '0');
        const sM = String(currentMinutes % 60).padStart(2, '0');
        const eTotal = currentMinutes + intervalMinutes;
        const eH = String(Math.floor(eTotal / 60)).padStart(2, '0');
        const eM = String(eTotal % 60).padStart(2, '0');

        const label = `${sH}:${sM} 〜 ${eH}:${eM}`;
        const value = `${sH}${sM}-${eH}${eM}`;

        options.push({
            text: { type: 'plain_text', text: label },
            value,
        });

        currentMinutes += intervalMinutes;
    }

    return options;
}

/**
 * 限ベースの選択肢を生成
 */
function generatePeriodBased(periodConfig) {
    return periodConfig.slots.map((slot) => ({
        text: { type: 'plain_text', text: slot.label },
        value: slot.value,
    }));
}

/**
 * 指定モードに応じた時間枠オプションを生成
 * @param {string} mode - 'period' | 'time'
 * @returns {Array} Block Kit の options 配列
 */
function generateTimeSlotOptions(mode) {
    if (mode === 'time') {
        return generateTimeBased(config.timeSlot.time);
    }
    return generatePeriodBased(config.timeSlot.period);
}

/**
 * 指定モードに応じたデフォルト選択肢を返す
 * @param {string} mode - 'period' | 'time'
 * @returns {Array|undefined}
 */
function getDefaultTimeSlots(mode) {
    if (mode === 'time') {
        const { defaults } = config.timeSlot.time;
        if (!defaults || defaults.length === 0) return undefined;

        const allOptions = generateTimeBased(config.timeSlot.time);
        return allOptions.filter((opt) => defaults.includes(opt.value));
    }

    // 限ベース
    const { slots, defaults } = config.timeSlot.period;
    if (!defaults || defaults.length === 0) return undefined;

    return slots
        .filter((slot) => defaults.includes(slot.value))
        .map((slot) => ({
            text: { type: 'plain_text', text: slot.label },
            value: slot.value,
        }));
}

module.exports = { generateTimeSlotOptions, getDefaultTimeSlots };
