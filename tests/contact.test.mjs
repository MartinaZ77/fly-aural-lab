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
test('the real articulated rig reaches support targets and tucked flight targets without lengthening legs',()=>{
  const root=new THREE.Group();root.scale.setScalar(.72);const parts=new Map();
  for(const body of rig.bodies){const group=new THREE.Group();group.position.fromArray(body.parent?body.pos:[0,0,0]);group.quaternion.fromArray(body.restQuat);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(rig.geometries[body.mesh].positions,3));const mesh=new THREE.Mesh(geometry);group.add(mesh);(body.parent?parts.get(body.parent).group:root).add(group);parts.set(body.name,{body,group,mesh,offsets:body.joints.map(()=>0)});}
  const solver=new FootContactSolver(parts,root),motor=new BehaviorController(graph.nodes,new BranchNavigator(neuralGeometry(graph.nodes),ROOM_LIMITS,134));let solved=0,maxError=0;
  for(let i=0;i<8000;i++){
    const state=motor.step(Float64Array.from(graph.nodes,(n,k)=>n.type.startsWith('DN')?.05*(1+Math.sin(i*.01+k)*.65):0));
    if(i%20||!state.grounded)continue;
    root.position.fromArray(state.position);root.rotation.set(0,0,state.heading);solver.solve(state.footTargets);solved++;
    for(const [leg,error] of Object.entries(solver.errors)){maxError=Math.max(maxError,error);assert.ok(error<.08,`${i} ${state.action} ${leg} error ${error}, root ${state.position}, target ${state.footTargets[leg]}`);}
    for(const {body,group} of parts.values())assert.deepEqual(group.position.toArray(),body.parent?body.pos:[0,0,0]);
  }
  assert.ok(solved>80);assert.ok(maxError<.08);
  root.position.set(1,2,4);root.rotation.set(0,0,.4);root.updateMatrixWorld(true);
  const targets=Object.fromEntries(['LF','LM','LH','RF','RM','RH'].map(leg=>[leg,root.localToWorld(new THREE.Vector3({F:.25,M:-.2,H:-.65}[leg[1]],leg[0]==='L'?.24:-.24,-.32)).toArray()]));
  solver.solve(targets);assert.ok(Object.values(solver.errors).every(e=>e<.02));
});
