import { KEYS, ROWS, MAX_EXPONENT, parseCMF, matchingAt, spectrumXYZ, primeProduct, decodeProduct, displayColor, chromaticity } from './color.js';
import { Instrument } from './instrument.js';
import { Synth } from './audio.js';

const $ = id => document.getElementById(id);
const instrument = new Instrument();
const synth = new Synth();
const codeMap = new Map(KEYS.map(key => [key.code, key.index]));
const svgNS = 'http://www.w3.org/2000/svg';
let rows, keyColors, keyButtons, spectrumLines;
let exposure = 1;
let currentNumber = '1';
let soundPending = false;
let copyTimer;
const defaultDetail = '26 primes · 700–400 nm · C3–C♯5';

function normalizedColor(xyz) {
  const largest = Math.max(...xyz);
  return displayColor(xyz.map(v => v / largest), 2).css;
}

function makeKeyboard() {
  keyColors = KEYS.map(key => normalizedColor(matchingAt(key.wavelength, rows)));
  keyButtons = [];
  for (const letters of ROWS) {
    const row = document.createElement('div'); row.className = 'key-row';
    for (const letter of letters) {
      const key = KEYS.find(k => k.letter === letter);
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'key'; button.dataset.index = key.index;
      button.style.setProperty('--key-color', keyColors[key.index]);
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `${letter}: prime ${key.prime}, ${key.wavelength.toFixed(1)} nanometers, ${key.note}`);
      button.title = `${key.letter} · ${key.prime} · ${key.wavelength.toFixed(1)} nm · ${key.frequencyTHz.toFixed(1)} THz · ${key.note}`;
      button.innerHTML = `<span class="key-letter">${letter}</span><span class="key-prime">${key.prime}</span><span class="key-note">${key.note}</span><span class="key-exponent"></span>`;
      button.addEventListener('pointerenter', () => showKey(key.index));
      button.addEventListener('focus', () => showKey(key.index));
      button.addEventListener('pointerleave', () => { $('key-detail').textContent = defaultDetail; });
      button.addEventListener('blur', () => { $('key-detail').textContent = defaultDetail; });
      // Native Enter/Space or assistive-technology click: a short momentary note.
      // Pointer clicks have already been handled by the pointer-down/up path.
      button.addEventListener('click', event => {
        if (event.detail !== 0) return;
        const source = `accessible-${key.index}`;
        press(key.index, source);
        setTimeout(() => release(source), 180);
      });
      keyButtons.push(button); row.append(button);
    }
    $('keyboard').append(row);
  }
}

function showKey(i) {
  const key = KEYS[i];
  $('key-detail').textContent = `${key.letter} · prime ${key.prime} · ${key.wavelength.toFixed(1)} nm · ${key.frequencyTHz.toFixed(1)} THz · ${key.note} / ${key.audioHz.toFixed(1)} Hz`;
}

function makeSpectrum() {
  const grid = $('spectrum-grid');
  for (const y of [16, 48, 80, 112]) {
    const line = document.createElementNS(svgNS, 'line');
    for (const [name, value] of Object.entries({ x1: 8, x2: 312, y1: y, y2: y, class: 'grid' })) line.setAttribute(name, value);
    grid.append(line);
  }
  const min = KEYS[0].frequencyTHz, max = KEYS.at(-1).frequencyTHz;
  spectrumLines = KEYS.map((key, i) => {
    const x = 8 + (key.frequencyTHz - min) / (max - min) * 304;
    const line = document.createElementNS(svgNS, 'line');
    for (const [name, value] of Object.entries({ x1: x, x2: x, y1: 112, y2: 112, stroke: keyColors[i], opacity: 0 })) line.setAttribute(name, value);
    $('spectrum-lines').append(line); return line;
  });
  $('spectrum-ramp').style.background = `linear-gradient(to right,${keyColors.map((c, i) => `${c} ${100 * (KEYS[i].frequencyTHz - min) / (max - min)}%`).join(',')})`;
}

