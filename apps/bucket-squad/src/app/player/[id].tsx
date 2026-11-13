/** One player up close: the big card on rays of light, and beside it who they are, the six ratings, the level and what to do next. */

import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { MAX_LEVEL, boosted, levelBonus, playerById, teamById } from '@/data/roster';
import { RARITY_LABEL, type PlayerDef } from '@/data/types';
import { RATING_KEYS } from '@/game/sim/ratings';
import { levelProgress } from '@/meta/collection';
import { useSave } from '@/state/save';
import { arcade, blend, neonText, night, rarityPaint, track, tube as tubes, type Tube } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { ArcadeScreen, useArcadeBody } from '@/ui/arcade/ArcadeScreen';
import { GhostButton, GoldButton } from '@/ui/arcade/Buttons';
import { ArcadeCard, Gems } from '@/ui/arcade/Card';
import { LineIcon, type LineIconName } from '@/ui/arcade/LineIcon';
import { SPARE } from '@/ui/arcade/fitText';
import { fitPerson, widthOf } from '@/ui/arcade/measure';
import { Bloom, Rays } from '@/ui/arcade/Room';
import { SegBar, StatRow } from '@/ui/arcade/SegBar';
import { NeonPanel, Tag, Well, teamLine } from '@/ui/arcade/Surface';
import { ratingLabel } from '@/ui/arcade/ratingLabel';
import { Print } from '@/ui/arcade/Type';
import { tourStop } from '@/ui/arcade/whereToFind';

/** between the card and the panel */
const SPLIT = px(26);
/** the panel's inside edge */
const PAD = px(14);
/** the widest the panel gets: on a tablet it stays a readable column */
const PANEL_MOST = px(480);
/** below this a rating column uses the small rows */
const ROOMY_COLUMN = px(210);

/** A team's colour as a tube, so its name can be lit like the rest of the room. */
function teamTube(color: string): Tube {
  return { glass: color, tint: blend(color, night.white, 0.86), soft: blend(color, night.white, 0.45) };
}

/** One way to find a player still missing: an icon and a line. */
function Hint({ icon, text, tb }: { icon: LineIconName; text: string; tb: Tube }) {
  return (
    <View style={styles.hint}>
      <LineIcon name={icon} size={px(18)} tube={tb} weight={2.2} />
      <Print face="bold" size="small" color="textSoft" style={styles.grow}>
        {text}
      </Print>
    </View>
  );
}

