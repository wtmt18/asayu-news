# 朝夕

家族向けのニュースアプリ（PWA）。号のデータは合言葉で暗号化されています。

- アプリ本体: `index.html` / `style.css` / `app.js` / `sw.js`
- 号のデータ: `data/index.json`（一覧）、`data/editions/<id>.json`（各号）
- 号の追加: `python3 scripts/add_edition.py <edition.json> <id>` → commit & push
- `data/latest.json` が更新されると GitHub Actions が通知を送ります（`VAPID_PRIVATE_KEY` シークレットが必要）
- 通知の登録コードは `push/subscriptions.json` に追記します
