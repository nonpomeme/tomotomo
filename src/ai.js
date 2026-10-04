/* ---------------- thought feedback ---------------- */
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
async function aiFeedback(t, variant, text) {
  const th = t.thoughts[variant];
  if (SAMPLE) {
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
      const r = await SAMPLE.json(prompt, { modelTier: 'quick' });
      if (r && r.scores) {
        AXES.forEach(([k]) => { r.scores[k] = clamp(Math.round(Number(r.scores[k]) || 1), 1, 5); });
        return { scores: r.scores, good: String(r.good || ''), improve: String(r.improve || ''), next: String(r.next || ''), offline: false };
      }
    } catch (e) { /* fall back */ }
  }
  return heuristicFeedback(t, variant, text);
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
