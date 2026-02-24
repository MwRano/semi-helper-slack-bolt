const { google } = require('googleapis');
const path = require('path');

/**
 * Google Calendar の FreeBusy API を使ってビジーな時間枠を取得する
 *
 * @param {string} startDate - 開始日 (YYYY-MM-DD)
 * @param {string} endDate   - 終了日 (YYYY-MM-DD)
 * @param {Array}  timeSlots - 時間枠の配列 [{ text: { text: '1限（9:00〜10:30）' }, value: '1' }, ...]
 * @returns {Object} ビジーなスロットのMap { "2026-03-02_1": true, ... }
 */
async function getBusySlots(startDate, endDate, timeSlots) {
    const busySlots = {};

    try {
        const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH;
        const credentialsJson = process.env.GOOGLE_CREDENTIALS_JSON;
        const calendarId = process.env.GOOGLE_CALENDAR_ID;

        if (!calendarId || (!credentialsPath && !credentialsJson)) {
            console.warn('[GoogleCalendar] 環境変数が設定されていません。スキップします。');
            return busySlots;
        }

        // サービスアカウント認証
        const authOptions = {
            scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
        };

        if (credentialsJson) {
            authOptions.credentials = JSON.parse(credentialsJson);
        } else {
            authOptions.keyFile = path.resolve(credentialsPath);
        }

        const auth = new google.auth.GoogleAuth(authOptions);

        const calendar = google.calendar({ version: 'v3', auth });

        // FreeBusy API でビジー時間帯を取得
        const res = await calendar.freebusy.query({
            requestBody: {
                timeMin: new Date(`${startDate}T00:00:00+09:00`).toISOString(),
                timeMax: new Date(`${endDate}T23:59:59+09:00`).toISOString(),
                items: [{ id: calendarId }],
            },
        });

        // ビジーな時間帯の配列を取得
        const busyRanges = res.data.calendars?.[calendarId]?.busy || [];

        if (busyRanges.length === 0) {
            console.info('[GoogleCalendar] ビジーな時間帯はありませんでした。');
            return busySlots;
        }

        console.info(`[GoogleCalendar] ${busyRanges.length}件のビジー時間帯を取得しました。`);

        // 各日×各時間枠について、ビジー時間帯と重なっているかチェック
        const current = new Date(`${startDate}T00:00:00`);
        const end = new Date(`${endDate}T00:00:00`);

        while (current <= end) {
            const day = current.getDay();
            // 平日のみ
            if (day >= 1 && day <= 5) {
                const dateStr = formatDateStr(current);

                for (const slot of timeSlots) {
                    const timeRange = parseSlotTimeRange(slot);
                    if (!timeRange) continue;

                    const slotStart = new Date(`${dateStr}T${timeRange.start}:00+09:00`);
                    const slotEnd = new Date(`${dateStr}T${timeRange.end}:00+09:00`);

                    // この枠とビジー時間帯が重なるかチェック
                    const isBusy = busyRanges.some((busy) => {
                        const busyStart = new Date(busy.start);
                        const busyEnd = new Date(busy.end);
                        // 重なり判定: ビジー開始 < 枠終了 && ビジー終了 > 枠開始
                        return busyStart < slotEnd && busyEnd > slotStart;
                    });

                    if (isBusy) {
                        busySlots[`${dateStr}_${slot.value}`] = true;
                    }
                }
            }
            current.setDate(current.getDate() + 1);
        }
    } catch (error) {
        console.error('[GoogleCalendar] ビジー情報の取得に失敗しました:', error.message);
    }

    return busySlots;
}

/**
 * 時間枠のラベルから開始・終了時間を抽出する
 * 例: "1限（9:00〜10:30）" → { start: "09:00", end: "10:30" }
 * 例: "0900-1000" (時間ベース) → { start: "09:00", end: "10:00" }
 */
function parseSlotTimeRange(slot) {
    const label = slot.text?.text || '';
    const value = slot.value || '';

    // 限ベース: "1限（9:00〜10:30）"
    const periodMatch = label.match(/(\d{1,2}):(\d{2})\s*[〜~]\s*(\d{1,2}):(\d{2})/);
    if (periodMatch) {
        const startH = periodMatch[1].padStart(2, '0');
        const startM = periodMatch[2];
        const endH = periodMatch[3].padStart(2, '0');
        const endM = periodMatch[4];
        return { start: `${startH}:${startM}`, end: `${endH}:${endM}` };
    }

    // 時間ベース: value が "0900-1000" 形式
    const timeMatch = value.match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
    if (timeMatch) {
        return {
            start: `${timeMatch[1]}:${timeMatch[2]}`,
            end: `${timeMatch[3]}:${timeMatch[4]}`,
        };
    }

    return null;
}

/**
 * Date を YYYY-MM-DD にフォーマット
 */
function formatDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

module.exports = { getBusySlots };
