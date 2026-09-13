import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {poseForBehavior} from './behavior.mjs';
import {FootContactSolver} from './leg-ik.mjs';
import {colorOf} from './neural-display.mjs';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export class FlyStage {
  constructor(canvas,background,rig,graph,forest){
    this.canvas=canvas;this.rig=rig;this.graph=graph;
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));this.renderer.setClearColor(0x02060b);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
    this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog(0x02060b,12,58);this.camera=new THREE.PerspectiveCamera(58,1,.15,110);this.camera.up.set(0,0,1);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.08;this.controls.rotateSpeed=.45;this.controls.minDistance=13;this.controls.maxDistance=45;this.controls.minPolarAngle=.55;this.controls.maxPolarAngle=1.4;this.controls.enablePan=false;
    this.resetCamera();this.scene.add(new THREE.HemisphereLight(0xbcecee,0x1b1016,2.2));
    canvas.addEventListener('dblclick',()=>this.resetCamera());
    canvas.addEventListener('keydown',e=>{
      if(e.ctrlKey||e.metaKey||e.altKey||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(e.key))return;e.preventDefault();
      if(e.key==='0'){this.resetCamera();return;}
      const alignment=new THREE.Quaternion().setFromUnitVectors(this.camera.up,new THREE.Vector3(0,1,0));
      const offset=this.camera.position.clone().sub(this.controls.target).applyQuaternion(alignment),spherical=new THREE.Spherical().setFromVector3(offset);
      if(e.key==='ArrowLeft')spherical.theta-=.1;else if(e.key==='ArrowRight')spherical.theta+=.1;
      else if(e.key==='ArrowUp')spherical.phi-=.1;else if(e.key==='ArrowDown')spherical.phi+=.1;
      else spherical.radius*=e.key==='-'?1.1:.9;
      spherical.phi=clamp(spherical.phi,this.controls.minPolarAngle,this.controls.maxPolarAngle);spherical.radius=clamp(spherical.radius,this.controls.minDistance,this.controls.maxDistance);
      this.camera.position.copy(this.controls.target).add(offset.setFromSpherical(spherical).applyQuaternion(alignment.invert()));this.controls.update();
    });
    const key=new THREE.DirectionalLight(0xffe4bc,3.4);key.position.set(3,-4,12);this.scene.add(key);
    const rim=new THREE.DirectionalLight(0x68e8e6,3);rim.position.set(-3,4,8);this.scene.add(rim);
    const fill=new THREE.DirectionalLight(0x8eb9ff,1.3);fill.position.set(1,-3,3);this.scene.add(fill);
    this.root=new THREE.Group();this.root.scale.setScalar(.72);this.scene.add(this.root);this.parts=new Map();this.materials=[];
    const geometries=new Map(Object.entries(rig.geometries).map(([name,g])=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(g.positions,3));geometry.setIndex(g.indices);geometry.computeVertexNormals();return [name,geometry];}));
    for(const body of rig.bodies){
      const group=new THREE.Group();group.position.fromArray(body.parent?body.pos:[0,0,0]);group.quaternion.fromArray(body.restQuat);group.name=body.name;
      const material=this.material(body.name),mesh=new THREE.Mesh(geometries.get(body.mesh),material);if(body.mirrorY)mesh.scale.y=-1;group.add(mesh);
      const parent=body.parent?this.parts.get(body.parent)?.group:this.root;if(!parent)throw new Error(`关节模型缺少父节点 ${body.parent}`);parent.add(group);
      this.parts.set(body.name,{body,group,mesh,offsets:body.joints.map(()=>0)});this.materials.push(material);
    }
    this.contactSolver=new FootContactSolver(this.parts,this.root);
    this.neuralRoom=new THREE.Group();this.scene.add(this.neuralRoom);this.neuralParts=[];
    const sprite=document.createElement('canvas');sprite.width=sprite.height=32;const ctx=sprite.getContext('2d'),halo=ctx.createRadialGradient(16,16,0,16,16,16);halo.addColorStop(0,'#fff');halo.addColorStop(.18,'#fffe');halo.addColorStop(.5,'#fff6');halo.addColorStop(1,'#fff0');ctx.fillStyle=halo;ctx.fillRect(0,0,32,32);this.sprite=new THREE.CanvasTexture(sprite);
    for(let i=0;i<graph.nodes.length;i++){
      const n=graph.nodes[i],{segments,dots}=forest[i];
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(segments,3));
      const material=new THREE.LineBasicMaterial({color:colorOf(n),transparent:true,opacity:.3,depthTest:true,depthWrite:false,blending:THREE.NormalBlending,fog:true,toneMapped:false});this.neuralRoom.add(new THREE.LineSegments(geometry,material));
      const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute(dots,3));const pm=new THREE.PointsMaterial({color:colorOf(n),map:this.sprite,size:2.2,sizeAttenuation:true,transparent:true,opacity:0,depthTest:true,depthWrite:false,blending:THREE.NormalBlending,fog:true,toneMapped:false});this.neuralRoom.add(new THREE.Points(pg,pm));this.neuralParts.push({id:String(n.id),material,pm});
    }
    this.q=new THREE.Quaternion();this.axis=new THREE.Vector3();background.hidden=true;
  }
  material(name){
    let color=0x806447,roughness=.5,metalness=.12,opacity=1;
    if(name.includes('eye')){color=0x9d222a;roughness=.3;metalness=.06;}
    else if(name.includes('wing')){color=0xb2e7e1;roughness=.18;metalness=.1;opacity=.5;}
    else if(name.includes('abdomen'))color=Number(name.slice(-1))%2?0x3e2c25:0x7d6140;
    else if(/tarsus|tibia/.test(name)){color=0x604839;roughness=.46;}
    return new THREE.MeshStandardMaterial({color,roughness,metalness,transparent:opacity<1,opacity,side:THREE.DoubleSide,depthWrite:opacity===1,emissive:0x173e3b,emissiveIntensity:.02});
  }
  resetCamera(){this.camera.position.set(11,-17,13);this.controls.target.set(0,0,3.8);this.camera.updateProjectionMatrix();this.controls.update();}
  offset(body,joint,pose){
    const axisName=joint.name.split('-').at(-1),name=body.name;
    if(name==='c_head')return {yaw:pose.head[0],pitch:pose.head[1],roll:pose.head[2]}[axisName]||0;
    if(name.startsWith('c_abdomen'))return axisName==='roll'?pose.abdomen*.32:axisName==='pitch'?pose.abdomen*.12:0;
    if(name==='l_wing'||name==='r_wing'){const flap=pose.wings[name==='l_wing'?0:1];return axisName==='pitch'?flap:axisName==='roll'?pose.wingSpread:0;}
    const match=name.match(/^([lr][fmh])_(.+)$/);if(!match)return 0;const leg=pose.legs[match[1].toUpperCase()];if(!leg)return 0;
    if(match[2]==='coxa')return {yaw:leg.twist,pitch:leg.swing*.5,roll:leg.swing*.5}[axisName]||0;
    if(match[2]==='trochanterfemur')return axisName==='pitch'?-leg.lift:axisName==='roll'?leg.twist*.3:0;
    if(match[2]==='tibia')return axisName==='pitch'?leg.bend:0;
    if(match[2]==='tarsus1')return axisName==='pitch'?-leg.bend*.25:0;
    return 0;
  }
  draw(state,frame,options){
    const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h)return;
    if(this.width!==w||this.height!==h){this.width=w;this.height=h;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
    const pose=poseForBehavior(state,options),position=state.position||[-3.5,-2,.6];
    this.root.position.set(position[0],position[1],position[2]+pose.lift);this.root.rotation.set(pose.bodyRoll,0,(state.heading||0)+pose.bodyYaw);
    for(const part of this.parts.values()){
      const {body,group,mesh}=part;
      group.quaternion.fromArray(body.quat);
      body.joints.forEach((joint,i)=>{part.offsets[i]=clamp(this.offset(body,joint,pose),-1.5,1.5);this.axis.fromArray(joint.axis);this.q.setFromAxisAngle(this.axis,joint.rest+part.offsets[i]);group.quaternion.multiply(this.q);});
      mesh.material.emissiveIntensity=.015+state.drive*.08;
    }
    let targets=state.footTargets;
    if(!state.grounded){
      this.root.updateMatrixWorld(true);const extension=state.landingProgress||0;
      targets=Object.fromEntries(['LF','LM','LH','RF','RM','RH'].map(leg=>{
        const x={F:.25,M:-.2,H:-.65}[leg[1]],tip=this.root.localToWorld(new THREE.Vector3(x,leg[0]==='L'?.24:-.24,-.32));
        if(state.landingFootTargets?.[leg])tip.lerp(new THREE.Vector3().fromArray(state.landingFootTargets[leg]),extension*extension*(3-2*extension));return [leg,tip.toArray()];
      }));
    }
    this.contactSolver.solve(targets);
    this.neuralRoom.visible=options.backdrop;
    for(const part of this.neuralParts){const style=frame.byId[part.id];part.material.opacity=style.opacity;part.pm.opacity=style.glowOpacity;}
    this.controls.update();this.renderer.render(this.scene,this.camera);
  }
  dispose(){this.controls.dispose();this.renderer.dispose();this.sprite.dispose();this.scene.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
}
