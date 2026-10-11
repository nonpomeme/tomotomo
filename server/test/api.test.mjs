// サーバーの自動テスト。本物の Anthropic API は呼ばず、偽の API サーバーを立てて wrangler dev で動かす。
// 使い方: cd server && npm test
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PASS = 'test-passphrase';
const ORIGIN = 'http://app.test';
const DAILY = 5;
const calls = [];
const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

// ---- 偽の Anthropic API ----
const mock = http.createServer((req, res) => {
  let raw = '';
  req.on('data', c => raw += c);
  req.on('end', () => {
    const body = JSON.parse(raw);
    calls.push({ headers: req.headers, body });
    const base = { id: 'msg_1', type: 'message', role: 'assistant', model: body.model, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } };
    if (!body.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ scores: { logic: 4, concrete: 9, multi: 3, evidence: 2, practical: 5, verbal: 0 }, good: '良い点', improve: '改善点', next: '次の問い' }) }] }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (type, data) => res.write('event: ' + type + '\ndata: ' + JSON.stringify({ type, ...data }) + '\n\n');
    send('message_start', { message: { ...base, content: [], stop_reason: null } });
    send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    for (const t of ['こんにちは。', 'これは', 'ストリーミングです。']) send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: t } });
    send('content_block_stop', { index: 0 });
    send('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } });
    send('message_stop', {});
    res.end();
  });
});
await new Promise(r => mock.listen(0, '127.0.0.1', r));
const mockUrl = 'http://127.0.0.1:' + mock.address().port;

