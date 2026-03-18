const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;

// --- [Backend] 1. URL検証関数 ---
const isValidUrl = (urlStr) => {
    try {
        const url = new URL(urlStr);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
        return false;
    }
};

// --- [Backend] 2. プロキシ中継コア関数 ---
const proxyCore = async (targetUrl, res) => {
    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
            }
        });
        res.set('Content-Type', response.headers['content-type']);
        res.send(response.data);
    } catch (error) {
        res.status(502).send('プロキシエラー: サイトを取得できませんでした。');
    }
};

// --- [Backend] 3. ルーティング ---
// /proxy?url=https://example.com で呼び出し
app.get('/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl || !isValidUrl(targetUrl)) {
        return res.status(400).send('無効なURLです。');
    }
    await proxyCore(targetUrl, res);
});

// 静的ファイルの提供 (index.htmlが同じフォルダにある想定)
app.use(express.static(__dirname));

app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
});
