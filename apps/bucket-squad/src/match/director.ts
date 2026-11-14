/**
 * Listens to what happens in a match and decides what the crowd hears and
 * what flashes on screen: the game's announcer, minus the voice.
 */

import { playSfx, type SfxName } from '@/audio/sound';
import { buzz } from '@/fx/feedback';
import { isControlled, twoHumans } from '@/game/sim/seats';
import type { MatchState, SimEvent } from '@/game/sim/types';

/** every sound a match can play, in the order a match first needs them, so they can be made ready before tip-off */
export const MATCH_SOUNDS: readonly SfxName[] = ['tick', 'go', 'dribble', 'catch', 'pass', 'shoot', 'swish', 'rim', 'board', 'bounce', 'cheer', 'scuff', 'land', 'swipe', 'steal', 'block', 'ooh', 'aww', 'dunk', 'cheerBig', 'perfect', 'ankle', 'hype', 'hypeEnd', 'ignite', 'fireShot', 'whistle', 'buzzer'];

export type CalloutTone = 'home' | 'away' | 'gold' | 'white' | 'fire' | 'perfect' | 'good' | 'okay' | 'bad';

export interface Callout {
  text: string;
  /** smaller line under the main one */
  sub?: string;
  tone: CalloutTone;
  /** 'note' is the small lane for shot timing, 'main' the big one */
  lane: 'main' | 'note';
  /** seconds on screen */
  hold: number;
  big?: boolean;
}

export interface DirectorOptions {
  /** display names in simulation order */
  names: string[];
  quarters: number;
  show: (c: Callout) => void;
}

const DUNKS = ['SLAM!', 'BOOM!', 'RIM ROCKER!', 'THROW IT DOWN!', 'KA-POW!'];
const OOPS = ['SKY HIGH!', 'ALLEY-OOP!', 'UP AND IN!'];
const THREES = ['THREE!', 'FROM WAY OUT!', 'LONG RANGE!'];
const PERFECT_THREES = ['SPLASH!', 'NOTHING BUT NET!'];
const STEALS = ['STOLEN!', 'PICKPOCKET!', 'YOINK!'];
const PICKS = ['PICKED OFF!', 'INTERCEPTED!'];
const BLOCKS = ['NOT TODAY!', 'SWATTED!', 'DENIED!'];
const ANKLES = ['SHOOK!', 'ANKLE BREAKER!', 'WHOOPS!'];
const ROLLS = ['ON A ROLL!', 'CAN’T MISS!', 'UNSTOPPABLE!'];

/** how far back the sneaker listener looks, in simulation steps (0.15 s) */
const CUT_STEPS = 9;
/**
 * Speed a player must shed inside that time to scrape the court (a sprint is
 * about 7): a hard stop or a sharp cut. Everyone in this game stops hard all
 * the time, so the scrapes are rationed: the player in the person's hands
 * answers every hard flick of the stick, and all the others together are
 * heard only now and then (measured: about one scrape a second in a normal game).
 */
const CUT_LOSS = 5;
const CUT_REST = 0.5;
const OTHERS_CUT_LOSS = 5.5;
const OTHERS_CUT_REST = 1.6;
/** seconds between two groans from the kids watching */
const AWW_REST = 6;
/** a player who catches fire on a basket gets the basket's callout first, then their own this much later */
const FIRE_CALL_DELAY = 0.75;
const FIRE_CALLS = ['ON FIRE!', 'RED HOT!', 'BLAZING!'];

export class MatchDirector {
  /** a shot at the last horn won it or tied it for the person's team (the score in the match is already the one after the shot) */
  buzzerBeater = false;
  private n = 0;
  private lastPoster = -9;
  private lastTickSound = -1;
  /** the shot in the air: whose it is, and whether it has touched the rim */
  private shot: { team: number; rim: boolean } | null = null;
  private lastAww = -9;
  /** each player's velocity over the last few steps (x and z per step), and when sneakers were last heard */
  private trail = new Float32Array(0);
  private trailAt = 0;
  private lastCut = -9;
  private lastOthersCut = -9;
  /** an ON FIRE callout waiting for the basket's own callout to have its moment */
  private pendingFire: { callout: Callout; at: number } | null = null;
  private calledAt = -9;

  constructor(private readonly o: DirectorOptions) {}

  private pick(list: readonly string[]): string {
    this.n++;
    return list[(this.n * 7 + list.length) % list.length];
  }

  private say(text: string, tone: CalloutTone, hold = 1.25, sub?: string, big = false): void {
    this.o.show({ text, tone, lane: 'main', hold, sub, big });
    this.calledAt = this.now;
  }

  /** time of the step being handled, for callouts that should not step on each other */
  private now = 0;

