import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../dist/vendor/three.module.js';
import {FootContactSolver} from '../dist/leg-ik.mjs';
import {neuralGeometry} from '../dist/neural-space.mjs';
import {BranchNavigator} from '../dist/branch-space.mjs';
import {BehaviorController} from '../dist/behavior.mjs';
import {ROOM_LIMITS} from '../dist/motor.mjs';
const graph=JSON.parse(readFileSync(new URL('../dist/assets/auditory-connectome.json',import.meta.url))),rig=JSON.parse(readFileSync(new URL('../dist/assets/fly-rig.json',import.meta.url)));
function createRig(){
  const root=new THREE.Group();root.scale.setScalar(.72);const parts=new Map();
  for(const body of rig.bodies){const group=new THREE.Group();group.position.fromArray(body.parent?body.pos:[0,0,0]);group.quaternion.fromArray(body.restQuat);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(rig.geometries[body.mesh].positions,3));const mesh=new THREE.Mesh(geometry);group.add(mesh);(body.parent?parts.get(body.parent).group:root).add(group);parts.set(body.name,{body,group,mesh,offsets:body.joints.map(()=>0)});}
  return {root,parts};
}
test('the real articulated rig reaches support targets without lengthening legs',()=>{
  const {root,parts}=createRig();
  const solver=new FootContactSolver(parts,root),motor=new BehaviorController(graph.nodes,new BranchNavigator(neuralGeometry(graph.nodes),ROOM_LIMITS,134));let solved=0,maxError=0;
  for(let i=0;i<8000;i++){
    const state=motor.step(Float64Array.from(graph.nodes,(n,k)=>n.type.startsWith('DN')?.05*(1+Math.sin(i*.01+k)*.65):0));
    if(i%20||!state.grounded)continue;
    root.position.fromArray(state.position);root.rotation.set(0,0,state.heading);solver.solve(state.footTargets);solved++;
    for(const [leg,error] of Object.entries(solver.errors)){maxError=Math.max(maxError,error);assert.ok(error<.08,`${i} ${state.action} ${leg} error ${error}, root ${state.position}, target ${state.footTargets[leg]}`);}
    for(const {body,group} of parts.values())assert.deepEqual(group.position.toArray(),body.parent?body.pos:[0,0,0]);
  }
  assert.ok(solved>80);assert.ok(maxError<.08);
});

test('cruise holds folded legs with uncurled feet, independent of route and previous contact',()=>{
  const {root,parts}=createRig(),solver=new FootContactSolver(parts,root);
  solver.fly();
  const first=Object.fromEntries([...parts].map(([name,p])=>[name,p.group.quaternion.toArray()]));
  for(const [leg,{tipPart,tip,flight}] of Object.entries(solver.legs)){
    const foot=root.worldToLocal(tipPart.group.localToWorld(tip.clone()));
    assert.ok(foot.z<-.6&&foot.z>-1.3,`${leg} must fold underneath the body, not dangle`);
    assert.ok(foot.x<0&&foot.x>-1.5,`${leg} foot should fold back alongside the body`);
    assert.ok(foot.y*(leg[0]==='L'?1:-1)>.1,`${leg} must not cross the body midline`);
    let toeBend=0;
    for(const {part} of flight){
      if(part.body.name.includes('tarsus'))toeBend+=Math.abs(part.body.joints[0].rest+part.offsets[0]);
      const point=root.worldToLocal(part.group.getWorldPosition(new THREE.Vector3()));
      assert.ok(point.z<-.2,`${leg} joints must stay below the dorsal surface`);
      assert.deepEqual(part.group.position.toArray(),part.body.pos,'retraction must not stretch segments');
    }
    assert.ok(toeBend<.25,`${leg} tarsi must not curl into the old IK loops`);
  }
  const motor=new BehaviorController(graph.nodes,new BranchNavigator(neuralGeometry(graph.nodes),ROOM_LIMITS,134));
  root.position.fromArray(motor.values.position);root.rotation.set(0,0,motor.values.heading);solver.solve(motor.values.footTargets);
  root.position.set(1,2,4);root.rotation.set(.2,0,2.4);solver.fly();
  for(const {flight} of Object.values(solver.legs))for(const {part} of flight)assert.deepEqual(part.group.quaternion.toArray(),first[part.body.name]);
});

test('landing transitions from the folded flight pose to branch contact continuously',()=>{
  const {root,parts}=createRig(),solver=new FootContactSolver(parts,root),motor=new BehaviorController(graph.nodes,new BranchNavigator(neuralGeometry(graph.nodes),ROOM_LIMITS,134));
  const state=motor.values;root.position.fromArray(state.position);root.rotation.set(0,0,state.heading);solver.fly();
  let previous=Object.fromEntries([...parts].map(([name,p])=>[name,p.group.quaternion.clone()]));
  for(let i=1;i<=100;i++){
    solver.fly(state.footTargets,i/100);
    for(const {flight} of Object.values(solver.legs))for(const {part} of flight){assert.ok(part.group.quaternion.angleTo(previous[part.body.name])<.08,'leg extension should not snap');previous[part.body.name]=part.group.quaternion.clone();}
  }
  for(const [leg,{tipPart,tip}] of Object.entries(solver.legs))assert.ok(tipPart.group.localToWorld(tip.clone()).distanceTo(new THREE.Vector3(...state.footTargets[leg]))<.08,'landed feet must reach the neural branch');
});
