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

    // 備考欄をCSVの末尾に追加
    const notes = userIds
        .filter(uid => responses[uid]?.note)
        .map(uid => `"${responses[uid]?.displayName || uid}","${responses[uid].note.replace(/"/g, '""')}"`);

    if (notes.length > 0) {
        csvLines.push(''); // 空行
        csvLines.push('【備考（コメント）】');
        csvLines.push('回答者,内容');
        csvLines.push(...notes);
    }

    return csvLines.join('\n');
}

module.exports = { generateCSV };
