/**
 * Start loading a pack's card pictures before they are needed, so a card never turns over onto a picture that
 * is still on its way (in a development build the pictures come over the network from the bundler).
 */

import { Asset } from 'expo-asset';
import { Image } from 'expo-image';

import { cardArt } from '@/data/roster';

export function preloadArt(playerIds: readonly string[]): void {
  try {
    const uris = playerIds
      .map((id) => cardArt(id))
      .filter((m): m is number => m !== undefined)
      .map((m) => Asset.fromModule(m).uri)
      .filter((u): u is string => !!u);
    if (uris.length > 0) Image.prefetch(uris, 'memory-disk').catch(() => {});
  } catch {
    // a picture that cannot be fetched ahead simply loads when it is drawn, as it always did
  }
}
