// 週1回のトレンド調査の結果（Claude Code が書いた proposal.json）を確かめて、追記案にまとめる。
//   - 出典のない項目、ランクD・ランク不明の出典、開けないURL、既出の出典は除外する（出典のない情報は含めない）
//   - 合格した項目を content/trends.json に追記し、docs/trends/週.md（要点3つと示唆つきの報告）を作る
//   - 本文（教材・章の本文）は変更しない。結果はプルリクエストとして提案され、オーナーが確認してからマージする
// 使い方: node tools/trends/apply.mjs <proposal.json> [--today YYYY-MM-DD] [--no-net]
//   終了コード 0 = 追記案あり（PR を作る）、3 = 追記案なし（PR を作らない）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RANKS = ['A', 'B', 'C'];
const KINDS = ['研究', '公的統計', '業界ニュース'];

/* ISO 8601 の週番号（例 2026-W44） */
export function isoWeek(ymd) {
  const d = new Date(ymd + 'T00:00:00Z');
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear();
  const first = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return y + '-W' + String(w).padStart(2, '0');
}
const normUrl = u => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, '') + x.search; } catch (e) { return ''; } };
const isStr = (v, min = 1, max = 10000) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

/* URL が実在するか。見つからない（404・410・名前解決できない）ものは不可。
   403 などサイト側が自動アクセスを断るものは「自動では確認できず」として残し、報告に書く */
export async function checkUrl(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'TomoTomo-trends-bot/1.0 (+https://github.com/nonpomeme/tomotomo)' } });
      if (res.ok) return 'ok';
      if (res.status === 404 || res.status === 410) return 'missing';
      if (method === 'GET') return 'unverified';
    } catch (e) {
      if (method === 'GET') return /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(String(e.cause || e)) ? 'missing' : 'unverified';
    }
  }
  return 'unverified';
}

/* 提案を確かめる。合格した項目・除外した項目（理由つき）・要点を返す */
export async function review(proposal, { chapters, existing, check = checkUrl }) {
  const chapterIds = new Set(chapters.map(c => c.id));
  const seen = new Set(existing.flatMap(it => (it.sources || []).map(s => normUrl(s.url))));
  const ids = new Set(existing.map(it => it.id));
  const kept = [], dropped = [];
  for (const it of Array.isArray(proposal && proposal.items) ? proposal.items : []) {
    const label = (it && it.title) || (it && it.id) || '（名前なし）';
    const why = [];
    if (!it || typeof it !== 'object') { dropped.push({ label, why: ['形式が不正'] }); continue; }
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(it.id || '') || ids.has(it.id)) why.push('id が不正または重複');
    if (!chapterIds.has(it.chapter)) why.push('章が不正');
    if (!KINDS.includes(it.kind)) why.push('種類が不正');
    if (!isStr(it.title, 4, 40)) why.push('見出しは4〜40字');
    if (!isStr(it.summary, 60, 400)) why.push('要約は60〜400字');
    const imp = it.implications || {};
    if (!['customer', 'teach', 'system'].every(k => isStr(imp[k], 10, 200))) why.push('示唆（お客さん・研修・仕組み）が必要');
    // 出典：ランクA〜C・https・公表日つきのものだけ残す。1件も残らなければ項目ごと除外
    const sources = [];
    for (const s of Array.isArray(it.sources) ? it.sources : []) {
      if (!s || !isStr(s.name) || !/^https:\/\/\S+$/.test(s.url || '')) { why.push('出典の名前・URLが不正'); continue; }
      if (!RANKS.includes(s.rank)) { why.push('出典「' + s.name + '」のランクが' + (s.rank === 'D' ? 'D（根拠に使えない）' : '不明')); continue; }
      if (!/^\d{4}-\d{2}(-\d{2})?$/.test(s.published || '')) { why.push('出典「' + s.name + '」の公表日がない'); continue; }
      if (seen.has(normUrl(s.url))) { why.push('出典「' + s.name + '」は追記済み'); continue; }
      const st = await check(s.url);
      if (st === 'missing') { why.push('出典「' + s.name + '」のページが見つからない'); continue; }
      sources.push({ name: s.name.trim(), url: s.url, rank: s.rank, published: s.published, ...(st === 'unverified' ? { autoCheck: '自動では確認できず' } : {}) });
    }
    if (!sources.length) why.push('確かめられる出典がない');
    // 項目そのものの不備は項目ごと除外。出典ごとの不備は、その出典だけ除外する
    if (why.length && (!sources.length || why.some(w => !/^出典/.test(w)))) { dropped.push({ label, why }); continue; }
    sources.forEach(s => seen.add(normUrl(s.url)));
    ids.add(it.id);
    kept.push({
      id: it.id, chapter: it.chapter, kind: it.kind, title: it.title.trim(), summary: it.summary.trim(),
      rank: sources.map(s => s.rank).sort()[0], trend: sources.every(s => s.rank === 'C'),
      sources, implications: { customer: imp.customer.trim(), teach: imp.teach.trim(), system: imp.system.trim() },
      ...(why.length ? { note: '一部の出典を除外：' + why.join('／') } : {})
    });
  }
  // 要点：合格した項目を根拠にしているものだけ
  const keptIds = new Set(kept.map(k => k.id));
  const keyPoints = (Array.isArray(proposal && proposal.key_points) ? proposal.key_points : [])
    .filter(p => p && isStr(p.text, 4, 80) && Array.isArray(p.items) && p.items.length && p.items.every(id => keptIds.has(id)))
    .slice(0, 3).map(p => ({ text: p.text.trim(), items: p.items }));
  return { kept, dropped, keyPoints };
}

