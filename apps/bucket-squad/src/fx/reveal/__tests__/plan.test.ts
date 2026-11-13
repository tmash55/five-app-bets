import { PLAYERS, mustPlayer, playerOverall } from '@/data/roster';
import { RARITIES } from '@/data/types';
import { RATING_KEYS } from '@/game/sim/ratings';
import { bestRarity, bestStats, cardNumber, demoResult, gainLabel, parseDemo, planPack, teamCount } from '../plan';
import { ARRIVE, REVEAL_TIMES, TEAR, tearLength } from '../times';

const first = PLAYERS[0];

describe('the three ratings a card shows', () => {
  it('shows three, best first', () => {
    const stats = bestStats(first);
    expect(stats).toHaveLength(3);
    expect(stats[0].value).toBeGreaterThanOrEqual(stats[1].value);
    expect(stats[1].value).toBeGreaterThanOrEqual(stats[2].value);
  });

  it('really are the best three of all the ratings', () => {
    for (const p of PLAYERS) {
      const shown = bestStats(p);
      const all = RATING_KEYS.map((k) => p.ratings[k]).sort((a, b) => b - a);
      expect(shown.map((s) => s.value)).toEqual(all.slice(0, 3));
    }
  });

  it('keeps the printed order when two ratings tie', () => {
    for (const p of PLAYERS) {
      const shown = bestStats(p, 1, RATING_KEYS.length);
      for (let i = 1; i < shown.length; i++) {
        if (shown[i].value === shown[i - 1].value) expect(RATING_KEYS.indexOf(shown[i].key)).toBeGreaterThan(RATING_KEYS.indexOf(shown[i - 1].key));
      }
    }
  });

  it('goes up with the level', () => {
    const one = bestStats(first, 1);
    const three = bestStats(first, 3);
    expect(three[0].value).toBeGreaterThan(one[0].value);
  });

  it('labels them in capitals', () => {
    for (const s of bestStats(first)) expect(s.label).toBe(s.label.toUpperCase());
  });
});

describe('the card number', () => {
  it('counts from one in roster order within the league', () => {
    expect(cardNumber(first)).toEqual({ number: 1, of: PLAYERS.filter((p) => cardNumber(p).of === cardNumber(first).of).length });
  });

  it('gives every player of a league a different number', () => {
    const seen = new Set(PLAYERS.map((p) => `${cardNumber(p).of}/${cardNumber(p).number}`));
    expect(seen.size).toBe(PLAYERS.length);
    for (const p of PLAYERS) {
      const n = cardNumber(p);
      expect(n.number).toBeGreaterThanOrEqual(1);
      expect(n.number).toBeLessThanOrEqual(n.of);
    }
  });
});

describe('the tag', () => {
  it('says what the card did for the collection', () => {
    expect(gainLabel({ playerId: 'x', isNew: true, levelBefore: 0, levelAfter: 1, coins: 0 }).text).toBe('NEW!');
    expect(gainLabel({ playerId: 'x', isNew: false, levelBefore: 5, levelAfter: 5, coins: 40 }).text).toBe('+40 COINS');
    expect(gainLabel({ playerId: 'x', isNew: false, levelBefore: 1, levelAfter: 2, coins: 0 }).text).toBe('LEVEL UP! LV 2');
    expect(gainLabel({ playerId: 'x', isNew: false, levelBefore: 2, levelAfter: 2, coins: 0 }).text).toBe('EXTRA COPY');
  });
});

describe('the demo pack', () => {
  it('reads the rarities it asks for and nothing else', () => {
    expect(parseDemo('common,rare,epic,legend')).toEqual(['common', 'rare', 'epic', 'legend']);
    expect(parseDemo(' Legend , nonsense,rare')).toEqual(['legend', 'rare']);
    expect(parseDemo(['epic', 'epic'])).toEqual(['epic', 'epic']);
    expect(parseDemo('common,common,common,common,common,common,common')).toHaveLength(5);
    expect(parseDemo('')).toBeNull();
    expect(parseDemo(undefined)).toBeNull();
    expect(parseDemo('shiny')).toBeNull();
  });

  it('takes the first player of each rarity, all new, and pays nothing', () => {
    const before = { [first.id]: 3 };
    const res = demoResult(['common', 'rare', 'epic', 'legend'], before);
    expect(res.coins).toBe(0);
    expect(res.cards.map((c) => mustPlayer(c.playerId).rarity)).toEqual(['common', 'rare', 'epic', 'legend']);
    for (const c of res.cards) {
      expect(c.isNew).toBe(true);
      expect(c.playerId).toBe(PLAYERS.find((p) => p.rarity === mustPlayer(c.playerId).rarity)?.id);
    }
    expect(before).toEqual({ [first.id]: 3 });
  });

  it('takes the next player when a rarity is asked for twice', () => {
    const res = demoResult(['rare', 'rare'], {});
    expect(res.cards[0].playerId).not.toBe(res.cards[1].playerId);
  });
});

describe('planning a pack', () => {
  const res = demoResult(['common', 'rare', 'epic', 'legend'], {});
  const plans = planPack(res);

  it('plans every card, in order, with its own reveal', () => {
    expect(plans.map((p) => p.rarity)).toEqual(['common', 'rare', 'epic', 'legend']);
    for (const p of plans) {
      expect(p.reveal).toBe(REVEAL_TIMES[p.rarity]);
      expect(p.overall).toBe(playerOverall(p.player, p.level));
      expect(p.label.text).toBe('NEW!');
      expect(p.stats).toHaveLength(3);
    }
  });

  it('counts the team against the collection once the pack is open', () => {
    for (const p of plans) {
      expect(p.team).toEqual(teamCount(p.player, res.owned));
      expect(p.team.have).toBeGreaterThanOrEqual(1);
    }
  });

  it('lights the tear in the colour of the best card', () => {
    expect(bestRarity(plans)).toBe('legend');
    expect(bestRarity([{ rarity: 'rare' }, { rarity: 'common' }])).toBe('rare');
    expect(bestRarity([])).toBe(RARITIES[0]);
  });
});

describe('the reveal times', () => {
  it('make a better card wait longer', () => {
    for (let i = 1; i < RARITIES.length; i++) {
      expect(REVEAL_TIMES[RARITIES[i]].length).toBeGreaterThan(REVEAL_TIMES[RARITIES[i - 1]].length);
      expect(REVEAL_TIMES[RARITIES[i]].flipAt).toBeGreaterThan(REVEAL_TIMES[RARITIES[i - 1]].flipAt);
    }
  });

  it('show the face before each reveal is over', () => {
    for (const r of RARITIES) {
      expect(REVEAL_TIMES[r].flipAt).toBeGreaterThan(0);
      expect(REVEAL_TIMES[r].flipAt).toBeLessThan(REVEAL_TIMES[r].length);
    }
  });

  it('keep the tear in order and land the last card after the others', () => {
    expect(TEAR.rip).toBeLessThan(TEAR.flash);
    expect(TEAR.flash).toBeLessThan(TEAR.deal);
    expect(tearLength(5)).toBeGreaterThan(tearLength(3));
    expect(tearLength(3)).toBeGreaterThanOrEqual(TEAR.deal + 2 * TEAR.dealGap + TEAR.fly);
    expect(ARRIVE).toBeGreaterThan(0);
  });
});
