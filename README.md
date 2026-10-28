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
- `manifest.json` / `service-worker.js` / `icons/` … PWA（ホーム画面に追加・オフライン学習）。アイコンは `node tools/make-icons.mjs` でパートナーのSVGから生成
- `.github/workflows/pages.yml` … main に入ると自動テスト → GitHub Pages に公開
- `.github/workflows/daily-content.yml` ＋ `tools/content/` … 毎朝の教材の自動生成（下の「毎日の教材」参照）
- `content/` … 配信中の教材（`index.json` と `daily/日付.json`）、7章と補章の一覧（`chapters.json`）、最新トレンド（`trends.json`）。`src/content.js` が読み込み、`src/content-schema.js` で形式を確認
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

## アプリの公開（GitHub Pages）とスマホへの追加

### 公開する（最初の1回だけ）
1. GitHub でこのリポジトリを開き、上のタブの「Settings」を押す。
2. 左メニューの「Pages」を押す。
3. 「Build and deployment」の「Source」で **「GitHub Actions」** を選ぶ（選ぶだけで保存されます）。
4. 上のタブの「Actions」を押し、左の「GitHub Pages に公開」→ 右の「Run workflow」→ 緑の「Run workflow」を押す。
5. 数分後、一覧の行が緑のチェックになれば公開完了。アプリのURLは **https://nonpomeme.github.io/tomotomo/** です。

以後は main に変更が入るたびに、自動テストに合格したものだけが自動で公開されます（テストに落ちたら公開されず、前の版のまま）。
更新はアプリを開くと裏で取り込まれ、**次に開いたときに**新しい版になります。

### iPhone のホーム画面に追加する
1. iPhone の **Safari** で https://nonpomeme.github.io/tomotomo/ を開く。
2. 画面下の共有ボタン（四角から上向き矢印が出ているマーク）を押す。
3. 「ホーム画面に追加」→ 右上の「追加」を押す。
4. ホーム画面の TomoTomo アイコンから開くと、Safari のバーがない全画面で起動します。一度開けば、電波がなくても学習できます（AIの採点・対話は簡易AIになります）。

Android は Chrome で開き、右上の「︙」→「ホーム画面に追加」（または「アプリをインストール」）。

## 毎日の教材（自動生成）

毎朝 4:17（日本時間）に GitHub Actions が次の順で1テーマ作ります。

**曜日ごとのテーマ**（`tools/content/tracks.json` で変更できます）：月＝採用・人材ビジネス／火＝産業・業界構造／水＝法律・制度／木＝経済・金融・統計／金＝経営・財務・組織／土＝テクノロジー・AI／日＝社会・国際・人口。良い発表がない日は、テーマごとの「専門知識の一覧」（curriculum）から題材を選んで作ります。
その日のテーマに合う発表を優先し、なければ他のテーマから選びます。どのテーマにも合わない発表は使いません。
読者は採用コンサル・求人広告営業・人材紹介・企業人事・経営者を想定し、各教材に「立場別：明日からの使い方」が付きます。
候補は1日6回集めてためておきます（朝の新着だけでは少ないため）。合格しなかった日は配信せず、アプリは前日までの教材とサンプルで動きます。

1. **収集**：公的機関・企業の公式発表の新着（`tools/content/sources.json`）
2. **選定**：今日のテーマに合い、採用・人材の実務や経営判断に使える専門知識を引き出せる発表をAI（Claude Opus）が選ぶ（一般論にしかならないもの・政治的な対立が中心の話題・告知・宣伝は選ばない）
3. **調査**：AI（Claude Sonnet）が公的機関・国際機関・大学・企業の公式サイト（`research_domains`）を検索し、ページを開いて事実を確かめ、URL付きの調査メモにする。実際に開いたページ・許可したサイト以外の事実は捨てる。確かめた事実が4件未満なら教材を作らない
4. **生成**：出典の本文と調査メモを材料に、サンプル3テーマと同じ形式で教材を作る。問題は専門家の検定試験の水準（記事の読み取りや常識で解ける問題は不可）。出典URLはプログラムが入れるので、実在し実際に開いたURLだけになる。4択の正解の位置はランダムに並べ替える
5. **形式チェック**：6形式の問題・思考問題3種・事実ラベル・知識ノードなど（`src/content-schema.js`）。不備は1回だけ直させる
6. **品質検査**：別の呼び出し（Claude Opus）で、出典・調査メモ・サンプルに照らして14項目を検査。数字や制度は資料のURLを開いて確かめる（出典・事実の裏付け・調査の正確さ・事実と解釈の区別・正解の一意性・誤答の自然さ・中立性・一般知識の正確さ・サンプル並みの質・テーマとの関係・専門性・問題の専門性・立場別の具体性・著作権）。1項目でも不合格なら破棄
7. **公開**：合格した教材を `content/` に保存し、GitHub Pages に公開。アプリは次に開いたとき取り込む

