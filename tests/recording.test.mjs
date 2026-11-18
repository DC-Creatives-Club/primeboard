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

test('version 2 preserves all 32 inputs, initial rests, continuous levels and final silence', () => {
 const recorder = new PerformanceRecorder(32), weights = Array(32).fill(0);
 recorder.start(0); weights[30] = 1; weights[31] = 1;
 recorder.capture(500, weights, weights.map(value => value * 1.375));
 const take = recorder.finish(1500);
 assert.equal(take.version, 2);
 assert.deepEqual(validateRecording(JSON.parse(JSON.stringify(take))), take);
 const song = recordingSong(take);
 assert.deepEqual(songSpectrum(song, .25), Array(32).fill(0));
 assert.deepEqual(songSpectrum(song, .75), weights);
 assert.equal(songSpectrum(song, .75, true)[31], 1.375);
 assert.deepEqual(songSpectrum(song, 1.5), Array(32).fill(0));
 assert.equal(songFrames(song, .25)[0].exponents.length, 32);
 const mixed = structuredClone(take); mixed.frames[1].levels.pop();
 assert.throws(() => validateRecording(mixed), /weights/);
 assert.throws(() => validateRecording({ ...take, version: 1 }), /weights/);
 assert.throws(() => new PerformanceRecorder(31), /26 or 32/);
 recorder.start(0); assert.throws(() => recorder.capture(0, zero(), zero()), /count mismatch/);
});
