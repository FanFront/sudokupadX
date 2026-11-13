import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {fetchPuzzleProxy} from '../src/puzzle-proxy.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const ORIGIN='https://fanfront.github.io';
const endpoint='https://edgeone-proxy.example.tld';
function isolatedEdge(fetcher) {
  let listener;
  const code=read('worker/edgeone-default-domain.js');
  vm.runInNewContext(code,{
    addEventListener:(type,fn)=>{assert.equal(type,'fetch');listener=fn;},
    fetch:fetcher,Request,Response,URL,Uint8Array,Math,Set,Number,Error,String
  },{timeout:1000});
  return async url=>{
    let result;
    listener({
      request:new Request(url,{headers:{Origin:ORIGIN}}),
      respondWith:value=>{result=value;}
    });
    return await result;
  };
}

test('standalone EdgeOne function is self-contained and enforces same allowlist',async()=>{
  const seen=[];
  const target=isolatedEdge(async (url,options)=>{
    seen.push({url,options});
    return new Response('<html>Works</html>');
  });
  const result=await target(endpoint+'/v1/lmd/search?q=thermo&sort=neu');
  assert.equal(result.status,200);
  assert.equal(result.headers.get('access-control-allow-origin'),ORIGIN);
  assert.equal(await result.text(),'<html>Works</html>');
  assert.match(seen[0].url,/logic-masters\.de\/Raetselportal\/Suche/);
  assert.equal(seen[0].options.headers.Cookie,undefined);
  assert.equal(seen[0].options.redirect,'manual');
  const disallowed=await target(endpoint+'/v1/wpf/pdf?url=https%3A%2F%2Fevil.example%2Fbad.pdf');
  assert.equal(disallowed.status,400);
  assert.equal(seen.length,1);
});

test('EdgeOne function never returns unvalidated PDF data',async()=>{
  const pdf='https://gp.worldpuzzle.org/sites/default/files/Puzzles/2024/2024_SudokuRound1.pdf';
  const url=endpoint+'/v1/wpf/pdf?url='+encodeURIComponent(pdf);
  const bad=await isolatedEdge(async()=>new Response('<html>Not PDF</html>'))(url);
  assert.equal(bad.status,502);
  const good=await isolatedEdge(async()=>new Response('%PDF-1.7\nok'))(url);
  assert.equal(good.status,200);
  assert.equal(good.headers.get('content-type'),'application/pdf');
});

test('browser fetch can read attachments provided server allows CORS',async()=>{
  const url='https://edgeone-proxy.example.tld/v1/wpf/pdf';
  const bytes=await fetchPuzzleProxy('wpf-pdf',{
    url:'https://gp.worldpuzzle.org/sites/default/files/Puzzles/2024/a.pdf'
  },{
    binary:true,base:'https://edgeone-proxy.example.tld/',
    fetcher:async()=>new Response(new TextEncoder().encode('%PDF-1.7\n'),{
      headers:{
        'Content-Disposition':'attachment',
        'Access-Control-Allow-Origin':ORIGIN,
        'Content-Type':'application/pdf'
      }
    })
  });
  assert.equal(new TextDecoder().decode(bytes),'%PDF-1.7\n');
});

test('standalone code is produced by the generator, not a divergent copy',()=>{
  const generator=read('scripts/build-edgeone-proxy.mjs');
  const standalone=read('worker/edgeone-default-domain.js');
  const upstream=read('worker/remote-proxy.js');
  assert.match(generator,/readFile\(new URL\('\.\.\/worker\/remote-proxy\.js'/);
  assert.match(standalone,/addEventListener\('fetch', event =>/);
  assert.match(standalone,/handleRequest\(event\.request,settings,fetch\)/);
  assert.match(standalone,/const DEFAULT_ORIGINS = new Set\(/);
  assert.match(standalone,/const BASE_PDF_PATH =/);
  assert.match(upstream,/const BASE_PDF_PATH =/);
  assert.doesNotMatch(standalone,/export default|export async function|cf:\{cacheTtl:0\}/);
});
