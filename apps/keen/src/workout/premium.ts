/**
 * Whether the player has Keen Premium.
 *
 * The paywall and the entitlement check belong to the shell paywall issue
 * (UNJ-1417), which waits on the store and RevenueCat accounts (UNJ-1414).
 * Until it lands every player is free, so the free tier is what ships.
 *
 * For trying the whole workout in a development build only, set
 * EXPO_PUBLIC_KEEN_DEV_PREMIUM=1 in .env. Release builds ignore it.
 */
export function usePremium(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_KEEN_DEV_PREMIUM === '1';
}
