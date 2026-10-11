// 毎日の教材づくりの自動テスト。本物の情報源・Anthropic API は使わない。
// 使い方: node tools/content/test.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadApp, ROOT } from './load-app.mjs';
import { parseFeed } from './collect.mjs';

const failures = [];
const check = (c, m) => { if (!c) failures.push(m); };
const A = loadApp();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tomotomo-content-'));

// ---- 偽の情報源と記事 ----
const web = path.join(tmp, 'web');
fs.mkdirSync(path.join(web, 'feeds.test'), { recursive: true });
fs.mkdirSync(path.join(web, 'news.test'), { recursive: true });
const now = new Date().toUTCString();
fs.writeFileSync(path.join(web, 'feeds.test', 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>テスト省</title>
<item><title>令和8年 労働市場の動向調査の結果</title><link>https://news.test/release1.html</link><pubDate>${now}</pubDate><description>調査結果を公表しました</description></item>
<item><title>人材育成支援の新制度について</title><link>https://news.test/release2.html</link><pubDate>${now}</pubDate><description>新制度を開始します</description></item>
<item><title>古いお知らせ</title><link>https://news.test/old.html</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
</channel></rss>`);
const article = '<html><head><meta charset="utf-8"></head><body><nav>メニュー</nav><main><h1>労働市場の動向調査</h1>' + '<p>本調査によると、企業の78%が人手不足を感じており、採用活動にAIを活用する企業は前年の2倍に増えた。調査は全国の企業1,000社を対象に実施した。</p>'.repeat(8) + '</main><footer>著作権表示</footer></body></html>';
fs.writeFileSync(path.join(web, 'news.test', 'release1.html'), article);
fs.writeFileSync(path.join(web, 'news.test', 'release2.html'), article.replace('労働市場の動向調査', '人材育成支援の新制度'));
const sources = path.join(tmp, 'sources.json');
fs.writeFileSync(sources, JSON.stringify({ feeds: [{ name: 'テスト省', type: '公的機関', url: 'https://feeds.test/rss.xml' }, { name: '壊れた情報源', type: '公的機関', url: 'https://feeds.test/missing.xml' }] }));

// ---- 生成結果のお手本（サンプル1を配信形式に直したもの） ----
const s = JSON.parse(JSON.stringify(A.TOPICS[0]));
['id', 'kind', 'date', 'updated', 'sources'].forEach(k => delete s[k]);
s.s3[0].label = '事実';
s.nodes = s.nodes.slice(0, 5).concat(['laborsurvey']);
const good = { topic: s, nodes: { laborsurvey: { name: '労働市場調査', cat: '経済', sub: '労働', diff: 2 } }, edges: [['laborsurvey', 'labor', 'related', 0.7]] };
// 2日目以降は、前日に増えたノード（laborsurvey）を既存として使う
const reuse = { topic: s, nodes: {}, edges: [] };
const bad = { topic: Object.assign({}, s, { questions: s.questions.slice(0, 3) }), nodes: {}, edges: [] };

// ---- 偽の Anthropic API ----
const calls = [];
let mode = {};
const mock = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
    const body = JSON.parse(raw);
    const sys = typeof body.system === 'string' ? body.system : body.system.map(b => b.text).join('\n');
    const kind = sys.includes('編集者') ? 'select' : sys.includes('品質検査員') ? 'verify' : 'generate';
    calls.push({ kind, body, headers: req.headers });
    let out;
    if (kind === 'select') out = { picks: [{ index: 0, reason: '労働市場の基礎になる' }, { index: 1, reason: '制度の話' }] };
    else if (kind === 'verify') out = { checks: [['source', 1], ['facts_grounded', mode.failVerify ? 0 : 1], ['fact_vs_interpretation', 1], ['unique_answer', 1], ['natural_distractors', 1], ['neutrality', 1], ['background_accuracy', 1], ['quality', 1], ['copyright', 1]].map(([id, ok]) => ({ id, ok: !!ok, note: ok ? '問題なし' : '出典にない数字がある' })), summary: 'まとめ' };
    else out = calls.filter(c => c.kind === 'generate').length === 1 && mode.badFirst ? bad : mode.reuse ? reuse : good;
    const text = JSON.stringify(out);
    const base = { id: 'msg', type: 'message', role: 'assistant', model: body.model, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
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
function run(today) {
  calls.length = 0;
  return new Promise(resolve => {
    const env = { ...process.env, ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + mock.address().port, SOURCES_FILE: sources, CONTENT_DIR: contentDir, LOG_DIR: logDir, TODAY: today, MOCK_WEB_DIR: web };
    // 偽 API へのリクエストを受けるため、子プロセスは非同期に動かす
    import('node:child_process').then(({ spawn }) => {
      const p = spawn(process.execPath, ['--import', path.join(ROOT, 'tools/content/test-fetch-mock.mjs'), path.join(ROOT, 'tools/content/daily.mjs')], { env });
      let out = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
      p.on('close', code => resolve({ code, out }));
    });
  });
}

try {
  // フィードの読み取り（RSS 1.0 / Atom も）
  const rdf = parseFeed('<rdf:RDF xmlns:rdf="x" xmlns:dc="y"><item rdf:about="https://a.test/1"><title>RDFの記事</title><link>https://a.test/1</link><dc:date>2026-10-09T10:00:00+09:00</dc:date></item></rdf:RDF>', { name: 'R', type: '公的機関' });
  check(rdf.length === 1 && rdf[0].title === 'RDFの記事' && rdf[0].date.startsWith('2026-10-09'), 'RSS 1.0 を読めない: ' + JSON.stringify(rdf));
  const atom = parseFeed('<feed><entry><title>Atomの記事</title><link rel="alternate" href="https://a.test/2"/><updated>2026-10-09T01:00:00Z</updated></entry></feed>', { name: 'T', type: '公的機関' });
  check(atom.length === 1 && atom[0].link === 'https://a.test/2', 'Atom を読めない: ' + JSON.stringify(atom));

  // 1日目：最初の生成は形式不備 → 直させて合格 → 配信
  mode = { badFirst: true };
  let r = await run('2026-10-10');
  check(r.code === 0, '1日目が失敗: ' + r.out);
  const bundle = JSON.parse(fs.readFileSync(path.join(contentDir, 'daily', '2026-10-10.json'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(contentDir, 'index.json'), 'utf8'));
  check(bundle.topic.id === 'n20261010' && bundle.topic.questions.every((q, i) => q.id === 'n20261010-' + (i + 1)), 'id の付け方');
  check(bundle.topic.sources[0].url === 'https://news.test/release1.html' && bundle.topic.updated === '2026-10-10' && /^\d{4}-\d{2}-\d{2}$/.test(bundle.topic.date), '出典・日付');
  check(A.validateTopic(bundle.topic, { nodes: Object.assign({}, A.NODES, bundle.nodes), cats: A.MAP_CATS, rels: A.REL_LABEL, skills: A.SKILLS, newNodes: bundle.nodes, newEdges: bundle.edges }).length === 0, '保存された教材が形式チェックに合格しない');
  check(index.items.length === 1 && index.items[0].file === 'daily/2026-10-10.json' && index.items[0].links[0] === 'https://news.test/release1.html', 'index.json');
  check(calls.filter(c => c.kind === 'generate').length === 2, '形式不備のとき直させていない');
  const gen = calls.find(c => c.kind === 'generate').body;
  check(gen.model === 'claude-opus-5-5' && gen.stream === true && gen.output_config.effort === 'high', '生成のモデル・設定');
  check(gen.messages[0].content[0].type === 'document' && gen.messages[0].content[0].source.data.includes('企業の78%') && !gen.messages[0].content[0].source.data.includes('メニュー'), '出典の本文が渡っていない（またはメニューが混ざっている）');
  check(gen.system[0].cache_control && gen.system[0].text.includes('ai-agent-hiring'), 'サンプル3テーマをお手本として渡していない');
  const ver = calls.find(c => c.kind === 'verify');
  check(ver && ver.body.output_config.format.type === 'json_schema' && ver.body.messages[0].content[0].type === 'document', '品質検査が出典つきで行われていない');
  check(String(ver.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01') && ver.body.fallbacks === 'default', 'フォールバック設定');
  check(!fs.existsSync(path.join(logDir, 'rejected.json')), '合格なのに不合格の記録がある');
  check(r.out.includes('壊れた情報源：取得失敗'), '取得に失敗した情報源の記録がない');

  // 同じ日に2回動いても作り直さない
  r = await run('2026-10-10');
  check(r.code === 0 && calls.length === 0 && r.out.includes('すでにあります'), '同じ日の再実行で二重に作っている');

  // 2日目：品質検査で不合格 → 破棄。1日目に使った記事は候補から外れる
  mode = { failVerify: true, reuse: true };
  r = await run('2026-10-11');
  check(r.code === 0, '2日目が異常終了: ' + r.out);
  check(!fs.existsSync(path.join(contentDir, 'daily', '2026-10-11.json')), '不合格の教材が保存されている');
  const rej = JSON.parse(fs.readFileSync(path.join(logDir, 'rejected.json'), 'utf8'));
  check(rej.length === 1 && rej[0].url === 'https://news.test/release2.html' && rej[0].reasons[0].includes('facts_grounded'), '不合格の記録: ' + JSON.stringify(rej));
  check(JSON.parse(fs.readFileSync(path.join(contentDir, 'index.json'), 'utf8')).items.length === 1, '不合格なのに index が増えた');
  const sel = calls.find(c => c.kind === 'select');
  check(sel && !sel.body.messages[0].content.includes('労働市場の動向調査の結果') && sel.body.messages[0].content.includes('人材育成支援'), '使った記事が候補に残っている');
} finally {
  mock.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failures.length) { console.error('NG\n' + failures.join('\n')); process.exit(1); }
console.log('OK: 教材づくりのテストに合格しました');