/* 報告（docs/trends/週.md と PR 本文） */
export function report({ kept, dropped, keyPoints }, { chapters, week, today }) {
  const ch = Object.fromEntries(chapters.map(c => [c.id, c]));
  const chName = id => ch[id].no ? '第' + ch[id].no + '章 ' + ch[id].title : ch[id].title;
  const byId = Object.fromEntries(kept.map(k => [k.id, k]));
  const src = s => '[' + s.rank + '] [' + s.name + '](' + s.url + ')（' + s.published + '）' + (s.autoCheck ? '　※' + s.autoCheck : '');
  const lines = ['# 最新トレンドの追記案（' + week + '）', '', '調査日：' + today + '　／　追記案 ' + kept.length + '件（除外 ' + dropped.length + '件）', '',
    '> 自動調査の結果です。**マージするまでアプリには反映されません。** 内容と出典を確認してからマージしてください。', '> 信頼度ランク：A＝メタ分析・査読論文・公的統計　B＝大手調査機関・学術機関・業界団体　C＝企業の調査・専門メディア（参考）。C だけの項目は「トレンド（参考）」です。', '',
    '## 今週の要点3つ', ''];
  if (keyPoints.length) keyPoints.forEach((p, i) => lines.push((i + 1) + '. ' + p.text + '（根拠：' + p.items.map(id => byId[id].title).join('／') + '）'));
  else lines.push('（根拠のある要点を作れませんでした。下の項目を確認してください）');
  lines.push('', '## お客さん・研修・業務改善への示唆（AIの解釈）', '');
  for (const k of kept) lines.push('- **' + k.title + '**', '  - お客さん：' + k.implications.customer, '  - 研修：' + k.implications.teach, '  - 業務改善・仕組み：' + k.implications.system);
  lines.push('', '## 章ごとの追記案', '');
  for (const c of chapters) {
    const its = kept.filter(k => k.chapter === c.id);
    if (!its.length) continue;
    lines.push('### ' + chName(c.id), '');
    for (const k of its) lines.push('#### ' + k.title + '（' + k.kind + '・ランク' + k.rank + (k.trend ? '・トレンド（参考）' : '') + '）', '', k.summary, '', '出典：', ...k.sources.map(s => '- ' + src(s)), ...(k.note ? ['', '※ ' + k.note] : []), '');
  }
  if (dropped.length) {
    lines.push('## 除外した項目（出典の条件を満たさないため追記しない）', '');
    for (const d of dropped) lines.push('- ' + d.label + '：' + d.why.join('／'));
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  const today = (args.includes('--today') ? args[args.indexOf('--today') + 1] : null) || new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const contentDir = process.env.CONTENT_DIR || path.join(ROOT, 'content');
  const docsDir = process.env.TRENDS_DOCS_DIR || path.join(ROOT, 'docs', 'trends');
  const chapters = JSON.parse(fs.readFileSync(path.join(contentDir, 'chapters.json'), 'utf8')).chapters;
  const trendsFile = path.join(contentDir, 'trends.json');
  const trends = JSON.parse(fs.readFileSync(trendsFile, 'utf8'));
  let proposal;
  try { proposal = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log('調査結果（proposal.json）を読めませんでした：' + e.message); process.exit(3); }
  const week = isoWeek(today);
  const result = await review(proposal, { chapters, existing: trends.items, check: args.includes('--no-net') ? async () => 'ok' : checkUrl });
  const md = report(result, { chapters, week, today });
  console.log(md);
  if (!result.kept.length) { console.log('追記できる項目がありませんでした。プルリクエストは作りません。'); process.exit(3); }
  trends.items = trends.items.concat(result.kept.map(k => Object.assign({ week, added: today }, k)));
  trends.updated = today;
  fs.writeFileSync(trendsFile, JSON.stringify(trends, null, 1) + '\n');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, week + '.md'), md);
  if (process.env.PR_BODY_FILE) fs.writeFileSync(process.env.PR_BODY_FILE, md);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e); process.exit(1); });
