import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AcousticAnalysis} from '../dist/acoustics.mjs';
import {NeuralSimulation} from '../dist/simulation.mjs';
import {ACTIONS, MotorController, MOTOR_SOURCES, ROOM_LIMITS, poseFromMotor} from '../dist/motor.mjs';
import {neuralGeometry,GapNavigator} from '../dist/neural-space.mjs';

const graph = JSON.parse(readFileSync(new URL('../dist/assets/auditory-connectome.json', import.meta.url)));
const rig = JSON.parse(readFileSync(new URL('../dist/assets/fly-rig.json', import.meta.url)));
const emptyActivity = () => new Float64Array(graph.nodes.length);
const motionValues = pose => {
  const {drive, ...motion} = pose;
  return motion;
};
function numericLeaves(value) {
  return typeof value === 'number' ? [value] : Object.values(value).flatMap(numericLeaves);
}
function assertStill(pose) {
  assert.ok(numericLeaves(motionValues(pose)).every(value => value === 0), 'neutral activity must leave every pose offset at zero');
}

test('zero neural input produces no motion, even with an explicit dance action', () => {
  const motor = new MotorController(graph.nodes);
  for (let i = 0; i < 1000; i++) motor.step(emptyActivity(), {mode: 'dance', action: 'wings'});
  assert.equal(motor.values.drive, 0);
  assert.equal(motor.values.phase, 0);
  assert.equal(motor.values.jump, 0);
  assert.equal(motor.values.action, 'idle');
  assertStill(poseFromMotor(motor.values, {mode: 'dance', boost: 3}));
  assertStill(poseFromMotor(motor.values, {mode: 'evidence'}));
});

test('reset clears active motion, GF trigger memory and the next zero-input pose', () => {
  const motor = new MotorController(graph.nodes);
  for (let i = 0; i < 10; i++) motor.step(new Float64Array(graph.nodes.length).fill(.25));
  assert.ok(motor.values.drive > 0);
  assert.ok(motor.values.jump > 0);
  motor.reset();
  assert.deepEqual(motor.values, new MotorController(graph.nodes).values);
  motor.step(emptyActivity(), {mode: 'evidence'});
  assertStill(poseFromMotor(motor.values, {mode: 'evidence'}));
});

test('direct JO or other non-DN activity cannot bypass descending-neuron motor inputs', () => {
  const motor = new MotorController(graph.nodes);
  assert.ok(graph.nodes.some(node => node.type.startsWith('JO-')));
  const activity = Float64Array.from(graph.nodes, node => node.type.startsWith('DN') ? 0 : .8);
  for (let i = 0; i < 200; i++) motor.step(activity);
  assert.equal(motor.values.descending, 0);
  assert.equal(motor.values.drive, 0);
  assert.equal(motor.values.jump, 0);
  assertStill(poseFromMotor(motor.values, {mode: 'dance'}));
  const dn = graph.nodes.findIndex(node => node.type.startsWith('DN') && node.id !== MOTOR_SOURCES.gf[0]);
  assert.ok(dn >= 0);
  activity[dn] = .2;
  for (let i = 0; i < 100; i++) motor.step(activity);
  assert.ok(motor.values.descending > 0);
  assert.ok(motor.values.drive > .025);
  assert.notEqual(motor.values.action, 'idle');
});

test('GF evidence ignores non-GF activity and emits only its restricted escape pose', () => {
  const motor = new MotorController(graph.nodes);
  assert.ok(motor.gf >= 0, 'the declared GF neuron must exist in the loaded graph');
  assert.equal(graph.nodes[motor.gf].type, 'DNp01');
  const activity = Float64Array.from(graph.nodes, node => node.type.startsWith('DN') ? .2 : 0);
  activity[motor.gf] = 0;
  for (let i = 0; i < 100; i++) motor.step(activity, {mode: 'evidence', action: 'face'});
  assert.ok(motor.values.drive > .025);
  assert.equal(motor.values.jump, 0);
  assertStill(poseFromMotor(motor.values, {mode: 'evidence', action: 'face'}));
  activity[motor.gf] = .2;
  motor.step(activity, {mode: 'evidence', action: 'face'});
  const pose = poseFromMotor(motor.values, {mode: 'evidence', action: 'face'});
  assert.ok(pose.lift > 0);
  assert.ok(pose.wings.every(value => value > 0));
  assert.ok(pose.legs.LM.lift !== 0 && pose.legs.RM.lift !== 0);
  assert.deepEqual(pose.legs.LM, pose.legs.RM);
  for (const leg of ['LF', 'RF', 'LH', 'RH']) assert.ok(numericLeaves(pose.legs[leg]).every(value => value === 0));
  assert.deepEqual(pose.head, [0, 0, 0]);
  for (const key of ['travel', 'bodyRoll', 'bodyYaw', 'abdomen']) assert.equal(pose[key], 0);
  for (let i = 0; i < 600; i++) motor.step(activity, {mode: 'evidence'});
  assert.ok(motor.values.jump < 1e-8, 'a sustained GF value must not trigger repeated autonomous jumps');
});

