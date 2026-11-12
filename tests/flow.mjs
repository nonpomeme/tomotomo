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
// CHROMIUM_PATH：手元の Chromium を使うとき（Playwright のブラウザを別に入れている環境など）
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const snaps = {};
const failures = [];
let current = '';

function check(cond, msg) { if (!cond) failures.push('[' + current + '] ' + msg); }

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo', colorScheme: 'light', viewport: { width: 400, height: 860 }, serviceWorkers: opts.sw ? 'allow' : 'block' });
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
  if (opts.content) await ctx.route(new URL('content/**', url).href, opts.content);
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
  await click(page, '[data-a="toggleInterest"][data-v="チーム"]');
  await click(page, '[data-a="toggleInterest"][data-v="組織変革"]');
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
      await page.fill(ov + '#thoughtText', 'まずチームで心理的安全性が低いと、ミスの報告が遅れる。なぜなら報告すると評価が下がると感じるからだ。一方でリーダーの観点からは基準を下げる不安もあるので、例えば報告を受けたときの最初の反応を決めておく施策が必要だと考える。');
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
    // 「その他」タブで接続先と合言葉を設定する（最初は合言葉を間違える）
    await click(page, '#nav [data-a="tab"][data-v="more"]');
    check(await has(page, '[data-a="aiSave"]'), 'AIサーバーの設定欄がない');
    await page.fill('#aiBase', url);
    await page.fill('#aiToken', 'wrong');
    await click(page, '[data-a="aiSave"]');
    await page.waitForFunction(() => /⚠️/.test(document.querySelector('#aiMsg').textContent));
    check((await page.textContent('#aiMsg')).includes('合言葉が違います'), '合言葉違いが表示されない');
    await page.fill('#aiToken', 'test-pass');
    await click(page, '[data-a="aiSave"]');
    await page.waitForFunction(() => /接続できました/.test(document.querySelector('#aiMsg').textContent));
    await snap(page, 'ai-settings');
    check((await page.textContent('#aiMsg')).includes('あと 42 回'), '残り回数が表示されない');
    await page.reload();
    await click(page, '#nav [data-a="tab"][data-v="home"]');
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
      const auth = req.headers()['authorization'];
      calls.push({ path: new URL(req.url()).pathname, auth, body: req.method() === 'POST' ? req.postDataJSON() : null });
      if (auth !== 'Bearer test-pass') return r.fulfill({ status: 401, json: { error: '合言葉が違います' } });
      if (req.url().endsWith('/health')) return r.fulfill({ json: { ok: true, remaining: 42 } });
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

