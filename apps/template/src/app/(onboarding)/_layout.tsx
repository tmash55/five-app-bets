import { useTheme } from '@five/shell';
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    />
  );
}
