require('dotenv').config();

const defaultPeriodSlots = [
    { label: '1限（9:00〜10:30）', value: '1' },
    { label: '2限（10:40〜12:10）', value: '2' },
    { label: '3限（13:00〜14:30）', value: '3' },
    { label: '4限（14:40〜16:10）', value: '4' },
    { label: '5限（16:20〜17:50）', value: '5' },
];

let periodSlots = defaultPeriodSlots;
if (process.env.CUSTOM_PERIOD_SLOTS) {
    periodSlots = process.env.CUSTOM_PERIOD_SLOTS.split(',').map((label, i) => ({
        label: label.trim(),
        value: String(i + 1),
    }));
}

const defaultPeriodDefaults = ['1', '2', '3', '4'];
let periodDefaults = defaultPeriodDefaults;
if (process.env.CUSTOM_PERIOD_DEFAULTS) {
    periodDefaults = process.env.CUSTOM_PERIOD_DEFAULTS.split(',').map(s => s.trim());
}

const config = {
    slack: {
        botToken: process.env.SLACK_BOT_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET,
        appToken: process.env.SLACK_APP_TOKEN,
    },
    database: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/schedule_bot',
    },
    port: process.env.PORT || 3000,

    /**
     * 時間枠の設定
     * mode: 'period'（限ベース）または 'time'（時間ベース）
     */
    timeSlot: {
        mode: 'period', // 'period' | 'time'

        // ── 限ベース設定 ──
        period: {
            slots: periodSlots,
            // デフォルトで選択する限（value で指定）
            defaults: periodDefaults,
        },

        // ── 時間ベース設定 ──
        time: {
            startHour: 9,       // 開始時間
            endHour: 18,        // 終了時間
            intervalMinutes: 60, // 何分刻みか（30, 60 など）
            // デフォルトで選択する時間枠（value で指定）
            defaults: ['0900-1000', '1000-1100', '1300-1400', '1400-1500'],
        },
    },

    defaults: {
        deadLineOffsetHours: 48,
        remindHours: ["24", "1"],
        includeTeacher: true
    }
};

module.exports = { config };
