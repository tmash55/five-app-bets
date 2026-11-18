/**
 * Room codes: four letters a child can read off one screen and tap into another. No vowels, so a code never spells
 * a word, and none of the letters that pass for a number or for each other (O and 0, I, L and 1, S and 5, Z and 2,
 * Q and O).
 */

import type { Rng } from '@/meta/rng';

export const CODE_LETTERS = 'BCDFGHJKMNPRTVWXY';
export const CODE_LENGTH = 4;

export function newRoomCode(rng: Rng = Math.random): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_LETTERS[Math.floor(rng() * CODE_LETTERS.length) % CODE_LETTERS.length];
  return out;
}

/** The code as typed, in capitals, with anything that is not one of the code's letters left out. */
export function cleanCode(text: string): string {
  let out = '';
  for (const ch of text.toUpperCase()) if (CODE_LETTERS.includes(ch)) out += ch;
  return out.slice(0, CODE_LENGTH);
}

export function isRoomCode(text: string): boolean {
  return text.length === CODE_LENGTH && cleanCode(text) === text;
}
