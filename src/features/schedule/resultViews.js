const { getSchedule } = require('./store');

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

const STATE_CHAR = { available: '◯', maybe: '△', unavailable: '✕' };

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
 * 時間枠の短縮ラベルを取得
 */
function getShortLabel(slotText) {
    const parenIdx = slotText.indexOf('（');
    if (parenIdx > 0) return slotText.substring(0, parenIdx);
    return slotText;
}

/**
 * 半角換算の文字幅を計算
 */
function charWidth(str) {
    let w = 0;
    for (const ch of str) {
        w += ch.charCodeAt(0) > 0x7f ? 2 : 1;
    }
    return w;
}

/**
 * 半角換算で右パディング
 */
function pad(str, width) {
    const diff = Math.max(0, width - charWidth(str));
    return str + ' '.repeat(diff);
}

/**
 * 回答一覧メッセージのブロックを生成
 * @param {string} scheduleId
 * @param {Object} busySlots - ビジーなスロットのMap { "2026-03-02_1": true, ... }
 * @returns {Object|null} { blocks, text }
 */
function buildResultBlocks(scheduleId, busySlots = {}) {
    const schedule = getSchedule(scheduleId);
    if (!schedule) return null;

    const { startDate, endDate, timeSlots, responses } = schedule;
    const weekdays = getWeekdaysBetween(startDate, endDate);
    const userIds = Object.keys(responses);
    const blocks = [];

    // ===== ヘッダー =====
    blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: '📊 回答一覧' },
    });
    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: `*期間:* ${startDate} 〜 ${endDate}\n*回答者:* ${userIds.map((uid) => `<@${uid}>`).join(', ')}（${userIds.length}名）`,
        },
    });

    if (userIds.length === 0) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: '⚠️ まだ回答がありません。' },
        });
        return { blocks, text: '📊 回答一覧（回答なし）' };
    }

    blocks.push({ type: 'divider' });

    // ===== 調整さん風テーブル =====
    const memberCount = userIds.length;
    const dateColWidth = 12;
    const countColWidth = 4;

    // メンバー名を取得し、列幅を決定
    const memberNames = userIds.map((uid) => {
        const name = responses[uid]?.displayName || uid;
        // 長すぎる名前は切り詰め
        return charWidth(name) > 8 ? name.substring(0, 4) : name;
    });
    const memberColWidth = Math.max(4, ...memberNames.map((n) => charWidth(n) + 1));

    // ヘッダー行: メンバー名 + 先生列
    const hasBusy = Object.keys(busySlots).length > 0;
    const teacherColWidth = hasBusy ? 5 : 0;
    const memberHeaders = memberNames.map((name) => pad(name, memberColWidth)).join('');
    const headerLine = pad('', dateColWidth) + memberHeaders + pad('◯', countColWidth) + (hasBusy ? pad('先生', teacherColWidth) : '');

    // データ行
    const dataLines = [];

    for (let di = 0; di < weekdays.length; di++) {
        const day = weekdays[di];

        // 日付グループの区切り線（2日目以降）
        if (di > 0) {
            const lineWidth = dateColWidth + memberColWidth * memberCount + countColWidth + teacherColWidth;
            dataLines.push('─'.repeat(Math.floor(lineWidth / 2)));
        }

        for (const slot of timeSlots) {
            const slotKey = `${day.dateStr}_${slot.value}`;
            const shortLabel = getShortLabel(slot.text.text);
            const rowLabel = `${day.label} ${shortLabel}`;

            // 各メンバーの状態
            let availableCount = 0;
            const cells = userIds.map((uid) => {
                const state = responses[uid]?.slots?.[slotKey] || 'unavailable';
                if (state === 'available') availableCount++;
                return pad(STATE_CHAR[state], memberColWidth);
            });

            const isBusy = busySlots[slotKey] === true;
            const isPerfect = availableCount === memberCount && !isBusy;
            const mark = isPerfect ? ' ✨' : '';
            const teacherCell = hasBusy ? pad(isBusy ? '✕' : '○', teacherColWidth) : '';
            dataLines.push(pad(rowLabel, dateColWidth) + cells.join('') + pad(`${availableCount}`, countColWidth) + teacherCell + mark);
        }
    }

    const tableText = [headerLine, '', ...dataLines].join('\n');

    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: '```\n' + tableText + '\n```',
        },
    });

    // ===== 備考 =====
    const notes = userIds
        .filter((uid) => responses[uid]?.note)
        .map((uid) => `<@${uid}>: ${responses[uid].note}`);

    if (notes.length > 0) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*📝 備考*\n${notes.join('\n')}` },
        });
    }



    return {
        blocks,
        text: `📊 回答一覧（${userIds.length}名回答済み）`,
    };
}

module.exports = { buildResultBlocks };
