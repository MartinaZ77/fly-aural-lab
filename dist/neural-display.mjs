export const NEURON_COLORS=['#5ab9ff','#ea80ff','#61efd0','#ff915e','#9b91ff','#75df89','#ff6ca6','#65e1ff','#d1e86b','#b896ff','#edbc6b','#65c5b7'];
// Identification colors, not physiological measurements or MaleCNS functional labels.
export const colorOf=n=>NEURON_COLORS[Math.abs(Number(n.id)||0)%NEURON_COLORS.length];
const unit=value=>Number.isFinite(value)?Math.max(0,Math.min(1,value)):0;
// Shared display-only contrast for the reference-style halos; no extra time filter.
export const glowAlpha=a=>.7*(-Math.expm1(-8*a))/-Math.expm1(-8);

// One immutable snapshot per display frame. Neither renderer advances model time,
// smooths activity, applies a private gain, or generates additional neural pulses.
export function createNeuralFrame(nodes,activity,time,{gentle=false,glow=true,visible=null}={}){
  if(nodes.length!==activity.length)throw new Error('Neural display requires one activity per neuron');
  const values=Object.freeze(Array.from(activity,unit)),contrast=gentle?.3:1;
  const byId=Object.create(null);
  nodes.forEach((n,i)=>{
    const shown=!visible||visible.has(i),a=values[i];
    byId[String(n.id)]=Object.freeze({id:String(n.id),activity:a,color:colorOf(n),
      opacity:shown?.17+.8*a*contrast:.025,
      glowOpacity:shown&&glow?glowAlpha(a)*contrast:0});
  });
  return Object.freeze({time,activity:values,byId:Object.freeze(byId)});
}
