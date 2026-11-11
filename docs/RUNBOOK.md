# 朝夕 配信手順（Claude用）

読者はわたるさんと家族。毎日 朝刊（8時ごろ）・夕刊（18時ごろ）に、ニュース号とマーケット号を作って暗号化し、このリポジトリに push する。push すると GitHub Pages に載り、GitHub Actions がプッシュ通知を送る。質問はせずに最後まで進める。

## 0. 準備
- リポジトリ wtmt18/asayu-news を使う。クラウド定期タスクでは開始時に clone 済み（作業ディレクトリ）。このチャットでは `/home/claude/asayu-news`（無ければ `git clone https://github.com/wtmt18/asayu-news /home/claude/asayu-news`）。最初に `git pull --rebase origin main`。
- 合言葉は配信依頼メッセージにある。`export ASAYU_PASSCODE='<合言葉>'` を、以降の python コマンドと同じシェル呼び出しの中で毎回設定する。合言葉はファイル・コミット・返答に書かない。
- データは `scripts/add_market.py` と `scripts/add_edition.py` 経由でだけ書く（自動で暗号化）。アプリのHTML/CSS/JS、sw.js、config.js、push/、.github/ は触らない。cryptography が無ければ `pip install --break-system-packages cryptography`。

## 1. 号の判定
mcp__claude_ai__current_time で日本時間。12時前は「朝刊」、以降は「夕刊」。号ID は `YYYY-MM-DD-am` / `YYYY-MM-DD-pm`（ニュース・マーケット共通）。

## 2. 前号の確認
- `python3 scripts/show_index.py 2` で直近2号の見出し。同じ話題は大きな続報がない限り外す。
- マーケット前回：`cd scripts && python3 -c "from asayu_crypto import *; import json; i=read_enc(ROOT/'data/market/index.json')[0]['id']; print(json.dumps(read_enc(ROOT/f'data/market/{i}.json'),ensure_ascii=False)[:6000])"`

## 3. ニュース（/home/claude/ed.json）　items は must → local → sci の順
- must 5〜6本：日本と世界の重要ニュース。直近12〜18時間優先、一次報道で確認。夕刊はその日の株価・為替や新しい発表も。1本目がいちばん大事なニュース。
- sci 4〜5本：Nature、Science、ScienceDaily、Phys.org、EurekAlert、大学プレスリリース等から「へぇ」な研究。分野を散らし、材料・ものづくり・AI for Science があれば1本。
- local（地元のニュース）：まず `python3 scripts/sync_areas.py` を実行する（家族がアプリで登録した地域を復号して data/areas.json を更新し、対象地域を1行ずつ表示する）。表示された**すべての地域**について各1〜2本（地域が6つを超えるときは各1本）。item に `"area": "<表示された地域名そのまま>"` を入れる（アプリはこの文字列で各自の地元を判定する）。
  - 優先順：①安全に関わる情報（地震・大雨・大雪・断水・停電・交通止め・事件）②役所の発表（自治体公式サイト、区報・市政だより）③地元報道（NHK各局、中日新聞、新潟日報など）④近日のイベント・開店閉店などの暮らしの話題（号外NET、ながおか速報など）。
  - 日付は必ず確認し、終わったイベントは載せない。新しい話題がない地域は、近日のイベントや生活情報で1本にする。
  - 個人が特定できる事件・事故の詳細は書かない。
- 家族向けに専門用語をかみくだく。事実は検索結果で確認。政治は中立。要約は自分の言葉で（引用しない）。
- 形式：
```
{"date","edition","title":"M月D日（曜）朝刊","lead":"押さえておきたいN本 ＋ 地元L本 ＋ 学術のおもろいM本","createdAt":"YYYY-MM-DDTHH:MM:SS+09:00",
 "items":[{"section":"must|local|sci","area":"（localのみ）","tag","headline","summary","point":"💡…|🤓…","svg","sources":[{"label","url"}]}]}
```

## 3.5 天気（ed.json の "weather"）　出典はウェザーニュースのみ
- 対象：`sync_areas.py` が表示した**すべての地域**。朝刊は「きょう」、夕刊は「あす」の予報。
- 探し方：地域ごとに WebSearch（mode standard、allowed_domains に `weathernews.jp`）で「ウェザーニュース <地域名> 最新天気」と「ウェザーニュース <地域名>の天気予報」を検索し、結果に出た `https://weathernews.jp/v/wl/?city=<コード>` か `https://weathernews.jp/onebox/tenki/<地方>/<コード>/` を WebFetch する（URLを自分で組み立てると取得できないことがある）。
- ページの「今日」の日付が号の日付と合っているか必ず確認する。古いページしか取れないときは、もう一方のURLを試す。どちらも古ければ、その地域は入れずに配信を続ける（作り話の数字は書かない）。
- 天気の言葉（晴れ時々くもり など）が無いページは、onebox 側の日別カードから補う。
- 形式（ページの数字をそのまま）：
```
"weather": {"day":"きょう12日（木）|あす13日（金）","source":"ウェザーニュース","at":"12日7時ごろ",
 "areas":[{"area":"<sync_areasの地域名そのまま>","icon":"☀️|🌤️|⛅|☁️|🌧️|🌦️|❄️|⛈️","telop":"晴れ時々くもり","max":17,"min":8,
   "pops":[{"t":"〜6時","p":"0%"},{"t":"〜12時","p":"10%"}],"comment":"ページの一言コメントを短く言い換え（引用しない）","url":"<実際に開いたURL>"}]}
```
- 天気だけを後から直すときは `python3 scripts/add_edition.py <json> <号ID> --no-notify`（通知を二重に送らない）。

