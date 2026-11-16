import { KEYS, ROWS, MAX_EXPONENT, parseCMF, matchingAt, spectrumXYZ, primeProduct, decodeProduct, displayColor, chromaticity } from './color.js';
import { Instrument } from './instrument.js';
import { Synth } from './audio.js';
import { SONGS, SongPlayer, songSpectrum, songFrames } from './song.js';
import { MODES } from './plate-modes.js';
import { ModeDisplay } from './plate-display.js';
import { CubeView } from './cube-view.js';

const $ = id => document.getElementById(id);
const instrument = new Instrument();
const synth = new Synth();
const player = new SongPlayer(SONGS[0]);
const codeMap = new Map(KEYS.map(key => [key.code, key.index]));
const svgNS = 'http://www.w3.org/2000/svg';
let rows, keyColors, keyButtons, spectrumLines;
let exposure = 1;
let currentNumber = '1';
let soundPending = false;
const copyTimers = new WeakMap();
let songPending = false;
let playRequest = 0;
let cubeView;
let modesReady = false;
let visualization = 'cube';
let plateDisplay;
let animatePlate = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const defaultDetail = () => visualization === 'modes' ? '26 square-plate modes · C3–C♯5' : visualization === 'cube' ? '26 surface modes · φ1–φ26 · C3–C♯5' : '26 primes · 700–400 nm · C3–C♯5';

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
      button.addEventListener('pointerleave', () => { $('key-detail').textContent = defaultDetail(); });
      button.addEventListener('blur', () => { $('key-detail').textContent = defaultDetail(); });
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
  updateKeyboardLabels();
}

function keyModeLabel(i) {
  return visualization === 'modes' ? MODES[i].label : `φ${i + 1}`;
}
function updateKeyboardLabels() {
  const modal = visualization !== 'light';
  $('key-detail').textContent = defaultDetail();
  $('keyboard').classList.toggle('plate-keys', modal);
  $('keyboard').setAttribute('aria-label', modal ? '26 eigenmodes. Type the matching QWERTY letters to play.' : '26 primes. Type the matching QWERTY letters to play.');
  keyButtons.forEach((button, i) => {
    const key = KEYS[i], label = keyModeLabel(i);
    button.querySelector('.key-prime').textContent = modal ? label : key.prime;
    button.querySelector('.key-note').textContent = key.note;
    button.setAttribute('aria-label', modal ? `${key.letter}: mode ${label}, ${key.note}` : `${key.letter}: prime ${key.prime}, ${key.note}`);
    button.title = modal ? `${key.letter} · mode ${label} · ${key.note}` : `${key.letter} · prime ${key.prime} · ${key.note}`;
  });
}
function showKey(i) {
  const key = KEYS[i];
  const eigenvalue = cubeView?.data?.eigenvalues[i];
  $('key-detail').textContent = visualization === 'light'
    ? `${key.letter} · prime ${key.prime} · ${key.wavelength.toFixed(1)} nm · ${key.note}`
    : `${key.letter} · mode ${keyModeLabel(i)}${visualization === 'cube' && eigenvalue ? ` · λ = ${eigenvalue.toFixed(4)}` : ''} · ${key.note}`;
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
  const inSong = player.state === 'playing' || player.state === 'paused';
  const e = inSong ? songSpectrum(player.song, player.beat) : instrument.exponents;
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
  $('color-chip').style.background = color.css;
  $('luminance').textContent = xyz[1].toFixed(4);
  $('luminance').title = `Unmodified XYZ: ${xyz.map(v => v.toFixed(6)).join(', ')}`;
  $('chromaticity').textContent = xy ? xy.map(v => v.toFixed(4)).join(', ') : '—';
  $('power').textContent = power;
  $('line-count').textContent = `${active} ${active === 1 ? 'LINE' : 'LINES'}`;
  $('gamut-note').textContent = `${color.outOfGamut ? 'Outside sRGB gamut · approximated' : 'sRGB preview'} · exposure compressed`;
  $('status').textContent = inSong ? `${player.state === 'playing' ? 'PLAYING' : 'PAUSED'} · ${player.song.title.toUpperCase()}` : active ? (instrument.held.size ? 'PLAYING' : 'SUSTAINING') : 'READY TO PLAY';
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
    button.querySelector('.key-exponent').textContent = value > 0 ? `${visualization !== 'light' ? '×' : '^'}${value}` : '';
    spectrumLines[i].setAttribute('opacity', value ? 1 : 0);
    spectrumLines[i].setAttribute('y2', 112 - 96 * value / peak);
  });
  $('spectrum').setAttribute('aria-label', active ? `Relative spectral power, plot maximum ${peak} units: ${e.map((v, i) => v ? `${KEYS[i].frequencyTHz.toFixed(1)} terahertz at ${v} units` : '').filter(Boolean).join('; ')}` : 'No spectral lines active');
  if (visualization === 'modes') renderPlate(e);
  cubeView?.update(e);
  if (modesReady) {
    const index = active === 1 ? e.findIndex(Boolean) : -1;
    $('mode-select').value = index < 0 ? '' : String(index);
    $('mode-summary').textContent = index >= 0
      ? `φ${index + 1} · λ = ${cubeView.data.eigenvalues[index].toFixed(4)}`
      : active ? `${active} modes combined · zero contours` : 'One key, one pattern.';
    $('cube').setAttribute('aria-label', active ? `Rounded metal cube, ${$('mode-summary').textContent}` : 'Rounded metal cube at rest. Play a key or inspect a mode.');
  }
  if (!inSong) synth.sync(e);
}

