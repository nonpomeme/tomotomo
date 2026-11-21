// ホーム：散歩の開始・散歩中の記録・保存したカードの一覧

import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import WalkMap from '../components/WalkMap';
import { Button, Chips, colors, Panel, SectionTitle, styles } from '../components/ui';
import { useApp } from '../lib/AppState';
import { confirmAsync } from '../lib/confirm';
import { formatDateTime, formatDistance, formatDuration, routeLengthMeters } from '../lib/geo';

export default function Home() {
  const { ready, cards, walk, tracking, locationError, startWalk, addPin, endWalk, discardWalk } = useApp();
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState<'start' | 'pin' | null>(null);
  const [now, setNow] = useState(Date.now());

  const walking = !!walk && !walk.endedAt;

  // 散歩中は経過時間を更新
  useEffect(() => {
    if (!walking) return;
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [walking]);

  if (!ready) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const onStart = async () => {
    setBusy('start');
    await startWalk();
    setBusy(null);
  };

  const onPin = async () => {
    setBusy('pin');
    const ok = await addPin(memo);
    if (ok) setMemo('');
    setBusy(null);
  };

  const onEnd = () => {
    endWalk();
    router.push('/finish');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {walking && walk ? (
        <Panel>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={styles.h2}>散歩中</Text>
            <Text style={styles.muted}>{tracking ? '● 位置を記録しています' : '位置の記録が止まっています'}</Text>
          </View>
          <Text style={styles.muted}>
            {formatDuration(now - walk.startedAt)}・{formatDistance(routeLengthMeters(walk.route))}・記録 {walk.route.length} 点・ピン {walk.pins.length} 個
          </Text>
          <WalkMap route={walk.route} pins={walk.pins} follow height={300} />
          <TextInput
            style={styles.input}
            value={memo}
            onChangeText={setMemo}
            placeholder="メモ（例：古い銭湯がある、坂の名前が気になる）"
            placeholderTextColor="#a59c8c"
            returnKeyType="done"
            onSubmitEditing={onPin}
          />
          <Button label="ここにピン" onPress={onPin} loading={busy === 'pin'} />
          {walk.pins.length > 0 && (
            <View style={{ gap: 4 }}>
              {walk.pins.map((p, i) => (
                <Text key={p.id} style={styles.muted}>
                  📍{i + 1}. {p.memo || '（メモなし）'}
                </Text>
              ))}
            </View>
          )}
          <Button label="散歩を終える" kind="secondary" onPress={onEnd} />
        </Panel>
      ) : walk?.endedAt ? (
        <Panel>
          <Text style={styles.h2}>まだ保存していない散歩があります</Text>
          <Text style={styles.muted}>{formatDateTime(walk.startedAt)} から歩いた記録です。</Text>
          <Button label="街カードをつくる" onPress={() => router.push('/finish')} />
          <Button
            label="記録を捨てる"
            kind="danger"
            onPress={async () => {
              if (await confirmAsync('記録を捨てますか？', 'この散歩の記録は元に戻せません。', '捨てる')) discardWalk();
            }}
          />
        </Panel>
      ) : (
        <Panel style={{ alignItems: 'stretch' }}>
          <Text style={styles.h1}>街を歩いて、カードにしよう</Text>
          <Text style={styles.body}>
            歩いたルートと気になった場所を記録して、最寄り駅の「街カード」をつくります。
          </Text>
          <Button label="散歩スタート" onPress={onStart} loading={busy === 'start'} />
        </Panel>
      )}

      {locationError && <Text style={styles.error}>{locationError}</Text>}

      <View style={[styles.row, { justifyContent: 'space-between', marginTop: 4 }]}>
        <SectionTitle>保存した街カード（{cards.length}枚）</SectionTitle>
        {cards.length > 0 && (
          <Link href="/lines" style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>
            路線の制覇率 ›
          </Link>
        )}
      </View>

      {cards.length === 0 ? (
        <Text style={styles.muted}>まだカードはありません。散歩をして最初の1枚をつくりましょう。</Text>
      ) : (
        cards.map((c) => (
          <Pressable key={c.id} onPress={() => router.push(`/card/${c.id}`)}>
            {({ pressed }) => (
              <Panel style={{ opacity: pressed ? 0.85 : 1 }}>
                <Text style={styles.h2}>{c.station.name}</Text>
                <Text style={[styles.body, { fontStyle: 'italic' }]}>「{c.catchphrase}」</Text>
                <Chips items={c.station.lines.map((l) => l.name)} />
                <Text style={styles.muted}>
                  {formatDateTime(c.startedAt)}・{formatDistance(routeLengthMeters(c.route))}・ピン {c.pins.length} 個
                  {c.answer ? '・答え合わせ済み' : ''}
                </Text>
              </Panel>
            )}
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}
