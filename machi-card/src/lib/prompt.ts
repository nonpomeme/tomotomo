// Claude に答え合わせを頼む質問文を作る

import { formatDate } from './geo';
import type { Card } from './types';

export function buildQuestion(card: Card): string {
  const lines = card.station.lines.map((l) => l.name);
  const memos = card.pins.map((p) => p.memo.trim()).filter(Boolean);

  const parts = [
    '今日、街歩きをしました。この街について答え合わせをお願いします。',
    '',
    `・駅：${card.station.name}`,
    `・路線：${lines.length ? lines.join('、') : '（不明）'}`,
    `・歩いた日：${formatDate(card.startedAt)}`,
    `・私が付けたキャッチコピー：「${card.catchphrase}」`,
  ];
  if (memos.length) {
    parts.push('・歩きながら書いたメモ：');
    memos.forEach((m) => parts.push(`　- ${m}`));
  }
  parts.push(
    '',
    '知りたいこと：',
    '1. この駅と周辺の街の歴史（どんなふうに街ができて、どう変わってきたか）',
    '2. 駅名・地名の由来',
    '3. 私のキャッチコピーやメモが、街の歴史や地名の由来とどのくらい合っているかの答え合わせ',
    '4. 次にこの街を歩くときに見ておくとよい場所',
    '',
    '確かな事実と、推測や諸説があることは分けて書いてください。',
  );
  return parts.join('\n');
}
