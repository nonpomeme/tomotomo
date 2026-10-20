// 毎日の教材づくり（GitHub Actions から1日1回実行）
//   収集 → 選定 → 調査 → 生成 → 形式チェック → 別のAIで品質検査 → 合格したものだけ content/ に保存
//   良い発表がない日は、専門知識の一覧（tracks.json の curriculum）から題材を選び、調査して教材にする
// 使い方: ANTHROPIC_API_KEY=... node tools/content/daily.mjs
//         node tools/content/daily.mjs --collect   … 候補の収集だけ（1日に何回か実行して、候補をためておく）
// 環境変数（テスト用）: SOURCES_FILE, TRACKS_FILE, CONTENT_DIR, LOG_DIR, CANDIDATES_FILE, TODAY, ANTHROPIC_BASE_URL,
//                       CONTENT_MODEL, RESEARCH_MODEL, MAX_ATTEMPTS, REDO
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadApp, ROOT } from './load-app.mjs';
import { collect, fetchArticle, jstDate } from './collect.mjs';
import { commonContext, selectSystem, PICK_SCHEMA, researchSystem, generateRules, VERIFY_SYSTEM, CHECKS, VERDICT_SCHEMA } from './prompts.mjs';

const MODEL = process.env.CONTENT_MODEL || 'claude-opus-5-5';            // 選定・生成・検証
const RESEARCH_MODEL = process.env.RESEARCH_MODEL || 'claude-sonnet-5-5'; // 調査（検索・資料の読み込み）
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, 'content');
const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, 'tools', 'content', 'log');
const SOURCES = JSON.parse(fs.readFileSync(process.env.SOURCES_FILE || path.join(ROOT, 'tools', 'content', 'sources.json'), 'utf8'));
const T = JSON.parse(fs.readFileSync(process.env.TRACKS_FILE || path.join(ROOT, 'tools', 'content', 'tracks.json'), 'utf8'));
const CANDIDATES_FILE = process.env.CANDIDATES_FILE || path.join(ROOT, 'tools', 'content', '.cache', 'candidates.json');
const TODAY = process.env.TODAY || jstDate();
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS) || 2;
const SOURCE_TYPES = ['公的機関', '企業公式', '国際機関・研究'];
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
/* 調べてよいサイトか（公的機関・国際機関・大学・企業の公式サイト） */
function allowedUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && T.research_domains.some(d => url.hostname === d || url.hostname.endsWith('.' + d));
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
/* 実際に開いた（web_fetch）ページのURL */
function fetchedUrls(blocks) {
  const fetched = new Set();
  for (const b of blocks) {
    if (b.type === 'web_fetch_tool_result' && b.content && b.content.type === 'web_fetch_result') fetched.add(b.content.url);
  }
  return fetched;
}
/* 最後のツール結果より後ろの文章（＝最終的な回答） */
function finalText(blocks) {
  let last = -1;
  blocks.forEach((b, i) => { if (b.type !== 'text') last = i; });
  return blocks.slice(last + 1).filter(b => b.type === 'text').map(b => b.text).join('');
}
const webTools = (search, fetchN) => [
  { type: 'web_search_20260209', name: 'web_search', max_uses: search, allowed_domains: T.research_domains },
  { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: fetchN, max_content_tokens: 8000, allowed_domains: T.research_domains }
].filter(t => t.max_uses > 0);

/* 収集した候補をファイルにためる（直近3日分）。朝の1回だけだと新着が少ないため、1日に何回か集める */
async function gather(used) {
  const { items, log } = await collect(SOURCES.feeds, { exclude: used });
  const old = readJSON(CANDIDATES_FILE, []).filter(it => Date.now() - new Date(it.date).getTime() <= 3 * 86400000 && !used.has(it.link));
  const seen = new Set(), all = [];
  for (const it of items.concat(old)) { if (!seen.has(it.link)) { seen.add(it.link); all.push(it); } }
  all.sort((a, b) => b.date.localeCompare(a.date));
  fs.mkdirSync(path.dirname(CANDIDATES_FILE), { recursive: true });
  fs.writeFileSync(CANDIDATES_FILE, JSON.stringify(all.slice(0, 600)));
  return { items: all, log };
}
const matches = (it, track) => track.keywords.some(k => (it.title + ' ' + it.summary).includes(k));

