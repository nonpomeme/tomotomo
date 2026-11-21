// 散歩を終えたあと：駅を選んで、キャッチコピーを付けて保存する

import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import WalkMap from '../components/WalkMap';
import { Button, Chips, colors, Panel, SectionTitle, styles } from '../components/ui';
import { useApp } from '../lib/AppState';
import { confirmAsync } from '../lib/confirm';
import { formatDistance, formatDuration, newId, routeLengthMeters } from '../lib/geo';
import { fetchNearbyStations, type NearbyStation } from '../lib/overpass';
import type { Card } from '../lib/types';

export default function Finish() {
  const { walk, addCard, discardWalk, resumeWalk } = useApp();
  const [stations, setStations] = useState<NearbyStation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<NearbyStation | null>(null);
  const [name, setName] = useState('');
  const [catchphrase, setCatchphrase] = useState('');
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);

  const start = walk?.route[0];

  const search = useCallback(async () => {
    if (!start) return;
    setLoading(true);
    setError(null);
    try {
      setStations(await fetchNearbyStations(start.lat, start.lon));
    } catch (e) {
      setError(e instanceof Error ? e.message : '駅を検索できませんでした。');
    } finally {
      setLoading(false);
    }
  }, [start?.lat, start?.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    search();
  }, [search]);

  if (!walk) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.body}>保存する散歩がありません。</Text>
        <Button label="ホームに戻る" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  const choose = (s: NearbyStation) => {
    setSelected(s);
    setName(s.name);
  };

  const onChangeName = (t: string) => {
    setName(t);
    if (selected && t !== selected.name) setSelected(null);
  };

  const canSave = name.trim().length > 0 && catchphrase.trim().length > 0;

  const onSave = async () => {
    if (!canSave || savedRef.current) return;
    savedRef.current = true;
    setSaving(true);
    const card: Card = {
      id: newId(),
      createdAt: Date.now(),
      startedAt: walk.startedAt,
      endedAt: walk.endedAt ?? Date.now(),
      station: selected
        ? { name: selected.name, lat: selected.lat, lon: selected.lon, lines: selected.lines }
        : { name: name.trim(), lines: [] },
      catchphrase: catchphrase.trim(),
      route: walk.route,
      pins: walk.pins,
      answer: '',
    };
    await addCard(card);
    router.replace(`/card/${card.id}`);
    discardWalk();
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Panel>
        <Text style={styles.h2}>おつかれさまでした</Text>
        <Text style={styles.muted}>
          {formatDuration((walk.endedAt ?? Date.now()) - walk.startedAt)}・{formatDistance(routeLengthMeters(walk.route))}・ピン {walk.pins.length} 個
        </Text>
        <WalkMap route={walk.route} pins={walk.pins} station={selected ?? undefined} height={240} />
      </Panel>

      <SectionTitle>歩き始めた地点から1km以内の駅</SectionTitle>
      {loading && (
        <View style={[styles.row, { paddingVertical: 8 }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>OpenStreetMap で駅を探しています…</Text>
        </View>
      )}
      {error && (
        <Panel>
          <Text style={styles.error}>{error}</Text>
          <Button label="もう一度さがす" kind="secondary" onPress={search} />
        </Panel>
      )}
      {stations && stations.length === 0 && !loading && (
        <Text style={styles.muted}>近くに駅が見つかりませんでした。下に駅名を入力してください。</Text>
      )}
      {stations?.map((s) => {
        const active = selected?.name === s.name;
        return (
          <Pressable key={s.name} onPress={() => choose(s)} accessibilityRole="radio" accessibilityState={{ selected: active }}>
            <Panel style={active ? { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.soft } : undefined}>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <Text style={styles.h2}>
                  {active ? '✓ ' : ''}
                  {s.name}
                </Text>
                <Text style={styles.muted}>{formatDistance(s.distance)}</Text>
              </View>
              {s.lines.length > 0 ? (
                <Chips items={s.lines.map((l) => l.name)} />
              ) : (
                <Text style={styles.muted}>路線の情報がありません</Text>
              )}
            </Panel>
          </Pressable>
        );
      })}

      <Panel>
        <SectionTitle>駅名</SectionTitle>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={onChangeName}
          placeholder="候補から選ぶか、駅名を入力"
          placeholderTextColor="#a59c8c"
        />
        {!selected && name.trim().length > 0 && (
          <Text style={styles.muted}>手入力の駅には路線が付きません（路線の制覇率には数えられません）。</Text>
        )}
        <SectionTitle>一言キャッチコピー</SectionTitle>
        <TextInput
          style={styles.input}
          value={catchphrase}
          onChangeText={setCatchphrase}
          placeholder="例：坂と銭湯と、ゆっくり流れる時間の街"
          placeholderTextColor="#a59c8c"
          maxLength={60}
        />
        <Button label="街カードを保存" onPress={onSave} disabled={!canSave} loading={saving} />
      </Panel>

      <View style={{ gap: 10 }}>
        <Button
          label="散歩を続ける"
          kind="secondary"
          onPress={async () => {
            await resumeWalk();
            router.dismissTo('/');
          }}
        />
        <Button
          label="保存せずに記録を捨てる"
          kind="danger"
          onPress={async () => {
            if (await confirmAsync('記録を捨てますか？', 'この散歩の記録は元に戻せません。', '捨てる')) {
              discardWalk();
              router.dismissTo('/');
            }
          }}
        />
      </View>
    </ScrollView>
  );
}
