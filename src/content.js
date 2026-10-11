/* TomoTomo — 毎日の配信教材
   GitHub Actions が毎朝作る教材（content/index.json と content/daily/日付.json）を読み込み、
   サンプル3テーマと同じように学べるようにする。形式チェック（content-schema.js）に通らない教材は使わない。
   読み込んだ教材はこの端末にも保存し、次回は起動直後から（オフラインでも）使える。 */
const CONTENT_KEY = 'tomotomo:content';
const CONTENT_KEEP = 30; // 端末に残す配信教材の数（学習済み・復習中のものはこれとは別に残す）
const Content = { loaded: {}, latest: null };
// サンプルにもともとある知識ノードと線（配信で増えた分と区別するため）
const DATA_NODE_IDS = Object.keys(NODES).reduce((o, k) => { o[k] = true; return o; }, {});
const DATA_EDGE_COUNT = EDGES.length;

function loadContentCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CONTENT_KEY) || 'null');
    if (c && c.bundles && c.graph) return c;
  } catch (e) { /* storage unavailable */ }
  return { graph: { nodes: {}, edges: [] }, bundles: {} };
}
function saveContentCache(c) { try { localStorage.setItem(CONTENT_KEY, JSON.stringify(c)); } catch (e) { /* storage full */ } }

/* 新しい知識ノードを、つながる既存ノードの近くの空いている場所に置く（毎回同じ位置になる） */
function placeNode(k, edges) {
  const placed = Object.keys(NODES).filter(id => id !== k && NODES[id].x != null);
  const anchors = edges.filter(e => e[0] === k || e[1] === k).map(e => e[0] === k ? e[1] : e[0]).filter(id => NODES[id] && NODES[id].x != null);
  const cx = anchors.length ? anchors.reduce((a, id) => a + NODES[id].x, 0) / anchors.length : 550;
  const cy = anchors.length ? anchors.reduce((a, id) => a + NODES[id].y, 0) / anchors.length : 400;
  let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) % 360;
  let best = null;
  for (const r of [170, 240, 320, 420]) {
    for (let i = 0; i < 12; i++) {
      const a = (h + i * 30) * Math.PI / 180, x = Math.round(cx + r * Math.cos(a)), y = Math.round(cy + r * Math.sin(a));
      const d = placed.reduce((m, id) => Math.min(m, Math.hypot(NODES[id].x - x, NODES[id].y - y)), Infinity);
      if (!best || d > best.d) best = { x, y, d };
      if (d >= 140) { NODES[k].x = x; NODES[k].y = y; return; }
    }
  }
  NODES[k].x = best.x; NODES[k].y = best.y;
}

/* 知識ノードと線を追加する（すでにあるものは追加しない） */
function addGraph(nodes, edges, runtime) {
  Object.keys(nodes || {}).forEach(k => {
    if (NODES[k]) return;
    NODES[k] = { name: nodes[k].name, cat: nodes[k].cat, sub: nodes[k].sub, diff: nodes[k].diff, x: nodes[k].x, y: nodes[k].y };
    if (NODES[k].x == null) placeNode(k, edges || []);
    if (runtime) ADJ[k] = [];
  });
  (edges || []).forEach(e => {
    if (!NODES[e[0]] || !NODES[e[1]] || EDGES.some(x => x[0] === e[0] && x[1] === e[1])) return;
    EDGES.push(e);
    if (runtime) { ADJ[e[0]].push({ id: e[1], type: e[2], w: e[3], dir: 'out' }); ADJ[e[1]].push({ id: e[0], type: e[2], w: e[3], dir: 'in' }); }
  });
}

/* 配信教材を1つ取り込む。runtime=true は起動後（QBANK・ADJ も更新する）。取り込めたら true */
function addBundle(b, runtime) {
  if (!b || !b.topic || Content.loaded[b.topic.id] || TOPICS.some(t => t.id === b.topic.id)) return false;
  const fresh = {};
  Object.keys(b.nodes || {}).forEach(k => { if (!NODES[k]) fresh[k] = b.nodes[k]; });
  const ctx = { nodes: Object.assign({}, NODES, fresh), cats: MAP_CATS, rels: REL_LABEL, skills: SKILLS, newNodes: fresh, newEdges: b.edges || [] };
  if (validateTopic(b.topic, ctx).length) return false;
  addGraph(fresh, b.edges, runtime);
  const t = Object.assign({}, b.topic, { deliveredOn: b.date });
  TOPICS.push(t);
  if (runtime) t.questions.forEach((q, i) => { QBANK[q.id] = Object.assign({}, q, { topicId: t.id, idx: i }); });
  Content.loaded[t.id] = b.date;
  if (!Content.latest || b.date > Content.latest) Content.latest = b.date;
  return true;
}

/* 起動時：端末に保存してある教材を、画面を出す前に取り込む（ネットを待たない） */
(function initContent() {
  const c = loadContentCache();
  addGraph(c.graph.nodes, c.graph.edges, false);
  Object.keys(c.bundles).map(id => c.bundles[id]).sort((a, b) => a.date.localeCompare(b.date)).forEach(b => addBundle(b, false));
})();

/* 起動後：新しい配信がないか確認して取り込む。新しいものがあれば画面を描き直す */
async function refreshContent() {
  let idx;
  try {
    const res = await fetch('content/index.json', { cache: 'no-cache' });
    if (!res.ok) return;
    idx = await res.json();
  } catch (e) { return; }
  const items = Array.isArray(idx.items) ? idx.items : [];
  // 学習済み・復習中の教材は、古くなっても残す（学習記録から参照されるため）
  const keep = new Set(Object.keys(S.completed).concat(S.reviews.map(r => String(r.qid).replace(/-\d+$/, ''))));
  const want = items.filter((it, i) => i < CONTENT_KEEP || keep.has(it.id));
  const c = loadContentCache();
  let added = false;
  for (const it of want.slice().reverse()) {
    if (Content.loaded[it.id] || TOPICS.some(t => t.id === it.id)) continue;
    try {
      const res = await fetch('content/' + it.file);
      if (!res.ok) continue;
      const b = await res.json();
      if (addBundle(b, true)) { c.bundles[it.id] = b; added = true; }
    } catch (e) { /* 次回また試す */ }
  }
  // 知識ノードと線は消さずに残す（学習記録が参照するため）。教材本文は必要な分だけ残す
  Object.keys(NODES).forEach(k => { if (!DATA_NODE_IDS[k]) c.graph.nodes[k] = NODES[k]; });
  c.graph.edges = EDGES.slice(DATA_EDGE_COUNT);
  Object.keys(c.bundles).forEach(id => { if (!want.some(it => it.id === id)) delete c.bundles[id]; });
  saveContentCache(c);
  if (added && !ui.overlay && !ui.modal) render();
}

/* テーマの並び：配信教材（新しい順、最大 max 件）→ サンプル */
function newsList(max) {
  const delivered = TOPICS.filter(t => t.deliveredOn).sort((a, b) => b.deliveredOn.localeCompare(a.deliveredOn)).slice(0, max || CONTENT_KEEP);
  return delivered.concat(TOPICS.filter(t => !t.deliveredOn));
}
function contentStatus() { return Content.latest ? '毎日配信（最新 ' + fmtYMD(Content.latest) + '）' : 'サンプルニュースで動作'; }
