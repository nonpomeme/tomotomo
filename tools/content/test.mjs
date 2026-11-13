// 組織論のカリキュラムと、毎日の教材づくりの自動テスト。本物の Anthropic API は使わない。
// 使い方: node tools/content/test.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { loadApp, ROOT } from './load-app.mjs';
import { CHECKS } from './prompts.mjs';

const failures = [];
const check = (c, m) => { if (!c) failures.push(m); };
const A = loadApp();
const CUR = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'curriculum.json'), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tomotomo-content-'));
const units = CUR.chapters.flatMap(ch => ch.units.map(u => ({ ch, u })));

// ---- AC-1：カリキュラムが12章・37単元で、全単元に確認済みの出典（ランクA〜C）がある ----
check(CUR.chapters.length === 12 && units.length === 37, 'カリキュラムの章・単元の数: ' + CUR.chapters.length + '章 ' + units.length + '単元');
check(new Set(units.map(x => x.u.id)).size === 37 && units.every(x => /^u(\d+|j)-\d+$/.test(x.u.id)), '単元の id が重複・不正');
check(CUR.chapters.every(ch => ch.role && ch.keywords.length >= 3 && A.MAP_CATS[ch.cat]), '章に役割・調査キーワード・マップの分野がない');
check(units.every(x => x.u.concepts.length >= 2 && x.u.sources.length >= 1 && x.u.sources.every(id => CUR.sources[id])), '出典のない単元、または存在しない出典を指す単元がある');
check(Object.values(CUR.sources).every(s => ['A', 'B', 'C'].includes(s.rank) && /^https:\/\//.test(s.url) && s.cite && s.finding && s.finding.length >= 20), '出典にランク（A〜C）・URL・確認した内容がないものがある');
// 単元id の並び（アプリが curriculum.json なしでも同じ順に並べるため）がカリキュラムの順と一致する
const order = id => { const m = /^u(\d+|j)-(\d+)$/.exec(id); return (m[1] === 'j' ? 99 : Number(m[1])) * 100 + Number(m[2]); };
check(units.every((x, i) => i === 0 || order(units[i - 1].u.id) < order(x.u.id)), '単元 id の順がカリキュラムの順と一致しない');

// ---- AC-2：調査ノートと章の一覧がカリキュラムから生成され、内容が一致している ----
const docFile = path.join(ROOT, 'docs', 'research', 'organization-theory.md'), chFile = path.join(ROOT, 'content', 'chapters.json');
const before = [fs.readFileSync(docFile, 'utf8'), fs.readFileSync(chFile, 'utf8')];
spawnSync(process.execPath, [path.join(ROOT, 'tools', 'content', 'curriculum-doc.mjs')]);
const after = [fs.readFileSync(docFile, 'utf8'), fs.readFileSync(chFile, 'utf8')];
check(before[0] === after[0], '調査ノートがカリキュラムと一致しない（node tools/content/curriculum-doc.mjs で作り直してください）');
check(before[1] === after[1], 'content/chapters.json がカリキュラムと一致しない（node tools/content/curriculum-doc.mjs で作り直してください）');

// ---- AC-3・AC-4：お手本3本が形式チェック（根拠必須・3つの視点必須）に合格し、出典はカリキュラムの確認済み文献だけ ----
const norm = u => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, ''); } catch (e) { return ''; } };
const curUrls = new Set(Object.values(CUR.sources).map(s => norm(s.url)));
check(A.TOPICS.length === 3 && ['org-psych-safety', 'org-socialization', 'org-change-myth'].every(id => A.TOPICS.some(t => t.id === id)), 'お手本が組織論の3本になっていない');
for (const t of A.TOPICS) {
  const errs = A.validateTopic(t, { nodes: A.NODES, cats: A.MAP_CATS, rels: A.REL_LABEL, skills: A.SKILLS, requireEvidence: true, requireViews: true });
  check(!errs.length, 'お手本 ' + t.id + ' が形式チェックに合格しない: ' + errs.join(' / '));
  const ev = t.questions.flatMap(q => q.evidence || []).concat(t.s3.flatMap(b => b.evidence || []));
  check(t.questions.every(q => (q.evidence || []).length) && ev.every(e => ['A', 'B', 'C'].includes(e.rank)), 'お手本 ' + t.id + '：根拠のない問題、またはランクA〜C以外の根拠がある');
  const urls = t.sources.map(s => s.url).concat(ev.map(e => e.url));
  check(urls.every(u => curUrls.has(norm(u))), 'お手本 ' + t.id + '：カリキュラムで確認していない出典がある: ' + urls.filter(u => !curUrls.has(norm(u))).join(' '));
  const u = units.find(x => x.u.id === t.unit);
  check(u && u.ch.id === t.chapter && (u.u.topicId === t.id), 'お手本 ' + t.id + '：単元・章のひも付けがカリキュラムと一致しない');
  check(t.nodes.every(n => A.NODES[n]) && Object.keys(A.MAP_CATS).length === 5, 'お手本 ' + t.id + '：知識ノード・分野が不正');
}
// 正解の位置が偏らない（4択の answer の位置）
const pos0 = [0, 0, 0, 0];
A.TOPICS.forEach(t => t.questions.forEach(q => { if (q.options) pos0[q.answer]++; }));
check(pos0.filter(n => n > 0).length >= 3, 'お手本の正解の位置が偏っている: ' + pos0);

