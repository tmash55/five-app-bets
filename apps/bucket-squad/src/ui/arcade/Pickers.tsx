/** Pickers the game-setup screens share: a court tile, and the sizing of a grid of team tiles. */

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { tapFeedback } from '@/fx/feedback';
import { COURTS, type CourtId } from '@/game/render/court';
import { arcade, fade, halo, inner, night, tube as tubes, type TubeName } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { LineIcon } from './LineIcon';
import { TEAM_PICK_HEIGHT, TEAM_PICK_MIN_HEIGHT, TEAM_PICK_WIDTH } from './TeamPick';
import { Print } from './Type';

export const COURT_W = px(86);
const COURT_SCENE = px(30);
/** a court's name keeps clear of its tile's sides, and shrinks to fit */
const COURT_NAME_PAD = px(5);
const COURT_NAME_ROOM = COURT_W - arcade.outline * 2 - px(3) * 2 - COURT_NAME_PAD * 2;
export const TEAM_GAP = space.sm;
/** room round the lit tiles inside their scrolling rows, so their glow is not cut off at the edge */
export const GLOW_ROOM = px(7);
/** a settings panel's padding */
export const PANEL_PAD = px(10);
/** above the first row of teams a picked tile's glow reaches further than at its sides */
export const GRID_TOP = GLOW_ROOM * 1.6;
/** narrower than this a team tile cannot hold its name */
const TILE_MIN_W = px(84);
/** the panel's frame and its padding above the heading */
export const TEAMS_FRAME = arcade.outline * 2 + px(10);
export const FADE_DOWN = [fade(night.panel, 0), fade(night.panel, 0.6), night.panel] as const;
export const FADE_UP = [night.panel, fade(night.panel, 0)] as const;

export interface TeamGrid {
  cols: number;
  tileW: number;
  tileH: number;
  /** set when there are more teams than fit: the height the grid shows, ending half way down a row */
  window?: number;
}

/**
 * Sizes the team tiles from the room the panel really has. Every tile fits when it can, first by making
 * the rows a little shorter, then by one more column; when there are too many, whole rows fit and half of
 * the next one shows under a fade, so the grid plainly scrolls.
 */
export function teamGrid(n: number, w: number, h: number): TeamGrid {
  const fit = Math.max(1, Math.floor((w + TEAM_GAP) / (TEAM_PICK_WIDTH + TEAM_GAP)));
  for (let cols = fit; cols <= fit + 2; cols++) {
    const tileW = Math.floor((w - TEAM_GAP * (cols - 1)) / cols);
    if (cols > fit && tileW < TILE_MIN_W) break;
    const rows = Math.ceil(n / cols);
    const tileH = Math.floor((h - TEAM_GAP * (rows - 1)) / rows);
    if (tileH >= TEAM_PICK_MIN_HEIGHT) return { cols, tileW, tileH: Math.min(TEAM_PICK_HEIGHT, tileH) };
  }
  const tileW = Math.floor((w - TEAM_GAP * (fit - 1)) / fit);
  // the fewest whole rows that leave the tiles no taller than they are drawn, plus half a row
  let whole = 1;
  while ((h - whole * TEAM_GAP) / (whole + 0.5) > TEAM_PICK_HEIGHT) whole++;
  const tileH = Math.max(TEAM_PICK_MIN_HEIGHT, Math.floor((h - whole * TEAM_GAP) / (whole + 0.5)));
  return { cols: fit, tileW, tileH, window: GRID_TOP + whole * (tileH + TEAM_GAP) + Math.round(tileH / 2) };
}

/** A court you can pick, drawn as a little picture of its sky and floor, with its name under it. */
export function CourtPick({ id, selected, onPress, tube: t = 'cyan' }: { id: CourtId | null; selected: boolean; onPress: () => void; tube?: TubeName }) {
  const TUBE = tubes[t];
  const court = id !== null ? COURTS[id] : null;
  const name = court ? court.name : 'Their court';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}${selected ? ', selected' : ''}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.court, selected && { borderColor: TUBE.glass, boxShadow: [halo(TUBE.glass, 6, 0.6), inner(TUBE.glass, 12, 0.3)] }, pressed && styles.pressed]}>
      {court ? (
        <View style={[styles.scene, !selected && styles.sceneDim]}>
          <LinearGradient colors={[court.sky.top, court.sky.horizon]} style={StyleSheet.absoluteFill} />
          <View style={[styles.floor, { backgroundColor: court.floor.court, borderTopColor: court.floor.line }]}>
            <View style={[styles.key, { backgroundColor: court.floor.key, borderColor: court.floor.line }]} />
          </View>
        </View>
      ) : (
        // the other team's own court: we only find out which when the game starts
        <View style={[styles.scene, styles.sceneHome]}>
          <LineIcon name="home" size={px(20)} tube={selected ? TUBE : undefined} color={selected ? undefined : night.textFaint} />
        </View>
      )}
      <Print face="bold" size="tiny" color={selected ? 'text' : 'textDim'} center lines={1} room={COURT_NAME_ROOM} least={0.6} style={styles.courtName}>
        {name}
      </Print>
    </Pressable>
  );
}


const styles = StyleSheet.create({
  courtName: {
    paddingHorizontal: COURT_NAME_PAD,
  },
  court: {
    width: COURT_W,
    minHeight: sizes.tap,
    padding: px(3),
    paddingBottom: px(4),
    gap: px(3),
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderColor: night.line,
    borderRadius: arcade.rButton,
    overflow: 'hidden',
  },
  scene: {
    height: COURT_SCENE,
    borderRadius: arcade.rButton - px(3),
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  sceneDim: {
    opacity: 0.55,
  },
  sceneHome: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.well,
  },
  floor: {
    height: COURT_SCENE * 0.45,
    borderTopWidth: arcade.hairline,
    alignItems: 'center',
  },
  key: {
    width: COURT_SCENE * 0.6,
    height: COURT_SCENE * 0.3,
    borderWidth: arcade.hairline,
    borderTopWidth: 0,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
