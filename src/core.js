/* TomoTomo — 共通ユーティリティ・状態 S（localStorage）・claude.ai のクラウド同期・集計
   読み込み順は index.html の <script> の並び順。各ファイルはグローバルを共有する（ビルド不要）。 */
/* =========================================================
   TomoTomo — core (state / storage / AI / recommendation)
   ========================================================= */
const $ = s => document.querySelector(s);
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DAY = 86400000;
function dkey(d) { d = d ? new Date(d) : new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dayStart(d) { const x = d ? new Date(d) : new Date(); x.setHours(0, 0, 0, 0); return x.getTime(); }
function daysBetween(a, b) { return Math.round((dayStart(b) - dayStart(a)) / DAY); }
function fmtDate(t) { if (!t) return '—'; const d = new Date(t); return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
function fmtYMD(s) { const p = String(s).split('-'); return p[0] + '年' + Number(p[1]) + '月' + Number(p[2]) + '日'; }
function weekKey(t) { const d = new Date(dayStart(t)); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dkey(d); }

const QBANK = {};
TOPICS.forEach(t => t.questions.forEach((q, i) => { QBANK[q.id] = Object.assign({}, q, { topicId: t.id, idx: i }); }));
const topicById = id => TOPICS.find(t => t.id === id);
const ADJ = {};
Object.keys(NODES).forEach(k => ADJ[k] = []);
EDGES.forEach(([s, t, type, w]) => { ADJ[s].push({ id: t, type, w, dir: 'out' }); ADJ[t].push({ id: s, type, w, dir: 'in' }); });

/* ---------------- state ---------------- */
const KEY = 'tomotomo:v1';
function defaults() {
  return {
    v: 1, updatedAt: 0, loggedIn: false, account: 'device', appName: 'TomoTomo', theme: 'auto',
    profile: { name: '', occupation: '', industry: '', role: '', interests: [], minutes: 10, mode: 'auto', onboarded: false },
    xp: 0, streak: { count: 0, last: null }, history: [], skills: {}, skillCat: {}, nodes: {}, reviews: [],
    completed: {}, thoughtCount: 0, badges: [], reviewDone: 0, snapshots: [],
    notif: { enabled: true, freq: 'daily', slots: { morning: { on: true, time: '07:30' }, noon: { on: false, time: '12:15' }, night: { on: true, time: '21:00' } } },
    ranking: false, partner: null
  };
}
function mergeState(o) {
  const d = defaults();
  if (!o || typeof o !== 'object') return d;
  const r = Object.assign(d, o);
  r.profile = Object.assign(defaults().profile, o.profile || {});
  r.notif = Object.assign(defaults().notif, o.notif || {});
  r.notif.slots = Object.assign(defaults().notif.slots, (o.notif && o.notif.slots) || {});
  return r;
}
function loadLocal() { try { const raw = localStorage.getItem(KEY); return raw ? mergeState(JSON.parse(raw)) : defaults(); } catch (e) { return defaults(); } }
let S = loadLocal();

const Remote = { db: null, uid: null, user: null, ready: false, timer: null };
let saveTimer = null;
function save() {
  S.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
  if (Remote.db && Remote.uid) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushRemote, 1200);
  }
}
async function pushRemote() {
  if (!Remote.db || !Remote.uid) return;
  try { await Remote.db.collection('data/users/' + Remote.uid).doc('tomotomo').set({ state: JSON.stringify(S), updatedAt: S.updatedAt }); } catch (e) { /* keep local copy */ }
}
async function initRuntime() {
  AI.init();
  if (!ClaudeHost.available()) return;
  try {
    const [db, user] = await Promise.all([ClaudeHost.use('db'), ClaudeHost.use('user')]);
    if (!db || !user) return;
    const uid = await user.id();
    if (!uid) return;
    Remote.db = db; Remote.uid = uid; Remote.user = user;
    const snap = await db.collection('data/users/' + uid).doc('tomotomo').get();
    if (snap.exists) {
      const d = snap.data();
      let st = null; try { st = JSON.parse(d.state); } catch (e) { }
      if (st && (st.updatedAt || 0) > (S.updatedAt || 0)) {
        S = mergeState(st);
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { }
        if (!ui.overlay) render();
      }
    } else if (S.updatedAt) { pushRemote(); }
    Remote.ready = true;
    if (!ui.overlay) render();
  } catch (e) { /* db unavailable: device only */ }
}

/* ---------------- derived ---------------- */
function levelInfo(xp) {
  let lv = 1, need = 60, rest = xp;
  while (rest >= need) { rest -= need; lv++; need = 60 + (lv - 1) * 20; }
  return { lv, cur: rest, need, pct: Math.round(rest / need * 100) };
}
function learnedIds() { return Object.keys(S.nodes).filter(k => (S.nodes[k].mastery || 0) > 0); }
function isLearned(id) { return S.nodes[id] && S.nodes[id].mastery > 0; }
function catScores() {
  const out = {};
  Object.keys(MAP_CATS).forEach(c => {
    const ids = Object.keys(NODES).filter(k => NODES[k].cat === c);
    const sum = ids.reduce((a, k) => a + (S.nodes[k] ? S.nodes[k].mastery : 0), 0);
    out[c] = Math.round(sum / ids.length);
  });
  return out;
}
function skillRate(k) { const s = S.skills[k]; return s && s.t ? s.c / s.t : null; }
function skillList() {
  return Object.keys(SKILLS).map(k => ({ k, name: SKILLS[k], rate: skillRate(k), t: S.skills[k] ? S.skills[k].t : 0 }));
}
function weakSkills() { return skillList().filter(s => s.t >= 1).sort((a, b) => a.rate - b.rate); }
function addSkill(k, ok, cat) {
  const s = S.skills[k] || (S.skills[k] = { c: 0, t: 0 }); s.t++; if (ok) s.c++;
  if (cat) { const key = cat + '|' + k; const x = S.skillCat[key] || (S.skillCat[key] = { c: 0, t: 0 }); x.t++; if (ok) x.c++; }
}
function isHRish() { return /採用|人事|コンサル/.test(S.profile.occupation) || S.profile.industry === '人材' || S.profile.industry === 'コンサル'; }
function todayHistory() { const k = dkey(); return S.history.filter(h => dkey(h.at) === k); }
function dueReviews(all) {
  const now = Date.now();
  return S.reviews.filter(r => all || r.due <= now).sort((a, b) => a.due - b.due);
}
function weekDays() {
  const wk = weekKey(Date.now());
  const set = new Set(S.history.filter(h => weekKey(h.at) === wk).map(h => dkey(h.at)));
  return set.size;
}
function weekXP() { const wk = weekKey(Date.now()); return S.history.filter(h => weekKey(h.at) === wk).reduce((a, h) => a + h.xp, 0); }

