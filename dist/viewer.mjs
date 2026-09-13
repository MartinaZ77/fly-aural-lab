import {transmitterSign} from './simulation.mjs';
import {colorOf} from './neural-display.mjs';
export {colorOf,NEURON_COLORS} from './neural-display.mjs';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function fitCanvas(canvas) {
  const box=canvas.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
  const w=Math.round(box.width),h=Math.round(box.height);
  const changed=canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr);
  if(changed){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
  return {ctx,w,h,changed};
}
export class SkeletonViewer {
  constructor(canvas,data) {
    this.canvas=canvas;this.data=data;this.yaw=0;this.pitch=0;this.zoom=1;this.dirty=true;
    this.visible=null;this.showEdges=true;this.showGlow=true;
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const n of data.nodes) for(const p of n.skeleton) for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[j+1]);max[j]=Math.max(max[j],p[j+1]);}
    this.center=min.map((v,i)=>(v+max[i])/2);this.extent=Math.max(...max.map((v,i)=>v-min[i]));
    this.geometry=data.nodes.map(n=>{
      const points=n.skeleton.map(p=>[p[0],...(p.slice(1,4).map((x,j)=>(x-this.center[j])/this.extent)),p[4]]);
      const map=new Map(points.map(p=>[p[0],p]));
      return {points,map,center:[1,2,3].map(j=>points.reduce((a,p)=>a+p[j],0)/points.length)};
    });
    this.index=new Map(data.nodes.map((n,i)=>[String(n.id),i]));
    this.edges=data.edges.map(e=>({...e,from:this.index.get(String(e.source)),to:this.index.get(String(e.target)),modeled:transmitterSign(data.nodes[this.index.get(String(e.source))].nt)!==0}));
    canvas.addEventListener('pointerdown',e=>{this.drag={x:e.clientX,y:e.clientY,moved:0};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!this.drag)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;this.yaw+=dx*.007;this.pitch=clamp(this.pitch+dy*.007,-Math.PI/2,Math.PI/2);this.drag.moved+=Math.abs(dx)+Math.abs(dy);this.drag.x=e.clientX;this.drag.y=e.clientY;this.dirty=true;});
    canvas.addEventListener('pointerup',()=>{this.drag=null;});
    canvas.addEventListener('pointercancel',()=>{this.drag=null;});
    canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=clamp(this.zoom*Math.exp(-e.deltaY*.001),.45,5);this.dirty=true;},{passive:false});
    canvas.addEventListener('dblclick',()=>this.reset());
    canvas.addEventListener('keydown',e=>{
      if(e.ctrlKey||e.metaKey||e.altKey)return;
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','0'].includes(e.key))return;e.preventDefault();
      if(e.key==='0')this.reset();
      else if(e.key==='ArrowLeft')this.yaw-=.1;else if(e.key==='ArrowRight')this.yaw+=.1;
      else if(e.key==='ArrowUp')this.pitch=clamp(this.pitch-.1,-Math.PI/2,Math.PI/2);else if(e.key==='ArrowDown')this.pitch=clamp(this.pitch+.1,-Math.PI/2,Math.PI/2);
      else this.zoom=clamp(this.zoom*(e.key==='-'?.9:1.1),.45,5);this.dirty=true;
    });
  }
  reset(){this.yaw=0;this.pitch=0;this.zoom=1;this.dirty=true;}
  rotate(p){const c=Math.cos(this.yaw),s=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);const x=p[0]*c+p[2]*s,z=-p[0]*s+p[2]*c;return [x,p[1]*cp-z*sp];}
  project(p,w,h){const q=this.rotate(p);return [w/2+(q[0]-this.cameraCenter[0])*this.cameraScale,h/2+(q[1]-this.cameraCenter[1])*this.cameraScale];}
  rebuild(w,h){
    // Fit the projected geometry, not the longest 3D axis (descending axons can be very long).
    const min=[Infinity,Infinity],max=[-Infinity,-Infinity];for(const g of this.geometry)for(const p of g.points){const q=this.rotate(p.slice(1,4));for(let j=0;j<2;j++){min[j]=Math.min(min[j],q[j]);max[j]=Math.max(max[j],q[j]);}}
    this.cameraCenter=min.map((v,i)=>(v+max[i])/2);this.cameraScale=Math.min(w*.82/(max[0]-min[0]),h*.78/(max[1]-min[1]))*this.zoom;
    this.paths=this.geometry.map(g=>{const path=new Path2D();for(const p of g.points){const parent=g.map.get(p[4]);if(!parent)continue;const a=this.project(p.slice(1,4),w,h),b=this.project(parent.slice(1,4),w,h);path.moveTo(...a);path.lineTo(...b);}return path;});this.centers=this.geometry.map(g=>this.project(g.center,w,h));this.dirty=false;
  }
  draw(frame){const {ctx,w,h,changed}=fitCanvas(this.canvas);if(changed||this.dirty)this.rebuild(w,h);ctx.clearRect(0,0,w,h);
    // Edges are static structural annotations, not measured travelling impulses.
    if(this.showEdges){for(const e of this.edges){if(this.visible&&(!this.visible.has(e.from)||!this.visible.has(e.to)))continue;const a=this.centers[e.from],b=this.centers[e.to];ctx.strokeStyle=colorOf(this.data.nodes[e.from]);ctx.globalAlpha=.09;ctx.lineWidth=.4+Math.log1p(e.weight)/4;ctx.setLineDash(e.modeled?[]:[3,4]);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();ctx.setLineDash([]);}}
    this.paths.forEach((path,i)=>{const style=frame.byId[String(this.data.nodes[i].id)];ctx.strokeStyle=style.color;ctx.lineWidth=.8;if(style.glowOpacity>0){ctx.globalAlpha=style.glowOpacity;ctx.shadowColor=style.color;ctx.shadowBlur=6;ctx.stroke(path);ctx.shadowBlur=0;}ctx.globalAlpha=style.opacity;ctx.stroke(path);});ctx.globalAlpha=1;
    // Axis directions show the current camera, using the actual XYZ coordinate system.
    const origin=[w-44,h-43],scale=20;
    [[1,0,0,'X','#ff8873'],[0,1,0,'Y','#7ee7e1'],[0,0,1,'Z','#f6b960']].forEach(p=>{const q=this.project(p,w,h),c=this.project([0,0,0],w,h),factor=scale/this.cameraScale;ctx.strokeStyle=p[4];ctx.fillStyle=p[4];ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(...origin);ctx.lineTo(origin[0]+(q[0]-c[0])*factor,origin[1]+(q[1]-c[1])*factor);ctx.stroke();ctx.font='12px system-ui';ctx.fillText(p[3],origin[0]+(q[0]-c[0])*factor+3,origin[1]+(q[1]-c[1])*factor);});
    return this.extent*.008/this.cameraScale; // micrometres per CSS pixel
  }
}

