export function videoMime(Recorder = globalThis.MediaRecorder) {
  if (!Recorder) throw new Error('Video export is not supported in this browser.');
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>Recorder.isTypeSupported(type)) || '';
}
export function videoExtension(type) { return type.includes('mp4') ? 'mp4' : 'webm'; }
export class VideoExport {
  constructor(canvas, audioNode, onComplete, onError) {
    const mimeType=videoMime();
    if (!canvas.captureStream) throw new Error('Canvas video export is not supported in this browser.');
    this.audioNode=audioNode;
    this.audio=audioNode.context.createMediaStreamDestination();
    this.stream=canvas.captureStream(30);
    for(const track of this.audio.stream.getAudioTracks())this.stream.addTrack(track);
    try {
      this.recorder=new MediaRecorder(this.stream,{...(mimeType?{mimeType}:{}),videoBitsPerSecond:4000000});
      this.chunks=[];
      this.recorder.ondataavailable=event=>{if(event.data.size)this.chunks.push(event.data);};
      this.recorder.onerror=()=>{this.cancelled=true;this.cleanup();onError(new Error('Video encoding failed. Your recording is still saved.'));};
      this.recorder.onstop=()=>{
        this.cleanup();
        if(!this.cancelled)onComplete(new Blob(this.chunks,{type:this.recorder.mimeType || mimeType}));
      };
      audioNode.connect(this.audio);
      this.recorder.start(1000);
    } catch(error) {this.cleanup();throw error;}
  }
  stop(cancelled=false) {this.cancelled=cancelled;if(this.recorder.state!=='inactive')this.recorder.stop();else this.cleanup();}
  cleanup() {try{this.audioNode.disconnect(this.audio);}catch{} for(const track of this.stream.getTracks())track.stop();}
}
