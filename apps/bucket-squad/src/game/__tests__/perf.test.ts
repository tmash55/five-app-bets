import { perfAdd, perfFrame, perfLoad, perfOn, perfReset, perfSound, perfStep, perfSummary } from '../perf';

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
  });
});
