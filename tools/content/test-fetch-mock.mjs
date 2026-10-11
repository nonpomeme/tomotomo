// テスト用：*.test のURL（偽の情報源・記事）への通信を、手元のファイルで返す。それ以外は本物の fetch。
import fs from 'node:fs';
import path from 'node:path';
const dir = process.env.MOCK_WEB_DIR;
const real = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (!url.hostname.endsWith('.test')) return real(input, init);
  const f = path.join(dir, url.hostname, url.pathname);
  if (!fs.existsSync(f)) return new Response('not found', { status: 404 });
  const type = f.endsWith('.xml') ? 'application/rss+xml; charset=utf-8' : f.endsWith('.sjis.html') ? 'text/html; charset=Shift_JIS' : 'text/html; charset=utf-8';
  return new Response(fs.readFileSync(f), { status: 200, headers: { 'content-type': type } });
};
