#!/usr/bin/env node
// Writes the two answer sounds in assets/sounds as small 16-bit mono WAVs.
// They are plain synthesized tones so there is no licensing question.
// Re-run after changing a tone:  node scripts/make-sounds.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 22050;
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

/** notes: [frequencyHz, durationMs][]; wave: 'sine' | 'square' */
function tone(notes, wave, volume) {
  const samples = [];
  for (const [freq, ms] of notes) {
    const count = Math.round((RATE * ms) / 1000);
    const fade = Math.min(count / 2, RATE * 0.01);
    for (let i = 0; i < count; i += 1) {
      const phase = (2 * Math.PI * freq * i) / RATE;
      const raw = wave === 'sine' ? Math.sin(phase) : Math.sign(Math.sin(phase)) * 0.5;
      // Short fade in and out on every note so there are no clicks.
      const envelope = Math.min(1, i / fade, (count - i) / fade);
      samples.push(raw * envelope * volume);
    }
  }
  return samples;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// Right: two quick rising notes (E6 then A6). Wrong: one low, soft buzz.
writeFileSync(join(out, 'right.wav'), wav(tone([[1319, 70], [1760, 110]], 'sine', 0.45)));
writeFileSync(join(out, 'wrong.wav'), wav(tone([[196, 180]], 'square', 0.3)));
console.log(`Wrote right.wav and wrong.wav to ${out}`);
