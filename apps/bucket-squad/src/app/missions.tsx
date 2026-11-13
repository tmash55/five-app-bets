/** Daily missions: three small goals a day, coins for each, and a pack for finishing them all. */

import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { playSfx } from '@/audio/sound';
import { ALL_DONE_PACK, currentMissions, missionDone, type Mission } from '@/meta/missions';
import { packById } from '@/meta/packs';
import { dayKey } from '@/meta/rng';
import { useSave } from '@/state/save';
import { size as sizes, space } from '@/theme/tokens';
import { ProgressBar, Tag } from '@/ui/Bits';
import { Icon } from '@/ui/Icon';
import { PackArt } from '@/ui/PackArt';
import { CoinAmount } from '@/ui/Rewards';
import { Screen } from '@/ui/Screen';
import { Sticker, StickerButton } from '@/ui/Sticker';
import { Txt } from '@/ui/Txt';

function MissionRow({ mission, onClaim }: { mission: Mission; onClaim: () => void }) {
  const done = missionDone(mission);
  return (
    <Sticker fill={mission.claimed ? 'paperDim' : 'paper'} round="lg" raise={mission.claimed ? 'low' : 'mid'} face={styles.mission}>
      <Icon name={mission.claimed ? 'check' : 'target'} size={sizes.iconLarge} color={mission.claimed ? 'mint' : 'coral'} />
      <View style={styles.grow}>
        <Txt font="display" size="large" lines={1} color={mission.claimed ? 'inkFaint' : 'ink'}>
          {mission.text}
        </Txt>
        <View style={styles.progress}>
          <ProgressBar value={mission.progress / mission.target} fill={done ? 'mint' : 'sun'} style={styles.grow} />
          <Txt font="display" size="small" color="inkSoft">{`${mission.progress} / ${mission.target}`}</Txt>
        </View>
      </View>
      {mission.claimed ? (
        <Tag label="Done" fill="mint" style={styles.centerSelf} />
      ) : done ? (
        <StickerButton fill="mint" raise="low" quiet onPress={onClaim} accessibilityLabel={`Collect ${mission.coins} coins`} face={styles.claim}>
          <Txt font="display" size="body">
            GET
          </Txt>
          <CoinAmount coins={mission.coins} size="body" />
        </StickerButton>
      ) : (
        <CoinAmount coins={mission.coins} size="large" />
      )}
    </Sticker>
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

  return (
    <Screen title="MISSIONS" tone="sun">
      <View style={styles.row}>
        <View style={styles.list}>
          {day.missions.map((m, i) => (
            <MissionRow key={`${m.metric}${i}`} mission={m} onClaim={() => claim(i)} />
          ))}
        </View>
        <Sticker fill="paper" round="lg" raise="mid" style={styles.bonus} face={styles.bonusFace}>
          <PackArt pack={pack} width={sizes.cardSmall} />
          <Txt font="display" size="body" center>
            {day.bonusClaimed ? 'PACK COLLECTED!' : 'FINISH ALL THREE'}
          </Txt>
          <Txt size="small" color="inkSoft" center>
            {day.bonusClaimed ? 'New missions arrive tomorrow.' : `Collect every prize to win a ${pack.name}.`}
          </Txt>
          {!day.bonusClaimed &&
            (allClaimed ? (
              <StickerButton label="GET THE PACK!" icon="gift" iconColor="white" fill="coral" textColor="white" textSize="body" quiet onPress={claimPack} style={styles.stretch} />
            ) : (
              <Tag label={`${claimed} of ${day.missions.length} done`} fill="paperDim" style={styles.centerSelf} />
            ))}
        </Sticker>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  list: {
    flex: 1,
    gap: space.sm,
  },
  mission: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  grow: {
    flex: 1,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  claim: {
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  centerSelf: {
    alignSelf: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  bonus: {
    width: sizes.cardLarge + space.xl,
  },
  bonusFace: {
    alignItems: 'center',
    gap: space.xs,
    padding: space.md,
  },
});
