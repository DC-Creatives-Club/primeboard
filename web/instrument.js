import { KEYS, MAX_EXPONENT, validateExponents } from './color.js';

// Letter positions are shared across views. Older takes and songs are padded
// for Cantor; its extra keys are ignored by the 26-key light and modal models.
export function fitKeyWeights(weights, keyCount = KEYS.length) {
  return Array.from({ length: keyCount }, (_, i) => weights[i] ?? 0);
}

// Input source IDs keep a pointer and a physical key from releasing each other.
export class Instrument {
  constructor(keyCount = KEYS.length) {
    this.keyCount = keyCount;
    this.exponents = Array(keyCount).fill(0);
    this.levels = Array(keyCount).fill(0);
    this.sources = new Map();
    this.sustainedSources = new Map();
    this.held = new Map();
    this.sustain = false;
    this.holdMs = 500;
  }
  press(index, source, now) {
    if (this.sources.has(source)) return false;
    if (!Number.isInteger(index) || index < 0 || index >= this.keyCount) return false;
    this.sources.set(source, index);
    // A pointer can sustain several keys while dragging. Repressing one key
    // must not discard its ownership of the other sustained keys.
    const sustained = this.sustainedSources.get(source);
    sustained?.delete(index);
    if (sustained?.size === 0) this.sustainedSources.delete(source);
    if (!this.held.has(index)) {
      this.exponents[index] = Math.min(MAX_EXPONENT, this.exponents[index] + 1);
      // Modal levels are driver strengths. Holding keeps the force steady;
      // the resonator, rather than the input, supplies the vibration buildup.
      this.levels[index] = Math.min(MAX_EXPONENT, this.levels[index] + 1);
      this.held.set(index, { next: now + this.holdMs });
    }
    return true;
  }
  release(source, options = {}) {
    const { force = false, sustain = this.sustain } = options;
    const activeIndex = this.sources.get(source);
    const sustained = this.sustainedSources.get(source) || new Map();
    const indices = new Set(sustained.keys());
    if (activeIndex !== undefined) indices.add(activeIndex);
    if (!indices.size) return false;
    this.sources.delete(source);
    if (sustain && !force) {
      for (const index of activeIndex === undefined ? indices : [activeIndex]) {
        sustained.set(index, { external: options.sustain === true });
      }
      this.sustainedSources.set(source, sustained);
    } else this.sustainedSources.delete(source);
    for (const index of indices) if (![...this.sources.values()].includes(index)) {
      this.held.delete(index);
      if (!this.isSustained(index)) { this.exponents[index] = 0; this.levels[index] = 0; }
    }
    return true;
  }
  isSustained(index) { return [...this.sustainedSources.values()].some(voices => voices.has(index)); }
  tick(now) {
    let changed = false;
    for (const [i, hold] of this.held) {
      if (now >= hold.next) {
        const steps = 1 + Math.floor((now - hold.next) / this.holdMs);
        const next = Math.min(MAX_EXPONENT, this.exponents[i] + steps);
        changed ||= next !== this.exponents[i];
        this.exponents[i] = next;
        hold.next += steps * this.holdMs;
      }
    }
    return changed;
  }
  setHoldMs(ms, now) {
    this.holdMs = ms;
    for (const hold of this.held.values()) hold.next = now + ms;
  }
  setSustain(value) {
    this.sustain = value;
    if (!value) {
      for (const [source, voices] of this.sustainedSources) {
        for (const [index, voice] of voices) if (!voice.external) voices.delete(index);
        if (!voices.size) this.sustainedSources.delete(source);
      }
      this.exponents.forEach((_, i) => {
        if (!this.held.has(i) && !this.isSustained(i)) {
          this.exponents[i] = 0; this.levels[i] = 0;
        }
      });
    }
  }
  load(exponents) {
    validateExponents(exponents, this.keyCount);
    this.clear();
    this.sustain = true;
    this.exponents = [...exponents];
    this.levels = [...exponents];
  }
  clear() {
    this.sources.clear();
    this.sustainedSources.clear();
    this.held.clear();
    this.exponents.fill(0);
    this.levels.fill(0);
  }
}
