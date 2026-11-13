// Web-only relay for providers which don't expose cross-origin browser APIs.
// A static GitHub Pages site cannot bypass CORS by setting request headers.
// Configure VITE_PUZZLE_PROXY_URL with a deployed, allowlisted Worker endpoint.
export const MAX_PROXY_HTML = 4*1024*1024;
export const MAX_PROXY_PDF = 24*1024*1024;

export function puzzleProxyUrl(base, resource, parameters = {}) {
  if (typeof base !== 'string' || !base.trim())
    throw Error('网页版跨域代理尚未配置。请部署仓库中的 Cloudflare Worker 并设置 VITE_PUZZLE_PROXY_URL。');
  let root;
  try { root = new URL(base); } catch { throw Error('跨域代理地址无效'); }
  if (!((root.protocol === 'https:') ||
    (root.protocol === 'http:' && ['localhost','127.0.0.1'].includes(root.hostname))) ||
    root.username || root.password || root.hash || root.search)
    throw Error('跨域代理必须使用 HTTPS URL');
  const paths = {
    'lmd-search':'v1/lmd/search',
    'lmd-puzzle':'v1/lmd/puzzle',
    'wpf-index':'v1/wpf/index',
    'wpf-type':'v1/wpf/type',
    'wpf-pdf':'v1/wpf/pdf'
  };
  if (!Object.hasOwn(paths,resource)) throw Error('不受支持的代理请求');
  const url = new URL(paths[resource],root.href.replace(/\/?$/,'/'));
  for(const [key,value] of Object.entries(parameters)) {
    if(value !== null && value !== undefined && value !== '')url.searchParams.set(key,String(value));
  }
  return url.href;
}

export async function fetchPuzzleProxy(resource,params={},{
  limit=MAX_PROXY_HTML,binary=false,fetcher=fetch,
  base=import.meta.env?.VITE_PUZZLE_PROXY_URL || ''
}={}) {
  const url=puzzleProxyUrl(base,resource,params);
  let response;
  try{response=await fetcher(url,{credentials:'omit',cache:'no-store'});}
  catch(error){throw Error('网页版题库代理无法访问：'+(error?.message||error));}
  if(!response.ok)throw Error('题库代理请求失败：HTTP '+response.status);
  if(Number(response.headers?.get('content-length')||0)>limit)
    throw Error('代理返回文件超过 '+Math.ceil(limit/1024/1024)+' MiB 大小限制');
  const reader=response.body?.getReader?.();
  if(!reader) {
    const data=new Uint8Array(await response.arrayBuffer());
    if(data.byteLength>limit)throw Error('代理返回内容超出大小限制');
    return binary?data:new TextDecoder().decode(data);
  }
  const chunks=[];let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>limit){await reader.cancel();throw Error('代理返回内容超出大小限制');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const data=new Uint8Array(length);let pos=0;
  for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.byteLength;}
  return binary?data:new TextDecoder().decode(data);
}
