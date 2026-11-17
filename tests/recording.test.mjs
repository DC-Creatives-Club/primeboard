import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceRecorder, validateRecording, recordingSong, MAX_SECONDS } from '../web/recording.js';
import { songSpectrum, songFrames, SongPlayer } from '../web/song.js';
const zero=()=>Array(26).fill(0);
test('recordings preserve integer and continuous weights, rests, and final silence',()=>{
 const recorder=new PerformanceRecorder(), e=zero(),levels=zero();recorder.start(1000);
 recorder.capture(1000,e,levels);e[0]=1;levels[0]=1;recorder.capture(1500,e,levels);
 levels[0]=1.375;recorder.capture(1800,e,levels);recorder.capture(1850,e,levels);
 const take=recorder.finish(2500);assert.equal(take.frames.length,4);
 assert.equal(take.duration,1.5);assert.equal(validateRecording(JSON.parse(JSON.stringify(take))).frames[2].levels[0],1.375);
 const song=recordingSong(take);
 assert.equal(songSpectrum(song,.4)[0],0);assert.equal(songSpectrum(song,.7)[0],1);
 assert.equal(songSpectrum(song,1,true)[0],1.375);assert.equal(songSpectrum(song,1.5,true)[0],0);
 const resumed=songFrames(song,.9,true);assert.equal(resumed[0].beat,.9);assert.equal(resumed[0].exponents[0],1.375);
 assert.ok(resumed.at(-1).exponents.every(v=>v===0));
 const player=new SongPlayer(song);player.play(10);player.pause(10.9);assert.ok(Math.abs(player.beat-.9)<1e-8);player.play(20);player.update(20.2);assert.ok(Math.abs(player.beat-1.1)<1e-8);
});
test('empty takes do not replace recordings and duration is bounded',()=>{
 const r=new PerformanceRecorder();r.start(0);r.capture(0,zero(),zero());assert.equal(r.finish(1000),null);
 r.start(0);const e=zero();e[2]=1;r.capture(0,e,e);assert.equal(r.finish(1e9).duration,MAX_SECONDS);
});
test('corrupt stored recordings are rejected before playback',()=>{
 const r=new PerformanceRecorder();r.start(0);const e=zero();e[1]=1;r.capture(0,e,e);const take=r.finish(1000);
 assert.throws(()=>validateRecording({...take,version:2}));
 assert.throws(()=>validateRecording({...take,duration:Infinity}));
 const bad=structuredClone(take);bad.frames[0].levels[0]=-1;assert.throws(()=>validateRecording(bad));
 const unordered=structuredClone(take);unordered.frames.reverse();assert.throws(()=>validateRecording(unordered));
});
