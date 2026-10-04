/* TomoTomo — AIアダプタ
   AIを使う処理（思考問題の採点・ニュースの対話）はすべてここを通す。接続先は次の順で切り替える。
     1. 自分のバックエンド（server/ の Cloudflare Workers）… 接続先URLと合言葉がこの端末に保存されているとき
     2. claude.ai のアーティファクトとして開いているとき … window.claude.use('sample')
     3. どちらも使えないとき … 簡易AI（ルールベース採点・定型回答）
   window.claude を直接さわるのはこのファイルだけ（クラウド同期の db / user も ClaudeHost 経由で取る）。

   ── バックエンドとの約束（server/ はこの形に合わせて作る）──
   共通：ヘッダー  Authorization: Bearer <合言葉> ／ Content-Type: application/json
   POST {apiBase}/feedback
     送信 { topic:{id,title,summary}, question:{variant,text}, answer, profile:{occupation,industry}, partner:{name,voice} }
     返信 200 { scores:{logic,concrete,multi,evidence,practical,verbal}（各1〜5の整数）, good, improve, next }
   POST {apiBase}/chat
     送信 { topic:{id,title,summary,causal[]}, profile, partner, messages:[{role:'user'|'assistant', content}] }
     返信 200 text/plain のストリーム（届いた本文を順に連結して表示）。JSON { text } でも可。
   401（合言葉違い）・429（回数上限）・5xx・通信不可・タイムアウトのときは簡易AIにフォールバックする。
   プロンプトはサーバー側で組み立てる（クライアントから任意のプロンプトを送れないようにするため）。 */

/* ---------------- 接続設定（学習データ S とは別のキーに保存。クラウド同期には載せない） ---------------- */
const AI_KEY = 'tomotomo:ai';
function loadAIConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(AI_KEY) || 'null');
    return c && c.apiBase ? { apiBase: String(c.apiBase).replace(/\/+$/, ''), token: String(c.token || '') } : null;
  } catch (e) { return null; }
}

/* ---------------- claude.ai 上でだけ存在する仕組み ---------------- */
const ClaudeHost = {
  available: () => !!(window.claude && typeof window.claude.use === 'function'),
  use: name => window.claude.use(name)
};

