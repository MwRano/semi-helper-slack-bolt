const http = require('http');

/**
 * Koyebなどのクラウド環境での死活監視（ヘルスチェック）用ダミーサーバーを起動する
 * @param {number|string} port 起動するポート番号
 */
function startHealthCheckServer(port) {
    const server = http.createServer((req, res) => {
        // Koyebなどがアクセスしてきたら、元気です（200 OK）と返す
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
    });

    server.listen(port, () => {
        console.log(`[HealthCheck] ヘルスチェックサーバーがポート ${port} で受け付けています (本番環境のみ)`);
    });
}

module.exports = { startHealthCheckServer };
