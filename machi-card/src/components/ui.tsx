// 共通の見た目（ボタン・カード枠・色）

import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export const colors = {
  bg: '#faf7f0',
  card: '#ffffff',
  ink: '#2b2620',
  sub: '#6b6255',
  line: '#e4ddcf',
  primary: '#2f6f4f',
  primaryInk: '#ffffff',
  accent: '#d9534f',
  soft: '#eef4ef',
};

type ButtonProps = {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, kind = 'primary', disabled, loading, style }: ButtonProps) {
  const bg = kind === 'primary' ? colors.primary : kind === 'danger' ? '#fff5f4' : colors.card;
  const fg = kind === 'primary' ? colors.primaryInk : kind === 'danger' ? colors.accent : colors.primary;
  const border = kind === 'primary' ? colors.primary : kind === 'danger' ? '#f1c6c4' : colors.line;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.btnText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function ProgressBar({ percent }: { percent: number }) {
  return (
    <View style={styles.barBg}>
      <View style={[styles.barFg, { width: `${Math.max(0, Math.min(100, percent))}%` }]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 48, gap: 14, width: '100%', maxWidth: 720, alignSelf: 'center' },
  btn: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '700' },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  section: { fontSize: 13, fontWeight: '700', color: colors.sub, letterSpacing: 0.5 },
  h1: { fontSize: 22, fontWeight: '800', color: colors.ink },
  h2: { fontSize: 18, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  muted: { fontSize: 13, color: colors.sub, lineHeight: 19 },
  error: { fontSize: 14, color: colors.accent, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: '#fffdf8',
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.soft,
  },
  chipText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  barBg: { height: 12, borderRadius: 6, backgroundColor: '#e9e4d8', overflow: 'hidden' },
  barFg: { height: '100%', backgroundColor: colors.primary, borderRadius: 6 },
});

export function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {items.map((t) => (
        <View key={t} style={styles.chip}>
          <Text style={styles.chipText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}
