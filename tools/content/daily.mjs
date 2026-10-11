// 毎日の教材づくり（GitHub Actions から1日1回実行）
//   収集 → 選定 → 生成 → 形式チェック → 別のAIで品質検査 → 合格したものだけ content/ に保存
// 使い方: ANTHROPIC_API_KEY=... node tools/content/daily.mjs
// 環境変数（テスト用）: SOURCES_FILE, CONTENT_DIR, LOG_DIR, TODAY, ANTHROPIC_BASE_URL, CONTENT_MODEL, MAX_ATTEMPTS
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { loadApp, ROOT } from './load-app.mjs';
import { collect, fetchArticle, jstDate } from './collect.mjs';
import { commonContext, SELECT_SYSTEM, PICK_SCHEMA, GENERATE_RULES, VERIFY_SYSTEM, CHECKS, VERDICT_SCHEMA } from './prompts.mjs';

const MODEL = process.env.CONTENT_MODEL || 'claude-opus-5-5';
const CONTENT_DIR = process.env.CONTENT_DIR || path.join(ROOT, 'content');
const LOG_DIR = process.env.LOG_DIR || path.join(ROOT, 'tools', 'content', 'log');
const SOURCES = JSON.parse(fs.readFileSync(process.env.SOURCES_FILE || path.join(ROOT, 'tools', 'content', 'sources.json'), 'utf8'));
const TODAY = process.env.TODAY || jstDate();
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS) || 2;
// 安全上の理由でAIが断ったとき、Anthropic 推奨の別モデルで自動的にやり直す
const FALLBACK = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };

const report = [];
const say = s => { console.log(s); report.push(s); };
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const textOf = msg => msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
function parseJSON(s) {
  s = s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  return JSON.parse(s.slice(a, b + 1));
}
function usable(msg, what) {
  if (msg.stop_reason === 'refusal') throw new Error(what + '：AIが回答を控えました');
  if (msg.stop_reason === 'max_tokens') throw new Error(what + '：出力が長すぎて途中で切れました');
  return msg;
}

async function main() {
  const indexFile = path.join(CONTENT_DIR, 'index.json');
  const index = readJSON(indexFile, { version: 1, items: [] });
  const dayFile = 'daily/' + TODAY + '.json';
  if (index.items.some(it => it.date === TODAY)) { say('今日（' + TODAY + '）の教材はすでにあります。終了します。'); return finish(); }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY が設定されていません（GitHub の Secrets に登録してください）');

  const A = loadApp();
  // 過去の配信分の知識ノードも「既存」として扱う（同じ概念を二重に作らない）
  for (const it of index.items) {
    const b = readJSON(path.join(CONTENT_DIR, it.file), null);
    if (b) Object.assign(A.NODES, b.nodes || {});
  }
  const used = new Set(index.items.flatMap(it => it.links || []));

  // 1. 収集
  const { items, log } = await collect(SOURCES.feeds, { exclude: used });
  say('## 収集\n' + log.map(l => '- ' + l).join('\n'));
  if (!items.length) { say('新着がありませんでした。今日は配信しません。'); return finish(); }

  const client = new Anthropic({ baseURL: process.env.ANTHROPIC_BASE_URL || undefined });
  const common = commonContext(A);
  const system = role => [{ type: 'text', text: common, cache_control: { type: 'ephemeral' } }, { type: 'text', text: role }];

  // 2. 選定
  const recent = index.items.slice(0, 14).map(it => it.title);
  const list = items.slice(0, 60).map((it, i) => i + '. [' + it.publisher + '｜' + jstDate(it.date) + '] ' + it.title + (it.summary ? ' — ' + it.summary.slice(0, 120) : '')).join('\n');
  const sel = usable(await client.beta.messages.create({
    model: MODEL, max_tokens: 8000, system: SELECT_SYSTEM,
    messages: [{ role: 'user', content: '直近に配信したテーマ:\n' + (recent.join('\n') || '（なし）') + '\n\n今日の新着一覧:\n' + list + '\n\n教材にするのに良いものを、良い順に最大3つ選んでください。' }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: PICK_SCHEMA } }, ...FALLBACK
  }), '選定');
  const picks = parseJSON(textOf(sel)).picks.filter(p => items[p.index]).slice(0, 3);
  say('## 選定\n' + (picks.map(p => '- ' + items[p.index].title + '（' + p.reason + '）').join('\n') || '- 良い候補がありませんでした'));

  // 3〜5. 生成 → 形式チェック → 品質検査（合格するまで最大 MAX_ATTEMPTS 件）
  let attempts = 0;
  for (const p of picks) {
    if (attempts >= MAX_ATTEMPTS) break;
    const item = items[p.index];
    let doc;
    try { doc = await fetchArticle(item.link); } catch (e) { say('- 本文を取得できず飛ばしました：' + item.title + '（' + e.message + '）'); continue; }
    attempts++;
    try {
      const bundle = await generate(client, system, A, item, doc);
      const verdict = await verify(client, system, bundle, item, doc);
      if (!verdict.pass) {
        reject(item, verdict.failed);
        say('### 不合格（破棄）：' + item.title + '\n' + verdict.failed.map(c => '- ' + c.id + '：' + c.note).join('\n'));
        continue;
      }
      bundle.meta = { model: MODEL, generatedAt: new Date().toISOString(), checks: verdict.checks.map(c => ({ id: c.id, ok: c.ok })) };
      fs.mkdirSync(path.join(CONTENT_DIR, 'daily'), { recursive: true });
      fs.writeFileSync(path.join(CONTENT_DIR, dayFile), JSON.stringify(bundle, null, 1) + '\n');
      index.items.unshift({ date: TODAY, id: bundle.topic.id, title: bundle.topic.title, emoji: bundle.topic.emoji, file: dayFile, links: [item.link] });
      index.updated = new Date().toISOString();
      fs.writeFileSync(indexFile, JSON.stringify(index, null, 1) + '\n');
      say('## 配信：' + bundle.topic.emoji + ' ' + bundle.topic.title + '\n- 出典：' + item.publisher + ' ' + item.link);
      return finish();
    } catch (e) {
      reject(item, [{ id: 'error', note: e.message }]);
      say('### 失敗：' + item.title + '\n- ' + e.message);
    }
  }
  say('今日は合格した教材がなかったため、配信しません（アプリは前日までの教材とサンプルで動きます）。');
  return finish();
}

