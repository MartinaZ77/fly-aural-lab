import * as THREE from './vendor/three.module.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// A retracted display pose for this FlyGym rig (absolute joint angles, radians).
// Paired legs use mirrored rig axes. Keep the tarsal chain nearly straight;
// unconstrained endpoint IK can reach a tucked target by curling all five toes.
// These are authored joint angles, not measured in-flight kinematics.
const FLIGHT_ANGLES={
  F:{coxa:[.4,0,.15],trochanterfemur:[-1.15,0],tibia:[2.65],tarsus1:[0]},
  M:{coxa:[.65,0,.5],trochanterfemur:[-1.15,0],tibia:[2.75],tarsus1:[0]},
  H:{coxa:[.8,0,.85],trochanterfemur:[-1.2,0],tibia:[2.7],tarsus1:[.08]}
};

// Constrained kinematic contact, not simulated muscle forces or measured poses.
// Solves the existing rig's actual joint axes instead of sliding a foot sprite.
export class FootContactSolver {
  constructor(parts,root){this.parts=parts;this.root=root;this.legs={};this.errors={};this.cache={};
    for(const leg of ['LF','LM','LH','RF','RM','RH']){
      const prefix=leg.toLowerCase(),tipPart=parts.get(prefix+'_tarsus5');tipPart.mesh.geometry.computeBoundingBox();
      const tip=new THREE.Vector3(0,0,tipPart.mesh.geometry.boundingBox.min.z),joints=[];
      for(const name of ['tarsus5','tarsus4','tarsus3','tarsus2','tarsus1','tibia','trochanterfemur','coxa']){
        const part=parts.get(prefix+'_'+name);for(let j=part.body.joints.length-1;j>=0;j--)joints.push({part,index:j,limit:name.startsWith('tarsus')?.22:name==='coxa'?1.6:1.8});
      }
      const flight=[...new Set(joints.map(j=>j.part))].map(part=>{
        const name=part.body.name.slice(3),angles=FLIGHT_ANGLES[leg[1]][name]||[-.025],quaternion=new THREE.Quaternion().fromArray(part.body.quat);
        part.body.joints.forEach((joint,i)=>quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(joint.axis),angles[i])));
        return {part,quaternion,offsets:part.body.joints.map((joint,i)=>angles[i]-joint.rest)};
      });
      this.legs[leg]={tipPart,tip,joints,flight};
    }
  }
  fly(landingTargets,progress=0){
    // Cruise never solves a contact target: it holds a stable articulated pose.
    // On approach, blend from that pose to branch contact without curling toes.
    const blend=clamp(progress,0,1),extension=blend*blend*(3-2*blend);
    if(extension&&landingTargets)this.solve(landingTargets);else this.errors={};
    for(const {flight} of Object.values(this.legs))for(const {part,quaternion,offsets} of flight){
      if(extension&&landingTargets){part.group.quaternion.slerp(quaternion,1-extension);part.offsets=offsets.map((offset,i)=>offset+(part.offsets[i]-offset)*extension);}
      else{part.group.quaternion.copy(quaternion);part.offsets=[...offsets];}
    }
    this.root.updateMatrixWorld(true);
  }
  solve(targets){this.errors={};this.root.updateMatrixWorld(true);
    for(const [leg,point] of Object.entries(targets||{})){
      const {tipPart,tip,joints}=this.legs[leg],target=new THREE.Vector3().fromArray(point),end=new THREE.Vector3();
      const key=this.root.worldToLocal(target.clone()).toArray().map(v=>v.toFixed(5)).join(','),parts=[...new Set(joints.map(j=>j.part))],cached=this.cache[leg];
      if(cached?.key===key){parts.forEach((part,i)=>{part.group.quaternion.copy(cached.quaternions[i]);part.offsets=[...cached.offsets[i]];});this.root.updateMatrixWorld(true);tipPart.group.localToWorld(end.copy(tip));this.errors[leg]=end.distanceTo(target);continue;}
      for(const part of parts){part.offsets.fill(0);part.group.quaternion.fromArray(part.body.restQuat);}this.root.updateMatrixWorld(true);
      for(let iteration=0;iteration<40;iteration++){
        tipPart.group.localToWorld(end.copy(tip));if(end.distanceTo(target)<.015)break;
        for(const {part,index,limit} of joints){
          const origin=part.group.getWorldPosition(new THREE.Vector3()),prefix=part.group.parent.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().fromArray(part.body.quat));
          for(let k=0;k<index;k++){const joint=part.body.joints[k];prefix.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(joint.axis),joint.rest+part.offsets[k]));}
          const axis=new THREE.Vector3().fromArray(part.body.joints[index].axis).applyQuaternion(prefix).normalize();
          tipPart.group.localToWorld(end.copy(tip));const a=end.clone().sub(origin),b=target.clone().sub(origin);a.addScaledVector(axis,-a.dot(axis));b.addScaledVector(axis,-b.dot(axis));if(a.lengthSq()<1e-10||b.lengthSq()<1e-10)continue;a.normalize();b.normalize();
          const angle=Math.atan2(axis.dot(a.clone().cross(b)),a.dot(b));part.offsets[index]=clamp(part.offsets[index]+clamp(angle,-.4,.4),-limit,limit);
          part.group.quaternion.fromArray(part.body.quat);
          part.body.joints.forEach((joint,k)=>part.group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(joint.axis),joint.rest+part.offsets[k])));
          part.group.updateWorldMatrix(true,true);
        }
      }
      tipPart.group.localToWorld(end.copy(tip));this.errors[leg]=end.distanceTo(target);this.cache[leg]={key,quaternions:parts.map(part=>part.group.quaternion.clone()),offsets:parts.map(part=>[...part.offsets])};
    }
  }
}
