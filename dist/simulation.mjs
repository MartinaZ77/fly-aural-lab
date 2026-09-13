export const PARAMETERS=Object.freeze({dt:.01,tauInput:.05,tauCentral:.1,tauAdaptation:.4,adaptation:.18,coupling:.8});
export function transmitterSign(nt) {
  const name=String(nt||'').toLowerCase();
  if(name.includes('acetylcholine')||name==='ach') return 1;
  if(name.includes('gaba')) return -1;
  return 0; // Receptor-dependent/unknown effects are deliberately not guessed.
}
export class NeuralSimulation {
  constructor(data) {
    this.nodes=data.nodes; this.edges=data.edges;
    this.index=new Map(this.nodes.map((n,i)=>[String(n.id),i]));
    if(this.index.size!==this.nodes.length || this.edges.some(e=>!this.index.has(String(e.source))||!this.index.has(String(e.target))||!Number.isFinite(e.weight)||e.weight<0)) throw new Error('连接组包含无效 ID 或权重');
    this.connections=this.edges.map(e=>({from:this.index.get(String(e.source)),to:this.index.get(String(e.target)),weight:e.weight}));
    this.totals=new Float64Array(this.nodes.length);
    this.connections.forEach(e=>{this.totals[e.to]+=e.weight;});
    this.signs=this.nodes.map(n=>transmitterSign(n.nt));
    this.reset();
  }
  reset() {this.activity=new Float64Array(this.nodes.length);this.adaptation=new Float64Array(this.nodes.length);this.time=0;}
  step(f,gain=1) {
    const p=PARAMETERS, drive=new Float64Array(this.nodes.length);
    for(const e of this.connections) drive[e.to]+=p.coupling*this.signs[e.from]*e.weight/(this.totals[e.to]||1)*this.activity[e.from];
    this.nodes.forEach((n,i)=>{
      let input=0;
      if(n.role==='seed') {
        // Hypothesized subgroup tuning, not a measured transfer function.
        const b=String(n.type).startsWith('JO-B');
        const energy=b?.8*f.low+.2*f.high:.25*f.low+.75*f.high;
        const pulse=f.ipi===null?0:Math.exp(-.5*((f.ipi-35)/15)**2)*f.modulation;
        input=(1-Math.exp(-12*gain*energy))*(b?.8+.2*pulse:1);
      }
      const target=Math.tanh(Math.max(0,input+drive[i]-p.adaptation*this.adaptation[i]));
      const tau=n.role==='seed'?p.tauInput:p.tauCentral;
      this.activity[i]+=(1-Math.exp(-p.dt/tau))*(target-this.activity[i]);
      this.adaptation[i]+=(1-Math.exp(-p.dt/p.tauAdaptation))*(this.activity[i]-this.adaptation[i]);
    });
    this.time+=p.dt;
    return this.activity;
  }
}