function selectView(view) {
  visualization = view;
  const cube = view === 'cube', modal = view === 'modes';
  for (const name of ['light', 'modes', 'cube']) $('view-' + name).setAttribute('aria-pressed', String(view === name));
  $('light-screen').classList.toggle('modes-active', cube);
  $('light-screen').hidden = modal; $('spectrum-panel').hidden = modal;
  $('plate-screen').hidden = !modal; $('plate-panel').hidden = !modal;
  $('modes-view').hidden = !cube; $('mode-panel').hidden = !cube;
  $('light-field').hidden = cube;
  $('model-label').textContent = cube ? 'ROUNDED-CUBE SURFACE MODES' : modal ? 'SQUARE-PLATE EIGENMODES' : 'CIE 1931 · 2° OBSERVER';
  cubeView?.setEnabled(cube);
  $('key-detail').textContent = defaultDetail();
  updateKeyboardLabels(); refreshSoundControls(); render();
}

const readouts = {
  nodes: { title: 'COLORED NODES', description: 'Overlay each note’s nodal lines in its own color. A chord keeps every pattern visible.', legend: 'Each color traces one mode’s nodal lines.' },
  strength: { title: 'VIBRATION STRENGTH', description: 'Average squared displacement. Bright regions move more; dark regions move less. This is not mechanical energy.', legend: 'Dark: little motion · bright: strong motion' },
  field: { title: 'MOVING FIELD', description: 'The signed sum of the modes. Watch regions reinforce or cancel as the notes oscillate.', legend: 'Blue: positive displacement · orange: negative · black: zero' },
};
function renderPlate(e) {
  const readout = $('plate-readout').value;
  const info = readouts[readout];
  $('plate-screen-title').textContent = info.title;
  $('plate-description').textContent = info.description;
  $('plate-legend').textContent = info.legend;
  $('plate-motion-controls').hidden = readout !== 'field';
  $('plate-motion').textContent = animatePlate ? 'Freeze motion' : 'Animate';
  $('plate-motion').setAttribute('aria-pressed', String(!animatePlate));
  const active = e.flatMap((weight, i) => weight ? [{ i, weight }] : []);
  $('plate-count').textContent = `${active.length} ACTIVE`;
  $('plate-empty').hidden = active.length > 0;
  $('active-plate-modes').replaceChildren();
  if (!active.length) {
    const p = document.createElement('p'); p.textContent = 'No modes active.'; $('active-plate-modes').append(p);
  }
  for (const { i, weight } of active) {
    const chip = document.createElement('span'); chip.className = 'plate-chip';
    chip.style.setProperty('--plate-color', keyColors[i]);
    chip.textContent = `${KEYS[i].letter} · ${MODES[i].label} × ${weight}`;
    chip.title = `${KEYS[i].note}, mode ${MODES[i].label}, modal weight ${weight}`;
    $('active-plate-modes').append(chip);
  }
  const power = e.reduce((sum, v) => sum + v, 0);
  $('plate-power').textContent = `${power} weight ${power === 1 ? 'unit' : 'units'}`;
  $('plate-product').textContent = currentNumber;
  $('plate-factorization').innerHTML = $('factorization').innerHTML;
  plateDisplay ??= new ModeDisplay($('plate-canvas'), rows);
  plateDisplay.setState(e, readout, exposure);
}

