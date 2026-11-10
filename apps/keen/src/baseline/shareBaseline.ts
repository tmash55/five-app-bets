import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { Share } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import type { BaselineResult } from './baseline';
import type { ShareCardRef } from './ShareCard';

export function shareMessage(result: BaselineResult, appName: string): string {
  return `My ${appName} baseline is ${result.keenScore}. 60 seconds of memory and math. Can you beat it?`;
}

/**
 * Shares the baseline card as an image through the system share sheet. Falls
 * back to sharing the score as text when the image can't be made or the
 * device can't share files. Returns how it was shared.
 */
export async function shareBaseline(
  card: RefObject<ShareCardRef | null>,
  result: BaselineResult,
  appName: string,
): Promise<'image' | 'text'> {
  const message = shareMessage(result, appName);
  try {
    if (card.current && (await Sharing.isAvailableAsync())) {
      const uri = await captureRef(card, { format: 'png', quality: 1 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: message, UTI: 'public.png' });
      return 'image';
    }
  } catch {
    // Fall through to sharing text.
  }
  await Share.share({ message });
  return 'text';
}
