import { VideoExport, videoExtension } from './video-export.js';
import { PerformanceRecorder, RECORDING_KEY, MAX_SECONDS, validateRecording, recordingSong } from './recording.js';
import { loweredPitch } from './pitch.js';
import { updateSongButton } from './song-controls.js';
import { FUNDAMENTAL_HZ } from './resonator.js';
import { KEYS, ROWS, MAX_EXPONENT, parseCMF, matchingAt, spectrumXYZ, primeProduct, displayColor, chromaticity } from './color.js';
import { Instrument } from './instrument.js';
import { Synth } from './audio.js';
import { SONGS, SongPlayer, songSpectrum, songFrames } from './song.js';
import { MODES } from './plate-modes.js';
import { ModeDisplay } from './plate-display.js';
import { CubeView } from './cube-view.js';

const $ = id => document.getElementById(id);
const instrument = new Instrument();
const synth = new Synth();
// Sound is opted in initially; create/resume Web Audio during a user gesture.
synth.enabled = true;
const player = new SongPlayer(SONGS[0]);
const recorder = new PerformanceRecorder();
let savedRecording = null;
let recordingNotice = '';
let videoExport = null, exportPending = false, exportCanvas, exportUntil = 0;
let exportURL = null;
try { const raw=localStorage.getItem(RECORDING_KEY); if(raw) savedRecording=validateRecording(JSON.parse(raw)); }
catch { recordingNotice='Saved recording could not be read. You can make a new take.'; }
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
let spherePitchOctaves = 0;
const sphereElastic = () => visualization === 'sphere' && cubeView?.model === 'elastic';
const surfaceView = view => view === 'cube' || view === 'sphere';
let plateDisplay;
const interaction = 'strike';
let animatePlate = !matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      button.innerHTML = `<span class="key-letter">${letter}</span><span class="key-prime">${key.prime}</span><span class="key-note">${key.note}</span><span class="key-frequency"></span><span class="key-exponent"></span>`;
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

