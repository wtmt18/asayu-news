# 朝夕 配信手順（Claude用）

読者はわたるさんと家族。毎日 朝刊（8時ごろ）・夕刊（18時ごろ）に、ニュース号とマーケット号を作って暗号化し、このリポジトリに push する。push すると GitHub Pages に載り、GitHub Actions がプッシュ通知を送る。質問はせずに最後まで進める。

## 0. 準備
- リポジトリは `/home/claude/asayu-news`。無ければ `git clone https://github.com/wtmt18/asayu-news /home/claude/asayu-news`（タイムアウト長め）。あれば `git -C /home/claude/asayu-news pull --rebase origin main`。
- 合言葉は配信依頼メッセージにある。`export ASAYU_PASSCODE='<合言葉>'` を、以降の python コマンドと同じシェル呼び出しの中で毎回設定する。合言葉はファイル・コミット・返答に書かない。
- データは `scripts/add_market.py` と `scripts/add_edition.py` 経由でだけ書く（自動で暗号化）。アプリのHTML/CSS/JS、sw.js、config.js、push/、.github/ は触らない。cryptography が無ければ `pip install --break-system-packages cryptography`。

## 1. 号の判定
mcp__claude_ai__current_time で日本時間。12時前は「朝刊」、以降は「夕刊」。号ID は `YYYY-MM-DD-am` / `YYYY-MM-DD-pm`（ニュース・マーケット共通）。

## 2. 前号の確認
- `python3 scripts/show_index.py 2` で直近2号の見出し。同じ話題は大きな続報がない限り外す。
- マーケット前回：`cd scripts && python3 -c "from asayu_crypto import *; import json; i=read_enc(ROOT/'data/market/index.json')[0]['id']; print(json.dumps(read_enc(ROOT/f'data/market/{i}.json'),ensure_ascii=False)[:6000])"`

## 3. ニュース（/home/claude/ed.json）
- must 5〜6本：日本と世界の重要ニュース。直近12〜18時間優先、一次報道で確認。夕刊はその日の株価・為替や新しい発表も。1本目がいちばん大事なニュース。
- sci 4〜5本：Nature、Science、ScienceDaily、Phys.org、EurekAlert、大学プレスリリース等から「へぇ」な研究。分野を散らし、材料・ものづくり・AI for Science があれば1本。
- 家族向けに専門用語をかみくだく。事実は検索結果で確認。政治は中立。要約は自分の言葉で（引用しない）。
- 形式：
```
{"date","edition","title":"M月D日（曜）朝刊","lead":"押さえておきたいN本 ＋ 学術のおもろいM本","createdAt":"YYYY-MM-DDTHH:MM:SS+09:00",
 "items":[{"section":"must|sci","tag","headline","summary","point":"💡…|🤓…","svg","sources":[{"label","url"}]}]}
```

## 4. マーケット（/home/claude/mk.json）
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
cd /home/claude/asayu-news && git pull --rebase origin main
export ASAYU_PASSCODE='<合言葉>'
python3 scripts/add_market.py /home/claude/mk.json <号ID>
python3 scripts/add_edition.py /home/claude/ed.json <号ID>
python3 scripts/show_index.py 1
git add data && git -c user.name="asayu-bot" -c user.email="wtmt18@users.noreply.github.com" commit -m "<号ID> を追加"
git push origin main
```
- add_market を先に（通知はニュース号の追加で出る）。push 前に1本目の見出しの一部で `grep -c` し、data/index.json に平文が無い（0）ことを確認。
- マーケットが失敗してもニュース号は必ず配信。

## 6. 次回の予約と報告
- 配信が終わったら、mcp__claude-code-remote__send_later で **この号のちょうど7日後の同じ時刻（07:45 か 17:45、Asia/Tokyo）** に、今回受け取ったのと同じ配信依頼メッセージを予約する（予約は常に1週間先まで並んでいる状態を保つ）。
- 返答は短く：「📰 朝夕【朝刊/夕刊】を配信しました」＋見出し（学術は🔬）＋「📈 マーケット：<headline>」＋ `https://wtmt18.github.io/asayu-news/#e-<号ID>`。失敗時は理由をはっきり書く。
