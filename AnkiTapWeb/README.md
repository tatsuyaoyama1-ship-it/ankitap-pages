# AnkiTap Web

Chromeなどのブラウザで動くローカルWeb版です。

## 起動方法

このフォルダではなく、プロジェクト全体のフォルダでローカルサーバーを起動します。

```sh
cd /Users/ooyamatatsuya/Documents/Codex/2026-05-19/iphone-pc-xcode
python3 -m http.server 8787
```

その後、Chromeで次のURLを開きます。

```text
http://localhost:8787/AnkiTapWeb/
```

## データ

Web版は、iPhoneアプリと同じ `AnkiTap/AnkiTap/cards.csv` を読み込みます。
そのため、`cards.csv`を更新するとWeb版にも反映されます。
