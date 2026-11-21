// アプリ全体の状態：保存したカードと、進行中の散歩

import * as Location from 'expo-location';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newId } from './geo';
import { loadActiveWalk, loadCards, saveActiveWalk, saveCards } from './storage';
import type { Card, GeoPoint, Pin, Walk } from './types';

type AppState = {
  ready: boolean;
  cards: Card[];
  walk: Walk | null;
  /** 位置の記録中か */
  tracking: boolean;
  locationError: string | null;
  startWalk: () => Promise<boolean>;
  addPin: (memo: string) => Promise<boolean>;
  /** 散歩を終える（記録を止めて終了時刻を入れる） */
  endWalk: () => void;
  /** 終えた散歩をもう一度続ける */
  resumeWalk: () => Promise<void>;
  discardWalk: () => void;
  addCard: (card: Card) => Promise<void>;
  updateCard: (id: string, patch: Partial<Card>) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
};

const Ctx = createContext<AppState | null>(null);

const toPoint = (loc: Location.LocationObject): GeoPoint => ({
  lat: loc.coords.latitude,
  lon: loc.coords.longitude,
  t: loc.timestamp || Date.now(),
});

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [walk, setWalk] = useState<Walk | null>(null);
  const [tracking, setTracking] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);
  const cardsRef = useRef<Card[]>([]);

  // 散歩の状態を更新しつつ保存する
  const updateWalk = useCallback((fn: (w: Walk | null) => Walk | null) => {
    setWalk((prev) => {
      const next = fn(prev);
      saveActiveWalk(next).catch(() => {});
      return next;
    });
  }, []);

  const stopWatching = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
    setTracking(false);
  }, []);

  const ensurePermission = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('位置情報の利用が許可されていません。設定から許可してください。');
        return false;
      }
      return true;
    } catch {
      setLocationError('この端末では位置情報を使えません。');
      return false;
    }
  }, []);

  const startWatching = useCallback(async () => {
    if (subRef.current) return;
    try {
      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        (loc) => {
          // 精度が極端に悪い点は捨てる
          if (loc.coords.accuracy != null && loc.coords.accuracy > 200) return;
          const p = toPoint(loc);
          updateWalk((w) => (w && !w.endedAt ? { ...w, route: [...w.route, p] } : w));
        },
        (reason) => setLocationError(`位置の取得に失敗しました：${reason}`),
      );
      setTracking(true);
    } catch {
      setLocationError('位置の記録を始められませんでした。');
    }
  }, [updateWalk]);

  const currentPoint = useCallback(async (): Promise<GeoPoint | null> => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return toPoint(loc);
    } catch {
      return null;
    }
  }, []);

  // 起動時に読み込み。散歩の途中だったら記録を再開する
  useEffect(() => {
    let alive = true;
    (async () => {
      const [c, w] = await Promise.all([loadCards(), loadActiveWalk()]);
      if (!alive) return;
      cardsRef.current = c;
      setCards(c);
      setWalk(w);
      setReady(true);
      if (w && !w.endedAt) {
        const ok = await ensurePermission();
        if (ok && alive) await startWatching();
      }
    })();
    return () => {
      alive = false;
      subRef.current?.remove();
      subRef.current = null;
    };
  }, [ensurePermission, startWatching]);

  const startWalk = useCallback(async () => {
    setLocationError(null);
    const ok = await ensurePermission();
    if (!ok) return false;
    const first = await currentPoint();
    if (!first) {
      setLocationError('現在地を取得できませんでした。屋外でもう一度お試しください。');
      return false;
    }
    // スタート地点をすぐに1点記録
    updateWalk(() => ({ startedAt: Date.now(), route: [first], pins: [] }));
    await startWatching();
    return true;
  }, [currentPoint, ensurePermission, startWatching, updateWalk]);

  const addPin = useCallback(
    async (memo: string) => {
      setLocationError(null);
      let p = await currentPoint();
      if (!p && walk?.route.length) p = { ...walk.route[walk.route.length - 1], t: Date.now() };
      if (!p) {
        setLocationError('現在地を取得できませんでした。');
        return false;
      }
      const pin: Pin = { ...p, id: newId(), memo: memo.trim() };
      updateWalk((w) => (w ? { ...w, pins: [...w.pins, pin], route: [...w.route, p!] } : w));
      return true;
    },
    [currentPoint, updateWalk, walk],
  );

  const endWalk = useCallback(() => {
    stopWatching();
    updateWalk((w) => (w ? { ...w, endedAt: Date.now() } : w));
  }, [stopWatching, updateWalk]);

  const resumeWalk = useCallback(async () => {
    updateWalk((w) => (w ? { ...w, endedAt: undefined } : w));
    if (await ensurePermission()) await startWatching();
  }, [ensurePermission, startWatching, updateWalk]);

  const discardWalk = useCallback(() => {
    stopWatching();
    updateWalk(() => null);
  }, [stopWatching, updateWalk]);

  const commitCards = useCallback(async (next: Card[]) => {
    cardsRef.current = next;
    setCards(next);
    await saveCards(next);
  }, []);

  const addCard = useCallback(
    async (card: Card) => {
      await commitCards([card, ...cardsRef.current]);
    },
    [commitCards],
  );

  const updateCard = useCallback(
    async (id: string, patch: Partial<Card>) => {
      await commitCards(cardsRef.current.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [commitCards],
  );

  const deleteCard = useCallback(
    async (id: string) => {
      await commitCards(cardsRef.current.filter((c) => c.id !== id));
    },
    [commitCards],
  );

  const value = useMemo<AppState>(
    () => ({
      ready, cards, walk, tracking, locationError,
      startWalk, addPin, endWalk, resumeWalk, discardWalk, addCard, updateCard, deleteCard,
    }),
    [ready, cards, walk, tracking, locationError, startWalk, addPin, endWalk, resumeWalk, discardWalk, addCard, updateCard, deleteCard],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppStateProvider がありません');
  return v;
}
