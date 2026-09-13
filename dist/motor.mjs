// Kinematic readout ONLY. This does not simulate muscles, contact forces, or a VNC.
// Input is the existing neural activity vector, never audio samples, RMS or beats.
export const ACTIONS={auto:'神经状态自动切换',flight:'穿行',hover:'悬停',perch:'停驻',groom:'整理前足',walk:'向前走',reverse:'向后退',face:'搓脸',hands:'搓前足',front:'单抬左前足',hind:'单抬右后足',wings:'振翅',head:'摇头',abdomen:'摆腹部'};
export const MOTOR_SOURCES=Object.freeze({gf:[10010],descending:[10536,10446,10010,11072]});
export const ROOM_LIMITS=Object.freeze({x:7,y:5,zMin:.65,zMax:7.2});
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export class MotorController {
  constructor(nodes,navigation=null){this.nodes=nodes;this.navigation=navigation;this.gf=nodes.findIndex(n=>n.id===10010);this.dn=nodes.map((n,i)=>n.type.startsWith('DN')?i:-1).filter(i=>i>=0);this.reset();}
  reset(){this.navigation?.reset();this.time=0;this.phase=0;this.drive=0;this.fast=0;this.slow=0;this.previousGF=0;this.jump=0;this.cooldown=0;this.position=this.navigation?.position?[...this.navigation.position]:[-3.5,-2,ROOM_LIMITS.zMin];this.heading=.6;this.speed=0;this.turn=0;this.motionMode='perch';this.candidate='perch';this.candidateAge=0;this.modeAge=0;this.hasSignal=false;this.values={drive:0,descending:0,gf:0,novelty:0,rise:0,phase:0,jump:0,action:'idle',time:0,position:[...this.position],heading:this.heading,speed:0,turn:0};}
  step(activity,options={}){
    const dt=.01,gf=this.gf<0?0:activity[this.gf]||0,dn=this.dn.length?this.dn.reduce((s,i)=>s+(activity[i]||0),0)/this.dn.length:0;
    // Fixed scaling is a display-controller choice, not calibrated motor-neuron gain.
    const target=clamp(dn*12);this.drive+=(1-Math.exp(-dt/.12))*(target-this.drive);
    this.fast+=(1-Math.exp(-dt/.06))*(dn-this.fast);this.slow+=(1-Math.exp(-dt/.6))*(dn-this.slow);
    const novelty=clamp(Math.abs(this.fast-this.slow)*10),rise=clamp(Math.max(0,this.fast-this.slow)*10),moving=this.drive>.008;
    this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
    // GF is experimentally associated with rapid escape takeoff. Threshold/time-course are illustrative.
    if(gf>.004&&gf-this.previousGF>.0002&&this.cooldown===0){this.jump=1;this.cooldown=1.6;}
    this.previousGF=gf;this.jump*=Math.exp(-dt/.24);
    if(moving){this.phase+=dt*(.7+this.drive*3.2)*Math.PI*2;this.hasSignal=true;}
    // The decoder is deterministic and debounced, but its thresholds are display assumptions.
    const next=this.jump>.35||this.drive>.045&&rise>.008?'flight':this.drive<.012?'perch':this.drive<.07&&novelty<.012?'groom':'hover';
    if(next!==this.candidate){this.candidate=next;this.candidateAge=0;}else this.candidateAge+=dt;
    const delay={flight:.06,hover:.38,groom:.55,perch:.4}[next];
    if(next!==this.motionMode&&this.candidateAge>=delay){this.motionMode=next;this.modeAge=0;}else this.modeAge+=dt;
    const action=options.mode==='evidence'?'escape':!this.hasSignal?'idle':options.action&&options.action!=='auto'?options.action:this.motionMode;
    const flying=action==='flight',hovering=action==='hover',walking=['walk','reverse'].includes(action),grounding=['perch','groom'].includes(action),soft=options.gentle?.35:1,previousPosition=[...this.position],previousHeading=this.heading;
    // Spatial navigation is an explicit display policy, not a fitted flight controller.
    const border=Math.max(Math.abs(this.position[0])/ROOM_LIMITS.x,Math.abs(this.position[1])/ROOM_LIMITS.y),edgeSlow=clamp((.98-border)/.35,.08,1);
    const speedTarget=(flying?Math.sqrt(Math.max(0,this.drive-.008))*5.5*soft:walking?Math.sqrt(Math.max(0,this.drive-.008))*1.8*soft:0)*edgeSlow;
    this.speed+=(1-Math.exp(-dt/.25))*(speedTarget-this.speed);
    if(options.mode==='evidence')this.speed=0;
    if(this.speed<.002)this.speed=0;
    if(flying||walking||this.speed>0){
      const [x,y]=this.position,home=Math.atan2(-y,-x)+(action==='reverse'?Math.PI:0),error=Math.atan2(Math.sin(home-this.heading),Math.cos(home-this.heading));
      const boundaryWeight=clamp((border-.45)/.45),boundaryTurn=clamp(error,-1,1)*3.5*boundaryWeight;
      const neuralTurn=clamp((this.fast-this.slow)*90,-1.3,1.3);
      const desiredTurn=(neuralTurn*(1-boundaryWeight)+boundaryTurn)*soft;
      this.turn+=(1-Math.exp(-dt/.18))*(desiredTurn-this.turn);
      this.heading+=this.turn*dt;
      const direction=action==='reverse'?-1:1;
      this.position[0]=clamp(x+Math.cos(this.heading)*this.speed*dt*direction,-ROOM_LIMITS.x,ROOM_LIMITS.x);
      this.position[1]=clamp(y+Math.sin(this.heading)*this.speed*dt*direction,-ROOM_LIMITS.y,ROOM_LIMITS.y);
    }else{this.turn=0;}
    const targetHeight=flying?clamp(.9+this.drive*14+(this.fast-this.slow)*42,ROOM_LIMITS.zMin,ROOM_LIMITS.zMax):hovering?clamp(1.7+this.drive*8,1.7,5.8):grounding||walking?ROOM_LIMITS.zMin:this.position[2];
    this.position[2]=clamp(this.position[2]+(1-Math.exp(-dt/(grounding?.65:.9)))*(targetHeight-this.position[2]),ROOM_LIMITS.zMin,ROOM_LIMITS.zMax);if(grounding&&Math.abs(this.position[2]-ROOM_LIMITS.zMin)<1e-5)this.position[2]=ROOM_LIMITS.zMin;
    if(this.navigation?.position){
      this.position=[...this.navigation.advance(this.speed,dt,this.drive,rise,previousHeading)];
      const dx=this.position[0]-previousPosition[0],dy=this.position[1]-previousPosition[1];
      this.heading=previousHeading;
      if(Math.hypot(dx,dy)>.00001){const desired=Math.atan2(dy,dx),error=Math.atan2(Math.sin(desired-previousHeading),Math.cos(desired-previousHeading));this.turn=clamp(error*5,-2,2);this.heading+=this.turn*dt;}else this.turn=0;
    }
    this.values={drive:this.drive,descending:dn,gf,novelty,rise,phase:this.phase,jump:this.jump,action,time:this.time,position:[...this.position],heading:this.heading,speed:this.speed,turn:this.turn};return this.values;
  }
}

