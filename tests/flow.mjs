// 既存の操作フローが壊れていないかを確かめる自動テスト（ヘッドレスブラウザ）。
// ホーム → 学習 → クイズ → 思考問題 → 結果 → 知識マップ更新 → 次のおすすめ → 成長 を通しで操作する。
//
// 使い方:
//   npm test                         … リポジトリ直下のアプリを検査
//   node tests/flow.mjs <フォルダ>   … 別のフォルダ（分割前の index.html など）を検査
//   SNAP_OUT=out.json npm test       … 各画面のHTMLとlocalStorageを書き出す（分割前後の比較用）
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || path.join(here, '..');
const FIXED_TIME = new Date('2026-10-04T08:00:00+09:00');

const { server, url } = await serve(root);
const browser = await chromium.launch();
const snaps = {};
const failures = [];
let current = '';

function check(cond, msg) { if (!cond) failures.push('[' + current + '] ' + msg); }

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', colorScheme: 'light', viewport: { width: 400, height: 860 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  // 外部（Google Fonts など）には出ない。テストを安定させるため。
  await ctx.route(u => !u.href.startsWith(url) && !u.href.startsWith('data:'), r => r.abort());
  await page.clock.setFixedTime(FIXED_TIME);
  // 乱数を固定（紙吹雪などの演出のみが使用）
  await page.addInitScript(() => { let s = 42; Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; });
  if (opts.init) await page.addInitScript(opts.init);
  if (opts.route) await ctx.route(new URL('api/**', url).href, opts.route);
  return page;
}

async function snap(page, name) {
  const s = await page.evaluate(() => ({
    app: document.querySelector('#app').innerHTML,
    nav: document.querySelector('#nav').innerHTML,
    overlay: document.querySelector('#overlay').innerHTML,
    state: localStorage.getItem('tomotomo:v1')
  }));
  snaps[current + ' / ' + name] = s;
  return s;
}

const click = (page, sel) => page.locator(sel).first().click();
const has = async (page, sel) => (await page.locator(sel).count()) > 0;

async function onboard(page) {
  await page.goto(url);
  await snap(page, 'login');
  check(await has(page, '[data-a="login"][data-v="guest"]'), 'ログイン画面が表示されない');
  await click(page, '[data-a="login"][data-v="guest"]');
  await snap(page, 'ob0');
  await click(page, '[data-a="partnerPick"][data-v="dog"]');
  await click(page, '[data-a="partnerConfirm"]');
  await page.fill('input[data-f="profile.name"]', 'テスト');
  await click(page, '[data-a="pick"][data-k="occupation"][data-v="採用コンサルタント"]');
  await click(page, '[data-a="pick"][data-k="role"][data-v="リーダー"]');
  await snap(page, 'ob1');
  await click(page, '[data-a="obNext"]');
  await click(page, '[data-a="pick"][data-k="industry"][data-v="人材"]');
  await click(page, '[data-a="obNext"]');
  await click(page, '[data-a="toggleInterest"][data-v="AI"]');
  await click(page, '[data-a="toggleInterest"][data-v="採用"]');
  await click(page, '[data-a="obNext"]');
  await click(page, '[data-a="pick"][data-k="minutes"][data-v="15"]');
  await snap(page, 'ob4');
  await click(page, '[data-a="obNext"]');
  await snap(page, 'home');
  check(await has(page, '#nav [data-a="tab"]'), 'ホームのナビが表示されない');
}

