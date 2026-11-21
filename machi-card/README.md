# 街カード

街歩きを記録して、最寄り駅の「街カード」をつくるアプリです。
Expo（SDK 58）＋ Expo Router ＋ TypeScript。Web 版を Vercel で公開する前提です。

## できること

1. **散歩記録**：「散歩スタート」で現在地を1点すぐ記録し、その後も位置を記録し続けます。散歩中はメモを入れて「ここにピン」で現在地にピンを立てられます。
2. **街カード**：「散歩を終える」と、歩き始めた地点から1km以内の駅を OpenStreetMap の Overpass API で探して候補を出します。各駅を通る路線名も表示します（「(池袋→飯能)」のような向きの表記は除いてまとめます）。駅を選ぶか手入力し、一言キャッチコピーを付けて保存します。海外の駅でも使えます。
3. **保存**：AsyncStorage（Web では localStorage）に保存するので、開き直しても残ります。カードの削除もできます。
4. **地図**：Web 版では Leaflet と OpenStreetMap タイルで、ルートを線、ピンを丸で表示します（散歩中と、カードの「地図を見る」）。iOS / Android 版では地図の代わりに案内の文言を出します。
5. **路線の制覇率**：保存したカードに出てくる路線の一覧。タップすると Overpass でその路線の駅一覧を取得し、「訪問済み◯/全◯駅（◯%）」とバー、駅一覧（訪問済みに印）を表示します。駅一覧は端末に保存（キャッシュ）します。
6. **答え合わせ**：カードごとに「質問文をコピー」（駅名・路線・キャッチコピー・ピンのメモ入りで、歴史や地名の由来を聞く文章）、「Claudeを開く」（https://claude.ai/new）、答えを貼り付けて保存する欄があります。

## 開発

```bash
cd machi-card
npm install
npx expo start --web
```

Web 版の書き出しとテスト：

```bash
npx expo export --platform web
```

```bash
node tests/e2e.mjs
```

`tests/e2e.mjs` は書き出した `dist/` をブラウザ（Playwright）で開き、散歩 → 駅の候補 → 保存 → 答え合わせ → 路線の制覇率 → 削除 までを確認します。Overpass API への通信はダミーの応答に置き換えています。

## ファイルの場所

- `src/app/` … 画面（Expo Router）。`index`（ホーム・散歩中）／`finish`（街カードをつくる）／`card/[id]`（カード）／`lines/`（路線の制覇率）
- `src/lib/overpass.ts` … Overpass API の検索と結果の読み取り
- `src/lib/geo.ts` … 距離計算、路線名から向きの表記を除く処理
- `src/lib/AppState.tsx` … 散歩の記録（expo-location）とカードの状態
- `src/components/WalkMap.web.tsx` … Web 版の地図（Leaflet）／`WalkMap.tsx` … ネイティブ版（文言だけ）

## Vercel で公開する手順

このアプリはリポジトリの `machi-card/` フォルダにあります。

1. https://vercel.com にログインし、「Add New…」→「Project」を押す
2. GitHub のこのリポジトリを選んで「Import」
3. 「Root Directory」の「Edit」を押して `machi-card` を選ぶ
4. 「Framework Preset」は「Other」のまま
5. 「Build and Output Settings」を開き、次のようにする（`vercel.json` にも同じ設定を書いてあるので、空欄のままでも動きます）
   - Build Command：`npx expo export --platform web`
   - Output Directory：`dist`
6. 「Deploy」を押す

`app.json` の `web.output` は `"single"`（1枚の index.html で動く形）です。`/card/...` などのURLを直接開いても表示できるよう、`vercel.json` で全てのパスを `index.html` に向けています。

位置情報はブラウザでは HTTPS のページでしか使えません（Vercel の公開URLは HTTPS なので問題ありません）。
