// A single, rigid transform shared by the renderer and the navigation clearance map.
export const FOREST_WIDTH=46;
export const FLY_CLEARANCE=1.8;
export function neuralGeometry(nodes){
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const n of nodes)for(const p of n.skeleton||[])if(p[3]<=43000)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k+1]);hi[k]=Math.max(hi[k],p[k+1]);}
  const center=lo.map((x,k)=>(x+hi[k])/2),scale=FOREST_WIDTH/Math.max(...hi.map((x,k)=>x-lo[k]));
  const xyz=p=>[(p[1]-center[0])*scale,-(p[2]-center[1])*scale,4-(p[3]-center[2])*scale];
  return nodes.map(n=>{
    const map=new Map((n.skeleton||[]).map(p=>[p[0],p])),segments=[],dots=[];
    for(let i=0;i<(n.skeleton||[]).length;i++){
      const p=n.skeleton[i],parent=map.get(p[4]);if(p[3]>43000)continue;
      if(parent&&parent[3]<=43000)segments.push(...xyz(p),...xyz(parent));
      // Sparse, fixed markers at source vertices; these are not measured synapses.
      if(i%96===Math.abs(Number(n.id)||0)%96)dots.push(...xyz(p));
    }
    return {segments,dots};
  });
}
const distance=(a,b)=>Math.hypot(...a.map((x,k)=>x-b[k]));

// Clearance is an engineering display constraint, not a biological sensory model.
// Sample original segments densely, inflate them conservatively, then route through
// connected empty cells. Every traversed edge is checked, including vertical edges.
export class GapNavigator {
  constructor(geometry,limits){
    this.limits=limits;this.buckets=new Map();this.cellSize=2;this.nodes=[];
    const key=p=>p.map(v=>Math.floor(v/this.cellSize)).join(',');
    for(const g of geometry)for(let i=0;i<g.segments.length;i+=6){
      const a=g.segments.slice(i,i+3),b=g.segments.slice(i+3,i+6),steps=Math.max(1,Math.ceil(distance(a,b)/.3));
      for(let j=0;j<=steps;j++){
        const p=a.map((v,k)=>v+(b[k]-v)*j/steps);
        if(Math.abs(p[0])>limits.x+3||Math.abs(p[1])>limits.y+3||p[2]<limits.zMin-3||p[2]>limits.zMax+3)continue;
        const k=key(p);if(!this.buckets.has(k))this.buckets.set(k,[]);this.buckets.get(k).push(p);
      }
    }
    const grid=new Map(),spacing=1.5;
    for(let ix=0;ix<=Math.floor(limits.x*2/spacing);ix++)for(let iy=0;iy<=Math.floor(limits.y*2/spacing);iy++)for(let iz=0;iz<=Math.floor((limits.zMax-limits.zMin)/spacing);iz++){
      const p=[-limits.x+ix*spacing,-limits.y+iy*spacing,limits.zMin+iz*spacing];
      if(!this.clear(p))continue;
      const n={p,grid:[ix,iy,iz],links:[]};grid.set(n.grid.join(','),this.nodes.length);this.nodes.push(n);
    }
    this.nodes.forEach((n,i)=>{
      for(const axis of [0,1,2])for(const sign of [-1,1]){
        const g=[...n.grid];g[axis]+=sign;const j=grid.get(g.join(','));
        if(j!==undefined&&this.clearPath(n.p,this.nodes[j].p))n.links.push(j);
      }
    });
    const visited=new Set();let component=[];
    this.nodes.forEach((n,i)=>{
      if(visited.has(i))return;const queue=[i];visited.add(i);
      for(let head=0;head<queue.length;head++)for(const j of this.nodes[queue[head]].links)if(!visited.has(j)){visited.add(j);queue.push(j);}
      if(queue.length>component.length)component=queue;
    });
    this.component=component;
    this.start=component.reduce((best,i)=>distance(this.nodes[i].p,[-3.5,-2,3])<distance(this.nodes[best].p,[-3.5,-2,3])?i:best,component[0]);
    this.reset();
  }
  clear(p){
    const cell=p.map(v=>Math.floor(v/this.cellSize)),r2=(FLY_CLEARANCE+.16)**2;
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      const bucket=this.buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','));if(!bucket)continue;
      for(const q of bucket)if((p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2<r2)return false;
    }
    return true;
  }
  clearPath(a,b){const count=Math.max(1,Math.ceil(distance(a,b)/.2));for(let i=0;i<=count;i++)if(!this.clear(a.map((v,k)=>v+(b[k]-v)*i/count)))return false;return true;}
  reset(){this.current=this.start;this.route=[];this.visits=new Map();this.position=this.start===undefined?null:[...this.nodes[this.start].p];}
  plan(drive,rise,heading){
    if(this.current===undefined)return;
    const origin=this.nodes[this.current].p,parent=new Map([[this.current,-1]]),queue=[this.current];
    for(let h=0;h<queue.length;h++)for(const j of this.nodes[queue[h]].links)if(!parent.has(j)){parent.set(j,queue[h]);queue.push(j);}
    let target=this.current,best=-Infinity;
    const preferredHeight=Math.min(this.limits.zMax,2+drive*14+rise*7);
    for(const i of queue){
      const p=this.nodes[i].p,d=distance(origin,p);if(d<5)continue;
      const alignment=((p[0]-origin[0])*Math.cos(heading)+(p[1]-origin[1])*Math.sin(heading))/(d||1);
      const score=Math.min(d,10)+alignment*2-Math.abs(p[2]-preferredHeight)*.8-(this.visits.get(i)||0)*3;
      if(score>best){best=score;target=i;}
    }
    if(target===this.current)target=this.nodes[this.current].links[0]??this.current;
    const path=[];for(let i=target;i!==this.current&&i!==-1;i=parent.get(i)??-1)path.unshift(i);
    // Remove grid stair steps only when the same clearance check approves the shortcut.
    this.route=[];let anchor=origin;
    while(path.length){let far=path.length-1;while(far>0&&!this.clearPath(anchor,this.nodes[path[far]].p))far--;const i=path[far];this.route.push(i);anchor=this.nodes[i].p;path.splice(0,far+1);}
    this.visits.set(target,(this.visits.get(target)||0)+1);
  }
  advance(speed,dt,drive,rise,heading){
    if(!this.position||speed<=0)return this.position;
    if(!this.route.length)this.plan(drive,rise,heading);
    let travel=speed*dt;
    while(travel>0&&this.route.length){
      const next=this.route[0],target=this.nodes[next].p,d=distance(this.position,target);
      if(d<=travel){this.position=[...target];travel-=d;this.current=next;this.route.shift();}
      else{this.position=this.position.map((v,k)=>v+(target[k]-v)*travel/d);travel=0;}
    }
    return this.position;
  }
}
