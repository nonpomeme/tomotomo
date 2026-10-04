/* TomoTomo — 学習オーバーレイ（解説・クイズ・思考問題・結果・ニュース・対話）
   読み込み順は index.html の <script> の並び順。各ファイルはグローバルを共有する（ビルド不要）。 */
/* =========================================================
   lesson
   ========================================================= */
function openOverlay(kind) { ui.overlay = kind; renderOverlay(); }
function closeOverlay() { ui.overlay = null; const o = $('#overlay'); o.innerHTML = ''; o.classList.add('hide'); document.body.style.overflow = ''; render(); }
function renderOverlay() {
  const o = $('#overlay');
  if (!ui.overlay) { o.classList.add('hide'); return; }
  o.classList.remove('hide'); document.body.style.overflow = 'hidden';
  const v = { lesson: viewLesson, results: viewResults, mapupdate: viewMapUpdate, chat: viewChat, news: viewNews }[ui.overlay];
  o.innerHTML = '<div class="overlay-in">' + v() + '</div>';
  o.scrollTop = 0;
  if (ui.overlay === 'mapupdate') mountMap('#minimap', false, ui.lastResult ? ui.lastResult.newNodes : []);
  if (ui.overlay === 'chat') { const log = $('#chatlog'); if (log) o.scrollTop = o.scrollHeight; }
}
function startLesson(topicId, minutes) {
  ui.L = buildLesson(topicId, minutes || ui.minutes || S.profile.minutes, S.profile.mode);
  ui.modal = null; showModal();
  openOverlay('lesson');
}
function lessonTop(L) {
  const total = L.steps.length - 1;
  const pct = Math.round(L.i / total * 100);
  return '<div class="lesson-top"><button class="iconbtn" data-a="quitLesson" aria-label="学習を中断">' + IC.close + '</button><div class="bar"><i style="width:' + pct + '%"></i></div>' +
    (L.combo >= 2 ? '<span class="combo">🔥' + L.combo + '</span>' : '<span class="num small" style="color:var(--sun-deep)">⚡' + L.xp + '</span>') + '</div>';
}
function viewLesson() {
  const L = ui.L, step = L.steps[L.i];
  const t = L.kind === 'topic' ? topicById(L.topicId) : null;
  let body = '', foot = '';
  if (step.k === 'intro') {
    const plan = [];
    plan.push(L.depth === 's30' ? '30秒の要点' : L.depth === 's3' ? '3分の解説' : '10分の深掘り解説');
    const nq = L.steps.filter(s => s.k === 'quiz' && !s.review).length, nr = L.steps.filter(s => s.k === 'quiz' && s.review).length;
    plan.push('クイズ' + nq + '問'); if (nr) plan.push('復習' + nr + '問');
    if (L.steps.some(s => s.k === 'thought')) plan.push('思考問題'); if (L.steps.some(s => s.k === 'apply')) plan.push('仕事への応用');
    body = '<div style="text-align:center;margin-top:10px">' + owl(108, 'normal', 'bob ctr') + '</div>' +
      '<div class="kicker" style="justify-content:center;margin-top:8px">今日のテーマ・約' + L.minutes + '分</div>' +
      '<h2 style="font-size:24px;text-align:center;margin-top:6px">' + t.emoji + ' ' + esc(t.title) + '</h2>' +
      '<p class="small muted" style="text-align:center;margin-top:6px">' + esc(t.path.join(' ＞ ')) + '</p>' +
      '<div class="tomo" style="justify-content:center;margin-top:14px"><div class="say">' + esc(say('start')) + '</div></div>' +
      '<div class="card" style="margin-top:14px"><b class="small">' + MODES[L.mode].icon + ' ' + MODES[L.mode].name + 'モード' + (L.modeSel === 'auto' ? '（おまかせ）' : '') + '</b>' +
      (L.modeReason ? '<p class="small muted" style="margin-top:4px">' + esc(L.modeReason) + '</p>' : '') +
      '<div class="chain" style="margin-top:10px">' + plan.map((p, i) => (i ? '<i>↓</i>' : '') + '<span>' + p + '</span>').join('') + '</div></div>';
    foot = '<button class="btn btn-primary" data-a="next">はじめる</button>';
  } else if (step.k === 'read') {
    body = '<div class="kicker">📰 ニュース解説</div><h2 class="qtitle" style="margin-bottom:4px">' + esc(t.title) + '</h2>' + readingHTML(t, L.depth, 'lessonDepth');
    foot = '<div class="row"><button class="btn btn-ghost" style="width:auto" data-a="chat" data-v="' + t.id + '">AIに質問</button><button class="btn btn-primary grow" data-a="next">クイズへ進む</button></div>';
  } else if (step.k === 'quiz') {
    const q = QBANK[step.qid];
    body = quizHTML(q, L, step);
    if (!L.checked) foot = '<button class="btn btn-primary" data-a="check" ' + (canCheck(q, L) ? '' : 'disabled') + '>回答する</button>';
    else foot = feedbackSheet(q, L);
  } else if (step.k === 'thought') {
    body = thoughtHTML(t, step, L);
    if (!L.thought || !L.thought.fb) foot = L.thought && L.thought.loading ? '<button class="btn btn-primary" disabled><span class="spinner"></span>' + esc(partnerName()) + 'が読んでいます</button>' :
      '<button class="btn btn-primary" data-a="submitThought">AIにフィードバックをもらう</button><button class="link" style="display:block;margin:12px auto 0" data-a="skipThought">今回はスキップ</button>';
    else foot = '<div class="row"><button class="btn btn-ghost" style="width:auto" data-a="chat" data-v="' + t.id + '">AIと深掘り</button><button class="btn btn-primary grow" data-a="next">つぎへ</button></div>';
  } else if (step.k === 'apply') {
    const items = isHRish() ? t.apply.hr : t.apply.general;
    body = '<div class="kicker">💼 仕事への応用</div><h2 class="qtitle">' + (isHRish() ? esc(S.profile.occupation) + 'にとって、何が重要か' : 'あなたの仕事にどう使うか') + '</h2>' +
      '<div class="card">' + items.map((x, i) => '<div class="row" style="align-items:flex-start' + (i ? ';margin-top:12px' : '') + '"><span class="oitem" style="padding:0;border:0;box-shadow:none;background:none;width:auto"><span class="n">' + (i + 1) + '</span></span><span>' + esc(x) + '</span></div>').join('') + '</div>' +
      '<div class="sec-title">明日の会話で使えるひとこと</div><div class="tomo">' + owl(46, 'happy') + '<div class="say">' + esc(t.talk) + '</div></div>' +
      '<div class="card flat" style="margin-top:14px"><span class="tag ai">AIの解釈</span><p class="small" style="margin-top:6px">' + esc(t.s10.opinion.replace(/^AIの解釈：/, '')) + '</p></div>';
    foot = '<button class="btn btn-mint" data-a="next">学習を完了する</button>';
  }
  return lessonTop(L) + '<div class="lesson-body">' + body + '</div><div class="lesson-foot" id="lfoot"' + (step.k === 'quiz' && L.checked ? ' style="padding:0;border:0;background:none"' : '') + '>' + foot + '</div>';
}
function readingHTML(t, depth, action) {
  let h = '<div class="depthtabs" role="tablist">' + [['s30', '30秒'], ['s3', '3分'], ['s10', '10分']].map(([k, l]) => '<button role="tab" aria-selected="' + (depth === k) + '" class="' + (depth === k ? 'on' : '') + '" data-a="' + action + '" data-v="' + k + '">' + l + '</button>').join('') + '</div><div class="read">';
  h += '<div class="blk"><span class="tag fact">要点</span><p style="margin-top:6px">' + esc(t.s30) + '</p></div>';
  if (depth !== 's30') h += t.s3.map(b => '<div class="blk"><span class="tag ' + (/事実/.test(b.label) ? 'fact' : '') + '">' + esc(b.label) + '</span><p style="margin-top:6px">' + esc(b.text) + '</p></div>').join('');
  if (depth === 's10') {
    h += '<div class="blk"><span class="tag">因果関係</span><div class="chain">' + t.s10.causal.map((c, i) => (i ? '<i>↓</i>' : '') + '<span>' + esc(c) + '</span>').join('') + '</div></div>';
    h += '<div class="blk"><span class="tag">多角的な視点</span><div class="persp" style="margin-top:8px">' + t.s10.perspectives.map(p => '<b>' + esc(p.who) + '</b><span>' + esc(p.text) + '</span>').join('') + '</div></div>';
    h += '<div class="blk"><span class="tag">実務への応用</span><p style="margin-top:6px">' + esc((isHRish() ? t.apply.hr : t.apply.general).join('／')) + '</p></div>';
    h += '<div class="blk"><span class="tag ai">AIの解釈</span><p style="margin-top:6px">' + esc(t.s10.opinion.replace(/^AIの解釈：/, '')) + '</p></div>';
  }
  h += '</div><div class="source"><b>情報源</b>（公開 ' + fmtYMD(t.date) + '・更新 ' + fmtYMD(t.updated) + '）<br>' + t.sources.map(s => '・' + esc(s.name) + '（' + esc(s.type) + '）<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.url) + '</a>').join('<br>') +
    '<p style="margin-top:8px">「事実」と「AIの解釈」はラベルで区別しています。' + esc(SAMPLE_NOTE) + '</p></div>';
  return h;
}
const TYPE_LABEL = { mc: '4択', tf: '○×', fill: '穴埋め', order: '並べ替え', cause: '因果関係', case: 'ケーススタディ' };
function quizHTML(q, L, step) {
  const kick = '<div class="kicker">' + (step.review ? '🔁 復習・' : '') + TYPE_LABEL[q.type] + '<span class="tag" style="margin-left:4px">' + SKILLS[q.skill] + '</span></div>';
  const ord = q.options ? optionOrder(q) : null;
  const optBtn = (i, label) => {
    let cls = 'opt';
    if (L.checked) { if (i === q.answer) cls += ' ok'; else if (L.sel === i) cls += ' ng'; }
    else if (L.sel === i) cls += ' sel';
    return '<button class="' + cls + '" data-a="sel" data-v="' + i + '" ' + (L.checked ? 'disabled' : '') + '>' + esc(label) + '</button>';
  };
  if (q.type === 'tf') {
    const btn = (val, lab) => { let cls = 'opt'; if (L.checked) { if (val === q.answer) cls += ' ok'; else if (L.sel === val) cls += ' ng'; } else if (L.sel === val) cls += ' sel'; return '<button class="' + cls + '" data-a="sel" data-v="' + val + '" ' + (L.checked ? 'disabled' : '') + ' aria-label="' + (val ? '正しい' : '誤り') + '">' + lab + '</button>'; };
    return kick + '<h2 class="qtitle">' + esc(q.q) + '</h2><div class="tfgrid">' + btn(true, '○') + btn(false, '×') + '</div>';
  }
  if (q.type === 'fill') {
    const filled = L.sel != null ? esc(q.options[L.sel]) : '　';
    return kick + '<h2 class="qtitle" style="font-size:16px">空欄に入る言葉を選ぼう</h2><div class="fillbox">' + esc(q.q).replace('＿＿＿', '<span class="blank">' + filled + '</span>') + '</div>' +
      '<div class="tfgrid">' + ord.map(i => optBtn(i, q.options[i]).replace('class="opt', 'style="font-size:15px;padding:14px 8px;text-align:center" class="opt')).join('') + '</div>';
  }
  if (q.type === 'order') {
    const pool = shuffleSeeded(q.items.map((_, i) => i), q.id).filter(i => !L.order.includes(i));
    let h = kick + '<h2 class="qtitle">' + esc(q.q) + '</h2><div class="ordered">' +
      (L.order.length ? L.order.map((v, pos) => '<button class="oitem' + (L.checked ? (v === pos ? ' ok' : ' ng') : '') + '" data-a="unorder" data-v="' + pos + '" ' + (L.checked ? 'disabled' : '') + '><span class="n">' + (pos + 1) + '</span>' + esc(q.items[v]) + '</button>').join('') : '<p class="small muted" style="padding:10px;text-align:center">下のカードを、原因から順にタップ</p>') + '</div>';
    if (!L.checked) h += '<div class="pool">' + pool.map(i => '<button class="oitem" data-a="order" data-v="' + i + '">' + esc(q.items[i]) + '</button>').join('') + '</div>' + (L.order.length ? '<button class="link" style="display:block;margin:12px auto 0" data-a="orderReset">やり直す</button>' : '');
    else if (!grade(q, L)) h += '<div class="card flat small"><b>正しい順番</b><div class="chain" style="margin-top:6px">' + q.items.map((x, i) => (i ? '<i>↓</i>' : '') + '<span>' + esc(x) + '</span>').join('') + '</div></div>';
    return h;
  }
  if (q.type === 'cause') return kick + '<div class="causebox">原因：' + esc(q.cause) + '</div><div class="arrowdown">↓</div><h2 class="qtitle" style="margin-top:0">' + esc(q.q) + '</h2>' + ord.map(i => optBtn(i, q.options[i])).join('');
  if (q.type === 'case') return kick + '<div class="scenario">💬 ' + esc(q.scenario) + '</div><h2 class="qtitle">' + esc(q.q) + '</h2>' + ord.map(i => optBtn(i, q.options[i])).join('');
  return kick + '<h2 class="qtitle">' + esc(q.q) + '</h2>' + ord.map(i => optBtn(i, q.options[i])).join('');
}
function canCheck(q, L) { return q.type === 'order' ? L.order.length === q.items.length : L.sel !== null && L.sel !== undefined; }
function feedbackSheet(q, L) {
  const ok = L.lastOk;
  const acc = L.total ? L.correct / L.total : 1;
  const expand = !ok || L.showExp || acc < 0.7;
  const ex = q.ex;
  const answerText = q.type === 'tf' ? (q.answer ? '○（正しい）' : '×（誤り）') : q.type === 'order' ? q.items.join(' → ') : q.options[q.answer];
  return '<div class="sheet ' + (ok ? 'ok' : 'ng') + '" style="position:relative">' +
    '<div class="row">' + owl(48, ok ? (L.combo >= 3 ? 'proud' : 'happy') : 'think') + '<div class="grow"><h3>' + esc(L.lastLine) + '</h3>' +
    (ok ? '<span class="small">+' + L.lastXp + ' XP</span> ' + (L.combo >= 2 ? '<span class="combo">🔥 ' + L.combo + 'コンボ</span>' : '') : '<span class="small">正解：' + esc(answerText) + '</span>') + '</div></div>' +
    (expand ? '<dl class="exp">' +
      '<dt>なぜ正解なのか</dt><dd>' + esc(ex.why) + '</dd>' + (q.type === 'tf' || q.type === 'order' ? '' : '<dt>ほかの選択肢が違う理由</dt><dd>' + esc(ex.others) + '</dd>') + (q.type === 'order' ? '<dt>よくある間違い</dt><dd>' + esc(ex.others) + '</dd>' : '') + (q.type === 'tf' ? '<dt>補足</dt><dd>' + esc(ex.others) + '</dd>' : '') +
      '<dt>背景</dt><dd>' + esc(ex.bg) + '</dd><dt>関連知識</dt><dd>' + esc(ex.related) + '</dd><dt>仕事への応用</dt><dd>' + esc(ex.apply) + '</dd><dt>覚え方</dt><dd>' + esc(ex.memo) + '</dd></dl>'
      : '<div class="exp"><b>ポイント：</b>' + esc(ex.why) + '<br><button class="link" style="margin-top:6px" data-a="moreExp">背景・関連知識・覚え方も見る</button></div>') +
    '<button class="btn ' + (ok ? 'btn-mint' : 'btn-coral') + '" data-a="next">つぎへ</button></div>';
}
function pickPraise() { const p = ['正解！', 'お見事！', 'その通り！', 'いい読みです！']; return p[(ui.L.correct + ui.L.i) % p.length]; }
function thoughtHTML(t, step, L) {
  const th = t.thoughts[step.variant];
  const lab = { think: '💭 思考問題', multi: '⚖️ 多角的思考', business: '💼 ビジネス思考' }[step.variant];
  let h = '<div class="kicker">' + lab + '<span data-ai-status style="margin-left:6px">' + aiStatusHTML() + '</span></div><h2 class="qtitle">' + esc(th.q) + '</h2>';
  if (!L.thought || !L.thought.fb) {
    h += '<p class="small muted" style="margin:-6px 0 12px">正解はひとつではありません。思ったことを自分の言葉で書いてみましょう。</p>' +
      '<textarea class="answer" id="thoughtText" placeholder="例：まず〜。なぜなら〜。一方で〜の立場から見ると…" ' + (L.thought && L.thought.loading ? 'disabled' : '') + '>' + esc(L.thought ? L.thought.text : '') + '</textarea>' +
      '<details style="margin-top:10px"><summary class="link" style="cursor:pointer">ヒントを見る</summary><p class="small" style="margin-top:6px">' + esc(th.hint) + '</p></details>';
    return h;
  }
  const fb = L.thought.fb;
  h += '<div class="card flat small" style="background:var(--surface2);border:0"><b>あなたの回答</b><p style="margin-top:4px;white-space:pre-wrap">' + esc(L.thought.text) + '</p></div>';
  h += '<div class="card" style="margin-top:12px"><div class="row between"><b style="font-family:var(--f-head)">' + esc(partnerName()) + 'のフィードバック</b>' + (fb.offline ? '<span class="tag">簡易評価</span>' : '<span class="tag ai">AI評価</span>') + '</div><div style="margin-top:10px">' +
    AXES.map(([k, l]) => '<div class="axis"><span>' + l + '</span><div class="dots">' + [1, 2, 3, 4, 5].map(i => '<i class="' + (i <= fb.scores[k] ? 'on' : '') + '"></i>').join('') + '</div><b class="num small">' + fb.scores[k] + '</b></div>').join('') + '</div>' +
    '<div class="blk" style="margin-top:12px"><span class="tag fact">よかった点</span><p class="small" style="margin-top:4px">' + esc(fb.good) + '</p></div>' +
    '<div class="blk" style="margin-top:10px"><span class="tag" style="background:var(--sun-soft);color:var(--sun-deep)">ここを足すともっと良くなる</span><p class="small" style="margin-top:4px">' + esc(fb.improve) + '</p></div>' +
    (fb.next ? '<div class="blk" style="margin-top:10px"><span class="tag ai">次に考えたい問い</span><p class="small" style="margin-top:4px">' + esc(fb.next) + '</p></div>' : '') + '</div>';
  h += '<details class="card flat" style="margin-top:12px"><summary class="link" style="cursor:pointer">考え方の一例を見る</summary><p class="small" style="margin-top:8px">' + esc(th.example) + '</p><p class="tiny muted" style="margin-top:6px">あくまで一例です。あなたの視点と比べて、足りない視点だけ取り入れましょう。</p></details>';
  return h;
}

/* ---------------- lesson actions ---------------- */
function lessonRerender(keepScroll) {
  const o = $('#overlay'); const y = o.scrollTop;
  renderOverlay();
  if (keepScroll) o.scrollTop = y;
}
function checkAnswer() {
  const L = ui.L, step = L.steps[L.i], q = QBANK[step.qid];
  if (!canCheck(q, L)) return;
  const ok = grade(q, L);
  L.checked = true; L.lastOk = ok; L.total++;
  const cat = topicById(q.topicId).path[0];
  addSkill(q.skill, ok, cat);
  if (ok) {
    L.correct++; L.combo++; L.maxCombo = Math.max(L.maxCombo, L.combo);
    L.lastXp = (step.review ? 8 : 10) + (L.combo >= 3 ? 2 * (L.combo - 2) : 0);
    L.xp += L.lastXp;
  } else { L.combo = 0; L.lastXp = 0; }
  L.results.push({ qid: q.id, ok, review: !!step.review });
  L.lastLine = ok ? say('correct') : say('wrong');
  lessonRerender(true);
  const foot = $('#lfoot'); if (foot) foot.scrollIntoView({ block: 'end', behavior: 'smooth' });
}
function nextStep() {
  const L = ui.L;
  L.i++; L.sel = null; L.order = []; L.checked = false; L.showExp = false;
  const step = L.steps[L.i];
  if (!step || step.k === 'finish') return finishLesson();
  lessonRerender(false);
}
async function submitThought() {
  const L = ui.L, step = L.steps[L.i], t = topicById(L.topicId);
  const ta = $('#thoughtText'); const text = ta ? ta.value.trim() : '';
  if (text.length < 10) { toast('あと少し書いてみましょう（10文字以上）'); if (ta) ta.focus(); return; }
  L.thought = { text, loading: true };
  lessonRerender(true);
  const fb = await AI.feedback(t, step.variant, text);
  if (ui.L !== L) return;
  L.thought = { text, fb };
  const avg = AXES.reduce((a, [k]) => a + fb.scores[k], 0) / AXES.length;
  const gain = 15 + Math.round(avg * 3);
  L.xp += gain; L.thoughtDone = true;
  const cat = t.path[0];
  addSkill('logic', fb.scores.logic >= 3, cat); addSkill('multi', fb.scores.multi >= 3, cat);
  addSkill('verbal', fb.scores.verbal >= 3, cat); addSkill('applied', fb.scores.practical >= 3, cat);
  addSkill('critical', fb.scores.evidence >= 3, cat);
  if (step.variant === 'think') addSkill('future', (fb.scores.logic + fb.scores.concrete) / 2 >= 3, cat);
  S.thoughtCount++;
  lessonRerender(false);
  toast('+' + gain + ' XP　思考問題に回答しました');
}

/* ---------------- finish ---------------- */
function finishLesson() {
  const L = ui.L, now = Date.now();
  const t = L.kind === 'topic' ? topicById(L.topicId) : null;
  const prevLearned = new Set(learnedIds());
  const lvBefore = levelInfo(S.xp).lv;
  const bonus = L.kind === 'topic' ? 30 : 15;
  L.xp += bonus;
  // reviews
  L.results.forEach(r => {
    let it = S.reviews.find(x => x.qid === r.qid);
    if (r.review) {
      if (!it) return;
      if (r.ok) { it.stage++; if (it.stage >= REVIEW_STEPS.length) { S.reviews = S.reviews.filter(x => x !== it); return; } it.due = dayStart(now) + REVIEW_STEPS[it.stage] * DAY; }
      else { it.stage = 0; it.due = dayStart(now) + DAY; }
    } else {
      if (!it) { it = { qid: r.qid, stage: 0, due: 0 }; S.reviews.push(it); }
      if (r.ok) { it.stage = 1; it.due = dayStart(now) + REVIEW_STEPS[1] * DAY; } else { it.stage = 0; it.due = now; }
    }
  });
  if (L.kind === 'review') S.reviewDone++;
  // knowledge nodes
  const acc = L.total ? L.correct / L.total : 0.7;
  let newNodes = [], links = [];
  if (t) {
    t.nodes.forEach(k => {
      const n = S.nodes[k] || (S.nodes[k] = { mastery: 0, count: 0 });
      n.mastery = clamp(Math.round(n.mastery + 22 + 38 * acc), 0, 100);
      n.count++; n.last = now; n.next = dayStart(now) + (acc >= 0.8 ? 2 : 0) * DAY;
      if (!prevLearned.has(k)) newNodes.push(k);
    });
    newNodes.forEach(k => ADJ[k].forEach(a => { if (prevLearned.has(a.id) && !t.nodes.includes(a.id)) links.push([k, a.id, a.type]); }));
    t.nodes.forEach(k => { if (prevLearned.has(k)) ADJ[k].forEach(a => { if (prevLearned.has(a.id) && !t.nodes.includes(a.id) && !links.some(l => l[0] === k && l[1] === a.id)) links.push([k, a.id, a.type]); }); });
    S.completed[t.id] = (S.completed[t.id] || 0) + 1;
  } else {
    const ts = new Set(L.results.map(r => QBANK[r.qid].topicId));
    ts.forEach(id => topicById(id).nodes.forEach(k => { const n = S.nodes[k]; if (n) { n.mastery = clamp(n.mastery + Math.round(8 * acc), 0, 100); n.last = now; } }));
  }
  // streak
  const tk = dkey(now);
  const streakNew = S.streak.last !== tk;
  if (S.streak.last !== tk) {
    S.streak.count = S.streak.last && daysBetween(new Date(S.streak.last + 'T00:00:00'), now) === 1 ? S.streak.count + 1 : 1;
    S.streak.last = tk;
  }
  // missions bonus (before history push, compare)
  const mBefore = missions().map(m => m.done);
  S.history.push({ at: now, topicId: t ? t.id : null, title: t ? t.title : '復習セッション', xp: 0, correct: L.correct, total: L.total, minutes: L.minutes, mode: t ? L.mode : null, review: L.kind === 'review', thought: !!L.thoughtDone, maxCombo: L.maxCombo });
  const mAfter = missions();
  let mXp = 0; mAfter.forEach((m, i) => { if (m.done && !mBefore[i]) mXp += m.xp; });
  L.xp += mXp;
  S.history[S.history.length - 1].xp = L.xp;
  S.xp += L.xp;
  // snapshot
  S.snapshots.push({ at: now, cats: catScores() });
  if (S.snapshots.length > 120) S.snapshots = S.snapshots.slice(-120);
  // badges
  const nb = [];
  const give = id => { if (!S.badges.includes(id)) { S.badges.push(id); nb.push(id); } };
  give('first');
  if (L.maxCombo >= 3) give('combo3');
  if (S.thoughtCount >= 3) give('thinker');
  if (learnedIds().length >= 10) give('connector');
  if (S.streak.count >= 3) give('streak3');
  if (catScores()['採用・人事'] >= 80) give('hr');
  if (S.reviewDone >= 1) give('reviewer');
  if (Object.keys(S.completed).length >= 3) give('explorer');
  save();
  pushRanking();
  ui.lastResult = { xp: L.xp, bonus, mXp, correct: L.correct, total: L.total, maxCombo: L.maxCombo, newNodes, links, topicId: t ? t.id : null, kind: L.kind, badges: nb, lvUp: levelInfo(S.xp).lv > lvBefore, streakUp: streakNew && S.streak.count >= 2, thought: !!L.thoughtDone, skills: [...new Set(L.results.map(r => QBANK[r.qid].skill))] };
  ui.L = null;
  openOverlay('results');
  confetti();
}
function viewResults() {
  const R = ui.lastResult, lv = levelInfo(S.xp);
  const acc = R.total ? Math.round(R.correct / R.total * 100) : 0;
  let h = '<div class="lesson-body" style="text-align:center;padding-top:24px">' + owl(110, R.lvUp ? 'proud' : 'happy', 'bob ctr') +
    '<div class="tomo" style="justify-content:center;margin-top:6px"><div class="say">' + esc(R.lvUp ? say('levelup') : R.streakUp ? say('streak', { n: S.streak.count }) : say('finish')) + '</div></div>' +
    '<h2 style="font-size:26px;margin-top:8px">' + (R.kind === 'review' ? '復習完了！' : '今日の学習、完了！') + '</h2>' +
    '<p class="muted small" style="margin-top:4px">' + (acc >= 80 ? '素晴らしい理解度です。この調子で知識をつなげていきましょう。' : '学んだことは、復習のタイミングでもう一度届きます。') + '</p>' +
    '<div class="big-xp num" style="margin-top:18px">+' + R.xp + '</div><div class="small muted">XP 獲得</div>' +
    '<div class="resgrid" style="margin-top:18px"><div class="stat"><span class="num" style="color:var(--mint)">' + acc + '%</span><span class="lbl">正答率</span></div><div class="stat"><span class="num" style="color:#F0723B">' + R.maxCombo + '</span><span class="lbl">最大コンボ</span></div><div class="stat"><span class="num" style="color:var(--primary)">🔥' + S.streak.count + '</span><span class="lbl">連続日数</span></div></div>' +
    '<div class="card" style="margin-top:14px;text-align:left"><div class="row between small"><b>Lv.' + lv.lv + (R.lvUp ? '　<span class="combo">LEVEL UP!</span>' : '') + '</b><span class="muted">次まで ' + (lv.need - lv.cur) + ' XP</span></div><div class="bar sun" style="margin-top:8px"><i style="width:' + lv.pct + '%"></i></div>' +
    '<div class="tiny muted" style="margin-top:8px">内訳：問題・思考 ' + (R.xp - R.bonus - R.mXp) + ' ＋ 完了ボーナス ' + R.bonus + (R.mXp ? ' ＋ ミッション ' + R.mXp : '') + '</div></div>';
  if (R.badges.length) h += '<div style="margin-top:12px" class="stack">' + R.badges.map(id => { const b = BADGES.find(x => x.id === id); return '<div class="badge-new"><span style="font-size:30px">' + b.icon + '</span><div style="text-align:left"><b>新しいバッジ：' + b.name + '</b><div class="tiny muted">' + b.desc + '</div></div></div>'; }).join('') + '</div>';
  h += '<div class="card" style="margin-top:12px;text-align:left"><b class="small">今日鍛えたスキル</b><div class="chips" style="margin-top:8px">' + R.skills.map(k => '<span class="chip soft">' + SKILLS[k] + '</span>').join('') + (R.thought ? '<span class="chip soft">論理</span><span class="chip soft">言語化</span><span class="chip soft">多角的思考</span>' : '') + '</div>' +
    '<p class="tiny muted" style="margin-top:8px">次の復習：' + (S.reviews.length ? fmtDate(dueReviews(true)[0].due) : '—') + '（当日 → 2日後 → 7日後 → 21日後）</p></div>';
  h += '</div><div class="lesson-foot">' + (R.kind === 'topic' ? '<button class="btn btn-primary" data-a="toMapUpdate">知識マップの変化を見る</button>' : '<button class="btn btn-primary" data-a="closeOverlay">ホームに戻る</button>') + '</div>';
  return h;
}
function viewMapUpdate() {
  const R = ui.lastResult, t = topicById(R.topicId);
  const rec = recommend().find(r => r.t.id !== R.topicId && !r.done);
  let msg;
  if (R.links.length) {
    const names = [...new Set(R.links.map(l => NODES[l[1]].name))].slice(0, 3);
    msg = 'このニュースは、あなたの既存知識の「' + names.join('」「') + '」とつながりました。';
  } else if (R.newNodes.length) msg = '新しく ' + R.newNodes.length + ' つの知識がマップに加わりました。次のテーマを学ぶと、知識同士がつながりはじめます。';
  else msg = '既存の知識の理解度が上がりました。光が強くなっています。';
  let h = '<div class="lesson-top"><button class="iconbtn" data-a="closeOverlay" aria-label="閉じる">' + IC.close + '</button><b style="font-family:var(--f-head)">知識マップが更新されました</b></div><div class="lesson-body">';
  h += '<div class="mapwrap" id="minimap" style="height:340px"></div>';
  h += '<div class="tomo" style="margin-top:14px">' + owl(48, 'happy') + '<div class="say"><b>' + esc(say('map')) + '</b><br>' + esc(msg) + '</div></div>';
  if (R.newNodes.length) h += '<div class="chips" style="margin-top:12px">' + R.newNodes.map(k => '<span class="chip"><i style="width:8px;height:8px;border-radius:50%;background:' + MAP_CATS[NODES[k].cat] + ';display:inline-block"></i>' + esc(NODES[k].name) + ' <span class="tiny" style="color:var(--mint-deep)">NEW</span></span>').join('') + '</div>';
  if (R.links.length) h += '<div class="card flat small" style="margin-top:12px">' + R.links.slice(0, 4).map(l => '<div>🔗 ' + esc(NODES[l[0]].name) + ' ⇄ ' + esc(NODES[l[1]].name) + ' <span class="tag">' + REL_LABEL[l[2]] + '</span></div>').join('') + '</div>';
  if (rec) {
    h += '<div class="suggest"><div class="tomo">' + owl(40, 'normal') + '<div class="small"><span class="tag ai">次のおすすめテーマ</span><br>' + esc(say('recommend')) + '</div></div><h3 style="font-size:18px;margin-top:8px">' + rec.t.emoji + ' ' + esc(rec.t.title) + '</h3><p class="small muted" style="margin-top:4px">' + esc(rec.reasons.join('／')) + '</p>' +
      '<p class="small" style="margin-top:8px">このテーマを学ぶと「' + rec.t.nodes.filter(k => !isLearned(k)).slice(0, 3).map(k => NODES[k].name).join('」「') + '」が加わり、' + esc(t.title.split('：')[0]) + 'の知識とつながります。</p>' +
      '<button class="btn btn-primary" style="margin-top:12px" data-a="startMin" data-v="' + rec.t.id + '" data-m="10">このテーマを10分で学ぶ</button></div>';
  } else h += '<div class="suggest"><b>すべてのテーマを学習しました</b><p class="small muted" style="margin-top:4px">復習で知識を定着させましょう。新しいニュースは本番接続後に毎日届きます。</p></div>';
  h += '</div><div class="lesson-foot"><div class="row"><button class="btn btn-ghost grow" data-a="goGrowth">成長を見る</button><button class="btn btn-ghost grow" data-a="closeOverlay">ホームへ</button></div></div>';
  return h;
}

/* ---------------- news & chat ---------------- */
function viewNews() {
  const t = topicById(ui.news);
  return '<div class="lesson-top"><button class="iconbtn" data-a="closeOverlay" aria-label="戻る">' + IC.back + '</button><b class="small muted grow">' + esc(t.path.slice(0, 3).join(' ＞ ')) + '</b></div><div class="lesson-body">' +
    '<div class="kicker">' + t.emoji + ' ' + esc(t.kind) + '</div><h2 class="qtitle" style="margin-bottom:0">' + esc(t.title) + '</h2>' +
    '<div class="chips" style="margin-top:8px">' + t.industries.map(i => '<span class="chip soft tiny">' + i + '</span>').join('') + '</div>' +
    readingHTML(t, ui.newsDepth, 'newsDepth') + '</div>' +
    '<div class="lesson-foot"><div class="row"><button class="btn btn-ghost" style="width:auto" data-a="chat" data-v="' + t.id + '">AIと話す</button><button class="btn btn-primary grow" data-a="start" data-v="' + t.id + '">このテーマを学ぶ</button></div></div>';
}
function viewChat() {
  const c = ui.chat, t = topicById(c.topicId);
  const presets = ['採用業界にはどう影響する？', '逆に企業側にはメリットない？', '採用コンサルなら何を提案する？', 'このニュースの反対意見は？'];
  return '<div class="lesson-top"><button class="iconbtn" data-a="closeChat" aria-label="戻る">' + IC.back + '</button><div class="grow"><b style="font-family:var(--f-head);font-size:14px">AIディスカッション</b><div class="tiny muted">' + esc(t.title) + '</div></div><span data-ai-status>' + aiStatusHTML() + '</span></div>' +
    '<div class="chatlog" id="chatlog">' +
    '<div class="row" style="align-items:flex-end;gap:8px">' + owl(34, 'normal') + '<div class="msg ai">' + esc(say('start')) + '\nこのニュースについて、何でも聞いてね。事実と解釈は分けて答えます。</div></div>' +
    c.log.map(m => '<div class="msg ' + (m.role === 'user' ? 'me' : 'ai') + '">' + esc(m.content) + '</div>').join('') +
    (c.busy ? '<div class="msg ai" id="streaming">' + (c.partial ? esc(c.partial) : '<span class="spinner" style="display:inline-block;vertical-align:middle"></span> 考えています') + '</div>' : '') +
    '</div>' +
    (!c.busy ? '<div class="scroll-x" style="padding:0 18px 8px">' + presets.map(p => '<button class="chip" data-a="chatPreset" data-v="' + esc(p) + '">' + esc(p) + '</button>').join('') + '</div>' : '') +
    '<div class="chatin"><input id="chatInput" placeholder="質問を入力" maxlength="300" ' + (c.busy ? 'disabled' : '') + ' aria-label="質問"><button class="btn btn-primary btn-sm" data-a="chatSend" ' + (c.busy ? 'disabled' : '') + '>送信</button></div>';
}
async function sendChat(text) {
  const c = ui.chat; text = (text || '').trim(); if (!text || c.busy) return;
  const t = topicById(c.topicId);
  c.log.push({ role: 'user', content: text }); c.busy = true; c.partial = '';
  renderOverlay();
  const answer = await AI.chat(t, c.log, text => { c.partial = text; const el = $('#streaming'); if (el) el.textContent = text; });
  c.log.push({ role: 'assistant', content: answer }); c.busy = false; c.partial = '';
  if (ui.overlay === 'chat') renderOverlay();
}

