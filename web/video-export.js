import { EXPORT_FPS, EXPORT_SAMPLE_RATE, ExportClock, videoFrameTimes } from './export-timeline.js';
import { renderExportAudio } from './export-audio.js';

export function videoExtension(type) { return type.includes('mp4') ? 'mp4' : 'webm'; }

export async function selectVideoFormat(media, width = 960, height = 720) {
  const video = { width, height, frameRate: EXPORT_FPS, quality: new media.Quality({ bitrate: 4_000_000 }) };
  const audio = { sampleRate: EXPORT_SAMPLE_RATE, numberOfChannels: 1, quality: new media.Quality({ bitrate: 128_000 }) };
  for (const [videoCodec, audioCodec, container, mime] of [
    ['avc', 'aac', 'Mp4OutputFormat', 'video/mp4'],
    ['vp9', 'opus', 'WebMOutputFormat', 'video/webm'],
    ['vp8', 'opus', 'WebMOutputFormat', 'video/webm'],
  ]) {
    const supported = await Promise.all([media.canEncodeVideo(videoCodec, video), media.canEncodeAudio(audioCodec, audio)]);
    if (supported.every(Boolean)) return { video: { ...video, codec: videoCodec }, audio: { ...audio, codec: audioCodec }, container, mime };
  }
  throw new Error('Offline video encoding is unavailable in this browser. Try a current Chrome, Edge, or Safari browser.');
}

export class VideoExport {
  constructor() { this.controller = new AbortController(); }
  cancel() { this.controller.abort(); }
  async run({ timeline, audioSettings, createRenderer, onProgress = () => {} }, dependencies = {}) {
    const signal = this.controller.signal;
    let renderer, output;
    const yieldUI = dependencies.yieldUI || (() => new Promise(resolve => setTimeout(resolve, 0)));
    try {
      signal.throwIfAborted();
      const media = dependencies.media || await import('./vendor/mediabunny.js');
      const format = await selectVideoFormat(media);
      signal.throwIfAborted();
      renderer = createRenderer();
      let audio = await (dependencies.renderAudio || renderExportAudio)(timeline, audioSettings, signal,
        progress => onProgress('Rendering audio', progress * .3));
      signal.throwIfAborted();
      output = new media.Output({ format: new media[format.container](), target: new media.BufferTarget() });
      const videoSource = new media.CanvasSource(renderer.canvas, { ...format.video, keyFrameInterval: 2 });
      const audioSource = new media.AudioBufferSource(format.audio);
      output.addVideoTrack(videoSource, { frameRate: EXPORT_FPS }); output.addAudioTrack(audioSource);
      await output.start();
      onProgress('Encoding audio', .3);
      await audioSource.add(audio); audioSource.close();
      audio = null; // Release uncompressed PCM before the video buffer grows.
      const clock = new ExportClock(timeline.frames, renderer), frames = videoFrameTimes(timeline.duration);
      let lastYield = -Infinity;
      for (let i = 0; i < frames.length; i++) {
        signal.throwIfAborted();
        const frame = frames[i];
        clock.advanceTo(frame.time); renderer.draw();
        await videoSource.add(frame.time, frame.duration);
        // Backpressure bounds the encoder queue; explicit yields keep Cancel
        // responsive even when encoder promises resolve immediately.
        if (performance.now() - lastYield >= 40) {
          onProgress('Rendering video', .35 + .6 * (i + 1) / frames.length);
          await yieldUI(); lastYield = performance.now();
        }
      }
      signal.throwIfAborted(); videoSource.close();
      onProgress('Finishing video', .97); await yieldUI();
      await output.finalize(); signal.throwIfAborted();
      const blob = new Blob([output.target.buffer], { type: format.mime });
      onProgress('Video ready', 1);
      return blob;
    } finally {
      try { if (output && output.state !== 'finalized') await output.cancel(); }
      finally { renderer?.dispose(); }
    }
  }
}
