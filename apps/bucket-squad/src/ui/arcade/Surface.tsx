/** The arcade's boxes: a lit panel, a dark well inside it, chips for the top bar, name plates and badges. */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { TeamDef } from '@/data/types';
import { luminance } from '@/game/kit/look';
import { arcade, blend, halo, inner, night, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { MIN_FIT_LABEL } from './measure';
import { Print } from './Type';

export interface NeonPanelProps {
  children?: React.ReactNode;
  /** the tube round its edge */
  tube?: TubeName | Tube;
  /** corner radius in screen points */
  round?: number;
  /** switched off: a quiet outline and no light */
  lit?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A dark panel with a lit tube round it. */
export function NeonPanel({ children, tube: t = 'cyan', round = arcade.rPanel, lit = true, style }: NeonPanelProps) {
  const tb = tubeOf(t);
  return (
    <View style={[styles.panel, { borderRadius: round, borderColor: lit ? tb.glass : night.line, boxShadow: lit ? [halo(tb.glass, 14, 0.55), inner(night.black, 26, 0.7)] : [inner(night.black, 26, 0.7)] }, style]}>
      {children}
    </View>
  );
}

/** A darker box inside a panel: one row of a list, one thing to act on. */
export function Well({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.well, style]}>{children}</View>;
}

/** A small dark box in the top bar: the coin count, the ladder tier, a counter. */
export function Chip({ children, small, style }: { children?: React.ReactNode; small?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.chip, small && styles.chipSmall, style]}>{children}</View>;
}

/** A name plate: a dark strip with a thin lit edge. */
export function Plate({ children, tube: t = 'cyan', style }: { children?: React.ReactNode; tube?: TubeName | Tube; style?: StyleProp<ViewStyle> }) {
  const tb = tubeOf(t);
  return <View style={[styles.plate, { borderColor: tb.glass, boxShadow: [halo(tb.glass, 8, 0.6)] }, style]}>{children}</View>;
}

/** A lit dot with a number: "something is waiting for you here". */
export function CountBadge({ count, tube: t = 'pink', style }: { count: number; tube?: TubeName | Tube; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  const tb = tubeOf(t);
  return (
    <View style={[styles.count, { backgroundColor: tb.glass, boxShadow: [halo(tb.glass, 10, 1)] }, style]}>
      <Print face="bold" size="body" color="onTube">
        {count > 9 ? '9+' : String(count)}
      </Print>
    </View>
  );
}

/** A filled, lit label: "NEW!", "FREE", "x2". */
export function Tag({ label, tube: t = 'pink', small, style }: { label: string; tube?: TubeName | Tube; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const tb = tubeOf(t);
  return (
    <View style={[styles.tag, small && styles.tagSmall, { backgroundColor: tb.glass, boxShadow: [halo(tb.glass, small ? 8 : 12, 1)] }, style]}>
      <Print face="display" size={small ? 'micro' : 'body'} color="onTube" track="close">
        {label}
      </Print>
    </View>
  );
}

/** The box with a player's overall rating in it. */
export function OvrBox({ value, tube: t = 'cyan', small, style }: { value: number | string; tube?: TubeName | Tube; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const tb = tubeOf(t);
  return (
    <View style={[styles.ovr, small && styles.ovrSmall, { borderColor: tb.glass, boxShadow: [halo(tb.glass, 12, 0.8)] }, style]}>
      <Print face="bold" size="micro" color="textDim" track="wider" style={styles.tight}>
        OVR
      </Print>
      <Print face="display" size={small ? px(20) : px(26)} style={styles.ovrNumber}>
        {String(value)}
      </Print>
    </View>
  );
}

/** A team's (or a uniform's) colour, light enough to read as a lit line on the dark wall. */
export function teamLine(team: Pick<TeamDef, 'color'>): string {
  return luminance(team.color) < 0.3 ? blend(team.color, night.white, 0.4) : team.color;
}

/** A team's three letters in a dark chip, lit in its colour. */
export function TeamMark({ team, small, style }: { team: TeamDef; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const line = teamLine(team);
  return (
    <View style={[styles.mark, small && styles.markSmall, { borderColor: line }, style]}>
      <Print face="bold" size={small ? 'micro' : 'tiny'} color={blend(line, night.white, 0.35)} track="normal" room={small ? px(26) : px(32)} least={MIN_FIT_LABEL}>
        {team.short}
      </Print>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: night.panel,
    borderWidth: arcade.outline,
  },
  well: {
    backgroundColor: night.well,
    borderWidth: arcade.hairline,
    borderColor: night.line,
    borderRadius: arcade.rWell,
    padding: px(9),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: arcade.chip,
    paddingHorizontal: px(11),
    backgroundColor: night.pit,
    borderWidth: arcade.hairline,
    borderColor: night.line,
    borderRadius: arcade.rChip,
  },
  chipSmall: {
    height: px(26),
    paddingHorizontal: px(9),
  },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(7),
    height: px(24),
    paddingHorizontal: space.sm,
    backgroundColor: night.plate,
    borderWidth: arcade.hairline,
    borderRadius: arcade.rPlate,
  },
  count: {
    minWidth: px(24),
    height: px(24),
    borderRadius: px(12),
    paddingHorizontal: px(5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    alignSelf: 'flex-start',
    height: px(26),
    paddingHorizontal: px(9),
    borderRadius: arcade.rChip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagSmall: {
    height: px(18),
    paddingHorizontal: px(6),
    borderRadius: px(5),
  },
  ovr: {
    width: px(62),
    height: px(58),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderRadius: arcade.rButton,
  },
  ovrSmall: {
    width: px(50),
    height: px(46),
    borderRadius: arcade.rCell,
  },
  ovrNumber: {
    marginTop: -px(1),
  },
  tight: {
    lineHeight: px(12),
  },
  mark: {
    height: px(22),
    minWidth: px(40),
    paddingHorizontal: px(7),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.onTube,
    borderWidth: arcade.hairline,
    borderRadius: arcade.rPlate,
  },
  markSmall: {
    height: px(17),
    minWidth: px(32),
    paddingHorizontal: px(4),
    borderRadius: px(4),
  },
});
