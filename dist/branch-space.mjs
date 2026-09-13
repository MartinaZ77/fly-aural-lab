import {GapNavigator} from './neural-space.mjs';

export const PERCH_HEIGHT=.78;
const length=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const lerp=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function seededRandom(seed){let state=seed>>>0;return()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}

// Original parent-child segments, assembled into unbranched polylines. No new
// neural links or landing platforms are invented between distinct branches.
export function branchChains(geometry){
  const chains=[];
  geometry.forEach((g,neuron)=>{
    const vertices=new Map(),edges=[];
    const vertex=p=>{const key=p.join(',');if(!vertices.has(key))vertices.set(key,{p,edges:[]});return vertices.get(key);};
    for(let i=0;i<g.segments.length;i+=6){const a=vertex(g.segments.slice(i,i+3)),b=vertex(g.segments.slice(i+3,i+6));if(length(a.p,b.p)<1e-7)continue;const edge={a,b,used:false};a.edges.push(edge);b.edges.push(edge);edges.push(edge);}
    const follow=(start,edge)=>{const points=[start.p];let current=start;
      while(edge&&!edge.used){edge.used=true;current=edge.a===current?edge.b:edge.a;points.push(current.p);edge=current.edges.length===2?current.edges.find(e=>!e.used):null;}
      const cumulative=[0];for(let i=1;i<points.length;i++)cumulative.push(cumulative.at(-1)+length(points[i-1],points[i]));
      if(cumulative.at(-1)>2.8)chains.push({neuron,points,cumulative,length:cumulative.at(-1)});
    };
    for(const v of vertices.values())if(v.edges.length!==2)for(const e of v.edges)if(!e.used)follow(v,e);
    for(const e of edges)if(!e.used)follow(e.a,e);
  });return chains;
}
export function pointOnBranch(chain,s){
  s=clamp(s,0,chain.length);let lo=1,hi=chain.cumulative.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(chain.cumulative[mid]<s)lo=mid+1;else hi=mid;}
  const start=chain.cumulative[lo-1],span=chain.cumulative[lo]-start;
  return lerp(chain.points[lo-1],chain.points[lo],span?(s-start)/span:0);
}

class RandomGapNavigator extends GapNavigator {
  constructor(geometry,limits,random){super(geometry,limits);this.random=random;this.recent=[];}
  routeTo(target){
    const parent=new Map([[this.current,-1]]),queue=[this.current];
    for(let h=0;h<queue.length&&!parent.has(target);h++)for(const j of this.nodes[queue[h]].links)if(!parent.has(j)){parent.set(j,queue[h]);queue.push(j);}
    if(!parent.has(target))return false;
    const path=[];for(let i=target;i!==this.current;i=parent.get(i))path.unshift(i);
    this.route=[];let anchor=this.position;
    while(path.length){let far=path.length-1;while(far>0&&!this.clearPath(anchor,this.nodes[path[far]].p))far--;const i=path[far];this.route.push(i);anchor=this.nodes[i].p;path.splice(0,far+1);}
    return true;
  }
  plan(drive,rise){
    const origin=this.position;let target=this.current,best=-Infinity;
    for(const i of this.component){const p=this.nodes[i].p,d=length(origin,p);if(d<4)continue;
      const score=this.random()*8+Math.min(d,9)*.45-Math.abs(p[2]-(2+drive*4+rise*4))*.2-(this.visits.get(i)||0)*.4-(this.recent.includes(i)?12:0);
      if(score>best){target=i;best=score;}
    }
    if(target===this.current)target=this.nodes[this.current].links[0]??this.current;
    this.routeTo(target);this.visits.set(target,(this.visits.get(target)||0)+1);this.recent.push(target);if(this.recent.length>7)this.recent.shift();
  }
}

