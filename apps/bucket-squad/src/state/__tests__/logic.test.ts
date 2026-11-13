import { PLAYERS, mustPlayer, playerOverall, teamPlayers } from '@/data/roster';
import { MAX_COPIES } from '@/meta/collection';
import { TIERS } from '@/meta/ladder';
import { missionsFor, type MissionDay } from '@/meta/missions';
import { packById } from '@/meta/packs';
import { seededRng } from '@/meta/rng';
import { STARS_PER_GAME, gameKey, tourById } from '@/meta/tour';
import { summary, totals } from '@/testing/summary';

import { DEFAULT_SETTINGS, SQUAD_SIZE, STARTING_COINS, buyPack, claimFreePack, claimMission, claimMissionBonus, finishMatch, homeTeamChoices, markSeen, newSave, openOwnedPack, repairSave, setSquad, squadLevels, startCareer, starterIds, type SaveData } from '../logic';

const DAY = '2026-03-09';
const NEXT_DAY = '2026-03-10';

const career = (team = 'comets'): SaveData => startCareer(newSave(), team);

/** a day whose missions include (or leave out) a kind of goal */
function dayWith(metric: string, want = true): string {
  for (let d = 1; d <= 400; d++) {
    const day = `2027-01-${String(d).padStart(3, '0')}`;
    if (missionsFor(day).missions.some((m) => m.metric === metric) === want) return day;
  }
  throw new Error(`no day for ${metric}`);
}

describe('starting out', () => {
  it('offers only home teams with three everyday players', () => {
    const teams = homeTeamChoices();
    expect(teams.map((t) => t.id)).toEqual(['comets', 'stompers', 'waves', 'skyhawks', 'yetis', 'coyotes']);
    for (const t of teams) {
      const ids = starterIds(t.id);
      expect(ids).toHaveLength(SQUAD_SIZE);
      expect(new Set(ids).size).toBe(SQUAD_SIZE);
      for (const id of ids) {
        expect(mustPlayer(id).team).toBe(t.id);
        expect(mustPlayer(id).rarity).toBe('common');
      }
      // the best of the three is the captain
      const ovr = ids.map((id) => playerOverall(mustPlayer(id)));
      expect([...ovr].sort((a, b) => b - a)).toEqual(ovr);
    }
  });

  it('starts every home team on about the same footing', () => {
    const strength = homeTeamChoices().map((t) => starterIds(t.id).reduce((a, id) => a + playerOverall(mustPlayer(id)), 0) / SQUAD_SIZE);
    expect(Math.max(...strength) - Math.min(...strength)).toBeLessThanOrEqual(4);
  });

  it('hands over three players, coins and a first pack', () => {
    const s = career('waves');
    expect(s.onboarded).toBe(true);
    expect(s.homeTeam).toBe('waves');
    expect(s.squad).toEqual(starterIds('waves'));
    expect(Object.keys(s.owned).sort()).toEqual([...s.squad].sort());
    expect(Object.values(s.owned)).toEqual([1, 1, 1]);
    expect(s.coins).toBe(STARTING_COINS);
    expect(s.packs).toEqual({ playground: 1 });
    expect(squadLevels(s)).toEqual(s.squad.map((id) => ({ id, level: 1 })));
  });

  it('does not change the save it was given', () => {
    const before = newSave();
    const copy = JSON.parse(JSON.stringify(before));
    startCareer(before, 'comets');
    expect(before).toEqual(copy);
  });
});