async function startModes() {
  const showError = message => {
    $('mode-message').textContent = message;
    document.querySelectorAll('[data-mode-control]').forEach(control => { control.disabled = Boolean(message); });
  };
  try {
    cubeView = new CubeView($('cube'), showError);
    cubeView.setEnabled($('view-cube').getAttribute('aria-pressed') === 'true');
    const data = await cubeView.load();
    for (const key of KEYS) {
      const option = document.createElement('option'); option.value = key.index;
      option.textContent = `φ${key.index + 1} / ${key.letter} · λ ${data.eigenvalues[key.index].toFixed(3)}`;
      $('mode-select').append(option);
    }
    modesReady = true; showError('');
    refreshMotionControl(); render();
  } catch (error) { showError(error.message); }
}
function refreshMotionControl() {
  $('mode-pause').setAttribute('aria-pressed', String(cubeView.paused));
  $('mode-pause').textContent = cubeView.paused ? 'Resume motion' : 'Pause motion';
}

function press(index, source) {
  takeOver();
  if (instrument.press(index, source, performance.now())) { showKey(index); render(); }
}
function release(source) { if (instrument.release(source)) render(); }
function clear() { stopSong(); instrument.clear(); render(); }
function toggleSustain() { takeOver(); instrument.setSustain(!instrument.sustain); render(); }

