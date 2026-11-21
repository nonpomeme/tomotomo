// 保存したカードから路線を集める・制覇率を計算する

import { stationKey } from './geo';
import type { Card, LineRef, LineStation } from './types';

export type LineSummary = LineRef & { cardCount: number };

export function collectLines(cards: Card[]): LineSummary[] {
  const map = new Map<string, { ids: Set<number>; cards: Set<string> }>();
  for (const c of cards) {
    for (const l of c.station.lines) {
      const e = map.get(l.name) ?? { ids: new Set<number>(), cards: new Set<string>() };
      l.relationIds.forEach((id) => e.ids.add(id));
      e.cards.add(c.id);
      map.set(l.name, e);
    }
  }
  return [...map]
    .map(([name, e]) => ({ name, relationIds: [...e.ids].sort((a, b) => a - b), cardCount: e.cards.size }))
    .sort((a, b) => b.cardCount - a.cardCount || a.name.localeCompare(b.name, 'ja'));
}

export function visitedStationKeys(cards: Card[]): Set<string> {
  return new Set(cards.map((c) => stationKey(c.station.name)));
}

export function completion(stations: LineStation[], visited: Set<string>) {
  const total = stations.length;
  const done = stations.filter((s) => visited.has(stationKey(s.name))).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, percent };
}