describe('packs', () => {
  it('sells a pack for its price', () => {
    const s = { ...career(), coins: 1000 };
    const next = buyPack(s, 'allstar');
    expect(next?.coins).toBe(1000 - packById('allstar').price);
    expect(next?.packs).toEqual({ playground: 1, allstar: 1 });
    expect(buyPack(next as SaveData, 'allstar')).toBeNull();
  });

  it('never sells a pack that can only be earned', () => {
    expect(buyPack({ ...career(), coins: 99999 }, 'team:comets')).toBeNull();
  });

  it('gives one free pack a day', () => {
    const s = claimFreePack(career(), DAY);
    expect(s?.packs.playground).toBe(2);
    expect(claimFreePack(s as SaveData, DAY)).toBeNull();
    expect(claimFreePack(s as SaveData, NEXT_DAY)?.packs.playground).toBe(3);
  });

  it('opens a pack you own and puts the players on the shelf', () => {
    const s = career();
    const res = openOwnedPack(s, 'playground', seededRng(11), DAY);
    expect(res).not.toBeNull();
    if (!res) return;
    expect(res.result.cards).toHaveLength(3);
    expect(res.data.packs).toEqual({});
    expect(res.data.stats.packs).toBe(1);
    for (const c of res.result.cards) {
      expect(res.data.owned[c.playerId]).toBeGreaterThan(0);
      if (c.isNew) expect(res.data.fresh).toContain(c.playerId);
    }
    const copies = (o: Record<string, number>) => Object.values(o).reduce((a, n) => a + n, 0);
    expect(copies(res.data.owned)).toBe(copies(s.owned) + 3);
    // looking at a new player clears the "new" mark
    const fresh = res.data.fresh[0];
    if (fresh) expect(markSeen(res.data, fresh).fresh).not.toContain(fresh);
    expect(markSeen(res.data, 'nobody')).toBe(res.data);
  });

  it('cannot open a pack you do not have', () => {
    expect(openOwnedPack(career(), 'legend', seededRng(1), DAY)).toBeNull();
    expect(openOwnedPack({ ...career(), packs: { legend: 0 } }, 'legend', seededRng(1), DAY)).toBeNull();
  });

  it('turns copies of maxed players into coins', () => {
    const owned: Record<string, number> = {};
    for (const p of PLAYERS) owned[p.id] = MAX_COPIES;
    const s = { ...career(), owned, coins: 0 };
    const res = openOwnedPack(s, 'playground', seededRng(3), DAY);
    expect(res?.result.coins).toBeGreaterThan(0);
    expect(res?.data.coins).toBe(res?.result.coins);
    expect(res?.data.owned).toEqual(owned);
    expect(res?.data.fresh).toEqual([]);
  });

  it('counts toward an "open a pack" mission', () => {
    const day = dayWith('packs');
    const res = openOwnedPack(career(), 'playground', seededRng(5), day);
    const m = res?.data.missions?.missions.find((x) => x.metric === 'packs');
    expect(m?.progress).toBe(1);
    expect(res?.data.missions?.day).toBe(day);
  });
});

describe('the squad', () => {
  it('takes three different players you own', () => {
    const s = { ...career(), owned: { ...career().owned, 'kai-nakoa': 1 } };
    const next = setSquad(s, ['kai-nakoa', s.squad[0], s.squad[1]]);
    expect(next.squad).toEqual(['kai-nakoa', s.squad[0], s.squad[1]]);
  });

  it('refuses players you do not own, repeats and short squads', () => {
    const s = career();
    expect(setSquad(s, ['stella-starr', s.squad[0], s.squad[1]])).toBe(s);
    expect(setSquad(s, [s.squad[0], s.squad[0], s.squad[1]])).toBe(s);
    expect(setSquad(s, [s.squad[0], s.squad[1]])).toBe(s);
  });

  it('plays at the level the cards have reached', () => {
    const s = career();
    const owned = { ...s.owned, [s.squad[0]]: 4, [s.squad[1]]: 11 };
    expect(squadLevels({ ...s, owned }).map((p) => p.level)).toEqual([3, 5, 1]);
  });
});

describe('after a quick game', () => {
  it('pays coins and keeps the record', () => {
    const s = career();
    const game = summary({ score: [24, 12], totals: [totals({ points: 24, dunks: 3, threes: 2, steals: 1, blocks: 1, perfects: 4 }), totals({ points: 12 })] });
    const { data, outcome } = finishMatch(s, game, DAY);
    expect(outcome.rewards.total).toBeGreaterThan(0);
    expect(data.coins).toBe(s.coins + outcome.rewards.total);
    expect(data.stats).toMatchObject({ games: 1, wins: 1, points: 24, dunks: 3, threes: 2, steals: 1, blocks: 1, perfects: 4, bestMargin: 12 });
    expect(data.firstWinDay).toBe(DAY);
    expect(outcome.ladder).toBeUndefined();
    expect(outcome.tour).toBeUndefined();
    expect(data.ladder).toEqual(s.ladder);
  });

  it('pays the first-win bonus once a day', () => {
    const first = finishMatch(career(), summary(), DAY);
    const second = finishMatch(first.data, summary(), DAY);
    const tomorrow = finishMatch(second.data, summary(), NEXT_DAY);
    const label = (o: typeof first.outcome) => o.rewards.lines.map((l) => l.label);
    expect(label(first.outcome)).toContain('First win today');
    expect(label(second.outcome)).not.toContain('First win today');
    expect(label(tomorrow.outcome)).toContain('First win today');
  });

  it('still pays a little for a loss and keeps the best margin', () => {
    const won = finishMatch(career(), summary({ score: [30, 10] }), DAY);
    const lost = finishMatch({ ...won.data, firstWinDay: null }, summary({ score: [8, 20] }), DAY);
    expect(lost.outcome.rewards.total).toBeGreaterThan(0);
    expect(lost.data.stats).toMatchObject({ games: 2, wins: 1, bestMargin: 20 });
    expect(lost.data.firstWinDay).toBeNull();
  });

  it('reports the missions a game finished', () => {
    const day = dayWith('games');
    let s = career();
    const done: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = finishMatch(s, summary({ score: [9, 12] }), day);
      s = res.data;
      done.push(...res.outcome.missionsDone.map((m) => m.metric));
    }
    // finished exactly once, in the game that reached the target
    expect(done.filter((m) => m === 'games')).toHaveLength(1);
    const m = s.missions?.missions.find((x) => x.metric === 'games');
    expect(m?.progress).toBe(m?.target);
  });
});

