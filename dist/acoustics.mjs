// Sample-clock analysis. Filter edges are -3 dB design frequencies, not brick walls.
export const EMPTY_FEATURES = () => ({ rms: 0, low: 0, high: 0, band: 0, envelope: 0, modulation: 0, ipi: null, pulseCount: 0, time: 0 });

class Biquad {
  constructor(rate, frequency, highpass = false) {
    const w = 2 * Math.PI * frequency / rate, c = Math.cos(w), a = Math.sin(w) / Math.SQRT2;
    const b = highpass ? (1 + c) / 2 : (1 - c) / 2;
    this.b0 = b / (1 + a); this.b1 = (highpass ? -2 : 2) * b / (1 + a); this.b2 = this.b0;
    this.a1 = -2 * c / (1 + a); this.a2 = (1 - a) / (1 + a);
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
  }
  tick(x) {
    const y = this.b0*x + this.b1*this.x1 + this.b2*this.x2 - this.a1*this.y1 - this.a2*this.y2;
    this.x2=this.x1; this.x1=x; this.y2=this.y1; this.y1=y;
    return y;
  }
}

export class AcousticAnalysis {
  constructor(rate) {
    this.rate=rate; this.frameSize=Math.round(rate*.01); this.samples=0; this.frame=0;
    this.lowFilters=[new Biquad(rate,100,true),new Biquad(rate,180)];
    this.highFilters=[new Biquad(rate,180,true),new Biquad(rate,300)];
    this.bandFilters=[new Biquad(rate,100,true),new Biquad(rate,300)];
    this.fast=0; this.slow=0; this.armed=true; this.lastPulse=-10; this.intervals=[]; this.pulses=[];
    this.history=[]; this.sums=[0,0,0,0];
    this.fastK=1-Math.exp(-1/(rate*.002)); this.slowK=1-Math.exp(-1/(rate*.055));
  }
  tick(x) {
    const low=this.lowFilters[1].tick(this.lowFilters[0].tick(x));
    const high=this.highFilters[1].tick(this.highFilters[0].tick(x));
    const band=this.bandFilters[1].tick(this.bandFilters[0].tick(x));
    const rect=Math.abs(band), time=this.samples/this.rate;
    this.fast+=this.fastK*(rect-this.fast); this.slow+=this.slowK*(rect-this.slow);
    if (this.fast < this.slow*1.1) this.armed=true;
    if(this.armed && this.fast>Math.max(.001,this.slow*1.65) && time-this.lastPulse>.012) {
      const interval=time-this.lastPulse;
      if(interval>=.012 && interval<=.25) this.intervals.push({time,ms:interval*1000});
      this.lastPulse=time; this.pulses.push(time); this.armed=false;
    }
    this.sums[0]+=x*x; this.sums[1]+=low*low; this.sums[2]+=high*high; this.sums[3]+=band*band;
    this.samples++; this.frame++;
    if(this.frame<this.frameSize) return null;
    const levels=this.sums.map(v=>Math.sqrt(v/this.frame));
    this.frame=0; this.sums.fill(0);
    this.history.push(levels[3]); if(this.history.length>50) this.history.shift();
    this.intervals=this.intervals.filter(v=>time-v.time<.5).slice(-12);
    this.pulses=this.pulses.filter(v=>time-v<.5);
    const mean=this.history.reduce((a,b)=>a+b,0)/this.history.length;
    const variation=Math.sqrt(this.history.reduce((s,v)=>s+(v-mean)**2,0)/this.history.length);
    const sorted=this.intervals.map(v=>v.ms).sort((a,b)=>a-b);
    const ipi=time-this.lastPulse<.3 && sorted.length>=3 ? sorted[Math.floor(sorted.length/2)] : null;
    return {rms:levels[0],low:levels[1],high:levels[2],band:levels[3],envelope:this.fast,
      modulation:mean>.0005?Math.min(1,variation/mean):0,ipi,pulseCount:this.pulses.length,time};
  }
}