function keyPitch(i) {
  if (visualization === 'light') return KEYS[i].note;
  const spec = visualization === 'modes' ? plateDisplay?.spec : cubeView?.spec;
  return spec ? `${((spec.fundamentalHz ?? FUNDAMENTAL_HZ) * spec.ratios[i]).toFixed(0)} Hz` : 'loading';
}
function configureResonator() {
  const spec = visualization === 'light' ? null : visualization === 'modes' ? plateDisplay?.spec : cubeView?.spec;
  const audioSpec = loweredPitch(spec || null, sphereElastic() ? spherePitchOctaves : 0);
  const changed = synth.setModel(audioSpec, interaction);
  $('sphere-pitch-control').hidden = !sphereElastic();
  $('hold-speed').closest('label').hidden = visualization !== 'light';
  if (changed && player.state === 'playing') {
    player.update(synth.context.currentTime);
    if (player.state === 'playing') scheduleSong();
  }
}
const surfaceModeLabel = i => 'φ' + String(i + 1).replace(/[0-9]/g, digit => '₀₁₂₃₄₅₆₇₈₉'[Number(digit)]);
function keyModeLabel(i) {
  return visualization === 'modes' ? plateDisplay.modeLabel(i) : (cubeView?.data?.metadata.labels?.[i] || surfaceModeLabel(i));
}
function updateKeyboardLabels() {
  const modal = visualization !== 'light';
  $('keyboard').classList.toggle('plate-keys', modal);
  $('keyboard').classList.toggle('cube-keys', surfaceView(visualization));
  $('keyboard').setAttribute('aria-label', modal ? '26 eigenmodes. Type the matching QWERTY letters to play.' : '26 primes. Type the matching QWERTY letters to play.');
  keyButtons.forEach((button, i) => {
    const key = KEYS[i], label = keyModeLabel(i);
    button.querySelector('.key-prime').textContent = modal ? label : key.prime;
    const eigenvalue = surfaceView(visualization) ? cubeView?.data?.eigenvalues[i] : null;
    const detail = eigenvalue ? `λ = ${(cubeView.model === 'scalar' ? eigenvalue.toFixed(3) : eigenvalue.toExponential(2).replace('e+', 'e'))}` : keyPitch(i);
    button.querySelector('.key-note').textContent = detail;
    button.querySelector('.key-frequency').textContent = surfaceView(visualization) ? keyPitch(i) : '';
    button.setAttribute('aria-label', modal ? `${key.letter}: mode ${label}, ${detail}, ${keyPitch(i)}` : `${key.letter}: prime ${key.prime}, ${key.note}`);
    button.title = modal ? `${key.letter} · mode ${label} · ${detail} · ${keyPitch(i)}` : `${key.letter} · prime ${key.prime} · ${key.note}`;
    if (sphereElastic() && spherePitchOctaves) {
      const audible = cubeView.spec.fundamentalHz * cubeView.spec.ratios[i] / 2 ** spherePitchOctaves;
      const description = `${button.title} natural · audio ${audible.toFixed(0)} Hz`;
      button.title = description; button.setAttribute('aria-label', description);
    }
  });
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
  const modal = inSong ? songSpectrum(player.song, player.beat, true) : instrument.levels;
  recorder.capture(performance.now(), instrument.exponents, instrument.levels);
  const shown = visualization === 'light' ? e : modal;
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
  shown.forEach((value, i) => {
    const button = keyButtons[i];
    button.classList.toggle('active', value > 0);
    button.setAttribute('aria-pressed', String(value > 0));
    button.querySelector('.key-exponent').textContent = value > 0 ? visualization !== 'light' ? `×${value.toFixed(1)}` : `^${value}` : '';
    spectrumLines[i].setAttribute('opacity', value ? 1 : 0);
    spectrumLines[i].setAttribute('y2', 112 - 96 * value / peak);
  });
  $('spectrum').setAttribute('aria-label', active ? `Relative spectral power, plot maximum ${peak} units: ${e.map((v, i) => v ? `${KEYS[i].frequencyTHz.toFixed(1)} terahertz at ${v} units` : '').filter(Boolean).join('; ')}` : 'No spectral lines active');
  if (visualization === 'modes') renderPlate(modal);
  cubeView?.update(modal);
  if (modesReady) {
    const index = active === 1 ? e.findIndex(Boolean) : -1;
    const summary = index >= 0 ? `${keyModeLabel(index)} · ${keyPitch(index)}` : `${active} active modes`;
    $('cube').setAttribute('aria-label', `${visualization === 'sphere' ? 'Sphere' : 'Rounded cube'}, ${summary}`);
  }
  if (!inSong) synth.sync(visualization === 'light' ? e : modal);
}

function selectView(view) {
  visualization = view;
  if (surfaceView(view) && modesReady && cubeView.shape !== view) cubeView.setModel(cubeView.model, view);
  configureResonator();
  const cube = surfaceView(view), modal = view === 'modes';
  for (const name of ['light', 'modes', 'cube', 'sphere']) $('view-' + name).setAttribute('aria-pressed', String(view === name));
  $('light-screen').classList.toggle('modes-active', cube);
  $('light-screen').hidden = modal; $('spectrum-panel').hidden = view !== 'light';
  $('plate-screen').hidden = !modal;
  $('cube-options').hidden = !cube; $('cube-actions').hidden = !cube; $('plate-options').hidden = !modal; $('plate-actions').hidden = !modal;
  $('modes-view').hidden = !cube;
  $('light-field').hidden = cube;
  $('model-label').textContent = cube ? (cubeView?.model === 'scalar' ? 'SCALAR SURFACE MODES' : (view === 'sphere' ? 'SPHERICAL SHELL MODES' : 'ROUNDED-CUBE SHELL MODES')) : modal ? 'SQUARE-PLATE EIGENMODES' : 'CIE 1931 · 2° OBSERVER';
  $('surface-name').textContent = view === 'sphere' ? 'SPHERE' : 'ROUNDED CUBE';
  $('cube-options').setAttribute('aria-label', view === 'sphere' ? 'Sphere model' : 'Cube model');
  cubeView?.setEnabled(cube);
  updateKeyboardLabels(); refreshSoundControls(); render();
}