function render() {
  const e = instrument.exponents;
  const xyz = spectrumXYZ(e, rows);
  const color = displayColor(xyz, exposure);
  const xy = chromaticity(xyz);
  const active = e.filter(Boolean).length;
  const power = e.reduce((sum, value) => sum + value, 0);
  currentNumber = primeProduct(e).toString();
  const product = $('product');
  product.textContent = currentNumber;
  product.className = currentNumber.length > 22 ? 'long' : currentNumber.length > 10 ? 'medium' : '';
  $('factorization').innerHTML = active ? e.map((value, i) => value ? `${KEYS[i].prime}${value > 1 ? `<sup>${value}</sup>` : ''}` : '').filter(Boolean).join(' × ') : 'The empty product. The lights are off.';
  $('light-screen').style.setProperty('--light', color.css);
  $('light-field').classList.toggle('active', active > 0);
  $('color-hex').textContent = color.hex;
  $('luminance').textContent = xyz[1].toFixed(4);
  $('luminance').title = `Unmodified XYZ: ${xyz.map(v => v.toFixed(6)).join(', ')}`;
  $('chromaticity').textContent = xy ? xy.map(v => v.toFixed(4)).join(', ') : '—';
  $('power').textContent = power;
  $('line-count').textContent = `${active} ${active === 1 ? 'LINE' : 'LINES'}`;
  $('gamut-note').textContent = `${color.outOfGamut ? 'Outside sRGB gamut · approximated' : 'sRGB preview'} · exposure compressed`;
  $('status').textContent = active ? (instrument.held.size ? 'PLAYING' : 'SUSTAINING') : 'READY TO PLAY';
  $('mixture-label').textContent = active ? `${active} ${active === 1 ? 'frequency' : 'frequencies'} · ${power} power ${power === 1 ? 'unit' : 'units'}${e.includes(MAX_EXPONENT) ? ' · hold limit 32' : ''}` : 'Press a key to begin';
  $('sustain').setAttribute('aria-pressed', String(instrument.sustain));
  $('sustain').querySelector('.button-state').textContent = instrument.sustain ? 'on' : 'off';
  $('copy').disabled = false;
  const peak = Math.max(4, ...e);
  $('spectrum-max').textContent = `${peak} power units`;
  e.forEach((value, i) => {
    const button = keyButtons[i];
    button.classList.toggle('active', value > 0);
    button.setAttribute('aria-pressed', String(value > 0));
    button.querySelector('.key-exponent').textContent = value > 0 ? `^${value}` : '';
    spectrumLines[i].setAttribute('opacity', value ? 1 : 0);
    spectrumLines[i].setAttribute('y2', 112 - 96 * value / peak);
  });
  $('spectrum').setAttribute('aria-label', active ? `Relative spectral power, plot maximum ${peak} units: ${e.map((v, i) => v ? `${KEYS[i].frequencyTHz.toFixed(1)} terahertz at ${v} units` : '').filter(Boolean).join('; ')}` : 'No spectral lines active');
  synth.sync(e);
}

function press(index, source) {
  if (instrument.press(index, source, performance.now())) { showKey(index); render(); }
}
function release(source) { if (instrument.release(source)) render(); }
function clear() { instrument.clear(); render(); }
function toggleSustain() { instrument.setSustain(!instrument.sustain); render(); }
function typingTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('textarea, select, [contenteditable="true"]')) return true;
  const input = target.closest('input');
  return Boolean(input && !['range', 'checkbox', 'radio', 'button', 'submit'].includes(input.type));
}