// ---- 毎日の教材づくり（AC-12）：偽の Anthropic API ----
const SEED_URL = u => CUR.sources[u.sources[0]].url;
// 調査で「開いた」ページ。最後の2つは使えない（開いていない／許可していないサイト）
const R = ['https://doi.org/10.9999/a', 'https://www.jil.go.jp/b', 'https://www.mhlw.go.jp/c', 'https://www.example.co.jp/ir/d'];
const notes = R.map((url, i) => ({ fact: '確かめた事実その' + (i + 1) + '：2020年のメタ分析（120研究）で、関係は中程度の正の相関だった。', url: i === 0 ? url + '/' : url, source: '研究' + (i + 1), type: '学術研究', rank: ['A', 'B', 'A', 'C'][i], published: i === 2 ? '2026-09' : '' }))
  .concat([{ fact: '個人ブログの意見（ランクDなので使ってはいけない）', url: R[1], source: '個人', type: '学術研究', rank: 'D' }])
  .concat([{ fact: '開いていないページの事実（使ってはいけない）', url: 'https://www.mhlw.go.jp/notopened', source: 'x', type: '公的機関' }, { fact: '許可していないサイトの事実（使ってはいけない）', url: 'https://blog.test/x', source: 'ブログ', type: '学術研究' }]);

// 生成結果のお手本（お手本1を、AIが返す形に直したもの）。根拠はURLだけ（名前・ランクはプログラムが付ける）
function genOut(unit, { badEvidence = false, noSeed = false } = {}) {
  const s = JSON.parse(JSON.stringify(A.TOPICS[0]));
  ['id', 'kind', 'date', 'updated', 'sources', 'unit', 'chapter', 'trackLabel'].forEach(k => delete s[k]);
  s.nodes = s.nodes.slice(0, 5).concat(['newconcept']);
  s.questions = s.questions.map((q, i) => Object.assign({}, q, { evidence: badEvidence ? ['https://fake.test/made-up'] : i === 0 ? [R[0], 'SEED'] : [R[i % 3]] }));
  s.s3 = s.s3.map((b, i) => Object.assign({}, b, { evidence: i === 0 && !noSeed ? ['SEED', R[0]] : [R[i % 3]] }));
  if (badEvidence) s.questions = s.questions.slice(0, 3);
  return { topic: s, nodes: { newconcept: { name: '新しい概念', cat: 'チームとリーダー', sub: 'チーム', diff: 2 } }, edges: [['newconcept', 'psysafe', 'related', 0.7]], references: [R[0], R[2], 'https://fake.test/hallucinated'] };
}

