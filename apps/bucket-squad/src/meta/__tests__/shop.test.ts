import { PLAYERS, mustPlayer } from '@/data/roster';
import { HOLIDAY_UNIFORMS, LIMITED_UNIFORMS, LIMITED_UNIFORM_PRICE } from '@/data/uniforms';

import { LEVEL_COPIES, MAX_COPIES, type Owned } from '../collection';
import { SHOP_PACKS } from '../packs';
import { dayKey } from '../rng';
import {
  DEAL_PRICE,
  DEAL_SLOTS,
  FEATURED_PRICE,
  HOLIDAY_START,
  LIMITED_SLOT,
  canAfford,
  clock,
  coins,
  copyLevelsUp,
  cycleOrder,
  cyclePick,
  dayNumber,
  featuredPool,
  limitedSlot,
  monthOf,
  msToMidnight,
  pay,
  rollDeals,
  shopDay,
  shopIsNew,
  shopSlots,
  shortBy,
  shortClock,
  uniformTurn,
} from '../shop';

/** a run of day keys from a start date */
function days(from: string, n: number): string[] {
  const [y, m, d] = from.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => dayKey(new Date(y, m - 1, d + i)));
}

const DAY = '2026-11-13';

describe('money', () => {
  it('checks and takes a price in one place', () => {
    const purse = { coins: 500, other: 'kept' };
    expect(canAfford(purse, coins(500))).toBe(true);
    expect(canAfford(purse, coins(501))).toBe(false);
    expect(shortBy(purse, coins(650))).toBe(150);
    expect(shortBy(purse, coins(100))).toBe(0);
    expect(pay(purse, coins(120))).toEqual({ coins: 380, other: 'kept' });
    expect(pay(purse, coins(501))).toBeNull();
    expect(pay(purse, coins(-5))).toBeNull();
  });
});

describe('the day and the countdown', () => {
  it('numbers the days one apart, across months and years', () => {
    expect(dayNumber('2026-11-14') - dayNumber('2026-11-13')).toBe(1);
    expect(dayNumber('2027-01-01') - dayNumber('2026-12-31')).toBe(1);
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2);
  });

  it('counts down to the next local midnight', () => {
    expect(msToMidnight(new Date(2026, 10, 13, 23, 59, 59))).toBe(1000);
    expect(msToMidnight(new Date(2026, 10, 13, 18, 27, 50))).toBe((5 * 3600 + 32 * 60 + 10) * 1000);
    // a new day starts the full count again
    const justAfter = new Date(2026, 10, 14, 0, 0, 1);
    expect(msToMidnight(justAfter)).toBe(new Date(2026, 10, 15).getTime() - justAfter.getTime());
    // across the end of a year
    expect(msToMidnight(new Date(2026, 11, 31, 23, 0, 0))).toBe(3600 * 1000);
  });

  it('prints the countdown like a scoreboard, and short', () => {
    expect(clock((5 * 3600 + 32 * 60 + 10) * 1000)).toBe('05:32:10');
    expect(clock(999)).toBe('00:00:01');
    expect(clock(0)).toBe('00:00:00');
    expect(clock(24 * 3600 * 1000)).toBe('24:00:00');
    expect(shortClock((1 * 3600 + 5 * 60 + 30) * 1000)).toBe('1h 05m');
    expect(shortClock((32 * 60 + 9) * 1000)).toBe('32m 09s');
  });
});

