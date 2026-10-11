/* TomoTomo — 次の学習推薦・レッスン組み立て・採点
   読み込み順は index.html の <script> の並び順。各ファイルはグローバルを共有する（ビルド不要）。 */
/* ---------------- recommendation ---------------- */
function recommend() {
  const learned = new Set(learnedIds());
  const weak = weakSkills();
  const lv = levelInfo(S.xp).lv;
  const tier = lv < 4 ? 2 : 3;
  const reviewTopics = new Set(dueReviews().map(r => QBANK[r.qid] && QBANK[r.qid].topicId));
  return TOPICS.map(t => {
    let sc = 0; const reasons = [];
    const interest = t.tags.filter(x => S.profile.interests.includes(x));
    if (interest.length) { sc += interest.length * 1.1; reasons.push({ w: interest.length * 1.1, s: '興味：' + interest.slice(0, 2).join('・') }); }
    if (S.profile.industry && t.industries.includes(S.profile.industry)) { sc += 1.6; reasons.push({ w: 1.6, s: 'あなたの業界（' + S.profile.industry + '）に関係' }); }
    if (isHRish() && t.tags.includes('採用')) { sc += 1.8; reasons.push({ w: 1.8, s: '仕事に直結' }); }
    if (t.deliveredOn === dkey() && !S.completed[t.id]) { sc += 4; reasons.push({ w: 9, s: '今日の配信' }); }
    const age = daysBetween(new Date(t.date), Date.now());
    const fresh = Math.max(0, 1.6 - age / 10); sc += fresh;
    if (age <= 7) reasons.push({ w: fresh, s: '最新ニュース' });
    const bridges = t.nodes.filter(n => !learned.has(n) && ADJ[n].some(a => learned.has(a.id)));
    if (bridges.length) {
      sc += bridges.length * 0.9;
      const anchor = ADJ[bridges[0]].find(a => learned.has(a.id));
      reasons.push({ w: bridges.length * 0.9 + 0.5, s: '既存知識「' + NODES[anchor.id].name + '」とつながる' });
    }
    const newCount = t.nodes.filter(n => !learned.has(n)).length; sc += newCount * 0.15;
    sc += t.future * 1.4; if (t.future >= 0.9) reasons.push({ w: 1, s: '今後重要' });
    if (weak.length && weak[0].rate < 0.75 && t.questions.some(q => q.skill === weak[0].k)) { sc += 1; reasons.push({ w: 1.2, s: '苦手な「' + weak[0].name + '」を鍛える' }); }
    sc -= Math.abs(t.difficulty - tier) * 0.5;
    if (reviewTopics.has(t.id)) { sc += 0.5; }
    const done = S.completed[t.id] || 0;
    if (done) sc -= 6 + done;
    reasons.sort((a, b) => b.w - a.w);
    return { t, sc, done, reasons: reasons.slice(0, 3).map(r => r.s) };
  }).sort((a, b) => b.sc - a.sc);
}
function suggestionText() {
  const learned = learnedIds();
  const rec = recommend()[0];
  if (!learned.length) return { lead: '最初のテーマを学ぶと、ここに知識の星座ができはじめます。', rec };
  const cs = catScores();
  const cats = Object.keys(cs).filter(c => cs[c] > 0).sort((a, b) => cs[b] - cs[a]).slice(0, 2);
  const strong = cats.map(c => { const ks = learned.filter(k => NODES[k].cat === c).sort((a, b) => NODES[a].diff - NODES[b].diff || S.nodes[b].mastery - S.nodes[a].mastery); return '「' + NODES[ks[0]].name + '」'; });
  const allDone = TOPICS.every(t => S.completed[t.id]);
  if (allDone) return { lead: 'あなたは' + strong.join('と') + 'に詳しくなりました。いまは復習で知識を定着させる段階です。', rec, review: true };
  return { lead: 'あなたは' + strong.join('と') + 'に詳しくなりました。次に「' + rec.t.title + '」を学ぶと知識がつながります。', rec };
}