  handle(e: SimEvent, m: MatchState): void {
    if (m.time !== this.now) {
      this.now = m.time;
      this.calledAt = -9;
    }
    const user = m.cfg.userTeam;
    const side = (team: number): CalloutTone => (team === 0 ? 'home' : 'away');
    // with two people on the court every team is somebody's
    const two = twoHumans(m);
    const ours = (team: number) => user < 0 || two || team === user;
    switch (e.type) {
      case 'tick': {
        if (m.phase === 'countdown') {
          playSfx('tick');
          this.o.show({ text: String(e.seconds), tone: 'white', lane: 'main', hold: 0.8, big: true });
        } else if (e.seconds <= 5 && e.seconds !== this.lastTickSound) {
          this.lastTickSound = e.seconds;
          playSfx('tick', 0.7);
        }
        break;
      }
      case 'period': {
        this.shot = null;
        if (e.start) {
          playSfx('go');
          this.lastTickSound = -1;
          if (e.overtime) this.say('OVERTIME!', 'gold', 1.4, 'Next basket wins', true);
          else if (e.quarter === 1) this.say('GO!', 'gold', 0.9, undefined, true);
          else this.say(`QUARTER ${e.quarter}`, 'white', 1.1);
        } else if (m.phase !== 'final') {
          // the horn that ends the game is the final's own, so it sounds once
          playSfx('buzzer');
          const half = this.o.quarters % 2 === 0 && e.quarter === this.o.quarters / 2;
          this.say(half ? 'HALFTIME' : `END OF Q${e.quarter}`, 'white', 1.8);
        }
        break;
      }
      case 'final': {
        playSfx('buzzer');
        if (two) {
          this.say(e.winner === 0 ? 'P1 WINS!' : 'P2 WINS!', 'gold', 2.6, 'FINAL', true);
          playSfx('cheerBig');
          break;
        }
        const won = user >= 0 && e.winner === user;
        this.say(user < 0 ? 'FINAL' : won ? 'YOU WIN!' : 'FINAL', won ? 'gold' : 'white', 2.6, undefined, true);
        if (won) playSfx('cheerBig');
        break;
      }
      case 'shot': {
        playSfx('shoot');
        if (m.players[e.by].fireT > 0) playSfx('fireShot');
        this.shot = { team: m.players[e.by].team, rim: false };
        if (isControlled(m, e.by)) {
          const err = m.players[e.by].relErr;
          const label = e.grade === 'perfect' ? 'PERFECT!' : e.grade === 'good' ? 'GOOD' : err < 0 ? 'EARLY' : 'LATE';
          const tone: CalloutTone = e.grade === 'perfect' ? 'perfect' : e.grade === 'good' ? 'good' : e.grade === 'ok' ? 'okay' : 'bad';
          this.o.show({ text: label, tone, lane: 'note', hold: 0.9 });
          if (e.grade === 'perfect') {
            playSfx('perfect');
            buzz('light');
          }
        }
        break;
      }
      case 'score': {
        this.shot = null;
        const dunk = e.kind === 'dunk' || e.kind === 'oop';
        playSfx(dunk ? 'dunk' : 'swish');
        playSfx(dunk || e.points === 3 || e.buzzer ? 'cheerBig' : 'cheer', ours(e.team) ? 1 : 0.6);
        if (ours(e.team)) buzz(dunk ? 'heavy' : 'medium');
        const who = this.o.names[e.by];
        const tone = side(e.team);
        if (e.buzzer) {
          // every shot at a horn is called out, but the headline is for the last horn only: the team was level or behind before the shot and is level or ahead after it
          const mine = m.score[e.team];
          const theirs = m.score[1 - e.team];
          if (e.team === user && m.quarter >= this.o.quarters && mine - e.points <= theirs && mine >= theirs) this.buzzerBeater = true;
          this.say('BUZZER BEATER!', 'gold', 1.8, `${who} +${e.points}`, true);
        } else if (e.kind === 'oop') {
          this.say(this.pick(OOPS), tone, 1.4, `${who} +2`, true);
        } else if (e.kind === 'dunk') {
          const poster = m.time - this.lastPoster < 1.5;
          this.say(poster ? 'POSTER!' : this.pick(DUNKS), tone, 1.4, `${who} +2`, true);
        } else if (e.points === 3) {
          this.say(e.perfect ? this.pick(PERFECT_THREES) : this.pick(THREES), tone, 1.3, `${who} +3`, true);
        } else if (m.run[e.team] === 3 || m.run[e.team] === 5) {
          this.say(this.pick(ROLLS), tone, 1.2, `${m.run[e.team]} in a row`);
        } else if (e.perfect) {
          this.say('SWISH!', tone, 1.0, `${who} +2`);
        } else {
          this.say(`+${e.points}`, tone, 0.8, who);
        }
        break;
      }
      case 'rim':
        playSfx('rim', Math.min(1, 0.35 + e.speed * 0.12));
        if (this.shot) this.shot.rim = true;
        break;
      case 'board':
        playSfx('board', Math.min(1, 0.35 + e.speed * 0.1));
        break;
      case 'bounce':
        if (e.speed > 1.2) playSfx('bounce', Math.min(1, 0.25 + e.speed * 0.1));
        break;
      case 'dribble': {
        // a sprint pounds the ball harder than a walk
        const p = m.players[e.by];
        const pace = Math.min(1, Math.hypot(p.vx, p.vz) / 7);
        playSfx('dribble', (ours(p.team) ? 0.7 : 0.45) + pace * 0.3);
        break;
      }
      case 'pass':
        playSfx('pass');
        break;
      case 'catch':
        playSfx('catch');
        break;
      case 'swipe':
        playSfx('swipe');
        break;
      case 'steal': {
        playSfx('steal');
        playSfx('ooh', 0.8);
        const team = m.players[e.by].team;
        if (ours(team)) buzz('medium');
        this.say(e.intercept ? this.pick(PICKS) : this.pick(STEALS), side(team), 1.1, this.o.names[e.by]);
        break;
      }
      case 'block': {
        this.shot = null;
        playSfx('block');
        playSfx('ooh');
        const team = m.players[e.by].team;
        if (ours(team)) buzz('heavy');
        this.say(e.stuffed ? 'STUFFED!' : this.pick(BLOCKS), side(team), 1.2, this.o.names[e.by], e.stuffed);
        break;
      }
      case 'ankle': {
        playSfx('ankle');
        playSfx('ooh', 0.7);
        this.say(this.pick(ANKLES), side(m.players[e.by].team), 1.1, this.o.names[e.by]);
        break;
      }
      case 'dunkStart':
        if (m.players[e.by].fireT > 0) playSfx('fireShot');
        break;
      case 'poster':
        this.lastPoster = m.time;
        break;
      case 'land':
        if (e.hard) playSfx('land');
        break;
      case 'rebound':
        playSfx('catch', 0.8);
        // off the rim and out: the kids groan for the person's team, now and then
        if (this.shot && this.shot.rim && ours(this.shot.team) && m.time - this.lastAww > AWW_REST) {
          this.lastAww = m.time;
          playSfx('aww', 0.7);
        }
        this.shot = null;
        break;
      case 'pickup':
        this.shot = null;
        playSfx('catch', 0.6);
        break;
      case 'fire': {
        if (!e.on) break;
        playSfx('ignite');
        const team = m.players[e.player].team;
        if (ours(team)) buzz('success');
        const callout: Callout = { text: this.pick(FIRE_CALLS), tone: 'fire', lane: 'main', hold: 1.7, sub: this.o.names[e.player], big: true };
        // lit by a basket: let the basket's callout land first
        if (this.calledAt === m.time) this.pendingFire = { callout, at: m.time + FIRE_CALL_DELAY };
        else this.o.show(callout);
        break;
      }
      case 'hype': {
        if (e.on) {
          playSfx('hype');
          if (ours(e.team)) buzz('success');
          this.say('HYPE TIME!', side(e.team), 1.6, 'Unlimited turbo and hot shooting', true);
        } else {
          playSfx('hypeEnd', 0.7);
        }
        break;
      }
      case 'shotClock':
        playSfx('whistle');
        this.say('SHOT CLOCK!', 'white', 1.2, 'Other team’s ball');
        break;
      default:
        break;
    }
  }

