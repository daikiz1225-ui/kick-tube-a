/* storage.js */
const Storage = {
    save(key, data) { localStorage.setItem(key, JSON.stringify(data)); },
    load(key) { return JSON.parse(localStorage.getItem(key)); },

    getHistory() { return this.load('yt_history') || []; },
    addHistory(video) {
        let h = this.getHistory().filter(v => v.id !== video.id);
        h.unshift(video);
        this.save('yt_history', h.slice(0, 50));
    },

    getSubs() { return this.load('yt_subs') || []; },
    toggleSub(channel) {
        let s = this.getSubs();
        const idx = s.findIndex(c => c.id === channel.id);
        if (idx > -1) s.splice(idx, 1);
        else s.push(channel);
        this.save('yt_subs', s);
        return idx === -1; // 登録したか解除したか
    }
};