function refreshSoundControls() {
  $('sound').setAttribute('aria-pressed', String(synth.enabled));
  $('sound').querySelector('.sound-label').textContent = synth.enabled ? 'Sound on' : 'Enable sound';
  $('audio-hint').textContent = visualization === 'modes'
    ? (synth.enabled ? 'Sine tones are on. Hold a key to increase its mode’s strength and sound power.' : 'Enable sound to hear the musical notes behind the modes.')
    : (synth.enabled ? 'Sine tones are on. Hold a key to increase its light and sound power.' : 'Enable sound to hear the same prime-weighted spectrum as sine tones.');
}
function renderSongControls() {
  const time = beats => {
    const seconds = Math.floor(beats / player.beatsPerSecond);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  $('song-play').textContent = songPending ? 'Starting…' : player.state === 'playing' ? 'Ⅱ Pause' : player.state === 'paused' ? '▶ Resume' : player.state === 'ended' ? '↻ Play again' : '▶ Play song';
  $('song-play').disabled = songPending;
  $('song-stop').disabled = player.state === 'idle' && !songPending;
  $('song-progress').max = player.song.beats;
  $('song-progress').value = player.beat;
  $('song-time').textContent = `${time(player.beat)} / ${time(player.song.beats)}`;
  $('song-status').textContent = player.state === 'playing' ? `Playing · ${player.positionLabel}` : player.state === 'paused' ? 'Paused · press Resume to continue' : player.state === 'ended' ? 'Finished · play it again or try the keys' : 'Play to hear the song and watch its spectrum';
}
function renderSongSelection() {
  $('song-select').value = player.song.id;
  $('song-name').textContent = player.song.title;
  $('song-composer').textContent = player.song.composer;
  $('song-description').textContent = player.song.description;
  $('song-source').href = player.song.source;
  for (const option of $('song-tempo').options) {
    const rate = Number(option.value);
    option.textContent = `${Math.round(player.song.bpm * rate)} BPM`;
  }
  renderSongControls();
}
function stopSong() {
  playRequest++;
  songPending = false;
  player.stop(); synth.stopSequence(); renderSongControls();
}
function takeOver() {
  if (player.state !== 'idle' || songPending) {
    stopSong(); instrument.clear();
  }
}
function pauseSong() {
  if (songPending) { stopSong(); return; }
  if (player.state !== 'playing') return;
  player.pause(synth.context.currentTime);
  synth.stopSequence(); renderSongControls(); render();
}
function scheduleSong() {
  const startAt = synth.context.currentTime + .03;
  player.play(startAt);
  synth.scheduleSequence(songFrames(player.song, player.beat), startAt, player.beatsPerSecond);
  renderSongControls(); render();
}
async function playSong() {
  if (songPending || soundPending) return;
  if (player.state === 'playing') { pauseSong(); return; }
  const request = ++playRequest;
  songPending = true; renderSongControls();
  try {
    await synth.enable();
    refreshSoundControls();
    if (request !== playRequest || document.hidden) return;
    instrument.clear(); instrument.setSustain(false);
    $('form-message').textContent = ''; $('app-message').textContent = '';
    scheduleSong();
  } catch (error) {
    if (request === playRequest) $('app-message').textContent = `Song could not start: ${error.message}`;
  } finally {
    if (request === playRequest) { songPending = false; renderSongControls(); }
  }
}
function typingTarget(target) {
  if (!(target instanceof Element)) return false;
  if (target.closest('textarea, select, [contenteditable="true"]')) return true;
  const input = target.closest('input');
  return Boolean(input && !['range', 'checkbox', 'radio', 'button', 'submit'].includes(input.type));
}

function bindInputs() {
  $('view-cube').addEventListener('click', () => selectView('cube'));
  $('view-light').addEventListener('click', () => selectView('light'));
  $('view-modes').addEventListener('click', () => selectView('modes'));
  $('mode-select').addEventListener('change', event => {
    if (event.target.value === '') return;
    takeOver();
    const exponents = KEYS.map(() => 0); exponents[Number(event.target.value)] = 1;
    instrument.load(exponents); $('form-message').textContent = ''; render();
  });
  $('mode-pause').addEventListener('click', () => {
    cubeView.setPaused(!cubeView.paused); refreshMotionControl();
  });
  $('mode-reset').addEventListener('click', () => cubeView.resetCamera());
  $('mode-save').addEventListener('click', () => cubeView.saveImage(currentNumber));
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
  const stop = () => {
    pointers.clear(); pauseSong(); instrument.clear(); synth.stop(); render();
  };
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  $('plate-readout').addEventListener('change', () => { render(); $('keyboard').focus({ preventScroll: true }); });
  $('plate-motion').addEventListener('click', () => { animatePlate = !animatePlate; render(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { if (event.matches) { animatePlate = false; render(); } });
  const modalPresets = { single: [[8,2]], pair: [[4,2],[8,2]], chord: [[4,2],[8,2],[13,2]] };
  document.querySelectorAll('[data-plate-preset]').forEach(button => button.addEventListener('click', () => {
    takeOver(); const weights = KEYS.map(() => 0);
    for (const [i,e] of modalPresets[button.dataset.platePreset]) weights[i] = e;
    instrument.load(weights); $('form-message').textContent = ''; render();
  }));
  $('clear').addEventListener('click', clear);
  $('sustain').addEventListener('click', toggleSustain);
  $('sound').addEventListener('click', async () => {
    if (soundPending || songPending) return;
    soundPending = true;
    try {
      if (synth.enabled) { pauseSong(); synth.disable(); } else await synth.enable();
      refreshSoundControls();
      $('app-message').textContent = '';
      render();
      $('keyboard').focus({ preventScroll: true });
    } catch (error) { $('app-message').textContent = `Sound could not start: ${error.message}`; }
    finally { soundPending = false; }
  });
  $('song-play').addEventListener('click', playSong);
  $('song-select').addEventListener('change', event => {
    const song = SONGS.find(song => song.id === event.target.value);
    if (!song) return;
    stopSong(); instrument.clear();
    player.selectSong(song);
    $('app-message').textContent = '';
    renderSongSelection(); render();
  });
  $('song-stop').addEventListener('click', clear);
  $('song-restart').addEventListener('click', () => { clear(); playSong(); });
  $('song-tempo').addEventListener('change', event => {
    const playing = player.state === 'playing';
    const now = synth.context?.currentTime || 0;
    player.setRate(Number(event.target.value), now);
    if (playing && player.state === 'playing') scheduleSong();
    else { renderSongControls(); render(); }
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
  for (const id of ['copy', 'plate-copy']) {
    const button = $(id);
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentNumber);
        button.textContent = 'Copied ✓';
        clearTimeout(copyTimers.get(button));
        copyTimers.set(button, setTimeout(() => { button.textContent = 'Copy number ↗'; }, 1800));
      } catch { $('app-message').textContent = 'Copy is unavailable in this browser. Select the number on the screen to copy it.'; }
    });
  }
  const nearest = nm => KEYS.reduce((best, key) => Math.abs(key.wavelength - nm) < Math.abs(KEYS[best].wavelength - nm) ? key.index : best, 0);
  const presets = {
    ember: [[nearest(630), 3], [nearest(580), 1]],
    violet: [[nearest(630), 3], [nearest(450), 1]],
    daylight: KEYS.map(key => [key.index, 1]),
  };
  document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
    takeOver();
    const exponents = KEYS.map(() => 0);
    for (const [i, e] of presets[button.dataset.preset]) exponents[i] = e;
    instrument.load(exponents); $('form-message').textContent = ''; render();
  }));
  $('number-form').addEventListener('submit', event => {
    event.preventDefault();
    try {
      const exponents = decodeProduct($('number-input').value);
      takeOver();
      instrument.load(exponents); render();
      $('form-message').textContent = currentNumber === '1' ? '1 is the empty product: no spectral lines, no light.' : 'Number loaded. Sustain is on; play more keys to add to it.';
      $('number-input').removeAttribute('aria-invalid');
    } catch (error) { $('form-message').textContent = error.message; $('number-input').setAttribute('aria-invalid', 'true'); }
  });
  // Discrete real-time steps, independent of browser/OS key-repeat settings.
  setInterval(() => { if (instrument.tick(performance.now())) render(); }, 25);
  let lastSongSpectrum = '';
  const animateSong = timestamp => {
    if (player.state === 'playing') {
      player.update(synth.context.currentTime);
      const spectrum = songSpectrum(player.song, player.beat).join(',');
      if (spectrum !== lastSongSpectrum || player.state === 'ended') {
        lastSongSpectrum = spectrum; render();
      }
      renderSongControls();
    }
    plateDisplay?.tick(timestamp, visualization === 'modes' && animatePlate && player.state !== 'paused' && !document.hidden);
    if (cubeView) {
      cubeView.transportPaused = player.state === 'paused';
      cubeView.tick(timestamp);
    }
    requestAnimationFrame(animateSong);
  };
  requestAnimationFrame(animateSong);
}

async function start() {
  try {
    const response = await fetch(new URL('./data/CIE_xyz_1931_2deg.csv', import.meta.url));
    if (!response.ok) throw new Error(`Color data request returned ${response.status}.`);
    rows = parseCMF(await response.text());
    makeKeyboard(); makeSpectrum();
    for (const song of SONGS) {
      const option = document.createElement('option');
      option.value = song.id; option.textContent = `${song.title} — ${song.composer}`;
      $('song-select').append(option);
    }
    bindInputs();
    document.querySelectorAll('button[disabled]:not([data-mode-control])').forEach(button => { button.disabled = false; });
    $('song-tempo').disabled = false; $('song-select').disabled = false; renderSongSelection();
    $('status-dot').classList.add('ready'); $('app-message').textContent = ''; render();
    startModes();
  } catch (error) {
    $('status').textContent = 'COULD NOT LOAD';
    $('app-message').textContent = `Primeboard could not start: ${error.message} Please reload to try again.`;
  }
}
start();
