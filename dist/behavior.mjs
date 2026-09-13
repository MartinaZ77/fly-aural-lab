import {MotorController,poseFromMotor} from './motor.mjs';
import {pointOnBranch} from './branch-space.mjs';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const LEGS=['LF','LM','LH','RF','RM','RH'];
const FOOT_ARC={LF:.60,LM:.08,LH:-.58,RF:.43,RM:-.12,RH:-.75};
const TRIPOD={LF:0,RM:0,LH:0,RF:.5,LM:.5,RH:.5};
export const BEHAVIOR_NAMES={flight:'穿行',takeoff:'起飞',landing:'落脚',perch:'停驻',walk:'走动',reverse:'后退',face:'搓脸',hands:'搓前足',front:'整理前足',hind:'整理后足',wings:'展翅',head:'探头',abdomen:'摆腹'};

// State selection is an explicit, unvalidated readout of the loaded DNs. These
// coefficients do NOT assign proven walking/grooming identities to those cells.
export class BehaviorController {
  constructor(nodes,navigation){this.nodes=nodes;this.navigation=navigation;this.readout=new MotorController(nodes);this.reset();}
  reset(){this.readout.reset();this.navigation.reset();this.request='perch';this.age=0;this.candidate='perch';this.candidateAge=0;this.fatigue={};this.gaitPhase=0;this.feet={};this.previousChain=null;this.previousAction=null;this.previousHeading=this.navigation.heading;this.values={...this.readout.values,...this.navigation.state(),phase:0,travelPhase:'grounded',footTargets:{},contacts:{},accents:{head:0,abdomen:0}};this.updateFeet();}
  select(v,activity,dt){
    if(v.drive<.008){this.request='perch';this.candidate='perch';this.candidateAge=0;this.age=0;return;}
    if(!['grounded','flight'].includes(this.navigation.phase))return;
    const dn=this.readout.dn.map(i=>Math.max(0,activity[i]||0)),total=dn.reduce((s,a)=>s+a,0)||1,mix=dn.map(a=>a/total),[a=0,b=0,c=0,d=0]=mix,drive=v.drive,rise=v.rise;
    const scores={flight:.10+drive*.85+rise*14,walk:.23+drive*.43+b*.12,reverse:.06+drive*.20+d*.14,face:.20+(1-drive)*.18+c*.13,hands:.16+(1-drive)*.18+a*.14,front:.05+(1-drive)*.18+b*.13,hind:.03+(1-drive)*.16+d*.14,wings:.05+drive*.32+c*.12,head:.06+(1-drive)*.20+a*.12,abdomen:.05+drive*.20+d*.12,perch:.18+(1-drive)*.13};
    // Activity-dependent habituation permits sequential bouts under sustained
    // input; silence cannot drive a playlist. No random action timer is used.
    for(const key of Object.keys(scores)){const target=key===this.request?.85:0;this.fatigue[key]=(this.fatigue[key]||0)+dt*(target-(this.fatigue[key]||0))/(key===this.request?1.8:8);scores[key]-=this.fatigue[key];}
    const next=Object.keys(scores).reduce((best,key)=>scores[key]>scores[best]?key:best,'perch');
    this.age+=dt;if(next!==this.candidate){this.candidate=next;this.candidateAge=0;}else this.candidateAge+=dt;
    if(next!==this.request&&this.age>.9&&this.candidateAge>.24&&scores[next]>scores[this.request]+.035){this.request=next;this.age=0;}
    if(rise>.018&&this.age>.55&&this.navigation.phase==='grounded'){this.request='flight';this.age=0;}
  }
  step(activity,options={}){
    const dt=.01,v=this.readout.step(activity,{mode:'dance',action:'auto'});this.select(v,activity,dt);
    const speed=(this.request==='walk'||this.request==='reverse'?.20+.9*Math.sqrt(v.drive):1.25+3.5*Math.sqrt(v.drive))*(options.gentle?.5:1);
    const spatial=this.navigation.step(this.request,speed,dt,v.drive,v.rise);
    const turn=Math.atan2(Math.sin(spatial.heading-this.previousHeading),Math.cos(spatial.heading-this.previousHeading))/dt;this.previousHeading=spatial.heading;
    this.values={...v,...spatial,phase:v.phase,travelPhase:spatial.phase,turn,requestedAction:this.request,accents:{head:clamp(v.novelty*4),abdomen:clamp(v.drive*.35)},footTargets:{},contacts:{}};
    if(spatial.grounded&&['walk','reverse'].includes(spatial.action))this.gaitPhase+=dt*spatial.speed/.36;
    this.updateFeet();return this.values;
  }
  updateFeet(){
    const state=this.values,nav=this.navigation;if(!state.grounded){this.feet={};this.previousChain=null;if(nav.phase==='landing')state.landingFootTargets=Object.fromEntries(LEGS.map(leg=>[leg,pointOnBranch(nav.landing.chain,nav.landing.s+FOOT_ARC[leg])]));return;}
    const walk=['walk','reverse'].includes(state.action)&&state.speed>.001,direction=state.action==='reverse'?-1:1,duty=.62+.18*(1-state.drive);
    if(this.previousChain!==nav.support.chain||walk!==this.previousWalking||(walk&&direction!==this.previousDirection))this.feet={};
    for(const leg of LEGS){
      const arc=nav.s+FOOT_ARC[leg];let foot=this.feet[leg];if(!foot)foot=this.feet[leg]={anchor:nav.point(arc),swing:false};
      const phase=(this.gaitPhase+TRIPOD[leg])%1,swing=walk&&phase>=duty;
      if(swing&&!foot.swing){foot.start=[...foot.anchor];foot.end=nav.point(arc+direction*.16);}
      if(!swing&&foot.swing)foot.anchor=[...foot.end];
      if(!walk)foot.anchor=nav.point(arc);
      foot.swing=swing;let target=[...foot.anchor];
      if(swing){const t=(phase-duty)/(1-duty),ease=t*t*(3-2*t);target=lerp(foot.start,foot.end,ease);target[2]+=.18*Math.sin(Math.PI*t);}
      const free=(['face','hands'].includes(state.action)&&leg.endsWith('F'))||(state.action==='front'&&leg==='LF')||(state.action==='hind'&&leg==='RH');
      if(!free)state.footTargets[leg]=target;state.contacts[leg]=!swing&&!free;
    }
    this.previousChain=nav.support.chain;this.previousWalking=walk;this.previousDirection=direction;
  }
}

