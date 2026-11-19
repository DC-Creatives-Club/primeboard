import { CantorView } from './cantor-view.js';
import { spectrumXYZ, displayColor, primeProduct } from './color.js';

export class ExportRenderer {
  constructor({ view, rows, exposure, operation, cubeView, plateDisplay }) {
    this.settings = { view, rows, exposure, operation };
    this.canvas = document.createElement('canvas');
    this.canvas.width = 960; this.canvas.height = 720;
    this.context = this.canvas.getContext('2d');
    const source = document.createElement('canvas');
    if (view === 'cube' || view === 'sphere') this.surface = cubeView.createExportView(source);
    else if (view === 'modes') this.plate = plateDisplay.createExportView(source, rows);
    else if (view === 'cantor') this.cantor = new CantorView(source, 912);
    this.source = source;
    this.setWeights(Array(view === 'cantor' ? 32 : 26).fill(0));
  }
  setWeights(weights) {
    this.weights = weights;
    this.surface?.update(weights);
    if (this.plate) this.plate.setState(weights, this.plate.readout, this.settings.exposure, false);
    this.cantor?.update(weights, this.settings.operation);
  }
  advance(dt) {
    this.surface?.bank.advance(dt);
    if (this.plate) {
      this.plate.bank.advance(dt);
      if (this.plate.readout === 'sand') {
        this.plate.prepareSand();
        this.plate.sand.setAmplitudes(this.plate.bank.q);
        this.plate.sand.advance(dt);
      }
    }
  }
  draw() {
    const ctx = this.context, w = this.canvas.width, h = this.canvas.height;
    ctx.fillStyle = '#101316'; ctx.fillRect(0, 0, w, h);
    if (this.settings.view === 'light') {
      const color = displayColor(spectrumXYZ(this.weights, this.settings.rows), this.settings.exposure).hex;
      const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * .55);
      gradient.addColorStop(0, color); gradient.addColorStop(1, '#101316');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.font = '32px monospace';
      ctx.fillText(primeProduct(this.weights).toString(), w / 2, h / 2, w - 80);
    } else {
      this.surface?.draw(); this.plate?.draw();
      if (this.surface?.gl.isContextLost()) throw new Error('The 3D renderer was interrupted. Try exporting again.');
      const source = this.source, scale = Math.min((w - 48) / source.width, (h - 80) / source.height);
      const sw = source.width * scale, sh = source.height * scale;
      ctx.drawImage(source, (w - sw) / 2, (h - sh) / 2, sw, sh);
    }
    ctx.textAlign = 'left'; ctx.fillStyle = '#d6d3b8'; ctx.font = '16px sans-serif';
    ctx.fillText('primeboard.', 24, h - 22);
  }
  dispose() {
    this.surface?.dispose();
    this.source.width = this.source.height = this.canvas.width = this.canvas.height = 1;
  }
}
