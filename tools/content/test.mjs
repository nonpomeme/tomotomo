// 毎日の教材づくりの自動テスト。本物の情報源・Anthropic API は使わない。
// 使い方: node tools/content/test.mjs
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadApp, ROOT } from './load-app.mjs';
import { parseFeed } from './collect.mjs';
import { CHECKS } from './prompts.mjs';

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
<item><title>求人広告の新料金プランを発表</title><link>https://news.test/release3.html</link><pubDate>${now}</pubDate><description>応募課金型のプランを追加</description></item>
<item><title>包装フィルムのリサイクル基準を共同策定</title><link>https://news.test/release4.html</link><pubDate>${now}</pubDate><description>リサイクル評価の共通基準</description></item>
<item><title>古いお知らせ</title><link>https://news.test/old.html</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
</channel></rss>`);
const article = '<html><head><meta charset="utf-8"></head><body><nav>メニュー</nav><main><h1>労働市場の動向調査</h1>' + '<p>本調査によると、企業の78%が人手不足を感じており、採用活動にAIを活用する企業は前年の2倍に増えた。調査は全国の企業1,000社を対象に実施した。</p>'.repeat(8) + '</main><footer>著作権表示</footer></body></html>';
fs.writeFileSync(path.join(web, 'news.test', 'release1.html'), article);
fs.writeFileSync(path.join(web, 'news.test', 'release2.html'), article.replace('労働市場の動向調査', '人材育成支援の新制度'));
fs.writeFileSync(path.join(web, 'news.test', 'release3.html'), article.replace('労働市場の動向調査', '求人広告の新料金プラン'));
const sources = path.join(tmp, 'sources.json');
fs.writeFileSync(sources, JSON.stringify({ feeds: [{ name: 'テスト省', type: '公的機関', url: 'https://feeds.test/rss.xml' }, { name: '壊れた情報源', type: '公的機関', url: 'https://feeds.test/missing.xml' }] }));
const tracksFile = path.join(tmp, 'tracks.json');
const realTracks = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/content/tracks.json'), 'utf8'));
fs.writeFileSync(tracksFile, JSON.stringify({
  audience: '社会人', roles: realTracks.roles, research_domains: ['go.jp', 'example.co.jp'],
  schedule: { 0: 'hr', 1: 'hr', 2: 'hr', 3: 'hr', 4: 'hr', 5: 'hr', 6: 'hr' },
  tracks: {
    hr: { label: '採用・人材ビジネス', focus: '求人媒体の課金モデル', keywords: ['求人', '採用'], curriculum: ['求人媒体の課金モデルの仕組み', '人材紹介の手数料体系'] },
    economy: { label: '経済・金融・統計', focus: '統計の読み方', keywords: ['調査', '人材育成'], curriculum: [] }
  }
}));
// 調査で「開いた」ページ。最後の2つは使えない（開いていない／許可していないサイト）
const R = ['https://www.mhlw.go.jp/a', 'https://www.mhlw.go.jp/b', 'https://www.stat.go.jp/c', 'https://www.example.co.jp/ir/d'];
const notes = R.map((url, i) => ({ fact: '確かめた事実その' + (i + 1) + '：2026年9月時点で、求人倍率は1.2倍だった。', url, source: '厚生労働省 資料' + (i + 1), type: '公的機関' }))
  .concat([{ fact: '開いていないページの事実（使ってはいけない）', url: 'https://www.mhlw.go.jp/notopened', source: 'x', type: '公的機関' }, { fact: '許可していないサイトの事実（使ってはいけない）', url: 'https://blog.test/x', source: 'ブログ', type: '公的機関' }]);

// ---- 生成結果のお手本（サンプル1を配信形式に直したもの） ----
const s = JSON.parse(JSON.stringify(A.TOPICS[0]));
['id', 'kind', 'date', 'updated', 'sources'].forEach(k => delete s[k]);
s.s3[0].label = '事実';
s.apply.roles = { consultant: '顧客に応募課金と掲載課金の費用比較を示す', media_sales: '応募単価の目安を添えて新プランを提案する', agency: '求人企業に紹介手数料との費用差を説明する', inhouse: '自社の応募単価を算出してプランを見直す', executive: '採用費を応募単価と採用単価で管理する' };
s.nodes = s.nodes.slice(0, 5).concat(['laborsurvey']);
const refs = [R[0], R[2], 'https://fake.test/hallucinated'];
const good = { topic: s, nodes: { laborsurvey: { name: '労働市場調査', cat: '経済', sub: '労働', diff: 2 } }, edges: [['laborsurvey', 'labor', 'related', 0.7]], references: refs };
// 2日目以降は、前日に増えたノード（laborsurvey）を既存として使う
const reuse = { topic: s, nodes: {}, edges: [], references: refs };
const bad = { topic: Object.assign({}, s, { questions: s.questions.slice(0, 3) }), nodes: {}, edges: [] };

// ---- 偽の Anthropic API ----
const calls = [];
let mode = {};
const mock = http.createServer((req, res) => {
  let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
    const body = JSON.parse(raw);
    const sys = typeof body.system === 'string' ? body.system : body.system.map(b => b.text).join('\n');
    const kind = sys.includes('編集者') ? 'select' : sys.includes('品質検査員') ? 'verify' : sys.includes('調査員') ? 'research' : 'generate';
    calls.push({ kind, body, headers: req.headers });
    const base = { id: 'msg', type: 'message', role: 'assistant', model: body.model, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    if (kind === 'research') {
      // 1回目は検索の途中で一時停止（pause_turn）、2回目で資料を開いて調査メモを返す
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (body.messages.length === 1) return res.end(JSON.stringify({ ...base, stop_reason: 'pause_turn', content: [
        { type: 'server_tool_use', id: 'st1', name: 'web_search', input: { query: '求人倍率' } },
        { type: 'web_search_tool_result', tool_use_id: 'st1', content: R.map(url => ({ type: 'web_search_result', url, title: 't', encrypted_content: 'x', page_age: null })) }] }));
      const fetchedBlocks = R.concat(['https://blog.test/x']).flatMap((url, i) => [
        { type: 'server_tool_use', id: 'f' + i, name: 'web_fetch', input: { url } },
        { type: 'web_fetch_tool_result', tool_use_id: 'f' + i, content: { type: 'web_fetch_result', url, retrieved_at: null, content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: '資料' } } } }]);
      return res.end(JSON.stringify({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: '資料を開いて確かめます。{途中の文}' }].concat(fetchedBlocks, [{ type: 'text', text: JSON.stringify({ notes: mode.fewNotes ? notes.slice(0, 2) : notes, gaps: 'なし' }) }]) }));
    }
    let out;
    if (kind === 'select') out = mode.noPicks ? { picks: [] } : { picks: [{ index: 0, track: 'hr', reason: '媒体の課金モデルを学べる' }, { index: 1, track: 'economy', reason: '市場データ' }] };
    else if (kind === 'verify') out = { checks: CHECKS.map(([id]) => { const ok = !(mode.failVerify && id === 'expertise'); return { id, ok, note: ok ? '問題なし' : '一般論にとどまっている' }; }), summary: 'まとめ' };
    else out = calls.filter(c => c.kind === 'generate').length === 1 && mode.badFirst ? bad : mode.reuse ? reuse : good;
    const text = JSON.stringify(out);
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

const contentDir = path.join(tmp, 'content'), logDir = path.join(tmp, 'log'), candFile = path.join(tmp, 'cache', 'candidates.json');
function run(today, args = [], extra = {}) {
  calls.length = 0;
  return new Promise(resolve => {
    const env = { ...process.env, ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'http://127.0.0.1:' + mock.address().port, SOURCES_FILE: sources, TRACKS_FILE: tracksFile, CONTENT_DIR: contentDir, LOG_DIR: logDir, TODAY: today, MOCK_WEB_DIR: web, CANDIDATES_FILE: candFile, ...extra };
    // 偽 API へのリクエストを受けるため、子プロセスは非同期に動かす
    import('node:child_process').then(({ spawn }) => {
      const p = spawn(process.execPath, ['--import', path.join(ROOT, 'tools/content/test-fetch-mock.mjs'), path.join(ROOT, 'tools/content/daily.mjs'), ...args], { env });
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

  // 候補の収集だけ（1日に何回か）：あとでフィードから消えても候補として残る
  const feedFile = path.join(web, 'feeds.test', 'rss.xml');
  const feedXml = fs.readFileSync(feedFile, 'utf8');
  fs.writeFileSync(feedFile, feedXml.replace('</channel>', `<item><title>新卒採用の早期化に関する調査</title><link>https://news.test/early.html</link><pubDate>${now}</pubDate></item></channel>`));
  let r = await run('2026-10-10', ['--collect']);
  check(r.code === 0 && calls.length === 0 && fs.existsSync(candFile), '候補の収集だけのモードが動かない: ' + r.out);
  fs.writeFileSync(feedFile, feedXml);

  // 1日目（土曜＝採用手法・媒体の日）：最初の生成は形式不備 → 直させて合格 → 配信
  mode = { badFirst: true };
  r = await run('2026-10-10');
  check(r.code === 0, '1日目が失敗: ' + r.out);
  const bundle = JSON.parse(fs.readFileSync(path.join(contentDir, 'daily', '2026-10-10.json'), 'utf8'));
  const index = JSON.parse(fs.readFileSync(path.join(contentDir, 'index.json'), 'utf8'));
  const sel1 = calls.find(c => c.kind === 'select').body;
  const list1 = sel1.messages[0].content;
  check(list1.indexOf('求人広告の新料金プラン') >= 0 && list1.indexOf('求人広告の新料金プラン') < list1.indexOf('労働市場の動向調査'), '今日のテーマ（媒体）に合う候補が先頭にない');
  check(!list1.includes('リサイクル基準'), '採用・人材と関係ない候補が除外されていない');
  check(list1.includes('新卒採用の早期化'), 'ためておいた候補が使われていない');
  check(sel1.system.includes('採用・人材ビジネス'), '選定に今日のテーマが伝わっていない');
  check(bundle.topic.track === 'hr' && bundle.topic.trackLabel === '採用・人材ビジネス' && bundle.topic.apply.roles.executive, 'テーマ・職種別の応用が保存されていない');
  // 調査：一時停止しても続きを頼み、開いた・許可したサイトの事実だけを使う
  const res1 = calls.filter(c => c.kind === 'research');
  check(res1.length === 2 && res1[1].body.messages.length === 2 && res1[0].body.model === 'claude-sonnet-5-5', '調査の一時停止（pause_turn）から続けていない');
  check(res1[0].body.tools.some(t => t.type === 'web_search_20260209' && t.allowed_domains.includes('go.jp')) && res1[0].body.tools.some(t => t.type === 'web_fetch_20260209'), '調査に検索・資料の読み込みとサイトの絞り込みが付いていない');
  const genNotes = calls.find(c => c.kind === 'generate').body.messages[0].content.find(b => b.type === 'text' && b.text.includes('調査メモ')).text;
  check(R.every(u => genNotes.includes(u)) && !genNotes.includes('notopened') && !genNotes.includes('blog.test'), '開いていない・許可していないサイトの事実が調査メモに入っている');
  check(bundle.topic.sources.length === 3 && bundle.topic.sources[1].url === R[0] && bundle.topic.sources[2].url === R[2] && !JSON.stringify(bundle.topic.sources).includes('fake.test'), '出典に調査の資料が入っていない（または架空のURLが入っている）: ' + JSON.stringify(bundle.topic.sources));
  // 4択の並びはランダム（正解の中身は変わらない）
  const orig = Object.fromEntries(s.questions.map((q, i) => [i, q]));
  const mcq = bundle.topic.questions.map((q, i) => [q, orig[i]]).filter(([q]) => q.options);
  check(mcq.every(([q, o]) => q.options[q.answer] === o.options[o.answer] && q.options.slice().sort().join() === o.options.slice().sort().join()), '並べ替えで正解が変わっている');
  check(bundle.topic.id === 'n20261010' && bundle.topic.questions.every((q, i) => q.id === 'n20261010-' + (i + 1)), 'id の付け方');
  check(bundle.topic.sources[0].url === 'https://news.test/release3.html' && bundle.topic.updated === '2026-10-10' && /^\d{4}-\d{2}-\d{2}$/.test(bundle.topic.date), '出典・日付');
  check(A.validateTopic(bundle.topic, { nodes: Object.assign({}, A.NODES, bundle.nodes), cats: A.MAP_CATS, rels: A.REL_LABEL, skills: A.SKILLS, newNodes: bundle.nodes, newEdges: bundle.edges }).length === 0, '保存された教材が形式チェックに合格しない');
  check(index.items.length === 1 && index.items[0].file === 'daily/2026-10-10.json' && index.items[0].links[0] === 'https://news.test/release3.html', 'index.json');
  check(calls.filter(c => c.kind === 'generate').length === 2, '形式不備のとき直させていない');
  const gen = calls.find(c => c.kind === 'generate').body;
  check(gen.model === 'claude-opus-5-5' && gen.stream === true && gen.output_config.effort === 'high', '生成のモデル・設定');
  check(gen.messages[0].content[2].text.includes('採用・人材ビジネス') && gen.messages[0].content[2].text.includes('apply.roles') && gen.messages[0].content[2].text.includes('検定試験'), '生成にテーマと職種別の指示が渡っていない');
  check(gen.messages[0].content[0].type === 'document' && gen.messages[0].content[0].source.data.includes('企業の78%') && !gen.messages[0].content[0].source.data.includes('メニュー'), '出典の本文が渡っていない（またはメニューが混ざっている）');
  check(gen.system[0].cache_control && gen.system[0].text.includes('ai-agent-hiring'), 'サンプル3テーマをお手本として渡していない');
  const ver = calls.find(c => c.kind === 'verify');
  check(ver && ver.body.output_config.format.type === 'json_schema' && ver.body.messages[0].content[0].type === 'document' && ver.body.messages[0].content[1].text.includes('調査メモ'), '品質検査が出典・調査メモつきで行われていない');
  check(ver.body.tools && ver.body.tools.some(t => t.type === 'web_fetch_20260209') && !ver.body.tools.some(t => t.type === 'web_search_20260209'), '品質検査で資料を開いて確かめられない');
  check(String(ver.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01') && ver.body.fallbacks === 'default', 'フォールバック設定');
  check(!fs.existsSync(path.join(logDir, 'rejected.json')), '合格なのに不合格の記録がある');
  check(r.out.includes('壊れた情報源：取得失敗'), '取得に失敗した情報源の記録がない');

  // 同じ日に2回動いても作り直さない
  r = await run('2026-10-10');
  check(r.code === 0 && calls.length === 0 && r.out.includes('すでにあります'), '同じ日の再実行で二重に作っている');

  // 作り直し：今日の教材を取り下げて、別の発表から作り直す（同じ発表は使わない）
  mode = {};
  r = await run('2026-10-10', [], { REDO: 'true' });
  const idx2 = JSON.parse(fs.readFileSync(path.join(contentDir, 'index.json'), 'utf8'));
  check(r.code === 0 && idx2.items.length === 1 && idx2.items[0].id === 'n20261010r1', '作り直しで新しい id にならない: ' + JSON.stringify(idx2.items) + r.out);
  check(idx2.items[0].links[0] !== 'https://news.test/release3.html' && idx2.retired.includes('https://news.test/release3.html'), '取り下げた発表をまた使っている');
  check(JSON.parse(fs.readFileSync(path.join(contentDir, 'daily', '2026-10-10.json'), 'utf8')).topic.id === 'n20261010r1', '作り直した教材が保存されていない');

  // 2日目：品質検査で不合格 → 破棄。1日目に使った記事は候補から外れる
  mode = { failVerify: true, reuse: true };
  r = await run('2026-10-11');
  check(r.code === 0, '2日目が異常終了: ' + r.out);
  check(!fs.existsSync(path.join(contentDir, 'daily', '2026-10-11.json')), '不合格の教材が保存されている');
  const rej = JSON.parse(fs.readFileSync(path.join(logDir, 'rejected.json'), 'utf8'));
  check(rej.length >= 1 && rej[0].reasons[0].includes('expertise'), '不合格の記録: ' + JSON.stringify(rej));
  check(JSON.parse(fs.readFileSync(path.join(contentDir, 'index.json'), 'utf8')).items.length === 1, '不合格なのに index が増えた');
  const sel = calls.find(c => c.kind === 'select');
  check(sel && !sel.body.messages[0].content.includes('求人広告の新料金プラン') && !sel.body.messages[0].content.includes('労働市場の動向調査の結果'), '使った記事が候補に残っている');

  // 3日目：良い発表がない → 専門知識の一覧から題材を選び、調査して教材にする
  mode = { noPicks: true, reuse: true };
  r = await run('2026-10-12');
  check(r.code === 0, '3日目が異常終了: ' + r.out);
  const b3 = JSON.parse(fs.readFileSync(path.join(contentDir, 'daily', '2026-10-12.json'), 'utf8'));
  const idx3 = JSON.parse(fs.readFileSync(path.join(contentDir, 'index.json'), 'utf8'));
  check(b3.topic.kind === '専門知識' && b3.topic.date === '2026-10-12' && b3.topic.sources.every(x => R.includes(x.url)), '専門知識の教材の出典・種類: ' + JSON.stringify(b3.topic.sources));
  check(idx3.curriculumDone.includes('求人媒体の課金モデルの仕組み') && idx3.items[0].links.length === 0, '扱った専門知識の題材が記録されていない');
  check(calls.find(c => c.kind === 'research').body.messages[0].content[0].text.includes('求人媒体の課金モデルの仕組み'), '専門知識の題材で調査していない');

  // 4日目：調査で確かめられた事実が少なすぎる → 書かずに破棄
  mode = { noPicks: true, reuse: true, fewNotes: true };
  r = await run('2026-10-13');
  check(r.code === 0 && !fs.existsSync(path.join(contentDir, 'daily', '2026-10-13.json')) && r.out.includes('少なすぎます') && !calls.some(c => c.kind === 'generate'), '調査が不十分なのに教材を作っている: ' + r.out);

  // 4択の正解の位置が偏らない（何日分かを合わせて確認）
  const pos = [0, 0, 0, 0];
  for (const f of fs.readdirSync(path.join(contentDir, 'daily'))) JSON.parse(fs.readFileSync(path.join(contentDir, 'daily', f), 'utf8')).topic.questions.forEach(q => { if (q.options) pos[q.answer]++; });
  check(pos.filter(n => n > 0).length >= 2, '正解の位置が偏っている: ' + pos);
} finally {
  mock.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failures.length) { console.error('NG\n' + failures.join('\n')); process.exit(1); }
console.log('OK: 教材づくりのテストに合格しました');