// ---- wrangler dev ----
const port = 8787 + Math.floor(Math.random() * 1000);
const persist = fs.mkdtempSync(path.join(os.tmpdir(), 'tomotomo-api-'));
const vars = { ANTHROPIC_API_KEY: 'sk-test', APP_PASSPHRASE: PASS, ANTHROPIC_BASE_URL: mockUrl, ALLOWED_ORIGINS: ORIGIN, DAILY_LIMIT: String(DAILY), PER_MINUTE_LIMIT: '100' };
const wr = spawn('npx', ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', persist, ...Object.entries(vars).flatMap(([k, v]) => ['--var', k + ':' + v])], { cwd: path.join(import.meta.dirname, '..'), env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
let log = '';
wr.stdout.on('data', d => log += d); wr.stderr.on('data', d => log += d);
const api = 'http://127.0.0.1:' + port + '/api';
for (let i = 0; ; i++) {
  try { await fetch(api + '/health'); break; } catch (e) { if (i > 120) { console.error(log); throw new Error('wrangler dev が起動しません'); } await new Promise(r => setTimeout(r, 500)); }
}

const H = { 'Content-Type': 'application/json', Origin: ORIGIN, Authorization: 'Bearer ' + PASS };
const post = (p, body, h = H) => fetch(api + p, { method: 'POST', headers: h, body: JSON.stringify(body) });
const topic = { id: 't1', title: 'AIエージェントと採用', summary: '要点です', causal: ['A', 'B', 'C'] };
const profile = { occupation: '採用コンサルタント', industry: '人材' };
const partner = { name: 'イヌ', voice: '明るく元気に' };

try {
  // 認証
  let r = await fetch(api + '/health');
  check(r.status === 401, '合言葉なしは 401 になるべき: ' + r.status);
  r = await fetch(api + '/health', { headers: { Authorization: 'Bearer wrong' } });
  check(r.status === 401, '合言葉違いは 401 になるべき: ' + r.status);
  r = await fetch(api + '/health', { headers: H });
  const h = await r.json();
  check(r.status === 200 && h.remaining === DAILY && h.model === 'claude-sonnet-5-5', 'health: ' + r.status + ' ' + JSON.stringify(h));
  check(r.headers.get('access-control-allow-origin') === ORIGIN, '許可オリジンに CORS ヘッダーが付くべき');

  // CORS
  r = await fetch(api + '/feedback', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } });
  check(r.status === 204 && r.headers.get('access-control-allow-headers').includes('Authorization'), 'プリフライト: ' + r.status);
  r = await fetch(api + '/health', { headers: { ...H, Origin: 'https://evil.example' } });
  check(r.status === 403 && !r.headers.get('access-control-allow-origin'), '他サイトからは 403 になるべき: ' + r.status);

  // 採点
  r = await post('/feedback', { topic, question: { variant: 'think', text: '問いです' }, answer: 'ユーザーの回答です。', profile, partner });
  const fb = await r.json();
  check(r.status === 200, 'feedback: ' + r.status + ' ' + JSON.stringify(fb));
  check(JSON.stringify(fb.scores) === JSON.stringify({ logic: 4, concrete: 5, multi: 3, evidence: 2, practical: 5, verbal: 1 }), '点数は1〜5に収めるべき: ' + JSON.stringify(fb.scores));
  check(fb.good === '良い点' && fb.next === '次の問い', 'feedback の本文');
  const c1 = calls.at(-1);
  check(c1.headers['x-api-key'] === 'sk-test', 'APIキーが送られていない');
  check(String(c1.headers['anthropic-beta']).includes('server-side-fallback-2026-07-01') && c1.body.fallbacks === 'default', 'フォールバック設定');
  check(c1.body.model === 'claude-sonnet-5-5' && c1.body.output_config.format.type === 'json_schema' && c1.body.output_config.effort === 'medium', 'feedback のリクエスト: ' + JSON.stringify(c1.body.output_config));
  check(c1.body.system.includes('イヌ') && c1.body.messages[0].content.includes('<answer>\nユーザーの回答です。'), 'プロンプトの組み立て');

  // 対話（ストリーミング）
  r = await post('/chat', { topic, profile, partner, messages: [{ role: 'user', content: '反対意見は？' }, { role: 'assistant', content: '…' }, { role: 'user', content: 'もっと詳しく' }] });
  const text = await r.text();
  check(r.status === 200 && r.headers.get('content-type').startsWith('text/plain'), 'chat: ' + r.status);
  check(text === 'こんにちは。これはストリーミングです。', 'chat の本文: ' + text);
  const c2 = calls.at(-1);
  check(c2.body.stream === true && c2.body.messages.length === 3 && c2.body.system.includes('A→B→C') && c2.body.output_config.effort === 'low', 'chat のリクエスト');

  // 入力チェック
  r = await post('/chat', { topic, profile, partner, messages: [] });
  check(r.status === 400, '空のメッセージは 400: ' + r.status);
  r = await post('/feedback', { topic: { title: '' }, answer: 'x' });
  check(r.status === 400, 'テーマなしは 400: ' + r.status);

  // 1日の上限（ここまでで 4 回使用）
  r = await post('/feedback', { topic, question: { text: '問い' }, answer: '回答', profile, partner });
  check(r.status === 200, '5回目は使えるべき: ' + r.status);
  r = await post('/feedback', { topic, question: { text: '問い' }, answer: '回答', profile, partner });
  check(r.status === 429 && (await r.json()).error.includes('上限'), '6回目は 429 になるべき: ' + r.status);
  r = await fetch(api + '/health', { headers: H });
  check((await r.json()).remaining === 0, '残り回数は 0');

  // 合言葉なしのアクセス（ブラウザでの動作確認）は何回あっても締め出さない
  for (let i = 0; i < 12; i++) await fetch(api + '/health');
  r = await fetch(api + '/health', { headers: H });
  check(r.status === 200, '合言葉なしのアクセスで締め出されてはいけない: ' + r.status);

  // 合言葉の総当たり対策（違う合言葉が10回で締め出し）
  for (let i = 0; i < 10; i++) await fetch(api + '/health', { headers: { Authorization: 'Bearer wrong' + i } });
  r = await fetch(api + '/health', { headers: H });
  check(r.status === 429, '失敗が続いたら正しい合言葉でも締め出すべき: ' + r.status);
} finally {
  wr.kill();
  mock.close();
  fs.rmSync(persist, { recursive: true, force: true });
}

if (failures.length) { console.error('NG\n' + failures.join('\n')); process.exit(1); }
console.log('OK: サーバーのテストに合格しました');
process.exit(0);
