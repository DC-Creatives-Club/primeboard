// Mass-normalized damped modes: q'' + 2 gamma q' + omega² q = F.
// Audio uses seconds; the display uniformly slows this clock, including damping.
export const FUNDAMENTAL_HZ = 110;
export const DISPLAY_SLOWDOWN = 80;

export function resonanceSpec(eigenvalues, shapes) {
  const ratios = eigenvalues.map(value => value / eigenvalues[0]);
  // Each key excites only its labeled mode, with an even audible balance.
  const strikes = ratios.map((_, i) => ratios.map((_, j) => Number(i === j)));
  return { ratios, strikes, pickup: ratios.map(() => 1) };
}

export class Resonator {
  constructor(spec) {
    this.spec = spec;
    this.count = spec.ratios.length;
    this.fundamentalHz = spec.fundamentalHz ?? FUNDAMENTAL_HZ;
    this.omega = spec.ratios.map(r => 2 * Math.PI * this.fundamentalHz * r);
    this.gamma = spec.ratios.map(r => 4 + 1.5 * Math.sqrt(r));
    this.damped = this.omega.map((w, i) => Math.sqrt(w * w - this.gamma[i] ** 2));
    this.reset();
  }
  reset() {
    this.q = new Float64Array(this.count);
    this.v = new Float64Array(this.count);
    this.sin = new Float64Array(this.count);
    this.cos = new Float64Array(this.count).fill(1);
    this.weights = Array(this.count).fill(0);
    this.drive = new Float64Array(this.count);
  }
  setWeights(weights, interaction = 'drive') {
    for (let i = 0; i < this.count; i++) {
      const added = Math.max(0, weights[i] - this.weights[i]);
      if (interaction === 'strike' && added && !this.weights[i]) {
        const impulse = 2 * Math.PI * this.fundamentalHz * Math.sqrt(added);
        for (let j = 0; j < this.count; j++) this.v[j] += impulse * this.spec.strikes[i][j];
      }
      if (interaction === 'strike' && added && this.weights[i]) {
        const gain = Math.sqrt(weights[i] / this.weights[i]);
        this.q[i] *= gain; this.v[i] *= gain;
      }
      this.drive[i] = interaction === 'drive' ? Math.sqrt(weights[i]) / this.spec.ratios[i] : 0;
    }
    this.weights = [...weights];
  }
  advance(dt) {
    if (!(dt > 0)) return;
    if (dt !== this.dt) {
      this.dt = dt;
      this.coefficients = this.omega.map((w, i) => {
        const g = this.gamma[i], d = this.damped[i], decay = Math.exp(-g * dt);
        return [decay * Math.cos(d * dt), decay * Math.sin(d * dt) / d, Math.sin(w * dt), Math.cos(w * dt)];
      });
    }
    for (let i = 0; i < this.count; i++) {
      const [c, s, sn, cs] = this.coefficients[i];
      const w = this.omega[i], g = this.gamma[i], a = this.drive[i];
      // Particular solution a sin(omega t) for F=2 gamma omega a cos(omega t).
      const q = this.q[i] - a * this.sin[i], v = this.v[i] - a * w * this.cos[i];
      const nextSin = this.sin[i] * cs + this.cos[i] * sn;
      this.cos[i] = this.cos[i] * cs - this.sin[i] * sn;
      this.sin[i] = nextSin;
      this.q[i] = (c + g * s) * q + s * v + a * nextSin;
      this.v[i] = -w * w * s * q + (c - g * s) * v + a * w * this.cos[i];
    }
  }
  // Static inspection only: a frozen-at-rest display must still reveal shapes.
  preview() {
    const q = Float64Array.from(this.weights, (e, i) => Math.sqrt(e) / this.spec.ratios[i]);
    return { q, v: new Float64Array(this.count), omega: this.omega, energy: q.reduce((s, x) => s + x*x, 0) };
  }
  get energy() {
    return this.q.reduce((sum, q, i) => sum + q * q + (this.v[i] / this.omega[i]) ** 2, 0);
  }
  sample() {
    // Displacement starts at zero after an impulse, avoiding a hard click.
    return this.q.reduce((sum, q, i) => sum + q * this.spec.ratios[i], 0) * .12;
  }
}

// Run the same driven oscillator as audio, but display its normalized amplitude
// envelope instead of sampling its rapidly alternating displacement as a color.
export class ModePulse {
  constructor(spec) { this.spec = spec; this.omega = spec.ratios.map(() => 1); this.reset(); }
  reset() {
    this.resonator = new Resonator(this.spec);
    this.q = new Float64Array(this.spec.ratios.length);
    this.v = new Float64Array(this.q.length);
  }
  get weights() { return this.resonator.weights; }
  setWeights(weights) {
    this.resonator.setWeights(weights, 'drive');
  }
  advance(dt) {
    const bank = this.resonator;
    if (!bank.drive.some(Boolean) && bank.energy < 1e-14) return;
    bank.advance(dt);
    for (let i = 0; i < this.q.length; i++) {
      const amplitude = this.spec.ratios[i] * Math.hypot(bank.q[i], bank.v[i] / bank.omega[i]);
      this.q[i] = !this.weights[i] && amplitude < .002 ? 0 : amplitude;
    }
  }
  get energy() { return this.q.reduce((sum, q) => sum + q*q, 0); }
  preview() {
    const q = Float64Array.from(this.weights, Math.sqrt);
    return { q, v: this.v, omega: this.omega, energy: this.weights.reduce((sum, weight) => sum + weight, 0) };
  }
}
