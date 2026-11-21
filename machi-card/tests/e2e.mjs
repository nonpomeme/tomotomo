// Web 版（dist/）を実際のブラウザで動かして、主な流れを確認する
// 使い方：npx expo export --platform web && node tests/e2e.mjs
// Overpass API への通信は、OSM の応答形式をまねたデータで置き換える。

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const DIST = resolve(new URL('..', import.meta.url).pathname, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon', '.png': 'image/png', '.json': 'application/json' };

// 単一ページ（output: single）なので、見つからないパスは index.html を返す（Vercel の rewrites と同じ）
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, url);
  try {
    if (!(await stat(file)).isFile()) throw new Error();
  } catch {
    file = join(DIST, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- Overpass のダミー応答 ----
const START = { latitude: 35.7290, longitude: 139.7090 };
const nearbyResponse = {
  elements: [
    { type: 'node', id: 1, lat: 35.7295, lon: 139.7109, tags: { railway: 'station', name: '池袋', public_transport: 'station', train: 'yes' } },
    { type: 'node', id: 2, lat: 35.7300, lon: 139.7115, tags: { railway: 'station', name: '池袋', subway: 'yes' } },
    { type: 'node', id: 3, lat: 35.7333, lon: 139.6983, tags: { railway: 'station', name: '要町', subway: 'yes' } },
    { type: 'node', id: 10, lat: 35.7294, lon: 139.7107, tags: { public_transport: 'stop_position', name: '池袋', train: 'yes' } },
    { type: 'relation', id: 100, members: [{ type: 'node', ref: 10, role: 'stop' }], tags: { type: 'route', route: 'train', name: '西武池袋線 (池袋→飯能)' } },
    { type: 'relation', id: 101, members: [{ type: 'node', ref: 10, role: 'stop' }], tags: { type: 'route', route: 'train', name: '西武池袋線（飯能→池袋）' } },
    { type: 'relation', id: 102, members: [{ type: 'node', ref: 2, role: 'stop' }, { type: 'node', ref: 3, role: 'stop' }], tags: { type: 'route', route: 'subway', name: '東京メトロ有楽町線: 和光市 => 新木場' } },
    { type: 'relation', id: 300, members: [{ type: 'node', ref: 1, role: '' }, { type: 'node', ref: 10, role: 'stop' }], tags: { type: 'public_transport', public_transport: 'stop_area', name: '池袋' } },
    { type: 'relation', id: 200, members: [{ type: 'relation', ref: 100, role: '' }, { type: 'relation', ref: 101, role: '' }], tags: { type: 'route_master', route_master: 'train', name: '西武池袋線' } },
  ],
};
const lineResponse = {
  elements: [
    { type: 'relation', id: 100, tags: { type: 'route', route: 'train', name: '西武池袋線 (池袋→飯能)' }, members: [
      { type: 'node', ref: 21, role: 'stop' }, { type: 'node', ref: 22, role: 'stop' }, { type: 'node', ref: 23, role: 'stop' }, { type: 'node', ref: 24, role: 'stop' }, { type: 'way', ref: 900, role: '' },
    ] },
    { type: 'relation', id: 101, tags: { type: 'route', route: 'train', name: '西武池袋線 (飯能→池袋)' }, members: [
      { type: 'node', ref: 24, role: 'stop' }, { type: 'node', ref: 23, role: 'stop' }, { type: 'node', ref: 21, role: 'stop' },
    ] },
    { type: 'node', id: 21, lat: 35.7294, lon: 139.7107, tags: { public_transport: 'stop_position', name: '池袋' } },
    { type: 'node', id: 22, lat: 35.7266, lon: 139.6988, tags: { public_transport: 'stop_position', name: '椎名町' } },
    { type: 'node', id: 23, lat: 35.7300, lon: 139.6836, tags: { public_transport: 'stop_position', name: '東長崎' } },
    { type: 'node', id: 24, lat: 35.7320, lon: 139.6750, tags: { public_transport: 'stop_position', name: '江古田' } },
  ],
};

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  geolocation: START,
  permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
  locale: 'ja-JP',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const queries = [];
await context.route('https://overpass-api.de/api/interpreter', async (route) => {
  const body = decodeURIComponent((route.request().postData() ?? '').replace(/^data=/, ''));
  queries.push(body);
  const json = body.includes('rel(id:') ? lineResponse : nearbyResponse;
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(json) });
});
// 地図タイルは読み込まない
await context.route('https://tile.openstreetmap.org/**', (r) => r.fulfill({ status: 204, body: '' }));

await page.goto(BASE);
await page.getByText('散歩スタート').click();
await page.getByText('散歩中', { exact: true }).waitFor();
check(await page.locator('.leaflet-container').count() === 1, '散歩中に地図（Leaflet）が表示される');
const firstPoint = await page.evaluate(() => JSON.parse(localStorage.getItem('machicard:v1:activeWalk') ?? 'null')?.route?.[0]);
check(firstPoint?.lat === START.latitude && firstPoint?.lon === START.longitude, 'スタート時に現在地を1点すぐ記録する');