describe('after a ladder game', () => {
  const ladderGame = (score: [number, number]) => summary({ mode: 'ladder', score });

  it('moves up for a win and never below the tier floor for a loss', () => {
    const s = career();
    const won = finishMatch(s, ladderGame([20, 14]), DAY);
    expect(won.outcome.ladder).toEqual({ before: 0, after: 34 });
    expect(won.data.ladder).toEqual({ points: 34, games: 1, wins: 1, bestTier: 0 });
    const lost = finishMatch({ ...s, ladder: { points: 104, games: 9, wins: 5, bestTier: 1 } }, ladderGame([10, 14]), DAY);
    expect(lost.data.ladder).toEqual({ points: 100, games: 10, wins: 5, bestTier: 1 });
    expect(lost.outcome.ladder?.promoted).toBeUndefined();
  });

  it('pays a tier prize the first time only', () => {
    const s = { ...career(), ladder: { points: 90, games: 4, wins: 3, bestTier: 0 } };
    const up = finishMatch(s, ladderGame([20, 14]), DAY);
    expect(up.outcome.ladder?.promoted?.name).toBe('Bronze');
    expect(up.data.coins).toBe(s.coins + up.outcome.rewards.total + TIERS[1].reward.coins);
    expect(up.data.ladder.bestTier).toBe(1);
    // already been this high: no second prize
    const again = finishMatch({ ...s, ladder: { ...s.ladder, bestTier: 1 } }, ladderGame([20, 14]), DAY);
    expect(again.outcome.ladder?.promoted).toBeUndefined();
    expect(again.data.coins).toBe(s.coins + again.outcome.rewards.total);
  });

  it('pays every tier passed and hands over the packs', () => {
    const s = { ...career(), ladder: { points: 240, games: 8, wins: 7, bestTier: 0 } };
    const up = finishMatch(s, ladderGame([30, 10]), DAY);
    expect(up.outcome.ladder?.promoted?.name).toBe('Silver');
    expect(up.data.coins).toBe(s.coins + up.outcome.rewards.total + TIERS[1].reward.coins + TIERS[2].reward.coins);
    expect(up.data.packs).toEqual({ playground: 2 });
  });
});