const AI = {
  sample: null,      // claude.ai の LLM（claude.ai 上でだけ入る）
  backendOk: true,   // 直近のバックエンド呼び出しが成功したか（表示用）
  skipUntil: 0,      // 通信できなかったら、しばらくバックエンドを試さない（performance.now 基準）
  lastError: '',
  config: loadAIConfig,
  /* 接続先と合言葉を保存する（空にすると解除） */
  configure(apiBase, token) {
    try {
      if (apiBase) localStorage.setItem(AI_KEY, JSON.stringify({ apiBase: normalizeApiBase(apiBase), token: String(token || '').trim() }));
      else localStorage.removeItem(AI_KEY);
    } catch (e) { /* storage unavailable */ }
    AI.backendOk = true; AI.skipUntil = 0; AI.lastError = '';
    refreshAIBadge();
  },
  init() {
    if (ClaudeHost.available()) ClaudeHost.use('sample').then(s => { AI.sample = s; refreshAIBadge(); }).catch(() => {});
  },
  connected() { return (!!loadAIConfig() && AI.backendOk) || !!AI.sample; },
  /* 接続テスト：合言葉が正しいか、今日あと何回使えるか */
  async test() {
    const cfg = loadAIConfig();
    if (!cfg) return { ok: false, error: '接続先が設定されていません' };
    try {
      const res = await fetch(cfg.apiBase + '/health', { headers: { Authorization: 'Bearer ' + cfg.token }, signal: AbortSignal.timeout(15000) });
      const j = await res.json().catch(() => ({}));
      AI.backendOk = res.ok; AI.skipUntil = 0; AI.lastError = res.ok ? '' : (j.error || 'エラー（' + res.status + '）');
      return res.ok ? { ok: true, remaining: j.remaining } : { ok: false, error: AI.lastError };
    } catch (e) {
      AI.backendOk = false; AI.lastError = '接続できませんでした（URLを確認してください）';
      return { ok: false, error: AI.lastError };
    } finally { refreshAIBadge(); }
  },

  /* 思考問題の6観点採点 */
  async feedback(t, variant, text) {
    const th = t.thoughts[variant];
    const viaBackend = normalizeFeedback(await callBackend('/feedback', {
      topic: topicPayload(t), question: { variant, text: th.q }, answer: text.slice(0, 1500),
      profile: profilePayload(), partner: partnerPayload()
    }, 30000, res => res.json()));
    if (viaBackend) return viaBackend;
    if (AI.sample) {
      const prompt = [
        'あなたは社会人向けAI教養トレーナー「' + partnerName() + '」です。ユーザーの記述回答を採点し、前向きで具体的なフィードバックを返します。',
        '文章の話し方: ' + partner().voice + '。ただし採点の基準・内容の正確さ・質は話し方によって変えないこと。',
        '否定的な言い方はせず「惜しい」「ここを足すともっと良い」の調子で。政治的に中立を保ち、事実と解釈を区別してください。',
        'テーマ: ' + t.title, '要点: ' + t.s30, '問い: ' + th.q,
        'ユーザーの職種: ' + (S.profile.occupation || '未設定') + ' / 業界: ' + (S.profile.industry || '未設定'),
        'ユーザーの回答: """' + text.slice(0, 1500) + '"""',
        '各観点を1〜5の整数で評価し、次のJSONだけを返してください（前置きやコードフェンス不要）:',
        '{"scores":{"logic":0,"concrete":0,"multi":0,"evidence":0,"practical":0,"verbal":0},"good":"良かった点（80字以内）","improve":"伸ばすポイントと具体的な書き足し例（120字以内）","next":"次に考えるとよい問い（60字以内）"}'
      ].join('\n');
      try {
        const fb = normalizeFeedback(await AI.sample.json(prompt, { modelTier: 'quick' }));
        if (fb) return fb;
      } catch (e) { /* fall back */ }
    }
    return heuristicFeedback(t, variant, text);
  },

  /* ニュースについての対話。onText(これまでの全文) がストリーミング中に何度も呼ばれる */
  async chat(t, log, onText) {
    const q = log[log.length - 1].content;
    const viaBackend = await callBackend('/chat', {
      topic: Object.assign(topicPayload(t), { causal: t.s10.causal }), profile: profilePayload(), partner: partnerPayload(),
      messages: log.slice(-12).map(m => ({ role: m.role, content: String(m.content).slice(0, 1500) }))
    }, 60000, res => readText(res, onText));
    if (viaBackend) return viaBackend;
    if (AI.sample) {
      const ctx = 'あなたはユーザーの学習パートナー「' + partnerName() + '」（先生ではなく一緒に知識を育てる相棒）。ユーザーと次のニュースについて対話し、理解を深めさせる。話し方: ' + partner().voice + '。ただし説明の正確さ・情報量・質は話し方によって変えない。' +
        '事実とAIの解釈を区別し、政治・社会の話題では特定の政党・候補者・思想を支持せず、複数の立場を示す。300字程度で、日本語で、やさしく具体的に。最後に考えを深める短い問いを1つ添える。\n' +
        'テーマ: ' + t.title + '\n要点: ' + t.s30 + '\n因果: ' + t.s10.causal.join('→') + '\nユーザーの職種: ' + (S.profile.occupation || '未設定') + '、業界: ' + (S.profile.industry || '未設定');
      const turns = log.map((m, i) => ({ role: m.role, content: i === 0 ? ctx + '\n\n質問: ' + m.content : m.content }));
      try {
        const r = await AI.sample(turns, { cache: false, onText: ({ text }) => onText(text) });
        return r.text;
      } catch (e) { return e && e.text ? e.text : fallbackChat(t, q); }
    }
    await new Promise(r => setTimeout(r, 500));
    return fallbackChat(t, q);
  }
};