記事の本文は保存も表示もしません（教材は自分の言葉の要約＋出典リンク）。不合格になった理由は `tools/content/log/rejected.json` に残ります。
費用の目安：Anthropic の利用料が 1日あたり約130〜200円（調査を含む。不合格でやり直した日は増える）。

### オーナーが行う設定（最初の1回だけ）
1. **GitHub に APIキーを登録**：リポジトリの「Settings」→ 左メニュー「Secrets and variables」→「Actions」→ 緑の「New repository secret」を押し、Name に `ANTHROPIC_API_KEY`、Secret に Anthropic のキー（`sk-ant-…`）を入れて「Add secret」。
   - Cloudflare に登録したものと同じキーで構いません。Anthropic の画面で新しいキー（名前 `tomotomo-content` など）を作って分けると、あとで止めたいときに片方だけ止められます。
2. **Anthropic の月の上限を上げる**：platform.claude.com の「Settings」→「Limits」で、月の上限を **40ドル** 程度にする（採点・対話と教材づくりの合計に余裕を持たせるため）。
3. **試しに1回動かす**：「Actions」→ 左の「毎日の教材づくり」→「Run workflow」→ 緑の「Run workflow」。数分後に開いて、結果のまとめ（Summary）で「配信」か「不合格の理由」を確認できます。

### 今日の教材を作り直したいとき
「Actions」→「毎日の教材づくり」→「Run workflow」を押し、出てきた欄の **「今日の教材を取り下げて、作り直す」にチェック** を入れて、緑の「Run workflow」。
今日の教材を取り下げ、別の発表から作り直します（同じ発表は使いません）。1回あたり約130〜200円かかります。アプリは次に開いたとき新しい教材に置き換わります（取り下げた教材をすでに学習していた場合は、学習記録とともに残ります）。

## 週1回のトレンド調査（追記案のプルリクエスト）

設計書（`docs/design-brief.md`）5章の仕組みです。毎週月曜 6:13（日本時間）に GitHub Actions で Claude Code を起動し、7章と補章（`content/chapters.json`）のキーワードで、新しい研究・公的統計・主要な業界ニュースを調べます。

- 結果は **プルリクエスト** として届きます。中身は、章の「最新トレンド」への追記案（`content/trends.json`）と、報告（`docs/trends/週.md`：今週の要点3つ／お客さん・研修・業務改善への示唆／章ごとの追記案／除外した項目）
- **マージするまで何も変わりません。** 本文（教材や章の本文）は書き換えません
- 出典のない項目、ランクD・ランク不明の出典、開けないURL、公表日のない出典、すでに追記した出典は、プログラム（`tools/trends/apply.mjs`）が機械的に除外します
- 費用：1回あたり最大2ドル（約300円、`--max-budget-usd 2`）。月4回で最大約1,200円
- 今すぐ試すとき：「Actions」→「週1回のトレンド調査」→「Run workflow」

### オーナーが行う設定（最初の1回だけ）
GitHub Actions がプルリクエストを作れるようにします：リポジトリの「Settings」→ 左メニュー「Actions」→「General」→ 下のほうの「Workflow permissions」で **「Allow GitHub Actions to create and approve pull requests」にチェック** →「Save」。
（APIキーは「毎日の教材」で登録した `ANTHROPIC_API_KEY` をそのまま使います）

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