export function poseFromMotor(state,options={}){
  const evidence=options.mode==='evidence',gentle=options.gentle?.25:1,amp=clamp(Math.sqrt(Math.max(0,state.drive-.008))*(options.boost??2.2)*1.6,0,2.4)*gentle,p=state.phase;
  const out={legs:{},head:[0,0,0],abdomen:0,wings:[0,0],wingSpread:0,lift:0,bodyRoll:0,bodyYaw:0,travel:0,drive:state.drive};
  for(const side of ['L','R'])for(const part of ['F','M','H'])out.legs[side+part]={swing:0,lift:0,bend:0,twist:0};
  if(evidence){const j=state.jump*gentle;for(const key of ['LM','RM'])out.legs[key]={swing:0,lift:-.45*j,bend:-.45*j,twist:0};out.wingSpread=-1.05*j;out.wings=[.25*j,.25*j];out.lift=.18*j;return out;}
  if(state.action==='idle'||amp<.005)return out;
  if(['flight','hover'].includes(state.action)){
    const hover=state.action==='hover',offsets={LF:0,LM:1.7,LH:3.4,RF:.8,RM:2.5,RH:4.2};
    for(const [key,offset]of Object.entries(offsets)){const q=p*(hover?.75:1)+offset;out.legs[key]={swing:.1*Math.sin(q*.7)*gentle,lift:.60-.10*Math.sin(q)*gentle,bend:.50+.12*Math.sin(q+.4)*gentle,twist:.10*Math.sin(q*.8)*gentle};}
    out.wingSpread=hover?-1.18:-1.30;const flap=(hover?.55:.70)*Math.sin(p*(hover?2:2.4))*gentle;out.wings=[flap,flap];
    out.head=[.05*Math.sin(p*.4)*amp,0,0];out.abdomen=.035*Math.sin(p*.7)*amp;
    out.bodyRoll=clamp(-(state.turn||0)*.16,-.32,.32)*gentle;return out;
  }
  if(state.action==='perch')return out;
  if(state.action==='groom'){
    const airborne=(state.position?.[2]??0)>ROOM_LIMITS.zMin+.18;if(airborne){out.wingSpread=-1.05;out.wings=[.32*Math.sin(p*2.5),.32*Math.sin(p*2.5)];}
    for(const key of ['LM','LH','RM','RH']){const q=p+({LM:0,LH:1.6,RM:3.1,RH:4.7}[key]);out.legs[key]={swing:.07*Math.sin(q),lift:.12+.04*Math.sin(q),bend:.14+.05*Math.cos(q),twist:.04*Math.sin(q*.7)};}
    for(const side of ['L','R']){const q=p*1.8+(side==='L'?0:Math.PI);out.legs[side+'F']={swing:.30+.10*Math.sin(q),lift:.50+.10*Math.cos(q),bend:.48+.14*Math.sin(q),twist:.28};}
    out.head=[.08*Math.sin(p),.03*Math.cos(p*.7),0];return out;
  }
  const step=(p,scale=1)=>({swing:.35*Math.sin(p)*amp*scale,lift:.34*Math.max(0,Math.cos(p))*amp*scale,bend:.42*Math.max(0,Math.cos(p))*amp*scale,twist:0});
  const tripod={LF:0,RM:0,LH:0,RF:Math.PI,LM:Math.PI,RH:Math.PI};
  for(const [key,offset] of Object.entries(tripod))out.legs[key]=step(p+offset,.22);
  out.bodyRoll=.10*Math.sin(p*.5)*amp;out.abdomen=.10*Math.sin(p*.7)*amp;out.head=[.065*Math.sin(p*.7)*amp,0,0];
  if(['walk','reverse'].includes(state.action)){for(const [key,offset]of Object.entries(tripod))out.legs[key]=step((state.action==='reverse'?-p:p)+offset);out.travel=(state.action==='reverse'?-1:1)*.23*amp;out.lift=.018*(1+Math.sin(p*2))*amp;}
  if(['face','hands'].includes(state.action)){const face=state.action==='face';for(const side of ['L','R']){const sign=side==='L'?1:-1;out.legs[side+'F']={swing:((face?.42:.3)+.08*Math.sin(p))*amp,lift:((face?.54:.4)+.07*Math.sin(p*2))*amp,bend:(.42+.18*Math.sin(p*2+sign*.5))*amp,twist:(face?.3:.45)*amp};}out.head=[.12*Math.sin(p)*amp,.05*Math.sin(p*.6)*amp,0];}
  if(state.action==='front'){out.legs.LF={swing:.3*Math.sin(p)*amp,lift:.85*amp,bend:.3*Math.sin(p*1.7)*amp,twist:.2*amp};}
  if(state.action==='hind'){out.legs.RH={swing:.4*Math.sin(p)*amp,lift:.7*amp,bend:.35*Math.sin(p*1.5)*amp,twist:0};}
  // Right-wing axes are already mirrored in the rig; equal angles make symmetric flaps.
  if(state.action==='wings'){out.wingSpread=-1.3;const flap=.7*Math.sin(p*3)*gentle;out.wings=[flap,flap];out.bodyRoll=.1*Math.sin(p)*amp;}
  if(state.action==='head')out.head=[.22*Math.sin(p)*amp,.25*Math.sin(p*.7)*amp,.12*Math.cos(p)*amp];
  if(state.action==='abdomen'){out.abdomen=.25*Math.sin(p)*amp;out.bodyYaw=.12*Math.cos(p*.5)*amp;}
  return out;
}
