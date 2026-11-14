import { KEYS, MAX_EXPONENT, validateExponents } from './color.js';

// Input source IDs keep a pointer and a physical key from releasing each other.
export class Instrument {
  constructor() {
    this.exponents = Array(KEYS.length).fill(0);
    this.sources = new Map();
    this.held = new Map();
    this.sustain = false;
    this.holdMs = 500;
  }
  press(index, source, now) {
    if (this.sources.has(source)) return false;
    if (!Number.isInteger(index) || index < 0 || index >= KEYS.length) return false;
    this.sources.set(source, index);
    if (!this.held.has(index)) {
      this.exponents[index] = Math.min(MAX_EXPONENT, this.exponents[index] + 1);
      this.held.set(index, { next: now + this.holdMs });
    }
    return true;
  }
  release(source) {
    const index = this.sources.get(source);
    if (index === undefined) return false;
    this.sources.delete(source);
    if (![...this.sources.values()].includes(index)) {
      this.held.delete(index);
      if (!this.sustain) this.exponents[index] = 0;
    }
    return true;
  }
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
    if (!value) this.exponents.forEach((_, i) => { if (!this.held.has(i)) this.exponents[i] = 0; });
  }
  load(exponents) {
    validateExponents(exponents);
    this.clear();
    this.sustain = true;
    this.exponents = [...exponents];
  }
  clear() {
    this.sources.clear();
    this.held.clear();
    this.exponents.fill(0);
  }
}
