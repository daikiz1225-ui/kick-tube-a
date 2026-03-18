from http.server import BaseHTTPRequestHandler
import json
import re
from collections import Counter

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        data = json.loads(post_data)
        
        history = data.get('history', [])
        recommend_query = "YouTube おすすめ"
        explanation = "視聴履歴から今のトレンドを解析中..."

        if len(history) > 0:
            all_text = ""
            hashtags = []
            
            # 直近5件のタイトルと説明文をスキャン
            for item in history[:5]:
                title = item.get('title', '')
                desc = item.get('description', '') # app.jsで送っていれば取得可能
                combined = f"{title} {desc}"
                all_text += " " + combined
                
                # 1. ハッシュタグを抽出（これが一番「ハマってるもの」を表しやすい）
                tags = re.findall(r'#(\w+)', combined)
                hashtags.extend(tags)

            # 2. ハッシュタグがあれば、その中で最も多いものを採用
            if hashtags:
                most_common_tag = Counter(hashtags).most_common(1)[0][0]
                recommend_query = most_common_tag
                explanation = f"ハッシュタグ #{most_common_tag} からおすすめを生成"
            
            else:
                # 3. ハッシュタグがない場合：タイトルから固有名詞っぽ単語を抽出
                # 【 】や [ ] の中身はジャンル名（例：ポケポケ、スプラ）が多いので優先
                brackets = re.findall(r'[【「\[](.*?)[】」\]]', all_text)
                
                # 掃除：よくあるノイズ単語を除外
                noise = r'(実況|配信|動画|公式|最新|攻略|対戦|まとめ|LIVE|shorts)'
                clean_brackets = [re.sub(noise, '', b).strip() for b in brackets if len(re.sub(noise, '', b).strip()) >= 2]
                
                if clean_brackets:
                    # カッコ内の単語で一番多いものを採用
                    best_word = Counter(clean_brackets).most_common(1)[0][0]
                    recommend_query = best_word
                    explanation = f"よく見ている「{best_word}」関連のおすすめ"
                else:
                    # 4. 最終手段：単純な単語の出現頻度
                    words = re.findall(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]{2,}', all_text)
                    # ノイズ削除
                    filtered_words = [w for w in words if not re.match(noise, w)]
                    if filtered_words:
                        best_word = Counter(filtered_words).most_common(1)[0][0]
                        recommend_query = best_word
                        explanation = f"最近の関心事「{best_word}」から検索"

        # レスポンス送信
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        res_data = {"query": recommend_query, "explanation": explanation}
        self.wfile.write(json.dumps(res_data).encode())
