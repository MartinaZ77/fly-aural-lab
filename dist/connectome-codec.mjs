const FORMAT='fly-aural-connectome-delta-v1';
const coordinate=i=>i>0&&i<4;
const validScale=s=>Number.isSafeInteger(s)&&s>0&&10**Math.round(Math.log10(s))===s;

// Lossless transport only: all coordinates, parent links and metadata survive.
export function encodeConnectome(graph){
  if(!Array.isArray(graph?.nodes))throw new Error('Invalid connectome nodes');
  const rows=graph.nodes.flatMap(n=>n.skeleton);
  if(rows.some(p=>!Array.isArray(p)||p.length!==5||p.some((v,i)=>!Number.isFinite(v)||Object.is(v,-0)||(!coordinate(i)&&!Number.isSafeInteger(v)))))throw new Error('Invalid skeleton row');
  let scale;
  for(let s=1;Number.isSafeInteger(s);s*=10){
    if(rows.every(p=>p.slice(1,4).every(v=>Number.isSafeInteger(Math.round(v*s))&&Math.round(v*s)/s===v))){scale=s;break;}
  }
  if(scale===undefined)throw new Error('Coordinates cannot be encoded losslessly');
  const nodes=graph.nodes.map(n=>{
    const previous=[0,0,0,0,0],skeleton=[];
    for(const row of n.skeleton)row.forEach((v,i)=>{
      const integer=coordinate(i)?Math.round(v*scale):v,delta=integer-previous[i];
      if(!Number.isSafeInteger(delta))throw new Error('Skeleton delta exceeds safe precision');
      skeleton.push(delta);previous[i]=integer;
    });
    return {...n,skeleton};
  });
  return {format:FORMAT,scale,graph:{...graph,nodes}};
}

export function decodeConnectome(packed){
  if(packed?.format!==FORMAT||!validScale(packed.scale)||!Array.isArray(packed.graph?.nodes))throw new Error('Unsupported packed connectome format');
  const nodes=packed.graph.nodes.map(n=>{
    if(!Array.isArray(n.skeleton)||n.skeleton.length%5)throw new Error('Invalid packed skeleton');
    const previous=[0,0,0,0,0],skeleton=[];
    for(let j=0;j<n.skeleton.length;j+=5){
      const row=[];
      for(let i=0;i<5;i++){
        const delta=n.skeleton[j+i],integer=previous[i]+delta;
        if(!Number.isSafeInteger(delta)||!Number.isSafeInteger(integer))throw new Error('Invalid skeleton delta');
        previous[i]=integer;row.push(coordinate(i)?integer/packed.scale:integer);
      }
      skeleton.push(row);
    }
    return {...n,skeleton};
  });
  return {...packed.graph,nodes};
}
