import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AcousticAnalysis,EMPTY_FEATURES} from '../dist/acoustics.mjs';
import {NeuralSimulation} from '../dist/simulation.mjs';

function analyse(rate,fn,seconds=1.5){const dsp=new AcousticAnalysis(rate),out=[];for(let i=0;i<rate*seconds;i++){const f=dsp.tick(fn(i/rate));if(f)out.push(f);}return out;}
for(const rate of [44100,48000]){
  test(`sample clock and silence at ${rate} Hz`,()=>{const f=analyse(rate,()=>0,1);assert.equal(f.length,100);assert.ok(f.every(x=>x.rms===0&&x.ipi===null));});
  test(`equal amplitude tones are frequency selective at ${rate} Hz`,()=>{const a=analyse(rate,t=>.15*Math.sin(2*Math.PI*150*t)),b=analyse(rate,t=>.15*Math.sin(2*Math.PI*600*t));assert.ok(Math.abs(a.at(-1).rms-b.at(-1).rms)<.002);assert.ok(a.at(-1).band>b.at(-1).band*3);assert.ok(a.slice(20).every(f=>f.ipi===null));});
  test(`35 ms and 70 ms pulses remain stable between onsets at ${rate} Hz`,()=>{for(const ipi of [.035,.07]){const f=analyse(rate,t=>{const phase=t%ipi;return phase<.006?.15*Math.sin(2*Math.PI*220*t)*Math.sin(Math.PI*phase/.006)**2:0;});const stable=f.slice(60);assert.ok(stable.every(x=>x.ipi!==null));assert.ok(stable.every(x=>Math.abs(x.ipi-ipi*1000)<3));}});
  test(`IPI expires after audio stops at ${rate} Hz`,()=>{const f=analyse(rate,t=>{const phase=t%.035;return t<1&&phase<.006?.15*Math.sin(2*Math.PI*220*t)*Math.sin(Math.PI*phase/.006)**2:0;},2);assert.equal(f.at(-1).ipi,null);assert.ok(f.at(-1).band<1e-6);});
}
const graph={nodes:[{id:1,type:'JO-B1',role:'seed',nt:'acetylcholine'},{id:2,type:'downstream',role:'downstream',nt:'gaba'},{id:3,type:'target',role:'downstream',nt:'unknown'}],edges:[{source:1,target:2,weight:50},{source:2,target:3,weight:30}]};
test('only observed edges drive downstream neurons; decay and reset',()=>{const sim=new NeuralSimulation(graph),f={...EMPTY_FEATURES(),low:.1,high:.1};for(let i=0;i<200;i++)sim.step(f);assert.ok(sim.activity[0]>.1);assert.ok(sim.activity[1]>.1);assert.equal(sim.activity[2],0);for(let i=0;i<1000;i++)sim.step(EMPTY_FEATURES());assert.ok(sim.activity.every(a=>a<1e-5));sim.reset();assert.equal(sim.time,0);assert.ok(sim.activity.every(a=>a===0));});
test('unknown transmitter does not silently become excitation',()=>{const copy=structuredClone(graph);copy.nodes[0].nt='glutamate';const sim=new NeuralSimulation(copy);for(let i=0;i<200;i++)sim.step({...EMPTY_FEATURES(),low:.1,high:.1});assert.equal(sim.activity[1],0);});
test('invalid graph endpoints are rejected',()=>assert.throws(()=>new NeuralSimulation({...graph,edges:[{source:99,target:2,weight:1}]})));
test('real data IDs, parent pointers, sources and model stability',()=>{const data=JSON.parse(readFileSync(new URL('../dist/assets/auditory-connectome.json',import.meta.url)));const ids=new Set(data.nodes.map(n=>String(n.id)));assert.equal(ids.size,data.nodes.length);for(const n of data.nodes){const pids=new Set(n.skeleton.map(p=>p[0]));assert.equal(pids.size,n.skeleton.length);assert.ok(n.skeleton.every(p=>p.every(Number.isFinite)&&(p[4]===-1||pids.has(p[4]))));}for(const e of data.edges){assert.ok(ids.has(String(e.source))&&ids.has(String(e.target)));assert.ok(e.weight>0&&Number.isInteger(e.weight));}const sim=new NeuralSimulation(data);for(let i=0;i<10000;i++)sim.step({...EMPTY_FEATURES(),low:.2,high:.1,ipi:35,modulation:.8});assert.ok(sim.activity.every(a=>Number.isFinite(a)&&a>=0&&a<=1));assert.ok(sim.activity.some((a,i)=>data.nodes[i].role==='downstream'&&a>.01));});