// オーバーレイ内の学習を最後まで進める
async function runLesson(page, label, { thought = 'submit' } = {}) {
  const seen = new Set();
  for (let n = 0; n < 80; n++) {
    if (await page.locator('#overlay.hide').count()) break;
    const ov = '#overlay ';
    if (await has(page, ov + '[data-a="check"]')) {
      if (await page.locator(ov + '[data-a="check"]').isEnabled()) { seen.add('quiz'); await click(page, ov + '[data-a="check"]'); await snap(page, label + ' #' + n + ' checked'); continue; }
      if (await has(page, ov + '[data-a="order"]')) { await click(page, ov + '[data-a="order"]'); continue; }
      await click(page, ov + '[data-a="sel"]:not([disabled])'); continue;
    }
    if (await has(page, ov + '#thoughtText')) {
      seen.add('thought');
      if (thought === 'skip') { await click(page, ov + '[data-a="skipThought"]'); continue; }
      await page.fill(ov + '#thoughtText', 'まず採用の現場ではAIエージェントの導入で一次選考の工数が下がる。なぜなら書類確認が自動化されるからだ。一方で候補者体験の観点からは不安もあるので、例えば説明の透明性を高める施策が必要だと考える。');
      await click(page, ov + '[data-a="submitThought"]');
      await page.waitForSelector(ov + '.lesson-foot [data-a="next"]', { timeout: 15000 });
      await snap(page, label + ' thought-feedback');
      await click(page, ov + '.lesson-foot [data-a="next"]');
      continue;
    }
    if (await has(page, ov + '[data-a="toMapUpdate"]')) {
      seen.add('results');
      await snap(page, label + ' results');
      await click(page, ov + '[data-a="toMapUpdate"]');
      seen.add('mapupdate');
      await snap(page, label + ' mapupdate');
      continue;
    }
    if (await has(page, ov + '[data-a="next"]')) { await snap(page, label + ' #' + n); await click(page, ov + '[data-a="next"]'); continue; }
    if (await has(page, ov + '[data-a="closeOverlay"]')) { await click(page, ov + '[data-a="closeOverlay"]'); continue; }
    throw new Error(label + ': 進めるボタンが見つかりません');
  }
  return seen;
}

async function tabs(page, label) {
  for (const t of ['map', 'learn', 'growth', 'more', 'home']) {
    await click(page, '#nav [data-a="tab"][data-v="' + t + '"]');
    await page.waitForTimeout(50);
    const s = await snap(page, label + ' tab-' + t);
    check(s.app.includes('<main class="screen">'), t + ' タブが表示されない');
  }
}

async function chat(page, label, { waitText } = {}) {
  await click(page, '[data-a="news"]');
  await snap(page, label + ' news');
  await click(page, '#overlay [data-a="chat"]');
  await click(page, '#overlay [data-a="chatPreset"]');
  await page.waitForFunction(() => !document.querySelector('#chatInput').disabled, null, { timeout: 15000 });
  const s = await snap(page, label + ' chat-answer');
  if (waitText) check(s.overlay.includes(waitText), 'チャットの回答に「' + waitText + '」が含まれない');
  await click(page, '#overlay [data-a="closeChat"]');
  await click(page, '#overlay [data-a="closeOverlay"]');
}

async function scenario(name, fn, opts) {
  current = name;
  const page = await newPage(opts);
  try { await fn(page); } catch (e) { failures.push('[' + name + '] ' + e.message.split('\n')[0]); }
  check(page.errors.length === 0, 'ページでエラー: ' + page.errors.join(' | '));
  await page.context().close();
}

// 1. 簡易AI（オフライン）で一通り
await scenario('offline', async page => {
  await onboard(page);
  await click(page, '[data-a="start"]');
  const seen = await runLesson(page, 'lesson1');
  for (const k of ['quiz', 'thought', 'results', 'mapupdate']) check(seen.has(k), '学習フローで「' + k + '」に到達しない');
  const st = JSON.parse(await page.evaluate(() => localStorage.getItem('tomotomo:v1')));
  check(st.xp > 0, 'XP が増えていない');
  check(Object.keys(st.nodes).length > 0, '知識マップが更新されていない');
  check(st.thoughtCount === 1, '思考問題の回数が記録されていない');
  await snap(page, 'home-after');
  await tabs(page, 'after');
  // 2回目（次のおすすめ）は思考問題をスキップ
  await click(page, '[data-a="start"]');
  await runLesson(page, 'lesson2', { thought: 'skip' });
  await chat(page, 'offline');
  // 再読み込みしても状態が残る
  await page.reload();
  const s = await snap(page, 'reloaded');
  check(s.app.includes('<main class="screen">'), '再読み込み後にホームが表示されない');
  check(JSON.parse(s.state).xp > st.xp, '2回目の学習のXPが保存されていない');
});

