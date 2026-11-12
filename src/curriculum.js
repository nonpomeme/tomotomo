/* TomoTomo — 組織論のカリキュラム（content/curriculum.json）と章ごとの最新トレンド（content/trends.json）
   カリキュラムは12章・37単元。単元に教材（サンプル・配信）があれば「学習できる」、なければ「準備中」。
   読み込んだものはこの端末にも保存し、次回は起動直後から（オフラインでも）使う。
   読み込み順は index.html の <script> の並び順。各ファイルはグローバルを共有する（ビルド不要）。 */
const CURR_KEY = 'tomotomo:curriculum';
const Curriculum = { data: null, trends: [] };

function validCurriculum(d) {
  return !!d && Array.isArray(d.chapters) && d.chapters.length > 0 &&
    d.chapters.every(c => c && typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.units) &&
      c.units.every(u => u && typeof u.id === 'string' && typeof u.title === 'string'));
}
/* 端末に保存するのは表示に使う部分だけ（出典の詳細は教材の側にある） */
function slimCurriculum(d) {
  return {
    version: d.version, title: d.title,
    chapters: d.chapters.map(c => ({ id: c.id, no: c.no, title: c.title, role: c.role, cat: c.cat, units: c.units.map(u => ({ id: u.id, title: u.title, concepts: u.concepts || [], topicId: u.topicId })) }))
  };
}
(function initCurriculum() {
  try {
    const c = JSON.parse(localStorage.getItem(CURR_KEY) || 'null');
    if (c && validCurriculum(c.curriculum)) { Curriculum.data = c.curriculum; Curriculum.trends = Array.isArray(c.trends) ? c.trends : []; }
  } catch (e) { /* storage unavailable */ }
})();

/* 起動後：カリキュラムとトレンドの最新版を取りに行く。変わっていれば画面を描き直す */
async function refreshCurriculum() {
  const before = JSON.stringify([Curriculum.data, Curriculum.trends]);
  try {
    const res = await fetch('content/curriculum.json', { cache: 'no-cache' });
    if (res.ok) { const d = await res.json(); if (validCurriculum(d)) Curriculum.data = slimCurriculum(d); }
  } catch (e) { /* 端末の保存分を使う */ }
  try {
    const res = await fetch('content/trends.json', { cache: 'no-cache' });
    if (res.ok) { const d = await res.json(); if (d && Array.isArray(d.items)) Curriculum.trends = d.items.filter(it => it && it.chapter && it.title && Array.isArray(it.sources) && it.sources.length); }
  } catch (e) { /* 端末の保存分を使う */ }
  if (JSON.stringify([Curriculum.data, Curriculum.trends]) === before) return;
  try { localStorage.setItem(CURR_KEY, JSON.stringify({ curriculum: Curriculum.data, trends: Curriculum.trends })); } catch (e) { /* storage full */ }
  if (typeof render === 'function' && !ui.overlay && !ui.modal) render();
}

/* 単元の並び順。単元id（u4-4・uj-1）は章の番号・単元の番号から作られているので、
   カリキュラムがまだ読み込めていなくても同じ順に並べられる（補章 j は最後） */
function unitOrder(id) {
  const m = /^u(\d+|j)-(\d+)$/.exec(id || '');
  if (!m) return Infinity;
  return (m[1] === 'j' ? 99 : Number(m[1])) * 100 + Number(m[2]);
}
/* 単元の教材：カリキュラムで指定されたもの → その単元の教材（新しい配信を優先） */
function unitTopic(u) {
  const cands = TOPICS.filter(t => t.unit === u.id || (u.topicId && t.id === u.topicId));
  if (!cands.length) return null;
  return cands.find(t => !S.completed[t.id]) || cands[0];
}
/* 単元の状態：done＝学習済み、ready＝学習できる、soon＝準備中（教材がまだない） */
function unitState(u) {
  const ts = TOPICS.filter(t => t.unit === u.id || (u.topicId && t.id === u.topicId));
  if (!ts.length) return { state: 'soon', t: null };
  const t = unitTopic(u);
  return { state: ts.every(x => S.completed[x.id]) ? 'done' : 'ready', t };
}
/* カリキュラム順で次に学ぶ教材（未学習のうち最初の単元）。なければ null */
function nextUnitTopic() {
  return TOPICS.filter(t => t.unit && !S.completed[t.id]).sort((a, b) => unitOrder(a.unit) - unitOrder(b.unit) || String(b.deliveredOn || '').localeCompare(String(a.deliveredOn || '')))[0] || null;
}
function chapterOfTopic(t) {
  if (!t || !Curriculum.data) return null;
  return Curriculum.data.chapters.find(c => c.id === t.chapter || c.units.some(u => u.id === t.unit)) || null;
}
function chapterTrends(ch) { return Curriculum.trends.filter(it => it.chapter === ch.id); }