// Geometric perching and navigation, not MuJoCo, adhesion or a biological VNC.
export class BranchNavigator {
  constructor(geometry,limits,seed=1){
    this.limits=limits;this.seed=seed;this.random=seededRandom(seed);this.air=new RandomGapNavigator(geometry,limits,this.random);
    this.chains=branchChains(geometry);this.supports=[];
    for(const chain of this.chains)for(let s=1.25;s<chain.length-1.25;s+=.8){
      const p=pointOnBranch(chain,s),a=pointOnBranch(chain,s-.8),b=pointOnBranch(chain,s+.8);
      if(Math.abs(p[0])>limits.x-1||Math.abs(p[1])>limits.y-1||p[2]<limits.zMin||p[2]>limits.zMax-2.5||Math.abs(a[2]-b[2])>.65)continue;
      const root=[p[0],p[1],p[2]+PERCH_HEIGHT],approach=[p[0],p[1],p[2]+2.45];
      if(!this.air.clear(approach)||!this.landingClear(root,approach))continue;
      let node=-1,best=Infinity;
      for(const i of this.air.component){const d=length(approach,this.air.nodes[i].p);if(d<best&&d<3&&this.air.clearPath(approach,this.air.nodes[i].p)){node=i;best=d;}}
      if(node>=0)this.supports.push({chain,s,p,root,approach,node});
    }
    if(!this.supports.length)throw new Error('当前骨架没有找到可到达的落脚线段');
    this.initial=this.supports.reduce((best,p)=>length(p.root,[-3,-2,3])<length(best.root,[-3,-2,3])?p:best,this.supports[0]);this.reset();
  }
  bodyClear(p){
    const cell=p.map(v=>Math.floor(v/this.air.cellSize));
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const q of this.air.buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))||[])if(length(p,q)<.57)return false;
    return true;
  }
  landingClear(a,b){const steps=Math.max(1,Math.ceil(length(a,b)/.15));for(let i=0;i<=steps;i++)if(!this.bodyClear(lerp(a,b,i/steps)))return false;return true;}
  reset(){this.random=seededRandom(this.seed);this.air.random=this.random;this.air.reset();this.air.recent=[];this.support=this.initial;this.s=this.support.s;this.position=[...this.support.root];this.phase='grounded';this.route=[];this.landing=null;this.distanceFlown=0;this.setSurfaceHeading();}
  point(s){return pointOnBranch(this.support.chain,s);}
  setSurfaceHeading(){const a=this.point(this.s-.3),b=this.point(this.s+.3);this.heading=Math.atan2(b[1]-a[1],b[0]-a[0]);}
  moveRoute(speed,dt){let remaining=speed*dt;
    while(remaining>0&&this.route.length){const target=this.route[0],d=length(this.position,target);if(d<=remaining){this.position=[...target];this.route.shift();remaining-=d;}else{this.position=lerp(this.position,target,remaining/d);remaining=0;}}
    return !this.route.length;
  }
  prepareLanding(){
    // Finish the current checked route leg before changing paths; its start node
    // must never be substituted for the fly's current mid-edge position.
    this.landing=this.supports.reduce((best,p)=>length(p.approach,this.air.position)<length(best.approach,this.air.position)?p:best,this.supports[0]);
    const routePrefix=this.air.route.length?[this.air.route[0]]:[];
    if(routePrefix.length){const anchor=routePrefix[0],position=[...this.air.position],current=this.air.current;this.air.position=this.air.nodes[anchor].p;this.air.current=anchor;this.air.routeTo(this.landing.node);this.air.route=[anchor,...this.air.route];this.air.position=position;this.air.current=current;}else this.air.routeTo(this.landing.node);
    this.phase='returning';
  }
  step(request,speed,dt,drive,rise){
    const previous=[...this.position];
    if(this.phase==='grounded'){
      if(request==='flight'){
        // A walk may finish away from the original landing spot: walk back on the
        // same branch before using its pre-checked takeoff corridor.
        if(Math.abs(this.s-this.support.s)>.02){const sign=Math.sign(this.support.s-this.s);this.s+=sign*Math.min(.65*dt,Math.abs(this.support.s-this.s));const p=this.point(this.s);this.position=[p[0],p[1],p[2]+PERCH_HEIGHT];this.setSurfaceHeading();return this.state(sign>0?'walk':'reverse',.65);}
        this.route=[[...this.support.approach],[...this.air.nodes[this.support.node].p]];this.phase='takeoff';
      }else if(request==='walk'||request==='reverse'){
        const next=clamp(this.s+(request==='reverse'?-1:1)*speed*dt,1.25,this.support.chain.length-1.25),p=this.point(next),root=[p[0],p[1],p[2]+PERCH_HEIGHT];
        if(Math.abs(root[0])<=this.limits.x&&Math.abs(root[1])<=this.limits.y&&root[2]>=this.limits.zMin&&root[2]<=this.limits.zMax&&Math.abs(next-this.support.s)<1.2&&this.landingClear(this.position,root)){this.s=next;this.position=root;this.setSurfaceHeading();}
      }
    }
    if(this.phase==='takeoff'){
      if(this.moveRoute(2.8,dt)){this.phase='flight';this.air.current=this.support.node;this.air.position=[...this.position];this.air.route=[];}
    }else if(this.phase==='flight'){
      if(request!=='flight')this.prepareLanding();
      else this.position=[...this.air.advance(Math.max(1.25,speed),dt,drive,rise,this.heading)];
    }
    if(this.phase==='returning'){
      if(this.air.route.length)this.position=[...this.air.advance(Math.max(1.7,speed),dt,drive,rise,this.heading)];
      if(!this.air.route.length){this.phase='landing';this.route=[[...this.landing.approach],[...this.landing.root]];}
    }
    if(this.phase==='landing'){
      // Align with the support before feet finish extending, not after contact.
      const a=pointOnBranch(this.landing.chain,this.landing.s-.3),b=pointOnBranch(this.landing.chain,this.landing.s+.3),desired=Math.atan2(b[1]-a[1],b[0]-a[0]);
      this.heading+=clamp(Math.atan2(Math.sin(desired-this.heading),Math.cos(desired-this.heading)),-dt*3.5,dt*3.5);
      if(this.moveRoute(1.8,dt)){this.support=this.landing;this.s=this.support.s;this.phase='grounded';this.setSurfaceHeading();}
    }
    const d=length(previous,this.position);if(this.phase!=='grounded')this.distanceFlown+=d;
    if(!['grounded','landing'].includes(this.phase)&&Math.hypot(this.position[0]-previous[0],this.position[1]-previous[1])>.00001){const desired=Math.atan2(this.position[1]-previous[1],this.position[0]-previous[0]);this.heading+=clamp(Math.atan2(Math.sin(desired-this.heading),Math.cos(desired-this.heading)),-dt*2.5,dt*2.5);}
    return this.state(this.phase==='grounded'&&['walk','reverse'].includes(request)&&d<1e-8?'perch':request,d/dt);
  }
  state(request='perch',speed=0){const target=this.landing?.root,remaining=target?length(this.position,target):99;
    return {position:[...this.position],heading:this.heading,speed,phase:this.phase,grounded:this.phase==='grounded',action:this.phase==='grounded'?request:this.phase==='landing'?'landing':this.phase==='takeoff'?'takeoff':'flight',landingProgress:this.phase==='landing'?clamp(1-remaining/1.8,0,1):0,support:this.phase==='grounded'?{neuron:this.support.chain.neuron,point:this.point(this.s),arc:this.s}:null};
  }
}