// 2. claude.ai 上で動く場合（window.claude をまねる）
const claudeMock = () => {
  const sample = async (turns, o) => { const text = 'モックAIの回答です。' + turns.length; if (o && o.onText) o.onText({ text }); return { text }; };
  sample.json = async () => ({ scores: { logic: 4, concrete: 3, multi: 5, evidence: 2, practical: 4, verbal: 3 }, good: 'モック良い点', improve: 'モック改善点', next: 'モック次の問い' });
  window.claude = { use: name => name === 'sample' ? Promise.resolve(sample) : Promise.reject(new Error('n/a')) };
};
await scenario('claude-host', async page => {
  await onboard(page);
  await click(page, '[data-a="start"]');
  await runLesson(page, 'lesson1');
  const fb = Object.entries(snaps).find(([k]) => k.startsWith('claude-host / lesson1 thought-feedback'));
  check(fb && fb[1].overlay.includes('モック良い点') && fb[1].overlay.includes('AI評価'), 'claude.ai のAI採点が使われていない');
  await chat(page, 'claude', { waitText: 'モックAIの回答です。' });
}, { init: claudeMock });

// 3. バックエンド（/api/feedback, /api/chat）がある場合 … 分割後のみ
const aiFile = path.join(root, 'src', 'ai.js');
const isNew = fs.existsSync(aiFile) && fs.readFileSync(aiFile, 'utf8').includes('tomotomo:ai');
if (isNew) {
  const calls = [];
  await scenario('backend', async page => {
    await onboard(page);
    await page.evaluate(base => localStorage.setItem('tomotomo:ai', JSON.stringify({ apiBase: base, token: 'test-pass' })), new URL('api', url).href);
    await page.reload();
    await click(page, '[data-a="start"]');
    await runLesson(page, 'lesson1');
    const fb = Object.entries(snaps).find(([k]) => k.startsWith('backend / lesson1 thought-feedback'));
    check(fb && fb[1].overlay.includes('バックエンド良い点'), 'バックエンドのAI採点が使われていない');
    await chat(page, 'backend', { waitText: 'バックエンドの回答です。' });
    check(calls.some(c => c.path.endsWith('/api/feedback') && c.auth === 'Bearer test-pass'), '/api/feedback に合言葉付きで送られていない');
    check(calls.some(c => c.path.endsWith('/api/chat')), '/api/chat が呼ばれていない');
    const fbReq = calls.find(c => c.path.endsWith('/api/feedback'));
    check(fbReq && fbReq.body.answer && fbReq.body.topic && fbReq.body.question, '/api/feedback のリクエスト形式が不正');
  }, {
    route: async r => {
      const req = r.request();
      calls.push({ path: new URL(req.url()).pathname, auth: req.headers()['authorization'], body: req.postDataJSON() });
      if (req.url().endsWith('/feedback')) return r.fulfill({ json: { scores: { logic: 5, concrete: 4, multi: 3, evidence: 2, practical: 1, verbal: 5 }, good: 'バックエンド良い点', improve: 'バックエンド改善点', next: '次の問い' } });
      return r.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: 'バックエンドの回答です。' });
    }
  });

  // 4. バックエンドが落ちていたら簡易AIにフォールバック
  await scenario('backend-down', async page => {
    await onboard(page);
    await page.evaluate(base => localStorage.setItem('tomotomo:ai', JSON.stringify({ apiBase: base, token: 'x' })), new URL('api', url).href);
    await page.reload();
    await click(page, '[data-a="start"]');
    await runLesson(page, 'lesson1');
    const fb = Object.entries(snaps).find(([k]) => k.startsWith('backend-down / lesson1 thought-feedback'));
    check(fb && fb[1].overlay.includes('簡易評価'), 'バックエンド停止時に簡易AIへフォールバックしない');
    await chat(page, 'down');
  }, { route: r => r.fulfill({ status: 503, body: 'down' }) });
}

await browser.close();
server.close();
if (process.env.SNAP_OUT) fs.writeFileSync(process.env.SNAP_OUT, JSON.stringify(snaps, null, 1));
if (failures.length) { console.error('NG\n' + failures.join('\n')); process.exit(1); }
console.log('OK: ' + Object.keys(snaps).length + ' 画面を確認しました');
