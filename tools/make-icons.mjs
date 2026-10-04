// アプリアイコンを学習パートナー（TOMO）の SVG から生成する。
// 使い方: node tools/make-icons.mjs   → icons/ に PNG を書き出す
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../tests/serve.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BG = '#4F5BEF'; // アプリのメインカラー（--primary）
// [ファイル名, 一辺のpx, 絵の大きさ(割合)]  maskable は端が丸く切られても欠けないよう小さめ
const ICONS = [['icon-192.png', 192, 0.78], ['icon-512.png', 512, 0.78], ['icon-maskable-512.png', 512, 0.6], ['apple-touch-icon.png', 180, 0.74], ['favicon-32.png', 32, 0.9]];

const { server, url } = await serve(root);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route(u => !u.href.startsWith(url), r => r.abort());
await page.goto(url);
for (const [name, size, ratio] of ICONS) {
  await page.setViewportSize({ width: size, height: size });
  await page.evaluate(({ size, ratio, bg }) => {
    const art = partnerArt('tomo', Math.round(size * ratio), 'happy');
    document.body.innerHTML = '<div id="icon" style="position:fixed;inset:0;width:' + size + 'px;height:' + size + 'px;background:' + bg + ';display:flex;align-items:center;justify-content:center">' + art + '</div>';
    document.body.style.margin = '0';
  }, { size, ratio, bg: BG });
  await page.locator('#icon').screenshot({ path: path.join(root, 'icons', name) });
}
await browser.close();
server.close();
console.log('icons/ にアイコンを書き出しました');