function bindInputs() {
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape') { clear(); return; }
    if (event.isComposing || event.altKey || event.ctrlKey || event.metaKey || typingTarget(event.target)) return;
    if (event.code === 'Space' && !event.target.closest('button, summary, a')) {
      event.preventDefault(); if (!event.repeat) toggleSustain(); return;
    }
    const index = codeMap.get(event.code);
    if (index === undefined) return;
    event.preventDefault(); if (!event.repeat) press(index, event.code);
  });
  window.addEventListener('keyup', event => release(event.code));

  const pointers = new Map();
  $('keyboard').addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const button = event.target.closest('.key'); if (!button) return;
    event.preventDefault();
    $('keyboard').focus({ preventScroll: true });
    const index = Number(button.dataset.index);
    pointers.set(event.pointerId, index);
    $('keyboard').setPointerCapture(event.pointerId);
    press(index, `pointer-${event.pointerId}`);
  });
  $('keyboard').addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.key');
    const next = target ? Number(target.dataset.index) : null;
    if (pointers.get(event.pointerId) === next) return;
    release(`pointer-${event.pointerId}`);
    pointers.set(event.pointerId, next);
    if (next !== null) press(next, `pointer-${event.pointerId}`);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    $('keyboard').addEventListener(type, event => { pointers.delete(event.pointerId); release(`pointer-${event.pointerId}`); });
  }
  const stop = () => { pointers.clear(); clear(); synth.stop(); };
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  $('clear').addEventListener('click', clear);
  $('sustain').addEventListener('click', toggleSustain);
  $('sound').addEventListener('click', async () => {
    if (soundPending) return;
    soundPending = true;
    try {
      if (synth.enabled) synth.disable(); else await synth.enable();
      $('sound').setAttribute('aria-pressed', String(synth.enabled));
      $('sound').querySelector('.sound-label').textContent = synth.enabled ? 'Sound on' : 'Enable sound';
      $('audio-hint').textContent = synth.enabled ? 'Sine tones are on. Hold a key to increase its light and sound power.' : 'Enable sound to hear the same prime-weighted spectrum as sine tones.';
      $('app-message').textContent = '';
      synth.sync(instrument.exponents);
      $('keyboard').focus({ preventScroll: true });
    } catch (error) { $('app-message').textContent = `Sound could not start: ${error.message}`; }
    finally { soundPending = false; }
  });
  $('exposure').addEventListener('input', event => {
    exposure = 2 ** Number(event.target.value);
    $('exposure-value').textContent = `${exposure.toFixed(1)}×`; render();
  });
  $('hold-speed').addEventListener('input', event => {
    const ms = Number(event.target.value);
    instrument.setHoldMs(ms, performance.now()); $('hold-value').textContent = `${(ms / 1000).toFixed(2)} s`;
  });
  $('volume').addEventListener('input', event => {
    synth.setVolume(Number(event.target.value) / 100); $('volume-value').textContent = `${event.target.value}%`;
  });
  $('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentNumber);
      $('copy').textContent = 'Copied ✓';
      clearTimeout(copyTimer); copyTimer = setTimeout(() => { $('copy').textContent = 'Copy number ↗'; }, 1800);
    } catch { $('app-message').textContent = 'Copy is unavailable in this browser. Select the number on the screen to copy it.'; }
  });
  const nearest = nm => KEYS.reduce((best, key) => Math.abs(key.wavelength - nm) < Math.abs(KEYS[best].wavelength - nm) ? key.index : best, 0);
  const presets = {
    ember: [[nearest(630), 3], [nearest(580), 1]],
    violet: [[nearest(630), 3], [nearest(450), 1]],
    daylight: KEYS.map(key => [key.index, 1]),
  };
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    const exponents = KEYS.map(() => 0);
    for (const [i, e] of presets[button.dataset.preset]) exponents[i] = e;
    instrument.load(exponents); $('form-message').textContent = ''; render();
  }));
  $('number-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const exponents = decodeProduct($('number-input').value);
      instrument.load(exponents); render();
      $('form-message').textContent = currentNumber === '1' ? '1 is the empty product: no spectral lines, no light.' : 'Number loaded. Sustain is on; play more keys to add to it.';
      $('number-input').removeAttribute('aria-invalid');
    } catch (error) { $('form-message').textContent = error.message; $('number-input').setAttribute('aria-invalid', 'true'); }
  });
  // Discrete real-time steps, independent of browser/OS key-repeat settings.
  setInterval(() => { if (instrument.tick(performance.now())) render(); }, 25);
}

async function start() {
  try {
    const response = await fetch(new URL('./data/CIE_xyz_1931_2deg.csv', import.meta.url));
    if (!response.ok) throw new Error(`Color data request returned ${response.status}.`);
    rows = parseCMF(await response.text());
    makeKeyboard(); makeSpectrum(); bindInputs();
    document.querySelectorAll('button[disabled]').forEach(button => { button.disabled = false; });
    $('status-dot').classList.add('ready'); $('app-message').textContent = ''; render();
  } catch (error) {
    $('status').textContent = 'COULD NOT LOAD';
    $('app-message').textContent = `Primeboard could not start: ${error.message} Please reload to try again.`;
  }
}
start();
