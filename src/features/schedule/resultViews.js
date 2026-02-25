const { getSchedule } = require('./store');
const { jsPDF } = require("jspdf");
const autoTable = require("jspdf-autotable").default || require("jspdf-autotable");

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
 * 結果をPDFのBufferとして取得
 */
function generatePDF(scheduleId, busySlots = {}) {
    const schedule = getSchedule(scheduleId);
    if (!schedule) return null;

    const { startDate, endDate, timeSlots, responses } = schedule;
    const weekdays = getWeekdaysBetween(startDate, endDate);
    const userIds = Object.keys(responses);
    const hasBusy = Object.keys(busySlots).length > 0;

    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text("Schedule Result", 14, 15);

    // ヘッダー行を作成
    const headers = ['Date', 'Time'];
    if (hasBusy) headers.push('Teacher');

    // メンバー名を追加
    const memberNames = userIds.map((uid) => responses[uid]?.displayName || uid);
    headers.push(...memberNames, 'Total');

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

            const score = isBusy ? -100 : availableCount;
            if (score > maxScore) maxScore = score;

            slotDataList.push({ day, slot, slotKey, isBusy, availableCount, score });
        }
    }

    const uniqueScores = [...new Set(slotDataList.map(d => d.score))]
        .filter(s => s >= 0)
        .sort((a, b) => b - a);

    const bodyData = [];
    let lastDateStr = null;
    let dateCellMap = {};

    for (const data of slotDataList) {
        const row = [];

        // 日付の変わり目でセルを結合（rowSpan）して境目を強調
        if (data.day.dateStr !== lastDateStr) {
            lastDateStr = data.day.dateStr;
            const dateCell = {
                content: data.day.dateStr,
                rowSpan: 1,
                styles: { valign: 'middle', halign: 'center', fillColor: [240, 240, 240], fontStyle: 'bold' }
            };
            row.push(dateCell);
            dateCellMap[data.day.dateStr] = dateCell;
        } else {
            dateCellMap[data.day.dateStr].rowSpan++;
        }

        row.push(getShortLabel(data.slot.text.text));

        if (hasBusy) {
            row.push(data.isBusy ? 'NG' : 'OK');
        }

        userIds.forEach(uid => {
            const state = responses[uid]?.slots?.[data.slotKey] || 'unavailable';
            if (state === 'available') row.push('O');
            else if (state === 'maybe') row.push('-');
            else row.push('X');
        });

        let totalText = `${data.availableCount}`;
        if (data.score > 0) {
            if (data.score === uniqueScores[0]) totalText += ' (1st)';
            else if (uniqueScores.length > 1 && data.score === uniqueScores[1]) totalText += ' (2nd)';
            else if (uniqueScores.length > 2 && data.score === uniqueScores[2]) totalText += ' (3rd)';

            if (data.availableCount === userIds.length && userIds.length > 0) {
                totalText += ' *ALL OK*';
            }
        }

        row.push(totalText);
        bodyData.push(row);
    }

    autoTable(doc, {
        startY: 20,
        head: [headers],
        body: bodyData,
        theme: 'grid',
        styles: { fontStyle: 'normal' },
        didParseCell: function (data) {
            if (data.section === 'body') {
                // 日付列はグレーの結合セルのままにするためスキップ
                if (data.column.index === 0) return;

                const rowScore = slotDataList[data.row.index].score;
                if (rowScore > 0) {
                    if (rowScore === uniqueScores[0]) {
                        data.cell.styles.fillColor = [100, 200, 100]; // 1st (かなり濃い緑)
                    } else if (uniqueScores.length > 1 && rowScore === uniqueScores[1]) {
                        data.cell.styles.fillColor = [160, 220, 160]; // 2nd (中くらいの緑)
                    } else if (uniqueScores.length > 2 && rowScore === uniqueScores[2]) {
                        data.cell.styles.fillColor = [220, 240, 220]; // 3rd (薄い緑)
                    }
                }
            }
        }
    });

    // 備考欄はPDF内には書き込まず、Slackメッセージとして送信するために配列で返す
    const notes = userIds
        .filter(uid => responses[uid]?.note)
        .map(uid => `*${responses[uid]?.displayName || uid}:* ${responses[uid].note}`);

    return {
        pdfBuffer: Buffer.from(doc.output('arraybuffer')),
        notes: notes
    };
}

module.exports = { generatePDF };
