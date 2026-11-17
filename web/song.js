import { KEYS, MAX_EXPONENT } from './color.js';
import { IMPORTED_SONGS } from './music/catalog.js';

// Beethoven's 16-bar theme, transposed G -> C from Mutopia #528's soprano.
// Durations are quarter-note beats. Harmony is a simple Primeboard arrangement.
const melodyBars = [
  [[64,1],[64,1],[65,1],[67,1]], [[67,1],[65,1],[64,1],[62,1]],
  [[60,1],[60,1],[62,1],[64,1]], [[64,1.5],[62,.5],[62,2]],
  [[64,1],[64,1],[65,1],[67,1]], [[67,1],[65,1],[64,1],[62,1]],
  [[60,1],[60,1],[62,1],[64,1]], [[62,1.5],[60,.5],[60,2]],
  [[62,1],[62,1],[64,1],[60,1]], [[62,1],[64,.5],[65,.5],[64,1],[60,1]],
  [[62,1],[64,.5],[65,.5],[64,1],[62,1]], [[60,1],[62,1],[55,2]],
  [[64,1],[64,1],[65,1],[67,1]], [[67,1],[65,1],[64,1],[62,1]],
  [[60,1],[60,1],[62,1],[64,1]], [[62,1.5],[60,.5],[60,2]],
];
const harmonies = ['C','G','C','G', 'C','G','C','C', 'G','C','G','G', 'C','G','C','C'];
const chords = { C: [48,52,55], G: [50,55,59] };
const notes = [];
melodyBars.forEach((bar, measure) => {
  let start = measure * 4;
  for (const [midi, duration] of bar) {
    notes.push({ key: midi - 48, start, end: start + duration - Math.min(.12, duration * .15), power: 2 });
    start += duration;
  }
  for (const midi of chords[harmonies[measure]]) {
    notes.push({ key: midi - 48, start: measure * 4, end: (measure + 1) * 4 - .12, power: 1 });
  }
});

export const ODE_TO_JOY = Object.freeze({
  id: 'ode-to-joy', title: 'Ode to Joy', composer: 'Ludwig van Beethoven',
  description: 'Theme in C major · melody & harmony',
  bpm: 96, beats: 64, beatsPerBar: 4, pickupBeats: 0,
  source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528',
  notes: Object.freeze(notes.map(note => Object.freeze(note))),
});

export const SONGS = Object.freeze([ODE_TO_JOY, ...IMPORTED_SONGS.map(song => Object.freeze({
  ...song, notes: Object.freeze(song.notes.map(note => Object.freeze(note))),
}))]);

export function songSpectrum(song, beat, modal = false) {
  if (song.frames) {
    let lo=0,hi=song.frames.length;
    while(lo<hi) { const mid=(lo+hi)>>>1; if(song.frames[mid].beat<=beat)lo=mid+1;else hi=mid; }
    return lo ? [...song.frames[lo-1][modal ? 'levels' : 'exponents']] : KEYS.map(()=>0);
  }
  const exponents = KEYS.map(() => 0);
  for (const note of song.notes) {
    if (note.start <= beat && beat < note.end) {
      exponents[note.key] = Math.min(MAX_EXPONENT, exponents[note.key] + note.power);
    }
  }
  return exponents;
}

// Aggregate simultaneous voices before sound synthesis, including unisons.
export function songFrames(song, fromBeat = 0, modal = false) {
  if (song.frames) return [{beat:fromBeat,exponents:songSpectrum(song,fromBeat,modal)}, ...song.frames.filter(f=>f.beat>fromBeat).map(f=>({beat:f.beat,exponents:[...f[modal ? 'levels' : 'exponents']]}))];
  const boundaries = new Set([fromBeat, song.beats]);
  for (const note of song.notes) {
    if (note.start > fromBeat) boundaries.add(note.start);
    if (note.end > fromBeat) boundaries.add(note.end);
  }
  return [...boundaries].sort((a, b) => a - b)
    .map(beat => ({ beat, exponents: songSpectrum(song, beat) }));
}

// The audio clock drives both transport and visuals; no accumulated timer drift.
export class SongPlayer {
  constructor(song) { this.song = song; this.beat = 0; this.rate = 1; this.state = 'idle'; this.anchor = 0; }
  get beatsPerSecond() { return this.song.bpm * this.rate / 60; }
  selectSong(song) {
    this.stop();
    this.song = song;
    this.anchor = 0;
    this.startBeat = 0;
  }
  get positionLabel() {
    const pickup = this.song.pickupBeats || 0;
    if (this.beat < pickup) return 'pickup';
    const total = Math.ceil((this.song.beats - pickup) / this.song.beatsPerBar);
    const bar = Math.min(total, Math.floor((this.beat - pickup) / this.song.beatsPerBar) + 1);
    return `bar ${bar} of ${total}`;
  }
  play(now) {
    if (this.state === 'ended') this.beat = 0;
    this.startBeat = this.beat;
    this.anchor = now - this.beat / this.beatsPerSecond;
    this.state = 'playing';
  }
  update(now) {
    if (this.state === 'playing') {
      this.beat = Math.max(this.startBeat, Math.min(this.song.beats, (now - this.anchor) * this.beatsPerSecond));
      if (this.beat >= this.song.beats) this.state = 'ended';
    }
    return this.beat;
  }
  pause(now) {
    this.update(now);
    if (this.state === 'playing') this.state = 'paused';
  }
  stop() { this.beat = 0; this.state = 'idle'; }
  setRate(rate, now) {
    if (!Number.isFinite(rate) || rate < .5 || rate > 2) throw new RangeError('Invalid song speed.');
    this.update(now);
    this.rate = rate;
    this.anchor = now - this.beat / this.beatsPerSecond;
  }
}
