import { Button, Notice, Screen, Text, useOnboarding } from '@five/shell';

/**
 * Placeholder paywall that ends onboarding, as in the template. The real
 * paywall and trial come from the shell paywall work (UNJ-1417); it should
 * call `markComplete` the same way once the user subscribes or skips.
 */
export default function PaywallPlaceholder() {
  const { markComplete } = useOnboarding();
  return (
    <Screen centered>
      <Text variant="title" accessibilityRole="header">
        Start your free trial
      </Text>
      <Notice
        title="Plans are not set up yet"
        body="You can keep using the free version for now: one workout game a day."
      />
      <Button title="Continue" onPress={() => markComplete().catch(() => undefined)} />
    </Screen>
  );
}
