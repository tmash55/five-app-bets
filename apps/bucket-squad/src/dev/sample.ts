/** A throwaway match setup for checking the renderer before the real roster exists. */

import type { KitColors, Look } from '../game/kit/look';
import type { CourtId } from '../game/render/court';
import type { MatchVisuals } from '../game/render/renderer';
import type { Attrs, MatchConfig } from '../game/sim/types';

const BLUE: Partial<KitColors> = { jersey: '#2F6BDE', trim: '#FFD23F', number: '#FFFFFF', shorts: '#2F6BDE', shortsTrim: '#FFD23F', shoe: '#F2F2F2', shoeAccent: '#2F6BDE', band: '#FFD23F' };
const RED: Partial<KitColors> = { jersey: '#E5483B', trim: '#FFFFFF', number: '#FFFFFF', shorts: '#2B3A67', shortsTrim: '#FFFFFF', shoe: '#FFFFFF', shoeAccent: '#E5483B', band: '#FFD23F' };

const LOOKS: Look[] = [
  { skin: '#8D5A3B', hair: { style: 'hightop', color: '#1C1310' }, eyes: 'oval', brows: 'fierce', mouth: 'smirk', number: '3', kit: BLUE },
  { skin: '#F3C9A8', hair: { style: 'pigtails', color: '#C4532D' }, eyes: 'round', brows: 'raised', mouth: 'grin', number: '12', kit: BLUE, accessories: ['freckles', 'lashes'], nose: 'small' },
  { skin: '#C68642', hair: { style: 'short', color: '#231710' }, eyes: 'oval', brows: 'calm', mouth: 'bigsmile', number: '8', kit: BLUE, accessories: ['capBack'], hatColor: '#E5483B', build: { height: 0.94 } },
  { skin: '#5C3A26', hair: { style: 'puffs', color: '#19100C' }, eyes: 'tall', brows: 'raised', mouth: 'grin', number: '21', kit: RED, accessories: ['lashes'], highSocks: true },
  { skin: '#E7B48A', hair: { style: 'spiky', color: '#2A1B12' }, eyes: 'wide', brows: 'fierce', mouth: 'tooth', number: '5', undershirt: '#FFFFFF', kit: RED, accessories: ['headband', 'bandaid'] },
  { skin: '#F1C7A5', hair: { style: 'curly', color: '#D9A441' }, eyes: 'wide', brows: 'thick', mouth: 'bigsmile', number: '44', kit: RED, accessories: ['sweatband'], build: { height: 1.08, bulk: 1.1 }, nose: 'wide' },
];

function attrs(v: Partial<Attrs> = {}): Attrs {
  return { speed: 0.6, shot: 0.6, dunk: 0.6, handle: 0.6, steal: 0.5, block: 0.5, ...v };
}

export function sampleSetup(court: CourtId, seed: number, userTeam: -1 | 0): { config: MatchConfig; visuals: MatchVisuals } {
  const team = () => ({
    players: [
      { id: 'a', attrs: attrs({ shot: 0.85, dunk: 0.5 }) },
      { id: 'b', attrs: attrs({ dunk: 0.9, shot: 0.45 }) },
      { id: 'c', attrs: attrs({ speed: 0.85, handle: 0.85 }) },
    ],
  });
  return {
    config: {
      seed,
      teams: [team(), team()],
      userTeam,
      quarters: 4,
      quarterSeconds: 60,
      difficulty: 0.6,
      mateSkill: 0.6,
      timingAssist: 1,
      rubberBand: 0.5,
      autoSwitch: true,
    },
    visuals: { court, looks: LOOKS, teamColors: ['#2F6BDE', '#E5483B'] },
  };
}
