/** Daily missions: three small goals a day, coins for each, and a pack for finishing them all. */

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { playSfx } from '@/audio/sound';
import { tapFeedback } from '@/fx/feedback';
import { ALL_DONE_PACK, currentMissions, missionDone, type Metric, type Mission } from '@/meta/missions';
import { packById } from '@/meta/packs';
import { dayKey } from '@/meta/rng';
import { useSave } from '@/state/save';
import { arcade, halo, inner, night, tube } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GoldButton } from '@/ui/arcade/Buttons';
import { SignHead } from '@/ui/arcade/Controls';
import { FoilPack } from '@/ui/arcade/Foil';
import { Coin, LineIcon, type LineIconName } from '@/ui/arcade/LineIcon';
import { Arrive, Breathe } from '@/ui/arcade/Motion';
import { CoinAmount } from '@/ui/arcade/Rewards';
import { Bloom, Rays } from '@/ui/arcade/Room';
import { Pips, SegBar } from '@/ui/arcade/SegBar';
import { NeonPanel, Tag, Well } from '@/ui/arcade/Surface';
import { Print } from '@/ui/arcade/Type';

/** the page's own tube, the one the home page's MISSIONS sign is bent from */
const TUBE = tube.green;
/** the prize panel: the pack on the shop's pink */
const PRIZE = tube.pink;
/** a goal of up to this many gets a lamp for each one; a bigger goal (points) gets this many lamps */
const MOST_LAMPS = 10;
const LAMP_W = px(22);

/** a picture for each kind of goal, so it can be told apart before it can be read */
const PICTURE: Record<Metric, LineIconName> = {
  wins: 'trophy',
  games: 'ball',
  points: 'star',
  dunks: 'up',
  threes: 'target',
  steals: 'bolt',
  blocks: 'close',
  perfects: 'spark',
  packs: 'pack',
  tourWins: 'flag',
  ladderWins: 'ladder',
};

/** How a goal is drawn: a lamp for each thing to do when there are few, a bar of ten when there are many. */
function lampsOf(mission: Mission): { lamps: number; lit: number } {
  const lamps = Math.min(MOST_LAMPS, mission.target);
  return { lamps, lit: Math.min(lamps, Math.floor((mission.progress / mission.target) * lamps)) };
}

