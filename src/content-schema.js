/* TomoTomo — 配信教材の形式チェック
   毎日の自動生成（tools/content/）とアプリ（src/content.js）の両方が同じルールで確かめる。
   形式はサンプル3テーマ（src/data.js）と同じ。おかしな教材は配信しない・表示しない。 */
const CONTENT_RULES = {
  QTYPES: ['mc', 'tf', 'fill', 'order', 'cause', 'case'],
  THOUGHTS: ['think', 'multi', 'business'],
  EX_KEYS: ['why', 'others', 'bg', 'related', 'apply', 'memo'],
  SOURCE_TYPES: ['公的機関', '企業公式', '国際機関・研究'],
  KINDS: ['最新ニュース', '今後重要になるテーマ', '基礎知識×ニュース', '専門知識'],
  // 職種別の応用（apply.roles）。サンプルには無く、配信教材にだけある
  ROLES: { consultant: '採用コンサルタント', media_sales: '求人広告・媒体の営業', agency: '人材紹介（RA・CA）', inhouse: '企業の人事・採用担当', executive: '経営者' },
  // 根拠の信頼度ランク（設計書 docs/design-brief.md 4章）。D は教材の根拠に使わない
  RANKS: {
    A: 'メタ分析・査読付き論文・公的統計',
    B: '大手調査機関・学術機関のレポート、信頼できる業界団体の調査',
    C: '企業の調査・専門メディアの記事（参考）',
    D: '個人の意見・SNS（根拠には使わない）'
  },
  EVIDENCE_RANKS: ['A', 'B', 'C'],
  ID_RE: /^[a-z0-9][a-z0-9-]{2,60}$/,
  NODE_ID_RE: /^[a-z][a-z0-9]{1,30}$/
};

/* 根拠（出典と信頼度ランク）1件の形式。問題があればエラー文、なければ空文字 */
function evidenceError(e) {
  if (!e || typeof e !== 'object') return '形式が不正';
  if (typeof e.name !== 'string' || !e.name.trim()) return '出典名がない';
  if (!/^https:\/\/\S+$/.test(e.url || '')) return '出典のURL（https）がない';
  if (e.rank === 'D') return 'ランクD（個人の意見・SNS）は根拠に使えない';
  if (CONTENT_RULES.EVIDENCE_RANKS.indexOf(e.rank) < 0) return '信頼度ランク（A〜C）がない';
  if (e.published != null && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(e.published)) return '公表時期は YYYY / YYYY-MM / YYYY-MM-DD';
  return '';
}

/* t: 教材、ctx: { nodes: 既存＋新規ノード, cats, rels, skills, newNodes, newEdges, requireEvidence }
   requireEvidence: 出典のランク・各問題の根拠を必須にする（新しく作る教材用。サンプルや過去の教材は任意）
   問題があればエラー文の配列を返す（空なら合格） */
