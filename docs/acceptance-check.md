# 受け入れ確認（要件定義書 v2：組織論）

- 確認日：2026-11-07
- 対象：`docs/requirements.md` の受け入れ基準 AC-1〜15
- 確認した環境：Linux（Node.js 22、ヘッドレス Chromium、画面幅 390〜400px）

## 結果のまとめ

**15項目すべて合格**です。ただし AC-12 は、偽の Anthropic API での確認です。本物のAPIで教材を作る確認は、Anthropic の残高を追加したあとの最初の朝（または手動実行）で行います（下の「残っていること」）。

| # | 受け入れ基準 | 結果 | 確かめ方・根拠 |
|---|---|---|---|
| AC-1 | カリキュラムが12章・37単元で、全単元に確認済みの出典（ランクA〜C）がある | 合格 | `tools/content/test.mjs`：章・単元の数、単元idの重複と順序、全単元に出典があること、全出典にランク・URL・確認した内容があること（出典41件：A 30・B 10・C 1） |
| AC-2 | 調査ノートがカリキュラムから生成され、内容が一致している | 合格 | `tools/content/test.mjs`：`curriculum-doc.mjs` で作り直して、調査ノートと `content/chapters.json` に差分がないこと |
| AC-3 | お手本3本が形式チェック（根拠必須・3つの視点必須）に合格し、全問に根拠とランクがあり、Dがない | 合格 | `tools/content/test.mjs`：`validateTopic(..., requireEvidence, requireViews)` に3本とも合格。全18問・全解説ブロックに根拠（ランクA〜C） |
| AC-4 | お手本3本の出典が、すべてカリキュラムの確認済み出典（または公的統計）である | 合格 | `tools/content/test.mjs`：出典・根拠のURLがすべて `curriculum.json` の出典にあること。単元・章のひも付けも一致 |
| AC-5 | 学習タブに章と単元が表示され、学習できる単元だけにボタンがあり、準備中にはボタンがない | 合格 | `tests/flow.mjs`「curriculum」：12章・37単元。学習できる3単元（u4-4・u6-1・u10-1）だけにボタン、準備中34単元はボタン0。学習後は「学習済み」になる |
| AC-6 | ホームの「今日のテーマ」がカリキュラム順の未学習の単元になる（今日の配信があればそれ） | 合格 | `tests/flow.mjs`「curriculum」：最初は u4-4、学習後は u6-1。「delivered」：今日の配信があればそれが先頭 |
| AC-7 | 学習の流れ（FR-4）を最後まで進められ、XP・知識マップが更新される | 合格 | `tests/flow.mjs`「offline」「claude-host」「backend」「backend-down」「curriculum」「delivered」：ホーム → 学習 → クイズ → 思考問題 → 結果 → 知識マップ更新 → 次のおすすめ → 成長 |
| AC-8 | 解説に根拠とランク、応用に3つの視点が表示される | 合格 | `tests/flow.mjs`「curriculum」：解説に根拠（Bauer ほか 2007、ランクA）、応用に「お客さんへの提案／社内で教える／仕組みで改善する」と立場別の使い方。画面：`docs/screenshots/4-quiz-explain.png`・`5-apply-views.png` |
| AC-9 | 知識マップが組織論の5分野で表示され、学習した概念のノードが出る | 合格 | `tests/flow.mjs`「curriculum」：5分野の表示と、学習した「組織社会化」のノード。画面：`docs/screenshots/6-map.png` |
| AC-10 | 旧データ（v1、旧サンプルの学習記録あり）で起動しても壊れず、v2 に移行され、XP・履歴が残る | 合格 | `tests/flow.mjs`「migration」：v → 2、旧サンプルの復習予定だけ削除（配信教材の復習予定は残る）、XP・履歴・設定・習熟度が残る、全タブがエラーなく表示 |
| AC-11 | オフラインで起動し、学習できる | 合格 | `tests/flow.mjs`「pwa」（service worker でオフライン再読み込み → 学習完了）、「delivered」（オフラインで配信教材・新ノードが残る） |
| AC-12 | 教材づくりがカリキュラムの次の単元を選び、確認済みの出典を調査メモに入れ、根拠・3つの視点つきの教材を作る。不合格・調査不足は配信しない | 合格（偽のAPI） | `tools/content/test.mjs`：最初の未作成単元 u0-1 を選ぶ、単元の出典が調査メモの中心、開いていない・許可外・ランクDの事実を除外、全問に根拠、3つの視点、事実ブロックに単元の出典が必須、品質検査はツールなし（調査メモとページの抜粋で検査）、不合格・調査不足・単元の出典なしは配信しない、1日2回まで、3日続けて不合格の単元は後回し、全単元が済めば作らない |
| AC-13 | 週1回のトレンド追記が、カリキュラムの章で動き、出典のない項目を除外する | 合格 | `tools/trends/test.mjs`：章がカリキュラムの12章と一致、出典なし・ランクD・存在しない章を除外。`tests/flow.mjs`「delivered」：マージ済みのトレンドが学習タブの章に「最新トレンド（参考）」として出る |
| AC-14 | 既存の自動テスト（アプリ・サーバー・教材づくり・トレンド）がすべて通る | 合格 | `npm test`（238画面）、`npm --prefix server test`、`node tools/content/test.mjs`、`node tools/trends/test.mjs` がすべて OK |
| AC-15 | 画面を目で見て、表示崩れがない（ホーム・学習タブ・解説・応用・知識マップ） | 合格 | `docs/screenshots/` の6枚（幅390px、iPhone 相当）を目視。はみ出し・重なりなし。学習タブの章に開閉の印（▾）を追加した |

