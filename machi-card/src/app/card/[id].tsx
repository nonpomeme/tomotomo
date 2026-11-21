// 街カードの詳細：地図・答え合わせ・削除

import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, TextInput, View } from 'react-native';
import WalkMap from '../../components/WalkMap';
import { Button, Chips, Panel, SectionTitle, styles } from '../../components/ui';
import { useApp } from '../../lib/AppState';
import { confirmAsync, notify } from '../../lib/confirm';
import { formatDateTime, formatDistance, formatDuration, routeLengthMeters } from '../../lib/geo';
import { buildQuestion } from '../../lib/prompt';

const CLAUDE_URL = 'https://claude.ai/new';

export default function CardDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cards, ready, updateCard, deleteCard } = useApp();
  const card = cards.find((c) => c.id === id);
  const [showMap, setShowMap] = useState(false);
  const [answer, setAnswer] = useState(card?.answer ?? '');
  const [copied, setCopied] = useState(false);
  const [savedAnswer, setSavedAnswer] = useState(false);

  useEffect(() => {
    if (card) setAnswer(card.answer);
    // カードが読み込まれたときだけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  if (!ready) return null;
  if (!card) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.body}>このカードは見つかりませんでした。</Text>
        <Button label="ホームに戻る" onPress={() => router.dismissTo('/')} />
      </View>
    );
  }

  const onCopy = async () => {
    await Clipboard.setStringAsync(buildQuestion(card));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const onOpenClaude = async () => {
    try {
      await Linking.openURL(CLAUDE_URL);
    } catch {
      notify('Claude を開けませんでした', CLAUDE_URL);
    }
  };

  const onSaveAnswer = async () => {
    await updateCard(card.id, { answer: answer.trim() });
    setSavedAnswer(true);
    setTimeout(() => setSavedAnswer(false), 2500);
  };

  const onDelete = async () => {
    if (await confirmAsync('このカードを削除しますか？', `「${card.station.name}」のカードを削除します。元に戻せません。`, '削除')) {
      await deleteCard(card.id);
      router.dismissTo('/');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: card.station.name }} />
      <Panel>
        <Text style={styles.h1}>{card.station.name}</Text>
        <Text style={[styles.body, { fontSize: 17, fontStyle: 'italic' }]}>「{card.catchphrase}」</Text>
        <Chips items={card.station.lines.map((l) => l.name)} />
        <Text style={styles.muted}>
          {formatDateTime(card.startedAt)}・{formatDuration(card.endedAt - card.startedAt)}・
          {formatDistance(routeLengthMeters(card.route))}
        </Text>
        <Button label={showMap ? '地図を閉じる' : '地図を見る'} kind="secondary" onPress={() => setShowMap((v) => !v)} />
        {showMap && <WalkMap route={card.route} pins={card.pins} station={card.station} height={340} />}
      </Panel>

      {card.pins.length > 0 && (
        <Panel>
          <SectionTitle>ピンのメモ</SectionTitle>
          {card.pins.map((p, i) => (
            <Text key={p.id} style={styles.body}>
              📍{i + 1}. {p.memo || '（メモなし）'}
            </Text>
          ))}
        </Panel>
      )}

      <Panel>
        <SectionTitle>答え合わせ</SectionTitle>
        <Text style={styles.muted}>
          質問文をコピーして Claude に貼り付けると、この街の歴史や地名の由来を教えてもらえます。答えはここに貼って保存できます。
        </Text>
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          <Button label={copied ? 'コピーしました' : '質問文をコピー'} onPress={onCopy} style={{ flexGrow: 1 }} />
          <Button label="Claudeを開く" kind="secondary" onPress={onOpenClaude} style={{ flexGrow: 1 }} />
        </View>
        <TextInput
          style={[styles.input, { minHeight: 160, textAlignVertical: 'top' }]}
          value={answer}
          onChangeText={setAnswer}
          placeholder="Claude の答えをここに貼り付け"
          placeholderTextColor="#a59c8c"
          multiline
        />
        <Button
          label={savedAnswer ? '保存しました' : '答えを保存'}
          kind="secondary"
          onPress={onSaveAnswer}
          disabled={answer.trim() === card.answer}
        />
      </Panel>

      <Button label="このカードを削除" kind="danger" onPress={onDelete} />
    </ScrollView>
  );
}
