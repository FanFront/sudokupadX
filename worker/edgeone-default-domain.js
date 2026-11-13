// Tencent EdgeOne Edge Functions (independent/no-domain site) deployment.
// Self-contained, paste directly in EdgeOne's Edge Function editor.
// Generated from worker/remote-proxy.js; keep API and security policy in sync.
// A mainland-China client gets Content-Disposition: attachment on EdgeOne's
// default function domain. Fetch/XHR may still read the response if CORS passes;
// this MUST be verified from a real mainland-China client before public rollout.
// Fixed-target cross-origin relay for the static GitHub Pages application.
// Deploy as a Cloudflare Worker. Never accept arbitrary upstream URLs/hosts.
const LMD = 'https://logic-masters.de';
const ROPEKO = 'https://logic-puzzles.ropeko.ch';
const WPF = 'https://gp.worldpuzzle.org';
const BASE_PDF_PATH = '/sites/default/files/Puzzles/';
const DEFAULT_ORIGINS = new Set([
  'https://fanfront.github.io',
  'http://localhost:1420',
  'http://127.0.0.1:1420'
]);

function allowedOrigin(origin, env = {}) {
  if (!origin) return true; // Non-browser clients still receive public data.
  if (DEFAULT_ORIGINS.has(origin)) return true;
  const extra = String(env.EXTRA_ALLOWED_ORIGINS || '').split(',').map(x => x.trim());
  return extra.includes(origin);
}

function validOfficialPdf(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'gp.worldpuzzle.org' &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      url.pathname.startsWith(BASE_PDF_PATH) && /\.pdf$/i.test(url.pathname) &&
      url.href.length <= 500 && !/%2f|%5c|%2e|\.\.|\\/i.test(url.pathname);
  } catch { return false; }
}

function upstreamRequest(requestUrl) {
  const url = new URL(requestUrl);
  const params = url.searchParams;
  const only = (...names) => [...params.keys()].every(k => names.includes(k));
  const match = (p, re) => re.test(p ?? '');
  const route = url.pathname.replace(/\/+$/, '');
  if (route === '/v1/lmd/search') {
    const q = params.get('q') || '', start = params.get('start') || '0';
    const sort = params.get('sort') || 'neu';
    if (!only('q','start','sort') || q.length > 100 || q.includes('\0') ||
        !match(start,/^(?:0|[1-9]\d{0,4})$/) ||
        Number(start) > 20000 || Number(start) % 20 ||
        !['neu','schoen','leicht'].includes(sort)) return null;
    const upstream = new URL(LMD+'/Raetselportal/Suche/erweitert.php');
    upstream.searchParams.set('chlang','en');
    upstream.searchParams.set('sort',sort);
    if (q.trim()) {
      upstream.searchParams.set('skname','x');
      upstream.searchParams.set('sktext','x');
      upstream.searchParams.set('suchtext',q.trim());
    }
    if (Number(start)) upstream.searchParams.set('start',start);
    return {url:upstream.href,limit:1024*1024,pdf:false};
  }
  if (route === '/v1/lmd/puzzle') {
    const id = params.get('id') || '';
    if (!only('id') || !match(id,/^[a-zA-Z0-9]{6}$/)) return null;
    return {url:LMD+'/Raetselportal/Raetsel/zeigen.php?id='+id.toUpperCase(),
      limit:1024*1024,pdf:false};
  }
  if (route === '/v1/wpf/index') {
    if (params.size) return null;
    return {url:ROPEKO+'/php/db/search.php',limit:4*1024*1024,pdf:false};
  }
  if (route === '/v1/wpf/type') {
    const id = params.get('id') || '';
    if (!only('id') || !match(id,/^[1-9]\d{0,3}$/) || Number(id)>2000) return null;
    return {url:ROPEKO+'/php/db/puzzle.php?id='+id,limit:1024*1024,pdf:false};
  }
  if (route === '/v1/wpf/pdf') {
    const pdf = params.get('url') || '';
    if (!only('url') || !validOfficialPdf(pdf)) return null;
    return {url:pdf,limit:24*1024*1024,pdf:true};
  }
  return null;
}

function corsHeaders(origin, env) {
  const headers = {
    'Vary':'Origin',
    'X-Content-Type-Options':'nosniff',
    'Cache-Control':'no-store'
  };
  if (origin && allowedOrigin(origin,env)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Accept';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}
function failure(message,status,origin,env) {
  return new Response(message,{status,
    headers:{...corsHeaders(origin,env),'Content-Type':'text/plain; charset=utf-8'}});
}

async function limitedBody(response,limit) {
  const length = Number(response.headers.get('content-length') || '0');
  if (length && length>limit) throw new Error('Response exceeds allowed size');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Missing response body');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size>limit) throw new Error('Response exceeds allowed size');
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size);let offset=0;
  for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
  return data;
}

async function handleRequest(request,env={},fetcher=fetch) {
  const origin=request.headers.get('origin')||'';
  if (!allowedOrigin(origin,env)) return failure('Origin not permitted',403,origin,env);
  if (request.method === 'OPTIONS') {
    if (!upstreamRequest(request.url)) return failure('Invalid route',404,origin,env);
    return new Response(null,{status:204,headers:corsHeaders(origin,env)});
  }
  if(request.method !== 'GET') return failure('Only GET is allowed',405,origin,env);
  const route=upstreamRequest(request.url);
  if (!route) return failure('Invalid route or parameters',400,origin,env);
  try {
    const upstream=await fetcher(route.url,{
      method:'GET',
      redirect:'manual',
      headers:{Accept:route.pdf?'application/pdf':'text/html'},
    });
    // Never follow upstream redirects, including cross-origin redirects.
    if(upstream.status >= 300 && upstream.status < 400)
      return failure('Upstream redirect refused',502,origin,env);
    if(!upstream.ok)
      return failure('Upstream returned HTTP '+upstream.status,
        upstream.status===404?404:502,origin,env);
    const bytes=await limitedBody(upstream,route.limit);
    if(route.pdf && (bytes.byteLength<5 ||
        bytes[0]!==37||bytes[1]!==80||bytes[2]!==68||bytes[3]!==70||bytes[4]!==45))
      return failure('Upstream response was not a PDF',502,origin,env);
    return new Response(bytes.buffer,{
      headers:{
        ...corsHeaders(origin,env),
        'Content-Type':route.pdf?'application/pdf':'text/plain; charset=utf-8',
        'Content-Length':String(bytes.byteLength)
      }
    });
  } catch {
    return failure('Upstream request failed or exceeded limit',502,origin,env);
  }
}


addEventListener('fetch', event => {
  const settings=typeof env==='undefined' ? {} : env;
  event.respondWith(handleRequest(event.request,settings,fetch));
});