const calls = [];
let mode = {};
const mock = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
    const body = JSON.parse(raw);
    const sys = typeof body.system === 'string' ? body.system : body.system.map(b => b.text).join('\n');
    const kind = sys.includes('品質検査員') ? 'verify' : sys.includes('調査員') ? 'research' : 'generate';
    calls.push({ kind, body, headers: req.headers });
    const base = { id: 'msg', type: 'message', role: 'assistant', model: body.model, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    const userText = JSON.stringify(body.messages[0].content);
    const unitId = (/単元：(u[\dj]+-\d+)/.exec(userText) || [])[1];
    const unit = units.find(x => x.u.id === unitId);
    if (kind === 'research') {
      // 1回目は検索の途中で一時停止（pause_turn）、2回目で資料を開いて調査メモを返す
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (body.messages.length === 1) return res.end(JSON.stringify({ ...base, stop_reason: 'pause_turn', content: [
        { type: 'server_tool_use', id: 'st1', name: 'web_search', input: { query: '組織論' } },
        { type: 'web_search_tool_result', tool_use_id: 'st1', content: R.map(url => ({ type: 'web_search_result', url, title: 't', encrypted_content: 'x', page_age: null })) }] }));
      const fetchedBlocks = R.concat(['https://blog.test/x']).flatMap((url, i) => [
        { type: 'server_tool_use', id: 'f' + i, name: 'web_fetch', input: { url } },
        { type: 'web_fetch_tool_result', tool_use_id: 'f' + i, content: { type: 'web_fetch_result', url, retrieved_at: null, content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'ページ本文' + (i + 1) + '：メタ分析の要旨' } } } }]);
      // 出版社のページは断られることがある（失敗の理由を記録する）
      const failedFetch = [{ type: 'server_tool_use', id: 'fx', name: 'web_fetch', input: { url: 'https://doi.org/10.9999/blocked' } },
        { type: 'web_fetch_tool_result', tool_use_id: 'fx', content: { type: 'web_fetch_tool_result_error', error_code: 'url_not_accessible' } }];
      return res.end(JSON.stringify({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: '資料を開いて確かめます。{途中の文}' }].concat(failedFetch, fetchedBlocks, [{ type: 'text', text: JSON.stringify({ notes: mode.fewNotes ? [] : notes, gaps: 'なし' }) }]) }));
    }
    let out;
    if (kind === 'verify') out = { checks: CHECKS.map(([id]) => { const ok = !(mode.failVerify && id === 'research_accuracy'); return { id, ok, note: ok ? '問題なし' : '効果の向きを誇張している' }; }), summary: 'まとめ' };
    else {
      const n = calls.filter(c => c.kind === 'generate').length;
      out = genOut(unit.u, { badEvidence: mode.badFirst && n === 1, noSeed: mode.noSeed });
      if (mode.reuseNode) out.nodes = {}, out.edges = [], out.topic.nodes = out.topic.nodes.slice(0, 5).concat(['newconcept']);
    }
    let text = JSON.stringify(out).replace(/"SEED"/g, JSON.stringify(unit ? SEED_URL(unit.u) : ''));
    if (!body.stream) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text }] })); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const ev = (type, d) => res.write('event: ' + type + '\ndata: ' + JSON.stringify({ type, ...d }) + '\n\n');
    ev('message_start', { message: { ...base, content: [], stop_reason: null } });
    ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
    ev('content_block_stop', { index: 0 });
    ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } });
    ev('message_stop', {}); res.end();
  });
});
await new Promise(r => mock.listen(0, '127.0.0.1', r));

