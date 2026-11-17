import { ModePulse, resonanceSpec } from './resonator.js';
import { decodeModes, mixDynamicSurface } from './modes.js';

const VERTEX = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aField;
uniform vec2 uAngles;
uniform float uAspect;
out vec3 vNormal;
out vec3 vPosition;
out float vField;
vec3 turn(vec3 p) {
  float c=cos(uAngles.x), s=sin(uAngles.x);
  vec3 q=vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
  c=cos(uAngles.y); s=sin(uAngles.y);
  return vec3(q.x,c*q.y-s*q.z,s*q.y+c*q.z);
}
void main() {
  vec3 p=turn(aPosition);
  vNormal=turn(aNormal); vPosition=p; vField=aField.x;
  float z=p.z-4.8;
  gl_Position=vec4(p.x*2.7/uAspect,p.y*2.7,-1.020202*z-.2020202,-z);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vPosition;
in float vField;
uniform float uStrength;
out vec4 color;
void main() {
  vec3 n=normalize(vNormal), eye=normalize(vec3(0.,0.,4.8)-vPosition);
  vec3 light=normalize(vec3(-1.2,1.8,2.4));
  float diffuse=max(dot(n,light),0.);
  float spec=pow(max(dot(n,normalize(light+eye)),0.),55.);
  float rim=pow(1.-max(dot(n,eye),0.),3.);
  float grain=.012*sin(vPosition.y*420.+sin(vPosition.x*36.)*2.);
  vec3 metal=vec3(.19,.22,.24)*(.32+.8*diffuse)+vec3(.7,.74,.72)*spec;
  vec3 polarity=mix(vec3(.055,.25,.31),vec3(.39,.22,.075),smoothstep(-.3,.3,vField));
  metal=mix(metal,metal*.65+polarity*(.35+.5*diffuse),uStrength);
  float width=max(fwidth(vField)*1.35,.014);
  float line=1.-smoothstep(width*.25,width*1.8,abs(vField));
  float halo=exp(-abs(vField)*9.);
  metal+=uStrength*(line*vec3(.94,.87,.62)+halo*vec3(.09,.12,.11));
  metal+=rim*vec3(.12,.23,.25)+grain;
  color=vec4(pow(max(metal,vec3(0.)),vec3(.82)),1.);
}`;

export class CubeView {
  constructor(canvas, onError) {
    this.canvas = canvas; this.onError = onError;
    this.exponents = Array(26).fill(0);
    this.interaction = 'strike';
    this.yaw = -.58; this.pitch = .36; this.seconds = 0;
    this.paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.dirty = true; this.visible = true; this.enabled = true;
    this.observer = new IntersectionObserver(entries => { this.visible = entries[0].isIntersecting; this.dirty = true; });
    this.observer.observe(canvas);
    this.resizeObserver = new ResizeObserver(() => { this.dirty = true; });
    this.resizeObserver.observe(canvas);
    let pointer = null;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault(); canvas.focus({ preventScroll: true });
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (pointer?.id !== event.pointerId) return;
      this.yaw += (event.clientX - pointer.x) * .009;
      this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + (event.clientY - pointer.y) * .009));
      pointer.x = event.clientX; pointer.y = event.clientY; this.dirty = true;
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(event, () => { pointer = null; });
    }
    canvas.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Home') this.resetCamera();
      else {
        this.yaw += event.key === 'ArrowLeft' ? -.12 : event.key === 'ArrowRight' ? .12 : 0;
        this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + (event.key === 'ArrowUp' ? -.12 : event.key === 'ArrowDown' ? .12 : 0)));
        this.dirty = true;
      }
    });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.lost = true;
      this.onError('The 3D view was interrupted. Number view and the keyboard still work.');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      try { this.setup(); this.ready = true; this.lost = false; this.dirty = true; this.onError(''); }
      catch (error) { this.ready = false; this.onError(error.message); }
    });
  }

  async load() {
    this.models = Object.fromEntries(await Promise.all([['cube', 'elastic', 'rounded-shell'], ['cube', 'scalar', 'rounded-cube'], ['sphere', 'elastic', 'sphere-shell'], ['sphere', 'scalar', 'sphere-scalar']].map(async ([shape, model, name]) => {
      const responses = await Promise.all(['bin', 'json'].map(ext => fetch(new URL(`./data/modes/${name}.${ext}`, import.meta.url))));
      if (responses.some(r => !r.ok)) throw new Error('The surface modes could not load. You can still play in Number view.');
      const [buffer, metadata] = await Promise.all([responses[0].arrayBuffer(), responses[1].json()]);
      return [`${shape}:${model}`, decodeModes(buffer, metadata)];
    })));
    this.setModel('elastic');
    this.gl = this.canvas.getContext('webgl2', { alpha: true, antialias: true, preserveDrawingBuffer: true });
    if (!this.gl) throw new Error('This browser cannot show the 3D surface. You can still play in Number view.');
    this.setup(); this.ready = true; this.dirty = true;
    return this.data;
  }

  setModel(model, shape = this.shape || 'cube') {
    this.model = model; this.shape = shape;
    this.data = this.models[`${shape}:${model}`];
    this.spec = resonanceSpec(model === 'elastic' ? this.data.metadata.frequenciesHz : this.data.eigenvalues);
    if (model === 'elastic') this.spec.fundamentalHz = this.data.metadata.frequenciesHz[0];
    this.bank = new ModePulse(this.spec);
    this.bank.setWeights(this.exponents, this.interaction);
    this.field = new Float32Array(this.data.vertexCount * 2);
    if (this.gl) this.setup();
    this.dirty = true;
  }

  setup() {
    const gl = this.gl;
    for (const buffer of this.buffers || []) gl.deleteBuffer(buffer);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);
    this.buffers = [];
    const compile = (type, source) => {
      const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('The 3D surface shader could not start.');
      return shader;
    };
    const program = gl.createProgram();
    const vertex = compile(gl.VERTEX_SHADER, VERTEX), fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('The 3D surface renderer could not start.');
    this.program = program; gl.useProgram(program);
    this.vao = gl.createVertexArray(); gl.bindVertexArray(this.vao);
    const attribute = (name, data, size, dynamic = false) => {
      const buffer = gl.createBuffer(); this.buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
      return buffer;
    };
    attribute('aPosition', this.data.positions, 3); attribute('aNormal', this.data.normals, 3);
    this.fieldBuffer = attribute('aField', this.field, 2, true);
    const indices = gl.createBuffer(); this.buffers.push(indices);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.data.indices, gl.STATIC_DRAW);
    this.uniforms = Object.fromEntries(['uAngles', 'uAspect', 'uStrength'].map(name => [name, gl.getUniformLocation(program, name)]));
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.clearColor(0, 0, 0, 0);
  }

  update(exponents) {
    this.bank?.setWeights(exponents, this.interaction);
    if (this.exponents.some((value, i) => value !== exponents[i])) {
      if (!this.exponents.some(Boolean)) this.seconds = 0;
      this.exponents = [...exponents]; this.dirty = true;
    }
  }
  reset() { this.bank?.reset(); this.dirty = true; }
  setInteraction(value) { this.interaction = value; this.reset(); }
  setEnabled(value) { this.enabled = value; this.dirty = true; }
  resetCamera() { this.yaw = -.58; this.pitch = .36; this.dirty = true; }
  setPaused(value) { this.paused = value; this.dirty = true; }

  tick(milliseconds) {
    const delta = Math.min(.05, Math.max(0, (milliseconds - (this.previousTime ?? milliseconds)) / 1000));
    this.previousTime = milliseconds;
    if (!this.ready || this.lost || !this.enabled || !this.visible || document.hidden) return;
    const active = this.exponents.some(Boolean) || this.bank.energy > 1e-9;
    if (!this.paused && !this.transportPaused && active) { this.seconds += delta; this.bank.advance(delta); this.dirty = true; }
    if (!this.dirty || milliseconds - (this.lastDraw || 0) < 1000 / 60) return;
    this.draw(); this.lastDraw = milliseconds;
  }

  draw() {
    if (!this.ready || this.lost) return;
    const gl = this.gl, canvas = this.canvas;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(canvas.clientWidth * scale), height = Math.round(canvas.clientHeight * scale);
    if (!width || !height) return;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const state = this.paused && this.bank.energy < 1e-12 ? this.bank.preview() : this.bank;
    mixDynamicSurface(this.data, state, this.field);
    gl.useProgram(this.program); gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fieldBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.field);
    gl.uniform2f(this.uniforms.uAngles, this.yaw, this.pitch);
    gl.uniform1f(this.uniforms.uAspect, width / height);
    const power = state.energy;
    gl.uniform1f(this.uniforms.uStrength, 1 - Math.exp(-8 * Math.sqrt(power)));
    gl.drawElements(gl.TRIANGLES, this.data.indices.length, gl.UNSIGNED_INT, 0);
    this.dirty = false;
  }

  saveImage(number) {
    this.draw();
    const image = document.createElement('canvas');
    image.width = this.canvas.width; image.height = this.canvas.height + 76;
    const ctx = image.getContext('2d');
    ctx.fillStyle = '#101316'; ctx.fillRect(0, 0, image.width, image.height);
    ctx.drawImage(this.canvas, 0, 0);
    ctx.fillStyle = '#e6dfa5'; ctx.font = '16px monospace';
    ctx.fillText(`primeboard. / ${this.shape === 'sphere' ? 'sphere' : 'rounded cube'}`,  24, image.height - 43);
    ctx.fillStyle = '#a4adb4'; ctx.font = '12px monospace';
    const room = Math.max(12, Math.floor((image.width - 48) / 7.3));
    const caption = `n = ${number}`;
    ctx.fillText(caption.length > room ? caption.slice(0, room - 1) + '…' : caption, 24, image.height - 21);
    image.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `primeboard-${this.shape}-${number.slice(0,32)}.png`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }
}
