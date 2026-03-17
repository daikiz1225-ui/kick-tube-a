/* app.js - Security Enhanced & Multi-Source Player Integration */

// --- ユーティリティ ---
function timeAgo(dateString) {
    const now = new Date();
    const past = new Date(dateString);
    const diff = Math.floor((now - past) / 1000);
    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    return `${Math.floor(diff / 86400)}日前`;
}

function formatViews(views) {
    if (!views) return "0回";
    const num = parseInt(views);
    if (num >= 100000000) return `${(num / 100000000).toFixed(1)}億回`;
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万回`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}千回`;
    return `${num}回`;
}

const YT = {
    // セキュリティ強化：ハードコードされたキーを削除
    keys: [],
    currentEduKey: "",
    pipedServers: [
        'https://pipedapi.kavin.rocks', 'https://api-piped.mha.fi', 'https://pipedapi.adminforge.de',
        'https://pipedapi.pfcd.me', 'https://api.piped.projectsegfau.lt', 'https://pipedapi.in.projectsegfau.lt',
        'https://pipedapi.us.projectsegfau.lt', 'https://watchapi.whatever.social', 'https://api.piped.privacydev.net',
        'https://pipedapi.aeong.one', 'https://pipedapi.leptons.xyz', 'https://piped-api.garudalinux.org',
        'https://pipedapi.rivo.lol', 'https://pipedapi.colinslegacy.com', 'https://api.piped.yt',
        'https://pipedapi.palveluntarjoaja.eu', 'https://pipedapi.smnz.de', 'https://pa.mint.lgbt',
        'https://pa.il.ax', 'https://piped-api.privacy.com.de', 'https://api.piped.link',
        'https://api.piped.lunar.icu', 'https://pipedapi.osphost.fi', 'https://pipedapi.darkness.services',
        'https://pipedapi.ggtyler.dev', 'https://pipedapi.qdi.fi', 'https://piped-api.hostux.net',
        'https://pipedapi.simpleprivacy.fr', 'https://pipedapi-libre.kavin.rocks'
    ],

    getVideoId(item) {
        if (!item) return "";
        return item.id?.videoId || item.contentDetails?.videoId || item.contentDetails?.upload?.videoId || item.snippet?.resourceId?.videoId || (typeof item.id === 'string' ? item.id : "");
    },

    getProxiedThumb(video) {
        const vId = this.getVideoId(video);
        if (vId) return `/api/thumb?id=${vId}`;
        return video.snippet?.thumbnails?.high?.url || video.snippet?.thumbnails?.default?.url || "";
    },

    async refreshEduKey() {
        try {
            const response = await fetch('/api/get_key');
            if (!response.ok) throw new Error("APIアクセス失敗");
            const data = await response.json();
            if (data && data.key) {
                this.currentEduKey = data.key;
                Actions.showStatusNotification("最新キーを自動更新しました✅");
            }
        } catch (error) { console.error("自動収集エラー:", error); }
    },

    seek(seconds) {
        const iframe = document.querySelector('.video-wrapper iframe, .shorts-container iframe');
        if (iframe) {
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }), '*');
        }
    },

    getCurrentKey() {
        return localStorage.getItem('custom_yt_api_key') || "";
    },

    async fetchAPI(endpoint, params) {
        const key = this.getCurrentKey();
        
        // ハイブリッド検索：キーがない場合はPipedを使用
        if (!key) {
            return await this.fetchPiped(endpoint, params);
        }

        const queryParams = new URLSearchParams({ ...params, key: key });
        const url = `https://www.googleapis.com/youtube/v3/${endpoint}?${queryParams.toString()}`;
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error("API error");
            return await response.json();
        } catch (error) { 
            console.warn("YouTube APIエラー。Pipedへフォールバックします。");
            return await this.fetchPiped(endpoint, params);
        }
    },

    async fetchPiped(endpoint, params) {
        const server = this.pipedServers[Math.floor(Math.random() * this.pipedServers.length)];
        let url = "";
        
        if (endpoint === 'search') {
            url = `${server}/search?q=${encodeURIComponent(params.q)}&filter=videos`;
        } else if (endpoint === 'videos' || endpoint === 'playlistItems') {
            // Piped APIの構造に合わせたマッピング
            return { items: [], nextPageToken: "" }; 
        } else {
            return { items: [], nextPageToken: "" };
        }

        try {
            const res = await fetch(url);
            const data = await res.json();
            return {
                items: data.items.map(v => ({
                    id: { videoId: v.url.split("v=")[1] },
                    snippet: {
                        title: v.title,
                        thumbnails: { high: { url: v.thumbnail } },
                        channelTitle: v.uploaderName,
                        publishedAt: new Date().toISOString(),
                        channelId: v.uploaderUrl.split("/channel/")[1]
                    }
                })),
                nextPageToken: ""
            };
        } catch (e) { return { items: [], nextPageToken: "" }; }
    }
};

