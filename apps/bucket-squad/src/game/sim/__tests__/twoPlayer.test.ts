/** Two people on one court: a seat each, their own controlled player, and the computer for everybody else. */

import { RULES } from '../constants';
import { shotMeter } from '../core';
import { heatScale } from '../fire';
import { emptyFrame, packFrame, quantizeFrame, unpackFrame } from '../input';
import { bandOf, controlOf, isControlled, isHuman, seatOf, twoHumans } from '../seats';
import { createMatch, stepMatch } from '../sim';
import type { InputFrame, MatchConfig, MatchState, TeamFrames } from '../types';
import { ScriptedThumb, traceConfig, traceGame } from '@/testing/simTrace';

function duo(seed: number, over: Partial<MatchConfig> = {}, perTeam: 2 | 3 = 3): MatchConfig {
  return traceConfig(seed, { userTeam: 0, humans: [true, true], rubberBand: 0, catchUp: [0, 0], teamAssist: [1.15, 1.15], ...over }, perTeam);
}

/** Step until play is live (past the countdown). */
function toLive(m: MatchState, frames: TeamFrames = [emptyFrame(), emptyFrame()]): void {
  for (let i = 0; i < 60 * (RULES.countdown + 1) && m.phase !== 'live'; i++) stepMatch(m, frames);
}

describe('who plays which team', () => {
  it('reads the old single person as before', () => {
    const m = createMatch(traceConfig(1, { userTeam: 1 }));
    expect(isHuman(m, 1)).toBe(true);
    expect(isHuman(m, 0)).toBe(false);
    expect(twoHumans(m)).toBe(false);
    expect(seatOf(m, 1)).toBe(m);
    expect(seatOf(m, 0)).toBeNull();
    expect(m.second.control).toBe(-1);
  });

  it('gives each person a seat and a player on their own team from the first inbound', () => {
    const m = createMatch(duo(3));
    expect(twoHumans(m)).toBe(true);
    expect(seatOf(m, 0)).toBe(m);
    expect(seatOf(m, 1)).toBe(m.second);
    // home brings the ball up: the first person has the ball handler, the second the nearest defender
    expect(m.control).toBe(m.ball.holder);
    expect(m.players[m.control].team).toBe(0);
    expect(m.second.control).toBeGreaterThanOrEqual(0);
    expect(m.players[m.second.control].team).toBe(1);
    expect(controlOf(m, 1)).toBe(m.second.control);
  });
});

