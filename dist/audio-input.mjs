// URL classification is separate from playback: most music sites disallow embedding.
export function parseURL(value){
  const input=value.trim();
  if(!input)throw new Error('先粘贴一个音乐或视频网页地址。');
  const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(input)?input:`https://${input}`);
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new Error('请使用普通 http 或 https 网页地址。');
  const host=url.hostname.toLowerCase();let id=null,embed=null,provider=host.replace(/^www\./,'');
  if(host==='youtu.be')id=url.pathname.split('/')[1];
  if(['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host))id=url.searchParams.get('v')||url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1];
  if(id&&!/^[a-zA-Z0-9_-]{11}$/.test(id))throw new Error('未识别到有效的 YouTube 视频 ID。');
  if(id){provider='YouTube';embed=`https://www.youtube-nocookie.com/embed/${id}?rel=0`;}
  if(['bilibili.com','www.bilibili.com','m.bilibili.com'].includes(host)){
    provider='哔哩哔哩';const bvid=url.pathname.match(/\/video\/(BV[a-zA-Z0-9]{10})(?:\/|$)/)?.[1];
    if(bvid)embed=`https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0`;
  }
  if(['soundcloud.com','www.soundcloud.com'].includes(host)){
    provider='SoundCloud';embed=`https://w.soundcloud.com/player/?url=${encodeURIComponent(url.href)}&auto_play=false`;
  }
  if(['vimeo.com','www.vimeo.com','player.vimeo.com'].includes(host)){
    provider='Vimeo';const video=url.pathname.match(/^\/(?:video\/)?(\d+)\/?$/)?.[1];if(video)embed=`https://player.vimeo.com/video/${video}`;
  }
  return {url,id,provider,embed,isAudio:/\.(mp3|wav|m4a|ogg|oga|flac|aac|opus|webm)$/i.test(url.pathname)};
}

export function inputError(error,kind){
  const mic=kind==='microphone';
  if(error.name==='NotAllowedError'||error.name==='SecurityError')return mic?'麦克风未获允许。请在浏览器地址栏的权限设置中允许麦克风，再点一次；内置浏览器受限时请用 Chrome 打开本站。':'未连接网页声音。请在 Chrome 中选择正在播放的标签页，并勾选“共享音频”。';
  if(error.name==='NotFoundError')return mic?'没有找到可用麦克风。请连接麦克风或耳机后再试。':'没有找到可共享的音源，请先打开音乐网页。';
  if(error.name==='NotReadableError'||error.name==='AbortError')return mic?'麦克风暂不可用，请检查系统麦克风权限及其他程序是否占用。':'共享暂不可用，请检查系统的屏幕与系统音频录制权限。';
  return error.message||'声音未连接，请重试。';
}