async function main() {
  const indexFile = path.join(CONTENT_DIR, 'index.json');
  const index = readJSON(indexFile, { version: 1, items: [] });
  const dayFile = 'daily/' + TODAY + '.json';
  if (process.argv.includes('--collect')) {
    const { items, log } = await gather(new Set(index.items.flatMap(it => it.links || [])));
    say('## 候補の収集\n' + log.map(l => '- ' + l).join('\n') + '\n- ためている候補：' + items.length + '件');
    return finish();
  }
  // 作り直し（REDO=true）：今日の教材を取り下げて、別の発表から作り直す
  if (process.env.REDO === 'true' && index.items.some(it => it.date === TODAY)) {
    const old = index.items.filter(it => it.date === TODAY);
    index.retired = (index.retired || []).concat(old.flatMap(it => it.links || []));
    index.items = index.items.filter(it => it.date !== TODAY);
    old.forEach(it => { try { fs.unlinkSync(path.join(CONTENT_DIR, it.file)); } catch (e) { /* もう無い */ } });
    redo = old.length + (index.redo && index.redo[TODAY] || 0);
    index.redo = { [TODAY]: redo };
    say('今日の教材「' + old.map(it => it.title).join('・') + '」を取り下げて、作り直します。');
  }
  if (index.items.some(it => it.date === TODAY)) { say('今日（' + TODAY + '）の教材はすでにあります。終了します。'); return finish(); }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY が設定されていません（GitHub の Secrets に登録してください）');

  const A = loadApp();
  // 過去の配信分の知識ノードも「既存」として扱う（同じ概念を二重に作らない）
  for (const it of index.items) {
    const b = readJSON(path.join(CONTENT_DIR, it.file), null);
    if (b) Object.assign(A.NODES, b.nodes || {});
  }
  const used = new Set(index.items.flatMap(it => it.links || []).concat(index.retired || []));

  // 1. 収集
  const { items: collected, log } = await gather(used);
  const trackId = T.schedule[String(new Date(TODAY + 'T12:00:00Z').getUTCDay())];
  const track = T.tracks[trackId];
  // 今日のテーマ（曜日ごと）に合う候補を先頭に。どのテーマのキーワードにも合わないものは使わない
  const items = collected.filter(it => matches(it, track)).concat(collected.filter(it => !matches(it, track) && Object.values(T.tracks).some(t => matches(it, t)))).slice(0, 80);
  say('## 収集\n' + log.map(l => '- ' + l).join('\n') + '\n- 候補：' + collected.length + '件（今日のテーマ「' + track.label + '」に合うもの ' + collected.filter(it => matches(it, track)).length + '件）');

  const client = new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
  const common = commonContext(A);
  const system = role => [{ type: 'text', text: common, cache_control: { type: 'ephemeral' } }, { type: 'text', text: role }];

  // 2. 選定
  let picks = [];
  if (items.length) {
    const recent = index.items.slice(0, 14).map(it => it.title);
    const list = items.slice(0, 60).map((it, i) => i + '. [' + it.publisher + '｜' + jstDate(it.date) + '] ' + it.title + (it.summary ? ' — ' + it.summary.slice(0, 120) : '')).join('\n');
    const sel = usable(await client.beta.messages.create({
      model: MODEL, max_tokens: 8000, system: selectSystem(T, track),
      messages: [{ role: 'user', content: '直近に配信したテーマ:\n' + (recent.join('\n') || '（なし）') + '\n\n新着一覧（今日のテーマに合いそうなものが先頭）:\n' + list + '\n\n教材にするのに良いものを、良い順に最大3つ選んでください。track には、そのテーマの id（' + Object.keys(T.tracks).join(' / ') + '）を入れてください。' }],
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PICK_SCHEMA } }, ...FALLBACK
    }), '選定');
    picks = parseJSON(textOf(sel)).picks.filter(p => items[p.index] && T.tracks[p.track]).slice(0, 3);
  }
  say('## 選定（今日のテーマ：' + track.label + '）\n' + (picks.map(p => '- [' + T.tracks[p.track].label + '] ' + items[p.index].title + '（' + p.reason + '）').join('\n') || '- 良い発表がありませんでした（専門知識の一覧から作ります）'));

  // 3〜6. 調査 → 生成 → 形式チェック → 品質検査（合格するまで最大 MAX_ATTEMPTS 件）
  const subjects = picks.map(p => ({ kind: 'news', item: items[p.index], trackId: p.track }));
  // 発表で作れなかったときの予備：今日のテーマの専門知識の一覧から、まだ扱っていない題材
  const done = new Set(index.curriculumDone || []);
  const topicName = (track.curriculum || []).find(c => !done.has(c));
  if (topicName) subjects.push({ kind: 'curriculum', topicName, trackId });
  let attempts = 0;
  for (const sj of subjects) {
    // 発表での試行が上限に達しても、専門知識の題材には1回挑戦する
    if (attempts >= MAX_ATTEMPTS && sj.kind === 'news') continue;
    const label = sj.kind === 'news' ? sj.item.title : '専門知識：' + sj.topicName;
    let doc = null;
    if (sj.kind === 'news') {
      try { doc = await fetchArticle(sj.item.link); } catch (e) { say('- 本文を取得できず飛ばしました：' + label + '（' + e.message + '）'); continue; }
    }
    attempts++;
    try {
      const notes = await research(client, sj, doc);
      say('- 調査：' + label + '（確かめた事実 ' + notes.length + '件・資料 ' + new Set(notes.map(n => n.url)).size + 'ページ）');
      const bundle = await generate(client, system, A, sj, doc, notes);
      const verdict = await verify(client, system, bundle, sj, doc, notes);
      if (!verdict.pass) {
        reject(sj, verdict.failed);
        say('### 不合格（破棄）：' + label + '\n' + verdict.failed.map(c => '- ' + c.id + '：' + c.note).join('\n'));
        continue;
      }
      bundle.meta = { model: MODEL, researchModel: RESEARCH_MODEL, generatedAt: new Date().toISOString(), checks: verdict.checks.map(c => ({ id: c.id, ok: c.ok })) };
      fs.mkdirSync(path.join(CONTENT_DIR, 'daily'), { recursive: true });
      fs.writeFileSync(path.join(CONTENT_DIR, dayFile), JSON.stringify(bundle, null, 1) + '\n');
      index.items.unshift({ date: TODAY, id: bundle.topic.id, title: bundle.topic.title, emoji: bundle.topic.emoji, file: dayFile, links: sj.kind === 'news' ? [sj.item.link] : [] });
      if (sj.kind === 'curriculum') index.curriculumDone = (index.curriculumDone || []).concat([sj.topicName]);
      index.updated = new Date().toISOString();
      fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');
      say('## 配信：' + bundle.topic.emoji + ' ' + bundle.topic.title + '\n' + bundle.topic.sources.map(s => '- 出典：' + s.name + ' ' + s.url).join('\n'));
      return finish();
    } catch (e) {
      reject(sj, [{ id: 'error', note: e.message }]);
      say('### 失敗：' + label + '\n- ' + e.message);
    }
  }
  say('今日は合格した教材がなかったため、配信しません（アプリは前日までの教材とサンプルで動きます）。');
  return finish();
}