describe('the LIMITED slot', () => {
  it('is the same all day for everyone and changes every day', () => {
    const run = days(DAY, 30);
    const slots = run.map((d) => limitedSlot(d));
    expect(run.map((d) => limitedSlot(d))).toEqual(slots);
    for (let i = 1; i < slots.length; i++) expect(slots[i]?.item).not.toEqual(slots[i - 1]?.item);
  });

  it('takes turns: a limited uniform one day, a featured player the next', () => {
    for (const d of days(DAY, 20)) {
      const slot = limitedSlot(d);
      expect(slot?.id).toBe(LIMITED_SLOT);
      expect(slot?.limited).toBe(true);
      expect(slot?.item.kind).toBe(dayNumber(d) % 2 === 0 ? 'uniform' : 'player');
    }
  });

  it('shows every limited uniform once in each cycle, and never one twice in a row across cycles', () => {
    const n = LIMITED_UNIFORMS.length;
    // a limited edition's turn on a uniform day (holiday days are not its turns)
    const turnOf = (d: string): number | null => {
      if (dayNumber(d) % 2 !== 0) return null;
      const at = uniformTurn(d);
      return 'turn' in at ? at.turn : null;
    };
    // start on a uniform day at the start of a cycle
    let start = DAY;
    while (turnOf(start) === null || (turnOf(start) as number) % n !== 0) start = days(start, 2)[1];
    // six cycles' worth of the limited editions' days, through December's and January's holiday days
    const uniformDays = days(start, n * 2 * 6 * 2)
      .filter((d) => turnOf(d) !== null)
      .slice(0, n * 6);
    expect(uniformDays).toHaveLength(n * 6);
    expect(uniformDays.some((d) => monthOf(d) === 12)).toBe(true);
    const ids = uniformDays.map((d) => limitedSlot(d)?.item.id);
    // the turns run on one by one, skipping nothing
    uniformDays.forEach((d, i) => expect(turnOf(d)).toBe((turnOf(start) as number) + i));
    for (let c = 0; c < 6; c++) {
      const cycle = ids.slice(c * n, (c + 1) * n);
      expect(new Set(cycle).size).toBe(n);
      expect([...cycle].sort()).toEqual(LIMITED_UNIFORMS.map((u) => u.id).sort());
    }
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it('runs a cycle through every item and keeps the seams apart', () => {
    const items = ['a', 'b', 'c', 'd'];
    for (let c = -3; c < 40; c++) {
      const order = cycleOrder(items, c, 'test');
      expect([...order].sort()).toEqual(items);
      expect(order[0]).not.toBe(cycleOrder(items, c - 1, 'test')[items.length - 1]);
    }
  });

  it('prices a limited uniform and a featured Epic or Legend at a premium', () => {
    for (const d of days(DAY, 40)) {
      const slot = limitedSlot(d);
      if (!slot) throw new Error('no slot');
      expect(slot.price.currency).toBe('coins');
      if (slot.item.kind === 'uniform') expect(slot.price.amount).toBe(LIMITED_UNIFORM_PRICE);
      else {
        const p = mustPlayer(slot.item.id);
        expect(['epic', 'legend']).toContain(p.rarity);
        expect(slot.price.amount).toBe(FEATURED_PRICE[p.rarity as 'epic' | 'legend']);
      }
    }
    // a pick of your own costs more than a pack's chance at it
    expect(FEATURED_PRICE.legend).toBeGreaterThan(SHOP_PACKS[2].price);
    expect(FEATURED_PRICE.epic).toBeGreaterThan(DEAL_PRICE.epic);
  });

  it('features every Epic and Legend once in each cycle', () => {
    const pool = featuredPool();
    const n = pool.length;
    let start = DAY;
    while (!(dayNumber(start) % 2 === 1 && Math.floor(dayNumber(start) / 2) % n === 0)) start = days(start, 2)[1];
    const ids = days(start, n * 2)
      .filter((d) => dayNumber(d) % 2 === 1)
      .map((d) => limitedSlot(d)?.item.id);
    expect([...ids].sort()).toEqual(pool.map((p) => p.id).sort());
  });
});

describe('the holiday uniforms', () => {
  /** every day from the start of the holidays over the next three years */
  const run = days(HOLIDAY_START, 3 * 366);

  it('never sells a holiday uniform outside its own month, nor before the holidays start', () => {
    const holidayIds = new Set(HOLIDAY_UNIFORMS.map((u) => u.id));
    for (const d of run) {
      const slot = limitedSlot(d);
      const u = HOLIDAY_UNIFORMS.find((h) => h.id === slot?.item.id);
      if (u) expect(monthOf(d)).toBe(u.month);
    }
    // the year before: never
    for (const d of days('2025-10-01', 396)) expect(holidayIds.has(limitedSlot(d)?.item.id ?? '')).toBe(false);
  });

  it('sells each one often in its month: every other uniform day, from the first one', () => {
    for (const u of HOLIDAY_UNIFORMS) {
      for (const year of [2027, 2028, 2029]) {
        const month = days(`${year}-${String(u.month).padStart(2, '0')}-01`, 31).filter((d) => monthOf(d) === u.month);
        const uniformDays = month.filter((d) => dayNumber(d) % 2 === 0);
        const kinds = uniformDays.map((d) => (limitedSlot(d)?.item.id === u.id ? 'holiday' : 'limited'));
        expect(kinds[0]).toBe('holiday');
        kinds.forEach((k, i) => expect(k).toBe(i % 2 === 0 ? 'holiday' : 'limited'));
        // at least seven days of the month
        expect(kinds.filter((k) => k === 'holiday').length).toBeGreaterThanOrEqual(7);
        // the player days in between stay featured players
        for (const d of month.filter((x) => dayNumber(x) % 2 === 1)) expect(limitedSlot(d)?.item.kind).toBe('player');
      }
    }
    // this December is the first: Christmas comes up on its first uniform day
    const december = days('2026-12-01', 2).find((d) => dayNumber(d) % 2 === 0) as string;
    expect(limitedSlot(december)?.item.id).toBe('holly-jolly');
  });

  it('sells a holiday uniform at the limited price, and the limited editions keep their days between', () => {
    for (const d of run) {
      const slot = limitedSlot(d);
      if (slot?.item.kind !== 'uniform') continue;
      expect(slot.price).toEqual(coins(LIMITED_UNIFORM_PRICE));
      const at = uniformTurn(d);
      expect(slot.item.id).toBe('holiday' in at ? at.holiday.id : cyclePick(LIMITED_UNIFORMS, at.turn, 'limited-uniform').id);
    }
  });

  it('leaves every day before the first holiday month as it always was', () => {
    for (const d of days('2026-01-01', 365)) {
      if (d >= '2026-12-01') break;
      const n = dayNumber(d);
      if (n % 2 !== 0) continue;
      expect(limitedSlot(d)?.item.id).toBe(cyclePick(LIMITED_UNIFORMS, Math.floor(n / 2), 'limited-uniform').id);
    }
  });

  it('can be left out: with no holiday uniforms the rotation is the plain one', () => {
    for (const d of days('2027-10-01', 31)) {
      const n = dayNumber(d);
      if (n % 2 !== 0) continue;
      expect(limitedSlot(d, LIMITED_UNIFORMS, undefined, [])?.item.id).toBe(cyclePick(LIMITED_UNIFORMS, Math.floor(n / 2), 'limited-uniform').id);
    }
  });
});

describe('the deals', () => {
  it('rolls three cards, the same for a day and a collection, different across days', () => {
    const a = rollDeals(DAY, {});
    expect(a).toHaveLength(DEAL_SLOTS);
    expect(new Set(a).size).toBe(DEAL_SLOTS);
    expect(rollDeals(DAY, {})).toEqual(a);
    const week = days(DAY, 7).map((d) => rollDeals(d, {}).join());
    expect(new Set(week).size).toBeGreaterThan(4);
  });

  it('prices each deal by rarity, cheapest first, and never sells a Legend as a deal', () => {
    let epics = 0;
    for (const d of days(DAY, 120)) {
      const today = shopDay(null, d, {});
      const deals = shopSlots(today).filter((s) => !s.limited);
      expect(deals).toHaveLength(DEAL_SLOTS);
      let last = 0;
      for (const s of deals) {
        const p = mustPlayer(s.item.id);
        expect(p.rarity).not.toBe('legend');
        expect(s.price).toEqual(coins(DEAL_PRICE[p.rarity as keyof typeof DEAL_PRICE]));
        expect(s.price.amount).toBeGreaterThanOrEqual(last);
        last = s.price.amount;
        if (p.rarity === 'epic') epics++;
      }
    }
    // mostly Commons and Rares, now and then an Epic
    expect(epics).toBeGreaterThan(10);
    expect(epics).toBeLessThan(80);
  });

  it('never offers the featured player as a deal too', () => {
    for (const d of days(DAY, 40)) {
      const slots = shopSlots(shopDay(null, d, {}));
      const ids = slots.map((s) => s.item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('leans toward players you do not have, and skips players at the top level', () => {
    const commons = PLAYERS.filter((p) => p.rarity === 'common');
    // own every Common but one, and max out half of them
    const owned: Owned = {};
    commons.slice(1).forEach((p, i) => (owned[p.id] = i % 2 === 0 ? MAX_COPIES : 2));
    let fresh = 0;
    let seen = 0;
    for (const d of days(DAY, 200)) {
      for (const id of rollDeals(d, owned)) {
        expect(owned[id] ?? 0).toBeLessThan(MAX_COPIES);
        if (mustPlayer(id).rarity !== 'common') continue;
        seen++;
        if (id === commons[0].id) fresh++;
      }
    }
    // one new Common among eight or so owned ones turns up far more than its share
    const share = 1 / commons.filter((p) => (owned[p.id] ?? 0) < MAX_COPIES).length;
    expect(fresh / seen).toBeGreaterThan(share * 1.6);
  });

  it('knows when one more copy is a level up', () => {
    expect(copyLevelsUp(0)).toBe(true);
    expect(copyLevelsUp(LEVEL_COPIES[1] - 1)).toBe(true);
    expect(copyLevelsUp(LEVEL_COPIES[1])).toBe(false);
    expect(copyLevelsUp(MAX_COPIES)).toBe(false);
  });

  it('keeps a day it has saved, and rolls a new one the next day', () => {
    const saved = { day: DAY, deals: ['made-up'], sold: [LIMITED_SLOT] };
    expect(shopDay(saved, DAY, {})).toBe(saved);
    expect(shopDay(saved, '2026-11-14', {})).toEqual({ day: '2026-11-14', deals: rollDeals('2026-11-14', {}, PLAYERS, skipFor('2026-11-14')), sold: [] });
    // a deal for a player this build does not have is left out
    expect(shopSlots(saved).map((s) => s.id)).toEqual([LIMITED_SLOT]);
    expect(shopIsNew(null, DAY)).toBe(true);
    expect(shopIsNew(saved, DAY)).toBe(false);
    expect(shopIsNew(saved, '2026-11-14')).toBe(true);
  });
});

function skipFor(day: string): string[] {
  const slot = limitedSlot(day);
  return slot?.item.kind === 'player' ? [slot.item.id] : [];
}
