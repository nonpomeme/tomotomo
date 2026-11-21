// ネイティブ版（iOS / Android）では地図を表示せず、代わりの文言だけ出す

import { StyleSheet, Text, View } from 'react-native';
import type { WalkMapProps } from './WalkMap.types';

export default function WalkMap({ route, pins, height = 160 }: WalkMapProps) {
  return (
    <View style={[styles.box, { minHeight: Math.min(height, 160) }]}>
      <Text style={styles.title}>地図は Web 版で表示できます</Text>
      <Text style={styles.sub}>
        記録した地点 {route.length} 点・ピン {pins.length} 個
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: 12,
    backgroundColor: '#ece7dc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  title: { fontSize: 15, fontWeight: '600', color: '#4a4236' },
  sub: { marginTop: 6, fontSize: 13, color: '#6b6255' },
});