const Storage = {
    get(key) { const data = localStorage.getItem(key); try { return data ? JSON.parse(data) : []; } catch (e) { return []; } },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
    isAdmin() { return localStorage.getItem('is_admin') === 'true'; },
    setAdmin(status) { localStorage.setItem('is_admin', status); },
    isIncognito() { return localStorage.getItem('yt_incognito') === 'true'; },
    setIncognito(status) { localStorage.setItem('yt_incognito', status); },
    
    getPreferredPlayer() { return localStorage.getItem('preferred_player') || "edu"; },
    setPreferredPlayer(mode) { localStorage.setItem('preferred_player', mode); },

    saveResumeProgress(video, currentTime, duration) {
        if (this.isIncognito()) return;
        let list = this.get('yt_resume_list');
        const vId = YT.getVideoId(video);
        if (!vId) return;
        if (duration > 0 && (currentTime / duration) >= 0.95) {
            list = list.filter(item => item.id !== vId);
            this.set('yt_resume_list', list);
            return;
        }
        const newItem = {
            id: vId, title: video.snippet.title, thumb: `/api/thumb?id=${vId}`,
            channelTitle: video.snippet.channelTitle, time: Math.floor(currentTime),
            duration: Math.floor(duration), timestamp: Date.now()
        };
        list = [newItem, ...list.filter(item => item.id !== vId)].slice(0, 3);
        this.set('yt_resume_list', list);
    },

    getResumeTime(vId) {
        const list = this.get('yt_resume_list');
        const item = list.find(i => i.id === vId);
        return item ? item.time : 0;
    },

    addHistory(v) { 
        if (this.isIncognito()) return;
        let h = this.get('yt_history'); 
        h = [v, ...h.filter(x => x.id !== v.id)].slice(0, 50); 
        this.set('yt_history', h); 
    },
    deleteHistoryItem(vId) {
        let h = this.get('yt_history');
        h = h.filter(x => x.id !== vId);
        this.set('yt_history', h);
    },
    clearAllHistory() {
        if (confirm("すべての視聴履歴を削除しますか？")) {
            this.set('yt_history', []);
            Actions.showHistory();
        }
    },
    toggleSub(ch) {
        let s = this.get('yt_subs');
        const i = s.findIndex(x => x.id === ch.id);
        if (i > -1) s.splice(i, 1); else s.push({ id: ch.id, name: ch.name, thumb: ch.thumb || '' });
        this.set('yt_subs', s);
        Actions.loadSidebarLatest();
    },
    toggleWatchLater(v) {
        let list = this.get('yt_watchlater');
        const i = list.findIndex(x => x.id === v.id);
        if (i > -1) list.splice(i, 1); else list.unshift(v);
        this.set('yt_watchlater', list);
    },
    isWatchLater(id) { return this.get('yt_watchlater').some(x => x.id === id); },
    getMyPlaylists() { const d = localStorage.getItem('yt_my_playlists'); return d ? JSON.parse(d) : {}; },
    setMyPlaylists(data) { localStorage.setItem('yt_my_playlists', JSON.stringify(data)); },
    createPlaylist(name) {
        let dict = this.getMyPlaylists();
        if (dict[name]) return alert("既に同じ名前のリストがあります");
        dict[name] = [];
        this.setMyPlaylists(dict);
    },
    deletePlaylist(name) {
        let dict = this.getMyPlaylists();
        delete dict[name];
        this.setMyPlaylists(dict);
    },
    addToPlaylist(name, video) {
        let dict = this.getMyPlaylists();
        if (!dict[name]) return;
        if (dict[name].some(v => v.id === video.id)) return alert("既に入っています");
        dict[name].push(video);
        this.setMyPlaylists(dict);
        alert(`「${name}」に追加しました！`);
    },
    removeFromPlaylist(name, videoId) {
        let dict = this.getMyPlaylists();
        if (!dict[name]) return;
        dict[name] = dict[name].filter(v => v.id !== videoId);
        this.setMyPlaylists(dict);
    }
};

