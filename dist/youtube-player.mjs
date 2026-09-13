// The official iframe API reports playback state only. It cannot provide PCM
// audio; only a user-authorized audio stream may drive the neural simulation.
let api;
function loadAPI(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(api)return api;
  api=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';
    const timeout=setTimeout(()=>{api=null;script.remove();reject(new Error('YouTube 连接超时；可尝试原网页。'));},12000);
    window.onYouTubeIframeAPIReady=()=>{clearTimeout(timeout);resolve(window.YT);};
    script.onerror=()=>{clearTimeout(timeout);api=null;script.remove();reject(new Error('YouTube 连接失败；请检查网络或打开原网页。'));};
    document.head.append(script);
  });return api;
}
export function youtubeError(code){
  return ({2:'视频地址无效',5:'当前浏览器无法播放',100:'视频不存在或不可访问',101:'视频作者禁止页内播放',150:'视频作者禁止页内播放',153:'播放器缺少来源验证，请通过 HTTPS 网页打开'})[code]||`播放失败（${code}）`;
}
export class YouTubePlayback {
  constructor(frame,report){this.frame=frame;this.parent=frame.parentNode;this.report=report;this.generation=0;this.player=null;}
  clear(){this.generation++;clearTimeout(this.timer);if(this.player){try{this.player.destroy();}catch{}this.player=null;}this.report('');}
  async open(id){
    this.clear();const token=this.generation;this.report('YouTube 正在连接…');
    // Keep the original iframe owned by the page; destroy() may remove it.
    if(!this.frame.isConnected)this.parent.append(this.frame);
    const url=new URL(`https://www.youtube-nocookie.com/embed/${id}`);
    url.search=new URLSearchParams({enablejsapi:'1',origin:location.origin,playsinline:'1',rel:'0'});
    this.frame.referrerPolicy='strict-origin-when-cross-origin';this.frame.src=url.href;this.frame.hidden=false;
    this.timer=setTimeout(()=>{if(token===this.generation)this.report('YouTube 未响应；可打开原网页重试。');},15000);
    try{
      const YT=await loadAPI();if(token!==this.generation)return;
      this.player=new YT.Player(this.frame,{events:{
        onReady:()=>{if(token!==this.generation)return;clearTimeout(this.timer);this.report('YouTube 已就绪 · 点播放器播放');},
        onStateChange:e=>{if(token!==this.generation)return;clearTimeout(this.timer);this.report(({1:'YouTube 正在播放',2:'YouTube 已暂停',0:'YouTube 已结束',3:'YouTube 缓冲中',5:'YouTube 已就绪 · 点播放器播放'})[e.data]||'YouTube 等待播放');},
        onError:e=>{if(token!==this.generation)return;clearTimeout(this.timer);this.report(youtubeError(e.data)+'；可尝试原网页。');},
        onAutoplayBlocked:()=>{if(token===this.generation)this.report('请点击播放器内的播放按钮');}
      }});
    }catch(e){if(token===this.generation){clearTimeout(this.timer);this.report(e.message);}}
  }
}
