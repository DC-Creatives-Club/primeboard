export const RECORDING_KEY = 'primeboard.recording.v1';
export const MAX_SECONDS = 600;
const zero = () => Array(26).fill(0);
export class PerformanceRecorder {
  start(now) { this.started = now; this.frames = []; this.active = true; }
  capture(now, exponents, levels) {
    if (!this.active) return;
    const beat = Math.min(MAX_SECONDS, Math.max(0, (now - this.started) / 1000));
    const frame = { beat, exponents: [...exponents], levels: levels.map(v => Math.round(v * 1000) / 1000) };
    const previous = this.frames.at(-1);
    if (!previous || frame.exponents.some((v,i)=>v!==previous.exponents[i]) || frame.levels.some((v,i)=>v!==previous.levels[i])) this.frames.push(frame);
  }
  finish(now) {
    this.active = false;
    const duration = Math.min(MAX_SECONDS, Math.max(.05, (now - this.started) / 1000));
    if (!this.frames.some(f=>f.exponents.some(Boolean)||f.levels.some(Boolean))) return null;
    this.frames.push({beat:duration,exponents:zero(),levels:zero()});
    return { format:'primeboard-performance', version:1, createdAt:new Date().toISOString(), duration, frames:this.frames };
  }
}
export function validateRecording(value) {
  if (value?.format!=='primeboard-performance'||value.version!==1||!Number.isFinite(value.duration)||value.duration<=0||value.duration>MAX_SECONDS||!Array.isArray(value.frames)||!value.frames.length||value.frames.length>50000) throw new Error('Invalid recording.');
  let previous=-1;
  for(const f of value.frames) {
    if(!Number.isFinite(f.beat)||f.beat<previous||f.beat<0||f.beat>value.duration)throw new Error('Invalid recording timing.');
    previous=f.beat;
    for(const name of ['exponents','levels'])if(!Array.isArray(f[name])||f[name].length!==26||f[name].some(v=>!Number.isFinite(v)||v<0||v>32||(name==='exponents'&&!Number.isInteger(v))))throw new Error('Invalid recording weights.');
  }
  const last=value.frames.at(-1);
  if(last.beat!==value.duration||last.exponents.some(Boolean)||last.levels.some(Boolean))throw new Error('Recording must end in silence.');
  return value;
}
export function recordingSong(recording) {
  validateRecording(recording);
  return {id:'recording',title:'Your recording',bpm:60,beats:recording.duration,beatsPerBar:4,frames:recording.frames,notes:[]};
}
