// 路線の制覇率：駅の一覧（訪問済みに印）

import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Button, colors, Panel, ProgressBar, SectionTitle, styles } from '../../components/ui';
import { useApp } from '../../lib/AppState';
import { formatDateTime, stationKey } from '../../lib/geo';
import { collectLines, completion, visitedStationKeys } from '../../lib/lines';
import { fetchLineStations } from '../../lib/overpass';
import { loadLineCache, saveLineCache } from '../../lib/storage';
import type { LineStationsCache } from '../../lib/types';

export default function LineDetail() {
  const params = useLocalSearchParams<{ name: string }>();
  const name = safeDecode(String(params.name ?? ''));
  const { cards, ready } = useApp();
  const line = useMemo(() => collectLines(cards).find((l) => l.name === name), [cards, name]);
  const visited = useMemo(() => visitedStationKeys(cards), [cards]);
  const [cache, setCache] = useState<LineStationsCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!line) return;
    setLoading(true);
    setError(null);
    try {
      const stations = await fetchLineStations(line);
      const next = { fetchedAt: Date.now(), stations };
      await saveLineCache(line.name, next);
      setCache(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '駅の一覧を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }, [line]);

  // まずキャッシュを見て、無ければ Overpass から取得
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      const c = await loadLineCache(name);
      if (!alive) return;
      if (c) {
        setCache(c);
        setLoading(false);
      } else if (line) {
        await refresh();
      } else {
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, ready]);

  const stat = cache ? completion(cache.stations, visited) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: name || '路線' }} />
      <Panel>
        <Text style={styles.h1}>{name}</Text>
        {stat ? (
          <>
            <Text style={[styles.body, { fontSize: 18, fontWeight: '700' }]}>
              訪問済み{stat.done}/全{stat.total}駅（{stat.percent}%）
            </Text>
            <ProgressBar percent={stat.percent} />
          </>
        ) : null}
        {loading && (
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.muted}>OpenStreetMap で駅の一覧を取得しています…</Text>
          </View>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
        {!line && <Text style={styles.muted}>この路線のカードはもうありません。</Text>}
        {cache && (
          <Text style={styles.muted}>駅の一覧は {formatDateTime(cache.fetchedAt)} に取得したものです。</Text>
        )}
        {line && <Button label="駅の一覧を取り直す" kind="secondary" onPress={refresh} loading={loading} />}
      </Panel>

      {cache && cache.stations.length === 0 && (
        <Text style={styles.muted}>OpenStreetMap にこの路線の駅の情報が見つかりませんでした。</Text>
      )}
      {cache && cache.stations.length > 0 && (
        <Panel>
          <SectionTitle>駅の一覧</SectionTitle>
          {cache.stations.map((s, i) => {
            const done = visited.has(stationKey(s.name));
            return (
              <View key={`${s.name}-${i}`} style={[styles.row, { paddingVertical: 4 }]}>
                <Text style={{ width: 28, fontSize: 18, color: done ? colors.primary : '#c9c1b2' }}>{done ? '●' : '○'}</Text>
                <Text style={[styles.body, done && { fontWeight: '700', color: colors.primary }]}>{s.name}</Text>
                {done && <Text style={styles.muted}>訪問済み</Text>}
              </View>
            );
          })}
        </Panel>
      )}
    </ScrollView>
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
