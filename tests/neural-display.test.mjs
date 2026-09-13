import test from 'node:test';
import assert from 'node:assert/strict';
import {createNeuralFrame,colorOf,glowAlpha} from '../dist/neural-display.mjs';

const nodes=[{id:10010},{id:321234}];
test('snapshot owns values and associates them with Body IDs, independent of ordering',()=>{
  const activity=new Float64Array([.25,.75]),frame=createNeuralFrame(nodes,activity,1.23);
  activity.fill(0);
  assert.deepEqual(frame.activity,[.25,.75]);
  assert.equal(frame.time,1.23);
  assert.equal(frame.byId['10010'].activity,.25);
  assert.equal(frame.byId['321234'].color,colorOf(nodes[1]));
  assert.deepEqual(createNeuralFrame([...nodes].reverse(),[.75,.25],1.23).byId,frame.byId);
  assert.throws(()=>{frame.byId['10010'].opacity=1;},TypeError);
  assert.throws(()=>{frame.activity[0]=1;},TypeError);
});
test('line brightness is linear and shared glow contrast has no hard threshold or early clipping',()=>{
  for(const a of [0,.001,.0299,.03,.0301,.049,.05,.1,.25,.5,.75,1]){
    const style=createNeuralFrame(nodes,[a,0],0).byId['10010'];
    assert.equal(style.opacity,.17+.8*a);
    assert.equal(style.glowOpacity,.7*(-Math.expm1(-8*a))/-Math.expm1(-8));
  }
  assert.equal(glowAlpha(0),0);assert.equal(glowAlpha(1),.7);assert.ok(glowAlpha(.049)<glowAlpha(.05));assert.ok(glowAlpha(.8)<glowAlpha(1));
});
test('repeated display frames cannot change onset, peak, decay or reset',()=>{
  const values=[0,.1,.6,.2,.03,0];
  for(const [step,a] of values.entries()){
    const expected=createNeuralFrame(nodes,[a,a/2],step*.01);
    for(let draws=0;draws<20;draws++)assert.deepEqual(createNeuralFrame(nodes,[a,a/2],step*.01),expected);
  }
  const reset=createNeuralFrame(nodes,[0,0],0);
  assert.equal(reset.byId['10010'].opacity,.17);
  assert.equal(reset.byId['10010'].glowOpacity,0);
});
test('gentle, glow and trace controls change shared styles, never the simulated sample',()=>{
  const frame=createNeuralFrame(nodes,[.5,.8],3,{gentle:true,glow:false,visible:new Set([0])});
  assert.deepEqual(frame.activity,[.5,.8]);
  assert.equal(frame.byId['10010'].opacity,.17+.8*.5*.3);
  assert.equal(frame.byId['321234'].opacity,.025);
  assert.equal(frame.byId['10010'].glowOpacity,0);
  assert.equal(frame.byId['321234'].glowOpacity,0);
  assert.throws(()=>createNeuralFrame(nodes,[0],0));
});
