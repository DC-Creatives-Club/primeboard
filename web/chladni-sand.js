// A reduced Chladni transport model, not a grain-contact solver. Grains make
// unbiased local random walks with diffusivity set by cycle-averaged vibration.
// They spend longer in quiet regions without being pulled toward a target curve.
export const SAND_COUNT = 6000;
export const SAND_STEP = 1 / 120;
const DIFFUSIVITY = .014;

export function sampleGrid(field, size, x, y) {
  const u = Math.max(0, Math.min(1, x)) * (size - 1);
  const v = Math.max(0, Math.min(1, y)) * (size - 1);
  const ix = Math.min(size - 2, Math.floor(u)), iy = Math.min(size - 2, Math.floor(v));
  const a = u - ix, b = v - iy, p = iy * size + ix;
  return (1 - b) * ((1 - a) * field[p] + a * field[p + 1])
    + b * ((1 - a) * field[p + size] + a * field[p + size + 1]);
}

// Equal frequencies share phase and interfere; distinct frequencies contribute
// separate time-averaged powers. Near-degenerate beating is not resolved here.
export function frequencyGroups(ratios) {
  const groups = [];
  ratios.forEach((ratio, i) => {
    const group = groups.find(g => Math.abs(ratios[g[0]] - ratio) <= 1e-10 * ratio);
    if (group) group.push(i); else groups.push([i]);
  });
  return groups;
}

export class ChladniSand {
  constructor({ count = SAND_COUNT, seed = 0x504c4154 } = {}) {
    this.count = count;
    this.seed = seed >>> 0 || 1;
    this.x = new Float64Array(count);
    this.y = new Float64Array(count);
    this.variation = new Float32Array(count);
    this.remainder = 0;
    this.redistribute();
  }

  random() {
    let x = this.seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  clone() {
    const copy = new ChladniSand({ count: this.count });
    copy.x.set(this.x); copy.y.set(this.y); copy.variation.set(this.variation);
    copy.seed = this.seed; copy.remainder = this.remainder;
    if (this.fields) {
      copy.fields = this.fields; copy.groups = this.groups; copy.size = this.size;
      copy.power = new Float32Array(this.power.length);
      copy.amplitudes = null; copy.active = false;
    }
    return copy;
  }

  redistribute() {
    for (let i = 0; i < this.count; i++) {
      this.x[i] = this.random(); this.y[i] = this.random();
      this.variation[i] = this.random();
    }
    this.remainder = 0;
  }

  setModes(fields, ratios, size) {
    this.fields = fields;
    this.groups = frequencyGroups(ratios);
    this.size = size;
    this.power = new Float32Array(size * size);
    this.amplitudes = null;
    this.active = false;
  }

  setAmplitudes(amplitudes) {
    if (this.amplitudes?.every((a, i) => a === amplitudes[i])) return;
    this.amplitudes = Float64Array.from(amplitudes);
    this.power.fill(0);
    this.active = amplitudes.some(a => a > 0);
    if (!this.active) { this.remainder = 0; return; }
    for (const group of this.groups) {
      const selected = group.filter(i => amplitudes[i] !== 0);
      if (!selected.length) continue;
      for (let p = 0; p < this.power.length; p++) {
        let velocity = 0;
        for (const i of selected) velocity += amplitudes[i] * this.fields[i][p];
        this.power[p] += velocity * velocity;
      }
    }
  }

  advance(dt) {
    if (!this.active || !(dt > 0)) return;
    // Bound catch-up after an interrupted frame. Fixed steps make the motion
    // independent of display refresh rate, with no hidden-tab fast-forward.
    this.remainder += Math.min(.1, dt);
    while (this.remainder + 1e-12 >= SAND_STEP) {
      this.remainder = Math.max(0, this.remainder - SAND_STEP);
      for (let i = 0; i < this.count; i++) {
        const power = sampleGrid(this.power, this.size, this.x[i], this.y[i]);
        const diffusion = DIFFUSIVITY * power / (1 + power);
        // Each independent uniform increment has variance 2 D dt (Ito step).
        const scale = Math.sqrt(6 * diffusion * SAND_STEP);
        let x = this.x[i] + scale * (2 * this.random() - 1);
        let y = this.y[i] + scale * (2 * this.random() - 1);
        // A reflecting rim preserves the finite population. It does not impose
        // a zero-displacement boundary on the free-plate vibration model.
        if (x < 0) x = -x; else if (x > 1) x = 2 - x;
        if (y < 0) y = -y; else if (y > 1) y = 2 - y;
        this.x[i] = x; this.y[i] = y;
      }
    }
  }
}
