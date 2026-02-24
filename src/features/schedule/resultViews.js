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
 * 回答一覧モーダルのViewを生成
 * @param {string} scheduleId
 * @param {Object} busySlots - ビジーなスロットのMap { "2026-03-02_1": true, ... }
 * @returns {Object|null} Modal View object
 */
function buildResultModalView(scheduleId, busySlots = {}) {
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
            text: `*期間:* ${startDate} 〜 ${endDate}\n*回答者:* ${userIds.map((uid) => responses[uid]?.displayName || uid).join(', ')}（${userIds.length}名）`,
        },
    });

    if (userIds.length === 0) {
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: '⚠️ まだ回答がありません。' },
        });
        return {
            type: 'modal',
            title: { type: 'plain_text', text: '📊 回答一覧' },
            close: { type: 'plain_text', text: '閉じる' },
            blocks,
        };
    }

    blocks.push({ type: 'divider' });

    // ===== スロットごとの集計 =====
    const slotStats = [];

    for (const day of weekdays) {
        for (const slot of timeSlots) {
            const slotKey = `${day.dateStr}_${slot.value}`;
            const shortLabel = getShortLabel(slot.text.text);
            const rowLabel = `${day.label} ${shortLabel}`;

            let available = [];
            let maybe = [];
            let unavailable = [];

            userIds.forEach(uid => {
                const name = responses[uid]?.displayName || uid;
                const state = responses[uid]?.slots?.[slotKey] || 'unavailable';
                if (state === 'available') available.push(name);
                else if (state === 'maybe') maybe.push(name);
                else if (state === 'unavailable') unavailable.push(name);
            });

            const isBusy = busySlots[slotKey] === true;

            // スコア算出（◯=2点, △=1点, ✕=0点、先生NG=減点100点）
            let score = available.length * 2 + maybe.length * 1;
            if (isBusy) score -= 100;

            slotStats.push({
                dayLabel: day.label,
                slotLabel: shortLabel,
                rowLabel,
                available,
                maybe,
                unavailable,
                isBusy,
                total: userIds.length,
                score,
            });
        }
    }

    // ===== トップ3のランキング ======
    // スコア順にソート（コピー配列）
    const sortedStats = [...slotStats].sort((a, b) => b.score - a.score);

    blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*🏆 全員が参加しやすい日程ランキング*' }
    });

    const topSlots = sortedStats.slice(0, 3);
    const topText = topSlots.map((stat, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || '・';
        let text = `${medal} *${stat.rowLabel}* (🟢 ${stat.available.length}名 / 🟡 ${stat.maybe.length}名 / 🔴 ${stat.unavailable.length}名)`;
        if (stat.total > 0 && stat.available.length === stat.total && !stat.isBusy) {
            text += ' ✨全員OK!';
        }
        if (stat.isBusy) {
            text += ' 👨‍🏫 先生NG';
        }
        const ngList = [];
        if (stat.unavailable.length > 0) ngList.push(`🔴NG: ${stat.unavailable.join(', ')}`);
        if (stat.maybe.length > 0) ngList.push(`🟡△: ${stat.maybe.join(', ')}`);
        if (ngList.length > 0) {
            text += `\n    └ ${ngList.join(' | ')}`;
        }
        return text;
    }).join('\n\n');

    blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: topText || '候補なし' }
    });

    blocks.push({ type: 'divider' });

    // ===== 日程ごとのリスト表示 =====
    blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: '*📅 全日程の回答状況*' }
    });

    let currentDayLabel = '';
    let dayText = '';

    const flushDayText = () => {
        if (dayText) {
            blocks.push({
                type: 'section',
                text: { type: 'mrkdwn', text: dayText }
            });
            dayText = '';
        }
    };

    for (const stat of slotStats) {
        if (stat.dayLabel !== currentDayLabel) {
            flushDayText();
            currentDayLabel = stat.dayLabel;
            dayText = `*▼ ${currentDayLabel}*\n`;
        }

        let line = `・${stat.slotLabel}：🟢 ${stat.available.length}名 / 🟡 ${stat.maybe.length}名 / 🔴 ${stat.unavailable.length}名`;
        if (stat.isBusy) line += ' 👨‍🏫✕';

        const details = [];
        if (stat.unavailable.length > 0) details.push(`🔴${stat.unavailable.join(', ')}`);
        if (stat.maybe.length > 0) details.push(`🟡${stat.maybe.join(', ')}`);

        if (details.length > 0) {
            line += `\n    └ ${details.join(' | ')}`;
        } else if (stat.total > 0 && stat.available.length === stat.total && !stat.isBusy) {
            line += ' ✨全員OK!';
        }

        dayText += line + '\n';
    }
    flushDayText();

    // ===== 備考 =====
    const notes = userIds
        .filter((uid) => responses[uid]?.note)
        .map((uid) => `*${responses[uid]?.displayName || uid}*: ${responses[uid].note}`);

    if (notes.length > 0) {
        blocks.push({ type: 'divider' });
        blocks.push({
            type: 'section',
            text: { type: 'mrkdwn', text: `*📝 備考*\n${notes.join('\n')}` },
        });
    }

    return {
        type: 'modal',
        title: { type: 'plain_text', text: '📊 回答一覧' },
        close: { type: 'plain_text', text: '閉じる' },
        blocks,
    };
}

