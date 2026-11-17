import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODES, modeShape, modeGradient, meanSquaredDisplacement } from '../web/plate-modes.js';
import { ModeDisplay } from '../web/plate-display.js';
import { parseCMF } from '../web/color.js';

const close = (a,b,tolerance=1e-9) => assert.ok(Math.abs(a-b)<tolerance, `${a} != ${b}`);
test('26 restored plate modes are orthonormal and satisfy simply supported boundaries', () => {
  assert.equal(MODES.length,26);
  const grid=32;
  const values=MODES.map(mode=>Array.from({length:grid*grid},(_,i)=>modeShape(mode, (i%grid+.5)/grid,(Math.floor(i/grid)+.5)/grid)));
  MODES.forEach((mode,i)=>{
    for (const t of [.1,.37,.69,.92]) {
      for (const [x,y] of [[0,t],[1,t],[t,0],[t,1]]) close(modeShape(mode,x,y),0);
    }
    for(let j=0;j<=i;j++) close(values[i].reduce((sum,v,k)=>sum+v*values[j][k],0)/grid**2, i===j?1:0);
    const x=.28,y=.41,h=2e-5,center=modeShape(mode,x,y);
    const laplacian=(modeShape(mode,x+h,y)+modeShape(mode,x-h,y)+modeShape(mode,x,y+h)+modeShape(mode,x,y-h)-4*center)/h**2;
    close(laplacian,-(Math.PI**2)*mode.eigenvalue*center,2e-4);
  });
});

test('restored plate gradients and strength follow the normalized displacement field',()=>{
  for(const mode of MODES) {
    const x=.23,y=.61,h=1e-6,g=modeGradient(mode,x,y);
    close(g[0],(modeShape(mode,x+h,y)-modeShape(mode,x-h,y))/(2*h),1e-7);
    close(g[1],(modeShape(mode,x,y+h)-modeShape(mode,x,y-h))/(2*h),1e-7);
  }
  const e=Array(26).fill(0); e[4]=2;e[8]=2;e[13]=2;
  let integral=0;
  for(let x=0;x<32;x++)for(let y=0;y<32;y++) integral+=meanSquaredDisplacement(e,(x+.5)/32,(y+.5)/32)/1024;
  close(integral,3);
});

test('all three plate readouts render, share weights, freeze, and clear',()=>{
  const canvas={width:32,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}}),setAttribute:()=>{}};
  const rows=parseCMF(readFileSync(new URL('../web/data/CIE_xyz_1931_2deg.csv',import.meta.url),'utf8'));
  const display=new ModeDisplay(canvas,rows), e=Array(26).fill(0);e[8]=2;e[13]=2;
  const images=[];
  for(const readout of ['nodes','strength','field']) {
    display.setState(e,readout,1);
    display.bank.advance(.12); display.draw();
    const image=[...display.image.data];
    assert.ok(image.some((v,i)=>i%4!==3 && v>0));
    images.push(image);
  }
  assert.notDeepEqual(images[0],images[1]);assert.notDeepEqual(images[1],images[2]);
  display.tick(0,true);display.tick(100,true);const time=display.time;
  assert.ok(time>0);display.tick(200,false);assert.equal(display.time,time);
  e.fill(0);display.reset();display.setState(e,'nodes',1);
  assert.ok([...display.image.data].every((v,i)=>v===(i%4===3?255:0)));
});
