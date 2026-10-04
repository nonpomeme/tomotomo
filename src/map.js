/* TomoTomo — 知識マップ
   読み込み順は index.html の <script> の並び順。各ファイルはグローバルを共有する（ビルド不要）。 */
/* =========================================================
   TomoTomo — knowledge map
   ========================================================= */
function viewMap() {
  const learned = learnedIds();
  const sug = suggestionText();
  const edgesOn = EDGES.filter(([s, t]) => isLearned(s) && isLearned(t)).length;
  let h = '<div class="row between" style="margin:6px 2px 10px"><h2 style="font-size:22px">知識マップ</h2><span class="small muted">🧩 ' + learned.length + ' 知識　🔗 ' + edgesOn + ' つながり</span></div>';
  h += '<div class="scroll-x" style="margin-bottom:10px">' + ['all'].concat(Object.keys(MAP_CATS)).map(c => '<button class="chip ' + (ui.mapCat === c ? 'on' : '') + '" data-a="mapCat" data-v="' + c + '">' + (c === 'all' ? 'すべて' : c) + '</button>').join('') + '</div>';
  h += '<div class="mapwrap" id="mainmap"></div>';
  const top = learned.slice().sort((a, b) => S.nodes[b].mastery - S.nodes[a].mastery)[0];
  const react = hasUnlock(20) && top ? '<br><span class="muted">' + esc(say('mapReact', { count: learned.length, node: NODES[top].name })) + '</span>' : '';
  h += '<div class="suggest"><div class="tomo">' + owl(46, 'normal') + '<div class="small"><b>' + esc(partnerName()) + 'の' + partner().suggest + '</b><br>' + esc(sug.lead) + react + '</div></div>' +
    (sug.review && S.reviews.length ? '<button class="btn btn-mint" style="margin-top:12px" data-a="reviewEarly">復習で知識を固める</button>' :
      '<button class="btn btn-primary" style="margin-top:12px" data-a="startMin" data-v="' + sug.rec.t.id + '" data-m="10">「' + esc(sug.rec.t.title.split('：')[0]) + '」を10分で学ぶ</button>') + '</div>';
  h += '<p class="tiny muted" style="margin:10px 2px">ドラッグで移動、ピンチやボタンで拡大・縮小、知識をタップすると詳細が見られます。点線の知識は、次に学ぶとつながる候補です。</p>';
  return h;
}
function visibleNodes() {
  const learned = new Set(learnedIds());
  const vis = new Set(learned);
  if (!learned.size) { const rec = recommend()[0]; rec.t.nodes.forEach(n => vis.add(n)); }
  learned.forEach(k => ADJ[k].forEach(a => vis.add(a.id)));
  return { vis, learned };
}
function mapSVG(opts) {
  opts = opts || {};
  const { vis, learned } = visibleNodes();
  const hl = new Set(opts.highlight || []);
  const cat = opts.cat || 'all';
  let edges = '', nodes = '';
  EDGES.forEach(([s, t, type, w]) => {
    if (!vis.has(s) || !vis.has(t)) return;
    const both = learned.has(s) && learned.has(t);
    const dimCat = cat !== 'all' && NODES[s].cat !== cat && NODES[t].cat !== cat;
    const a = NODES[s], b = NODES[t];
    const isNew = hl.has(s) || hl.has(t);
    edges += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + (both ? (isNew ? '#FFE08A' : '#9AA6FF') : '#4A5390') + '" stroke-opacity="' + (dimCat ? 0.15 : both ? 0.75 : 0.6) + '" stroke-width="' + (both ? 2.5 + w * 4 : 2.5) + '" ' + (both ? '' : 'stroke-dasharray="8 10"') + ' stroke-linecap="round"/>';
  });
  Object.keys(NODES).forEach(k => {
    if (!vis.has(k)) return;
    const n = NODES[k], st = S.nodes[k] || { mastery: 0 };
    const on = learned.has(k);
    const col = MAP_CATS[n.cat];
    const r = on ? 22 + st.mastery / 100 * 16 : 17;
    const dim = cat !== 'all' && n.cat !== cat;
    const op = dim ? 0.2 : 1;
    let g = '<g data-node="' + k + '" opacity="' + op + '" style="cursor:pointer">';
    if (hl.has(k)) g += '<circle class="newpulse" cx="' + n.x + '" cy="' + n.y + '" r="40" fill="none" stroke="#FFE08A" stroke-width="4"/>';
    if (on) {
      g += '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + (r + 10) + '" fill="' + col + '" opacity=".18"/>';
      g += '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + r + '" fill="' + col + '"/>';
      const c = 2 * Math.PI * (r + 4);
      g += '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + (r + 4) + '" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="2.5" stroke-dasharray="' + (c * st.mastery / 100) + ' ' + c + '" transform="rotate(-90 ' + n.x + ' ' + n.y + ')"/>';
    } else {
      g += '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + r + '" fill="#141A48" stroke="' + col + '" stroke-width="2" stroke-dasharray="6 5"/>';
      g += '<text x="' + n.x + '" y="' + (n.y + 8) + '" text-anchor="middle" font-size="22" font-weight="800" fill="' + col + '">?</text>';
    }
    g += '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + Math.max(r + 12, 36) + '" fill="transparent"/>';
    g += '<text class="node-label ' + (on ? '' : 'dim') + '" x="' + n.x + '" y="' + (n.y + r + 34) + '" text-anchor="middle">' + esc(n.name) + '</text></g>';
    nodes += g;
  });
  return '<svg viewBox="0 0 1100 800" preserveAspectRatio="xMidYMid meet" role="img" aria-label="知識マップ"><g class="vp">' + edges + nodes + '</g></svg>';
}
function fitView(aspect) {
  const { vis } = visibleNodes();
  const ks = [...vis];
  if (!ks.length) return { x: 0, y: 0, k: 1 };
  aspect = aspect || 800 / 1100;
  let vw = 1100, vh = 800;
  if (aspect > 800 / 1100) vh = 1100 * aspect; else vw = 800 / aspect;
  const xs = ks.map(k => NODES[k].x), ys = ks.map(k => NODES[k].y);
  const minx = Math.min(...xs) - 110, maxx = Math.max(...xs) + 110, miny = Math.min(...ys) - 80, maxy = Math.max(...ys) + 110;
  const k = clamp(Math.min(vw / (maxx - minx), vh / (maxy - miny)), 0.6, 2.4);
  return { x: 550 - (maxx + minx) / 2 * k, y: 400 - (maxy + miny) / 2 * k, k };
}
function mountMap(sel, interactive, highlight) {
  const wrap = $(sel); if (!wrap) return;
  wrap.innerHTML = mapSVG({ cat: interactive ? ui.mapCat : 'all', highlight }) +
    (interactive ? '<div class="mapzoom"><button data-a="zoom" data-v="1.25" aria-label="拡大">＋</button><button data-a="zoom" data-v="0.8" aria-label="縮小">－</button><button data-a="zoom" data-v="0" aria-label="全体表示" style="font-size:14px">⤢</button></div>' : '') +
    (!learnedIds().length ? '<div class="mapempty">点線の知識は、今日のテーマで手に入る知識です。学習を終えると光ってつながります。</div>' : '');
  if (!wrap.nextElementSibling || !wrap.nextElementSibling.classList.contains('maplegend')) wrap.insertAdjacentHTML('afterend', '<div class="maplegend">' + Object.keys(MAP_CATS).map(c => '<span><i style="background:' + MAP_CATS[c] + '"></i>' + c + '</span>').join('') + '</div>');
  const svg = wrap.querySelector('svg');
  const vp = svg.querySelector('.vp');
  const aspect = wrap.clientHeight / Math.max(1, wrap.clientWidth);
  let view = interactive ? (ui.mapView || fitView(aspect)) : fitView(aspect);
  const apply = () => vp.setAttribute('transform', 'translate(' + view.x + ' ' + view.y + ') scale(' + view.k + ')');
  apply();
  if (!interactive) {
    svg.addEventListener('click', e => { const g = e.target.closest('[data-node]'); if (g) openNode(g.getAttribute('data-node')); });
    return;
  }
  ui.mapApply = (f) => { if (f === 0) view = fitView(aspect); else zoomAt(550, 400, f); ui.mapView = view; apply(); };
  const toSvg = (cx, cy) => { const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const p = svg.createSVGPoint(); p.x = cx; p.y = cy; const r = p.matrixTransform(m.inverse()); return { x: r.x, y: r.y }; };
  function zoomAt(px, py, f) {
    const k2 = clamp(view.k * f, 0.4, 3.5); const ratio = k2 / view.k;
    view = { x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio, k: k2 };
  }
  const ptrs = new Map(); let downNode = null, moved = 0, last = null, pinch = null;
  svg.addEventListener('pointerdown', e => {
    svg.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { downNode = e.target.closest('[data-node]'); moved = 0; last = toSvg(e.clientX, e.clientY); }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; downNode = null; }
  });
  svg.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId);
    moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      const c = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt(c.x, c.y, (pinch.k * d / pinch.d) / view.k); apply();
    } else if (ptrs.size === 1 && last) {
      const p = toSvg(e.clientX, e.clientY);
      view.x += p.x - last.x; view.y += p.y - last.y; last = toSvg(e.clientX, e.clientY);
      apply();
    }
  });
  const up = e => {
    if (ptrs.size === 1 && downNode && moved < 8) openNode(downNode.getAttribute('data-node'));
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 1) { const v = [...ptrs.values()][0]; last = toSvg(v.x, v.y); }
    if (!ptrs.size) { downNode = null; last = null; }
    ui.mapView = view;
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('wheel', e => { e.preventDefault(); const c = toSvg(e.clientX, e.clientY); zoomAt(c.x, c.y, e.deltaY < 0 ? 1.12 : 0.89); ui.mapView = view; apply(); }, { passive: false });
}
function openNode(id) {
  const n = NODES[id]; if (!n) return;
  const st = S.nodes[id] || { mastery: 0 };
  const topic = TOPICS.find(t => t.nodes.includes(id));
  const rel = ADJ[id].map(a => '<button class="chip" data-a="openNode" data-v="' + a.id + '">' + (isLearned(a.id) ? '' : '？ ') + esc(NODES[a.id].name) + ' <span class="tiny muted">' + REL_LABEL[a.type] + '</span></button>').join('');
  const revN = S.reviews.filter(r => QBANK[r.qid] && topic && QBANK[r.qid].topicId === topic.id).length;
  ui.modal = '<div class="grabber"></div><div class="row"><span style="width:14px;height:14px;border-radius:50%;background:' + MAP_CATS[n.cat] + '"></span><span class="small muted">' + n.cat + ' ＞ ' + n.sub + '</span></div>' +
    '<h3 style="font-size:24px;margin-top:4px">' + esc(n.name) + '</h3>' +
    (st.mastery > 0 ? '<div class="row" style="margin-top:12px"><span class="small" style="width:56px">理解度</span><div class="bar grow"><i style="width:' + st.mastery + '%;background:' + MAP_CATS[n.cat] + '"></i></div><b class="num">' + st.mastery + '%</b></div>' +
      '<div class="statgrid" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><span class="lbl">最終学習</span><b class="small">' + fmtDate(st.last) + '</b></div><div class="stat"><span class="lbl">次の復習</span><b class="small">' + fmtDate(st.next) + '</b></div><div class="stat"><span class="lbl">難易度</span><b class="small">' + '★'.repeat(n.diff) + '</b></div></div>'
      : '<p class="small muted" style="margin-top:8px">まだ学んでいない知識です。学ぶと、既存の知識とつながります。</p>') +
    '<div class="small" style="margin:14px 0 8px"><b>つながっている知識</b></div><div class="chips">' + rel + '</div>' +
    (topic ? '<div style="margin-top:16px" class="stack"><button class="btn btn-primary" data-a="startMin" data-v="' + topic.id + '" data-m="10">' + (st.mastery > 0 ? '関連テーマで理解を深める（10分）' : 'このテーマを学ぶ（10分）') + '</button>' +
      (revN ? '<button class="btn btn-ghost" data-a="reviewEarly">このテーマを復習する</button>' : '') + '<button class="btn btn-ghost" data-a="news" data-v="' + topic.id + '">関連ニュースを読む</button></div>' : '');
  showModal();
}
function showModal() {
  let m = $('#modal');
  if (!ui.modal) { if (m) m.remove(); return; }
  if (!m) { m = document.createElement('div'); m.id = 'modal'; document.body.appendChild(m); }
  m.innerHTML = '<div class="scrim" data-a="closeModal"><div class="modal" role="dialog" aria-modal="true">' + ui.modal + '</div></div>';
}

