const { pool } = require('./client');

/**
 * DBテーブルを作成する（初回起動時・アップデート時に実行）
 */
async function runMigrations() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS schedules (
                id                   VARCHAR(255) PRIMARY KEY,
                creator_id           VARCHAR(255) NOT NULL,
                creator_name         VARCHAR(255),
                channel_id           VARCHAR(255) NOT NULL,
                start_date           VARCHAR(20),
                end_date             VARCHAR(20),
                deadline             BIGINT,
                time_slots           JSONB         DEFAULT '[]',
                remind_hours         INTEGER[]     DEFAULT '{}',
                include_teacher      BOOLEAN       DEFAULT true,
                responses            JSONB         DEFAULT '{}',
                result_posted        BOOLEAN       DEFAULT false,
                is_closed            BOOLEAN       DEFAULT false,
                reminded_hours       INTEGER[]     DEFAULT '{}',
                overdue_reminded_days INTEGER[]    DEFAULT '{}',
                thread_ts            VARCHAR(255),
                channel_mention_ts   VARCHAR(255),
                remind_messages      JSONB         DEFAULT '{}',
                created_at           TIMESTAMPTZ   DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS channel_settings (
                channel_id  VARCHAR(255) PRIMARY KEY,
                settings    JSONB        NOT NULL,
                updated_at  TIMESTAMPTZ  DEFAULT NOW()
            )
        `);

        console.log('✅ データベースのマイグレーションが完了しました');
    } finally {
        client.release();
    }
}

module.exports = { runMigrations };
