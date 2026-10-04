/* TomoTomo — 操作（ボタン）・イベント・起動
   読み込み順は index.html の <script> の並び順。各ファイルはグローバルを共有する（ビルド不要）。 */
/* =========================================================
   misc ui
   ========================================================= */
let toastTimer;
function toast(msg, notif) {
  let el = $('#toast'); if (el) el.remove();
  el = document.createElement('div'); el.id = 'toast'; el.className = 'toast' + (notif ? ' notif' : ''); el.setAttribute('role', 'status');
  el.innerHTML = notif ? owl(36) + '<div><b class="small">' + esc(S.appName) + '</b><div class="small">' + esc(msg) + '</div></div>' : esc(msg);
  document.body.appendChild(el);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), notif ? 3800 : 2400);
}
function confetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['#4F5BEF', '#FFC53D', '#12B886', '#FF6B7F', '#5CC8FF'];
  for (let i = 0; i < 46; i++) { const s = document.createElement('i'); s.style.left = Math.random() * 100 + '%'; s.style.background = cols[i % cols.length]; s.style.animationDelay = (Math.random() * 0.5) + 's'; s.style.animationDuration = (1.2 + Math.random()) + 's'; box.appendChild(s); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 2800);
}
function setPath(path, val) {
  const ks = path.split('.'); let o = S; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = val;
}

/* =========================================================
   actions
   ========================================================= */