function validateTopic(t, ctx) {
  const R = CONTENT_RULES, err = [];
  const isStr = (v, min) => typeof v === 'string' && v.trim().length >= (min || 1);
  const need = (cond, msg) => { if (!cond) err.push(msg); };
  const strArr = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max && v.every(x => isStr(x));
  if (!t || typeof t !== 'object') return ['教材がありません'];

  need(isStr(t.id) && R.ID_RE.test(t.id), 'id が不正');
  need(isStr(t.title, 4) && t.title.length <= 40, 'title は4〜40字');
  need(isStr(t.emoji) && t.emoji.length <= 8, 'emoji が不正');
  need(strArr(t.path, 2, 6), 'path は2〜6個');
  need(strArr(t.tags, 1, 8), 'tags は1〜8個');
  need(strArr(t.industries, 1, 6), 'industries は1〜6個');
  need(Number.isInteger(t.difficulty) && t.difficulty >= 1 && t.difficulty <= 3, 'difficulty は1〜3');
  need(typeof t.future === 'number' && t.future >= 0 && t.future <= 1, 'future は0〜1');
  need(R.KINDS.includes(t.kind), 'kind が不正');
  need(/^\d{4}-\d{2}-\d{2}$/.test(t.date || '') && /^\d{4}-\d{2}-\d{2}$/.test(t.updated || ''), 'date / updated（公開日・更新日）が必要');
  need(Array.isArray(t.sources) && t.sources.length >= 1 && t.sources.length <= 8 && t.sources.every(s => s && isStr(s.name) && R.SOURCE_TYPES.includes(s.type) && /^https:\/\/\S+$/.test(s.url || '')), 'sources（名前・種類・https のURL）が必要');
  // 根拠と信頼度ランク（任意。ある場合は正しい形式で）
  const req = !!(ctx && ctx.requireEvidence);
  const evList = (list, at) => {
    if (list == null) return;
    if (!Array.isArray(list) || list.length > 5) { err.push(at + '：根拠は5件までの配列'); return; }
    list.forEach((e, i) => { const m = evidenceError(e); if (m) err.push(at + '：根拠' + (i + 1) + ' の' + m); });
  };
  (t.sources || []).forEach((s, i) => {
    if (s && (s.rank != null || req)) need(R.EVIDENCE_RANKS.indexOf(s.rank) >= 0, '出典' + (i + 1) + '：信頼度ランク（A〜C）が必要' + (s.rank === 'D' ? '（D は使えない）' : ''));
  });
  (t.s3 || []).forEach((b, i) => { if (b) evList(b.evidence, '3分の解説' + (i + 1)); });

  // 解説（30秒／3分／10分）。事実とAIの解釈を分ける
  need(isStr(t.s30, 60) && t.s30.length <= 400, 's30（30秒の要点）は60〜400字');
  need(Array.isArray(t.s3) && t.s3.length >= 3 && t.s3.length <= 4 && t.s3.every(b => b && isStr(b.label) && isStr(b.text, 30)), 's3（3分の解説）は3〜4ブロック');
  need(Array.isArray(t.s3) && t.s3[0] && t.s3[0].label === '事実', 's3 の最初のブロックは「事実」');
  const s10 = t.s10 || {};
  need(strArr(s10.causal, 4, 7), 's10.causal（因果チェーン）は4〜7個');
  need(Array.isArray(s10.perspectives) && s10.perspectives.length >= 4 && s10.perspectives.length <= 7 && s10.perspectives.every(p => p && isStr(p.who) && isStr(p.text, 20)), 's10.perspectives（多角的視点）は4〜7個');
  need(isStr(s10.opinion) && s10.opinion.indexOf('AIの解釈：') === 0, 's10.opinion は「AIの解釈：」で始める');
  need(t.apply && strArr(t.apply.hr, 3, 3) && strArr(t.apply.general, 3, 3), 'apply.hr / apply.general は3個ずつ');
  if (t.apply && t.apply.roles != null) need(typeof t.apply.roles === 'object' && Object.keys(R.ROLES).every(k => isStr(t.apply.roles[k], 15)), 'apply.roles は5職種（' + Object.keys(R.ROLES).join(' / ') + '）すべてに具体的な行動を書く');
  if (t.trackLabel != null) need(isStr(t.trackLabel) && t.trackLabel.length <= 20, 'trackLabel が不正');
  need(isStr(t.talk, 10), 'talk が必要');
  need(t.thoughts && R.THOUGHTS.every(k => t.thoughts[k] && isStr(t.thoughts[k].q) && isStr(t.thoughts[k].hint) && isStr(t.thoughts[k].example, 40)), '思考問題3種（think / multi / business）が必要');
  need(strArr(t.keywords, 8, 25), 'keywords は8〜25個');
  need(t.chat && typeof t.chat === 'object' && Object.keys(t.chat).length >= 2 && Object.keys(t.chat).every(k => isStr(k) && isStr(t.chat[k], 40)), 'chat（よくある質問と答え）は2個以上');

  // 問題（6形式すべて）
  const qs = Array.isArray(t.questions) ? t.questions : [];
  need(qs.length === 6, '問題は6問');
  need(R.QTYPES.every(ty => qs.some(q => q && q.type === ty)), '6形式（4択・○×・穴埋め・並べ替え・因果・ケース）を1問ずつ');
  const ids = new Set();
  qs.forEach((q, i) => {
    const at = '問題' + (i + 1) + '：';
    if (!q || typeof q !== 'object') { err.push(at + '形式が不正'); return; }
    need(isStr(q.id) && q.id.indexOf(t.id + '-') === 0 && !ids.has(q.id), at + 'id は「教材id-」で始まる重複のない値');
    ids.add(q.id);
    need(R.QTYPES.includes(q.type), at + 'type が不正');
    need(ctx && ctx.skills && Object.prototype.hasOwnProperty.call(ctx.skills, q.skill), at + 'skill が不正');
    need(isStr(q.q, 8), at + '問題文が必要');
    evList(q.evidence, at.replace('：', ''));
    if (req) need(Array.isArray(q.evidence) && q.evidence.length >= 1, at + '根拠（出典と信頼度ランク）が1件以上必要');
    need(q.ex && R.EX_KEYS.every(k => isStr(q.ex[k], 8)), at + '解説（why / others / bg / related / apply / memo）が必要');
    if (q.type === 'tf') need(typeof q.answer === 'boolean', at + '○×の答えは true / false');
    else if (q.type === 'order') need(strArr(q.items, 4, 6) && new Set(q.items).size === q.items.length, at + '並べ替えは4〜6個の重複しない項目');
    else {
      need(strArr(q.options, 4, 4) && new Set(q.options).size === 4, at + '選択肢は重複しない4個');
      need(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, at + '答えの番号が不正');
    }
    if (q.type === 'fill') need(isStr(q.q) && q.q.indexOf('＿＿＿') >= 0, at + '穴埋めは問題文に「＿＿＿」を入れる');
    if (q.type === 'cause') need(isStr(q.cause, 6), at + '因果問題は cause（原因）が必要');
    if (q.type === 'case') need(isStr(q.scenario, 15), at + 'ケース問題は scenario（場面）が必要');
  });

  // 知識ノード（既存＋この教材で増えるもの）
  const nodes = (ctx && ctx.nodes) || {};
  need(strArr(t.nodes, 3, 10) && t.nodes.every(n => Object.prototype.hasOwnProperty.call(nodes, n)), 'nodes は3〜10個で、すべて既存か新規のノード');
  const nn = (ctx && ctx.newNodes) || {};
  Object.keys(nn).forEach(k => {
    const n = nn[k];
    need(R.NODE_ID_RE.test(k), '新ノード ' + k + '：id が不正');
    need(n && isStr(n.name) && n.name.length <= 16 && isStr(n.sub) && Number.isInteger(n.diff) && n.diff >= 1 && n.diff <= 3, '新ノード ' + k + '：name / sub / diff が不正');
    need(n && ctx.cats && Object.prototype.hasOwnProperty.call(ctx.cats, n.cat), '新ノード ' + k + '：cat はマップのカテゴリから');
    need((ctx.newEdges || []).some(e => e[0] === k || e[1] === k), '新ノード ' + k + '：既存の知識とつなぐ線が必要');
  });
  (ctx && ctx.newEdges || []).forEach((e, i) => {
    need(Array.isArray(e) && e.length === 4 && Object.prototype.hasOwnProperty.call(nodes, e[0]) && Object.prototype.hasOwnProperty.call(nodes, e[1]) && e[0] !== e[1] &&
      ctx.rels && Object.prototype.hasOwnProperty.call(ctx.rels, e[2]) && typeof e[3] === 'number' && e[3] > 0 && e[3] <= 1, '新しい線 ' + (i + 1) + ' が不正');
  });
  return err;
}
