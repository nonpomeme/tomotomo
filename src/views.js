/* TomoTomo — 画面（ホーム・学習・成長・その他・ログイン/オンボーディング）
   読み込み順は index.html の <script> の並び順。各ファイルはグローバルを共有する（ビルド不要）。 */
/* =========================================================
   TomoTomo — views
   ========================================================= */
const ui = { tab: 'home', overlay: null, L: null, chat: null, news: null, newsDepth: 's3', mapView: null, mapCat: 'all', learnCat: 'すべて', learnInd: '', modal: null, ob: 0, minutes: null, lastResult: null, rankRows: null };

const IC = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="5" cy="6" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="12" cy="13" r="2.8"/><circle cx="6" cy="19" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7 7.5l3 3.5M16 6.5l-2.6 4.4M10 15l-2.5 2.5M14.5 14.5l2.6 2"/></svg>',
  learn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/></svg>',
  growth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>'
};

/* ---------------- shell ---------------- */
function render() {
  applyTheme();
  const root = $('#app');
  if (!S.loggedIn) { root.innerHTML = viewLogin(); $('#nav').innerHTML = ''; return; }
  if (!S.profile.onboarded) { root.innerHTML = viewOnboard(); $('#nav').innerHTML = ''; return; }
  const views = { home: viewHome, map: viewMap, learn: viewLearn, growth: viewGrowth, more: viewMore };
  root.innerHTML = topbar() + '<main class="screen">' + views[ui.tab]() + '</main>';
  $('#nav').innerHTML = navHTML();
  if (ui.tab === 'map') mountMap('#mainmap', true);
  if (ui.tab === 'growth' && S.ranking) loadRanking();
}
function applyTheme() { const r = document.documentElement; if (S.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', S.theme); }
function topbar() {
  const lv = levelInfo(S.xp);
  return '<header class="topbar"><div class="brand">' + owl(30) + '<span>' + esc(S.appName) + '</span></div>' +
    '<div class="stats"><span class="pill fire" title="連続学習日数">🔥 ' + S.streak.count + '</span><span class="pill xp" title="合計XP">⚡ ' + S.xp + '</span><span class="pill lv">Lv.' + lv.lv + '</span></div></header>';
}
function navHTML() {
  const items = [['home', 'ホーム'], ['map', '知識マップ'], ['learn', '学習'], ['growth', '成長'], ['more', 'その他']];
  return '<div class="nav-in">' + items.map(([k, l]) => '<button data-a="tab" data-v="' + k + '" class="' + (ui.tab === k ? 'on' : '') + '" aria-label="' + l + '">' + IC[k] + '<span>' + l + '</span></button>').join('') + '</div>';
}

/* ---------------- login / onboarding ---------------- */
function viewLogin() {
  return '<div class="login">' +
    '<div style="display:flex;justify-content:center">' + (S.partner ? owl(120, 'normal', 'bob') : partnerArt('tomo', 120, 'normal', 'bob')) + '</div>' +
    '<div class="lineup" aria-hidden="true">' + PARTNER_ORDER.filter(id => id !== (S.partner || 'tomo')).map(id => partnerArt(id, 34)).join('') + '</div>' +
    '<h1>' + esc(S.appName) + '</h1>' +
    '<p class="muted" style="margin-top:6px">毎日10分。ニュースと教養が、あなたの知識マップでつながっていく。</p>' +
    '<div style="margin-top:32px" class="stack">' +
    '<button class="btn btn-primary" data-a="login" data-v="account">アカウントで続ける</button>' +
    '<button class="btn btn-ghost" data-a="login" data-v="guest">ゲストではじめる</button>' +
    '</div>' +
    '<p class="tiny muted" style="margin-top:18px">アカウントで続けると、学習データがクラウドに保存され、別の端末でも引き継げます。ゲストの場合はこの端末に保存されます。</p>' +
    '</div>';
}
function viewOnboard() {
  const p = S.profile, st = ui.ob;
  const steps = 5;
  let body = '';
  if (st === 0) {
    body = '<h2 style="font-size:22px">あなたの学習パートナーを選ぼう</h2><p class="muted small" style="margin-top:6px">一緒に知識を育てる相棒です。話し方やリアクションが変わりますが、学習内容の質は同じです。あとから変更できます。</p>' +
      partnerCards('partnerPick', S.partner) +
      '<button class="link" style="display:block;margin:14px auto 0" data-a="partnerSkip">あとで選ぶ</button>';
  } else if (st === 1) {
    body = '<div class="tomo">' + owl(52, 'happy', 'bob') + '<div class="say">' + esc(say('greet')) + '<br><span class="small muted">まず少しだけ教えてください。</span></div></div>' +
      '<label class="field" style="margin-top:18px"><span>呼び名</span><input class="input" data-f="profile.name" value="' + esc(p.name) + '" placeholder="例：ゆうき" maxlength="20"></label>' +
      '<div class="field"><span>職種</span><div class="choice">' + OCCUPATIONS.map(o => '<button class="chip ' + (p.occupation === o ? 'on' : '') + '" data-a="pick" data-k="occupation" data-v="' + esc(o) + '">' + esc(o) + '</button>').join('') + '</div></div>' +
      '<div class="field"><span>役職</span><div class="chips">' + ROLES.map(o => '<button class="chip ' + (p.role === o ? 'on' : '') + '" data-a="pick" data-k="role" data-v="' + o + '">' + o + '</button>').join('') + '</div></div>';
  } else if (st === 2) {
    body = '<h2 style="font-size:22px">あなたの業界は？</h2><p class="muted" style="margin-top:6px">業界に閉じず、関連する業界の知識も自動でおすすめします。</p>' +
      '<div class="chips" style="margin-top:16px">' + INDUSTRIES.map(o => '<button class="chip ' + (p.industry === o ? 'on' : '') + '" data-a="pick" data-k="industry" data-v="' + o + '">' + o + '</button>').join('') + '</div>';
  } else if (st === 3) {
    body = '<h2 style="font-size:22px">興味のあるテーマは？</h2><p class="muted" style="margin-top:6px">いくつでも選べます。あとから変更できます。</p>' +
      '<div class="chips" style="margin-top:16px">' + INTEREST_OPTIONS.map(o => '<button class="chip ' + (p.interests.includes(o) ? 'on' : '') + '" data-a="toggleInterest" data-v="' + o + '">' + o + '</button>').join('') + '</div>';
  } else {
    body = '<h2 style="font-size:22px">1日の学習時間とモード</h2>' +
      '<div class="field"><span>学習時間</span><div class="choice" style="grid-template-columns:repeat(3,1fr)">' + [3, 10, 15].map(m => '<button class="chip ' + (p.minutes === m ? 'on' : '') + '" data-a="pick" data-k="minutes" data-v="' + m + '">' + m + '分</button>').join('') + '</div></div>' +
      '<div class="field"><span>学習モード</span>' + modeCards(p.mode, 'pickMode') + '</div>';
  }
  const canNext = st === 0 ? !!S.partner : st === 1 ? !!(p.name.trim() && p.occupation) : st === 2 ? !!p.industry : st === 3 ? p.interests.length > 0 : true;
  return '<div class="overlay-in" style="min-height:100vh"><div class="lesson-top">' +
    (st > 0 ? '<button class="iconbtn" data-a="obBack" aria-label="戻る">' + IC.back + '</button>' : '<span style="width:36px"></span>') +
    '<div class="bar"><i style="width:' + ((st + 1) / steps * 100) + '%"></i></div></div>' +
    '<div class="lesson-body">' + body + '</div>' +
    (st === 0 ? '' : '<div class="lesson-foot"><button class="btn btn-primary" data-a="obNext" ' + (canNext ? '' : 'disabled') + '>' + (st === steps - 1 ? '学習をはじめる準備をする' : 'つぎへ') + '</button></div>') + '</div>';
}
function modeCards(cur, action) {
  return Object.keys(MODES).map(k => {
    const m = MODES[k];
    return '<button class="opt ' + (cur === k ? 'sel' : '') + '" data-a="' + action + '" data-v="' + k + '" style="display:flex;gap:12px;align-items:flex-start">' +
      '<span style="font-size:24px;line-height:1.2">' + m.icon + '</span><span><b style="font-family:var(--f-head)">' + m.name + 'モード</b>' + (k === 'auto' ? ' <span class="tag ai">推奨</span>' : '') +
      '<br><span class="small muted" style="font-weight:500">' + m.desc + '</span></span></button>';
  }).join('');
}

/* ---------------- home ---------------- */
function greeting() { const h = new Date().getHours(); return h < 11 ? 'おはようございます' : h < 18 ? 'こんにちは' : 'こんばんは'; }
function viewHome() {
  const recs = recommend();
  const today = recs[0];
  const mins = ui.minutes || S.profile.minutes;
  const doneToday = todayHistory().some(h => !h.review);
  const due = dueReviews();
  const allRev = S.reviews.length;
  const learned = learnedIds().sort((a, b) => (S.nodes[b].last || 0) - (S.nodes[a].last || 0)).slice(0, 8);
  const bubble = doneToday ? say('finish') + '　もう1テーマいくと、知識がさらにつながります。' : say('greet') + (today.reasons.length ? '　今日のテーマを選んだ理由は「' + today.reasons[0] + '」。' : '');
  const days = new Set(S.history.map(x => dkey(x.at))).size;
  const histNote = hasUnlock(50) && days ? '<div class="small muted" style="margin-top:4px">' + esc(say('history', { days })) + '</div>' : '';
  let h = '<div class="tomo" style="margin:6px 0 12px">' + owl(52, doneToday ? 'happy' : 'normal', 'bob') + '<div class="say"><b>' + greeting() + '、' + esc(S.profile.name) + 'さん</b><br>' + esc(bubble) + histNote + '</div></div>';
  h += '<section class="hero">' +
    '<div class="meta">' + (doneToday ? '次のおすすめ' : '今日のテーマ') + '　' + esc(today.t.kind) + '・' + fmtYMD(today.t.date) + '</div>' +
    '<h2>' + today.t.emoji + ' ' + esc(today.t.title) + '</h2>' +
    '<div class="meta">' + esc(today.t.path.slice(0, 3).join(' ＞ ')) + '</div>' +
    '<div class="why">' + today.reasons.map(r => '<span>' + esc(r) + '</span>').join('') + '</div>' +
    '<div class="timechips" role="group" aria-label="学習時間">' + [3, 10, 15].map(m => '<button data-a="minutes" data-v="' + m + '" class="' + (mins === m ? 'on' : '') + '">' + m + '分</button>').join('') + '</div>' +
    '<button class="btn" data-a="start" data-v="' + today.t.id + '">' + (doneToday ? 'もう1テーマ学ぶ' : '今日の学習をはじめる') + '</button>' +
    '<div class="meta" style="margin-top:10px;text-align:center">' + MODES[S.profile.mode].icon + ' ' + MODES[S.profile.mode].name + 'モード　<button class="link" style="color:#fff;text-decoration:underline" data-a="tab" data-v="learn">変更</button></div>' +
    '</section>';
  h += '<div class="statgrid">' +
    '<div class="stat"><span class="num" style="color:#F0723B">' + S.streak.count + '</span><span class="lbl">連続学習日数</span></div>' +
    '<div class="stat"><span class="num" style="color:var(--sun-deep)">' + todayHistory().reduce((a, x) => a + x.xp, 0) + '</span><span class="lbl">今日のXP</span></div>' +
    '<div class="stat"><span class="num" style="color:var(--primary)">' + weekDays() + '/5</span><span class="lbl">週間目標（日）</span></div></div>';
  h += '<div class="sec-title">復習</div><div class="card">';
  if (due.length) h += '<div class="row">' + owl(40, 'normal') + '<div class="grow"><b>🔁 復習が' + due.length + '問あります</b><div class="small muted">' + esc(say('review', { n: due.length })) + '</div></div></div><button class="btn btn-mint" style="margin-top:12px" data-a="review">復習する（約' + Math.max(1, Math.ceil(Math.min(6, due.length) / 2)) + '分）</button>';
  else if (allRev) {
    const next = dueReviews(true)[0];
    h += '<div class="row"><div class="grow"><b>✅ 今日の復習はありません</b><div class="small muted">次の復習：' + fmtDate(next.due) + '（' + Math.max(1, daysBetween(Date.now(), next.due)) + '日後）</div></div><button class="btn btn-ghost btn-sm" data-a="reviewEarly">前倒しで復習</button></div>';
  } else h += '<div class="small muted">学習すると、忘れるタイミングに合わせてここに復習が届きます（当日 → 2日後 → 7日後 → 21日後）。</div>';
  h += '</div>';
  const other = recs.find(r => r.t.id !== today.t.id && !r.done) || recs[1];
  if (other) {
    h += '<div class="sec-title">おすすめ</div><button class="card listcard" data-a="news" data-v="' + other.t.id + '"><span class="ic">' + other.t.emoji + '</span><span class="grow"><b style="font-family:var(--f-head)">' + esc(other.t.title) + '</b><br><span class="small muted">' + esc(other.reasons[0] || other.t.kind) + '</span></span></button>';
  }
  h += '<div class="sec-title">最近の知識<button class="link" data-a="tab" data-v="map">マップを見る</button></div>';
  if (learned.length) h += '<div class="chips">' + learned.map(k => '<button class="chip" data-a="openNode" data-v="' + k + '"><i style="width:8px;height:8px;border-radius:50%;background:' + MAP_CATS[NODES[k].cat] + ';display:inline-block"></i>' + esc(NODES[k].name) + '</button>').join('') + '</div>';
  else h += '<div class="card flat small muted">まだ知識ノードはありません。今日の学習を終えると、ここに追加されます。</div>';
  h += '<div class="sec-title">デイリーミッション</div><div class="card">' + missionsHTML() + '</div>';
  h += '<div class="sec-title">今日のニュース</div>' + TOPICS.map(t => '<button class="card listcard" data-a="news" data-v="' + t.id + '"><span class="ic">' + t.emoji + '</span><span class="grow"><b style="font-family:var(--f-head);font-size:14.5px">' + esc(t.title) + '</b><br><span class="tiny muted">' + fmtYMD(t.date) + '／' + esc(t.sources.map(s => s.name).join('・')) + '</span></span></button>').join('');
  return h;
}
function missions() {
  const th = todayHistory();
  return [
    { name: '今日の学習を1つ完了する', done: th.some(h => !h.review), xp: 20 },
    { name: '思考問題に回答する', done: th.some(h => h.thought), xp: 15 },
    { name: '3問連続で正解する', done: th.some(h => h.maxCombo >= 3), xp: 15 }
  ];
}
function missionsHTML() {
  return missions().map(m => '<div class="mission"><span class="check ' + (m.done ? 'on' : '') + '">' + (m.done ? '✓' : '') + '</span><span class="grow" style="' + (m.done ? 'color:var(--ink3);text-decoration:line-through' : '') + '">' + m.name + '</span><span class="tiny num" style="color:var(--sun-deep)">+' + m.xp + 'XP</span></div>').join('');
}

/* ---------------- learn ---------------- */
function viewLearn() {
  const p = S.profile;
  let h = '<h2 style="font-size:22px;margin:6px 2px 4px">学習</h2><p class="small muted" style="margin:0 2px">モードと時間を選ぶと、AIが内容を組み立て直します。</p>';
  h += '<div class="sec-title">学習モード</div>' + modeCards(p.mode, 'setMode');
  h += '<div class="sec-title">1日の学習時間</div><div class="choice" style="grid-template-columns:repeat(3,1fr)">' + [3, 10, 15].map(m => '<button class="chip ' + (p.minutes === m ? 'on' : '') + '" data-a="setMinutes" data-v="' + m + '">' + m + '分</button>').join('') + '</div>';
  h += '<p class="tiny muted" style="margin:8px 2px 0">3分：要点＋クイズ2問　／　10分：背景と重要ポイント＋クイズ＋思考問題　／　15分：因果関係・多角的視点・実務応用まで</p>';
  h += '<div class="sec-title">カテゴリー</div><div class="scroll-x">' + ['すべて'].concat(BIG_CATEGORIES).map(c => '<button class="chip ' + (ui.learnCat === c ? 'on' : '') + '" data-a="learnCat" data-v="' + c + '">' + c + '</button>').join('') + '</div>';
  const relInd = RELATED_INDUSTRIES[p.industry] || RELATED_INDUSTRIES._;
  const indOrder = [p.industry].concat(relInd).concat(INDUSTRIES.filter(x => x !== p.industry && !relInd.includes(x))).filter(Boolean);
  h += '<div class="sec-title">業界<span class="tiny muted" style="font-weight:500">あなたの業界と関連業界を先頭に表示</span></div><div class="scroll-x">' +
    '<button class="chip ' + (!ui.learnInd ? 'on' : '') + '" data-a="learnInd" data-v="">すべて</button>' +
    indOrder.map(c => '<button class="chip ' + (ui.learnInd === c ? 'on' : '') + '" data-a="learnInd" data-v="' + c + '">' + (c === p.industry ? '★ ' : '') + c + '</button>').join('') + '</div>';
  const list = TOPICS.filter(t => {
    const catOk = ui.learnCat === 'すべて' || t.tags.includes(ui.learnCat) || t.path.some(x => x.includes(ui.learnCat)) || (ui.learnCat === '人事' && t.tags.includes('採用'));
    const indOk = !ui.learnInd || t.industries.includes(ui.learnInd);
    return catOk && indOk;
  });
  h += '<div class="sec-title">テーマ（' + list.length + '）</div>';
  if (!list.length) h += '<div class="card flat"><div class="tomo">' + owl(44, 'think') + '<div class="small">「' + esc(ui.learnInd || ui.learnCat) + '」のテーマは、ニュースAPI接続後に毎日配信されます。いまは近いテーマから学べます。</div></div><button class="btn btn-ghost" style="margin-top:12px" data-a="learnReset">すべてのテーマを表示</button></div>';
  h += list.map(topicCard).join('');
  h += '<div class="sec-title">採用・人事の注目領域</div><div class="card flat"><div class="chips">' +
    ['採用市場', '新卒採用', '中途採用', '転職市場', '人材不足', '賃金', '人材紹介', 'HR Tech', 'AI×採用', 'AI面接', '採用マーケティング', 'ダイレクトリクルーティング', '人的資本', '組織開発', '人材育成', 'マネジメント', '労働市場', '働き方', '労働政策', '海外HR', '人事戦略'].map(x => {
      const t = TOPICS.find(tp => tp.title.includes(x) || tp.nodes.some(n => NODES[n].name === x));
      return t ? '<button class="chip on" data-a="news" data-v="' + t.id + '">' + x + '</button>' : '<span class="chip soft">' + x + '</span>';
    }).join('') + '</div><p class="tiny muted" style="margin-top:10px">色つきの領域は学習できるテーマがあります。その他はニュースAPI接続後に追加されます。</p></div>';
  return h;
}
function topicCard(t) {
  const done = S.completed[t.id] || 0;
  const m = Math.round(t.nodes.reduce((a, k) => a + (S.nodes[k] ? S.nodes[k].mastery : 0), 0) / t.nodes.length);
  return '<div class="card" style="margin-bottom:10px"><div class="row" style="align-items:flex-start"><span style="font-size:28px">' + t.emoji + '</span><div class="grow">' +
    '<div class="tiny muted">' + esc(t.path.join(' ＞ ')) + '</div>' +
    '<b style="font-family:var(--f-head);font-size:16px;display:block;margin-top:2px">' + esc(t.title) + '</b>' +
    '<div class="tiny muted" style="margin-top:2px">' + esc(t.kind) + '・' + fmtYMD(t.date) + (done ? '　<span class="tag fact">学習済み ×' + done + '</span>' : '') + '</div>' +
    '<div class="row" style="margin-top:8px"><div class="bar mint grow" style="height:7px"><i style="width:' + m + '%"></i></div><span class="tiny num">' + m + '%</span></div>' +
    '</div></div><div class="row" style="margin-top:12px"><button class="btn btn-ghost btn-sm grow" data-a="news" data-v="' + t.id + '">ニュースを読む</button><button class="btn btn-primary btn-sm grow" data-a="start" data-v="' + t.id + '">' + S.profile.minutes + '分で学ぶ</button></div></div>';
}

/* ---------------- growth ---------------- */
function viewGrowth() {
  const lv = levelInfo(S.xp);
  const cs = catScores();
  const snaps = S.snapshots;
  let base = null, baseLabel = '';
  if (snaps.length) {
    const old = snaps.filter(s => daysBetween(s.at, Date.now()) >= 25);
    if (old.length) { base = old[old.length - 1]; baseLabel = '先月'; } else { base = { cats: {} }; baseLabel = '学習開始時'; }
  }
  let h = '<h2 style="font-size:22px;margin:6px 2px 12px">成長</h2>';
  h += '<div class="card"><div class="lvring">' + ring(lv.pct, 'Lv.' + lv.lv) + '<div class="grow"><b style="font-family:var(--f-head);font-size:18px">総合レベル ' + lv.lv + '</b><div class="small muted">次のレベルまで ' + (lv.need - lv.cur) + ' XP</div>' +
    '<div class="row small" style="margin-top:6px;gap:14px"><span>⚡ <b class="num">' + S.xp + '</b> XP</span><span>🔥 <b class="num">' + S.streak.count + '</b> 日</span><span>🧩 <b class="num">' + learnedIds().length + '</b> 知識</span></div></div></div></div>';
  h += '<div class="sec-title">カテゴリー別の理解度</div><div class="card">' + Object.keys(cs).map(c => {
    const d = base ? cs[c] - (base.cats[c] || 0) : 0;
    return '<div class="catrow"><span>' + c + '</span><div class="bar"><i style="width:' + cs[c] + '%;background:' + MAP_CATS[c] + '"></i></div><span class="num small" style="text-align:right">' + cs[c] + '%</span></div>' + (d > 0 ? '<div class="tiny" style="color:var(--mint-deep);margin:-4px 0 4px 106px">' + baseLabel + 'より +' + d + '%</div>' : '');
  }).join('') + '</div>';
  h += '<div class="sec-title">思考スキル</div><div class="card">' + radar() + '</div>';
  h += '<div class="sec-title">' + esc(partnerName()) + 'と振り返る</div><div class="card stack">' + analysisHTML(cs, base, baseLabel) + '</div>';
  h += '<div class="sec-title">デイリーミッション</div><div class="card">' + missionsHTML() + '<div style="margin-top:14px" class="small"><div class="row between"><span>週間目標：5日学習</span><b class="num">' + weekDays() + '/5</b></div><div class="bar sun" style="margin-top:6px"><i style="width:' + Math.min(100, weekDays() / 5 * 100) + '%"></i></div></div></div>';
  h += '<div class="sec-title">バッジ</div><div class="card"><div class="badges">' + BADGES.map(b => '<div class="badge ' + (S.badges.includes(b.id) ? 'on' : '') + '" title="' + esc(b.desc) + '"><div class="b">' + b.icon + '</div>' + b.name + '</div>').join('') + '</div></div>';
  if (S.ranking) h += '<div class="sec-title">ランキング（今週）</div><div class="card" id="rankbox">' + rankHTML() + '</div>';
  h += '<div class="sec-title">学習履歴</div><div class="card">' + (S.history.length ? S.history.slice().reverse().slice(0, 30).map(x => '<div class="hist"><span style="font-size:20px">' + (x.review ? '🔁' : (topicById(x.topicId) || {}).emoji || '📘') + '</span><div class="grow"><b style="font-size:13.5px">' + esc(x.title) + '</b><div class="tiny muted">' + fmtDate(x.at) + '・' + x.minutes + '分・正答 ' + x.correct + '/' + x.total + (x.mode ? '・' + MODES[x.mode].name : '') + '</div></div><span class="num small" style="color:var(--sun-deep)">+' + x.xp + '</span></div>').join('') : '<div class="small muted">まだ履歴はありません。</div>') + '</div>';
  return h;
}
function ring(pct, label) {
  const r = 36, c = 2 * Math.PI * r;
  return '<svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="レベル進捗 ' + pct + '%"><circle cx="46" cy="46" r="' + r + '" fill="none" stroke="var(--surface2)" stroke-width="10"/><circle cx="46" cy="46" r="' + r + '" fill="none" stroke="var(--sun)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (c * pct / 100) + ' ' + c + '" transform="rotate(-90 46 46)"/><text x="46" y="52" text-anchor="middle" font-family="M PLUS Rounded 1c,sans-serif" font-weight="800" font-size="18" fill="var(--ink)">' + label + '</text></svg>';
}
function radar() {
  const list = skillList(); const n = list.length; const cx = 150, cy = 130, R = 92;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  let g = '';
  [0.33, 0.66, 1].forEach(v => { g += '<polygon points="' + list.map((_, i) => pt(i, v).join(',')).join(' ') + '" fill="none" stroke="var(--line)" stroke-width="1.5"/>'; });
  const poly = list.map((s, i) => pt(i, s.rate == null ? 0.05 : Math.max(0.08, s.rate)).join(',')).join(' ');
  g += '<polygon points="' + poly + '" fill="rgba(79,91,239,.22)" stroke="var(--primary)" stroke-width="2.5" stroke-linejoin="round"/>';
  list.forEach((s, i) => { const [x, y] = pt(i, 1.22); g += '<text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" font-size="11.5" font-weight="700" fill="' + (s.rate == null ? 'var(--ink3)' : 'var(--ink2)') + '">' + s.name + (s.rate == null ? '' : ' ' + Math.round(s.rate * 100)) + '</text>'; });
  return '<svg viewBox="0 0 300 265" role="img" aria-label="思考スキルのレーダーチャート">' + g + '</svg><p class="tiny muted" style="text-align:center">数字は正答率・評価の割合（%）。まだ測っていないスキルはグレーです。</p>';
}
function analysisHTML(cs, base, baseLabel) {
  const out = [];
  const w = weakSkills();
  if (!w.length) return '<div class="tomo">' + owl(44) + '<div class="small">最初の学習を終えると、知識・理解・因果関係・論理・多角的思考などを分けて分析します。</div></div>';
  const strong = w.slice().reverse()[0], weak = w[0];
  out.push('<div><span class="tag fact">今の強み</span><p style="margin-top:4px">「' + strong.name + '」が安定しています（' + Math.round(strong.rate * 100) + '%）。</p></div>');
  let detail = '';
  Object.keys(MAP_CATS).concat(['採用・人事', '経済', '金融']).forEach(cat => {
    const k = S.skillCat[cat + '|knowledge'], c = S.skillCat[cat + '|causal'];
    if (!detail && k && c && k.t && c.t && k.c / k.t >= 0.7 && c.c / c.t < 0.6) detail = cat + 'の用語は理解していますが、' + cat + 'ニュースの因果関係がやや弱めです。';
  });
  out.push('<div><span class="tag" style="background:var(--coral-soft);color:var(--coral-deep)">今の弱点</span><p style="margin-top:4px">' + (detail || '「' + weak.name + '」がもう少しで伸びそうです（' + Math.round(weak.rate * 100) + '%）。') + '</p>' +
    (hasUnlock(30) ? '<div class="tomo" style="margin-top:8px">' + owl(40, 'think') + '<div class="say small">' + esc(say('weak', { weak: weak.name })) + '</div></div>' : '') + '</div>');
  if (base) {
    const grown = Object.keys(cs).map(c => [c, cs[c] - (base.cats[c] || 0)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    out.push('<div><span class="tag ai">' + baseLabel + 'から伸びたこと</span><p style="margin-top:4px">' + (grown.length ? grown.slice(0, 3).map(g => g[0] + ' +' + g[1] + '%').join('、') : 'これから伸ばしていきましょう') + '</p></div>');
  }
  const rec = recommend()[0];
  out.push('<div><span class="tag ai">次に学ぶべきこと</span><p style="margin-top:4px">' + esc(rec.t.title) + '<br><span class="small muted">' + esc(rec.reasons.join('／')) + '</span></p><button class="btn btn-primary btn-sm" style="margin-top:8px" data-a="start" data-v="' + rec.t.id + '">このテーマを学ぶ</button></div>');
  return out.join('');
}
function rankHTML() {
  if (!Remote.db) return '<div class="small muted">ランキングは、共有データに接続できる環境で利用できます。この環境では表示できません。</div>';
  if (!ui.rankRows) return '<div class="row"><div class="spinner"></div><span class="small muted">読み込み中</span></div>';
  const rows = ui.rankRows.slice().sort((a, b) => b.weekXp - a.weekXp);
  const same = rows.filter(r => r.occupation === S.profile.occupation);
  const list = (arr) => arr.map((r, i) => '<div class="hist"><b class="num" style="width:22px">' + (i + 1) + '</b><span class="grow">' + esc(r.nick || '名無し') + (r.me ? ' <span class="tag ai">あなた</span>' : '') + '<br><span class="tiny muted">' + esc(r.occupation || '') + '</span></span><span class="num">' + r.weekXp + ' XP</span></div>').join('');
  return '<b class="small">週間ランキング</b>' + list(rows) + (rows.length < 2 ? '<p class="tiny muted">このページを共有した仲間がランキングをONにすると、ここに並びます。</p>' : '') +
    '<b class="small" style="display:block;margin-top:12px">同じ職種（' + esc(S.profile.occupation) + '）</b>' + list(same);
}
async function loadRanking() {
  if (!Remote.db || !Remote.uid) { const b = $('#rankbox'); if (b) b.innerHTML = rankHTML(); return; }
  try {
    await pushRanking();
    const snap = await Remote.db.collection('ranking').where('week', '==', weekKey(Date.now())).get();
    ui.rankRows = snap.docs.map(d => Object.assign({}, d.data(), { me: d.id === Remote.uid }));
  } catch (e) { ui.rankRows = []; }
  const b = $('#rankbox'); if (b) b.innerHTML = rankHTML();
}
async function pushRanking() {
  if (!S.ranking || !Remote.db || !Remote.uid) return;
  try { await Remote.db.collection('ranking').doc(Remote.uid).set({ nick: S.profile.name.slice(0, 20), occupation: S.profile.occupation, weekXp: weekXP(), week: weekKey(Date.now()), at: Date.now() }); } catch (e) { }
}

/* ---------------- more ---------------- */
function viewMore() {
  const p = S.profile, n = S.notif;
  const sel = (key, opts, cur) => '<select class="select" data-f="profile.' + key + '">' + opts.map(o => '<option ' + (o === cur ? 'selected' : '') + '>' + o + '</option>').join('') + '</select>';
  let h = '<h2 style="font-size:22px;margin:6px 2px 12px">その他</h2>';
  h += '<div class="sec-title">プロフィール</div><div class="card">' +
    '<label class="field" style="margin-top:0"><span>呼び名</span><input class="input" data-f="profile.name" value="' + esc(p.name) + '" maxlength="20"></label>' +
    '<label class="field"><span>職種</span>' + sel('occupation', OCCUPATIONS, p.occupation) + '</label>' +
    '<label class="field"><span>業界</span>' + sel('industry', INDUSTRIES, p.industry) + '</label>' +
    '<label class="field"><span>役職</span>' + sel('role', ROLES, p.role) + '</label>' +
    '<div class="field"><span>興味</span><div class="chips">' + INTEREST_OPTIONS.map(o => '<button class="chip ' + (p.interests.includes(o) ? 'on' : '') + '" data-a="toggleInterest" data-v="' + o + '">' + o + '</button>').join('') + '</div></div></div>';
  const pp = partner();
  h += '<div class="sec-title">学習パートナー</div><div class="card"><div class="row">' + owl(64, 'happy') + '<div class="grow"><span class="plabel">' + pp.label + '・' + partnerTitle() + '</span><br><b style="font-family:var(--f-head);font-size:17px">' + esc(pp.name) + '</b><div class="tiny muted">' + esc(pp.trait) + '</div></div></div>' +
    '<button class="btn btn-ghost" style="margin-top:12px" data-a="openPartnerChange">学習パートナーを変更</button>' +
    '<p class="tiny muted" style="margin-top:8px">変更しても、学習履歴・知識マップ・レベル・XPはそのまま残ります。</p>' +
    '<div class="small" style="margin:14px 0 8px"><b>パートナーの成長</b>（あなたのレベル Lv.' + partnerLv() + ' に連動）</div>' + partnerGrowthHTML() +
    '<p class="tiny muted" style="margin-top:10px">成長で増えるのは表情やリアクションだけです。学習機能が有利・不利になることはありません。</p></div>';
  h += '<div class="sec-title">通知</div><div class="card">' +
    '<div class="setrow"><span><b>通知を受け取る</b></span><button class="switch ' + (n.enabled ? 'on' : '') + '" data-a="notifToggle" aria-label="通知を受け取る" aria-pressed="' + n.enabled + '"></button></div>' +
    [['morning', '☀️ 朝', '今日の10分教養'], ['noon', '💡 昼', '今日のおすすめニュース'], ['night', '🧠 夜', '復習のお知らせ']].map(([k, l, d]) => '<div class="setrow"><span class="grow"><b>' + l + '</b><br><span class="tiny muted">' + d + '</span></span><input type="time" value="' + n.slots[k].time + '" data-f="notif.slots.' + k + '.time" aria-label="' + l + 'の時刻"><button class="switch ' + (n.slots[k].on ? 'on' : '') + '" data-a="slotToggle" data-v="' + k + '" aria-label="' + l + 'の通知" aria-pressed="' + n.slots[k].on + '"></button></div>').join('') +
    '<div class="setrow"><span><b>頻度</b></span><select class="select" style="width:auto" data-f="notif.freq">' + [['daily', '毎日'], ['weekday', '平日のみ'], ['3week', '週3回']].map(([v, l]) => '<option value="' + v + '" ' + (n.freq === v ? 'selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
    '<button class="btn btn-ghost" style="margin-top:12px" data-a="notifPreview">通知をプレビューする</button>' +
    '<p class="tiny muted" style="margin-top:8px">プッシュ通知はスマホアプリ版（本番接続時）で、設定した時刻に配信されます。この版では設定の保存とプレビューができます。</p></div>';
  h += '<div class="sec-title">ランキング</div><div class="card"><div class="setrow"><span class="grow"><b>ランキングに参加する</b><br><span class="tiny muted">ONにすると、呼び名・職種・今週のXPが、このアプリを開いた他の人にも表示されます。OFFでもすべての機能が使えます。</span></span><button class="switch ' + (S.ranking ? 'on' : '') + '" data-a="rankToggle" aria-label="ランキングに参加する" aria-pressed="' + S.ranking + '"></button></div></div>';
  h += '<div class="sec-title">表示</div><div class="card"><div class="setrow"><span><b>テーマ</b></span><div class="chips">' + [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map(([v, l]) => '<button class="chip ' + (S.theme === v ? 'on' : '') + '" data-a="theme" data-v="' + v + '">' + l + '</button>').join('') + '</div></div>' +
    '<label class="field"><span>アプリ名（正式名称の変更用）</span><input class="input" data-f="appName" value="' + esc(S.appName) + '" maxlength="20"></label></div>';
  h += aiServerCard();
  h += '<div class="sec-title">本番接続の状態</div><div class="card small">' +
    [['LLM（AI解説・採点・ディスカッション）', AI.connected() ? '接続中' : '簡易AIで動作'], ['データベース', Remote.ready ? 'クラウド同期中' : 'この端末に保存'], ['ニュースAPI・検索API', 'サンプルニュースで動作'], ['プッシュ通知', 'アプリ版で接続予定'], ['分析基盤', '未接続']].map(([a, b]) => '<div class="setrow"><span>' + a + '</span><span class="tag">' + b + '</span></div>').join('') +
    '<p class="tiny muted" style="margin-top:8px">APIキーなどの秘密情報は端末に保存せず、サーバー経由で接続する構成です。</p></div>';
  h += '<div class="sec-title">アカウント</div><div class="card"><div class="small muted">' + (S.account === 'account' && Remote.ready ? 'アカウントでログイン中（クラウドに保存）' : S.account === 'account' ? 'アカウントでログイン中（同期の準備中・この端末にも保存）' : 'ゲスト（この端末に保存）') + '</div>' +
    '<button class="btn btn-ghost" style="margin-top:12px" data-a="logout">ログアウト</button>' +
    '<button class="btn btn-ghost" style="margin-top:10px;color:var(--coral-deep)" data-a="reset">学習データをリセット</button></div>';
  h += '<p class="tiny muted" style="text-align:center;margin-top:20px">' + esc(S.appName) + ' MVP ・ サンプルデータで動作中</p>';
  return h;
}
function aiServerCard() {
  const cfg = AI.config();
  const msg = ui.aiMsg || (cfg ? (AI.lastError ? '⚠️ ' + AI.lastError : '設定済み') : '未設定（簡易AIで動作中）');
  return '<div class="sec-title">AIサーバー（自分専用）</div><div class="card">' +
    '<p class="small muted" style="margin:0">自分で用意したサーバーにつなぐと、思考問題の採点とニュースの対話に本物のAIを使えます。合言葉はこの端末にだけ保存されます。</p>' +
    '<label class="field"><span>サーバーのURL</span><input class="input" id="aiBase" type="url" inputmode="url" autocomplete="off" placeholder="https://tomotomo-api.○○.workers.dev" value="' + esc(cfg ? cfg.apiBase.replace(/\/api$/, '') : '') + '"></label>' +
    '<label class="field"><span>合言葉</span><input class="input" id="aiToken" type="password" autocomplete="off" placeholder="' + (cfg && cfg.token ? '保存済み（変えるときだけ入力）' : '') + '"></label>' +
    '<p class="small" id="aiMsg" role="status" style="margin-top:10px">' + esc(msg) + '</p>' +
    '<button class="btn btn-primary" style="margin-top:10px" data-a="aiSave">保存して接続テスト</button>' +
    (cfg ? '<button class="btn btn-ghost" style="margin-top:10px" data-a="aiClear">接続を解除する</button>' : '') + '</div>';
}