/* ---------------- バックエンド呼び出し ---------------- */
/* Workers のURLだけ入力されても動くように、末尾を /api にそろえる */
function normalizeApiBase(u) {
  u = String(u).trim().replace(/\/+$/, '');
  return /\/api$/.test(u) ? u : u + '/api';
}
const topicPayload = t => ({ id: t.id, title: t.title, summary: t.s30 });
const profilePayload = () => ({ occupation: S.profile.occupation || '', industry: S.profile.industry || '' });
const partnerPayload = () => ({ name: partnerName(), voice: partner().voice });

/* 使えなければ null を返す（呼び出し側が次の手段にフォールバックする） */
async function callBackend(path, body, timeoutMs, read) {
  const cfg = loadAIConfig();
  if (!cfg || navigator.onLine === false || performance.now() < AI.skipUntil) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.apiBase + path, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.token },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      AI.backendOk = false;
      AI.lastError = res.status === 401 ? '合言葉が違います' : res.status === 429 ? '今日の利用上限に達しました' : 'サーバーエラー（' + res.status + '）';
      return null;
    }
    const out = await read(res);
    if (out == null) throw new Error('empty response');
    AI.backendOk = true; AI.lastError = '';
    return out;
  } catch (e) {
    AI.backendOk = false; AI.lastError = '接続できませんでした';
    AI.skipUntil = performance.now() + 60000;
    return null;
  } finally {
    clearTimeout(timer);
    refreshAIBadge();
  }
}
/* text/plain のストリームを読みながら onText に渡す。JSON { text } にも対応 */
async function readText(res, onText) {
  if (/json/.test(res.headers.get('content-type') || '')) { const j = await res.json(); return j && j.text ? String(j.text) : null; }
  if (!res.body || !res.body.getReader) return (await res.text()) || null;
  const reader = res.body.getReader(), dec = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      onText(text);
    }
    text += dec.decode();
  } catch (e) { if (!text) throw e; /* 途中で切れても、届いた分は見せる */ }
  return text || null;
}
function normalizeFeedback(r) {
  if (!r || !r.scores) return null;
  const scores = {};
  AXES.forEach(([k]) => { scores[k] = clamp(Math.round(Number(r.scores[k]) || 1), 1, 5); });
  return { scores, good: String(r.good || ''), improve: String(r.improve || ''), next: String(r.next || ''), offline: false };
}

function refreshAIBadge() { document.querySelectorAll('[data-ai-status]').forEach(el => { el.innerHTML = aiStatusHTML(); }); }
function aiStatusHTML() { return AI.connected() ? '<span class="tag ai">AI接続中</span>' : '<span class="tag">簡易AI（オフライン）</span>'; }