## 要件ごとの実装の場所

| 要件 | 実装 |
|---|---|
| CR-1〜4（カリキュラム） | `content/curriculum.json`（唯一の元データ）、`tools/content/curriculum-doc.mjs`（調査ノートと章の一覧を生成） |
| CT-1〜8（教材の品質） | お手本3本：`src/data.js`。形式チェック：`src/content-schema.js`（`requireEvidence`・`requireViews`、`apply.views`・`unit`・`chapter`、出典の種類「学術研究」） |
| FR-1（ホーム） | `src/learning.js` の `recommend()`：今日の配信 → カリキュラム順の次の単元 → それ以外はスコア順 |
| FR-2・FR-3（学習タブ・章の情報） | `src/curriculum.js`（読み込み・端末に保存・単元の状態）、`src/views.js` の `curriculumHTML()` |
| FR-5・FR-6（根拠・3つの視点） | `src/lesson.js` の `evidenceHTML()`・`rolesHTML()`・`viewsHTML()` |
| FR-7（知識マップ） | `src/data.js` の `MAP_CATS`（5分野）・`NODES`（36概念）・`EDGES`（47本） |
| FR-9（オンボーディング） | `src/data.js` の `INTEREST_OPTIONS`（組織論の12分野） |
| GN-1〜5（毎日の教材） | `tools/content/daily.mjs`・`prompts.mjs`・`config.json`、`.github/workflows/daily-content.yml`（ニュースの収集をやめ、1日1回だけ） |
| GN-6（週1回のトレンド） | `tools/trends/prompt.md`・`apply.mjs`（章は `content/chapters.json`＝カリキュラムから生成） |
| NF-1（3秒以内） | カリキュラムは端末に保存したものを先に使い、裏で最新版を取る。手元の計測で、起動から「今日の学習をはじめる」が出るまで 0.08〜0.21秒 |
| NF-2（オフライン） | `service-worker.js`（キャッシュ名 `tomotomo-v3`、`curriculum.js` と `content/curriculum.json` を追加） |
| MG-1・MG-2（移行） | `src/core.js` の `migrate()`（学習データ v2） |
| MG-3（旧配信の整理） | `content/index.json` から10月の7分野の教材を外した（教材ファイルは残し、学習済みの端末では記録とともに残る） |

## 残っていること（オーナーの作業）

1. **Anthropic の残高を追加する**（10/31 に尽きたため、毎日の教材が止まっています）。platform.claude.com →「Settings」→「Billing」→「Buy credits」。追加後、「Actions」→「毎日の教材づくり」→「Run workflow」で1回動かし、結果のまとめ（Summary）で「配信」か「不合格の理由」を確認してください。これが AC-12 の本番確認になります。
2. AIサーバー（Cloudflare）は、このプルリクエストをマージすると自動で新しい版（対話の指示文を「組織論の教材」向けに変更）になります。作業は不要です。

## 補足

- 単元id（`u4-4` など）は章と単元の番号でできているため、カリキュラムを読み込む前（初回のオフラインなど）でも、ホームの「次の単元」は同じ順で決まります。学習タブの章の一覧は、一度ネットにつながると表示されます。
- 旧サンプル3テーマの知識ノード（AIエージェントなど）の習熟度はデータに残りますが、マップには表示しません（MG-2）。