function Detail({ player }: { player: PlayerDef }) {
  const router = useRouter();
  const body = useArcadeBody();
  const copies = useSave((s) => s.owned[player.id] ?? 0);
  const inSquad = useSave((s) => s.squad.includes(player.id));
  const markSeen = useSave((s) => s.markSeen);
  const team = teamById(player.team);
  const prog = levelProgress(copies);
  const have = copies > 0;
  const rp = rarityPaint[player.rarity];
  const tb = tubes[rp.tube];
  const ratings = boosted(player.ratings, levelBonus(Math.max(1, prog.level)));
  const best = RATING_KEYS.reduce((a, k) => (ratings[k] > ratings[a] ? k : a), RATING_KEYS[0]);
  const stop = have ? null : tourStop(player.id);

  useEffect(() => {
    markSeen(player.id);
  }, [markSeen, player.id]);

  // the card as tall as the page lets it be, and never more than about a third of the width
  const cardW = Math.floor(Math.min(px(300), body.width * 0.36, (body.height - px(18)) / sizes.cardRatio));
  const cardH = Math.round(cardW * sizes.cardRatio);
  const panelW = Math.min(PANEL_MOST, body.width - cardW - SPLIT);
  const inside = panelW - PAD * 2 - arcade.outline * 2;
  const columnW = (inside - space.lg) / 2;
  const small = columnW < ROOMY_COLUMN;
  const nameSize = Math.min(px(30), Math.max(px(20), Math.round(panelW * 0.066)));
  const name = fitPerson(player.name.toUpperCase(), 'display', nameSize, inside, 0, player.short?.toUpperCase());
  const left = prog.need - prog.have;
  const raysSize = cardH * 1.7;
  // the level box's columns: the names on the left, the words on the right, and the bars sharing what is between
  const copiesWords = `${left} MORE ${left === 1 ? 'COPY' : 'COPIES'}`;
  const levelLabelW = Math.ceil(Math.max(widthOf('LEVEL', 'bold', neonText.tiny, track.wide), widthOf('COPIES', 'bold', neonText.tiny, track.wide)) / SPARE);
  const levelWordsW = Math.ceil(Math.max(widthOf(`${MAX_LEVEL} OF ${MAX_LEVEL}`, 'display', neonText.body), prog.maxed ? 0 : widthOf(copiesWords, 'bold', neonText.tiny, track.normal)) / SPARE);

  return (
    <ArcadeScreen title={team.name.toUpperCase()} tube={teamTube(teamLine(team))}>
      <View style={styles.row}>
        <View style={[styles.stage, { width: cardW, height: cardH }]}>
          {/* the card's own light on the wall behind it, and rays fanning out from it like a prize machine's back */}
          <Bloom size={raysSize} color={have ? tb.glass : night.lineLit} alpha={have ? 0.42 : 0.2} style={{ position: 'absolute', left: cardW / 2 - raysSize / 2, top: cardH / 2 - raysSize / 2 }} />
          <Rays size={raysSize} color={have ? tb.soft : night.lineLit} alpha={have ? 0.3 : 0.12} count={24} fadeAt={[0.42, 1]} style={{ position: 'absolute', left: cardW / 2 - raysSize / 2, top: cardH / 2 - raysSize / 2 }} />
          <ArcadeCard player={player} level={prog.level} locked={!have} width={cardW} shine={have && (player.rarity === 'legend' || player.rarity === 'epic')} />
        </View>

        <NeonPanel tube={rp.tube} round={arcade.rBig} style={[styles.panel, { width: panelW }]}>
          <View style={styles.words}>
            <Print face="display" size={name.size} track="tight" style={{ lineHeight: Math.round(name.size * 1.04) }}>
              {name.text}
            </Print>
            <View style={styles.line}>
              <Print face="bold" size="small" color={tubes.cyan.soft} track="wide" upper style={styles.shrink}>
                {`${team.name} · ${player.role}`}
              </Print>
              <View style={styles.rarity}>
                <Gems rarity={player.rarity} size={px(10)} />
                <Print face="bold" size="tiny" color={tb.tint} track="widest" upper>
                  {RARITY_LABEL[player.rarity]}
                </Print>
              </View>
              {player.era === 'classic' && <Tag label="OLD SCHOOL" tube="amber" small style={styles.centerSelf} />}
            </View>
          </View>

          {have ? (
            <>
              <Print face="body" size="small" color="textMuted">
                {player.nickname ? `"${player.nickname}". ${player.blurb}` : player.blurb}
              </Print>
              <View style={[styles.ratings, { columnGap: space.lg }]}>
                {RATING_KEYS.map((k) => (
                  <StatRow key={k} label={ratingLabel(k, small)} value={ratings[k]} tube={k === best ? 'pink' : 'cyan'} small={small} style={{ width: columnW }} />
                ))}
              </View>
              {/* two rows on one grid: the level as five lamps and the copies to the next one, their bars starting and ending together */}
              <Well style={styles.level}>
                <View accessible accessibilityLabel={`Level ${prog.level} of ${MAX_LEVEL}`} style={styles.levelRow}>
                  <Print face="bold" size="tiny" color="textDim" track="wide" style={{ width: levelLabelW }}>
                    LEVEL
                  </Print>
                  <SegBar lit={prog.level} lamps={MAX_LEVEL} tube="gold" small style={styles.grow} />
                  <Print face="display" size="body" color={tubes.gold.glass} right style={{ width: levelWordsW }}>
                    {`${prog.level} OF ${MAX_LEVEL}`}
                  </Print>
                </View>
                {prog.maxed ? (
                  <Print face="bold" size="small" color={tubes.gold.soft}>
                    Top level! Extra copies turn into coins.
                  </Print>
                ) : (
                  <View accessible accessibilityLabel={`${left} more ${left === 1 ? 'copy' : 'copies'} to level ${prog.level + 1}`} style={styles.levelRow}>
                    <Print face="bold" size="tiny" color="textDim" track="wide" style={{ width: levelLabelW }}>
                      COPIES
                    </Print>
                    <SegBar lit={prog.have} lamps={prog.need} tube="cyan" small style={styles.grow} />
                    <Print face="bold" size="tiny" color="textDim" track="normal" right style={{ width: levelWordsW }}>
                      {copiesWords}
                    </Print>
                  </View>
                )}
              </Well>
              {inSquad ? (
                <GhostButton label="IN YOUR SQUAD" icon="check" tube="green" onPress={() => router.push('/squad')} />
              ) : (
                <GoldButton label="PUT IN MY SQUAD" icon="swap" size="small" onPress={() => router.push({ pathname: '/squad', params: { add: player.id } })} />
              )}
            </>
          ) : (
            <>
              <Print face="body" size="small" color="textMuted">
                {`A mystery ${player.role} from the ${team.place} ${team.name}. Their ratings show up once you find them.`}
              </Print>
              <Well style={styles.hints}>
                <Hint icon="pack" text="Find them in packs" tb={tubes.pink} />
                {stop !== null && <Hint icon="flag" text={`Or win the ${stop} Showdown on the Tour`} tb={tubes.green} />}
              </Well>
              <GoldButton label="GO TO PACKS" icon="pack" size="small" onPress={() => router.push('/packs')} />
            </>
          )}
        </NeonPanel>
      </View>
    </ArcadeScreen>
  );
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = typeof id === 'string' ? playerById(id) : undefined;
  if (!player) return <Redirect href="/shelf" />;
  return <Detail key={player.id} player={player} />;
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPLIT,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    padding: PAD,
    gap: px(10),
  },
  words: {
    gap: px(4),
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(10),
  },
  shrink: {
    flexShrink: 1,
  },
  rarity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(5),
  },
  centerSelf: {
    alignSelf: 'center',
  },
  grow: {
    flex: 1,
  },
  ratings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: px(6),
  },
  level: {
    gap: px(6),
    paddingVertical: px(8),
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(12),
  },
  hints: {
    gap: px(8),
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(10),
  },
});
