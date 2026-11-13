/**
 * Listens to what happens in a match and decides what the crowd hears and
 * what flashes on screen: the game's announcer, minus the voice.
 */

import { playSfx } from '@/audio/sound';
import { buzz } from '@/fx/feedback';
import type { MatchState, SimEvent } from '@/game/sim/types';

export type CalloutTone = 'home' | 'away' | 'gold' | 'white' | 'perfect' | 'good' | 'okay' | 'bad';

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

export class MatchDirector {
  /** a shot at the horn won it or tied it for the person's team */
  buzzerBeater = false;
  private n = 0;
  private lastPoster = -9;
  private lastTickSound = -1;

  constructor(private readonly o: DirectorOptions) {}

  private pick(list: readonly string[]): string {
    this.n++;
    return list[(this.n * 7 + list.length) % list.length];
  }

  private say(text: string, tone: CalloutTone, hold = 1.25, sub?: string, big = false): void {
    this.o.show({ text, tone, lane: 'main', hold, sub, big });
  }

  handle(e: SimEvent, m: MatchState): void {
    const user = m.cfg.userTeam;
    const side = (team: number): CalloutTone => (team === 0 ? 'home' : 'away');
    const ours = (team: number) => user < 0 || team === user;
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
        if (e.start) {
          playSfx('go');
          this.lastTickSound = -1;
          if (e.overtime) this.say('OVERTIME!', 'gold', 1.4, 'Next basket wins', true);
          else if (e.quarter === 1) this.say('GO!', 'gold', 0.9, undefined, true);
          else this.say(`QUARTER ${e.quarter}`, 'white', 1.1);
        } else {
          playSfx('buzzer');
          const half = this.o.quarters % 2 === 0 && e.quarter === this.o.quarters / 2;
          this.say(half ? 'HALFTIME' : `END OF Q${e.quarter}`, 'white', 1.8);
        }
        break;
      }
      case 'final': {
        playSfx('buzzer');
        const won = user >= 0 && e.winner === user;
        this.say(user < 0 ? 'FINAL' : won ? 'YOU WIN!' : 'FINAL', won ? 'gold' : 'white', 2.6, undefined, true);
        if (won) playSfx('cheerBig');
        break;
      }
      case 'shot': {
        playSfx('shoot');
        if (e.by === m.control) {
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
        const dunk = e.kind === 'dunk' || e.kind === 'oop';
        playSfx(dunk ? 'dunk' : 'swish');
        playSfx(dunk || e.points === 3 || e.buzzer ? 'cheerBig' : 'cheer', ours(e.team) ? 1 : 0.6);
        if (ours(e.team)) buzz(dunk ? 'heavy' : 'medium');
        const who = this.o.names[e.by];
        const tone = side(e.team);
        if (e.buzzer) {
          if (e.team === user) this.buzzerBeater = true;
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
        break;
      case 'board':
        playSfx('board', Math.min(1, 0.35 + e.speed * 0.1));
        break;
      case 'bounce':
        if (e.speed > 1.2) playSfx('bounce', Math.min(1, 0.25 + e.speed * 0.1));
        break;
      case 'dribble':
        playSfx('dribble', ours(m.players[e.by].team) ? 0.9 : 0.6);
        break;
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
      case 'poster':
        this.lastPoster = m.time;
        break;
      case 'land':
        if (e.hard) playSfx('land');
        break;
      case 'rebound':
        playSfx('catch', 0.8);
        break;
      case 'pickup':
        playSfx('catch', 0.6);
        break;
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
}
