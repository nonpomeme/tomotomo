// アプリの classic script（src/*.js）を Node の中で読み込み、グローバル定数を取り出す。
// 教材生成と検証が、アプリと同じデータ（サンプル3テーマ・知識ノード）と同じチェックを使うため。
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadApp(files = ['src/data.js', 'src/content-schema.js']) {
  const ctx = vm.createContext({ console });
  for (const f of files) {
    if (fs.existsSync(path.join(ROOT, f))) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  return vm.runInContext(`({ SKILLS, MAP_CATS, NODES, REL_LABEL, EDGES, INDUSTRIES, INTEREST_OPTIONS, TOPICS,
    validateTopic: typeof validateTopic === 'function' ? validateTopic : null,
    CONTENT_RULES: typeof CONTENT_RULES === 'object' ? CONTENT_RULES : null })`, ctx);
}
