# TomoTomo

毎日10分、ニュースと教養が知識マップでつながっていく、社会人向けAI教養トレーナー。

- `index.html` … アプリの入口（`src/` のファイルを順に読み込みます。ビルド不要）
- `src/` … アプリ本体
  - `data.js` 学習データ（サンプル3テーマ＝教材の品質基準）
  - `core.js` 共通処理・状態（localStorage `tomotomo:v1`）・claude.ai のクラウド同期
  - `learning.js` 次の学習推薦・レッスン組み立て・採点
  - `ai.js` **AIアダプタ**（バックエンド → claude.ai → 簡易AI の順に切り替え。バックエンドとの約束もここに記載）
  - `partners.js` 学習パートナー（見た目と話し方のみ）
  - `views.js` / `map.js` / `lesson.js` 画面・知識マップ・学習オーバーレイ
  - `app.js` ボタン操作と起動
  - `styles.css` 見た目
- `server/` … AIサーバー（Cloudflare Workers）。採点 `/api/feedback`・対話 `/api/chat`・接続確認 `/api/health`
- `tests/` … 操作フローの自動テスト
- `CLAUDE.md` … Claude Code 用のプロジェクトガイド
- `docs/` … 仕様書置き場

## 手元で動かす

```sh
npm start        # http://127.0.0.1:8080/ で起動
```

（`index.html` をダブルクリックで開いても動きます）

## 動作確認（自動テスト）

```sh
npm install      # 初回だけ
npm test         # アプリ
cd server && npm install && npm test   # AIサーバー（本物のAPIは呼ばず、偽のAPIで確認）
```

ヘッドレスブラウザで「ログイン → オンボーディング → 学習 → クイズ → 思考問題 → 結果 → 知識マップ更新 → 2回目の学習 → 各タブ → ニュース対話 → 再読み込み」を通しで操作し、エラーが出ないこと・XPや知識マップが保存されることを確かめます。AIは「簡易AI」「claude.ai 上」「バックエンドあり」「バックエンド停止中」の4通りで確認します。

## AIサーバーの準備（オーナーが行う作業）

本物のAIで採点・対話するための準備です。全部で30分ほど。パソコンのブラウザで行うのがおすすめです。
（画面の表示名は変わることがあります。見つからないときは近い名前のボタンを探してください）

### A. Anthropic で APIキーを作る

1. https://platform.claude.com を開き、「Sign up」からアカウントを作る（Googleアカウントでも可）。
2. 左下の自分の名前 → 「Settings（設定）」→ 「Billing（請求）」を開き、「Buy credits（クレジット購入）」で最初は **5ドル** ほど購入する。
3. 同じ設定画面の「Limits（上限）」で、月の利用上限（Spend limit）を **10ドル** などに設定する。これ以上は請求されません。
4. 「API keys」→ 「Create Key」を押し、名前に `tomotomo` と入れて作成する。
5. 表示された `sk-ant-…` で始まるキーを**コピーしてメモ帳などに一時保存**する（この画面を閉じると二度と表示されません）。
   - このキーは誰にも見せない・チャットやGitHubに貼らないでください。

### B. 合言葉を決める

アプリから自分のサーバーを使うためのパスワードです。他人に推測されない **20文字以上** のものにしてください（例：英単語4つ＋数字を組み合わせる）。

### C. Cloudflare にサーバーを置く（ブラウザだけでできる方法）

事前に、このリポジトリの変更が `main` ブランチに入っている必要があります（プルリクエストをマージ）。

1. https://dash.cloudflare.com/sign-up でアカウントを作る（無料プランのままでOK）。メールの確認も済ませる。
2. 左メニューの「Workers & Pages」（「コンピューティング」の中にある場合もあります）→ 「Create（作成）」を押す。
3. 「Import a repository（リポジトリをインポート）」を選び、「GitHub」をつなぐ。GitHub の画面が出たら `nonpomeme/tomotomo` へのアクセスを許可する。
4. リポジトリ `tomotomo` を選び、設定画面で次のとおり入力して「Deploy（デプロイ）」を押す。
   - Project name（プロジェクト名）：`tomotomo-api`
   - Build command（ビルドコマンド）：空欄
   - Deploy command（デプロイコマンド）：`npx wrangler deploy`
   - 「Advanced settings（詳細設定）」→ Path（ルートディレクトリ）：`/server`
5. 完了したら、できた Worker（`tomotomo-api`）を開き、「Settings（設定）」→ 「Variables and Secrets（変数とシークレット）」→ 「Add（追加）」で次の2つを登録する。**Type（種類）は必ず「Secret（シークレット）」** を選ぶ。
   - 名前 `ANTHROPIC_API_KEY` ／ 値：Aでコピーしたキー
   - 名前 `APP_PASSPHRASE` ／ 値：Bで決めた合言葉
   - 「Deploy（デプロイ）」を押して保存する。
6. Worker の画面に出ている URL（`https://tomotomo-api.○○.workers.dev`）をメモする。
7. 動作確認：ブラウザで `https://tomotomo-api.○○.workers.dev/api/health` を開き、`{"error":"合言葉が違います"}` と出れば正常に動いています。
8. Aでメモ帳に一時保存したAPIキーは削除する（Cloudflare に保存済みのため不要）。

> パソコンにNode.jsがある場合は、ブラウザの代わりに次でも置けます：
> `cd server && npm install && npx wrangler login && npx wrangler secret put ANTHROPIC_API_KEY && npx wrangler secret put APP_PASSPHRASE && npx wrangler deploy`

### D. アプリとつなぐ

アプリの「その他」→「AIサーバー（自分専用）」に、Cの6のURLとBの合言葉を入れて「保存して接続テスト」を押します。「接続できました」と出れば完了です。
※ 安全のため、サーバーは `server/wrangler.toml` の `ALLOWED_ORIGINS`（初期値 `https://nonpomeme.github.io`）で公開したアプリからの呼び出しだけを受け付けます。アプリの公開（GitHub Pages）が済んでから接続してください。

### サーバーの設定（`server/wrangler.toml`）

| 項目 | 初期値 | 意味 |
|---|---|---|
| `ALLOWED_ORIGINS` | `https://nonpomeme.github.io` | 呼び出しを許可するアプリの公開URL |
| `MODEL` | `claude-sonnet-5-5` | 採点・対話に使うモデル |
| `DAILY_LIMIT` | `100` | 1日（日本時間）に使える回数。超えると翌日まで簡易AIで動作 |
| `PER_MINUTE_LIMIT` | `10` | 1分あたりの回数 |

そのほか、合言葉を10回続けて間違えたら、その接続元を1時間締め出します。
安全上の理由でAIが回答を断った場合は、Anthropic 推奨の別モデルで自動的にやり直す設定（server-side fallback）を入れています。
