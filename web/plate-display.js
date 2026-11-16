import { KEYS, matchingAt, xyzToLinearRGB, encodeSRGB } from './color.js';
import { MODES, modeShape, nodeStrength } from './plate-modes.js';

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

  prepare() {
    if (this.fields) return;
    const pixels = this.size ** 2;
    this.fields = MODES.map(() => new Float32Array(pixels));
    this.nodes = MODES.map(() => new Float32Array(pixels));
    for (const mode of MODES) {
      for (let y = 0; y < this.size; y++) {
        for (let x = 0; x < this.size; x++) {
          const i = y * this.size + x, u = x / (this.size - 1), v = y / (this.size - 1);
          this.fields[mode.index][i] = modeShape(mode, u, v);
          this.nodes[mode.index][i] = nodeStrength(mode, u, v);
        }
      }
    }
  }

  setState(exponents, readout, exposure) {
    this.prepare();
    this.readout = readout;
    this.exposure = exposure;
    this.active = exponents.flatMap((e, i) => e ? [{ e, amplitude: Math.sqrt(e), index: i, field: this.fields[i], nodes: this.nodes[i], color: this.colors[i] }] : []);
    this.canvas.setAttribute('aria-label', this.active.length ? `${readout === 'nodes' ? 'Individual colored nodal patterns' : readout === 'strength' ? 'Average squared displacement, brighter where vibration is stronger' : 'Signed displacement, blue positive and orange negative'}. Active keys: ${this.active.map(a => `${KEYS[a.index].letter}, mode ${MODES[a.index].label}, weight ${a.e}`).join('; ')}.` : 'Silent square plate. Play a key to see its mode.');
    this.draw();
  }

  tick(now, moving) {
    const dt = this.lastTick === null ? 0 : Math.min(.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    if (!moving || this.readout !== 'field' || !this.active.length) return;
    this.time += dt;
    if (now - this.lastDraw < 1000 / 30) return;
    this.lastDraw = now;
    this.draw();
  }

  draw() {
    const data = this.image.data;
    const wave = this.active.map(a => a.amplitude * Math.cos(2 * Math.PI * KEYS[a.index].audioHz * this.time / 200));
    const colored = this.readout === 'nodes';
    const strength = this.readout === 'strength';
    for (let p = 0; p < this.size ** 2; p++) {
      let r = 0, g = 0, b = 0;
      if (colored) {
        let x = 0, y = 0, z = 0;
        for (const a of this.active) {
          const weight = a.e * a.nodes[p];
          x += weight * a.color[0]; y += weight * a.color[1]; z += weight * a.color[2];
        }
        [r, g, b] = xyzToLinearRGB([x, y, z]);
      } else {
        let value = 0;
        for (let k = 0; k < this.active.length; k++) {
          const a = this.active[k], f = a.field[p];
          value += strength ? .5 * a.e * f * f : wave[k] * f;
        }
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