## 3.6 天気タブ（全国の天気・/home/claude/wx.json）　毎号更新・通知なし
- アプリ下の「天気」タブ用。号とは別ファイル（data/weather/latest.json）で、`scripts/add_weather.py` で上書きする。
- 都市（固定）：札幌 douou/01100、仙台 miyagi/04100、東京 tokyo/13101（千代田区）、新潟 niigata/15100、金沢 ishikawa/17201、名古屋 aichi/23100、大阪 osaka/27100、広島 hiroshima/34100、高知 kouchi/39201、福岡 fukuoka/40130、鹿児島 kagoshima/46201、那覇 okinawa/47201（すべて `https://weathernews.jp/onebox/tenki/<地方>/<コード>/`）。さらに sync_areas の**登録地域すべて**を、その地方の中に入れる（area は sync_areas の地域名そのまま。わたしの地元に自動で並ぶ）。
- 取り方：都市ごとに WebSearch（allowed_domains `weathernews.jp`）「ウェザーニュース <都市名>の天気 onebox tenki」。検索結果の本文に日別の「日付 (曜)・最高・最低・降水確率%」が並ぶので、そこから5日分を拾う（%の付いた日＝予報。ミリの日は過去なので使わない）。並列にまとめて検索してよい。
- days は朝刊なら「きょう〜4日後」、夕刊なら「あす〜5日後」。その日が無い都市は null（作らない）。登録地域で今日の分しか取れない時は d を1日分だけにし、note に「あすからの予報は、次の号で更新します。」。
- telop/icon はページに天気の言葉が書かれている時だけ（3.5で取った登録地域の値を流用してよい）。summary はウェザーニュースの「全国の天気予報」の概況を自分の言葉で2〜3文に。
- 形式は scripts/add_weather.py の先頭コメントのとおり。実行：`python3 scripts/add_weather.py /home/claude/wx.json`（5. の add_market の後）。失敗してもニュース号は配信する。

## 4. マーケット（/home/claude/mk.json）
- numbers には毎号必ず「NYダウ」「S&P500」「VIX（恐怖指数）」の直近終値と前日比を入れる（add_market.py が無いと止まる）。ほかに日経平均・TOPIX・ドル円など。値は今回の検索で確かめたものだけ（みんかぶ「米国株概況」「【恐怖指数】」記事、共同通信のNY株式終値など）。
- 目的：すでに大きく上がった主役ではなく、流れがこれから波及しそうな会社を、理由とリスクつきで紹介。日本株・米国株の両方。テーマ3〜5、各1〜3社、計8〜12社。
- 各テーマに leaders（すでに上がった主役）と stage（いまの段階）。主役を入れるなら「見極め枠」と明記。
- 前回の銘柄は新材料があるときだけ続投し理由を更新。流れが変わったテーマは入れ替え。
- 事実はすべて今回の検索で確認できたものだけ。各銘柄に実際に開いた出典URL。株価予想・出典なしの数値・目標株価は書かない。表現は「伸びるかもしれない」「調べる価値がある」まで。
- 形式：
```
{"date","edition","title":"M月D日（曜）マーケット","createdAt","headline":"流れを一言で（40字程度）",
 "flow":{"summary","points":[{"icon","title","text"}],"svg"},
 "numbers":[{"label","value","note","src"}],
 "themes":[{"name","why","stage","svg","leaders","picks":[{"name","ticker","market":"JP|US","biz","why","risk","watch","sources":[{"label","url"}]}]}],
 "caution":"ここに並ぶ銘柄は、ニュースから読み取れる流れをもとに「調べてみる価値がある会社」を挙げたもので、売買をすすめるものではありません。Claudeは投資の専門家ではなく、株価の予想もできません。買う前に、会社の決算資料や株価の水準を自分で確認し、余裕資金の範囲で判断してください。"}
```

## ポンチ絵（svg）
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200" role="img" aria-label="…">` で始まる1行。簡単な図形・矢印・吹き出し・短い日本語ラベル。太めの線、明るい色、角丸。image/use/script/foreignObject・外部URL禁止。実在人物の似顔絵・ロゴ・キャラクター禁止。id は号内で重複させない。JSONの引用符エスケープに注意し、保存後 `python3 -c "import json;json.load(open(...))"` で必ず確認。

## 5. 追加と公開
```
cd <リポジトリ> && git pull --rebase origin main
export ASAYU_PASSCODE='<合言葉>'
python3 scripts/add_market.py /home/claude/mk.json <号ID>
python3 scripts/add_weather.py /home/claude/wx.json
python3 scripts/add_edition.py /home/claude/ed.json <号ID>
python3 scripts/show_index.py 1
git add data && git commit -m "<号ID> を追加"
git push origin HEAD:main
```
- コミットの作者は環境の既定（わたるさんのGitHubアカウント）のままにする。`-c user.name=...` で別名にしない。
- add_market を先に（通知はニュース号の追加で出る）。push 前に1本目の見出しの一部で `grep -c` し、data/index.json に平文が無い（0）ことを確認。
- main への push が拒否されたら `git push -f origin HEAD:claude/publish` を実行する。GitHub Actions が main に反映し、通知も送る。
- マーケットが失敗してもニュース号は必ず配信。

## 6. 報告
- 返答は短く：「📰 朝夕【朝刊/夕刊】を配信しました」＋見出し（学術は🔬）＋「📈 マーケット：<headline>」＋ `https://wtmt18.github.io/asayu-news/#e-<号ID>`。失敗時は実行したコマンドとエラーをそのまま書く。
- 11月17日夕刊までは、このチャットに予約した配信依頼で動く（配信依頼メッセージに「7日後の同じ時刻に予約」と書いてあっても、追加しない。2026-11-10 にわたるさんの指示で変更）。11月18日朝刊からは、リポジトリ付きのクラウド定期タスクが同じ手順で動く。