/**
 * 結果をCSV形式の文字列で取得
 */
function generateCSV(scheduleId, busySlots = {}) {
    const schedule = getSchedule(scheduleId);
    if (!schedule) return '';

    const { startDate, endDate, timeSlots, responses } = schedule;
    const weekdays = getWeekdaysBetween(startDate, endDate);
    const userIds = Object.keys(responses);

    const hasBusy = Object.keys(busySlots).length > 0;

    // ヘッダー行を作成
    const headers = ['日付', '時間枠'];
    if (hasBusy) headers.push('先生');

    // メンバー名を追加
    const memberNames = userIds.map((uid) => responses[uid]?.displayName || uid);
    headers.push(...memberNames, '◯の合計');

    const csvLines = [headers.join(',')];

    // まず全日程のスコアを計算して、最大スコアを求める
    let maxScore = -1;
    const slotDataList = [];

    for (const day of weekdays) {
        for (const slot of timeSlots) {
            const slotKey = `${day.dateStr}_${slot.value}`;
            const isBusy = busySlots[slotKey] === true;

            let availableCount = 0;
            userIds.forEach(uid => {
                if (responses[uid]?.slots?.[slotKey] === 'available') {
                    availableCount++;
                }
            });

            // スコア：先生NGは事実上候補外(-100)。それ以外は出席可能人数
            const score = isBusy ? -100 : availableCount;
            if (score > maxScore) maxScore = score;

            slotDataList.push({ day, slot, slotKey, isBusy, availableCount, score });
        }
    }

    // CSVの各行を生成
    for (const data of slotDataList) {
        const row = [];

        // 日付と時間枠
        row.push(data.day.label);
        row.push(getShortLabel(data.slot.text.text));

        // 先生の都合
        if (hasBusy) {
            row.push(data.isBusy ? '👨‍🏫' : '🟢');
        }

        // 各メンバーの回答状態
        userIds.forEach(uid => {
            const state = responses[uid]?.slots?.[data.slotKey] || 'unavailable';
            if (state === 'available') row.push('🟢');
            else if (state === 'maybe') row.push('🟡');
            else row.push('🔴');
        });

        // 順位付けのロジック（スコアの高い順に1位〜3位まで）
        const uniqueScores = [...new Set(slotDataList.map(d => d.score))]
            .filter(s => s >= 0) // 先生NG(-100)や誰もいない日(0を除く場合は >0)などは除外する場合は調整
            .sort((a, b) => b - a);

        let totalText = `${data.availableCount} 名`;

        // 候補外（先生NG または 誰も参加できない）でない場合
        if (data.score > 0) {
            if (data.score === uniqueScores[0]) {
                totalText += ' 🥇 ';
            } else if (uniqueScores.length > 1 && data.score === uniqueScores[1]) {
                totalText += ' 🥈 ';
            } else if (uniqueScores.length > 2 && data.score === uniqueScores[2]) {
                totalText += ' 🥉 ';
            }

            // 全員参加できる場合はさらにアピール
            if (data.availableCount === userIds.length && userIds.length > 0) {
                totalText += ' ✨ ';
            }
        }

        row.push(totalText);
        csvLines.push(row.join(','));
    }

    return csvLines.join('\n');
}

module.exports = { buildResultModalView, generateCSV };