// 少し歩く
await context.setGeolocation({ latitude: 35.7300, longitude: 139.7080 });
await page.waitForTimeout(1500);
await context.setGeolocation({ latitude: 35.7310, longitude: 139.7070 });
await page.waitForTimeout(1500);
await page.getByPlaceholder(/メモ/).fill('古い銭湯がある');
await page.getByText('ここにピン').click();
await page.getByText(/1\. 古い銭湯がある/).waitFor();
check(await page.locator('path.leaflet-interactive').count() >= 3, 'ルートの線とピンの丸が地図に描かれる');

await page.getByText('散歩を終える').click();
await page.getByText('歩き始めた地点から1km以内の駅').waitFor();
await page.getByText('要町', { exact: true }).waitFor();
check(queries[0]?.includes('around:1000,35.729,139.709'), 'スタート地点の1km以内を検索する');
const ikebukuroCount = await page.getByText('池袋', { exact: true }).count();
check(ikebukuroCount === 1, '同じ名前の駅はまとめて1つの候補にする');
check(await page.getByText('西武池袋線', { exact: true }).count() === 1, '路線名から向きの表記を除いてまとめる（西武池袋線）');
check(await page.getByText('東京メトロ有楽町線', { exact: true }).count() === 2, '「: A => B」形式の向きも除く（有楽町線）');
check(await page.getByText(/→|=>/).count() === 0, '候補に向きの表記が残っていない');

await page.getByText('池袋', { exact: true }).click();
await page.getByPlaceholder(/例：坂と/).fill('坂と銭湯の街');
await page.getByText('街カードを保存').click();
await page.getByText('質問文をコピー', { exact: true }).filter({ visible: true }).waitFor();
await page.waitForURL(/\/card\//);

// 質問文コピー
await page.getByText('質問文をコピー', { exact: true }).filter({ visible: true }).click();
await page.getByText('コピーしました', { exact: true }).filter({ visible: true }).waitFor();
const clip = await page.evaluate(() => navigator.clipboard.readText());
check(clip.includes('池袋') && clip.includes('西武池袋線') && clip.includes('坂と銭湯の街') && clip.includes('古い銭湯がある') && clip.includes('由来'), '質問文に駅・路線・キャッチコピー・メモ・由来の質問が入る');

// Claude を開く
const popupP = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
await page.getByText('Claudeを開く', { exact: true }).filter({ visible: true }).click();
const popup = await popupP;
check(popup?.url().startsWith('https://claude.ai/new') ?? false, '「Claudeを開く」で https://claude.ai/new を開く');
await popup?.close();

// 答えを保存
await page.getByPlaceholder('Claude の答えをここに貼り付け').filter({ visible: true }).fill('池袋の地名の由来は…');
await page.getByText('答えを保存', { exact: true }).filter({ visible: true }).click();
await page.getByText('保存しました', { exact: true }).filter({ visible: true }).waitFor();

// 地図を見る
await page.getByText('地図を見る', { exact: true }).filter({ visible: true }).click();
check(await page.locator('.leaflet-container').count() === 1, 'カードの「地図を見る」で地図が表示される');

// 開き直しても残る
await page.goto(BASE);
await page.getByText('保存した街カード（1枚）').waitFor();
check(true, 'アプリを開き直してもカードが残る');
await page.getByText('「坂と銭湯の街」').filter({ visible: true }).first().click();
check(await page.getByPlaceholder('Claude の答えをここに貼り付け').filter({ visible: true }).inputValue() === '池袋の地名の由来は…', '貼り付けた答えも残る');

// 路線の制覇率
await page.goto(BASE + '/lines');
await page.getByText('西武池袋線', { exact: true }).click();
await page.getByText('訪問済み1/全4駅（25%）').waitFor();
check(true, '路線の制覇率「訪問済み1/全4駅（25%）」を表示する');
check(queries.some((q) => q.includes('rel(id:100,101)')), '路線の route リレーションで駅一覧を取得する');
const order = await page.evaluate(() => document.body.innerText.match(/(池袋|椎名町|東長崎|江古田)/g)?.slice(-4).join(','));
check(order === '池袋,椎名町,東長崎,江古田', `駅一覧が路線の順番で並ぶ（${order}）`);

// キャッシュ：もう一度開いても Overpass に問い合わせない
const before = queries.length;
await page.goto(BASE + '/lines/' + encodeURIComponent('西武池袋線'));
await page.getByText('訪問済み1/全4駅（25%）').waitFor();
check(queries.length === before, '駅一覧はキャッシュから表示する');

// 削除
await page.goto(BASE);
await page.getByText('「坂と銭湯の街」').filter({ visible: true }).first().click();
page.once('dialog', (d) => d.accept());
await page.getByText('このカードを削除', { exact: true }).filter({ visible: true }).click();
await page.getByText('保存した街カード（0枚）').waitFor();
check(true, 'カードを削除できる');

check(errors.length === 0, `ページのエラーがない ${errors.join(' / ')}`);

await browser.close();
server.close();
console.log(failures === 0 ? '\nすべて成功' : `\n${failures} 件失敗`);
process.exit(failures === 0 ? 0 : 1);