const readouts = {
  nodes: { title: 'COLORED NODES', description: 'Each selected eigenmode fades in its own color. Multiple keys overlay their patterns.', legend: 'Each color traces one mode’s nodal lines.' },
  strength: { title: 'VIBRATION STRENGTH', description: 'Squared amplitude of the fading mode mixture, including interference. This is not mechanical energy.', legend: 'Dark: near zero displacement · bright: large displacement' },
  field: { title: 'MODE MIXTURE', description: 'The selected eigenmodes added together, fading quickly after each press.', legend: 'Blue: positive displacement · orange: negative · black: zero' },
};
function renderPlate(e) {
  const readout = $('plate-readout').value;
  const info = readouts[readout];
  $('plate-screen-title').textContent = info.title;
  $('plate-legend').textContent = info.legend;
  $('plate-motion-controls').hidden = readout === 'nodes';
  $('plate-motion').textContent = animatePlate ? 'Freeze motion' : 'Animate';
  $('plate-motion').setAttribute('aria-pressed', String(!animatePlate));
  const active = e.flatMap((weight, i) => weight ? [{ i, weight }] : []);
  $('plate-empty').hidden = readout !== 'nodes' || active.length > 0 || plateDisplay.bank.energy > .0001;
  plateDisplay ??= new ModeDisplay($('plate-canvas'), rows);
  plateDisplay.setState(e, readout, exposure);
}

async function startFreePlate() {
  try {
    await plateDisplay.loadFreePlate();
    $('plate-free').disabled = false;
  } catch (error) { $('app-message').textContent = error.message; }
}
function selectPlateModel(model) {
  plateDisplay.setModel(model);
  const free = model === 'free';
  $('plate-supported').setAttribute('aria-pressed', String(!free));
  $('plate-free').setAttribute('aria-pressed', String(free));
  $('plate-material').textContent = free ? 'FREE ALUMINUM · 1 MM' : 'SIMPLY SUPPORTED';
  configureResonator(); updateKeyboardLabels(); render();
}

async function startModes() {
  const showError = message => {
    $('mode-message').textContent = message;
    document.querySelectorAll('[data-mode-control]').forEach(control => { control.disabled = Boolean(message); });
  };
  try {
    cubeView = new CubeView($('cube'), showError);
    cubeView.setEnabled($('view-cube').getAttribute('aria-pressed') === 'true');
    await cubeView.load();
    modesReady = true; showError('');
    $('view-sphere').disabled = false;
    $('cube-elastic').disabled = false; $('cube-scalar').disabled = false;
    cubeView.setInteraction(interaction);
    configureResonator(); updateKeyboardLabels();
    refreshMotionControl(); render();
  } catch (error) { showError(error.message); }
}
function selectCubeModel(model) {
  if (!modesReady || cubeView.model === model) return;
  cubeView.setModel(model);
  const scalar = model === 'scalar';
  $('cube-elastic').setAttribute('aria-pressed', String(!scalar));
  $('cube-scalar').setAttribute('aria-pressed', String(scalar));
  $('cube-material').textContent = scalar ? 'LAPLACE–BELTRAMI' : 'ALUMINUM · 1 MM SHELL';
  selectView(visualization);
}

function refreshMotionControl() {
  $('mode-pause').setAttribute('aria-pressed', String(cubeView.paused));
  $('mode-pause').textContent = cubeView.paused ? 'Resume motion' : 'Pause motion';
}

function press(index, source) {
  if (!takeOver()) return;
  if (instrument.press(index, source, performance.now())) { render(); }
}
function release(source) { if (instrument.release(source)) render(); }
function clear() { instrument.clear(); plateDisplay?.reset(); cubeView?.reset(); if (player.state !== 'playing') synth.stop(); render(); }
function toggleSustain() { takeOver(); instrument.setSustain(!instrument.sustain); render(); }

