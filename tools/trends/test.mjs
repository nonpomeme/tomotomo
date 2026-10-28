// 週1回のトレンド調査の「確かめて追記案にまとめる」部分のテスト（本物の通信・AI は使わない）
// 使い方: node tools/trends/test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { review, report, isoWeek } from './apply.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const failures = [];
const check = (c, m) => { if (!c) failures.push(m); };
const chapters = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'content', 'chapters.json'), 'utf8')).chapters;
const imp = { customer: '採用計画の前提として顧客に示せる', teach: '研修で数字の読み方のワークに使える', system: '求人データの集計を自動化できる' };
const src = (url, rank, extra = {}) => Object.assign({ name: '厚生労働省 一般職業紹介状況', url, rank, published: '2026-10-01' }, extra);
const item = (id, extra = {}) => Object.assign({ id, chapter: 'ch2', kind: '公的統計', title: '有効求人倍率は1.20倍に低下', summary: '厚生労働省の一般職業紹介状況（2026年9月分）によると、有効求人倍率（季節調整値）は1.20倍で前月から0.02ポイント低下した。新規求人数は前年同月比で減少した。', sources: [src('https://www.mhlw.go.jp/a', 'A')], implications: imp }, extra);
const proposal = {
  items: [
    item('ok-a'),
    item('ok-c', { chapter: 'ch3', kind: '業界ニュース', title: 'AI面接の導入企業が増加', sources: [src('https://example.co.jp/survey', 'C', { name: 'テスト社 調査' })] }),
    item('no-source', { sources: [] }),
    item('rank-d', { sources: [src('https://blog.example.com/x', 'D', { name: '個人ブログ' })] }),
    item('missing-url', { sources: [src('https://www.mhlw.go.jp/404', 'A')] }),
    item('dup', { sources: [src('https://www.mhlw.go.jp/old/', 'A')] }),
    item('bad-chapter', { chapter: 'ch9' }),
    item('no-date', { sources: [src('https://www.mhlw.go.jp/b', 'A', { published: '' })] }),
    item('partly', { chapter: 'ch7', sources: [src('https://www.mhlw.go.jp/c', 'A'), src('https://sns.example.com/p', 'D', { name: 'SNS' })] }),
    item('blocked', { chapter: 'ch6', sources: [src('https://www.meti.go.jp/x', 'A', { name: '経済産業省 資料' })] }),
    item('no-impl', { implications: { customer: 'x' } })
  ],
  key_points: [
    { text: '求人倍率が低下し、採用の難しさは一服', items: ['ok-a'] },
    { text: 'AI面接の導入が進む（参考）', items: ['ok-c'] },
    { text: '根拠が除外された要点', items: ['rank-d'] },
    { text: '定着の要因に新しい統計', items: ['partly'] }
  ]
};
const existing = [{ id: 'old', sources: [{ url: 'https://mhlw.go.jp/old' }] }];
const fakeCheck = async u => (u.includes('/404') ? 'missing' : u.includes('meti.go.jp') ? 'unverified' : 'ok');

const res = await review(proposal, { chapters, existing, check: fakeCheck });
const ids = res.kept.map(k => k.id);
check(JSON.stringify(ids) === JSON.stringify(['ok-a', 'ok-c', 'partly', 'blocked']), '合格した項目: ' + ids);
const why = Object.fromEntries(res.dropped.map(d => [d.label, d.why.join('／')]));
check(res.dropped.length === 7, '除外の数: ' + JSON.stringify(why));
check(res.dropped.every(d => d.why.length), '除外の理由がない');
check(JSON.stringify(res.dropped).includes('D（根拠に使えない）') && JSON.stringify(res.dropped).includes('ページが見つからない') && JSON.stringify(res.dropped).includes('追記済み') && JSON.stringify(res.dropped).includes('公表日がない') && JSON.stringify(res.dropped).includes('章が不正'), '除外の理由: ' + JSON.stringify(why));
const partly = res.kept.find(k => k.id === 'partly');
check(partly.sources.length === 1 && partly.sources[0].rank === 'A' && /一部の出典を除外/.test(partly.note), 'ランクDの出典だけを外す: ' + JSON.stringify(partly));
check(res.kept.find(k => k.id === 'ok-c').trend === true && res.kept.find(k => k.id === 'ok-a').trend === false, 'C だけの項目をトレンド（参考）にする');
check(res.kept.find(k => k.id === 'blocked').sources[0].autoCheck === '自動では確認できず', '自動で確認できない出典の記録');
check(res.keyPoints.length === 3 && !res.keyPoints.some(p => p.items.includes('rank-d')), '要点（除外した項目を根拠にしない・3つまで）: ' + JSON.stringify(res.keyPoints));

