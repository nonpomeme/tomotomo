// AsyncStorage への保存（Web では localStorage が使われる）

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Card, LineStationsCache, Walk } from './types';

const KEYS = {
  cards: 'machicard:v1:cards',
  activeWalk: 'machicard:v1:activeWalk',
  lineCache: (name: string) => `machicard:v1:line:${name}`,
};

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function loadCards(): Promise<Card[]> {
  const cards = await readJson<Card[]>(KEYS.cards);
  return Array.isArray(cards) ? cards : [];
}

export function saveCards(cards: Card[]): Promise<void> {
  return writeJson(KEYS.cards, cards);
}

export function loadActiveWalk(): Promise<Walk | null> {
  return readJson<Walk>(KEYS.activeWalk);
}

export async function saveActiveWalk(walk: Walk | null): Promise<void> {
  if (walk) await writeJson(KEYS.activeWalk, walk);
  else await AsyncStorage.removeItem(KEYS.activeWalk);
}

export function loadLineCache(name: string): Promise<LineStationsCache | null> {
  return readJson<LineStationsCache>(KEYS.lineCache(name));
}

export function saveLineCache(name: string, cache: LineStationsCache): Promise<void> {
  return writeJson(KEYS.lineCache(name), cache);
}