function refreshSoundControls() {
  $('sound').setAttribute('aria-pressed', String(synth.enabled));
  $('sound').querySelector('.sound-label').textContent = synth.enabled ? 'Sound on' : 'Enable sound';

}
function renderSongControls() {
  renderRecordingControls();
  const time = beats => {
    const seconds = Math.floor(beats / player.beatsPerSecond);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  if(player.song.id==='recording') {
    updateSongButton($('song-play'),'idle',false);
    $('song-play').disabled=Boolean(recorder.active);
    $('song-stop').disabled=true;
    $('song-tempo').disabled=true;
    $('song-progress').value=0;
    $('song-status').textContent='Choose Play to start the classical selection';
    $('song-time').textContent='';
    return;
  }
  $('song-tempo').disabled=Boolean(recorder.active);
  updateSongButton($('song-play'), player.state, songPending);
  $('song-play').disabled=songPending || Boolean(recorder.active);
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
  // Editing manual weights must not interrupt the song transport.
  if (player.state === 'playing' || player.state === 'paused' || songPending) return false;
  return true;
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
  synth.scheduleSequence(songFrames(player.song, player.beat, visualization !== 'light'), startAt, player.beatsPerSecond);
  renderSongControls(); render();
}
async function playSong() {
  if (player.state === 'playing') { pauseSong(); return; }
  if (songPending || soundPending) return;
  const request = ++playRequest;
  songPending = true; renderSongControls();
  try {
    await synth.enable();
    refreshSoundControls();
    if (request !== playRequest) return;
    instrument.clear(); instrument.setSustain(false);
    $('app-message').textContent = '';
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

function renderRecordingControls() {
  const recordingPlayback = player.song.id === 'recording';
  $('recording-panel').hidden = !savedRecording;
  const label=recorder.active ? '■ Stop recording' : '● Record';
  if($('record').textContent!==label)$('record').textContent=label;
  $('record').setAttribute('aria-pressed',String(Boolean(recorder.active)));
  $('record-clock').hidden=!recorder.active;
  if(recorder.active)$('record-clock').textContent=recordingTime((performance.now()-recorder.started)/1000);
  if(savedRecording)$('recording-info').textContent=`${recordingTime(savedRecording.duration)}`;
  updateSongButton($('recording-play'),recordingPlayback?player.state:'idle',recordingPlayback&&songPending);
  $('recording-play').disabled=recorder.active || (recordingPlayback&&songPending);
  $('recording-stop').disabled=!recordingPlayback || !['playing','paused'].includes(player.state);
  $('recording-discard').disabled=recorder.active;
  $('recording-status').textContent=recordingNotice || (recordingPlayback&&['playing','paused'].includes(player.state)?`${player.state==='playing'?'Playing':'Paused'} · ${recordingTime(player.beat)}`:'Saved in this browser. Export video to share.');
  $('song-select').disabled=recorder.active;
  $('song-restart').disabled=recorder.active;
  const exporting=Boolean(videoExport)||exportPending;
  if(videoExport)$('recording-status').textContent=`Exporting video · ${recordingTime(player.beat)} / ${recordingTime(savedRecording.duration)} — keep this tab visible.`;
  $('recording-export').disabled=Boolean(recorder.active)||exporting;
  $('export-cancel').hidden=!exporting;
  for(const id of ['recording-play','recording-stop','recording-discard','recording-download'])if(exporting)$(id).disabled=true;
  if(!exporting)$('recording-download').disabled=false;
}
function recordingTime(seconds) { const n=Math.floor(seconds);return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; }
function finishRecording() {
  if(!recorder.active)return;
  const take=recorder.finish(performance.now());
  if(take) {
    clearExportDownload();
    savedRecording=take;
    try { localStorage.setItem(RECORDING_KEY,JSON.stringify(take));recordingNotice=''; }
    catch { recordingNotice='Browser storage is unavailable or full. Export or save this take before leaving.'; }
  } else recordingNotice='No notes recorded. Your previous take was kept.';
  clear(); renderSongControls();
}
function downloadRecording() {
  if(!savedRecording)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(savedRecording)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='primeboard-performance.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function clearExportDownload() {
  if(exportURL)URL.revokeObjectURL(exportURL);
  exportURL=null;$('export-result').hidden=true;$('export-result').removeAttribute('href');
}
function exportFrame() {
  if(!exportCanvas)return;
  const ctx=exportCanvas.getContext('2d'),w=exportCanvas.width,h=exportCanvas.height;
  ctx.fillStyle='#101316';ctx.fillRect(0,0,w,h);
  if(visualization==='light') {
    const color=$('color-hex').textContent;
    const gradient=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,h*.55);
    gradient.addColorStop(0,color);gradient.addColorStop(1,'#101316');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='white';ctx.textAlign='center';ctx.font='32px monospace';
    ctx.fillText(currentNumber,w/2,h/2,w-80);
  } else {
    const source=visualization==='modes'?$('plate-canvas'):$('cube');
    if(surfaceView(visualization))cubeView.draw();
    const scale=Math.min((w-48)/source.width,(h-80)/source.height);
    const sw=source.width*scale,sh=source.height*scale;
    ctx.drawImage(source,(w-sw)/2,(h-sh)/2,sw,sh);
  }
  ctx.textAlign='left';ctx.fillStyle='#d6d3b8';ctx.font='16px sans-serif';
  ctx.fillText('primeboard.',24,h-22);
}
function finishVideoExport() {
  videoExport=null;exportPending=false;
  if(cubeView)cubeView.exporting=false;
  document.querySelector('.instrument-settings').inert=false;
  document.querySelector('.below-instrument').inert=false;
  $('keyboard').inert=false;
  stopSong();clear();renderRecordingControls();
}
function cancelVideoExport() {
  if(!videoExport&&!exportPending)return;
  videoExport?.stop(true);
  recordingNotice='Export cancelled. Your recording is still saved.';
  finishVideoExport();
}
async function exportRecordingVideo() {
  if(!savedRecording||recorder.active||videoExport||exportPending)return;
  clearExportDownload();
  exportPending=true;recordingNotice='Preparing video…';renderRecordingControls();
  document.querySelector('.instrument-settings').inert=true;
  document.querySelector('.below-instrument').inert=true;$('keyboard').inert=true;
  try {
    await synth.enable();
    if(!exportPending)return;
    stopSong();instrument.clear();plateDisplay?.reset();cubeView?.reset();
    player.selectSong(recordingSong(savedRecording));player.rate=1;
    exportCanvas=document.createElement('canvas');exportCanvas.width=960;exportCanvas.height=720;
    if(cubeView)cubeView.exporting=true;
    render();exportFrame();
    videoExport=new VideoExport(exportCanvas,synth.master,blob=>{
      if(exportURL)URL.revokeObjectURL(exportURL);
      exportURL=URL.createObjectURL(blob);
      const link=$('export-result');link.href=exportURL;link.download=`primeboard-recording.${videoExtension(blob.type)}`;link.hidden=false;
      link.textContent=`Download video (${videoExtension(blob.type).toUpperCase()})`;
      recordingNotice='Video ready.';finishVideoExport();
    },error=>{recordingNotice=error.message;finishVideoExport();});
    exportPending=false;
    scheduleSong();exportUntil=player.anchor+savedRecording.duration+.6;
    recordingNotice='Exporting video — keep this tab visible.';renderRecordingControls();
  } catch(error) {recordingNotice=`Could not export video: ${error.message}`;finishVideoExport();}
}

function bindInputs() {
  $('recording-export').addEventListener('click',exportRecordingVideo);
  $('export-cancel').addEventListener('click',cancelVideoExport);
  $('record').addEventListener('click',()=>{
    if(recorder.active){finishRecording();return;}
    if(savedRecording && !window.confirm('Replace your saved take? Choose Cancel to export it or save a replay file first.'))return;
    stopSong(); instrument.clear(); instrument.setSustain(false);
    recorder.start(performance.now());recordingNotice='';render();renderSongControls();
  });
  $('recording-download').addEventListener('click',downloadRecording);
  $('recording-play').addEventListener('click',()=>{
    if(!savedRecording||recorder.active)return;
    if(player.song.id!=='recording'){stopSong();player.selectSong(recordingSong(savedRecording));player.rate=1;}
    playSong();
  });
  $('recording-stop').addEventListener('click',()=>{stopSong();clear();});
  $('recording-discard').addEventListener('click',()=>{
    if(!window.confirm('Discard this recording? Export it or save a replay file first if you want to keep it.'))return;
    if(player.song.id==='recording'){stopSong();player.selectSong(SONGS.find(s=>s.id===$('song-select').value)||SONGS[0]);clear();}
    clearExportDownload();
    savedRecording=null;try{localStorage.removeItem(RECORDING_KEY);}catch{}
    recordingNotice='';renderSongControls();
  });
  const unlockSound = async event => {
    if (!event.isTrusted || !synth.enabled || soundPending || songPending
        || synth.context?.state === 'running'
        || event.target.closest?.('#sound, #song-play, #song-restart, #recording-play, #recording-export')) return;
    soundPending = true;
    try {
      await synth.enable();
      render();
    } catch (error) {
      synth.disable(); refreshSoundControls();
      $('app-message').textContent = `Sound could not start: ${error.message}`;
    } finally { soundPending = false; }
  };
  window.addEventListener('pointerdown', unlockSound, true);
  window.addEventListener('keydown', unlockSound, true);
  const revealSection = hash => {
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    const details = target.closest('details');
    if (details) details.open = true;
    return target;
  };
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
    revealSection(link.getAttribute('href'));
  }));
  window.addEventListener('hashchange', () => revealSection(location.hash)?.scrollIntoView());
  if (location.hash) requestAnimationFrame(() => revealSection(location.hash)?.scrollIntoView());
  $('view-cube').addEventListener('click', () => selectView('cube'));
  $('view-sphere').addEventListener('click', () => selectView('sphere'));
  $('sphere-pitch').addEventListener('change', event => {
    spherePitchOctaves = Number(event.target.value);
    configureResonator(); updateKeyboardLabels(); render();
  });
  for (const model of ['elastic', 'scalar']) $('cube-' + model).addEventListener('click', () => selectCubeModel(model));
  $('view-light').addEventListener('click', () => selectView('light'));
  $('view-modes').addEventListener('click', () => selectView('modes'));
  for (const model of ['supported', 'free']) $('plate-' + model).addEventListener('click', () => selectPlateModel(model));
  $('mode-pause').addEventListener('click', () => {
    cubeView.setPaused(!cubeView.paused); refreshMotionControl();
  });
  $('mode-reset').addEventListener('click', () => cubeView.resetCamera());
  $('mode-save').addEventListener('click', () => cubeView.saveImage(currentNumber));
  window.addEventListener('keydown', event => {
    if(videoExport||exportPending)return;
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
    if(document.hidden)cancelVideoExport();
    if(recorder.active)finishRecording();
    pointers.clear(); instrument.clear();
    if (player.state !== 'playing') synth.stop();
    render();
  };
  window.addEventListener('blur', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  $('plate-readout').addEventListener('change', () => { render(); $('keyboard').focus({ preventScroll: true }); });
  $('plate-motion').addEventListener('click', () => { animatePlate = !animatePlate; render(); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { if (event.matches) { animatePlate = false; render(); } });
  const modalPresets = { single: [[8,2]], pair: [[4,2],[8,2]], chord: [[4,2],[8,2],[13,2]] };
  document.querySelectorAll('[data-plate-preset]').forEach(button => button.addEventListener('click', () => {
    if (!takeOver()) return; const weights = KEYS.map(() => 0);
    for (const [i,e] of modalPresets[button.dataset.platePreset]) weights[i] = e;
    instrument.load(weights); render();
  }));
  $('clear').addEventListener('click', clear);
  $('sustain').addEventListener('click', toggleSustain);
  $('sound').addEventListener('click', async () => {
    if (soundPending || songPending) return;
    soundPending = true;
    try {
      if (synth.enabled) synth.disable();
      else {
        await synth.enable();
        if (player.state === 'playing') {
          player.update(synth.context.currentTime);
          if (player.state === 'playing') scheduleSong();
        }
      }
      refreshSoundControls();
      $('app-message').textContent = '';
      render();
      $('keyboard').focus({ preventScroll: true });
    } catch (error) { $('app-message').textContent = `Sound could not start: ${error.message}`; }
    finally { soundPending = false; }
  });
  $('song-play').addEventListener('click', () => {
    if(recorder.active)return;
    if(player.song.id==='recording'){stopSong();player.selectSong(SONGS.find(s=>s.id===$('song-select').value)||SONGS[0]);player.rate=Number($('song-tempo').value);}
    playSong();
  });
  $('song-select').addEventListener('change', event => {
    const song = SONGS.find(song => song.id === event.target.value);
    if (!song) return;
    const wasPlaying = player.state === 'playing';
    stopSong(); instrument.clear();
    player.selectSong(song);
    player.rate=Number($('song-tempo').value);
    if (wasPlaying) playSong();
    $('app-message').textContent = '';
    renderSongSelection(); render();
  });
  $('song-stop').addEventListener('click', () => { stopSong(); clear(); });
  $('song-restart').addEventListener('click', () => { if(recorder.active)return;stopSong();player.selectSong(SONGS.find(s=>s.id===$('song-select').value)||SONGS[0]); player.rate=Number($('song-tempo').value); clear(); playSong(); });
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
  for (const id of ['copy']) {
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
  // Discrete real-time steps, independent of browser/OS key-repeat settings.
  setInterval(() => { if (visualization === 'light' && instrument.tick(performance.now())) render(); }, 25);
  let lastSongSpectrum = '';
  let lastLevelRender = 0;
  const animateSong = timestamp => {
    if(recorder.active) {
      if(timestamp-recorder.started>=MAX_SECONDS*1000)finishRecording();
      else renderRecordingControls();
    }
    const levelsChanged = instrument.tickContinuous(timestamp);
    if (levelsChanged && visualization !== 'light' && timestamp - lastLevelRender >= 1000 / 30) {
      lastLevelRender = timestamp; render();
    }
    if (player.state === 'playing') {
      player.update(synth.context.currentTime);
      const spectrum = songSpectrum(player.song, player.beat, visualization !== 'light').join(',');
      if (spectrum !== lastSongSpectrum || player.state === 'ended') {
        lastSongSpectrum = spectrum; render();
      }
      renderSongControls();
    }
    plateDisplay?.tick(timestamp, visualization === 'modes' && (animatePlate || Boolean(videoExport)) && player.state !== 'paused' && !document.hidden);
    if (cubeView) {
      cubeView.transportPaused = player.state === 'paused';
      cubeView.tick(timestamp);
    }
    if(videoExport) {
      exportFrame();
      if(synth.context.currentTime>=exportUntil)videoExport.stop();
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
    plateDisplay = new ModeDisplay($('plate-canvas'), rows);
    startFreePlate();
    makeKeyboard(); makeSpectrum();
    for (const song of SONGS) {
      const option = document.createElement('option');
      option.value = song.id; option.textContent = `${song.title} — ${song.composer}`;
      $('song-select').append(option);
    }
    bindInputs(); refreshSoundControls();
    document.querySelectorAll('button[disabled]:not([data-mode-control])').forEach(button => { button.disabled = false; });
    $('song-tempo').disabled = false; $('song-select').disabled = false; renderSongSelection();
    renderRecordingControls();
    $('status-dot').classList.add('ready'); $('app-message').textContent = ''; render();
    startModes();
  } catch (error) {
    $('status').textContent = 'COULD NOT LOAD';
    $('app-message').textContent = `Primeboard could not start: ${error.message} Please reload to try again.`;
  }
}
start();