// 6. 毎日の配信教材（GitHub Actions が作ったもの）を受け取って学べる
if (fs.existsSync(path.join(root, 'src', 'content.js'))) {
  const { loadApp } = await import('../tools/content/load-app.mjs');
  const A = loadApp();
  const t = JSON.parse(JSON.stringify(A.TOPICS[0]));
  Object.assign(t, { id: 'n20261004', title: 'チームの効果性の研究（配信テスト）', unit: 'u6-2', chapter: 'ch6', date: '2026-10-03', updated: '2026-10-04',
    sources: [{ name: 'テスト社', type: '企業公式', url: 'https://example.co.jp/release', rank: 'C' }], note: 'テスト省の公式発表をもとにAIが作成した教材です。' });
  // 根拠と信頼度ランク（出典が C だけなので「トレンド（参考）」と表示される）
  t.s3 = t.s3.map(b => Object.assign({}, b, { evidence: [{ name: 'テスト社 調査', url: 'https://example.co.jp/survey', rank: 'C' }] }));
  t.s3[0].label = '事実';
  t.trackLabel = '第6章 チーム';
  t.apply.roles = { consultant: '顧客に応募課金と掲載課金の費用比較を示す', media_sales: '応募単価の目安を添えて新プランを提案する', agency: '求人企業に紹介手数料との費用差を説明する', inhouse: '自社の応募単価を算出してプランを見直す', executive: '採用費を応募単価と採用単価で管理する' };
  t.nodes = t.nodes.slice(0, 5).concat(['laborsurvey']);
  t.questions = t.questions.map((q, i) => Object.assign({}, q, { id: 'n20261004-' + (i + 1), evidence: [{ name: '厚生労働省 一般職業紹介状況', url: 'https://www.mhlw.go.jp/toukei/list/114-1.html', rank: 'A', published: '2026-09' }] }));
  const bundle = { version: 1, date: '2026-10-04', topic: t, nodes: { laborsurvey: { name: '労働市場調査', cat: '人と仕事', sub: '定着', diff: 2 } }, edges: [['laborsurvey', 'turnover', 'related', 0.7], ['laborsurvey', 'engage', 'related', 0.5]] };
  const broken = { version: 1, date: '2026-10-03', topic: Object.assign({}, t, { id: 'n20261003', questions: [] }), nodes: {}, edges: [] };
  const files = {
    'index.json': { version: 1, items: [{ date: '2026-10-04', id: 'n20261004', title: t.title, file: 'daily/2026-10-04.json' }, { date: '2026-10-03', id: 'n20261003', title: '壊れた教材', file: 'daily/2026-10-03.json' }] },
    'daily/2026-10-04.json': bundle, 'daily/2026-10-03.json': broken,
    'curriculum.json': JSON.parse(fs.readFileSync(path.join(root, 'content', 'curriculum.json'), 'utf8')),
    // 週1回のトレンド追記（マージ済み）。章に「最新トレンド（参考）」として出る
    'trends.json': { version: 1, items: [{ id: 'tr-test', chapter: 'ch6', kind: '研究', title: 'チーム研究のテスト追記', summary: 'テスト用のトレンド項目です。', rank: 'A', trend: false, sources: [{ name: 'テスト学会誌', url: 'https://example.ac.jp/paper', rank: 'A', published: '2026-10' }] }] }
  };
  let online = true;
  await scenario('delivered', async page => {
    await onboard(page);
    await page.waitForFunction(() => document.querySelector('#app').textContent.includes('配信テスト'));
    const home = await snap(page, 'home');
    check(home.app.includes('今日の配信') && home.app.includes('data-a="start" data-v="n20261004"'), '今日の配信が「今日のテーマ」になっていない');
    check(home.app.includes('第6章 チーム｜専門知識'), 'テーマ名が表示されない');
    check(!home.app.includes('壊れた教材'), '形式チェックに落ちた教材が表示されている');
    await click(page, '#nav [data-a="tab"][data-v="learn"]');
    await page.waitForFunction(() => document.querySelector('.trendbox'));
    const learn = await snap(page, 'learn');
    check(/data-unit="u6-2" data-state="ready"[\s\S]*?data-a="start" data-v="n20261004"/.test(learn.app), '学習タブで配信教材が単元（u6-2）に入っていない');
    check(/data-ch="ch6"[\s\S]*?最新トレンド（参考）[\s\S]*?チーム研究のテスト追記[\s\S]*?rank-A[\s\S]*?<\/details>/.test(learn.app) && !/data-ch="ch5"[^]*?チーム研究のテスト追記[^]*?data-ch="ch6"/.test(learn.app), '章の最新トレンド（参考）が表示されない');
    await click(page, '#nav [data-a="tab"][data-v="more"]');
    check((await snap(page, 'more')).app.includes('毎日配信（最新 2026年10月4日）'), '本番接続の状態に配信状況が出ない');
    await click(page, '#nav [data-a="tab"][data-v="home"]');
    await click(page, '[data-a="start"][data-v="n20261004"]');
    await click(page, '#overlay [data-a="next"]');
    const reading = await snap(page, 'reading');
    check(reading.overlay.includes('テスト省の公式発表をもとにAIが作成'), '配信教材の注意書きが出ない');
    check(reading.overlay.includes('トレンド（参考）') && reading.overlay.includes('class="rank rank-C"') && reading.overlay.includes('根拠ランク'), '出典のランクや「トレンド（参考）」が表示されない');
    const seen = await runLesson(page, 'lesson');
    check(seen.has('quiz') && seen.has('thought') && seen.has('mapupdate'), '配信教材で学習を最後まで進められない');
    const checked = Object.entries(snaps).filter(([k]) => k.startsWith('delivered / lesson') && k.endsWith('checked'));
    check(checked.length && checked.every(([, v]) => v.overlay.includes('厚生労働省 一般職業紹介状況') && v.overlay.includes('class="rank rank-A"')), '解説に根拠と信頼度ランクが表示されない');
    const applyStep = Object.entries(snaps).find(([k, v]) => k.startsWith('delivered / lesson') && v.overlay.includes('立場別：明日からの使い方'));
    check(applyStep && applyStep[1].overlay.indexOf('採用コンサルタント（あなた）') < applyStep[1].overlay.indexOf('求人広告・媒体の営業') && applyStep[1].overlay.includes('採用費を応募単価と採用単価で管理'), '立場別の使い方が出ない（自分の職種が先頭でない）');
    await click(page, '#nav [data-a="tab"][data-v="map"]');
    const map = await snap(page, 'map');
    check(map.app.includes('data-node="laborsurvey"') && map.app.includes('労働市場調査'), '新しい知識ノードがマップに出ない');
    // ネットにつながらなくても、端末に保存した配信教材で起動できる
    online = false;
    await page.reload();
    await click(page, '#nav [data-a="tab"][data-v="learn"]');
    check((await snap(page, 'offline-learn')).app.includes('n20261004'), 'オフラインで配信教材が消える');
    await click(page, '#nav [data-a="tab"][data-v="map"]');
    check((await snap(page, 'offline-map')).app.includes('data-node="laborsurvey"'), 'オフラインで新しいノードが消える');
  }, { content: r => { const f = new URL(r.request().url()).pathname.replace(/^.*\/content\//, ''); return online && files[f] ? r.fulfill({ json: files[f] }) : r.abort(); } });
}

// 8. 作り直しで取り下げられた教材は消え、新しい教材に置き換わる
if (fs.existsSync(path.join(root, 'src', 'content.js'))) {
  const { loadApp } = await import('../tools/content/load-app.mjs');
  const A = loadApp();
  const make = (id, title) => {
    const t = JSON.parse(JSON.stringify(A.TOPICS[0]));
    Object.assign(t, { id, title, kind: '最新ニュース', date: '2026-10-03', updated: '2026-10-04', sources: [{ name: 'テスト省', type: '公的機関', url: 'https://example.go.jp/r' }] });
    t.s3[0].label = '事実';
    t.questions = t.questions.map((q, i) => Object.assign({}, q, { id: id + '-' + (i + 1) }));
    return { version: 1, date: '2026-10-04', topic: t, nodes: {}, edges: [] };
  };
  let files = { 'index.json': { items: [{ date: '2026-10-04', id: 'n20261004', file: 'a.json' }] }, 'a.json': make('n20261004', '最初の教材（取り下げ予定）') };
  await scenario('retired', async page => {
    await onboard(page);
    await page.waitForFunction(() => document.querySelector('#app').textContent.includes('取り下げ予定'));
    files = { 'index.json': { items: [{ date: '2026-10-04', id: 'n20261004r1', file: 'b.json' }] }, 'b.json': make('n20261004r1', '作り直した教材') };
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#app').textContent.includes('作り直した教材'));
    await click(page, '#nav [data-a="tab"][data-v="learn"]');
    const s = await snap(page, 'learn');
    check(!s.app.includes('取り下げ予定') && s.app.includes('作り直した教材'), '取り下げた教材が残っている');
  }, { content: r => { const f = new URL(r.request().url()).pathname.replace(/^.*\/content\//, ''); return files[f] ? r.fulfill({ json: files[f] }) : r.abort(); } });
}

// 9. 4択の正解の表示位置が偏らない（以前は必ず最後の選択肢になっていた）
await scenario('answer-position', async page => {
  await page.goto(url);
  const pos = await page.evaluate(() => {
    const p = [0, 0, 0, 0];
    Object.values(QBANK).filter(q => q.options).forEach(q => [0, 1, 2, 3].forEach(n => { S.completed[q.topicId] = n; p[optionOrder(q).indexOf(q.answer)]++; }));
    return p;
  });
  const total = pos.reduce((a, b) => a + b, 0);
  check(pos.every(n => n >= total * 0.1), '正解の表示位置が偏っている: ' + pos);
});

// 7. 学習記録が、この端末に無い知識ノードを指していても（配信教材の保存が消えた場合など）起動できる
await scenario('missing-node', async page => {
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('tomotomo:v1', JSON.stringify({ loggedIn: true, partner: 'dog', profile: { name: 'テスト', occupation: '営業', industry: 'IT', role: 'メンバー', interests: ['AI'], minutes: 10, mode: 'auto', onboarded: true }, nodes: { labor: { mastery: 50 }, ghostnode: { mastery: 40 } }, completed: { n20200101: 1 }, reviews: [{ qid: 'n20200101-1', stage: 0, due: 0 }] })));
  await page.reload();
  for (const t of ['home', 'map', 'learn', 'growth', 'more']) {
    await click(page, '#nav [data-a="tab"][data-v="' + t + '"]');
    check((await snap(page, 'tab-' + t)).app.includes('<main class="screen">'), t + ' タブが表示されない');
  }
});

// 10. 組織論のカリキュラム（要件 AC-5・AC-6・AC-8・AC-9）
await scenario('curriculum', async page => {
  await onboard(page);
  const home = await snap(page, 'home');
  // 今日の配信がないときは、カリキュラム順で最初の未学習の単元（第4章 u4-4）が「今日のテーマ」
  check(/今日のテーマ[\s\S]*?data-a="start" data-v="org-socialization"/.test(home.app) && home.app.includes('カリキュラムの次の単元'), 'ホームの今日のテーマがカリキュラム順の次の単元でない');
  await click(page, '#nav [data-a="tab"][data-v="learn"]');
  await page.waitForFunction(() => document.querySelectorAll('details.chapter').length > 0);
  const learn = await snap(page, 'learn');
  const info = await page.evaluate(() => ({
    chapters: document.querySelectorAll('details.chapter').length,
    units: document.querySelectorAll('.unit').length,
    ready: [...document.querySelectorAll('.unit[data-state="ready"]')].map(u => u.dataset.unit + ':' + !!u.querySelector('[data-a="start"]')),
    soonWithButton: [...document.querySelectorAll('.unit[data-state="soon"]')].filter(u => u.querySelector('button')).length,
    soon: document.querySelectorAll('.unit[data-state="soon"]').length
  }));
  check(info.chapters === 12 && info.units === 37, '学習タブの章・単元の数が違う: ' + info.chapters + '章 ' + info.units + '単元');
  check(info.ready.join(',') === 'u4-4:true,u6-1:true,u10-1:true', '学習できる単元（ボタンあり）が違う: ' + info.ready.join(','));
  check(info.soon === 34 && info.soonWithButton === 0, '準備中の単元にボタンがある（または数が違う）');
  check(learn.app.includes('次の単元') && learn.app.includes('準備中') && learn.app.includes('学習できる'), '単元の状態が表示されない');
  // 学習タブの単元から始めて、最後まで進める
  await click(page, '.unit[data-unit="u4-4"] [data-a="start"]');
  const seen = await runLesson(page, 'lesson');
  check(seen.has('quiz') && seen.has('thought') && seen.has('mapupdate'), '単元の学習を最後まで進められない');
  const all = Object.entries(snaps).filter(([k]) => k.startsWith('curriculum / lesson'));
  check(all.some(([, v]) => v.overlay.includes('class="rank rank-A"') && v.overlay.includes('Bauer')), '解説に根拠（研究）とランクが表示されない');
  const applyStep = all.find(([, v]) => v.overlay.includes('id="views"'));
  check(applyStep && ['お客さんへの提案', '社内で教える', '仕組みで改善する'].every(x => applyStep[1].overlay.includes(x)) && applyStep[1].overlay.includes('立場別：明日からの使い方'), '応用に3つの視点・立場別の使い方が表示されない');
  await click(page, '#nav [data-a="tab"][data-v="learn"]');
  const after = await snap(page, 'learn-after');
  check(/data-unit="u4-4" data-state="done"/.test(after.app), '学習した単元が「学習済み」にならない');
  await click(page, '#nav [data-a="tab"][data-v="home"]');
  check(/data-a="start" data-v="org-psych-safety"/.test((await snap(page, 'home-after')).app), '次の単元（u6-1）が今日のテーマにならない');
  await click(page, '#nav [data-a="tab"][data-v="map"]');
  const map = await snap(page, 'map');
  check(['組織デザイン', '組織と環境', '人と仕事', 'チームとリーダー', '文化・学習・変革'].every(c => map.app.includes(c)), '知識マップに組織論の5分野が出ない');
  check(map.app.includes('data-node="socialization"'), '学習した概念のノードがマップに出ない');
});

// 11. 旧データ（v1・旧サンプルの学習記録あり）からの移行（要件 AC-10・MG-1）
await scenario('migration', async page => {
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem('tomotomo:v1', JSON.stringify({
    loggedIn: true, partner: 'cat', xp: 345, streak: { count: 4, last: '2026-10-03' },
    profile: { name: '旧ユーザー', occupation: '採用コンサルタント', industry: '人材', role: 'リーダー', interests: ['AI', '採用'], minutes: 10, mode: 'auto', onboarded: true },
    history: [{ at: Date.parse('2026-10-03T09:00:00+09:00'), topicId: 'ai-agent-hiring', title: 'AIエージェントと採用', minutes: 10, xp: 80, correct: 4, total: 4, mode: 'think' }],
    nodes: { agent: { mastery: 60 }, hiring: { mastery: 40 }, labor: { mastery: 20 } }, completed: { 'ai-agent-hiring': 1 },
    reviews: [{ qid: 'ai-agent-hiring-1', stage: 1, due: 0 }, { qid: 'rates-hiring-2', stage: 0, due: 0 }, { qid: 'n20261028-3', stage: 0, due: 0 }],
    badges: ['first'], skills: { knowledge: { c: 3, t: 4 } }
  })));
  await page.reload();
  for (const t of ['home', 'map', 'learn', 'growth', 'more']) {
    await click(page, '#nav [data-a="tab"][data-v="' + t + '"]');
    check((await snap(page, 'tab-' + t)).app.includes('<main class="screen">'), t + ' タブが表示されない');
  }
  await click(page, '#nav [data-a="tab"][data-v="home"]');
  await click(page, '[data-a="start"]');
  await runLesson(page, 'lesson', { thought: 'skip' });
  const st = JSON.parse(await page.evaluate(() => localStorage.getItem('tomotomo:v1')));
  check(st.v === 2, '学習データのバージョンが2にならない');
  check(!st.reviews.some(r => /^(ai-agent-hiring|rates-hiring|ai-productivity-labor)-/.test(r.qid)), '旧サンプルの復習予定が残っている');
  check(st.reviews.some(r => r.qid === 'n20261028-3'), '配信教材の復習予定まで消えている');
  check(st.xp > 345 && st.history.length === 2 && st.history[0].title === 'AIエージェントと採用', 'XP・履歴が引き継がれていない');
  check(st.profile.name === '旧ユーザー' && st.partner === 'cat' && st.nodes.agent.mastery === 60, '設定・習熟度が引き継がれていない');
  await click(page, '#nav [data-a="tab"][data-v="growth"]');
  check((await snap(page, 'growth')).app.includes('AIエージェントと採用'), '成長タブに旧サンプルの履歴が出ない');
});

// 5. PWA：ホーム画面に追加できる情報があり、オフラインでも起動して学習できる
if (fs.existsSync(path.join(root, 'service-worker.js'))) {
  await scenario('pwa', async page => {
    await page.goto(url);
    const manifest = await page.evaluate(async () => { const l = document.querySelector('link[rel="manifest"]'); return l && (await fetch(l.href)).json(); });
    check(manifest && manifest.display === 'standalone' && manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'), 'manifest が不正');
    for (const i of manifest.icons) check((await page.request.get(new URL(i.src, url).href)).ok(), 'アイコンがない: ' + i.src);
    check(await page.evaluate(() => !!document.querySelector('link[rel="apple-touch-icon"]') && document.querySelector('meta[name="apple-mobile-web-app-capable"]').content === 'yes'), 'iPhone 用の設定がない');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(async () => (await caches.keys()).length > 0 && (await (await caches.open((await caches.keys())[0])).keys()).length >= 15);
    await onboard(page);
    await page.context().setOffline(true);
    await page.reload();
    const s = await snap(page, 'offline-reload');
    check(s.app.includes('<main class="screen">'), 'オフラインで起動しない');
    await click(page, '[data-a="start"]');
    const seen = await runLesson(page, 'offline-lesson');
    check(seen.has('quiz') && seen.has('thought') && seen.has('mapupdate'), 'オフラインで学習を最後まで進められない');
    await page.context().setOffline(false);
  }, { sw: true });
}

await browser.close();
server.close();
if (process.env.SNAP_OUT) fs.writeFileSync(process.env.SNAP_OUT, JSON.stringify(snaps, null, 1));
if (failures.length) { console.error('NG\n' + failures.join('\n')); process.exit(1); }
console.log('OK: ' + Object.keys(snaps).length + ' 画面を確認しました');