/* ---------------- 簡易AI（オフライン用） ---------------- */
const AXES = [['logic', '論理性'], ['concrete', '具体性'], ['multi', '多角性'], ['evidence', '根拠'], ['practical', '実務性'], ['verbal', '言語化']];
function heuristicFeedback(t, variant, text) {
  const len = text.replace(/\s/g, '').length;
  const kw = t.keywords.filter(k => text.includes(k));
  const causal = /ため|から|結果|ので|によって|→|につなが|影響/.test(text);
  const persp = ['企業', '候補者', '従業員', '政府', '投資家', '経営', '顧客', '社会', '求職者', '担当者', '紹介会社', '株主', '消費者'].filter(w => text.includes(w));
  const num = /[0-9０-９]|割|倍|%|％/.test(text);
  const action = /提案|すべき|施策|KPI|計画|まず|導入|見直|設計|実行/.test(text);
  const connect = /まず|次に|一方|つまり|だから|そのため|ただし|さらに/.test(text);
  const ex = /例えば|たとえば|実際|具体的/.test(text);
  const sc = {
    logic: clamp(1 + (causal ? 2 : 0) + (connect ? 1 : 0) + (len > 90 ? 1 : 0), 1, 5),
    concrete: clamp(1 + Math.min(2, kw.length) + (num ? 1 : 0) + (ex ? 1 : 0), 1, 5),
    multi: clamp(1 + Math.min(4, persp.length), 1, 5),
    evidence: clamp(1 + (causal ? 1 : 0) + (kw.length >= 3 ? 1 : 0) + (ex ? 1 : 0) + (num ? 1 : 0), 1, 5),
    practical: clamp(1 + (action ? 2 : 0) + (/採用|営業|顧客|提案|現場|チーム|会社/.test(text) ? 1 : 0) + (len > 120 ? 1 : 0), 1, 5),
    verbal: len < 30 ? 1 : len < 80 ? 2 : len < 160 ? 3 : len < 280 ? 4 : 5
  };
  const sorted = AXES.slice().sort((a, b) => sc[b[0]] - sc[a[0]]);
  const best = sorted[0], worst = sorted[sorted.length - 1];
  const goodMap = {
    logic: '原因と結果のつながりが意識できています。', concrete: 'キーワード（' + (kw.slice(0, 3).join('・') || '具体例') + '）を押さえて、具体的に書けています。',
    multi: (persp.length ? persp.slice(0, 3).join('・') : '複数') + 'の立場から考えられています。', evidence: '理由を添えて主張できています。',
    practical: '行動につながる提案になっています。', verbal: '自分の言葉でしっかり言語化できています。'
  };
  const tipMap = {
    logic: '「なぜそうなるか」を「〜だから〜になる」の形で1つ書き足すと、論理がぐっと強くなります。',
    concrete: '数字・期間・具体的な職種など、イメージできる要素を1つ入れてみましょう。',
    multi: '反対の立場（たとえば候補者側や投資家側）から見ると何が見えるか、1文加えてみましょう。',
    evidence: '「例えば」で始まる具体例を1つ入れると、説得力が増します。',
    practical: '「明日、自分なら何をするか」を1つ書くと、実務に使える答えになります。',
    verbal: 'あと2〜3文、考えた理由を書き足すと、考えがはっきり伝わります。'
  };
  return {
    scores: sc, good: goodMap[best[0]], improve: tipMap[worst[0]],
    next: variant === 'business' ? 'その提案に反対する人がいるとしたら、どんな理由だと思いますか？' : 'この変化が5年続いたら、あなたの業界では何が起きそうですか？',
    offline: true
  };
}
function fallbackChat(t, q) {
  if (t.chat && t.chat[q]) return t.chat[q];
  const p = t.s10.perspectives;
  if (/反対|批判|デメリット|リスク/.test(q)) return 'よくある慎重論を整理します。' + p.slice(0, 3).map(x => '\n・' + x.who + 'の立場：' + x.text).join('') + '\n\nどの立場も一理あるので、「どこに線を引くか」を考えると議論が深まります。';
  if (/採用|人事|人材/.test(q)) return '採用・人事の視点では次の点が重要です。' + t.apply.hr.map(x => '\n・' + x).join('') + '\n\n' + t.s10.opinion;
  if (/企業|経営|メリット/.test(q)) return '企業・経営の視点で見ると：' + p.filter(x => /企業|経営/.test(x.who)).map(x => '\n・' + x.text).join('') + '\n\n加えて、' + t.apply.general[1];
  if (/提案|コンサル|営業/.test(q)) return '提案の型は「現状 → ボトルネック → 打ち手 → 小さな実験」です。このテーマなら：' + t.apply.hr.map(x => '\n・' + x).join('');
  return 'いい問いですね。このテーマの因果関係は「' + t.s10.causal.join(' → ') + '」です。' + '\n\nどの矢印が最も不確かだと思いますか？ そこに注目すると、ニュースの先が読めるようになります。\n\n（いまは簡易応答モードです。AI接続時は自由な質問に詳しく答えます）';
}
