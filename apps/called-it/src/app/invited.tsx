import { Button, Notice, Screen, Text, TextField, useTheme } from '@five/shell';
import { ClipboardPasteButton, type PasteEventPayload } from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { looksLikeInviteCode, normalizeInviteCode } from '@/compete/standings';
import { inviteCodeFromPaste } from '@/invite/deferredInvite';

/**
 * Shown once on iOS after sign-up when the clipboard holds a link (UNJ-1425):
 * the invite page copies the league link before sending new players to the
 * App Store. The system paste button reads it without a permission prompt.
 */
export default function InvitedScreen() {
  const theme = useTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = (c: string) => router.replace({ pathname: '/join/[code]', params: { code: c } });
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const onPaste = (data: PasteEventPayload) => {
    const found = data.type === 'text' ? inviteCodeFromPaste(data.text) : null;
    if (found) open(found);
    else setError("That doesn't look like a Called It invite. Type the code instead, or skip.");
  };

  return (
    <Screen centered>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="title">Invited by a friend?</Text>
        <Text color="textSecondary">
          If you came from a friend&apos;s link, paste it to join their league. You can also join later from the
          Leagues tab.
        </Text>
      </View>
      <ClipboardPasteButton
        onPress={onPaste}
        acceptedContentTypes={['url', 'plain-text']}
        displayMode="iconAndLabel"
        backgroundColor={theme.colors.primary}
        foregroundColor={theme.colors.textOnPrimary}
        style={{ height: theme.spacing.xl + theme.spacing.md, width: '100%' }}
      />
      {error ? <Notice tone="error" title="No invite found" body={error} /> : null}
      <TextField
        label="Or type the invite code"
        value={code}
        onChangeText={setCode}
        placeholder="ABCD2345"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={12}
      />
      <Button title="Find league" variant="secondary" onPress={() => open(normalizeInviteCode(code))} disabled={!looksLikeInviteCode(code)} />
      <Button title="Skip" variant="secondary" onPress={close} />
    </Screen>
  );
}
