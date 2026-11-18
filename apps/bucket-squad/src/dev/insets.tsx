/**
 * Development only, in the browser: makes every page believe the screen has a phone's safe-area insets, so the
 * room a notch and a home bar take can be seen and photographed without a phone.
 *
 *   /?insets=iphone                  a current iPhone held sideways
 *   /?insets=top,right,bottom,left   any insets, in screen points
 *   /?insets=off                     back to none
 *
 * The choice is kept for the life of the tab, so pages loaded after the first keep it. The island and the home
 * bar are drawn over the page, to show what they would cover. A phone and a store build never see any of this.
 */

import type { ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';

import { night } from '@/theme/arcade';

const KEY = 'bs.insets';
/** an iPhone 17 on its side: the island on the left, the same gap kept on the right, the home bar below */
const IPHONE: EdgeInsets = { top: 0, right: 62, bottom: 21, left: 62 };
/** the hardware as it sits on that phone's screen, in screen points */
const ISLAND = { left: 11, width: 37, height: 126 } as const;
const HOME_BAR = { bottom: 8, width: 148, height: 5 } as const;

function asked(): EdgeInsets | null {
  if (!__DEV__ || Platform.OS !== 'web' || typeof location === 'undefined') return null;
  try {
    const fromAddress = new URLSearchParams(location.search).get('insets');
    if (fromAddress !== null) sessionStorage.setItem(KEY, fromAddress);
    const value = fromAddress ?? sessionStorage.getItem(KEY);
    if (!value || value === 'off') return null;
    if (value === 'iphone') return IPHONE;
    const n = value.split(',').map(Number);
    return n.length === 4 && n.every((x) => Number.isFinite(x) && x >= 0) ? { top: n[0], right: n[1], bottom: n[2], left: n[3] } : null;
  } catch {
    return null;
  }
}

const FAKE = asked();

/** Wraps the whole app. Does nothing unless insets were asked for in a development build in the browser. */
export function DevInsets({ children }: { children: ReactNode }) {
  if (!FAKE) return children;
  return (
    <SafeAreaInsetsContext.Provider value={FAKE}>
      {children}
      <View pointerEvents="none" style={styles.hardware}>
        {FAKE.left >= ISLAND.left + ISLAND.width && <View style={styles.island} />}
        {FAKE.bottom >= HOME_BAR.bottom + HOME_BAR.height && <View style={styles.homeBar} />}
      </View>
    </SafeAreaInsetsContext.Provider>
  );
}

const styles = StyleSheet.create({
  hardware: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  island: {
    position: 'absolute',
    left: ISLAND.left,
    width: ISLAND.width,
    height: ISLAND.height,
    borderRadius: ISLAND.width / 2,
    backgroundColor: night.black,
  },
  homeBar: {
    position: 'absolute',
    bottom: HOME_BAR.bottom,
    width: HOME_BAR.width,
    height: HOME_BAR.height,
    borderRadius: HOME_BAR.height / 2,
    backgroundColor: night.white,
  },
});