/** The button that collects a finished mission's coins: lit green, with the coins on it. */
function ClaimButton({ coins, onPress }: { coins: number; onPress: () => void }) {
  return (
    <Breathe depth={0.12} swell={0.04} ms={700}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Collect ${coins} coins`}
        hitSlop={space.xs}
        onPress={() => {
          tapFeedback();
          onPress();
        }}
        style={({ pressed }) => [styles.claim, { boxShadow: [halo(TUBE.glass, pressed ? 8 : 14, pressed ? 0.5 : 0.85)] }, pressed && styles.pressed]}>
        <Print face="display" size="body" color="onTube" track="normal">
          GET
        </Print>
        <Coin size={px(20)} />
        <Print face="bold" size="large" color="onTube" track="wide">
          {coins.toLocaleString('en-US')}
        </Print>
      </Pressable>
    </Breathe>
  );
}

function MissionRow({ mission, index, onClaim }: { mission: Mission; index: number; onClaim: () => void }) {
  const done = missionDone(mission);
  const { lamps, lit } = lampsOf(mission);
  const claimed = mission.claimed;
  return (
    <Arrive delay={80 + index * 90} from="left" style={styles.grow}>
      <Well style={[styles.mission, styles.grow, done && !claimed && { borderColor: TUBE.glass, boxShadow: [inner(TUBE.glass, 16, 0.3)] }]}>
        <View style={[styles.medal, done && { borderColor: TUBE.glass, boxShadow: [halo(TUBE.glass, 10, 0.7)] }, claimed && { backgroundColor: TUBE.glass }]}>
          <LineIcon name={done ? 'check' : PICTURE[mission.metric]} size={px(26)} tube={claimed ? undefined : TUBE} color={claimed ? night.onTube : undefined} weight={done ? 3 : 2} />
        </View>
        <View style={styles.words}>
          <Print face="bold" size="large" color={claimed ? 'textFaint' : 'text'} lines={1}>
            {mission.text}
          </Print>
          <View style={styles.progress}>
            <SegBar lit={lit} lamps={lamps} tube={claimed ? 'steel' : TUBE} style={{ width: lamps * LAMP_W + (lamps - 1) * arcade.segGap }} />
            <Print face="bold" size="small" color={done ? TUBE.soft : 'textDim'} track="wide" lines={1}>
              {`${mission.progress} / ${mission.target}`}
            </Print>
          </View>
        </View>
        {claimed ? <Tag label="DONE" tube="green" small style={styles.centerSelf} /> : done ? <ClaimButton coins={mission.coins} onPress={onClaim} /> : <CoinAmount coins={mission.coins} size="large" />}
      </Well>
    </Arrive>
  );
}

export default function Missions() {
  const router = useRouter();
  const saved = useSave((s) => s.missions);
  const claimMission = useSave((s) => s.claimMission);
  const claimMissionBonus = useSave((s) => s.claimMissionBonus);
  const day = currentMissions(saved, dayKey());
  const claimed = day.missions.filter((m) => m.claimed).length;
  const allClaimed = claimed === day.missions.length;
  const pack = packById(ALL_DONE_PACK);

  const claim = (i: number) => {
    if (claimMission(i)) playSfx('coins');
  };

  const claimPack = () => {
    if (!claimMissionBonus()) return;
    playSfx('star');
    router.push({ pathname: '/open', params: { pack: ALL_DONE_PACK } });
  };

  const ready = allClaimed && !day.bonusClaimed;

  return (
    <ArcadeScreen title="MISSIONS" tube="green" style={styles.body}>
      <View style={styles.row}>
        <NeonPanel tube="green" style={styles.list}>
          <SignHead
            title="TODAY’S MISSIONS"
            tube="green"
            right={
              <Print face="bold" size="tiny" color="textFaint" track="wider">
                NEW ONES EVERY DAY
              </Print>
            }
          />
          {day.missions.map((m, i) => (
            <MissionRow key={`${m.metric}${i}`} mission={m} index={i} onClaim={() => claim(i)} />
          ))}
        </NeonPanel>

        <Arrive delay={200} from="right" style={styles.side}>
          <NeonPanel tube={PRIZE} style={styles.bonus}>
            <SignHead title={day.bonusClaimed ? 'COLLECTED' : 'ALL THREE'} tube={PRIZE} />
            <View style={styles.stage}>
              {!day.bonusClaimed && <Rays size={px(220)} color={ready ? tube.gold.glass : PRIZE.glass} alpha={ready ? 0.34 : 0.18} count={18} fill={0.35} fadeAt={[0.3, 0.95]} style={styles.rays} />}
              {!day.bonusClaimed && <Bloom size={px(170)} color={ready ? tube.gold.glass : PRIZE.soft} alpha={ready ? 0.6 : 0.35} style={styles.bloom} />}
              <Breathe on={ready} depth={0} swell={0.05} ms={800}>
                <View style={day.bonusClaimed && styles.taken}>
                  <FoilPack pack={pack} width={px(80)} flat={day.bonusClaimed} />
                </View>
              </Breathe>
              {day.bonusClaimed && (
                <View style={styles.takenMark}>
                  <LineIcon name="check" size={px(30)} color={night.onTube} weight={3.4} />
                </View>
              )}
            </View>
            <View style={styles.prizeWords}>
              <Print face="display" size="body" color={ready ? tube.gold.tint : 'text'} track="normal" center glow={ready ? tube.gold.glass : undefined}>
                {day.bonusClaimed ? 'PACK COLLECTED!' : 'FINISH ALL THREE'}
              </Print>
              <Print face="medium" size="small" color="textDim" center lines={2}>
                {day.bonusClaimed ? 'New missions arrive tomorrow.' : `Collect every prize to win a ${pack.name}.`}
              </Print>
            </View>
            {!day.bonusClaimed &&
              (ready ? (
                <GoldButton label="GET THE PACK!" icon="gift" size="small" quiet onPress={claimPack} />
              ) : (
                <View accessible accessibilityLabel={`${claimed} of ${day.missions.length} done`} style={styles.count}>
                  <Pips have={claimed} of={day.missions.length} tube={TUBE} size={px(16)} />
                  <Print face="bold" size="small" color="textDim" track="wide">
                    {`${claimed} OF ${day.missions.length} DONE`}
                  </Print>
                </View>
              ))}
          </NeonPanel>
        </Arrive>
      </View>
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: space.md,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
  },
  list: {
    flex: 1,
    paddingTop: px(10),
    paddingBottom: px(12),
    paddingHorizontal: px(12),
    gap: space.sm,
  },
  mission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: px(76),
    paddingHorizontal: px(12),
  },
  medal: {
    width: px(48),
    height: px(48),
    borderRadius: px(24),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderColor: night.line,
  },
  grow: {
    flex: 1,
  },
  words: {
    flex: 1,
    gap: px(6),
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  centerSelf: {
    alignSelf: 'center',
  },
  claim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(6),
    height: sizes.tap,
    paddingHorizontal: px(14),
    borderRadius: arcade.rButton,
    backgroundColor: TUBE.glass,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  side: {
    width: px(244),
  },
  bonus: {
    flex: 1,
    paddingTop: px(10),
    paddingBottom: px(12),
    paddingHorizontal: px(12),
    gap: space.sm,
    overflow: 'hidden',
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: px(110),
  },
  rays: {
    position: 'absolute',
  },
  bloom: {
    position: 'absolute',
  },
  taken: {
    opacity: 0.45,
  },
  takenMark: {
    position: 'absolute',
    width: px(48),
    height: px(48),
    borderRadius: px(24),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TUBE.glass,
    boxShadow: [halo(TUBE.glass, 14, 0.9)],
  },
  prizeWords: {
    gap: px(3),
  },
  count: {
    height: sizes.tap,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
});
