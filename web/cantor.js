import { KEYS, ROWS } from './color.js';

// All 31 prefixes through depth 4. The original letter addresses stay fixed;
// punctuation completes the binary tree.
export const CANTOR_PREFIXES = Object.freeze(Array.from({ length: 31 }, (_, i) => (i + 1).toString(2).slice(1)));
// Keep the retired empty-set slot in recording state so existing v2 takes
// retain their set inputs. No physical or onscreen key writes to this slot.
const legacyEmptyIndex = CANTOR_PREFIXES.length;
export const CANTOR_STATE_SIZE = legacyEmptyIndex + 1;
const extraKeys = [['[', 'BracketLeft'], [']', 'BracketRight'], [';', 'Semicolon'], [',', 'Comma'], ['.', 'Period']];
export const CANTOR_KEYS = Object.freeze([
  ...KEYS.map(({ index, letter, code }) => ({ index, letter, code })),
  ...extraKeys.map(([letter, code], i) => ({ index: KEYS.length + i, letter, code })),
].map(key => Object.freeze({ ...key, prefix: CANTOR_PREFIXES[key.index] })));
export const CANTOR_ROWS = Object.freeze([ROWS[0] + '[]', ROWS[1] + ';', ROWS[2] + ',.']);
export const prefixLabel = prefix => prefix === '' ? '∅' : prefix;
export const cylinderLabel = prefix => `C(${prefixLabel(prefix)})`;
export const CANTOR_FUNDAMENTAL_HZ = 110;
export const DEFAULT_CANTOR_OPERATION = 'union';

function validatePrefix(prefix) {
  if (typeof prefix !== 'string' || !/^[01]*$/.test(prefix)) throw new TypeError('Expected a finite binary prefix.');
}

// The leading 1 numbers the binary tree: root 1, children 2 and 3, then 4..7.
export function cantorFrequency(prefix) {
  validatePrefix(prefix);
  return CANTOR_FUNDAMENTAL_HZ * (2 ** prefix.length + Number.parseInt(prefix || '0', 2));
}
export const CANTOR_FREQUENCIES = Object.freeze(CANTOR_PREFIXES.map(cantorFrequency));

export function intersectPrefixes(prefixes) {
  prefixes.forEach(validatePrefix);
  let result = '';
  for (const prefix of prefixes) {
    if (prefix.startsWith(result)) result = prefix;
    else if (!result.startsWith(prefix)) return null;
  }
  return result;
}

// The unique maximal, disjoint cylinder cover: discard contained cylinders
// and recursively fold complete sibling pairs into their parent.
export function unionPrefixes(prefixes) {
  prefixes.forEach(validatePrefix);
  const root = {};
  for (const prefix of prefixes) {
    let node = root;
    for (const bit of prefix) node = node[bit] ??= {};
    node.full = true;
  }
  const reduce = (node, prefix) => {
    if (node.full) return [prefix];
    const left = node[0] ? reduce(node[0], prefix + '0') : [];
    const right = node[1] ? reduce(node[1], prefix + '1') : [];
    if (left.length === 1 && left[0] === prefix + '0' && right.length === 1 && right[0] === prefix + '1') return [prefix];
    return [...left, ...right];
  };
  return reduce(root, '');
}

// This is the containing interval I_s. The cylinder is C ∩ I_s, not I_s itself.
export function prefixInterval(prefix) {
  validatePrefix(prefix);
  let numerator = 0, denominator = 1;
  for (const bit of prefix) { numerator = numerator * 3 + 2 * Number(bit); denominator *= 3; }
  return { start: numerator / denominator, end: (numerator + 1) / denominator, numerator, denominator };
}

export function cantorLevel(depth) {
  if (!Number.isInteger(depth) || depth < 0 || depth > 10) throw new RangeError('Expected a depth from 0 to 10.');
  return Array.from({ length: 2 ** depth }, (_, i) => {
    const prefix = depth ? i.toString(2).padStart(depth, '0') : '';
    return { prefix, ...prefixInterval(prefix) };
  });
}

export function cantorSelection(weights, operation = DEFAULT_CANTOR_OPERATION) {
  if (weights.length !== CANTOR_STATE_SIZE) throw new RangeError('Expected 32 state weights.');
  if (!['union', 'intersection'].includes(operation)) throw new RangeError('Unknown Cantor operation.');
  const prefixes = CANTOR_PREFIXES.filter((_, i) => weights[i] > 0);
  const emptySelected = weights[legacyEmptyIndex] > 0;
  if (!prefixes.length && !emptySelected) return { prefixes, result: [], kind: 'idle', formula: '', detail: 'No cylinders selected.' };
  const intersection = operation === 'intersection' && !emptySelected ? intersectPrefixes(prefixes) : null;
  const result = operation === 'union' ? unionPrefixes(prefixes) : intersection === null ? [] : [intersection];
  if (!result.length) return { prefixes, result, kind: 'empty', formula: '∅', detail: `The ${operation} is empty.` };
  if (result.length > 1) return {
    prefixes, result, kind: 'union', formula: result.map(cylinderLabel).join(' ∪ '),
    detail: `All infinite strings beginning with any of these prefixes: ${result.join(', ')}. ${result.length} disjoint cylinders.`,
  };
  const prefix = result[0], { numerator: n, denominator: d } = prefixInterval(prefix);
  const fraction = value => value === 0 ? '0' : value === d ? '1' : `${value}/${d}`;
  return {
    prefixes, result, kind: 'cylinder',
    formula: prefix === '' ? `${cylinderLabel(prefix)} = C` : cylinderLabel(prefix),
    detail: prefix === '' ? 'The result is the whole Cantor set C.' : `All infinite strings beginning ${prefix}. C ∩ [${fraction(n)}, ${fraction(n + 1)}].`,
  };
}

// One fixed-strength voice per cylinder in the simplified result. Parent tones
// can emerge from sibling unions even when their own key is not selected.
export function cantorAudioWeights(weights, operation = DEFAULT_CANTOR_OPERATION) {
  const { result } = cantorSelection(weights, operation);
  return CANTOR_PREFIXES.map(prefix => result.includes(prefix) ? 1 : 0);
}
