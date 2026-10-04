// 開発用の小さな静的サーバー（ビルド不要）。
// 使い方: node tests/serve.mjs [公開するフォルダ] [ポート]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json'
};

export function serve(root, port = 0) {
  root = path.resolve(root);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, url: 'http://127.0.0.1:' + server.address().port + '/' })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { url } = await serve(root, Number(process.argv[3] || 8080));
  console.log('TomoTomo: ' + url + ' で起動しました（Ctrl+C で停止）');
}