export function drawPattern(canvas,mode,data,geometry,activity,history,time,reduced=false){const {ctx,w,h}=fitCanvas(canvas);ctx.clearRect(0,0,w,h);const size=Math.min(w,h),n=data.nodes.length;
  if(mode==='field'){
    const xs=geometry.map(g=>g.center[0]),ys=geometry.map(g=>g.center[1]),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),s=Math.min(w*.7/(xmax-xmin||1),h*.6/(ymax-ymin||1));
    ctx.globalCompositeOperation='screen';geometry.forEach((g,i)=>{const a=activity[i],x=w/2+(g.center[0]-(xmin+xmax)/2)*s,y=h/2+(g.center[1]-(ymin+ymax)/2)*s,r=14+a*size*.22;const grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,colorOf(data.nodes[i])+(Math.round((.03+a*.45)*255).toString(16).padStart(2,'0')));grad.addColorStop(1,'#00000000');ctx.fillStyle=grad;ctx.fillRect(x-r,y-r,r*2,r*2);if(a>.05){ctx.strokeStyle=colorOf(data.nodes[i]);ctx.globalAlpha=a*.35;ctx.beginPath();ctx.ellipse(x,y,r*.5,r*.25,Math.sin(i)*2,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}});ctx.globalCompositeOperation='source-over';
  }else if(mode==='orbit'){
    const cx=w/2,cy=h/2-8;ctx.strokeStyle='#203945';ctx.lineWidth=1;[.18,.29,.4].forEach(r=>{ctx.beginPath();ctx.arc(cx,cy,size*r,0,2*Math.PI);ctx.stroke();});
    data.nodes.forEach((node,i)=>{const a=activity[i],base=i/n*Math.PI*2-Math.PI/2,r=size*(.18+.22*a);ctx.strokeStyle=colorOf(node);ctx.globalAlpha=.13+a*.8;ctx.beginPath();ctx.arc(cx,cy,r,base,base+Math.PI*2/n*.7);ctx.stroke();const phase=reduced?0:time*.12*a;const x=cx+Math.cos(base+phase)*r,y=cy+Math.sin(base+phase)*r;ctx.beginPath();ctx.moveTo(cx+Math.cos(base)*size*.1,cy+Math.sin(base)*size*.1);ctx.lineTo(x,y);ctx.stroke();ctx.fillStyle=colorOf(node);ctx.beginPath();ctx.arc(x,y,1+a*3,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;
  }else{
    const left=52,top=22,bottom=44,rh=(h-top-bottom)/n,cw=(w-left-16)/160;ctx.fillStyle='#90a9b3';ctx.font='11px system-ui';
    data.nodes.forEach((node,i)=>{if(i===0||node.role!==data.nodes[i-1].role||node.type.slice(0,4)!==data.nodes[i-1].type.slice(0,4))ctx.fillText(node.type.slice(0,5),5,top+i*rh+8);});
    history.forEach((row,j)=>row.forEach((a,i)=>{ctx.globalAlpha=.03+Math.min(1,a);ctx.fillStyle=colorOf(data.nodes[i]);ctx.fillRect(left+(160-history.length+j)*cw,top+i*rh,cw+1,Math.max(1,rh-1));}));ctx.globalAlpha=1;ctx.fillStyle='#9aaeb4';ctx.fillText('−8 s',left,h-30);ctx.fillText('现在',w-44,h-30);
  }
  if(!activity.some(a=>a>.005)){ctx.fillStyle='#7e969e';ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText('等待声音输入',w/2,h/2);ctx.textAlign='left';}
}
export function drawTimeline(canvas,history){const {ctx,w,h}=fitCanvas(canvas);ctx.clearRect(0,0,w,h);ctx.strokeStyle='#20333f';ctx.lineWidth=1;for(let i=0;i<=8;i++){ctx.beginPath();ctx.moveTo(i*w/8,0);ctx.lineTo(i*w/8,h);ctx.stroke();}['#d6e4e6','#7ee7e1','#f6b960'].forEach((color,k)=>{ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.beginPath();history.forEach((row,j)=>{const value=k===2?row[k]:1-Math.exp(-8*row[k]);const x=(800-history.length+j)/800*w,y=h-6-value*(h-12);j===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.stroke();});}