const A = {
  tab: el => { ui.tab = el.dataset.v; ui.modal = null; showModal(); if (ui.overlay) closeOverlay(); render(); window.scrollTo(0, 0); },
  login: el => {
    S.loggedIn = true; S.account = el.dataset.v;
    if (el.dataset.v === 'account' && !Remote.db) toast(ClaudeHost.available() ? 'クラウド同期の準備中です。準備ができるまでこの端末にも保存します' : 'この環境ではクラウド同期が使えないため、この端末に保存します');
    save(); render();
  },
  pick: el => { const k = el.dataset.k; S.profile[k] = k === 'minutes' ? Number(el.dataset.v) : el.dataset.v; save(); render(); },
  pickMode: el => { S.profile.mode = el.dataset.v; save(); render(); },
  toggleInterest: el => { const v = el.dataset.v, a = S.profile.interests; const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); save(); render(); },
  partnerPick: el => confirmPartner(el.dataset.v, S.profile.onboarded ? 'change' : 'onboard'),
  partnerConfirm: el => {
    S.partner = el.dataset.v; ui.modal = null; showModal(); save();
    if (el.dataset.ctx === 'onboard') { ui.ob = 1; render(); window.scrollTo(0, 0); }
    else { render(); toast(partnerName() + 'が新しいパートナーになりました。学習データはそのままです'); }
  },
  partnerSkip: () => { S.partner = 'owl'; save(); ui.ob = 1; render(); toast('フクロウと始めます。パートナーは「その他」からいつでも変更できます'); },
  openPartnerChange: () => { ui.modal = '<div class="grabber"></div><h3 style="font-size:20px">学習パートナーを変更</h3><p class="tiny muted" style="margin:4px 0 12px">学習履歴・知識マップ・レベル・XPはリセットされません。</p>' + partnerCards('partnerPick', partnerId()); showModal(); },
  closeModalBtn: () => { ui.modal = null; showModal(); },
  obNext: () => { if (ui.ob < 4) { ui.ob++; render(); window.scrollTo(0, 0); } else { S.profile.onboarded = true; ui.tab = 'home'; save(); render(); toast('準備ができました。今日の学習をはじめましょう'); } },
  obBack: () => { ui.ob = Math.max(0, ui.ob - 1); render(); },
  minutes: el => { ui.minutes = Number(el.dataset.v); render(); },
  start: el => startLesson(el.dataset.v),
  startMin: el => { if (ui.overlay) { ui.overlay = null; $('#overlay').classList.add('hide'); } startLesson(el.dataset.v, Number(el.dataset.m)); },
  review: () => { ui.L = buildReview(false); if (ui.L.steps.length < 2) return toast('いま復習する問題はありません'); openOverlay('lesson'); },
  reviewEarly: () => { ui.modal = null; showModal(); ui.L = buildReview(true); if (ui.L.steps.length < 2) return toast('復習できる問題はまだありません。まず学習しましょう'); openOverlay('lesson'); },
  next: () => nextStep(),
  sel: el => { const L = ui.L; if (L.checked) return; const v = el.dataset.v; L.sel = v === 'true' ? true : v === 'false' ? false : Number(v); lessonRerender(true); },
  order: el => { const L = ui.L; if (L.checked) return; L.order.push(Number(el.dataset.v)); lessonRerender(true); },
  unorder: el => { const L = ui.L; if (L.checked) return; L.order.splice(Number(el.dataset.v), 1); lessonRerender(true); },
  orderReset: () => { ui.L.order = []; lessonRerender(true); },
  check: () => checkAnswer(),
  moreExp: () => { ui.L.showExp = true; lessonRerender(true); },
  lessonDepth: el => { ui.L.depth = el.dataset.v; lessonRerender(true); },
  newsDepth: el => { ui.newsDepth = el.dataset.v; lessonRerender(true); },
  submitThought: () => submitThought(),
  skipThought: () => nextStep(),
  quitLesson: () => {
    if (ui.L && ui.L.i > 0 && !confirm('学習を中断しますか？ ここまでの進捗は保存されません。')) return;
    ui.L = null; save(); closeOverlay();
  },
  toMapUpdate: () => openOverlay('mapupdate'),
  closeOverlay: () => closeOverlay(),
  goGrowth: () => { ui.tab = 'growth'; closeOverlay(); },
  news: el => { ui.modal = null; showModal(); ui.news = el.dataset.v; ui.newsDepth = 's3'; openOverlay('news'); },
  chat: el => { ui.chat = { topicId: el.dataset.v, log: [], busy: false, back: ui.overlay }; openOverlay('chat'); },
  closeChat: () => { const back = ui.chat && ui.chat.back; ui.chat = null; if (back) openOverlay(back); else closeOverlay(); },
  chatPreset: el => sendChat(el.dataset.v),
  chatSend: () => { const i = $('#chatInput'); if (i) sendChat(i.value); },
  setMode: el => { S.profile.mode = el.dataset.v; save(); render(); toast(MODES[el.dataset.v].name + 'モードにしました'); },
  setMinutes: el => { S.profile.minutes = Number(el.dataset.v); ui.minutes = null; save(); render(); },
  learnCat: el => { ui.learnCat = el.dataset.v; render(); },
  learnInd: el => { ui.learnInd = el.dataset.v; render(); },
  learnReset: () => { ui.learnCat = 'すべて'; ui.learnInd = ''; render(); },
  mapCat: el => { ui.mapCat = el.dataset.v; render(); },
  zoom: el => { if (ui.mapApply) ui.mapApply(Number(el.dataset.v)); },
  openNode: el => openNode(el.dataset.v),
  closeModal: (el, e) => { if (e.target === el) { ui.modal = null; showModal(); } },
  notifToggle: () => { S.notif.enabled = !S.notif.enabled; save(); render(); },
  slotToggle: el => { const s = S.notif.slots[el.dataset.v]; s.on = !s.on; save(); render(); },
  notifPreview: () => {
    if (!S.notif.enabled) return toast('通知がOFFになっています');
    const due = dueReviews().length;
    const msgs = { morning: '☀️ 今日の10分教養：「' + recommend()[0].t.title + '」', noon: '💡 今日のおすすめニュースが届いています', night: due ? '🧠 ' + say('review', { n: due }) : '🧠 今日の学習をふりかえりましょう' };
    const on = Object.keys(S.notif.slots).filter(k => S.notif.slots[k].on);
    if (!on.length) return toast('通知する時間帯がすべてOFFです');
    on.forEach((k, i) => setTimeout(() => toast(S.notif.slots[k].time + '　' + msgs[k], true), i * 2600));
  },
  rankToggle: () => { S.ranking = !S.ranking; save(); if (S.ranking) { pushRanking(); toast('ランキングに参加しました'); } else if (Remote.db && Remote.uid) { Remote.db.collection('ranking').doc(Remote.uid).delete().catch(() => {}); toast('ランキングから外れました'); } ui.rankRows = null; render(); },
  theme: el => { S.theme = el.dataset.v; save(); render(); },
  logout: () => { S.loggedIn = false; save(); ui.tab = 'home'; render(); toast('ログアウトしました'); },
  reset: () => {
    if (!confirm('学習データ（XP・知識マップ・履歴・復習）をすべて消去します。プロフィールは残ります。よろしいですか？')) return;
    const keep = { profile: S.profile, loggedIn: S.loggedIn, account: S.account, appName: S.appName, theme: S.theme, notif: S.notif };
    S = Object.assign(defaults(), keep); ui.mapView = null; save(); render(); toast('学習データをリセットしました');
  }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const fn = A[el.dataset.a]; if (!fn) return;
  if (el.tagName === 'BUTTON' && el.disabled) return;
  fn(el, e);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'chatInput') return;
  if (el.dataset && el.dataset.f && el.tagName === 'INPUT' && el.type !== 'time') {
    setPath(el.dataset.f, el.value);
    save();
    if (el.dataset.f === 'appName') { const b = document.querySelector('.brand span'); if (b) b.textContent = el.value; }
    if (!S.profile.onboarded) { const btn = document.querySelector('[data-a="obNext"]'); if (btn) btn.disabled = !(S.profile.name.trim() && S.profile.occupation); }
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset && el.dataset.f && (el.tagName === 'SELECT' || el.type === 'time')) { setPath(el.dataset.f, el.value); save(); toast('保存しました'); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'chatInput' && !e.isComposing) { e.preventDefault(); sendChat(e.target.value); }
  if (e.key === 'Escape' && ui.modal) { ui.modal = null; showModal(); }
});

render();
initRuntime();