test('all dance actions remain finite across phase and boost ranges', () => {
  const phases = [0, .3, Math.PI / 2, Math.PI, 20 * Math.PI + .7];
  for (const action of Object.keys(ACTIONS).filter(action => action !== 'auto')) {
    for (const phase of phases) {
      for (const boost of [.5, 1.8, 3]) {
        const pose = poseFromMotor({drive: .6, phase, jump: 0, action}, {mode: 'dance', boost});
        assert.ok(numericLeaves(pose).every(Number.isFinite), `${action} must produce finite joint offsets`);
        assert.equal(Object.keys(pose.legs).length, 6);
        if (action === 'wings') {
          assert.ok(pose.wingSpread < -1, 'wing display keeps both wings open');
          assert.equal(pose.wings[0], pose.wings[1], 'mirrored rig axes require same-sign wing offsets');
        }
      }
    }
  }
});

test('gentle GF display reduces the escape pose to one quarter', () => {
  const state = {drive: .2, phase: 1, jump: .8, action: 'escape'};
  const normal = poseFromMotor(state, {mode: 'evidence'});
  const gentle = poseFromMotor(state, {mode: 'evidence', gentle: true});
  assert.ok(normal.lift > 0);
  assert.equal(gentle.lift, normal.lift * .25);
  assert.deepEqual(gentle.wings, normal.wings.map(value => value * .25));
  assert.equal(gentle.legs.LM.lift, normal.legs.LM.lift * .25);
  assert.equal(gentle.legs.RM.bend, normal.legs.RM.bend * .25);
});

test('exaggerated dance is continuous at threshold and gentle remains bounded', () => {
  const state = {drive: .008, phase: 1, jump: 0, action: 'wings'};
  assertStill(poseFromMotor(state, {mode: 'dance'}));
  const barely = poseFromMotor({...state, drive:.008000001}, {mode:'dance'});
  assert.ok(Math.max(...numericLeaves(motionValues(barely))) < .001);
  const normal = poseFromMotor({...state, drive:1}, {mode:'dance', boost:4});
  const gentle = poseFromMotor({...state, drive:1}, {mode:'dance', boost:4, gentle:true});
  assert.equal(gentle.wingSpread,normal.wingSpread,'gentle mode must not fold a flying wing');
  const {wingSpread:normalSpread,...normalMotion}=motionValues(normal),{wingSpread:gentleSpread,...gentleMotion}=motionValues(gentle);
  assert.deepEqual(numericLeaves(gentleMotion),numericLeaves(normalMotion).map(x=>x*.25));
  const gf = {...state, jump:.8};
  assert.deepEqual(poseFromMotor(gf,{mode:'evidence',boost:.5,action:'face'}),poseFromMotor(gf,{mode:'evidence',boost:4,action:'walk'}));
});

