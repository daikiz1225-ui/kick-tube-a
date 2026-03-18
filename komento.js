const axios = require('axios');

module.exports = async (req, res) => {
    // クエリパラメータから動画ID、APIキー、並び順(order)を取得
    const { vId, key, order } = req.query;

    if (!vId || !key) {
        return res.status(400).json({ error: 'Missing vId or key' });
    }

    // 並び順の指定がない場合は 'relevance' (いいね順) をデフォルトにする
    // YouTube APIで使用可能な値: 'relevance' (人気順), 'time' (新着順)
    const sortOrder = order || 'relevance';

    // YouTube Data API v3 の commentThreads エンドポイント
    const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${vId}&order=${sortOrder}&maxResults=50&key=${key}`;

    try {
        const response = await axios.get(url);
        
        // 成功した場合はデータをそのまま返す
        res.status(200).json(response.data);
    } catch (error) {
        console.error('YouTube API Error (Comments):', error.response ? error.response.data : error.message);
        
        // エラー時はフロントエンドが壊れないよう、空のアイテムリストを返す
        res.status(200).json({ items: [] });
    }
};
