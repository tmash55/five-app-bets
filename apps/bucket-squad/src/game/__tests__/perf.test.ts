import { perfAdd, perfFrame, perfLines, perfLoad, perfOn, perfReset, perfSound, perfStep, perfSummary } from '../perf';

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
