/**
 * 画面の表示・非表示（ホーム/プレイヤー）を切り替えるモジュール
 */
export const UISwitcher = {
    showHome() {
        document.getElementById('view-home').style.display = 'block';
        document.getElementById('view-player').style.display = 'none';
        // プレイヤー画面を去る時はiframeを空にして音を止める
        document.getElementById('player-container').innerHTML = '';
    },

    showPlayer() {
        document.getElementById('view-home').style.display = 'none';
        document.getElementById('view-player').style.display = 'block';
    }
};

// 「戻る」ボタンのイベント設定
document.getElementById('back-to-home')?.addEventListener('click', () => {
    UISwitcher.showHome();
});