/* ---------------- lesson builder ---------------- */
const MODES = {
  auto: { icon: '🎯', name: 'おまかせ', desc: '履歴・弱点・仕事・知識マップから、AIがその日の最適な内容を決めます' },
  knowledge: { icon: '🧠', name: '知識', desc: '覚える・理解する。用語と基礎を固めます' },
  think: { icon: '💭', name: '思考', desc: 'なぜ？どうなる？原因は？を考えます' },
  multi: { icon: '⚖️', name: '多角的思考', desc: '企業・従業員・消費者・政府など複数の視点で考えます' },
  business: { icon: '💼', name: 'ビジネス', desc: '経営・営業・採用・提案に変換します' }
};
function autoMode() {
  const w = weakSkills();
  const cand = w.find(s => ['causal', 'multi', 'applied', 'future', 'logic'].includes(s.k) && s.rate < 0.8);
  if (cand) {
    const m = { causal: 'think', future: 'think', logic: 'think', multi: 'multi', applied: 'business' }[cand.k];
    return { mode: m, reason: '「' + cand.name + '」を伸ばすため、今日は' + MODES[m].name + 'モード中心にしました' };
  }
  if (!S.history.length) return isHRish()
    ? { mode: 'business', reason: 'お仕事（' + (S.profile.occupation || '採用') + '）に役立つよう、ビジネス視点を中心にしました' }
    : { mode: 'think', reason: '最初は「なぜ？」を考える思考モードから始めます' };
  const ms = ['think', 'multi', 'business'];
  const m = ms[S.history.length % 3];
  return { mode: m, reason: 'バランスよく鍛えるため、今日は' + MODES[m].name + 'モードを多めにしました' };
}
const MODE_PREF = {
  knowledge: { knowledge: 3, understanding: 2, causal: 1, applied: 0 },
  think: { causal: 3, understanding: 2, knowledge: 1, applied: 1 },
  multi: { understanding: 2, causal: 2, applied: 2, knowledge: 1 },
  business: { applied: 3, causal: 2, knowledge: 1, understanding: 1 }
};
function noRepeatTypes(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].type === arr[i - 1].type) {
      const j = arr.findIndex((x, k) => k > i && x.type !== arr[i - 1].type && (!arr[i + 1] || true));
      if (j > 0) { const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp; }
    }
  }
  return arr;
}
function buildLesson(topicId, minutes, modeSel) {
  const t = topicById(topicId);
  let mode = modeSel, modeReason = '';
  if (mode === 'auto') { const a = autoMode(); mode = a.mode; modeReason = a.reason; }
  const pref = MODE_PREF[mode] || MODE_PREF.think;
  let n = minutes <= 3 ? 2 : minutes <= 10 ? 4 : 6;
  if (mode === 'knowledge') n += 1;
  n = Math.min(n, t.questions.length);
  const ranked = t.questions.map((q, i) => ({ q, i, w: (pref[q.skill] || 0) + (q.skill === 'knowledge' ? 0.5 : 0) - i * 0.01 }))
    .sort((a, b) => b.w - a.w).slice(0, n).sort((a, b) => a.i - b.i).map(x => x.q);
  const qs = noRepeatTypes(ranked.slice());
  const steps = [{ k: 'intro' }, { k: 'read' }];
  qs.forEach(q => steps.push({ k: 'quiz', qid: q.id }));
  const revMax = minutes <= 3 ? 1 : minutes <= 10 ? 1 : 2;
  dueReviews().filter(r => QBANK[r.qid] && QBANK[r.qid].topicId !== topicId).slice(0, revMax)
    .forEach(r => steps.push({ k: 'quiz', qid: r.qid, review: true }));
  if (minutes > 3) {
    const v = mode === 'multi' ? 'multi' : mode === 'business' ? 'business' : 'think';
    steps.push({ k: 'thought', variant: v });
    steps.push({ k: 'apply' });
  }
  steps.push({ k: 'finish' });
  return {
    kind: 'topic', topicId, minutes, mode, modeSel, modeReason, steps, i: 0,
    depth: minutes <= 3 ? 's30' : minutes <= 10 ? 's3' : 's10',
    xp: 0, combo: 0, maxCombo: 0, correct: 0, total: 0, results: [],
    sel: null, order: [], checked: false, showExp: false, thought: null, startedAt: Date.now()
  };
}
function buildReview(early) {
  const list = dueReviews(early).slice(0, 6);
  const steps = list.map(r => ({ k: 'quiz', qid: r.qid, review: true }));
  steps.push({ k: 'finish' });
  return { kind: 'review', steps, i: 0, xp: 0, combo: 0, maxCombo: 0, correct: 0, total: 0, results: [], sel: null, order: [], checked: false, showExp: false, startedAt: Date.now(), minutes: Math.max(1, Math.ceil(list.length / 2)) };
}

/* ---------------- grading ---------------- */
function shuffleSeeded(arr, seed) {
  const a = arr.slice(); let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function optionOrder(q) { return shuffleSeeded(q.options.map((_, i) => i), q.id + (S.completed[q.topicId] || 0)); }
function grade(q, L) {
  if (q.type === 'tf') return L.sel === q.answer;
  if (q.type === 'order') return L.order.length === q.items.length && L.order.every((v, i) => v === i);
  return L.sel === q.answer;
}

