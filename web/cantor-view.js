import { CANTOR_STATE_SIZE, DEFAULT_CANTOR_OPERATION, cantorLevel, cantorSelection, prefixInterval, prefixLabel } from './cantor.js';

const levels = Array.from({ length: 5 }, (_, depth) => cantorLevel(depth));
const projection = cantorLevel(6);
const ink = '#b8c8c9', muted = '#7e9298', resultColor = '#ede4ab';

export class CantorView {
  constructor(canvas, renderWidth = null) {
    this.canvas = canvas;
    this.renderWidth = renderWidth;
    this.state = cantorSelection(Array(CANTOR_STATE_SIZE).fill(0));
    this.signature = '';
    if (renderWidth) return;
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(canvas);
  }

  update(weights, operation = DEFAULT_CANTOR_OPERATION) {
    const signature = operation + ':' + weights.map(value => value > 0 ? '1' : '0').join('');
    if (signature !== this.signature) {
      this.signature = signature;
      this.state = cantorSelection(weights, operation);
      this.canvas.setAttribute('aria-label', `Cantor set, four middle-third removals above the unit interval. ${this.state.formula ? this.state.formula + '. ' : ''}${this.state.detail}`);
      this.draw();
    }
    return this.state;
  }

  draw() {
    const w = this.renderWidth ?? this.canvas.clientWidth;
    if (!w) return;
    const h = 306, dpr = this.renderWidth ? 1 : Math.min(devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    const ctx = this.canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0c1216'; ctx.fillRect(0, 0, w, h);
    const left = w < 500 ? 39 : 62, right = w - (w < 500 ? 22 : 38), span = right - left;
    const x = t => left + t * span, y = depth => 30 + depth * 45, axisY = 264;
    const { result } = this.state;

    // Soft interval shadows are guides; only the broken bright bars are the
    // finite approximations to the set. Gaps are never painted as set members.
    const shadow = (prefix, color, alpha) => {
      const interval = prefixInterval(prefix), top = y(prefix.length);
      const gradient = ctx.createLinearGradient(0, top, 0, axisY);
      gradient.addColorStop(0, color); gradient.addColorStop(1, '#0c1216');
      ctx.globalAlpha = alpha; ctx.fillStyle = gradient;
      ctx.fillRect(x(interval.start), top, span / interval.denominator, axisY - top);
      ctx.globalAlpha = alpha * 2; ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]); ctx.beginPath();
      for (const end of [interval.start, interval.end]) { ctx.moveTo(x(end), top); ctx.lineTo(x(end), axisY); }
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    };
    for (const prefix of result) shadow(prefix, resultColor, .20);

    // The refinement structure remains visible even before a key is played.
    ctx.strokeStyle = '#223137'; ctx.lineWidth = 1;
    for (let depth = 1; depth < levels.length; depth++) {
      for (const interval of levels[depth]) {
        const parent = prefixInterval(interval.prefix.slice(0, -1));
        ctx.beginPath(); ctx.moveTo(x((parent.start + parent.end) / 2), y(depth - 1) + 7);
        ctx.lineTo(x((interval.start + interval.end) / 2), y(depth) - 7); ctx.stroke();
      }
    }

    const isResult = prefix => result.some(cylinder => prefix.startsWith(cylinder));
    for (let depth = 0; depth < levels.length; depth++) {
      ctx.font = '10px ui-monospace, monospace'; ctx.fillStyle = muted; ctx.textAlign = 'right';
      ctx.fillText(`n=${depth}`, left - 13, y(depth) + 4);
      for (const interval of levels[depth]) {
        const a = x(interval.start), width = span / interval.denominator;
        ctx.fillStyle = isResult(interval.prefix) ? resultColor : '#51666e';
        ctx.fillRect(a, y(depth), width, 7);
        const chosen = result.includes(interval.prefix);
        if (chosen) { ctx.strokeStyle = resultColor; ctx.lineWidth = 1; ctx.strokeRect(a - 2, y(depth) - 2, width + 4, 11); }
        if (width >= 25 || depth === 0) {
          ctx.fillStyle = chosen ? '#edf7f6' : ink; ctx.textAlign = 'center';
          ctx.fillText(prefixLabel(interval.prefix), a + width / 2, y(depth) - 9);
        }
      }
    }

    ctx.strokeStyle = '#65787d'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(left, axisY); ctx.lineTo(right, axisY);
    for (const tick of [0, 1 / 3, 2 / 3, 1]) { ctx.moveTo(x(tick), axisY - 4); ctx.lineTo(x(tick), axisY + 5); }
    ctx.stroke();
    for (const interval of projection) {
      const highlighted = isResult(interval.prefix);
      ctx.fillStyle = highlighted ? resultColor : '#33434a';
      ctx.fillRect(x(interval.start), axisY - 3, span / interval.denominator, 6);
    }
    ctx.fillStyle = muted; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'center';
    for (const [tick, label] of [[0, '0'], [1 / 3, '1/3'], [2 / 3, '2/3'], [1, '1']]) ctx.fillText(label, x(tick), axisY + 22);
  }
}
