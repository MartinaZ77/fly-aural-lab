import {AcousticAnalysis} from './acoustics.mjs';
class FlyAcoustics extends AudioWorkletProcessor {
  constructor() { super(); this.analysis=new AcousticAnalysis(sampleRate); }
  process(inputs,outputs) {
    const channels=inputs[0]; const frames=outputs[0][0].length;
    for(let i=0;i<frames;i++) {
      let sample=0;
      for(const channel of channels) sample+=(channel[i]||0)/channels.length;
      const features=this.analysis.tick(sample);
      if(features) this.port.postMessage(features);
    }
    // No monitoring output: local playback uses its own path; capture never echoes.
    return true;
  }
}
registerProcessor('fly-acoustics',FlyAcoustics);