export function poseForBehavior(state,options={}){
  const base=poseFromMotor({...state,action:state.grounded?state.action:'flight',drive:Math.max(state.drive||0,state.grounded?0:.06)},options);
  base.lift=0;base.bodyYaw=0;
  if(!state.grounded){
    // Steady folded legs in cruise; coordinated extension only on final approach.
    const extension=state.landingProgress||0;
    for(const leg of LEGS)base.legs[leg]={swing:0,lift:.68*(1-extension),bend:.78*(1-extension),twist:0};
    base.wingSpread=-1.22;
    // Finish a geometrical landing even if audio falls silent; not a new neural response.
    const phase=state.time*10+state.phase,flap=.58*Math.sin(phase)*(options.gentle?.25:1);base.wings=[flap,flap];
    base.bodyRoll=clamp(-state.turn*.10,-.24,.24)*(options.gentle?.25:1);
  }else{
    // All non-grooming legs are solved onto the branch. Never run a walking cycle
    // underneath a standing, head, abdomen or front-leg grooming behavior.
    for(const leg of LEGS)if(state.footTargets?.[leg])base.legs[leg]={swing:0,lift:0,bend:0,twist:0};
    base.bodyRoll=0;
    if(state.action!=='wings'){base.wings=[0,0];base.wingSpread=0;}
    if(state.drive>.008){base.head[0]+=.06*(state.accents?.head||0)*Math.sin(state.phase);base.abdomen+=.07*(state.accents?.abdomen||0)*Math.sin(state.phase*.6);}
  }
  return base;
}
