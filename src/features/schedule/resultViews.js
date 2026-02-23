const { getSchedule } = require('./store');

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

const STATE_EMOJI = {
    available: '🟢',
    maybe: '🟡',
    unavailable: '🔴',
};

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
 * 回答一覧メッセージのブロックを生成
 * @param {string} scheduleId
 * @returns {Object|null} { blocks, text }
 */
function buildResultBlocks(scheduleId) {
    const schedule = getSchedule(scheduleId);
    if (!schedule) return null;

    const { startDate, endDate, timeSlots, responses } = schedule;
    const weekdays = getWeekdaysBetween(startDate, endDate);
    const userIds = Object.keys(responses);
    const blocks = [];

    // ヘッダー
    blocks.push({
        type: 'header',
        text: { type: 'plain_text', text: '📊 回答一覧' },
    });
    blocks.push({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: `*期間:* ${startDate} 〜 ${endDate}\n*回答者:* ${userIds.length}名`,
        },
    });
    blocks.push({ type: 'divider' });

    if (userIds.length === 0) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: '⚠️ まだ回答がありません。' },
        });
        return { blocks, text: '📊 回答一覧（回答なし）' };
    }

    // 全員◯の枠を収集
    const perfectSlots = [];

    // 日付ごとにセクションを生成
    for (const day of weekdays) {
        const lines = [];

        for (const slot of timeSlots) {
            const slotKey = `${day.dateStr}_${slot.value}`;
            const shortLabel = getShortLabel(slot.text.text);

            // 各ユーザーの状態を取得
            const memberStatuses = userIds.map((uid) => {
                const state = responses[uid]?.slots?.[slotKey] || 'unavailable';
                return { uid, state };
            });

            // カウント
            const counts = { available: 0, maybe: 0, unavailable: 0 };
            memberStatuses.forEach((ms) => counts[ms.state]++);

            // 全員◯チェック
            const allAvailable = counts.available === userIds.length;
            if (allAvailable) {
                perfectSlots.push(`${day.label} ${shortLabel}`);
            }

            // メンバー表示
            const memberText = memberStatuses
                .map((ms) => `${STATE_EMOJI[ms.state]}<@${ms.uid}>`)
                .join('  ');

            const countText = `(◯${counts.available} △${counts.maybe} ✕${counts.unavailable})`;
            const highlight = allAvailable ? ' ✨' : '';

            lines.push(`*${shortLabel}:* ${memberText}  ${countText}${highlight}`);
        }

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*📅 ${day.label}*\n${lines.join('\n')}`,
            },
        });
        blocks.push({ type: 'divider' });
    }

    // 備考があれば表示
    const notes = userIds
        .filter((uid) => responses[uid]?.note)
        .map((uid) => `<@${uid}>: ${responses[uid].note}`);

    if (notes.length > 0) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*📝 備考*\n${notes.join('\n')}`,
            },
        });
        blocks.push({ type: 'divider' });
    }

    // 全員◯の枠をハイライト
    if (perfectSlots.length > 0) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*✨ 全員参加可能な枠:*\n${perfectSlots.map((s) => `• ${s}`).join('\n')}`,
            },
        });
    } else {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '⚠️ 全員が参加可能な枠はありませんでした。',
            },
        });
    }

    return {
        blocks,
        text: `📊 回答一覧（${userIds.length}名回答済み）`,
    };
}

module.exports = { buildResultBlocks };
