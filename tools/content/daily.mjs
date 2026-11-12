// 毎日の教材づくり（GitHub Actions から1日1回実行）
//   カリキュラム（content/curriculum.json）で、まだ教材のない次の単元を1つ選ぶ（ニュースの選定はしない）
//   → 単元の出典（確認済み）を中心に、公的機関・学術機関の資料で調査 → 生成 → 形式チェック
//   → 別のAIで品質検査（ページは開かず、調査メモと開いたページの抜粋で検査）→ 合格したものだけ content/ に保存
// 使い方: ANTHROPIC_API_KEY=... node tools/content/daily.mjs
// 環境変数（テスト用）: CONFIG_FILE, CURRICULUM_FILE, CONTENT_DIR, LOG_DIR, TODAY, ANTHROPIC_BASE_URL,
//                       CONTENT_MODEL, RESEARCH_MODEL, MAX_ATTEMPTS, REDO
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadApp, ROOT } from './load-app.mjs';
import { commonContext, unitBrief, researchSystem, generateRules, VERIFY_SYSTEM, CHECKS, VERDICT_SCHEMA } from './prompts.mjs';

const MODEL = process.env.CONTENT_MODEL || 'claude-opus-5-5';            // 生成・検証
const RESEARCH_MODEL = process.env.RESEARCH_MODEL || 'claude-sonnet-5-5'; // 調査（検索・資料の読み込み）
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, 'content');
const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, 'tools', 'content', 'log');
const CFG = JSON.parse(fs.readFileSync(process.env.CONFIG_FILE || path.join(ROOT, 'tools', 'content', 'config.json'), 'utf8'));
const CUR = JSON.parse(fs.readFileSync(process.env.CURRICULUM_FILE || path.join(CONTENT_DIR, 'curriculum.json'), 'utf8'));
const jstDate = (t = Date.now()) => new Date(new Date(t).getTime() + 9 * 3600000).toISOString().slice(0, 10);
const TODAY = process.env.TODAY || jstDate();
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS) || 2; // 1日の試行の上限（要件 GN-5）
const UNIT_GIVE_UP = 3;  // 同じ単元で何日続けて不合格なら、いったん後回しにするか
const MIN_NOTES = 4;     // 調査メモ（単元の出典＋調査で確かめた事実）がこれより少なければ作らない
const SOURCE_TYPES = ['学術研究', '公的機関', '国際機関・研究', '企業公式'];
let redo = 0; // 今日の作り直しの回数（id の末尾に r1, r2… を付ける）
// 安全上の理由でAIが断ったとき、Anthropic 推奨の別モデルで自動的にやり直す
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

const report = [];
const say = s => { console.log(s); report.push(s); };
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const textOf = msg => msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
function parseJSON(s) {
  s = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  return JSON.parse(s.slice(a, b + 1));
}
function usable(msg, what) {
  if (msg.stop_reason === 'refusal') throw new Error(what + '：AIが回答を控えました');
  if (msg.stop_reason === 'max_tokens') throw new Error(what + '：出力が長すぎて途中で切れました');
  return msg;
}
/* 調べてよいサイトか（公的機関・国際機関・大学・学術出版社など） */
function allowedUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && CFG.research_domains.some(d => url.hostname === d || url.hostname.endsWith('.' + d));
  } catch (e) { return false; }
}

