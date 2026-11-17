/**
 * Settings for share cards and invite links (UNJ-1425). All of them are
 * optional, and a missing one switches its feature off rather than guessing:
 *
 * - EXPO_PUBLIC_INVITE_LINK_HOST: the web host invite links use, such as
 *   "calledit.app". Unset, links use the app scheme (calledit://join/CODE),
 *   which only works where the app is installed.
 * - EXPO_PUBLIC_META_APP_ID: the Meta (Facebook) app ID Instagram requires
 *   for sharing to Stories. Unset, the Instagram Stories button is hidden.
 */
export type ShareConfig = {
  inviteHost: string | null;
  metaAppId: string | null;
};

/** A bare host name: letters, digits, dots and hyphens, at least one dot, no scheme or path. */
export function isValidHost(host: string): boolean {
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host);
}

export function readShareConfig(env: Record<string, string | undefined>): ShareConfig {
  const host = env.EXPO_PUBLIC_INVITE_LINK_HOST?.trim().toLowerCase() || null;
  if (host && !isValidHost(host)) {
    throw new Error(
      `EXPO_PUBLIC_INVITE_LINK_HOST must be a bare host name such as calledit.app, without https:// or a path (got "${host}").`,
    );
  }
  const appId = env.EXPO_PUBLIC_META_APP_ID?.trim() || null;
  if (appId && !/^\d+$/.test(appId)) {
    throw new Error(`EXPO_PUBLIC_META_APP_ID must be the numeric Meta app ID (got "${appId}").`);
  }
  return { inviteHost: host, metaAppId: appId };
}

// Expo inlines EXPO_PUBLIC_* only when each name is written out literally.
export const shareConfig = readShareConfig({
  EXPO_PUBLIC_INVITE_LINK_HOST: process.env.EXPO_PUBLIC_INVITE_LINK_HOST,
  EXPO_PUBLIC_META_APP_ID: process.env.EXPO_PUBLIC_META_APP_ID,
});