describe('after a tour game', () => {
  const tour = tourById('neighborhood', 'comets');
  const tourGame = (stage: number, game: number, score: [number, number]) => summary({ mode: 'tour', score, tour: { tourId: tour.id, stage, game } });

  it('pays the first win, counts stars and never pays twice', () => {
    const s = career();
    const g = tour.stages[0].games[0];
    const close = finishMatch(s, tourGame(0, 0, [15, 13]), DAY);
    expect(close.outcome.tour).toMatchObject({ stars: 1, starsBefore: 0, firstClear: true, coins: g.coins });
    expect(close.data.coins).toBe(s.coins + close.outcome.rewards.total + g.coins);
    expect(close.data.tour[gameKey(tour.id, 0, 0)]).toBe(1);

    const big = finishMatch(close.data, tourGame(0, 0, [30, 12]), DAY);
    expect(big.outcome.tour).toMatchObject({ stars: 3, starsBefore: 1, firstClear: false, coins: 0 });
    expect(big.data.coins).toBe(close.data.coins + big.outcome.rewards.total);
    expect(big.data.tour[gameKey(tour.id, 0, 0)]).toBe(3);

    // a worse result later never takes stars away
    const worse = finishMatch(big.data, tourGame(0, 0, [15, 14]), DAY);
    expect(worse.data.tour[gameKey(tour.id, 0, 0)]).toBe(3);
    const lost = finishMatch(big.data, tourGame(0, 0, [10, 14]), DAY);
    expect(lost.outcome.tour).toMatchObject({ stars: 0, firstClear: false, coins: 0 });
    expect(lost.data.tour[gameKey(tour.id, 0, 0)]).toBe(3);
  });

  it('gives the team pack for the Rivalry and the star player for the Showdown', () => {
    const s = career();
    const rivalry = finishMatch(s, tourGame(0, 1, [15, 13]), DAY);
    expect(rivalry.outcome.tour?.pack).toBe('team:stompers');
    expect(rivalry.data.packs['team:stompers']).toBe(1);

    const star = tour.stages[0].games[2].unlock as string;
    const showdown = finishMatch(rivalry.data, tourGame(0, 2, [15, 13]), DAY);
    expect(showdown.outcome.tour?.unlock).toMatchObject({ playerId: star, isNew: true, levelAfter: 1 });
    expect(showdown.data.owned[star]).toBe(1);
    expect(showdown.data.fresh).toContain(star);

    // winning it again does not hand out a second copy
    const again = finishMatch(showdown.data, tourGame(0, 2, [30, 10]), DAY);
    expect(again.outcome.tour?.unlock).toBeUndefined();
    expect(again.data.owned[star]).toBe(1);
  });

  it('gives the star pack once every star on a stop is earned', () => {
    let s = career();
    const got: (string | undefined)[] = [];
    for (let g = 0; g < 3; g++) {
      const res = finishMatch(s, tourGame(0, g, [30, 10]), DAY);
      s = res.data;
      got.push(res.outcome.tour?.starPack);
    }
    expect(got).toEqual([undefined, undefined, tour.stages[0].starPack]);
    expect(s.packs[tour.stages[0].starPack]).toBe(1);
    expect(s.starPacks).toEqual({ [`${tour.id}/0`]: true });
    expect(Object.values(s.tour)).toEqual([STARS_PER_GAME, STARS_PER_GAME, STARS_PER_GAME]);
    const replay = finishMatch(s, tourGame(0, 1, [30, 10]), DAY);
    expect(replay.outcome.tour?.starPack).toBeUndefined();
    expect(replay.data.packs[tour.stages[0].starPack]).toBe(1);
  });

  it('pays coins instead when the star player is already maxed', () => {
    const star = tour.stages[0].games[2].unlock as string;
    const s = { ...career(), owned: { ...career().owned, [star]: MAX_COPIES } };
    const res = finishMatch(s, tourGame(0, 2, [15, 13]), DAY);
    expect(res.outcome.tour?.unlock?.coins).toBeGreaterThan(0);
    expect(res.data.owned[star]).toBe(MAX_COPIES);
    expect(res.data.coins).toBe(s.coins + res.outcome.rewards.total + tour.stages[0].games[2].coins + (res.outcome.tour?.unlock?.coins ?? 0));
  });

  it('ignores a game that is not on the tour', () => {
    const s = career();
    const res = finishMatch(s, tourGame(42, 0, [20, 10]), DAY);
    expect(res.outcome.tour).toBeUndefined();
    expect(res.data.tour).toEqual({});
  });
});

describe('missions', () => {
  const finished = (day: string): MissionDay => {
    const today = missionsFor(day);
    return { ...today, missions: today.missions.map((m) => ({ ...m, progress: m.target })) };
  };

  it('pays a finished mission once', () => {
    const s = { ...career(), missions: finished(DAY) };
    const next = claimMission(s, 0, DAY);
    expect(next?.coins).toBe(s.coins + finished(DAY).missions[0].coins);
    expect(next?.missions?.missions[0].claimed).toBe(true);
    expect(claimMission(next as SaveData, 0, DAY)).toBeNull();
  });

  it('does not pay early, or for a mission that is not there', () => {
    const s = career();
    expect(claimMission(s, 0, DAY)).toBeNull();
    expect(claimMission({ ...s, missions: finished(DAY) }, 7, DAY)).toBeNull();
    // yesterday's finished missions do not count today
    expect(claimMission({ ...s, missions: finished(DAY) }, 0, NEXT_DAY)).toBeNull();
  });

  it('gives the bonus pack after all three are collected', () => {
    let s: SaveData = { ...career(), missions: finished(DAY) };
    expect(claimMissionBonus(s, DAY)).toBeNull();
    for (let i = 0; i < 3; i++) s = claimMission(s, i, DAY) as SaveData;
    const next = claimMissionBonus(s, DAY);
    expect(next?.packs.playground).toBe(2);
    expect(next?.missions?.bonusClaimed).toBe(true);
    expect(claimMissionBonus(next as SaveData, DAY)).toBeNull();
  });
});

