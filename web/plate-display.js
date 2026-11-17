import { decodeFreePlate, sampleFreePlate } from './free-plate.js';
import { ModePulse } from './resonator.js';
import { KEYS, matchingAt, xyzToLinearRGB, encodeSRGB } from './color.js';
import { MODES, modeShape, nodeStrength, plateResonanceSpec } from './plate-modes.js';

// Raster work is bounded independently of the screen's device-pixel ratio.
// Spatial shapes are cached; static views redraw only on a state change.
export class ModeDisplay {
  constructor(canvas, rows) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.size = canvas.width;
    this.image = this.context.createImageData(this.size, this.size);
    this.fields = null;
    this.active = [];
    this.model = 'supported';
    this.spec = plateResonanceSpec();
    this.bank = new ModePulse(this.spec);
    this.exponents = Array(26).fill(0);
    this.interaction = 'strike';
    this.readout = 'nodes';
    this.exposure = 1;
    this.time = 0;
    this.lastTick = null;
    this.lastDraw = 0;
    // Each layer has the key's CIE-derived hue, normalized for visibility.
    // Mix in linear XYZ before gamut clipping, exposure and sRGB encoding.
    this.colors = KEYS.map(key => {
      const xyz = matchingAt(key.wavelength, rows);
      const peak = Math.max(...xyzToLinearRGB(xyz));
      return xyz.map(v => v / peak);
    });
    this.encode = Float64Array.from({ length: 4097 }, (_, i) => 255 * encodeSRGB(i / 4096));
  }

  async loadFreePlate() {
    const responses = await Promise.all(['bin', 'json'].map(ext => fetch(new URL(`./data/modes/free-plate.${ext}`, import.meta.url))));
    if (responses.some(r => !r.ok)) throw new Error('The free plate could not load. Simply supported is still available.');
    this.freePlate = decodeFreePlate(await responses[0].arrayBuffer(), await responses[1].json());
  }

  modeLabel(i) { return this.model === 'free' ? 'φ' + String(i + 1).replace(/[0-9]/g, d => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]) : MODES[i].label; }

  setModel(model) {
    if (model === 'free' && !this.freePlate) return;
    this.model = model;
    this.spec = model === 'free' ? this.freePlate.spec : plateResonanceSpec();
    this.bank = new ModePulse(this.spec);
    this.fields = null;
    this.setState(this.exponents, this.readout, this.exposure);
  }

  prepare() {
    if (this.fields) return;
    const pixels = this.size ** 2;
    this.fields = MODES.map(() => new Float32Array(pixels));
    this.nodes = MODES.map(() => new Float32Array(pixels));
    for (const mode of MODES) {
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const i = y * this.size + x, u = x / (this.size - 1), v = y / (this.size - 1);
          if (this.model === 'free') {
            const sample = (x, y) => sampleFreePlate(this.freePlate, mode.index, x, y);
            const h = 1 / (this.size - 1), value = sample(u, v);
            const dx = (sample(Math.min(1, u + h), v) - sample(Math.max(0, u - h), v)) / (Math.min(1, u + h) - Math.max(0, u - h));
            const dy = (sample(u, Math.min(1, v + h)) - sample(u, Math.max(0, v - h))) / (Math.min(1, v + h) - Math.max(0, v - h));
            this.fields[mode.index][i] = value;
            this.nodes[mode.index][i] = Math.exp(-((Math.abs(value) / Math.max(2, Math.hypot(dx, dy)) / .005) ** 2));
          } else {
            this.fields[mode.index][i] = modeShape(mode, u, v);
            this.nodes[mode.index][i] = nodeStrength(mode, u, v);
          }
        }
      }
    }
  }

  setState(exponents, readout, exposure) {
    this.prepare();
    this.bank.setWeights(exponents, this.interaction);
    this.exponents = [...exponents];
    this.readout = readout;
    this.exposure = exposure;
    this.active = exponents.flatMap((e, i) => (e || this.bank.q[i] > .002) ? [{ e, amplitude: Math.sqrt(e), index: i, field: this.fields[i], nodes: this.nodes[i], color: this.colors[i] }] : []);
    this.canvas.setAttribute('aria-label', this.active.length ? `${readout === 'nodes' ? 'Individual colored nodal patterns' : readout === 'strength' ? 'Instantaneous squared displacement, brighter where displacement is larger' : 'Signed displacement, blue positive and orange negative'}. Active keys: ${this.active.map(a => `${KEYS[a.index].letter}, mode ${this.modeLabel(a.index)}, weight ${a.e}`).join('; ')}.` : 'Silent square plate. Play a key to see its mode.');
    this.draw();
  }

  tick(now, moving) {
    const dt = this.lastTick === null ? 0 : Math.min(.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.frozen = !moving;
    if (!moving || !this.fields) return;
    this.bank.advance(dt);
    this.time += dt;
    if (now - this.lastDraw < 1000 / 60) return;
    this.lastDraw = now;
    this.draw();
  }

  reset() { this.bank.reset(); if (this.fields) this.draw(); }
  setInteraction(value) { this.interaction = value; this.bank.reset(); }

  draw() {
    const data = this.image.data;
    const wave = this.frozen && this.bank.energy < 1e-12 ? this.bank.preview().q : this.bank.q;
    const colored = this.readout === 'nodes';
    const strength = this.readout === 'strength';
    for (let p = 0; p < this.size ** 2; p++) {
      let r = 0, g = 0, b = 0;
      if (colored) {
        let x = 0, y = 0, z = 0;
        for (const a of this.active) {
          const weight = this.bank.q[a.index] * a.nodes[p];
          x += weight * a.color[0]; y += weight * a.color[1]; z += weight * a.color[2];
        }
        [r, g, b] = xyzToLinearRGB([x, y, z]);
      } else {
        let value = 0;
        for (let k = 0; k < wave.length; k++) value += wave[k] * this.fields[k][p];
        if (strength) value *= value;
        const palette = strength ? [1, .68, .24] : value >= 0 ? [.10, .48, 1] : [1, .28, .06];
        const magnitude = strength ? value * .55 : Math.abs(value) * .65;
        [r, g, b] = palette.map(c => c * magnitude);
      }
      r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
      const peak = Math.max(r, g, b);
      const scale = peak > 0 ? -Math.expm1(-this.exposure * peak) / peak : 0;
      data[4 * p] = this.encode[Math.min(4096, Math.round(r * scale * 4096))];
      data[4 * p + 1] = this.encode[Math.min(4096, Math.round(g * scale * 4096))];
      data[4 * p + 2] = this.encode[Math.min(4096, Math.round(b * scale * 4096))];
      data[4 * p + 3] = 255;
    }
    this.context.putImageData(this.image, 0, 0);
  }
}
