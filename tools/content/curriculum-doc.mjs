// content/curriculum.json から調査ノート（docs/research/organization-theory.md）を作る。
// 文献の情報はカリキュラムのファイルだけに書き、文書はそこから生成する（食い違いを防ぐ）。
// 使い方: node tools/content/curriculum-doc.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './load-app.mjs';

const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'curriculum.json'), 'utf8'));
const RANK = { A: '査読付き論文・メタ分析・公的統計', B: '学術書・学術機関・大手調査機関', C: '企業の調査・実務記事（参考）' };
const lines = [
  '# 組織論の調査ノート',
  '',
  '> このファイルは `content/curriculum.json` から自動生成しています（`node tools/content/curriculum-doc.mjs`）。直すときはカリキュラムのファイルを直してください。',
  '',
  '## 調べ方',
  '- 2026年11月に、各文献の書誌（著者・年・誌名・巻号・ページ・DOI）と主要な結果を、Web検索で出版社・大学リポジトリ・学術データベース・公的機関の公表資料にあたって確認した。',
  '- 「確認した内容」には、確認できた事柄だけを書いた。効果量などの数値は、要旨または信頼できる要約で確認できたものに限る。',
  '- 信頼度ランク（設計書 docs/design-brief.md 4章）：' + Object.entries(RANK).map(([k, v]) => k + '＝' + v).join('　'),
  '',
  '## 文献の内訳',
  ''
];
const count = {};
Object.values(C.sources).forEach(s => { count[s.rank] = (count[s.rank] || 0) + 1; });
lines.push('全' + Object.keys(C.sources).length + '件（' + Object.entries(count).sort().map(([k, v]) => 'ランク' + k + ' ' + v + '件').join('・') + '）／' + C.chapters.length + '章・' + C.chapters.reduce((a, c) => a + c.units.length, 0) + '単元', '');
for (const ch of C.chapters) {
  lines.push('## ' + ch.title, '', '**この章の役割**：' + ch.role, '');
  for (const u of ch.units) {
    lines.push('### ' + u.id + '　' + u.title + (u.topicId ? '（教材あり）' : ''), '', '鍵になる概念：' + u.concepts.join('、'), '');
    for (const id of u.sources) {
      const s = C.sources[id];
      lines.push('- **[' + s.rank + '・' + s.kind + ']** ' + s.cite + ' ' + s.url, '  - 確認した内容：' + s.finding);
    }
    lines.push('');
  }
}
fs.mkdirSync(path.join(ROOT, 'docs', 'research'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'docs', 'research', 'organization-theory.md'), lines.join('\n') + '\n');
console.log('docs/research/organization-theory.md を作りました');