describe('repairing a save', () => {
  it('starts fresh from nothing', () => {
    expect(repairSave(null)).toEqual(newSave());
    expect(repairSave('nope')).toEqual(newSave());
    expect(repairSave({})).toEqual(newSave());
  });

  it('leaves a healthy save alone', () => {
    let s = career('yetis');
    s = finishMatch(s, summary({ mode: 'ladder', score: [22, 10] }), DAY).data;
    s = openOwnedPack(s, 'playground', seededRng(9), DAY)?.data as SaveData;
    expect(repairSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('fills in anything an older save did not have', () => {
    const s = career();
    const old = JSON.parse(JSON.stringify(s));
    delete old.settings.easyShots;
    delete old.stats;
    delete old.starPacks;
    delete old.tips;
    delete old.ladder;
    const fixed = repairSave(old);
    expect(fixed.settings).toEqual(DEFAULT_SETTINGS);
    expect(fixed.stats).toEqual(newSave().stats);
    expect(fixed.ladder).toEqual(newSave().ladder);
    expect(fixed.squad).toEqual(s.squad);
    expect(fixed.onboarded).toBe(true);
  });

  it('swaps squad players this build does not know for your best cards', () => {
    const s = career();
    const fixed = repairSave({ ...s, owned: { ...s.owned, 'someone-else': 3, 'kai-nakoa': 1 }, squad: ['someone-else', s.squad[0], s.squad[0]], fresh: ['someone-else', 'kai-nakoa'] });
    expect(fixed.squad).toEqual([s.squad[0], 'kai-nakoa', s.squad[1]]);
    expect(fixed.onboarded).toBe(true);
    // the unknown card stays in the save for the day its roster comes back
    expect(fixed.owned['someone-else']).toBe(3);
    expect(fixed.fresh).toEqual(['kai-nakoa']);
  });

  it('goes back to picking a team when there is no squad to field', () => {
    const fixed = repairSave({ ...career(), owned: { 'someone-else': 2 }, squad: ['someone-else'], homeTeam: 'gone', coins: 420 });
    expect(fixed.onboarded).toBe(false);
    expect(fixed.squad).toEqual([]);
    expect(fixed.homeTeam).toBeNull();
    expect(fixed.coins).toBe(420);
    // and picking a team again works from there
    const again = startCareer(fixed, 'stompers');
    expect(again.squad).toEqual(starterIds('stompers'));
    expect(again.owned['someone-else']).toBe(2);
  });

  it('drops packs it cannot open and settings the menus do not offer', () => {
    const s = career();
    const fixed = repairSave({
      ...s,
      coins: -50,
      packs: { playground: 2, 'team:gone': 1, mystery: 4, allstar: 0, legend: 'x' },
      settings: { ...s.settings, difficulty: 7, quarterSeconds: 5, format: 4, sound: 'yes', lefty: true },
      ladder: { points: 460, games: 3, wins: 3, bestTier: 0 },
      tour: { 'neighborhood/0/0': 9, 'neighborhood/0/1': 'x', 'neighborhood/0/2': 2 },
      missions: { day: 5 },
    });
    expect(fixed.coins).toBe(0);
    expect(fixed.packs).toEqual({ playground: 2 });
    expect(fixed.settings).toEqual({ ...DEFAULT_SETTINGS, lefty: true });
    expect(fixed.ladder.bestTier).toBe(3);
    expect(fixed.tour).toEqual({ 'neighborhood/0/0': 3, 'neighborhood/0/2': 2 });
    expect(fixed.missions).toBeNull();
  });

  it('keeps every team’s starters playable', () => {
    for (const t of homeTeamChoices()) {
      const s = repairSave(JSON.parse(JSON.stringify(career(t.id))));
      expect(s.squad).toEqual(starterIds(t.id));
      expect(teamPlayers(t.id).filter((p) => s.owned[p.id]).length).toBe(3);
    }
  });
});
