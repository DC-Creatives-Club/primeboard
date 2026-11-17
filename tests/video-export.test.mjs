import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoExport, videoMime, videoExtension } from '../web/video-export.js';

test('video format selects supported MP4 or WebM and rejects missing recorder', () => {
  assert.equal(videoMime({isTypeSupported: t => t === 'video/mp4'}), 'video/mp4');
  assert.equal(videoMime({isTypeSupported: t => t === 'video/webm'}), 'video/webm');
  assert.equal(videoExtension('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(videoExtension('video/webm'), 'webm');
  assert.throws(() => videoMime(null), /not supported/);
});

test('export combines video and audio, releases tracks, and suppresses cancelled output', () => {
  const original=globalThis.MediaRecorder;
  class Recorder {
    static isTypeSupported(t) { return t === 'video/webm'; }
    constructor(stream, options) { this.mimeType=options.mimeType; this.stream=stream; }
    start() { this.state='recording'; }
    stop() { this.state='inactive'; this.ondataavailable({data:new Blob(['encoded'])}); this.onstop(); }
  }
  globalThis.MediaRecorder=Recorder;
  try {
    let stopped=0, disconnected=0, completed=0;
    const track=()=>({stop(){stopped++;}});
    const audio={stream:{getAudioTracks:()=>[track()]}};
    const node={context:{createMediaStreamDestination:()=>audio},connect(dest){assert.equal(dest,audio);},disconnect(dest){assert.equal(dest,audio);disconnected++;}};
    const canvas={captureStream(){const tracks=[track()];return {addTrack:t=>tracks.push(t),getTracks:()=>tracks};}};
    const complete=blob=>{completed++;assert.equal(blob.type,'video/webm');assert.equal(blob.size,7);};
    new VideoExport(canvas,node,complete,assert.fail).stop();
    assert.equal(completed,1);assert.equal(stopped,2);assert.equal(disconnected,1);
    new VideoExport(canvas,node,complete,assert.fail).stop(true);
    assert.equal(completed,1);assert.equal(stopped,4);
  } finally { globalThis.MediaRecorder=original; }
});
