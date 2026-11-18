// Original composition by Codex for Primeboard, November 2026.
// Written directly as prefix gestures, not transcribed from an existing score.
// Each bar is 3 quarter-note beats: [offset, duration, active prefixes].
// Overlapping gestures deliberately preserve the held keys during sibling merges.
const bars = [
  // A: a middle-register motif and its first downward merge.
  [[0,1,['00']], [1,.5,['01']], [1.5,.5,['10']], [2,1,['00','10']]],
  [[0,1.5,['01','10']], [1.5,.5,['10']], [2,.5,['01']], [2.5,.5,['00']]],
  [[0,.5,['00']], [.5,.5,['10']], [1,1,['01']], [2,1,['00','10']]],
  [[0,3,['00','10']], [1,2,['01']]],
  // B: octave answer; 000, 010, 100 is a stable 880:1100:1320 triad.
  [[0,1,['000']], [1,.5,['010']], [1.5,.5,['100']], [2,1,['000','010','100']]],
  [[0,1.5,['010','100']], [1.5,.5,['001']], [2,.5,['010']], [2.5,.5,['000']]],
  [[0,.5,['100']], [.5,.5,['010']], [1,1,['000']], [2,1,['010','100']]],
  [[0,3,['000','010','100']], [1,2,['001']], [2,1,['011']]],
  // A': return, then let the upper E descend by adding its sibling.
  [[0,1,['00']], [1,.5,['01']], [1.5,.5,['10']], [2,1,['00','10']]],
  [[0,.75,['10']], [.75,.25,['01']], [1,.5,['00']], [1.5,.5,['01']], [2,1,['10']]],
  [[0,.5,['000']], [.5,.5,['010']], [1,1,['100']], [2,1,['000','010','100']]],
  [[0,3,['000','010','100']], [1,2,['101']]],
  // Coda: descend, recall the triad, then merge to 00, 0, and finally the root.
  [[0,.5,['100']], [.5,.5,['010']], [1,.5,['000']], [1.5,.5,['10']], [2,.5,['01']], [2.5,.5,['00']]],
  [[0,3,['00','10']], [1,2,['01']]],
  [[0,2,['000','010','100']], [2,1,['000','001']]],
  [[0,2.75,['00']], [.75,2,['01']], [1.5,1.25,['1']]],
];

const notes = bars.flatMap((gestures, bar) => gestures.flatMap(([offset, duration, prefixes]) => {
  const start = bar * 3 + offset;
  const end = start + duration - Math.min(.1, duration * .15);
  return prefixes.map(prefix => Object.freeze({
    key: Number.parseInt('1' + prefix, 2) - 1, start, end, power: 1,
  }));
})).sort((a, b) => a.start - b.start || a.key - b.key);

export const BRANCHES_RETURN = Object.freeze({
  id: 'branches-return', title: 'Branches Return', composer: 'Codex',
  description: 'Original for Cantor Union · a melody unfolds, then returns through sibling merges',
  bpm: 96, beats: 48, beatsPerBar: 3, pickupBeats: 0,
  view: 'cantor', operation: 'union',
  source: './music/branches-return.txt', sourceLabel: 'Composition & prefix score ↗',
  notes: Object.freeze(notes),
});
