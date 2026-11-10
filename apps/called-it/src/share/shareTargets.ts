import { Linking, Platform } from 'react-native';
import Share, { Social } from 'react-native-share';

import { xIntentUrl } from './resultsCard';

export type ShareTarget = 'messages' | 'instagram' | 'x' | 'more';

export type SharePayload = {
  /** The captured card, a file:// URI. */
  imageUri: string;
  /** The full message with the invite link. */
  message: string;
  /** The shorter X line; the link is added separately. */
  shortMessage: string;
  url: string;
  metaAppId: string | null;
};

/** A share the player backed out of is not an error. */
export function isShareCancel(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e);
  return /cancel|dismiss|User did not share/i.test(message);
}

/**
 * One tap to each place the issue names (UNJ-1425). Messages and More attach
 * the card image and the message with the link. Instagram Stories takes only
 * the image (the invite link is printed on it). X gets the text and the link;
 * X's composer cannot take an image from another app, so the card is not attached there.
 */
export async function shareTo(target: ShareTarget, p: SharePayload): Promise<void> {
  switch (target) {
    case 'messages':
      await Share.shareSingle({ social: Social.Sms, message: p.message, url: p.imageUri, type: 'image/png' });
      return;
    case 'instagram':
      if (!p.metaAppId) throw new Error('Instagram Stories needs EXPO_PUBLIC_META_APP_ID.');
      await Share.shareSingle({
        social: Social.InstagramStories,
        appId: p.metaAppId,
        backgroundImage: p.imageUri,
        attributionURL: p.url,
      });
      return;
    case 'x':
      await Linking.openURL(xIntentUrl(p.shortMessage, p.url));
      return;
    case 'more':
      await Share.open({ url: p.imageUri, message: p.message, type: 'image/png', failOnCancel: false });
      return;
  }
}

/** Is Instagram installed? Stories sharing needs the app itself. */
export async function hasInstagram(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') return Boolean((await Share.isPackageInstalled('com.instagram.android'))?.isInstalled);
    // iOS: the instagram-stories scheme is listed in LSApplicationQueriesSchemes (app.config.ts).
    return await Linking.canOpenURL('instagram-stories://share');
  } catch {
    return false;
  }
}
