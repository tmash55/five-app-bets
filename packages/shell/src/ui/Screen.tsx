import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';

export function Screen({ children, centered = false }: { children: ReactNode; centered?: boolean }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: theme.colors.background }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            { padding: theme.spacing.lg, gap: theme.spacing.md },
            centered && styles.centered,
          ]}>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { flexGrow: 1, justifyContent: 'center' },
});
