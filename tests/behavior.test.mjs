import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {neuralGeometry} from '../dist/neural-space.mjs';
import {BranchNavigator,PERCH_HEIGHT,pointOnBranch} from '../dist/branch-space.mjs';
import {BehaviorController,poseForBehavior} from '../dist/behavior.mjs';
import {ROOM_LIMITS} from '../dist/motor.mjs';
const graph=JSON.parse(readFileSync(new URL('../dist/assets/auditory-connectome.json',import.meta.url))),geometry=neuralGeometry(graph.nodes);
const create=(seed=42)=>new BehaviorController(graph.nodes,new BranchNavigator(geometry,ROOM_LIMITS,seed));
const activity=(t)=>Float64Array.from(graph.nodes,(n,i)=>n.type.startsWith('DN')?.05*(1+Math.sin(t*.01+i)*.65):0);
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const pointDistance=(p,a,b)=>{const d=b.map((x,i)=>x-a[i]),t=Math.max(0,Math.min(1,d.reduce((s,x,i)=>s+x*(p[i]-a[i]),0)/d.reduce((s,x)=>s+x*x,0)));return distance(p,a.map((x,i)=>x+d[i]*t));};
function onChain(p,chain){let best=Infinity;for(let i=1;i<chain.points.length;i++)best=Math.min(best,pointDistance(p,chain.points[i-1],chain.points[i]));return best<1e-6;}

test('idle starts on an original neural branch; zero or non-DN input cannot start an action playlist',()=>{
  const m=create(),initial=structuredClone(m.values);
  assert.ok(m.values.grounded&&m.values.support);
  for(let i=0;i<1000;i++)m.step(Float64Array.from(graph.nodes,n=>n.type.startsWith('DN')?0:1));
  assert.deepEqual(m.values.position,initial.position);assert.equal(m.values.action,'perch');assert.equal(m.values.phase,0);
  for(const p of Object.values(m.values.footTargets))assert.ok(onChain(p,m.navigation.support.chain));
  assert.ok(Math.abs(m.values.position[2]-m.values.support.point[2]-PERCH_HEIGHT)<1e-9);
});

test('seeded routes vary between runs and traverse clear gaps without circular center steering',()=>{
  const trajectories=[];
  for(const seed of [71,93]){const n=create(seed).navigation;const samples=[];
    for(let i=0;i<4000;i++){const state=n.step('flight',3,.01,.3,.03);if(n.phase==='flight')assert.ok(n.air.clear(state.position));if(i%100===0)samples.push(state.position);assert.ok(state.position.every(Number.isFinite));}
    assert.ok(n.distanceFlown>60);trajectories.push(samples);
    assert.ok(new Set(n.air.recent).size>3,'no two-destination ping-pong');
  }
  assert.notDeepEqual(trajectories[0],trajectories[1]);
  const n=create(71).navigation,same=[];for(let i=0;i<4000;i++){const s=n.step('flight',3,.01,.3,.03);if(i%100===0)same.push(s.position);}assert.deepEqual(same,trajectories[0]);
});

test('silence completes a checked approach and settles only on a neural branch',()=>{
  const m=create(113);for(let i=0;i<250;i++)m.step(activity(i));assert.equal(m.values.grounded,false);
  const zero=new Float64Array(graph.nodes.length);let landed=false,previous=m.values.position;
  for(let i=0;i<3500;i++){const s=m.step(zero);assert.ok(distance(previous,s.position)<.08,'no teleport on landing');previous=s.position;
    if(s.grounded){landed=true;assert.ok(s.support);assert.ok(onChain(s.support.point,m.navigation.support.chain));}else assert.ok(['flight','takeoff','landing'].includes(s.action),'no airborne idle, hover, grooming or walking');
  }
  assert.ok(landed);assert.equal(m.values.action,'perch');assert.equal(m.values.speed,0);
  const stopped=structuredClone(m.values);for(let i=0;i<100;i++)m.step(zero);assert.deepEqual(m.values.position,stopped.position);
});

test('automatic competition reaches multiple grounded actions and anchors tripod stance feet',()=>{
  const m=create(134),actions=new Set();let previous=null,walkingFrames=0,stanceChecks=0;
  for(let i=0;i<8000;i++){const s=m.step(activity(i));actions.add(s.action);
    if(s.grounded){assert.ok(Object.values(s.contacts).filter(Boolean).length>=3);for(const [leg,contact] of Object.entries(s.contacts))if(contact)assert.ok(onChain(s.footTargets[leg],m.navigation.support.chain));}
    if(s.grounded&&['walk','reverse'].includes(s.action)&&s.speed>.01){walkingFrames++;
      if(previous?.action===s.action&&previous.speed>.01)for(const leg of Object.keys(s.contacts))if(s.contacts[leg]&&previous.contacts[leg]){assert.ok(distance(s.footTargets[leg],previous.footTargets[leg])<1e-6,'stance foot must not slide with body');stanceChecks++;}
    }
    previous=structuredClone(s);
  }
  for(const action of ['flight','landing','walk','face','hands','reverse','front','hind'])assert.ok(actions.has(action),action);
  assert.ok(walkingFrames>100&&stanceChecks>200);
});

test('flight legs have no phase-based walking oscillation; final approach extends them together',()=>{
  const state={drive:.4,phase:1,time:1,turn:0,grounded:false,action:'flight',landingProgress:0};
  const a=poseForBehavior(state),b=poseForBehavior({...state,phase:2,time:1.1});assert.deepEqual(a.legs,b.legs);assert.notDeepEqual(a.wings,b.wings);
  const landing=poseForBehavior({...state,landingProgress:1});assert.ok(Object.values(landing.legs).every(l=>l.lift===0&&l.bend===0));
  const gentle=poseForBehavior(state,{gentle:true});assert.equal(gentle.wingSpread,a.wingSpread);assert.equal(gentle.wings[0],a.wings[0]*.25);
});