/* 検索・資料の読み込み（サーバー側のツール）つきで呼ぶ。途中で一時停止（pause_turn）したら続きを頼む */
async function withTools(client, params, what) {
  const messages = params.messages.slice(), blocks = [];
  for (let i = 0; i < 6; i++) {
    const msg = await client.beta.messages.create(Object.assign({}, params, { messages }));
    blocks.push(...msg.content);
    if (msg.stop_reason !== 'pause_turn') return { msg: usable(msg, what), blocks };
    messages.push({ role: 'assistant', content: msg.content });
  }
  throw new Error(what + '：調べものが終わりませんでした');
}
/* URL の表記ゆれ（http/https・www・末尾の /・# 以降）をそろえて比べる */
function normUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return x.hostname.replace(/^www\./, '').toLowerCase() + x.pathname.replace(/\/+$/, '') + x.search;
  } catch (e) { return ''; }
}
/* 実際に開いた（web_fetch で取得できた）ページ。URL（依頼したURLと転送先の両方）→ 本文の抜粋 */
function fetchedPages(blocks) {
  const pages = new Map(), asked = {};
  for (const b of blocks) {
    if (b.type === 'server_tool_use' && b.name === 'web_fetch' && b.input && b.input.url) asked[b.id] = b.input.url;
    if (b.type === 'web_fetch_tool_result' && b.content && b.content.type === 'web_fetch_result') {
      const src = b.content.content && b.content.content.source;
      const text = src && src.type === 'text' ? String(src.data || '') : '（PDF の資料）';
      for (const u of [b.content.url, asked[b.tool_use_id]]) { const k = normUrl(u); if (k) pages.set(k, { url: b.content.url, text }); }
    }
  }
  return pages;
}
/* 回答の JSON を取り出す。最後のほうの文章から、key を含む JSON として読めるものを探す */
function lastJSON(blocks, key) {
  const texts = blocks.filter(b => b.type === 'text').map(b => b.text);
  for (let i = texts.length - 1; i >= 0; i--) {
    for (const cand of [texts.slice(i).join(''), texts[i]]) {
      if (cand.indexOf('"' + key + '"') < 0) continue;
      try { return parseJSON(cand); } catch (e) { /* 次の候補へ */ }
    }
  }
  throw new Error('回答から JSON（' + key + '）を読み取れませんでした');
}
const webTools = (search, fetchN) => [
  { type: 'web_search_20260209', name: 'web_search', max_uses: search, allowed_domains: CFG.research_domains },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: fetchN, max_content_tokens: 8000, allowed_domains: CFG.research_domains }
].filter(t => t.max_uses > 0);