const docBlock = (sj, doc, prefix) => doc.kind === 'pdf'
  ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.data }, title: (prefix || '') + sj.item.title }
  : { type: 'document', source: { type: 'text', media_type: 'text/plain', data: doc.text }, title: (prefix || '') + sj.item.title };
const notesText = notes => '# 調査メモ（資料で確かめた事実）\n' + notes.map((n, i) => (i + 1) + '. ' + n.fact + '\n   出典：' + n.source + '（' + n.type + '） ' + n.url).join('\n');

/* 調査：公的機関などの資料を検索して読み、確かめた事実をURLつきで集める。開いていないページ・許可していないサイトの事実は捨てる */
async function research(client, sj, doc) {
  const tr = T.tracks[sj.trackId];
  const task = sj.kind === 'news'
    ? '添付の発表（' + sj.item.publisher + '「' + sj.item.title + '」' + jstDate(sj.item.date) + '）を題材に教材を作ります。発表の内容を正しく理解し、専門的に掘り下げるために必要な資料を調べてください。'
    : '題材「' + sj.topicName + '」で教材を作ります（ニュースではなく専門知識の教材）。この題材を専門的に正しく説明するために必要な資料を調べてください。';
  const content = [{ type: 'text', text: task + '\nテーマ：' + tr.label + '（' + tr.focus + '）\n今日の日付：' + TODAY }];
  if (doc) content.unshift(docBlock(sj, doc));
  const params = { model: RESEARCH_MODEL, max_tokens: 16000, system: researchSystem(T), messages: [{ role: 'user', content }], tools: webTools(8, 8), output_config: { effort: 'medium' }, ...FALLBACK };
  let r;
  try { r = await withTools(client, params, '調査'); } catch (e) {
    // サイトの絞り込み指定が受け付けられなかったときは、絞り込みなしで調べ、あとでこちらで絞る
    if (!(e instanceof Anthropic.BadRequestError) || !/domain/i.test(e.message)) throw e;
    say('- 調査：サイトの絞り込み指定が使えなかったため、取得後に絞り込みます');
    r = await withTools(client, Object.assign({}, params, { tools: params.tools.map(t => { const c = Object.assign({}, t); delete c.allowed_domains; return c; }) }), '調査');
  }
  const fetched = fetchedUrls(r.blocks);
  const out = parseJSON(finalText(r.blocks));
  const notes = (Array.isArray(out.notes) ? out.notes : []).filter(n => n && typeof n.fact === 'string' && n.fact.length >= 20 && fetched.has(n.url) && allowedUrl(n.url))
    .map(n => ({ fact: n.fact.slice(0, 400), url: n.url, source: String(n.source || new URL(n.url).hostname).slice(0, 60), type: SOURCE_TYPES.includes(n.type) ? n.type : '公的機関' }));
  if (notes.length < 4) throw new Error('調査で確かめられた事実が少なすぎます（' + notes.length + '件）');
  return notes;
}

