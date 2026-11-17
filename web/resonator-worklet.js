import { Resonator } from './resonator.js';

class ResonatorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.events = [];
    this.port.onmessage = ({ data }) => {
      if (data.type === 'configure') { this.bank = new Resonator(data.spec); this.interaction = data.interaction; this.events = []; }
      if (data.type === 'weights') this.bank?.setWeights(data.weights, this.interaction);
      if (data.type === 'reset') { this.bank?.reset(); this.events = []; }
      if (data.type === 'sequence') { this.bank?.reset(); this.events = data.events; }
    };
  }
  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!this.bank) return true;
    if (!this.events.length && !this.bank.drive.some(Boolean) && this.bank.energy < 1e-14) { output.fill(0); return true; }
    for (let n = 0; n < output.length; n++) {
      const time = currentTime + n / sampleRate;
      while (this.events.length && this.events[0].time <= time) {
        this.bank.setWeights(this.events.shift().weights, this.interaction);
      }
      this.bank.advance(1 / sampleRate);
      output[n] = this.bank.sample();
    }
    return true;
  }
}
registerProcessor('primeboard-resonator', ResonatorProcessor);
