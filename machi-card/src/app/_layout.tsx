import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../components/ui';
import { AppStateProvider } from '../lib/AppState';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.ink, fontWeight: '700' },
            headerBackTitle: '戻る',
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" options={{ title: '街カード' }} />
          <Stack.Screen name="finish" options={{ title: '街カードをつくる' }} />
          <Stack.Screen name="card/[id]" options={{ title: '街カード' }} />
          <Stack.Screen name="lines/index" options={{ title: '路線の制覇率' }} />
          <Stack.Screen name="lines/[name]" options={{ title: '路線' }} />
        </Stack>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}