describe('two people playing at once', () => {
  it('moves each controlled player by its own team frame, and nobody else', () => {
    const m = createMatch(duo(5));
    const home = emptyFrame();
    const away = emptyFrame();
    toLive(m, [home, away]);
    // the first person runs up the screen, the second down it
    home.mz = -1;
    away.mz = 1;
    for (let i = 0; i < 40; i++) stepMatch(m, [home, away]);
    const p1 = m.players[m.control];
    const p2 = m.players[m.second.control];
    expect(p1.team).toBe(0);
    expect(p2.team).toBe(1);
    expect(p1.vz).toBeLessThan(-2);
    expect(p2.vz).toBeGreaterThan(2);
    expect(isControlled(m, p1)).toBe(true);
    expect(isControlled(m, p2)).toBe(true);
    // the others are the computer's, and still play
    const others = m.players.filter((p) => !isControlled(m, p));
    expect(others).toHaveLength(4);
    expect(others.some((p) => Math.hypot(p.vx, p.vz) > 0.5)).toBe(true);
  });

  it('switches only the team whose person presses SWITCH', () => {
    const m = createMatch(duo(9));
    const home = emptyFrame();
    const away = emptyFrame();
    toLive(m, [home, away]);
    stepMatch(m, [home, away]);
    const before1 = m.control;
    const before2 = m.second.control;
    // the second person defends: a tap on SWITCH hands them another defender; the first keeps the ball
    away.sw = true;
    stepMatch(m, [home, away]);
    away.sw = false;
    stepMatch(m, [home, away]);
    expect(m.second.control).not.toBe(before2);
    expect(m.players[m.second.control].team).toBe(1);
    expect(m.control).toBe(before1);
    // holding it down does not keep switching
    const now = m.second.control;
    away.sw = true;
    stepMatch(m, [home, away]);
    const held = m.second.control;
    for (let i = 0; i < 10; i++) stepMatch(m, [home, away]);
    expect(m.second.control).toBe(held);
    expect(held).not.toBe(now);
  });

  it('lets the defending person steal and jump with their own buttons', () => {
    const m = createMatch(duo(13));
    const home = emptyFrame();
    const away = emptyFrame();
    toLive(m, [home, away]);
    stepMatch(m, [home, away]);
    away.b = true;
    stepMatch(m, [home, away]);
    expect(m.players[m.second.control].state).toBe('steal');
    away.b = false;
    for (let i = 0; i < 60; i++) stepMatch(m, [home, away]);
    if (m.ball.state === 'held' && m.players[m.ball.holder].team === 0) {
      away.a = true;
      stepMatch(m, [home, away]);
      expect(m.players[m.second.control].state).toBe('jump');
    }
  });

  it('shoots with the ball handler when the first person presses SHOOT', () => {
    const m = createMatch(duo(17));
    const home = emptyFrame();
    const away = emptyFrame();
    toLive(m, [home, away]);
    home.a = true;
    stepMatch(m, [home, away]);
    const p = m.players[m.control];
    expect(['shoot', 'layup', 'dunk']).toContain(p.state);
    // the meter shows for the shooter only, with the shooter's own team's window
    expect(shotMeter(m, m.control)).not.toBeNull();
    expect(shotMeter(m, m.second.control)).toBeNull();
  });

  it('times each person with their own team window', () => {
    const m = createMatch(duo(21, { teamAssist: [1, 1.7] }));
    toLive(m);
    const home = emptyFrame();
    home.a = true;
    stepMatch(m, [home, emptyFrame()]);
    const narrow = shotMeter(m, m.control);
    expect(narrow).not.toBeNull();
    // the same shooter, but on the side with the wider window
    m.cfg.teamAssist = [1.7, 1];
    const wide = shotMeter(m, m.control);
    expect(wide!.perfect).toBeCloseTo((narrow!.perfect * 1.7) / 1, 10);
  });

  it('fills both people’s flame meters at the full rate', () => {
    const m = createMatch(duo(25, { difficulty: 0.22 }));
    for (const p of m.players) expect(heatScale(m, p)).toBe(1);
    // with one person the computer's side fills slower on an easy level, as before
    const one = createMatch(traceConfig(25, { difficulty: 0.22 }));
    expect(heatScale(one, one.players[3])).toBeLessThan(1);
  });

  it('has no rubber band between two people unless one takes a handicap', () => {
    const m = createMatch(duo(27));
    expect(bandOf(m, 0, 0.5)).toBe(0);
    expect(bandOf(m, 1, -0.5)).toBe(0);
    // the second person takes help: behind they get it, ahead the first person is not held back for them
    m.cfg.catchUp = [0, 0.5];
    expect(bandOf(m, 1, -0.5)).toBe(0.5);
    expect(bandOf(m, 0, 0.5)).toBe(0.5);
    expect(bandOf(m, 1, 0.5)).toBe(0);
    expect(bandOf(m, 0, -0.5)).toBe(0);
    // one person: the old symmetric band
    const one = createMatch(traceConfig(27, { rubberBand: 0.4 }));
    expect(bandOf(one, 0, 0.5)).toBe(0.4);
    expect(bandOf(one, 1, -0.5)).toBe(0.4);
  });

  it('plays a whole game with two scripted people, both scoring', () => {
    const a = new ScriptedThumb(101);
    const b = new ScriptedThumb(202);
    const t = traceGame(duo(31), { frames: () => [a.step(), b.step()] });
    expect(t.winner).toBeGreaterThanOrEqual(0);
    expect(t.score[0]).toBeGreaterThan(0);
    expect(t.score[1]).toBeGreaterThan(0);
  });

  it('is deterministic for the same seed and frames', () => {
    const run = () => {
      const a = new ScriptedThumb(7);
      const b = new ScriptedThumb(8);
      return traceGame(duo(33, {}, 2), { frames: () => [a.step(), b.step()] });
    };
    expect(run()).toEqual(run());
  });

  it('plays the same game from frames that went through the wire', () => {
    // what a network peer would do: each side sends packed numbers, and both sides step with the unpacked frames
    const play = (wire: boolean) => {
      const a = new ScriptedThumb(41);
      const b = new ScriptedThumb(42);
      const fa = emptyFrame();
      const fb = emptyFrame();
      return traceGame(duo(35), {
        frames: () => {
          const ha = a.step();
          const hb = b.step();
          if (wire) return [unpackFrame(JSON.parse(JSON.stringify(packFrame(ha))) as number, fa), unpackFrame(packFrame(hb), fb)];
          return [quantizeFrame(ha, fa), quantizeFrame(hb, fb)];
        },
      });
    };
    expect(play(true)).toEqual(play(false));
  });

  it('keeps the person’s teammates on the computer at their own level', () => {
    // a person's teammates use mateSkill, so a two-player game with a very low mate skill plays differently
    const run = (mateSkill: number) => {
      const a = new ScriptedThumb(3);
      const b = new ScriptedThumb(4);
      return traceGame(duo(37, { mateSkill, difficulty: 0.5 }), { frames: () => [a.step(), b.step()] });
    };
    expect(run(0.1).hash).not.toBe(run(0.9).hash);
  });

  it('lets a team with no frame stand still under the computer', () => {
    // a team a person plays but whose frame has not come in yet gets a still pad, not the other team's
    const m = createMatch(duo(39));
    const home: InputFrame = emptyFrame();
    toLive(m, [home, null]);
    home.mz = 1;
    for (let i = 0; i < 30; i++) stepMatch(m, [home, null]);
    const p2 = m.players[m.second.control];
    expect(Math.hypot(p2.vx, p2.vz)).toBeLessThan(0.01);
  });
});