test('real graph routes sampled sound through Ai into motion, then decays during silence', () => {
  const rate = 48000, dsp = new AcousticAnalysis(rate);
  const simulation = new NeuralSimulation(graph), motor = new MotorController(graph.nodes);
  let activeDrive = 0, activeDescending = 0, soundFrames = 0;
  for (let i = 0; i < rate * 10; i++) {
    const time = i / rate;
    const feature = dsp.tick(time < 2 ? .15 * Math.sin(2 * Math.PI * 220 * time) : 0);
    if (!feature) continue;
    simulation.step(feature);
    motor.step(simulation.activity, {mode: 'dance', action: 'auto'});
    if (time < 2) {
      soundFrames++;
      activeDrive = Math.max(activeDrive, motor.values.drive);
      activeDescending = Math.max(activeDescending, motor.values.descending);
    }
  }
  assert.equal(soundFrames, 200);
  assert.ok(activeDescending > .005, 'the real connectome must carry input to a descending neuron');
  assert.ok(activeDrive > .025, 'audio-driven neural activity must reach the motion threshold');
  assert.ok(simulation.activity.every(value => Number.isFinite(value) && value < 1e-5));
  assert.ok(motor.values.drive < 1e-5);
  assert.equal(motor.values.action, 'perch');
  assertStill(poseFromMotor(motor.values, {mode: 'dance', boost: 3}));
});

test('rig hierarchy and mirrored wing axes match the renderer contract', () => {
  assert.equal(rig.metadata.unit, 'mm');
  assert.equal(rig.metadata.quaternionOrder, 'xyzw');
  const seen = new Set();
  for (const body of rig.bodies) {
    assert.ok(!seen.has(body.name));
    assert.ok(!body.parent || seen.has(body.parent), `${body.name} must follow its parent`);
    seen.add(body.name);
    assert.ok(rig.geometries[body.mesh], `${body.name} must reference an existing mesh`);
    assert.equal(body.pos.length, 3);
    assert.ok(body.pos.every(Number.isFinite));
    for (const key of ['quat', 'restQuat']) {
      assert.equal(body[key].length, 4);
      assert.ok(body[key].every(Number.isFinite));
      assert.ok(Math.abs(Math.hypot(...body[key]) - 1) < 1e-8);
    }
    for (const joint of body.joints) {
      assert.equal(joint.axis.length, 3);
      assert.ok(joint.axis.every(Number.isFinite) && Number.isFinite(joint.rest));
      assert.ok(Math.abs(Math.hypot(...joint.axis) - 1) < 1e-8);
    }
  }
  const left = rig.bodies.find(body => body.name === 'l_wing');
  const right = rig.bodies.find(body => body.name === 'r_wing');
  assert.equal(left.mirrorY, false);
  assert.equal(right.mirrorY, true);
  for (const leftJoint of left.joints) {
    const suffix = leftJoint.name.split('-').at(-1);
    const rightJoint = right.joints.find(joint => joint.name.endsWith(`-${suffix}`));
    assert.ok(rightJoint);
    const mirroredAxis = [-leftJoint.axis[0], leftJoint.axis[1], -leftJoint.axis[2]];
    assert.ok(rightJoint.axis.every((value, i) => value === mirroredAxis[i]));
  }
});

test('room flight moves throughout 3D space without escaping its display bounds', () => {
  const motor=new MotorController(graph.nodes),start=[...motor.values.position];
  const activity=emptyActivity();let maxDistance=0,maxHeight=start[2];
  for(let t=0;t<6000;t++){
    graph.nodes.forEach((node,i)=>activity[i]=node.type.startsWith('DN')?.1+.09*Math.sin(t*.003+i)**2:0);
    const state=motor.step(activity,{mode:'dance',action:'flight'}),[x,y,z]=state.position;
    assert.ok([x,y,z,state.heading,state.speed,state.turn].every(Number.isFinite));
    assert.ok(Math.abs(x)<=ROOM_LIMITS.x&&Math.abs(y)<=ROOM_LIMITS.y);
    assert.ok(z>=ROOM_LIMITS.zMin&&z<=ROOM_LIMITS.zMax);
    maxDistance=Math.max(maxDistance,Math.hypot(x-start[0],y-start[1]));maxHeight=Math.max(maxHeight,z);
  }
  assert.ok(maxDistance>7,'must travel across the room, not merely wobble in place');
  assert.ok(maxHeight>3,'must enter the vertical dimension');
});

