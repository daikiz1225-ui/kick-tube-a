window.onload = function() {
    const form = document.getElementById('search-form');
    
    if (form) {
        form.onsubmit = async function(e) {
            e.preventDefault();
            
            const input = document.getElementById('search-input');
            const results = document.getElementById('search-results');
            const query = input.value.trim();

            if (!query) return;

            results.innerHTML = `<div style="text-align:center; padding:50px;">🔍 検索中...</div>`;

            try {
                const videos = await window.fetchVideos(query);
                
                // エラーの原因「関数がない」を防ぐチェック
                if (typeof window.renderThumbnails === 'function') {
                    window.renderThumbnails(videos);
                } else {
                    throw new Error("表示機能(thumbnail-list.js)がまだ読み込まれていないぜ。リロードしてみて！");
                }

            } catch (err) {
                results.innerHTML = `<div style="color:red; padding:20px;">エラー: ${err.message}</div>`;
            }
        };
    }
};
