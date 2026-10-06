// The host negotiates gzip; retain the original scientific data without resampling.
export async function loadJSONAsset(path,{fetcher=fetch,timeout=12000}={}){
  async function read(){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetcher(path,{signal:controller.signal});
      if(!response.ok)throw new Error(`资源载入失败（${response.status}）`);
      return await response.json();
    }finally{clearTimeout(timer);}
  }
  try{return await read();}catch{return read();}
}
