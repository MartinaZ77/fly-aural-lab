import {EMPTY_FEATURES} from './acoustics.mjs';
import {NeuralSimulation} from './simulation.mjs';
import {SkeletonViewer} from './viewer.mjs';
import {ROOM_LIMITS} from './motor.mjs';
import {BehaviorController,BEHAVIOR_NAMES} from './behavior.mjs';
import {YouTubePlayback} from './youtube-player.mjs';
import {parseURL,inputError} from './audio-input.mjs';
import {neuralGeometry} from './neural-space.mjs';
import {BranchNavigator} from './branch-space.mjs';
import {createNeuralFrame} from './neural-display.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const audio=$('#audioPlayer'),frame=$('#youtubeFrame');
const youtube=new YouTubePlayback(frame,text=>{$('#playerStatus').textContent=text;});
let data,model,viewer,features=EMPTY_FEATURES();
let motor,flyStage;
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
const fixedOptions=gentle=>Object.freeze({mode:'dance',action:'auto',boost:4,backdrop:true,gentle});
let motorOptions=fixedOptions(motionPreference.matches);
motionPreference.addEventListener('change',e=>motorOptions=fixedOptions(e.matches));
const ENCODING_GAIN=1;
let context,workletReady,mediaNode,inputNode,processor,captureStream,objectUrl,epoch=0,sourceKind='none',lastMessage=0,lastSignal=0;
function status(text,error=false){$('#sourceStatus').textContent=text;$('#sourceStatus').classList.toggle('error',error);}
function resetSimulation(){model?.reset();motor?.reset();features=EMPTY_FEATURES();lastMessage=0;lastSignal=0;}
function disconnectInput(){
  epoch++;
  if(processor){processor.port.onmessage=null;processor.disconnect();processor=null;}
  if(inputNode){inputNode.disconnect();inputNode=null;}
  if(mediaNode)mediaNode.disconnect();
  if(captureStream){const old=captureStream;captureStream=null;old.getTracks().forEach(t=>{t.onended=null;t.stop();});}
  audio.pause();sourceKind='none';resetSimulation();$('#stopButton').disabled=true;$('#micButton').textContent='麦克风';$('#micButton').setAttribute('aria-pressed','false');$('#micIndicator').hidden=true;$('#inputMeter').value=0;
}
function clearPlayer(){youtube.clear();if(!frame.isConnected)$('#embedBox').append(frame);audio.removeAttribute('src');audio.load();audio.hidden=true;frame.src='about:blank';frame.hidden=true;delete frame.dataset.pendingSrc;$('#embedBox').open=false;$('#embedBox').hidden=true;$('#externalLink').hidden=true;$('#playerBox').hidden=true;if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=null;}}
function stopAll(){disconnectInput();clearPlayer();$('#stopButton').disabled=true;$('#currentTitle').textContent='已停止 · 音源已断开';status('已停止，声音已断开。');}
async function ensureContext(){
  if(!model)throw new Error('神经元数据尚未就绪，请稍后再试。');
  if(!window.isSecureContext)throw new Error('请使用本站的 HTTPS 地址或本地预览地址来连接声音。');
  if(!context){context=new AudioContext();workletReady=context.audioWorklet.addModule('./audio-worklet.mjs');}
  try{await context.resume();await workletReady;}catch(e){await context?.close().catch(()=>{});context=null;workletReady=null;mediaNode=null;throw e;}return context;
}
function attach(node,monitor,token){
  if(token!==epoch)return;
  processor=new AudioWorkletNode(context,'fly-acoustics',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
  inputNode=node;node.connect(processor);processor.connect(context.destination);if(monitor)node.connect(context.destination);
  processor.port.onmessage=event=>{if(token!==epoch)return;features=event.data;model.step(features,ENCODING_GAIN);motor?.step(model.activity,motorOptions);lastMessage=performance.now();if(features.rms>.0005)lastSignal=lastMessage;};
  $('#stopButton').disabled=false;
}
async function playLocal(file){
  disconnectInput();clearPlayer();$('#urlInput').value='';const token=epoch;
  try{await ensureContext();if(token!==epoch)return;objectUrl=URL.createObjectURL(file);await playMedia(objectUrl,file.name,token);}
  catch(e){if(token===epoch)status(e.message,true);}
}
async function playMedia(url,title,token){
  audio.crossOrigin='anonymous';audio.src=url;audio.hidden=false;$('#playerBox').hidden=false;$('#currentTitle').textContent=title;
  if(!mediaNode)mediaNode=context.createMediaElementSource(audio);
  sourceKind='media';attach(mediaNode,true,token);status('声音已连接。');
  try{await audio.play();}catch(e){if(token===epoch)status(e.name==='NotAllowedError'?'请点击播放器的播放按钮。':'音频无法播放。远程地址可能不支持跨域，请改用本地文件或网页声音捕捉。',true);}
}
async function loadURL(value){
  let parsed;try{parsed=parseURL(value.trim());}catch(e){status(e.message||'地址格式不正确。',true);return;}
  disconnectInput();clearPlayer();const token=epoch;$('#urlInput').value=parsed.url.href;
  const link=$('#externalLink');link.href=parsed.url.href;link.textContent=`打开 ${parsed.provider} 原网页 ↗`;link.hidden=false;$('#playerBox').hidden=false;$('#currentTitle').textContent=parsed.provider;
  if(parsed.isAudio){try{await ensureContext();if(token===epoch)await playMedia(parsed.url.href,parsed.provider,token);}catch(e){if(token===epoch)status(e.message,true);}return;}
  sourceKind='web-pending';$('#stopButton').disabled=false;
  if(parsed.embed){$('#embedBox').hidden=false;$('#embedBox').open=true;frame.hidden=false;if(parsed.id)youtube.open(parsed.id);else frame.src=parsed.embed;}
  status(parsed.embed?'点播放器播放，再点“网页声音”，选当前标签页并共享音频。':'打开原网页播放，再连接“网页声音”并选择那个标签页。');
}
async function capture(){
  if(!navigator.mediaDevices?.getDisplayMedia){status('此浏览器不支持网页声音。请用 Chrome，或改用麦克风 / 音乐文件。',true);return;}
  disconnectInput();audio.hidden=true;const token=epoch;$('#stopButton').disabled=false;status('请选正在播放的标签页，并勾选“共享音频”。');
  try{
    // Invoke directly in the click gesture, before waiting on audio context setup.
    const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true,preferCurrentTab:!frame.hidden,selfBrowserSurface:'include',systemAudio:'include',suppressLocalAudioPlayback:false});
    if(token!==epoch){stream.getTracks().forEach(t=>t.stop());return;}
    if(!stream.getAudioTracks().length){stream.getTracks().forEach(t=>t.stop());throw new Error('这次共享没有音轨。请选择浏览器标签页并勾选“共享音频”，或使用本地文件。');}
    captureStream=stream;
    stream.getTracks().forEach(t=>{t.onended=()=>{if(captureStream===stream){disconnectInput();status('共享已结束。模型已清空，不会继续使用旧音源。');}};});
    await ensureContext();if(token!==epoch)return;
    if(!stream.getAudioTracks().some(t=>t.readyState==='live')){disconnectInput();throw new Error('音频共享已结束，请重新选择。');}
    sourceKind='capture';attach(context.createMediaStreamSource(stream),false,token);
    status('共享音轨已连接 · 等待实际声音。不录制、不上传。');
  }catch(e){if(token===epoch){disconnectInput();status(inputError(e,'capture'),true);}}
}
async function microphone(){
  if(sourceKind==='microphone'||sourceKind==='microphone-pending'){stopAll();return;}
  if(!navigator.mediaDevices?.getUserMedia){status('这个浏览器没有开放麦克风。请用 Chrome 或 Safari 打开本站的 HTTPS 地址再试。',true);return;}
  disconnectInput();clearPlayer();const token=epoch;sourceKind='microphone-pending';$('#micButton').textContent='取消麦克风连接';$('#stopButton').disabled=false;status('等待麦克风授权，允许后就可以唱歌。');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
    if(token!==epoch){stream.getTracks().forEach(t=>t.stop());return;}
    captureStream=stream;
    stream.getTracks().forEach(t=>t.onended=()=>{if(captureStream===stream){disconnectInput();status('麦克风已断开，点击麦克风按钮可重新连接。');}});
    await ensureContext();if(token!==epoch)return;
    if(!stream.getAudioTracks().some(t=>t.readyState==='live'))throw new Error('麦克风已断开，请重新连接。');
    sourceKind='microphone';attach(context.createMediaStreamSource(stream),false,token);
    $('#currentTitle').textContent='现场声音 · 麦克风';$('#micIndicator').hidden=false;
    $('#micButton').textContent='关闭麦克风';$('#micButton').setAttribute('aria-pressed','true');
    status('可以唱歌了 · 仅本机分析，不录音。');
  }catch(e){if(token===epoch){disconnectInput();status(inputError(e,'microphone'),true);}}
}
$('#fileInput').addEventListener('change',e=>{if(e.target.files[0])playLocal(e.target.files[0]);e.target.value='';});
$('#urlForm').addEventListener('submit',e=>{e.preventDefault();loadURL($('#urlInput').value);});
const drop=$('#dropZone');['dragenter','dragover'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('drag');}));drop.addEventListener('dragleave',()=>drop.classList.remove('drag'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('drag');const file=e.dataTransfer.files[0];if(file)playLocal(file);else{const text=(e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain')).split('\n').find(s=>s&&!s.startsWith('#'));if(text)loadURL(text);}});
$('#captureButton').addEventListener('click',capture);$('#stopButton').addEventListener('click',stopAll);
$('#micButton').addEventListener('click',microphone);
$('#embedBox').addEventListener('toggle',()=>{if($('#embedBox').open&&frame.dataset.pendingSrc){frame.referrerPolicy='strict-origin-when-cross-origin';frame.src=frame.dataset.pendingSrc;delete frame.dataset.pendingSrc;frame.hidden=false;}});
$('#pickMusic').addEventListener('click',()=>$('#fileInput').click());
$('#flyStop').addEventListener('click',stopAll);
$$('[data-fullscreen]').forEach(button=>button.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $(button.dataset.fullscreen).requestFullscreen();}catch{status('当前浏览器不支持全屏。',true);}}));
document.addEventListener('fullscreenchange',()=>$$('[data-fullscreen]').forEach(button=>{const active=document.fullscreenElement===$(button.dataset.fullscreen);button.textContent=active?'退出全屏 ↙':'全屏 ↗';button.setAttribute('aria-label',active?'退出全屏':button.dataset.fullscreen==='.fly-panel'?'全屏查看果蝇飞行':'全屏查看听觉回路');}));
$('#methodButton').addEventListener('click',()=>$('#methodDialog').showModal());$('#closeMethod').addEventListener('click',()=>$('#methodDialog').close());
audio.addEventListener('error',()=>{if(sourceKind==='media'&&audio.getAttribute('src'))status('无法读取音频。请换本地文件，或连接网页声音。',true);});
window.addEventListener('pagehide',()=>{disconnectInput();if(objectUrl)URL.revokeObjectURL(objectUrl);});
let lastDraw=0;
function render(now){requestAnimationFrame(render);if(!viewer||now-lastDraw<33)return;lastDraw=now;
  $('#inputMeter').value=processor?Math.min(1,Math.sqrt(features.rms)*3):0;
  $('#flyStop').disabled=$('#stopButton').disabled;
  const neuralFrame=createNeuralFrame(data.nodes,model.activity,model.time,{gentle:motorOptions.gentle});
  viewer.draw(neuralFrame);
  if(motor){const v=motor.values;flyStage?.draw(v,neuralFrame,motorOptions);$('#motionLabel').textContent=BEHAVIOR_NAMES[v.action]||'自动';}
  $('#liveStatus').textContent=!processor?'等待声音':context.state!=='running'||now-lastMessage>1500?'音频已暂停':now-lastSignal>300?'输入静音':sourceKind==='microphone'?'正在听你唱':'声音已连接';
}
try{
  const response=await fetch('./assets/auditory-connectome.json');if(!response.ok)throw new Error('数据文件载入失败');data=await response.json();
  if(!Array.isArray(data.nodes)||!data.nodes.length||data.nodes.some(n=>!Array.isArray(n.skeleton)||!n.skeleton.length||n.skeleton.some(p=>p.length<5||!p.every(Number.isFinite))))throw new Error('神经元骨架格式不正确');
  model=new NeuralSimulation(data);viewer=new SkeletonViewer($('#brainCanvas'),data);viewer.showEdges=false;
  const forest=neuralGeometry(data.nodes),seed=crypto.getRandomValues(new Uint32Array(1))[0],navigation=new BranchNavigator(forest,ROOM_LIMITS,seed);
  motor=new BehaviorController(data.nodes,navigation);
  Promise.all([import('./neural-room.mjs'),fetch('./assets/fly-rig.json').then(r=>{if(!r.ok)throw new Error('模型文件载入失败');return r.json();})]).then(([module,rig])=>{flyStage=new module.FlyStage($('#flyCanvas'),$('#flyBackground'),rig,data,forest);$('#flyStatus').textContent='';$('#flyStatus').hidden=true;}).catch(e=>{$('#flyError').hidden=false;$('#flyError').textContent='3D 空间暂不可用：'+e.message+'。请换支持 WebGL 2 的浏览器。';$('#flyStatus').hidden=true;});
  requestAnimationFrame(render);
}catch(e){$('#dataError').hidden=false;$('#dataError').textContent=`${e.message}。请刷新页面重试；未使用虚构数据替代。`;status('真实数据未载入，模拟尚未开始。',true);}
if(navigator.modelContext?.registerTool){
  navigator.modelContext.registerTool({name:'read_fly_neural_visualization',description:'Read current real connectome subset, audio features, simulated neuron activities and illustrative motor output; not measured physiology, validated behavior or musical preference.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async()=>({content:[{type:'text',text:JSON.stringify({dataset:'male-cns:v1.0',sourceKind,features,modelTime:model?.time,motor:{options:motorOptions,state:motor?.values,interpretation:'Artistic kinematic readout, not validated behavior or physics'},neurons:data?.nodes.map((n,i)=>({bodyId:n.id,type:n.type,simulatedActivity:model.activity[i]}))})}]})});
  navigator.modelContext.registerTool({name:'load_fly_audio_url',description:'Load a user-provided audio or YouTube URL in the page. Capturing tab audio still requires the user to click and grant permission.',inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url'],additionalProperties:false},execute:async({url})=>{await loadURL(url);return {content:[{type:'text',text:$('#sourceStatus').textContent}]};}});
}