const contentDir = path.join(tmp, 'content'), logDir = path.join(tmp, 'log');
fs.mkdirSync(contentDir, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'content', 'curriculum.json'), path.join(contentDir, 'curriculum.json'));
const cfgFile = path.join(tmp, 'config.json');
const realCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/content/config.json'), 'utf8'));
fs.writeFileSync(cfgFile, JSON.stringify(Object.assign({}, realCfg, { research_domains: ['doi.org', 'go.jp', 'example.co.jp'] })));
function run(today, extra = {}) {
  calls.length = 0;
  return new Promise(resolve => {
    const env = { ...process.env, ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + mock.address().port, CONFIG_FILE: cfgFile, CONTENT_DIR: contentDir, LOG_DIR: logDir, TODAY: today, ...extra };
    const p = spawn(process.execPath, [path.join(ROOT, 'tools/content/daily.mjs')], { env });
    let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
    p.on('close', code => resolve({ code, out }));
  });
}
const readJ = f => JSON.parse(fs.readFileSync(f, 'utf8'));

try {
  // 1日目：カリキュラム順で最初の、お手本のない単元（序章 u0-1）を選ぶ。最初の生成は形式不備 → 直させて合格 → 配信
  mode = { badFirst: true };
  let r = await run('2026-11-10');
  check(r.code === 0, '1日目が失敗: ' + r.out);
  if (process.env.DEBUG_OUT) console.log(r.out);
  const bundle = readJ(path.join(contentDir, 'daily', '2026-11-10.json'));
  const index = readJ(path.join(contentDir, 'index.json'));
  const t1 = bundle.topic;
  check(t1.unit === 'u0-1' && t1.chapter === 'ch0' && t1.kind === '専門知識' && t1.trackLabel === '序章 組織論をどう学び、どう使うか', '単元が選ばれていない／ひも付いていない: ' + [t1.unit, t1.chapter, t1.trackLabel]);
  check(index.items.length === 1 && index.items[0].unit === 'u0-1' && index.items[0].file === 'daily/2026-11-10.json', 'index.json に単元が記録されていない');
  // 調査：単元の出典を渡し、一時停止しても続きを頼み、開いた・許可したサイトの事実だけを使う
  const res1 = calls.filter(c => c.kind === 'research');
  check(res1.length === 2 && res1[1].body.messages.length === 2 && res1[0].body.model === 'claude-sonnet-5-5', '調査の一時停止（pause_turn）から続けていない');
  check(res1[0].body.tools.some(t => t.type === 'web_search_20260209' && t.allowed_domains.includes('doi.org')) && res1[0].body.tools.some(t => t.type === 'web_fetch_20260209'), '調査に検索・資料の読み込みとサイトの絞り込みが付いていない');
  const u01 = units[0].u;
  check(res1[0].body.messages[0].content[0].text.includes(CUR.sources[u01.sources[0]].finding), '調査に単元の出典（確認済みの内容）が渡っていない');
  const genNotes = calls.find(c => c.kind === 'generate').body.messages[0].content[0].text;
  check(genNotes.includes('【単元の出典】') && u01.sources.every(id => genNotes.includes(CUR.sources[id].url)), '単元の出典が調査メモの中心に入っていない');
  check(R.slice(1).every(u => genNotes.includes(u)) && genNotes.includes(R[0] + '/') && !genNotes.includes('notopened') && !genNotes.includes('blog.test'), '開いていない・許可していないサイトの事実が調査メモに入っている');
  check(!genNotes.includes('個人ブログ') && genNotes.includes('信頼度ランクB'), 'ランクDの事実が調査メモに入っている、またはランクが渡っていない');
  check(r.out.includes('除外：') && r.out.includes('ランクD 1'), '調査の内訳（除外の理由）が記録されていない');
  check(r.out.includes('検索 1回（結果 4件）') && r.out.includes('ページを開く 6回（成功 5・失敗 url_not_accessible 1）') && r.out.includes('調べても確かめられなかったこと：なし'), '調査の道具の使い方（検索・ページを開く回数と失敗の理由）が記録されていない: ' + r.out);
  // 出典：単元の出典（確認済み）＋調査で使った資料。架空のURLは入らない
  check(u01.sources.every(id => t1.sources.some(s => s.url === CUR.sources[id].url)) && t1.sources.some(s => s.url === R[0] + '/') && !JSON.stringify(t1.sources).includes('fake.test'), '出典が不正: ' + JSON.stringify(t1.sources));
  check(t1.sources.every(s => ['A', 'B', 'C'].includes(s.rank) && ['学術研究', '公的機関', '国際機関・研究', '企業公式'].includes(s.type)), '出典のランク・種類が不正');
  const q1 = t1.questions[0];
  check(q1.evidence.length === 2 && q1.evidence[0].name === '研究1' && q1.evidence[0].rank === 'A' && q1.evidence[1].url === SEED_URL(u01) && q1.evidence[1].name === 'Rousseau (2006)（査読論文）', '問題の根拠（名前とランク）: ' + JSON.stringify(q1.evidence));
  check(t1.s3[0].evidence.some(e => e.url === SEED_URL(u01)) && t1.s3[2].evidence[0].published === '2026-09', '解説ブロックの根拠: ' + JSON.stringify(t1.s3.map(b => b.evidence)));
  // 形式チェック（根拠必須・3つの視点必須）に合格し、アプリで表示できる
  check(A.validateTopic(t1, { nodes: Object.assign({}, A.NODES, bundle.nodes), cats: A.MAP_CATS, rels: A.REL_LABEL, skills: A.SKILLS, newNodes: bundle.nodes, newEdges: bundle.edges, requireEvidence: true, requireViews: true }).length === 0, '保存された教材が形式チェックに合格しない');
  check(t1.apply.views && t1.apply.views.customer && t1.apply.roles && t1.apply.roles.executive, '3つの視点・立場別の応用が保存されていない');
  check(t1.id === 'n20261110' && t1.questions.every((q, i) => q.id === 'n20261110-' + (i + 1)) && t1.date === '2026-11-10', 'id・日付の付け方');
  const orig = genOut(u01).topic.questions;
  check(t1.questions.every((q, i) => !q.options || (q.options[q.answer] === orig[i].options[orig[i].answer] && q.options.slice().sort().join() === orig[i].options.slice().sort().join())), '並べ替えで正解が変わっている');
  check(calls.filter(c => c.kind === 'generate').length === 2, '形式不備のとき直させていない');
  const gen = calls.find(c => c.kind === 'generate').body;
  check(gen.model === 'claude-opus-5-5' && gen.stream === true && gen.output_config.effort === 'high', '生成のモデル・設定');
  check(gen.messages[0].content[1].text.includes('apply.views') && gen.messages[0].content[1].text.includes('検定試験') && gen.messages[0].content[1].text.includes(u01.title), '生成に単元・3つの視点の指示が渡っていない');
  check(gen.system[0].cache_control && gen.system[0].text.includes('org-psych-safety'), 'お手本3本を渡していない');
  check(!calls.some(c => /選定|編集者/.test(JSON.stringify(c.body.system))), 'ニュースの選定をしている');
  // 品質検査：ページは開かず、調査メモと開いたページの抜粋を材料にする（要件 GN-3）
  const ver = calls.find(c => c.kind === 'verify');
  check(ver && !ver.body.tools && ver.body.output_config.format.type === 'json_schema', '品質検査でページを開こうとしている（ツールが付いている）');
  check(ver && ver.body.messages[0].content[0].text.includes('調査メモ') && ver.body.messages[0].content[1].text.includes('ページ本文1') && !ver.body.messages[0].content[1].text.includes('ページ本文5'), '品質検査に調査メモ・開いたページの抜粋が渡っていない');
  check(String(ver.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01') && ver.body.fallbacks === 'default', 'フォールバック設定');
  check(!fs.existsSync(path.join(logDir, 'rejected.json')), '合格なのに不合格の記録がある');

  // 同じ日に2回動いても作り直さない
  r = await run('2026-11-10');
  check(r.code === 0 && calls.length === 0 && r.out.includes('すでにあります'), '同じ日の再実行で二重に作っている');

  // 作り直し：今日の教材を取り下げて、同じ単元で作り直す
  mode = {};
  r = await run('2026-11-10', { REDO: 'true' });
  const idx2 = readJ(path.join(contentDir, 'index.json'));
  check(r.code === 0 && idx2.items.length === 1 && idx2.items[0].id === 'n20261110r1' && idx2.items[0].unit === 'u0-1', '作り直しで新しい id にならない: ' + JSON.stringify(idx2.items) + r.out);

  // 2日目：次の単元（u0-2）。品質検査で不合格 → 破棄。1日の試行は2回まで（予備の単元 u1-1 も不合格）
  mode = { failVerify: true, reuseNode: true };
  r = await run('2026-11-11');
  check(r.code === 0, '2日目が異常終了: ' + r.out);
  check(!fs.existsSync(path.join(contentDir, 'daily', '2026-11-11.json')), '不合格の教材が保存されている');
  const rej = readJ(path.join(logDir, 'rejected.json'));
  check(rej.length === 2 && rej[1].unit === 'u0-2' && rej[0].unit === 'u1-1' && rej[0].reasons[0].includes('research_accuracy'), '不合格の記録: ' + JSON.stringify(rej));
  check(calls.filter(c => c.kind === 'research').length === 4 && calls.filter(c => c.kind === 'verify').length === 2, '1日の試行が2回になっていない');
  check(readJ(path.join(contentDir, 'index.json')).items.length === 1, '不合格なのに index が増えた');

  // 3日目：単元の事実ブロックに単元の出典がない → 直させても直らなければ配信しない
  mode = { noSeed: true, reuseNode: true };
  r = await run('2026-11-12');
  check(r.code === 0 && !fs.existsSync(path.join(contentDir, 'daily', '2026-11-12.json')) && r.out.includes('単元の出典のURL'), '単元の出典を使っていない教材を配信している: ' + r.out);

  // 4日目：調査で確かめられた事実がない → 書かずに破棄（調査不足は配信しない）
  mode = { fewNotes: true, reuseNode: true };
  r = await run('2026-11-13');
  check(r.code === 0 && !fs.existsSync(path.join(contentDir, 'daily', '2026-11-13.json')) && r.out.includes('少なすぎます') && !calls.some(c => c.kind === 'generate'), '調査が不十分なのに教材を作っている: ' + r.out);

  // 3日続けて不合格の単元は後回しにする（u0-2 は2日目・3日目・4日目で3回）
  const fails = readJ(path.join(logDir, 'unit-fails.json'));
  mode = { reuseNode: true };
  r = await run('2026-11-14');
  const b5 = readJ(path.join(contentDir, 'daily', '2026-11-14.json'));
  check(fails['u0-2'] >= 3 && b5.topic.unit !== 'u0-2', '不合格が続く単元を後回しにしていない: ' + JSON.stringify(fails) + ' → ' + b5.topic.unit);

  // すべての単元に教材があれば作らない（APIも呼ばない）
  const full = readJ(path.join(contentDir, 'index.json'));
  const saved = JSON.stringify(full);
  full.items = units.map((x, i) => ({ date: '2026-01-' + String(i % 28 + 1).padStart(2, '0'), id: 'x' + i, title: 'x', file: 'none.json', unit: x.u.id }));
  fs.writeFileSync(path.join(contentDir, 'index.json'), JSON.stringify(full));
  r = await run('2026-11-15', { ANTHROPIC_API_KEY: '' });
  check(r.code === 0 && calls.length === 0 && r.out.includes('すべての単元に教材があります'), 'すべての単元に教材があるのに作ろうとしている: ' + r.out);
  fs.writeFileSync(path.join(contentDir, 'index.json'), saved);
} finally {
  mock.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- 配信一覧（MG-3）：組織論に作り直す前の7分野の教材は配信一覧から外れている ----
const liveIndex = readJ(path.join(ROOT, 'content', 'index.json'));
check(liveIndex.items.every(it => it.unit), '配信一覧に単元のない（作り直す前の）教材が残っている');

if (failures.length) { console.error('NG\n' + failures.join('\n')); process.exit(1); }
console.log('OK: カリキュラムと教材づくりのテストに合格しました');