/* 生成：形式チェックに落ちたら、理由を伝えて1回だけ直させる */
async function generate(client, system, A, sj, doc, notes) {
  const meta = sj.kind === 'news'
    ? '出典: ' + sj.item.publisher + '（' + sj.item.type + '）\nタイトル: ' + sj.item.title + '\nURL: ' + sj.item.link + '\n公開日: ' + jstDate(sj.item.date)
    : '題材（専門知識の教材。出典ドキュメントはなく、調査メモが事実の根拠）: ' + sj.topicName;
  const content = [{ type: 'text', text: notesText(notes) }, { type: 'text', text: meta + '\n今日の日付: ' + TODAY + '\n\n' + generateRules(T, T.tracks[sj.trackId]) }];
  if (doc) content.unshift(docBlock(sj, doc));
  const messages = [{ role: 'user', content }];
  for (let round = 0; round < 2; round++) {
    const msg = usable(await client.beta.messages.stream({ model: MODEL, max_tokens: 32000, system: system('あなたは TomoTomo の教材作者です。'), messages, output_config: { effort: 'high' }, ...FALLBACK }).finalMessage(), '生成');
    let bundle, errors;
    try {
      const out = parseJSON(textOf(msg));
      bundle = complete(out, sj, notes);
      const ctx = { nodes: Object.assign({}, A.NODES, bundle.nodes), cats: A.MAP_CATS, rels: A.REL_LABEL, skills: A.SKILLS, newNodes: bundle.nodes, newEdges: bundle.edges };
      errors = A.validateTopic(bundle.topic, ctx);
      Object.keys(bundle.nodes).forEach(k => { if (A.NODES[k]) errors.push('新ノード ' + k + '：既存のノードと同じ id です（既存を使ってください）'); });
      if (!bundle.topic.apply || !bundle.topic.apply.roles) errors.push('apply.roles（職種別の応用）が必要');
      const refs = Array.isArray(out.references) ? out.references : [];
      if (refs.filter(u => notes.some(n => n.url === u)).length < 2) errors.push('references に調査メモのURLを2つ以上（調査メモにあるURLだけ）');
    } catch (e) { errors = ['JSON として読めません：' + e.message]; }
    if (!errors.length) return bundle;
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

/* こちらで決める項目（id・日付・出典）を入れる。出典URLはAIに書かせない（実在し、実際に開いたURLだけにするため） */
function complete(out, sj, notes) {
  const id = 'n' + TODAY.replace(/-/g, '') + (redo ? 'r' + redo : '');
  const tr = T.tracks[sj.trackId];
  const refs = (Array.isArray(out.references) ? out.references : []).map(u => notes.find(n => n.url === u)).filter(Boolean);
  const sources = (sj.kind === 'news' ? [{ name: sj.item.publisher, type: sj.item.type, url: sj.item.link }] : [])
    .concat(refs.map(n => ({ name: n.source, type: n.type, url: n.url })))
    .filter((s, i, a) => a.findIndex(x => x.url === s.url) === i).slice(0, 7);
  const topic = Object.assign({}, out.topic, {
    id, kind: sj.kind === 'news' ? '最新ニュース' : '専門知識', track: sj.trackId, trackLabel: tr.label,
    date: sj.kind === 'news' ? jstDate(sj.item.date) : TODAY, updated: TODAY, sources,
    note: (sj.kind === 'news' ? 'この教材は、' + sj.item.publisher + 'の公式発表と、' : 'この教材は、') + '公的機関などの資料をAIが調べて作成し、別のAIによる品質検査に合格したものです。正確な内容は出典をご確認ください。'
  });
  if (Array.isArray(topic.questions)) topic.questions = topic.questions.map((q, i) => shuffleOptions(Object.assign({}, q, { id: id + '-' + (i + 1) })));
  return { version: 1, date: TODAY, topic, nodes: out.nodes && typeof out.nodes === 'object' ? out.nodes : {}, edges: Array.isArray(out.edges) ? out.edges : [] };
}

/* 品質検査：別の呼び出しで、出典・調査メモ・サンプルに照らしてチェック（資料を開いて確かめる）。1項目でも不合格なら破棄 */
async function verify(client, system, bundle, sj, doc, notes) {
  const content = [{ type: 'text', text: notesText(notes) }, { type: 'text', text: (sj.kind === 'news' ? '出典の公開日: ' + jstDate(sj.item.date) : '専門知識の教材（出典ドキュメントなし。事実の根拠は調査メモ）') + '\n\n# 検査項目\n' + CHECKS.map(c => '- ' + c[0] + '：' + c[1]).join('\n') + '\n\n# 検査する教材（JSON）\n' + JSON.stringify(bundle) }];
  if (doc) content.unshift(docBlock(sj, doc, '出典：'));
  const params = { model: MODEL, max_tokens: 16000, system: system(VERIFY_SYSTEM), messages: [{ role: 'user', content }], tools: webTools(0, 4), output_config: { effort: 'high', format: { type: 'json_schema', schema: VERDICT_SCHEMA } }, ...FALLBACK };
  let r;
  try { r = await withTools(client, params, '品質検査'); } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    say('- 品質検査で資料を開く機能が使えなかったため、手元の資料だけで検査します（' + e.message.slice(0, 80) + '）');
    const p2 = Object.assign({}, params); delete p2.tools;
    r = await withTools(client, p2, '品質検査');
  }
  const v = parseJSON(finalText(r.blocks));
  const checks = CHECKS.map(([id]) => v.checks.find(c => c.id === id) || { id, ok: false, note: '検査結果がありません' });
  const failed = checks.filter(c => !c.ok);
  return { pass: failed.length === 0, checks, failed, summary: v.summary };
}

/* 不合格の記録（本文は残さない）。品質改善のために、オーナーが後から理由を確認できるようにする */
function reject(sj, failed) {
  const f = path.join(LOG_DIR, 'rejected.json');
  const list = readJSON(f, []);
  list.unshift({ date: TODAY, title: sj.kind === 'news' ? sj.item.title : '専門知識：' + sj.topicName, url: sj.kind === 'news' ? sj.item.link : '', reasons: failed.map(c => c.id + '：' + c.note) });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(list.slice(0, 60), null, 1) + '\n');
}

function finish() {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '# 毎日の教材（' + TODAY + '）\n\n' + report.join('\n\n') + '\n');
}

main().catch(e => { say('エラー：' + e.message); finish(); process.exit(1); });
