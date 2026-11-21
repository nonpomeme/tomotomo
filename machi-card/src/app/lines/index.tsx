// 路線の一覧（保存したカードに出てくる路線）

import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Panel, ProgressBar, styles } from '../../components/ui';
import { useApp } from '../../lib/AppState';
import { collectLines, completion, visitedStationKeys } from '../../lib/lines';
import { loadLineCache } from '../../lib/storage';
import type { LineStationsCache } from '../../lib/types';

export default function Lines() {
  const { cards } = useApp();
  const lines = useMemo(() => collectLines(cards), [cards]);
  const visited = useMemo(() => visitedStationKeys(cards), [cards]);
  const [caches, setCaches] = useState<Record<string, LineStationsCache | null>>({});

  // 画面に戻るたびに、取得済みの駅一覧（キャッシュ）を読み直す
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all(lines.map(async (l) => [l.name, await loadLineCache(l.name)] as const)).then((entries) => {
        if (alive) setCaches(Object.fromEntries(entries));
      });
      return () => {
        alive = false;
      };
    }, [lines]),
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {lines.length === 0 ? (
        <Text style={styles.muted}>
          まだ路線がありません。散歩のあと、候補の駅を選んでカードを保存すると、その駅の路線がここに出てきます。
        </Text>
      ) : (
        <Text style={styles.muted}>路線をタップすると、駅の一覧と訪問済みの駅がわかります。</Text>
      )}
      {lines.map((l) => {
        const cache = caches[l.name];
        const c = cache ? completion(cache.stations, visited) : null;
        return (
          <Pressable key={l.name} onPress={() => router.push(`/lines/${encodeURIComponent(l.name)}`)}>
            {({ pressed }) => (
              <Panel style={{ opacity: pressed ? 0.85 : 1 }}>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Text style={[styles.h2, { flexShrink: 1 }]}>{l.name}</Text>
                  <Text style={styles.muted}>カード {l.cardCount} 枚 ›</Text>
                </View>
                {c ? (
                  <>
                    <Text style={styles.body}>
                      訪問済み{c.done}/全{c.total}駅（{c.percent}%）
                    </Text>
                    <ProgressBar percent={c.percent} />
                  </>
                ) : (
                  <Text style={styles.muted}>タップして駅の一覧を取得</Text>
                )}
              </Panel>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
