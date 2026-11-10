import { Button, Notice, Screen, Text, useOnboarding } from '@five/shell';

/**
 * Placeholder paywall that ends onboarding. The real paywall and plans come
 * from the shell paywall work (UNJ-1417); it should call `markComplete` the
 * same way once the user subscribes or skips.
 */
export default function PaywallPlaceholder() {
  const { markComplete } = useOnboarding();
  return (
    <Screen centered>
      <Text variant="title" accessibilityRole="header">
        Go Pro
      </Text>
      <Notice
        title="Plans are not set up yet"
        body="You can keep using the free version for now."
      />
      <Button title="Continue" onPress={() => markComplete().catch(() => undefined)} />
    </Screen>
  );
}
