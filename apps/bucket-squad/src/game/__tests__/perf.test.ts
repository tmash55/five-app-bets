import { perfAdd, perfFrame, perfLevel, perfLines, perfLoad, perfOn, perfReset, perfSound, perfStep, perfSummary } from '../perf';

const g = globalThis as { __perfOn?: boolean };

afterEach(() => {
  g.__perfOn = undefined;
  perfReset();
});

describe('the frame probe', () => {
  it('notes nothing while it is off', () => {
    expect(perfOn()).toBe(false);
    for (let i = 0; i < 50; i++) perfFrame(16.7);
    expect(perfSummary().frames).toBe(0);
  });

  it('finds the slow frames and what happened in them', () => {
    g.__perfOn = true;
    for (let i = 0; i < 100; i++) {
      perfFrame(i === 60 || i === 80 ? 140 : 16.7);
      perfAdd('draw', 2);
      perfStep(i % 10 === 5 ? ['bounce'] : []);
      if (i === 60) {
        perfStep(['dunk']);
        perfSound('dunk');
        perfLoad('dunk');
      }
      if (i === 80) perfSound('net');
    }
    const s = perfSummary();
    expect(s.frames).toBe(70);
    expect(s.slow).toBe(2);
    expect(s.stalls).toBe(2);
    expect(s.worst).toBe(140);
    expect(s.together['load:dunk']).toEqual({ slow: 1, all: 1 });
    expect(s.together['catch-up']).toEqual({ slow: 1, all: 1 });
    expect(s.together['event:bounce']).toBeUndefined();
    expect(s.top[0].gap).toBe(140);
    expect(s.fps).toBeGreaterThan(40);
    expect(s.avg.draw).toBe(2);
    expect(s.avg.steps).toBe(1);
    expect(s.p90.draw).toBe(2);
  });

  it('counts the frames that missed 60 and 30 a second, and notes each change of graphics level', () => {
    g.__perfOn = true;
    perfLevel(0);
    for (let i = 0; i < 130; i++) {
      if (i === 80) perfLevel(5);
      perfFrame(i < 80 ? (i % 10 === 0 ? 25 : 16.7) : i % 10 === 0 ? 50 : 33.4);
      perfAdd('anim', 1);
      perfAdd('submit', 3);
    }
    const s = perfSummary();
    expect(s.over20).toBe(5 + 50);
    expect(s.over33).toBe(5);
    expect(s.avg.anim).toBe(1);
    expect(s.avg.submit).toBe(3);
    expect(s.level).toBe(5);
    expect(s.levels).toEqual([[80, 5]]);
    perfLevel(0);
  });

  it('splits a long summary into numbered pieces a phone log keeps whole', () => {
    g.__perfOn = true;
    for (let i = 0; i < 200; i++) {
      perfFrame(i % 3 === 0 ? 120 : 16.7);
      perfStep(['dribble', 'pass', 'catch', 'bounce']);
      perfSound('dribble');
    }
    const s = perfSummary();
    const lines = perfLines('match', s);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((l, i) => {
      expect(l.startsWith(`BSPERF match ${i + 1}/${lines.length} `)).toBe(true);
      expect(l.length).toBeLessThan(900);
    });
    const joined = lines.map((l) => l.replace(/^BSPERF match \d+\/\d+ /, '')).join('');
    expect(JSON.parse(joined)).toEqual(s);
  });
});
