import { useState } from 'react';
import { Alert } from 'react-native';

import { useAuth } from '../auth/AuthProvider';
import { friendlyAuthError } from '../auth/errors';
import { usePurchases } from '../purchases/PurchasesProvider';
import { Notice } from '../ui/Notice';
import { Screen } from '../ui/Screen';
import { SettingsRow, SettingsSection } from '../ui/SettingsRow';
import { Text } from '../ui/Text';

type Busy = 'restore' | 'sign-out' | 'delete' | null;

export function SettingsScreen({ appName, appVersion }: { appName: string; appVersion: string }) {
  const auth = useAuth();
  const purchases = usePurchases();
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  async function run(action: Exclude<Busy, null>, task: () => Promise<string | void>) {
    setBusy(action);
    setMessage(null);
    try {
      const text = await task();
      if (text) setMessage({ tone: 'info', text });
    } catch (error) {
      setMessage({ tone: 'error', text: friendlyAuthError(error) });
    } finally {
      setBusy(null);
    }
  }

  function restore() {
    run('restore', async () => {
      const { activeEntitlements } = await purchases.restore();
      return activeEntitlements.length
        ? `Restored: ${activeEntitlements.join(', ')}.`
        : 'No purchases found for this account.';
    });
  }

  function confirmDelete() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and data. Subscriptions are managed by the App Store or Google Play and must be cancelled there.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => run('delete', () => auth.deleteAccount()),
        },
      ],
    );
  }

  return (
    <Screen>
      <Text variant="title">Settings</Text>
      {message ? <Notice tone={message.tone} title={message.text} /> : null}

      <SettingsSection title="Account">
        <SettingsRow label="Signed in as" detail={auth.session?.user.email ?? 'Not signed in'} />
        <SettingsRow
          label="Sign out"
          onPress={() => run('sign-out', () => auth.signOut())}
          loading={busy === 'sign-out'}
          disabled={!auth.session}
        />
      </SettingsSection>

      <SettingsSection title="Purchases">
        <SettingsRow
          label="Restore purchases"
          detail={purchases.configured ? undefined : 'Purchases are not set up for this build yet.'}
          onPress={restore}
          loading={busy === 'restore'}
          disabled={!purchases.configured}
        />
      </SettingsSection>

      <SettingsSection title="Danger zone">
        <SettingsRow
          label="Delete account"
          destructive
          onPress={confirmDelete}
          loading={busy === 'delete'}
          disabled={!auth.session}
        />
      </SettingsSection>

      <Text variant="caption" color="textSecondary">
        {appName} {appVersion}
      </Text>
    </Screen>
  );
}