  /**
   * Once per simulation step: listens for sneakers. A player on the floor who
   * sheds a lot of speed in a moment has stopped or cut hard, and scrapes the
   * court.
   */
  watch(m: MatchState): void {
    const pf = this.pendingFire;
    if (pf && m.time >= pf.at) {
      this.pendingFire = null;
      this.o.show(pf.callout);
    }
    const n = m.players.length;
    if (this.trail.length !== n * CUT_STEPS * 2) {
      this.trail = new Float32Array(n * CUT_STEPS * 2);
      this.trailAt = 0;
    }
    // the slot about to be overwritten holds the velocity from CUT_STEPS steps ago
    const slot = this.trailAt;
    this.trailAt = (slot + 1) % CUT_STEPS;
    const live = m.phase === 'live';
    for (let i = 0; i < n; i++) {
      const p = m.players[i];
      const k = (i * CUT_STEPS + slot) * 2;
      const ox = this.trail[k];
      const oz = this.trail[k + 1];
      this.trail[k] = p.vx;
      this.trail[k + 1] = p.vz;
      if (!live || p.y > 0 || p.state !== 'free') continue;
      // how much of the speed the player had, in the direction they had it, is gone (more than all of it on a turn back)
      const old = Math.hypot(ox, oz);
      const lost = old > 0.01 ? old - (p.vx * ox + p.vz * oz) / old : 0;
      if (isControlled(m, i)) {
        if (lost < CUT_LOSS || m.time - this.lastCut < CUT_REST) continue;
        this.lastCut = m.time;
        playSfx('scuff', Math.min(1, 0.55 + (lost - CUT_LOSS) * 0.15));
      } else {
        if (lost < OTHERS_CUT_LOSS || m.time - this.lastOthersCut < OTHERS_CUT_REST) continue;
        this.lastOthersCut = m.time;
        playSfx('scuff', 0.4);
      }
    }
  }
}