const Actions = {
    currentList: [], relatedList: [], currentIndex: -1, channelIcons: {},
    currentView: "home", nextToken: "", currentParams: {}, selectedSubs: [],
    activePlaylistName: null, videoStats: {}, resumeTimer: null,

    init() {
        const input = document.getElementById('search-input');
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.search(); input.blur(); } });
        document.getElementById('search-btn').onclick = () => this.search();
        
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            if (!document.getElementById('nav-resume')) {
                const homeNav = document.querySelector('.sidebar .nav-item[onclick="Actions.goHome()"]');
                if (homeNav) homeNav.insertAdjacentHTML('afterend', '<div id="nav-resume" class="nav-item" onclick="Actions.showResumeList()" style="color:#ff8c00;">🕒<span>続きから見る</span></div>');
            }
            if (!document.getElementById('nav-watch-later')) {
                const historyNav = document.querySelector('.sidebar .nav-item[onclick="Actions.showHistory()"]');
                if (historyNav) historyNav.insertAdjacentHTML('beforebegin', '<div id="nav-watch-later" class="nav-item" onclick="Actions.showWatchLater()">📌<span>後で見る</span></div>');
            }
            if (!document.getElementById('nav-playlist')) {
                const wlNav = document.getElementById('nav-watch-later');
                if (wlNav) wlNav.insertAdjacentHTML('afterend', '<div id="nav-playlist" class="nav-item" onclick="Actions.showMyPlaylists()" style="color:#3ea6ff;">📂<span>プレイリスト</span></div>');
            }
            if (!document.getElementById('nav-ai-recommend')) {
                const homeNav = document.querySelector('.sidebar .nav-item[onclick="Actions.goHome()"]');
                if (homeNav) homeNav.insertAdjacentHTML('afterend', '<div id="nav-ai-recommend" class="nav-item" onclick="Actions.showAIRecommendations()">🤖<span>AIおすすめ</span></div>');
            }
            if (!document.getElementById('nav-incognito')) {
                const isInc = Storage.isIncognito();
                const historyNav = document.querySelector('.sidebar .nav-item[onclick="Actions.showHistory()"]');
                if (historyNav) {
                    historyNav.insertAdjacentHTML('afterend', `
                        <div id="nav-incognito" class="nav-item" onclick="Actions.toggleIncognito()" style="color:${isInc ? '#00ff00' : '#aaa'};">
                            👤<span>${isInc ? 'シークレット: ON' : 'シークレット: OFF'}</span>
                        </div>
                    `);
                }
            }
            // 設定ボタン追加
            if (!document.getElementById('nav-settings')) {
                sidebar.insertAdjacentHTML('beforeend', `<div id="nav-settings" class="nav-item" onclick="Actions.showSettings()">⚙️<span>設定</span></div>`);
            }
            if (!document.getElementById('nav-admin-login')) {
                sidebar.insertAdjacentHTML('beforeend', `<hr><div id="nav-admin-login" class="nav-item" onclick="Actions.adminLogin()" style="opacity:0.5; font-size:12px;">🔑<span>${Storage.isAdmin() ? '管理者ログイン済み' : '管理者ログイン'}</span></div>`);
            }
        }
    },

    loadSidebarLatest() {},

    showSettings() {
        this.currentView = "settings";
        const container = document.getElementById('view-container');
        const currentKey = localStorage.getItem('custom_yt_api_key') || "";
        const playerMode = Storage.getPreferredPlayer();
        
        container.innerHTML = `
            <div style="padding:40px; max-width:600px; margin:0 auto;">
                <h2>⚙️ 設定</h2>
                <div style="margin-top:30px; background:#1e1e1e; padding:20px; border-radius:10px;">
                    <h3>YouTube APIキー</h3>
                    <p style="font-size:12px; color:#aaa;">自分のGoogle Cloud Consoleで取得したAPIキーを入力してください。未入力の場合はPipedサーバーを使用して検索します。</p>
                    <input type="password" id="setting-api-key" class="btn" style="width:100%; background:#000; color:#fff; text-align:left; margin-top:10px;" value="${currentKey}" placeholder="AIza...">
                    <button class="btn" style="margin-top:15px; background:#3ea6ff; color:#fff;" onclick="Actions.saveSettings()">保存</button>
                </div>
                <div style="margin-top:30px; background:#1e1e1e; padding:20px; border-radius:10px;">
                    <h3>デフォルト再生モード</h3>
                    <select id="setting-player-mode" class="btn" style="width:100%; background:#000; color:#fff; margin-top:10px;">
                        <option value="edu" ${playerMode === 'edu' ? 'selected' : ''}>YouTube Education (推奨)</option>
                        <option value="nocookie" ${playerMode === 'nocookie' ? 'selected' : ''}>YouTube No-Cookie</option>
                        <option value="m3u8" ${playerMode === 'm3u8' ? 'selected' : ''}>m3u8 Direct (Cobalt)</option>
                        <option value="proxy" ${playerMode === 'proxy' ? 'selected' : ''}>Proxy再生</option>
                    </select>
                </div>
            </div>
        `;
    },

    saveSettings() {
        const key = document.getElementById('setting-api-key').value;
        const mode = document.getElementById('setting-player-mode').value;
        localStorage.setItem('custom_yt_api_key', key);
        Storage.setPreferredPlayer(mode);
        this.showStatusNotification("設定を保存しました✅");
    },

    async playFromSidebar(vId) {
        const data = await YT.fetchAPI('videos', { id: vId, part: 'snippet' });
        if (data.items && data.items[0]) this.play(data.items[0]);
    },

    showResumeList() {
        this.currentView = "resume";
        const list = Storage.get('yt_resume_list');
        const container = document.getElementById('view-container');
        if (list.length === 0) {
            container.innerHTML = `<div style="padding:40px; text-align:center;"><h2>🕒 続きから見る動画はありません</h2><p style="color:#aaa;">視聴途中の動画がここに3つまで表示されます。</p></div>`;
            return;
        }
        this.currentList = list.map(x => ({ 
            id: x.id, snippet: { title: x.title, thumbnails: { high: { url: x.thumb } }, channelTitle: x.channelTitle, publishedAt: new Date(x.timestamp).toISOString() } 
        }));
        let html = `<div style="padding:20px;"><h2>🕒 続きから見る</h2><div class="grid">`;
        list.forEach((v, i) => {
            const progress = (v.time / v.duration) * 100;
            html += `
            <div class="v-card" onclick="Actions.playFromList(${i})">
                <div class="thumb-container">
                    <img src="${v.thumb}" class="main-thumb">
                    <div style="position:absolute; bottom:0; left:0; height:4px; width:${progress}%; background:#ff0000;"></div>
                    <div style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.8); padding:2px 5px; border-radius:4px; font-size:10px;">残り ${Math.floor((v.duration - v.time)/60)}分</div>
                </div>
                <div class="v-text"><h3>${v.title}</h3><p>${v.channelTitle}</p><p style="font-size:11px; color:#ff8c00;">再生再開位置: ${Math.floor(v.time/60)}分${v.time%60}秒</p></div>
            </div>`;
        });
        html += `</div></div>`;
        container.innerHTML = html;
    },

    adminLogin() {
        if (Storage.isAdmin()) return alert("既に管理者としてログインしています。");
        const pass = prompt("管理者パスワードを入力してください:");
        if (pass === "2973") {
            Storage.setAdmin(true); alert("管理者として認証されました✅"); location.reload();
        } else { alert("パスワードが違います。"); }
    },

    async fillStats(items) {
        const ids = items.map(i => YT.getVideoId(i)).filter(id => id).join(',');
        if (!ids || !YT.getCurrentKey()) return;
        const data = await YT.fetchAPI('videos', { id: ids, part: 'statistics' });
        if (data.items) { data.items.forEach(v => { this.videoStats[v.id] = v.statistics.viewCount; }); }
    },

    showMyPlaylists() {
        this.currentView = "my_playlists";
        const dict = Storage.getMyPlaylists();
        const container = document.getElementById('view-container');
        let html = `<div style="padding:20px;"><div style="display:flex; justify-content:space-between; align-items:center;"><h2>📂 マイプレイリスト</h2><button class="btn" onclick="Actions.createNewPlaylistPrompt()" style="background:#3ea6ff; color:#fff;">＋ 新規作成</button></div><div class="grid" style="margin-top:20px;">`;
        Object.keys(dict).forEach(name => {
            const count = dict[name].length;
            const thumb = count > 0 ? dict[name][0].thumb : "";
            html += `<div class="v-card" onclick="Actions.viewPlaylistDetail('${name.replace(/'/g, "\\\\'")}')"><div class="thumb-container" style="background:#333; display:flex; align-items:center; justify-content:center;">${thumb ? `<img src="${thumb}" class="main-thumb">` : '<span style="font-size:40px;">📂</span>'}<div style="position:absolute; bottom:5px; right:5px; background:rgba(0,0,0,0.8); padding:2px 8px; border-radius:4px; font-size:12px;">${count}本</div></div><div class="v-text"><h3>${name}</h3><button class="btn" onclick="event.stopPropagation(); Actions.deletePlaylistConfirm('${name.replace(/'/g, "\\\\'")}')" style="margin-top:5px; font-size:11px; padding:2px 8px;">削除</button></div></div>`;
        });
        html += `</div></div>`;
        container.innerHTML = html;
    },

    createNewPlaylistPrompt() {
        const name = prompt("プレイリスト名を入力してください:");
        if (name) { Storage.createPlaylist(name); this.showMyPlaylists(); }
    },

    deletePlaylistConfirm(name) {
        if (confirm(`プレイリスト「${name}」を削除しますか？`)) { Storage.deletePlaylist(name); this.showMyPlaylists(); }
    },

    viewPlaylistDetail(name) {
        this.currentView = "playlist_detail";
        this.activePlaylistName = name;
        const dict = Storage.getMyPlaylists();
        const list = dict[name] || [];
        this.currentList = list.map(v => ({ id: v.id, snippet: { title: v.title, thumbnails: { high: { url: v.thumb } }, channelTitle: v.channelTitle } }));
        const container = document.getElementById('view-container');
        container.innerHTML = `
            <div style="padding:20px;">
                <h2>📂 ${name}</h2>
                <button class="btn" onclick="Actions.playFromList(0)" style="margin-bottom:20px; background:#fff; color:#000;">▶ すべて再生</button>
                <div class="grid">
                    ${list.map((v, i) => `
                        <div class="v-card">
                            <div class="thumb-container" onclick="Actions.playFromList(${i})"><img src="${v.thumb}" class="main-thumb"></div>
                            <div class="v-text">
                                <h3>${v.title}</h3><p>${v.channelTitle}</p>
                                <button class="btn" onclick="Actions.removeFromPlaylistAndRefresh('${name.replace(/'/g, "\\\\'")}', '${v.id}')" style="font-size:11px; padding:2px 8px;">削除</button>
                            </div>
                        </div>`).join('')}
                </div>
            </div>`;
    },

    removeFromPlaylistAndRefresh(name, id) {
        Storage.removeFromPlaylist(name, id);
        this.viewPlaylistDetail(name);
    },

    async showAIRecommendations() {
        this.currentView = "ai_recommend";
        const container = document.getElementById('view-container');
        container.innerHTML = `<div style="padding:20px;"><h2>🤖 AIが分析中...</h2></div>`;
        const history = Storage.get('yt_history');
        if (history.length < 3) { container.innerHTML = `<div style="padding:20px;"><h2>🤖 あと ${3 - history.length} 件の視聴履歴が必要です。</h2></div>`; return; }
        try {
            const resp = await fetch('/api/get_recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history: history }) });
            const aiData = await resp.json();
            this.currentParams = { q: aiData.query, part: 'snippet', maxResults: 24, type: 'video' };
            const data = await YT.fetchAPI('search', this.currentParams);
            this.currentList = data.items || [];
            this.nextToken = data.nextPageToken || "";
            await this.fillStats(this.currentList);
            this.renderGrid(`<h2>🤖 AIおすすめ: ${aiData.query}</h2><p style="color:#aaa; margin:-10px 0 20px 0;">${aiData.explanation}</p>`);
        } catch (e) { container.innerHTML = `<div style="padding:20px;"><h2>AI分析エラーが発生しました。</h2></div>`; }
    },

    showStatusNotification(text) {
        const div = document.createElement('div');
        div.style = "position:fixed; top:20px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:white; padding:10px 20px; border-radius:20px; z-index:9999; font-size:14px; pointer-events:none; transition: opacity 0.5s;";
        div.innerText = text; document.body.appendChild(div);
        setTimeout(() => { div.style.opacity = '0'; setTimeout(() => div.remove(), 500); }, 3000);
    },

    async goHome() {
        this.currentView = "home";
        this.activePlaylistName = null;
        this.currentParams = { chart: 'mostPopular', regionCode: 'JP', part: 'snippet', maxResults: 24 };
        const data = await YT.fetchAPI('videos', this.currentParams);
        this.currentList = data.items || [];
        this.nextToken = data.nextPageToken || "";
        await this.fillStats(this.currentList);
        this.renderGrid("<h2>急上昇</h2>");
    },

    async showShorts() {
        this.currentView = "shorts";
        this.activePlaylistName = null;
        this.currentParams = { q: '#Shorts', part: 'snippet', type: 'video', videoDuration: 'short', maxResults: 24 };
        const data = await YT.fetchAPI('search', this.currentParams);
        this.currentList = data.items || [];
        this.nextToken = data.nextPageToken || "";
        await this.fillStats(this.currentList);
        this.renderGrid("<h2>ショート</h2>");
    },

    async showLiveHub() {
        this.currentView = "live";
        this.activePlaylistName = null;
        this.currentParams = { q: 'live', part: 'snippet', type: 'video', eventType: 'live', regionCode: 'JP', maxResults: 24 };
        const data = await YT.fetchAPI('search', this.currentParams);
        this.currentList = data.items || [];
        this.nextToken = data.nextPageToken || "";
        await this.fillStats(this.currentList);
        this.renderGrid("<h2>🔴 ライブ配信</h2>");
    },

    async search() {
        const q = document.getElementById('search-input').value;
        if (!q) return;
        let finalQ = q;
        const vParams = { part: 'snippet', maxResults: 15, type: 'video' };
        let includePlaylists = true;
        if (this.currentView === "shorts") {
            finalQ = `${q} #shorts`; vParams.videoDuration = "short"; includePlaylists = false;
        } else if (this.currentView === "live") {
            vParams.eventType = "live"; includePlaylists = false;
        }
        vParams.q = finalQ;
        this.currentParams = vParams;
        const promises = [YT.fetchAPI('search', vParams)];
        if (includePlaylists && YT.getCurrentKey()) {
            promises.push(YT.fetchAPI('search', { q, part: 'snippet', maxResults: 5, type: 'playlist' }));
        }
        const results = await Promise.all(promises);
        const vData = results[0];
        const plData = results[1] || { items: [] };
        this.currentList = [...plData.items.slice(0, 5), ...vData.items];
        this.nextToken = vData.nextPageToken || "";
        this.activePlaylistName = null; 
        await this.fillStats(this.currentList);
        this.renderGrid(`<h2>"${q}" の検索結果</h2>`);
    },

    renderCards(items) {
        return items.map((item, index) => {
            const snip = item.snippet;
            const thumb = YT.getProxiedThumb(item);
            const isPlaylist = !!(item.id?.playlistId || (item.kind === 'youtube#playlist'));
            const isLive = snip.liveBroadcastContent === 'live';
            const vId = YT.getVideoId(item);
            const plId = item.id?.playlistId || (typeof item.id === 'string' ? item.id : "");
            const stats = vId ? this.videoStats[vId] : null;
            const metaInfo = isPlaylist ? `<span style="color:#3ea6ff; font-weight:bold;">📋 再生リスト</span>` : `<span>${formatViews(stats)} • ${timeAgo(snip.publishedAt)}</span>`;
            const glowStyle = isLive ? 'box-shadow: 0 0 15px #ff0000; border: 2px solid #ff0000;' : '';
            return `
            <div class="v-card" style="${glowStyle}" onclick="${isPlaylist ? `Actions.showPlaylistView('${plId}', '${snip.title.replace(/'/g,"")}')` : `Actions.playFromList(${index})`}">
                <div class="thumb-container">
                    <img src="${thumb}" class="main-thumb">
                    ${isPlaylist ? '<div style="position:absolute; top:0; right:0; bottom:0; width:40%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; font-size:24px;">☰</div>' : ''}
                    ${isLive ? '<div class="live-badge" style="background:#ff0000;">● LIVE</div>' : ''}
                    <img src="${this.channelIcons[snip.channelId] || ''}" class="ch-icon-img" data-chid="${snip.channelId}">
                </div>
                <div class="v-text">
                    <h3 style="${isLive ? 'color:#ff4e45;' : ''}">${snip.title}</h3>
                    <p>${snip.channelTitle}</p>
                    <p style="font-size:11px; margin-top:2px; color:#aaa;">${metaInfo}</p>
                </div>
            </div>`;
        }).join('');
    },

    renderGrid(headerHtml = "") {
        const container = document.getElementById('view-container');
        const moreBtn = this.nextToken ? `<button class="btn" onclick="Actions.loadMore()" style="width:100%; margin:20px 0; background:#333; color:#fff;">もっと読み込む</button>` : "";
        if (headerHtml) container.dataset.header = headerHtml;
        const currentHeader = container.dataset.header || "";
        container.innerHTML = `<div style="padding: 10px 20px;">${currentHeader}</div><div class="grid">${this.renderCards(this.currentList)}</div>${moreBtn}`;
        const ids = this.currentList.map(i => i.snippet?.channelId).filter(id => id && !this.channelIcons[id]).join(',');
        if (ids && YT.getCurrentKey()) this.fetchMissingIcons(ids);
    },

    async loadMore() {
        if (!this.nextToken) return;
        let endpoint = 'search';
        if (this.currentView === 'home' && !this.currentParams.q) endpoint = 'videos';
        else if (this.currentView === 'playlist') endpoint = 'playlistItems';
        const data = await YT.fetchAPI(endpoint, { ...this.currentParams, pageToken: this.nextToken });
        const newItems = data.items || [];
        await this.fillStats(newItems);
        this.currentList = [...this.currentList, ...newItems];
        this.nextToken = data.nextPageToken || "";
        this.renderGrid();
    },

    playFromList(index) { this.currentIndex = index; this.play(this.currentList[index]); },
    playFromRelated(index) { 
        if (this.activePlaylistName) this.playFromList(index);
        else if (this.relatedList && this.relatedList[index]) this.play(this.relatedList[index]); 
    },
    playRelative(offset) {
        const newIndex = this.currentIndex + offset;
        if (newIndex >= 0 && newIndex < this.currentList.length) this.playFromList(newIndex);
        else if (newIndex >= this.currentList.length && this.activePlaylistName) this.playFromList(0);
    },

    async fetchMissingIcons(ids) {
        const data = await YT.fetchAPI('channels', { id: ids, part: 'snippet' });
        if (data.items) {
            data.items.forEach(ch => { this.channelIcons[ch.id] = ch.snippet.thumbnails.default.url; });
            document.querySelectorAll('.ch-icon-img').forEach(img => {
                const cid = img.dataset.chid; if (this.channelIcons[cid]) img.src = this.channelIcons[cid];
            });
        }
    },

    downloadVideo(vId) {
        const targetUrl = `https://ja.savefrom.net/1-youtube-video-downloader-175dk.html?url=${encodeURIComponent('https://www.youtube.com/watch?v='+vId)}`;
        window.open(targetUrl, '_blank');
    },

    changeSpeed(rate) {
        const iframe = document.querySelector('.video-wrapper iframe, .shorts-container iframe');
        if (iframe) iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'setPlaybackRate', args: [rate] }), '*');
    },

    handleWatchLater(id, title, channelTitle, thumb, channelId) {
        const proxiedThumb = `/api/thumb?id=${id}`;
        Storage.toggleWatchLater({ id, title, channelTitle, thumb: proxiedThumb, channelId });
        if (this.currentIndex !== -1 && !["subs","watchlater"].includes(this.currentView)) this.play(this.currentList[this.currentIndex]);
        else if (this.currentView === "watchlater") this.showWatchLater();
    },

    async showComments(vId, order = 'relevance') {
        let panel = document.getElementById('comment-panel');
        if (panel && panel.dataset.vId === vId && panel.dataset.order === order) {
            panel.remove(); document.querySelector('.watch-layout, .shorts-container').style.marginRight = "0"; return;
        }
        const layout = document.querySelector('.watch-layout, .shorts-container');
        if (layout) layout.style.marginRight = "400px";
        if (!panel) {
            panel = document.createElement('div'); panel.id = 'comment-panel';
            panel.style = "position:fixed; top:60px; right:0; width:400px; height:calc(100vh - 60px); background:#0f0f0f; border-left:1px solid #333; z-index:100; padding:20px; overflow-y:auto; color:white;";
            document.body.appendChild(panel);
        }
        panel.dataset.vId = vId; panel.dataset.order = order;
        panel.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;"><h3 style="margin:0;">コメント</h3><div style="display:flex; gap:10px;"><button class="btn" style="font-size:11px; padding:4px 8px; ${order === 'relevance' ? 'background:#3ea6ff;' : 'background:#333;'}" onclick="Actions.showComments('${vId}', 'relevance')">いいね順</button><button class="btn" style="font-size:11px; padding:4px 8px; ${order === 'time' ? 'background:#3ea6ff;' : 'background:#333;'}" onclick="Actions.showComments('${vId}', 'time')">新着順</button></div></div><div id="comment-list">読み込み中...</div>`;

        try {
            const resp = await fetch(`/api/komento?vId=${vId}&key=${YT.getCurrentKey() || YT.keys[0]}&order=${order}`);
            const data = await resp.json();
            const list = document.getElementById('comment-list');
            if (!data.items) { list.innerHTML = "コメント取得不可"; return; }
            list.innerHTML = data.items.map(item => {
                const c = item.snippet.topLevelComment.snippet;
                return `<div style="display:flex; gap:10px; margin-bottom:20px; font-size:13px;"><img src="${c.authorProfileImageUrl}" style="width:35px; height:35px; border-radius:50%;"><div><div style="font-weight:bold;">${c.authorDisplayName} <span style="color:#aaa; font-weight:normal;">${timeAgo(c.publishedAt)}</span></div><div style="margin-top:5px; white-space:pre-wrap;">${c.textDisplay}</div><div style="color:#aaa; margin-top:5px;">👍 ${c.likeCount}</div></div></div>`;
            }).join('');
        } catch (e) { document.getElementById('comment-list').innerHTML = "コメント取得失敗"; }
    },

    // 4種類の再生ソース生成
    getPlayerUrl(id, mode) {
        if (mode === 'edu') return YT.getEmbedUrl(id);
        if (mode === 'nocookie') return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=1`;
        if (mode === 'proxy') return `/api/proxy_player?id=${id}`;
        return ""; // m3u8はiframeではなくvideoタグで処理
    },

    async play(video) {
        const vId = YT.getVideoId(video);
        const snip = video.snippet;
        const currentMode = Storage.getPreferredPlayer();
        const isSubbed = Storage.get('yt_subs').some(x => x.id === snip.channelId);
        const isWatchLater = Storage.isWatchLater(vId);
        const safeTitle = snip.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeChTitle = snip.channelTitle.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const thumbUrl = `/api/thumb?id=${vId}`;
        
        window.scrollTo(0, 0);

        document.getElementById('view-container').innerHTML = `
            <div class="watch-layout">
                <div class="player-area">
                    <div class="video-wrapper" id="player-container">
                        ${currentMode === 'm3u8' ? `<video id="yt-player" controls autoplay style="width:100%; height:100%;"></video>` : `<iframe id="yt-player" src="${this.getPlayerUrl(vId, currentMode)}" style="width:100%; height:100%; border:none;" allowfullscreen allow="autoplay"></iframe>`}
                    </div>
                    <div style="margin-top:15px; display:flex; gap:10px; align-items:center; background:#1e1e1e; padding:10px 20px; border-radius:10px; flex-wrap:wrap;">
                        <span style="font-size:14px; color:#aaa;">再生ソース:</span>
                        <select id="source-selector" class="btn" style="background:#333; color:#fff;" onchange="Actions.switchPlayerSource('${vId}')">
                            <option value="edu" ${currentMode === 'edu' ? 'selected' : ''}>Education</option>
                            <option value="nocookie" ${currentMode === 'nocookie' ? 'selected' : ''}>No-Cookie</option>
                            <option value="m3u8" ${currentMode === 'm3u8' ? 'selected' : ''}>m3u8 (Direct)</option>
                            <option value="proxy" ${currentMode === 'proxy' ? 'selected' : ''}>Proxy</option>
                        </select>
                        <div style="flex-grow:1;"></div>
                        <button class="btn" onclick="Actions.changeSpeed(1.0)">1.0x</button>
                        <button class="btn" onclick="Actions.changeSpeed(2.0)">2.0x</button>
                    </div>
                    <div style="padding-top:15px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h2>${snip.title}</h2>
                            <select id="plist-select" class="btn" style="background:#333; color:#fff;"><option value="">📂 リストに追加</option>${Object.keys(Storage.getMyPlaylists()).map(n => `<option value="${n}">${n}</option>`).join('')}</select>
                        </div>
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:15px;">
                            <div style="display:flex; align-items:center; cursor:pointer;" onclick="Actions.showChannel('${snip.channelId}')">
                                <img src="${this.channelIcons[snip.channelId] || ''}" style="width:40px; height:40px; border-radius:50%;">
                                <span style="margin-left:10px; font-weight:bold;">${snip.channelTitle}</span>
                            </div>
                            <div style="display:flex; gap:8px;">
                                <button class="btn ${isSubbed ? 'subbed' : ''}" onclick="Actions.handleSub('${snip.channelId}', '${safeChTitle}', true)">登録</button>
                                <button class="btn" onclick="Actions.showComments('${vId}')">💬</button>
                                <button class="btn-download" onclick="Actions.downloadVideo('${vId}')">📥</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="related-area"><h3 id="side-title">関連動画</h3><div id="side-content-box"></div></div>
            </div>`;

        if (currentMode === 'm3u8') this.loadM3u8(vId);
        
        // 関連動画と履歴保存 (既存ロジック継承)
        this.loadRelatedVideos(vId, snip.title);
        Storage.addHistory({ id: vId, title: snip.title, thumb: thumbUrl, channelTitle: snip.channelTitle });
    },

    async switchPlayerSource(vId) {
        const mode = document.getElementById('source-selector').value;
        Storage.setPreferredPlayer(mode);
        const container = document.getElementById('player-container');
        if (mode === 'm3u8') {
            container.innerHTML = `<video id="yt-player" controls autoplay style="width:100%; height:100%;"></video>`;
            this.loadM3u8(vId);
        } else {
            container.innerHTML = `<iframe id="yt-player" src="${this.getPlayerUrl(vId, mode)}" style="width:100%; height:100%; border:none;" allowfullscreen allow="autoplay"></iframe>`;
        }
    },

    async loadM3u8(vId) {
        const videoTag = document.getElementById('yt-player');
        try {
            const res = await fetch('https://api.cobalt.tools/api/json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${vId}` })
            });
            const data = await res.json();
            if (data.url) videoTag.src = data.url;
            else alert("Cobalt APIからの取得に失敗しました。他のソースを試してください。");
        } catch (e) { console.error("m3u8 load error", e); }
    },

    async loadRelatedVideos(vId, title) {
        const sideBox = document.getElementById('side-content-box');
        const qK = title.replace(/[【】「」]/g, ' ').split(' ').slice(0, 3).join(' ');
        const rel = await YT.fetchAPI('search', { q: qK, type: 'video', part: 'snippet', maxResults: 15 });
        this.relatedList = rel.items || [];
        sideBox.innerHTML = this.relatedList.map((i, idx) => `
            <div class="v-card" style="display:flex; gap:10px; margin-bottom:12px;" onclick="Actions.playFromRelated(${idx})">
                <img src="${YT.getProxiedThumb(i)}" style="width:140px; aspect-ratio:16/9; object-fit:cover; border-radius:8px;">
                <div style="font-size:12px;"><div style="font-weight:bold; line-clamp:2; display:-webkit-box;">${i.snippet.title}</div><div style="color:#aaa;">${i.snippet.channelTitle}</div></div>
            </div>`).join('');
    },

    async showChannel(chId) {
        this.currentView = "channel";
        const chData = await YT.fetchAPI('channels', { id: chId, part: 'snippet,brandingSettings' });
        const ch = chData.items[0];
        const isSubbed = Storage.get('yt_subs').some(x => x.id === chId);
        document.getElementById('view-container').innerHTML = `
            <div class="channel-header">
                <div style="width:100%; height:150px; background:url(${ch.brandingSettings?.image?.bannerExternalUrl || ''}) center/cover #333; border-radius:15px;"></div>
                <div style="display:flex; align-items:center; padding:20px;">
                    <img src="${ch.snippet.thumbnails.medium.url}" style="width:80px; height:80px; border-radius:50%;">
                    <div style="margin-left:20px;"><h1>${ch.snippet.title}</h1></div>
                    <button class="btn ${isSubbed ? 'subbed' : ''}" style="margin-left:auto;" onclick="Actions.handleSub('${chId}', '${ch.snippet.title.replace(/'/g, "\\\\'")}', true)">登録済み</button>
                </div>
                <div class="tabs"><div class="tab active" onclick="Actions.loadChannelTab('${chId}', 'videos', 'date')">最新</div><div class="tab" onclick="Actions.loadChannelTab('${chId}', 'playlists')">再生リスト</div></div>
            </div><div id="channel-content-grid" class="grid"></div><div id="more-btn-area"></div>`;
        this.loadChannelTab(chId, 'videos', 'date');
    },

    async loadChannelTab(chId, type, order = 'date') {
        const grid = document.getElementById('channel-content-grid');
        if (type === 'videos') {
            const data = await YT.fetchAPI('search', { channelId: chId, part: 'snippet', type: 'video', order: order, maxResults: 24 });
            this.currentList = data.items || []; this.nextToken = data.nextPageToken || "";
            grid.innerHTML = this.renderCards(this.currentList);
        } else if (type === 'playlists') {
            const data = await YT.fetchAPI('playlists', { channelId: chId, part: 'snippet', maxResults: 24 });
            this.currentList = data.items || [];
            grid.innerHTML = this.renderCards(this.currentList);
        }
    },

    async showPlaylistView(plId, title) {
        this.currentView = "playlist";
        const data = await YT.fetchAPI('playlistItems', { playlistId: plId, part: 'snippet,contentDetails', maxResults: 24 });
        this.currentList = data.items || []; this.renderGrid(`<h2>再生リスト: ${title}</h2>`);
    },

    handleSub(id, name, refresh = false) {
        Storage.toggleSub({ id, name, thumb: this.channelIcons[id] || '' });
        if (refresh && this.currentView === "channel") this.showChannel(id);
    },

    async showSubs() {
        this.currentView = "subs";
        const subs = Storage.get('yt_subs');
        const container = document.getElementById('view-container');
        const channelItemsHtml = subs.map(ch => `
            <div style="flex: 0 0 auto; text-align: center; width: 85px; cursor: pointer;" onclick="Actions.showChannel('${ch.id}')">
                <img src="${ch.thumb}" style="width: 65px; height: 65px; border-radius: 50%; border: 2px solid #444;">
                <div style="font-size: 11px; color: #fff; margin-top: 8px;">${ch.name}</div>
            </div>`).join('');
        container.innerHTML = `<div style="display:flex; overflow-x:auto; gap:20px; padding:20px; border-bottom:1px solid #333;">${channelItemsHtml}</div><div id="subs-timeline-grid" class="grid" style="padding:20px;"></div>`;
        // タイムライン取得ロジック（簡略版）
        if (subs.length > 0) {
            const data = await YT.fetchAPI('search', { q: subs[0].name, part: 'snippet', type: 'video', maxResults: 10 });
            document.getElementById('subs-timeline-grid').innerHTML = this.renderCards(data.items);
        }
    },

    showWatchLater() {
        this.currentView = "watchlater";
        const list = Storage.get('yt_watchlater');
        this.currentList = list.map(x => ({ id: x.id, snippet: { title: x.title, thumbnails: { high: { url: x.thumb } }, channelTitle: x.channelTitle, publishedAt: new Date().toISOString() } }));
        this.renderGrid("<h2>📌 後で見る</h2>");
    },

    toggleIncognito() {
        const current = Storage.isIncognito();
        Storage.setIncognito(!current);
        location.reload();
    },

    showHistory() {
        this.currentView = "history";
        const history = Storage.get('yt_history');
        this.currentList = history.map(x => ({ id: x.id, snippet: { title: x.title, thumbnails: { high: { url: x.thumb } }, channelTitle: x.channelTitle, publishedAt: new Date().toISOString() } }));
        this.renderGrid("<h2>🕒 履歴</h2>");
    },

    showGame() {
        GameModule.renderGameMenu();
    }
};

window.onload = async () => { 
    Actions.init(); 
    await YT.refreshEduKey(); 
    Actions.goHome(); 
};

// 継承されたゲーム起動関数群
function startTetris() { if (typeof initTetris === 'function') initTetris(); }
function startSnake() { if (typeof initSnake === 'function') initSnake(); }
function startReversi() { if (typeof initReversi === 'function') initReversi(); }
function startShogi() { if (typeof initShogi === 'function') initShogi(); }
function startBlockBlast() { if (typeof initBlock === 'function') initBlock(); }
function start2048() { if (typeof init2048 === 'function') init2048(); }