const md = report(res, { chapters, week: isoWeek('2026-10-28'), today: '2026-10-28' });
check(isoWeek('2026-10-28') === '2026-W44' && isoWeek('2027-01-01') === '2026-W53', '週番号');
check(md.includes('## 今週の要点3つ') && md.includes('## お客さん・研修・業務改善への示唆（AIの解釈）') && md.includes('### 第2章 採用計画と母集団形成') && md.includes('[A] [厚生労働省 一般職業紹介状況](https://www.mhlw.go.jp/a)') && md.includes('トレンド（参考）') && md.includes('## 除外した項目'), '報告の形');

// コマンドとして：content/trends.json に追記し、週の報告を書く。本文（教材・章）は変えない
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tomotomo-trends-'));
fs.mkdirSync(path.join(tmp, 'content'));
fs.copyFileSync(path.join(here, '..', '..', 'content', 'chapters.json'), path.join(tmp, 'content', 'chapters.json'));
fs.writeFileSync(path.join(tmp, 'content', 'trends.json'), JSON.stringify({ version: 1, items: [] }));
fs.writeFileSync(path.join(tmp, 'proposal.json'), JSON.stringify({ items: [item('cli-a')], key_points: [{ text: '要点', items: ['cli-a'] }] }));
const env = { ...process.env, CONTENT_DIR: path.join(tmp, 'content'), TRENDS_DOCS_DIR: path.join(tmp, 'docs'), PR_BODY_FILE: path.join(tmp, 'body.md') };
let r = spawnSync(process.execPath, [path.join(here, 'apply.mjs'), path.join(tmp, 'proposal.json'), '--today', '2026-10-28', '--no-net'], { env, encoding: 'utf8' });
const tr = JSON.parse(fs.readFileSync(path.join(tmp, 'content', 'trends.json'), 'utf8'));
check(r.status === 0 && tr.items.length === 1 && tr.items[0].week === '2026-W44' && tr.items[0].added === '2026-10-28', 'trends.json への追記: ' + r.stdout + r.stderr);
check(fs.existsSync(path.join(tmp, 'docs', '2026-W44.md')) && fs.readFileSync(path.join(tmp, 'body.md'), 'utf8').includes('今週の要点3つ'), '週の報告・PR本文');
// 2回目：同じ出典はもう追記済みなので追記案なし（終了コード 3 ＝ PR を作らない）
r = spawnSync(process.execPath, [path.join(here, 'apply.mjs'), path.join(tmp, 'proposal.json'), '--today', '2026-10-29', '--no-net'], { env, encoding: 'utf8' });
check(r.status === 3 && JSON.parse(fs.readFileSync(path.join(tmp, 'content', 'trends.json'), 'utf8')).items.length === 1, '重複したときに PR を作らない');
// 調査結果が読めないときも PR を作らない
r = spawnSync(process.execPath, [path.join(here, 'apply.mjs'), path.join(tmp, 'nothing.json'), '--no-net'], { env, encoding: 'utf8' });
check(r.status === 3, '調査結果がないときに PR を作らない');
fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length) { console.error('NG\n' + failures.join('\n')); process.exit(1); }
console.log('OK: トレンド調査のテストに合格しました');