/* 生成：形式チェックに落ちたら、理由を伝えて1回だけ直させる */
async function generate(client, system, A, item, doc) {
  const docBlock = doc.kind === 'pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.data }, title: item.title }
    : { type: 'document', source: { type: 'text', media_type: 'text/plain', data: doc.text }, title: item.title };
  const meta = '出典: ' + item.publisher + '（' + item.type + '）\nタイトル: ' + item.title + '\nURL: ' + item.link + '\n公開日: ' + jstDate(item.date) + '\n今日の日付: ' + TODAY;
  const messages = [{ role: 'user', content: [docBlock, { type: 'text', text: meta + '\n\n' + GENERATE_RULES }] }];
  for (let round = 0; round < 2; round++) {
    const msg = usable(await client.beta.messages.stream({ model: MODEL, max_tokens: 32000, system: system('あなたは TomoTomo の教材作者です。'), messages, output_config: { effort: 'high' }, ...FALLBACK }).finalMessage(), '生成');
    let bundle, errors;
    try {
      bundle = complete(parseJSON(textOf(msg)), item);
      const ctx = { nodes: Object.assign({}, A.NODES, bundle.nodes), cats: A.MAP_CATS, rels: A.REL_LABEL, skills: A.SKILLS, newNodes: bundle.nodes, newEdges: bundle.edges };
      errors = A.validateTopic(bundle.topic, ctx);
      Object.keys(bundle.nodes).forEach(k => { if (A.NODES[k]) errors.push('新ノード ' + k + '：既存のノードと同じ id です（既存を使ってください）'); });
    } catch (e) { errors = ['JSON として読めません：' + e.message]; }
    if (!errors.length) return bundle;
    say('- 形式チェックで ' + errors.length + ' 件の不備' + (round === 0 ? '（直させます）' : '') + '：' + errors.slice(0, 5).join('／'));
    messages.push({ role: 'assistant', content: msg.content }, { role: 'user', content: '形式チェックで次の不備が見つかりました。直した JSON 全体をもう一度出力してください。\n- ' + errors.join('\n- ') });
  }
  throw new Error('形式チェックに合格しませんでした');
}

/* こちらで決める項目（id・日付・出典）を入れる。出典URLはAIに書かせない（実在するURLだけにするため） */
function complete(out, item) {
  const id = 'n' + TODAY.replace(/-/g, '');
  const topic = Object.assign({}, out.topic, {
    id, kind: '最新ニュース', date: jstDate(item.date), updated: TODAY,
    sources: [{ name: item.publisher, type: item.type, url: item.link }],
    note: 'この教材は、' + item.publisher + 'の公式発表をもとにAIが作成し、別のAIによる品質検査に合格したものです。正確な内容は出典をご確認ください。'
  });
  if (Array.isArray(topic.questions)) topic.questions = topic.questions.map((q, i) => Object.assign({}, q, { id: id + '-' + (i + 1) }));
  return { version: 1, date: TODAY, topic, nodes: out.nodes && typeof out.nodes === 'object' ? out.nodes : {}, edges: Array.isArray(out.edges) ? out.edges : [] };
}

/* 品質検査：別の呼び出しで、出典とサンプルに照らしてチェック。1項目でも不合格なら破棄 */
async function verify(client, system, bundle, item, doc) {
  const docBlock = doc.kind === 'pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: doc.data }, title: '出典：' + item.title }
    : { type: 'document', source: { type: 'text', media_type: 'text/plain', data: doc.text }, title: '出典：' + item.title };
  const msg = usable(await client.beta.messages.create({
    model: MODEL, max_tokens: 16000, system: system(VERIFY_SYSTEM),
    messages: [{ role: 'user', content: [docBlock, { type: 'text', text: '出典の公開日: ' + jstDate(item.date) + '\n\n# 検査項目\n' + CHECKS.map(c => '- ' + c[0] + '：' + c[1]).join('\n') + '\n\n# 検査する教材（JSON）\n' + JSON.stringify(bundle) }] }],
    output_config: { effort: 'high', format: { type: 'json_schema', schema: VERDICT_SCHEMA } }, ...FALLBACK
  }), '品質検査');
  const v = parseJSON(textOf(msg));
  const checks = CHECKS.map(([id]) => v.checks.find(c => c.id === id) || { id, ok: false, note: '検査結果がありません' });
  const failed = checks.filter(c => !c.ok);
  return { pass: failed.length === 0, checks, failed, summary: v.summary };
}

/* 不合格の記録（本文は残さない）。品質改善のために、オーナーが後から理由を確認できるようにする */
function reject(item, failed) {
  const f = path.join(LOG_DIR, 'rejected.json');
  const list = readJSON(f, []);
  list.unshift({ date: TODAY, title: item.title, url: item.link, reasons: failed.map(c => c.id + '：' + c.note) });
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(list.slice(0, 60), null, 1) + '\n');
}

function finish() {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '# 毎日の教材（' + TODAY + '）\n\n' + report.join('\n\n') + '\n');
}

main().catch(e => { say('エラー：' + e.message); finish(); process.exit(1); });