/* カリキュラムの出典の種類 → 教材の出典の種類 */
const sourceType = s => s.rank === 'C' ? '企業公式' : /公的/.test(s.kind) ? '公的機関' : '学術研究';
/* 章の短い名前（教材の trackLabel、20字まで） */
function chapterLabel(ch) {
  const t = ch.title.split('：')[0];
  return t.length <= 20 ? t : t.slice(0, 19) + '…';
}
/* 文献の短い名前（例：Edmondson (1999)（査読論文）、Frazier ほか (2017)（メタ分析））。カリキュラムに short があればそれを使う */
function shortCite(s) {
  if (s.short) return s.short;
  const m = /^(.+?)\s*\((\d{4})\)/.exec(s.cite);
  if (!m || /[（「『]/.test(m[1])) return s.cite.slice(0, 60);
  const parts = m[1].split(/\.,\s+/), first = m[1].split(',')[0].trim();
  const who = !/&/.test(m[1]) ? first : parts.length === 2 ? first + ' & ' + parts[1].replace(/^&\s*/, '').split(',')[0].trim() : first + ' ほか';
  return who + ' (' + m[2] + ')（' + s.kind + '）';
}
/* 単元の出典（カリキュラムで確認済み）を、調査メモと同じ形にする */
function seedNotes(u) {
  return u.sources.map(id => CUR.sources[id]).filter(Boolean).map(s => ({
    fact: s.finding, url: s.url, source: shortCite(s), type: sourceType(s), rank: s.rank, seed: true,
    published: (/\((\d{4})/.exec(s.cite) || [])[1]
  }));
}

/* 次に作る単元：カリキュラム順で、まだ教材がなく、続けて不合格になっていないもの */
function pickUnits(A, index, fails) {
  const covered = new Set(A.TOPICS.map(t => t.unit).concat(index.items.map(it => it.unit)).filter(Boolean));
  const all = CUR.chapters.flatMap(ch => ch.units.map(u => ({ ch, u })));
  const open = all.filter(x => !covered.has(x.u.id));
  const ready = open.filter(x => (fails[x.u.id] || 0) < UNIT_GIVE_UP);
  return { open, list: (ready.length ? ready : open).slice(0, MAX_ATTEMPTS) };
}

async function main() {
  const indexFile = path.join(CONTENT_DIR, 'index.json');
  const index = readJSON(indexFile, { version: 1, items: [] });
  const failFile = path.join(LOG_DIR, 'unit-fails.json');
  const fails = readJSON(failFile, {});
  const dayFile = 'daily/' + TODAY + '.json';
  // 作り直し（REDO=true）：今日の教材を取り下げて、作り直す
  if (process.env.REDO === 'true' && index.items.some(it => it.date === TODAY)) {
    const old = index.items.filter(it => it.date === TODAY);
    index.items = index.items.filter(it => it.date !== TODAY);
    old.forEach(it => { try { fs.unlinkSync(path.join(CONTENT_DIR, it.file)); } catch (e) { /* もう無い */ } });
    redo = old.length + (index.redo && index.redo[TODAY] || 0);
    index.redo = { [TODAY]: redo };
    say('今日の教材「' + old.map(it => it.title).join('・') + '」を取り下げて、作り直します。');
  }
  if (index.items.some(it => it.date === TODAY)) { say('今日（' + TODAY + '）の教材はすでにあります。終了します。'); return finish(); }

  const A = loadApp();
  // 過去の配信分の知識ノードも「既存」として扱う（同じ概念を二重に作らない）
  for (const it of index.items) {
    const b = readJSON(path.join(CONTENT_DIR, it.file), null);
    if (b) Object.assign(A.NODES, b.nodes || {});
  }
  const { open, list } = pickUnits(A, index, fails);
  if (!list.length) { say('カリキュラムのすべての単元に教材があります。新しい教材は作りません。'); return finish(); }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY が設定されていません（GitHub の Secrets に登録してください）');
  say('## 単元の選択\n- 教材のない単元：' + open.length + '／' + CUR.chapters.reduce((a, c) => a + c.units.length, 0) + '\n' + list.map((x, i) => '- ' + (i ? '予備' : '今日') + '：' + x.u.id + ' ' + x.u.title + '（' + x.ch.title + '）').join('\n'));

  const client = new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
  const common = commonContext(A);
  const system = role => [{ type: 'text', text: common, cache_control: { type: 'ephemeral' } }, { type: 'text', text: role }];

  for (const sj of list) {
    const label = sj.u.id + ' ' + sj.u.title;
    try {
      const { notes, pages } = await research(client, sj);
      say('- 調査：' + label + '（調査メモ ' + notes.length + '件＝単元の出典 ' + notes.filter(n => n.seed).length + '件＋確かめた事実 ' + notes.filter(n => !n.seed).length + '件）');
      const bundle = await generate(client, system, A, sj, notes);
      const verdict = await verify(client, system, bundle, sj, notes, pages);
      if (!verdict.pass) {
        reject(sj, verdict.failed, fails, failFile);
        say('### 不合格（破棄）：' + label + '\n' + verdict.failed.map(c => '- ' + c.id + '：' + c.note).join('\n'));
        continue;
      }
      bundle.meta = { model: MODEL, researchModel: RESEARCH_MODEL, generatedAt: new Date().toISOString(), unit: sj.u.id, checks: verdict.checks.map(c => ({ id: c.id, ok: c.ok })) };
      fs.mkdirSync(path.join(CONTENT_DIR, 'daily'), { recursive: true });
      fs.writeFileSync(path.join(CONTENT_DIR, dayFile), JSON.stringify(bundle, null, 1) + '\n');
      index.items.unshift({ date: TODAY, id: bundle.topic.id, title: bundle.topic.title, emoji: bundle.topic.emoji, file: dayFile, unit: sj.u.id, chapter: sj.ch.id });
      index.updated = new Date().toISOString();
      fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');
      if (fails[sj.u.id]) { delete fails[sj.u.id]; fs.mkdirSync(LOG_DIR, { recursive: true }); fs.writeFileSync(failFile, JSON.stringify(fails, null, 1) + '\n'); }
      say('## 配信：' + bundle.topic.emoji + ' ' + bundle.topic.title + '（' + label + '）\n' + bundle.topic.sources.map(s => '- 出典：[' + s.rank + '] ' + s.name + ' ' + s.url).join('\n'));
      return finish();
    } catch (e) {
      reject(sj, [{ id: 'error', note: e.message }], fails, failFile);
      say('### 失敗：' + label + '\n- ' + e.message);
    }
  }
  say('今日は合格した教材がなかったため、配信しません（アプリは前日までの教材とお手本で動きます）。');
  return finish();
}

const notesText = notes => '# 調査メモ（単元の出典と、資料で確かめた事実）\n' + notes.map((n, i) => (i + 1) + '. ' + (n.seed ? '【単元の出典】' : '') + n.fact + '\n   出典：' + n.source + '（' + n.type + '・信頼度ランク' + n.rank + (n.published ? '・' + n.published : '') + '） ' + n.url).join('\n');

/* 調査：単元の出典を補う資料を調べ、確かめた事実をURLつきで集める。開いていないページ・許可していないサイトの事実は捨てる */
async function research(client, sj) {
  const seeds = seedNotes(sj.u);
  const brief = unitBrief(sj.ch, sj.u, sj.u.sources.map(id => CUR.sources[id]).filter(Boolean));
  const content = [{ type: 'text', text: brief + '\n\nこの単元の教材を作るために、単元の出典を補う資料を調べてください。\n今日の日付：' + TODAY }];
  const params = { model: RESEARCH_MODEL, max_tokens: 16000, system: researchSystem(CFG), messages: [{ role: 'user', content }], tools: webTools(6, 6), output_config: { effort: 'medium' }, ...FALLBACK };
  let r;
  try { r = await withTools(client, params, '調査'); } catch (e) {
    // サイトの絞り込み指定が受け付けられなかったときは、絞り込みなしで調べ、あとでこちらで絞る
    if (!(e instanceof Anthropic.BadRequestError) || !/domain/i.test(e.message)) throw e;
    say('- 調査：サイトの絞り込み指定が使えなかったため、取得後に絞り込みます');
    r = await withTools(client, Object.assign({}, params, { tools: params.tools.map(t => { const c = Object.assign({}, t); delete c.allowed_domains; return c; }) }), '調査');
  }
  const pages = fetchedPages(r.blocks);
  let raw = [];
  try { const out = lastJSON(r.blocks, 'notes'); raw = Array.isArray(out.notes) ? out.notes : []; } catch (e) { say('- 調査の回答を読み取れませんでした（' + e.message + '）'); }
  const drop = { 短い: 0, 開いていない: 0, 許可外のサイト: 0, ランクD: 0, 単元の出典と重複: 0 };
  const found = raw.filter(n => {
    if (!n || typeof n.fact !== 'string' || n.fact.length < 20) { drop.短い++; return false; }
    if (!allowedUrl(n.url)) { drop.許可外のサイト++; return false; }
    if (!pages.has(normUrl(n.url))) { drop.開いていない++; return false; }
    if (n.rank === 'D') { drop.ランクD++; return false; }
    if (seeds.some(s => normUrl(s.url) === normUrl(n.url))) { drop.単元の出典と重複++; return false; }
    return true;
  }).map(n => ({
    fact: n.fact.slice(0, 400), url: n.url, source: String(n.source || new URL(n.url).hostname).slice(0, 80),
    type: SOURCE_TYPES.includes(n.type) ? n.type : '学術研究',
    // ランクが付いていない・おかしいときは、いちばん低い C（参考）として扱う
    rank: ['A', 'B', 'C'].includes(n.rank) ? n.rank : 'C',
    published: /^\d{4}(-\d{2}(-\d{2})?)?$/.test(n.published || '') ? n.published : undefined
  }));
  say('- 調査の内訳：開いたページ ' + new Set([...pages.values()].map(p => p.url)).size + '件／事実 ' + raw.length + '件のうち採用 ' + found.length + '件' + (raw.length > found.length ? '（除外：' + Object.entries(drop).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join('・') + '）' : ''));
  const notes = seeds.concat(found);
  if (notes.length < MIN_NOTES || !found.length) throw new Error('調査で確かめられた事実が少なすぎます（単元の出典 ' + seeds.length + '件＋確かめた事実 ' + found.length + '件）');
  return { notes, pages };
}

/* 生成：形式チェックに落ちたら、理由を伝えて1回だけ直させる */
async function generate(client, system, A, sj, notes) {
  const brief = unitBrief(sj.ch, sj.u, sj.u.sources.map(id => CUR.sources[id]).filter(Boolean));
  const content = [{ type: 'text', text: notesText(notes) }, { type: 'text', text: brief + '\n今日の日付: ' + TODAY + '\n\n' + generateRules(CFG) }];
  const messages = [{ role: 'user', content }];
  const seedUrls = notes.filter(n => n.seed).map(n => normUrl(n.url));
  for (let round = 0; round < 2; round++) {
    const msg = usable(await client.beta.messages.stream({ model: MODEL, max_tokens: 32000, system: system('あなたは TomoTomo の教材作者です。'), messages, output_config: { effort: 'high' }, ...FALLBACK }).finalMessage(), '生成');
    let bundle, errors;
    try {
      const out = parseJSON(textOf(msg));
      bundle = complete(out, sj, notes);
      const ctx = { nodes: Object.assign({}, A.NODES, bundle.nodes), cats: A.MAP_CATS, rels: A.REL_LABEL, skills: A.SKILLS, newNodes: bundle.nodes, newEdges: bundle.edges, requireEvidence: true, requireViews: true };
      errors = A.validateTopic(bundle.topic, ctx);
      if (bundle.droppedEvidence.length) errors.push('evidence に調査メモにないURLがあります：' + bundle.droppedEvidence.slice(0, 3).join(' '));
      Object.keys(bundle.nodes).forEach(k => { if (A.NODES[k]) errors.push('新ノード ' + k + '：既存のノードと同じ id です（既存を使ってください）'); });
      if (!bundle.topic.apply || !bundle.topic.apply.roles) errors.push('apply.roles（立場別の応用）が必要');
      const fact = (bundle.topic.s3 || [])[0];
      if (!fact || !(fact.evidence || []).some(e => seedUrls.includes(normUrl(e.url)))) errors.push('s3 の「事実」ブロックの evidence に、単元の出典のURLを1つ以上入れてください');
      const refs = Array.isArray(out.references) ? out.references : [];
      if (refs.filter(u => notes.some(n => normUrl(n.url) === normUrl(u))).length < 2) errors.push('references に調査メモのURLを2つ以上（調査メモにあるURLだけ）');
    } catch (e) { errors = ['JSON として読めません：' + e.message]; }
    if (!errors.length) { delete bundle.droppedEvidence; return bundle; }
    say('- 形式チェックで ' + errors.length + ' 件の不備' + (round === 0 ? '（直させます）' : '') + '：' + errors.slice(0, 5).join('／'));
    messages.push({ role: 'assistant', content: msg.content }, { role: 'user', content: '形式チェックで次の不備が見つかりました。直した JSON 全体をもう一度出力してください。\n- ' + errors.join('\n- ') });
  }
  throw new Error('形式チェックに合格しませんでした');
}

/* 4択の並びをランダムにする（正解の位置が偏らないように。AIには正解を先頭に書かせている） */
function shuffleOptions(q) {
  if (!Array.isArray(q.options) || !Number.isInteger(q.answer)) return q;
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  return Object.assign({}, q, { options: order.map(i => q.options[i]), answer: order.indexOf(q.answer) });
}

/* こちらで決める項目（id・単元・日付・出典）を入れる。出典URLはAIに書かせない（確認済み・実際に開いたURLだけにするため） */
function complete(out, sj, notes) {
  const id = 'n' + TODAY.replace(/-/g, '') + (redo ? 'r' + redo : '');
  const refs = (Array.isArray(out.references) ? out.references : []).map(u => notes.find(n => normUrl(n.url) === normUrl(u))).filter(Boolean);
  const sources = notes.filter(n => n.seed).concat(refs)
    .map(n => ({ name: n.source, type: n.type, url: n.url, rank: n.rank }))
    .filter((s, i, a) => a.findIndex(x => normUrl(x.url) === normUrl(s.url)) === i).slice(0, 8);
  // 根拠：AIにはURLだけ書かせ、名前と信頼度ランクは調査メモからこちらで付ける（ないURLは使わない）
  const dropped = [];
  const toEvidence = urls => (Array.isArray(urls) ? urls : []).map(u => {
    const n = notes.find(x => normUrl(x.url) === normUrl(u));
    if (n) return { name: n.source, url: n.url, rank: n.rank, published: n.published };
    dropped.push(String(u)); return null;
  }).filter(Boolean).filter((e, i, a) => a.findIndex(x => x.url === e.url) === i).slice(0, 3)
    .map(e => { if (!e.published) delete e.published; return e; });
  const topic = Object.assign({}, out.topic, {
    id, kind: '専門知識', unit: sj.u.id, chapter: sj.ch.id, track: sj.ch.id, trackLabel: chapterLabel(sj.ch),
    date: TODAY, updated: TODAY, sources,
    note: 'この教材は、組織論の研究（カリキュラムで確認した文献）と、公的機関・学術機関の資料をもとにAIが作成し、別のAIによる品質検査に合格したものです。正確な内容は出典をご確認ください。'
  });
  if (Array.isArray(topic.questions)) topic.questions = topic.questions.map((q, i) => shuffleOptions(Object.assign({}, q, { id: id + '-' + (i + 1), evidence: toEvidence(q.evidence) })));
  if (Array.isArray(topic.s3)) topic.s3 = topic.s3.map(b => { const e = toEvidence(b && b.evidence); const c = Object.assign({}, b); if (e.length) c.evidence = e; else delete c.evidence; return c; });
  return { version: 1, date: TODAY, droppedEvidence: dropped, topic, nodes: out.nodes && typeof out.nodes === 'object' ? out.nodes : {}, edges: Array.isArray(out.edges) ? out.edges : [] };
}

/* 品質検査：別の呼び出しで、調査メモ・開いたページの抜粋・サンプルに照らしてチェック（ページは開かない）。1項目でも不合格なら破棄 */
async function verify(client, system, bundle, sj, notes, pages) {
  const used = new Set(notes.filter(n => !n.seed).map(n => normUrl(n.url)));
  const excerpts = [...pages.entries()].filter(([k]) => used.has(k)).filter(([, p], i, a) => a.findIndex(([, q]) => q.url === p.url) === i)
    .map(([, p]) => '## ' + p.url + '\n' + p.text.slice(0, 6000)).join('\n\n');
  const brief = unitBrief(sj.ch, sj.u, sj.u.sources.map(id => CUR.sources[id]).filter(Boolean));
  const content = [
    { type: 'text', text: notesText(notes) },
    { type: 'text', text: '# 調査で開いたページの抜粋（材料）\n' + (excerpts || '（なし）') },
    { type: 'text', text: brief + '\n\n# 検査項目\n' + CHECKS.map(c => '- ' + c[0] + '：' + c[1]).join('\n') + '\n\n# 検査する教材（JSON）\n' + JSON.stringify(bundle) }
  ];
  const msg = usable(await client.beta.messages.create({ model: MODEL, max_tokens: 16000, system: system(VERIFY_SYSTEM), messages: [{ role: 'user', content }], output_config: { effort: 'high', format: { type: 'json_schema', schema: VERDICT_SCHEMA } }, ...FALLBACK }), '品質検査');
  const v = parseJSON(textOf(msg));
  const checks = CHECKS.map(([id]) => (v.checks || []).find(c => c.id === id) || { id, ok: false, note: '検査結果がありません' });
  const failed = checks.filter(c => !c.ok);
  return { pass: failed.length === 0, checks, failed, summary: v.summary };
}

/* 不合格の記録（本文は残さない）。品質改善のために、オーナーが後から理由を確認できるようにする */
function reject(sj, failed, fails, failFile) {
  const f = path.join(LOG_DIR, 'rejected.json');
  const list = readJSON(f, []);
  list.unshift({ date: TODAY, title: sj.u.id + ' ' + sj.u.title, unit: sj.u.id, reasons: failed.map(c => c.id + '：' + c.note) });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(list.slice(0, 60), null, 1) + '\n');
  fails[sj.u.id] = (fails[sj.u.id] || 0) + 1;
  fs.writeFileSync(failFile, JSON.stringify(fails, null, 1) + '\n');
}

function finish() {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '# 毎日の教材（' + TODAY + '）\n\n' + report.join('\n\n') + '\n');
}

main().catch(e => { say('エラー：' + e.message); finish(); process.exit(1); });