test('room position does not drift in silence; pose reads cannot advance its clock', () => {
  const motor=new MotorController(graph.nodes),initial=structuredClone(motor.values);
  for(let i=0;i<1000;i++)motor.step(emptyActivity());
  assert.deepEqual(motor.values.position,initial.position);assert.equal(motor.values.heading,initial.heading);
  const active=new Float64Array(graph.nodes.length).fill(.2);
  for(let i=0;i<300;i++)motor.step(active);
  const a=structuredClone(motor.values);
  for(let i=0;i<600;i++)poseFromMotor(motor.values,{mode:'dance'});
  assert.deepEqual(motor.values,a,'rendering never integrates flight');
  for(let i=0;i<1000;i++)motor.step(emptyActivity());
  assert.equal(motor.values.speed,0);const stopped=[...motor.values.position];
  for(let i=0;i<300;i++)motor.step(emptyActivity());assert.deepEqual(motor.values.position,stopped);
  motor.reset();assert.deepEqual(motor.values,initial);
});

test('auto action state follows debounced neural readout instead of a timed playlist', () => {
  const motor=new MotorController(graph.nodes);
  const activity=value=>Float64Array.from(graph.nodes,node=>node.type.startsWith('DN')&&node.id!==MOTOR_SOURCES.gf[0]?value:0);
  const strong=activity(.1),medium=activity(.004),silent=emptyActivity();
  for(let i=0;i<40;i++)motor.step(strong,{mode:'dance',action:'auto'});
  assert.equal(motor.values.action,'flight','a rapid descending-state rise selects traversal');
  for(let i=0;i<700;i++)motor.step(strong,{mode:'dance',action:'auto'});
  assert.equal(motor.values.action,'hover','a sustained strong state settles into hover');
  const fallingActions=[];
  for(let i=0;i<900;i++){motor.step(medium,{mode:'dance',action:'auto'});fallingActions.push(motor.values.action);}
  assert.ok(!fallingActions.includes('flight'),'falling activity must not be mistaken for a new flight onset');
  assert.equal(motor.values.action,'groom','a sustained medium-low state selects front-leg grooming');
  for(let i=0;i<1200;i++)motor.step(silent,{mode:'dance',action:'auto'});
  assert.equal(motor.values.action,'perch','very low activity settles into the stopped state');
  assert.equal(motor.values.speed,0);
  assert.ok(Math.abs(motor.values.position[2]-ROOM_LIMITS.zMin)<1e-6);
});

test('flight and hover keep wings spread while all six legs adjust over time', () => {
  for(const action of ['flight','hover']){
    const state={drive:.6,phase:.2,jump:0,action,turn:.4,position:[0,0,3]};
    const first=poseFromMotor(state,{mode:'dance'}),second=poseFromMotor({...state,phase:1.1},{mode:'dance'});
    assert.ok(first.wingSpread<-1&&second.wingSpread<-1,'flight wings must stay open through the full cycle');
    assert.equal(first.wings[0],first.wings[1]);assert.equal(second.wings[0],second.wings[1]);
    assert.notEqual(first.wings[0],second.wings[0],'spread wings must also flap');
    for(const leg of ['LF','LM','LH','RF','RM','RH'])assert.notDeepEqual(first.legs[leg],second.legs[leg],`${leg} must not freeze in ${action}`);
  }
});

test('display fly follows connected empty space in the actual rendered skeleton geometry',()=>{
  const navigation=new GapNavigator(neuralGeometry(graph.nodes),ROOM_LIMITS),motor=new MotorController(graph.nodes,navigation);
  assert.ok(navigation.component.length>100,'real data must provide connected flight space');
  const start=[...motor.values.position],active=Float64Array.from(graph.nodes,n=>n.type.startsWith('DN')?.1:0);let farthest=0,minZ=99,maxZ=-99;
  for(let i=0;i<5000;i++){
    const state=motor.step(active,{mode:'dance',action:'flight'});
    if(i%10===0)assert.ok(navigation.clear(state.position),'body envelope must remain in free space');
    farthest=Math.max(farthest,Math.hypot(...state.position.map((v,k)=>v-start[k])));minZ=Math.min(minZ,state.position[2]);maxZ=Math.max(maxZ,state.position[2]);
  }
  assert.ok(farthest>7);assert.ok(maxZ-minZ>2,'flight must use depth and altitude');
  for(let i=0;i<1000;i++)motor.step(active,{mode:'dance',action:'hover'});
  const stopped=[...motor.values.position];for(let i=0;i<100;i++)motor.step(active,{mode:'dance',action:'hover'});
  assert.deepEqual(motor.values.position,stopped,'hover stops translation in the current safe gap');
  motor.reset();assert.deepEqual(motor.values.position,start);
});
