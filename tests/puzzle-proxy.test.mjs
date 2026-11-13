import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker,{upstreamRequest,validOfficialPdf,handleRequest} from '../worker/remote-proxy.js';
import {puzzleProxyUrl,fetchPuzzleProxy} from '../src/puzzle-proxy.js';

const ORIGIN='https://fanfront.github.io';
const endpoint='https://sudokupadx-proxy.example.workers.dev';
function req(path,{method='GET',origin=ORIGIN}={}){
  const headers=origin?{'Origin':origin}:{};
  return new Request(endpoint+path,{method,headers});
}
function htmlFetch(body){
  return async()=>new Response(body,{status:200,headers:{'content-type':'text/html'}});
}
const contents=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Worker uses fixed official paths for both puzzle sources',()=>{
  const search=upstreamRequest(endpoint+'/v1/lmd/search?q=thermo&start=20&sort=leicht');
  assert.equal(new URL(search.url).hostname,'logic-masters.de');
  assert.match(search.url,/suchtext=thermo/);
  assert.match(search.url,/start=20/);
  assert.match(search.url,/sort=leicht/);
  assert.equal(upstreamRequest(endpoint+'/v1/lmd/puzzle?id=abc123').url,
    'https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=ABC123');
  assert.equal(upstreamRequest(endpoint+'/v1/wpf/index').url,
    'https://logic-puzzles.ropeko.ch/php/db/search.php');
  assert.equal(upstreamRequest(endpoint+'/v1/wpf/type?id=225').url,
    'https://logic-puzzles.ropeko.ch/php/db/puzzle.php?id=225');
});

test('Worker rejects arbitrary hosts and unsafe parameters',()=>{
  const pdf='https://gp.worldpuzzle.org/sites/default/files/Puzzles/2024/sudoku.pdf';
  assert.equal(validOfficialPdf(pdf),true);
  for(const input of [
    'https://evil.test/sites/default/files/Puzzles/2024/sudoku.pdf',
    'http://gp.worldpuzzle.org/sites/default/files/Puzzles/2024/sudoku.pdf',
    'https://gp.worldpuzzle.org/sites/default/files/Puzzles/%2Fetc.pdf',
    'https://gp.worldpuzzle.org/sites/default/files/Puzzles/2024/sudoku.pdf?x=1',
    'https://gp.worldpuzzle.org@evil.test/sites/default/files/Puzzles/2024/sudoku.pdf'
  ])assert.equal(validOfficialPdf(input),false,input);
  for(const p of [
    '/v1/lmd/search?sort=bad',
    '/v1/lmd/search?start=21',
    '/v1/lmd/search?q=x&url=https%3A%2F%2Fevil.test',
    '/v1/lmd/puzzle?id=x',
    '/v1/wpf/type?id=../../../../etc/passwd',
    '/v1/wpf/type?id=225&other=1',
    '/v1/wpf/pdf?url=https%3A%2F%2Fevil.test%2Fp.pdf',
    '/v1/any-url?url=https%3A%2F%2Fevil.test'
  ])assert.equal(upstreamRequest(endpoint+p),null,p);
});

test('Allowed browser origin receives CORS, disallowed origin cannot fetch',async()=>{
  const valid=req('/v1/wpf/index');
  const result=await worker.fetch(valid,{},htmlFetch('<html>WPF</html>'));
  assert.equal(result.status,200);
  assert.equal(result.headers.get('access-control-allow-origin'),ORIGIN);
  assert.equal(result.headers.get('content-type'),'text/plain; charset=utf-8');
  assert.equal(await result.text(),'<html>WPF</html>');
  const preflight=await worker.fetch(req('/v1/wpf/index',{method:'OPTIONS'}));
  assert.equal(preflight.status,204);
  assert.match(preflight.headers.get('access-control-allow-methods'),/GET/);
  let requested=false;
  const denied=await handleRequest(req('/v1/wpf/index',{origin:'https://attacker.test'}),
    {},async()=>{requested=true;return new Response('');});
  assert.equal(denied.status,403);
  assert.equal(requested,false);
  assert.equal(denied.headers.get('access-control-allow-origin'),null);
  assert.equal((await worker.fetch(req('/v1/wpf/index',{method:'POST'}))).status,405);
});

test('Worker does not forward session cookies, redirects, HTML masquerading as PDF or oversize',async()=>{
  const uri='https://gp.worldpuzzle.org/sites/default/files/Puzzles/2024/2024_SudokuRound1.pdf';
  const input=req('/v1/wpf/pdf?url='+encodeURIComponent(uri));
  let options;
  const ok=await worker.fetch(input,{},async(url,opts)=>{
    assert.equal(url,uri);options=opts;
    return new Response(new TextEncoder().encode('%PDF-1.7\nhello'));
  });
  assert.equal(ok.status,200);
  assert.equal(options.redirect,'manual');
  assert.equal(options.headers.Cookie,undefined);
  assert.equal(ok.headers.get('content-type'),'application/pdf');
  const fake=await worker.fetch(input,{},htmlFetch('<html>Not a PDF</html>'));
  assert.equal(fake.status,502);
  const redirect=await worker.fetch(input,{},async()=>new Response(null,{
    status:302,headers:{Location:'https://evil.test'}}));
  assert.equal(redirect.status,502);
  const oversized=await worker.fetch(input,{},async()=>new Response(null,{
    status:200,headers:{'content-length':String(25*1024*1024)}}));
  assert.equal(oversized.status,502);
});

test('Web client maps resource keys to bounded proxy requests, never arbitrary upstream URLs',async()=>{
  const base=endpoint+'/';
  assert.equal(puzzleProxyUrl(base,'lmd-search',{q:'killer',start:40,sort:'neu'}),
    base+'v1/lmd/search?q=killer&start=40&sort=neu');
  assert.equal(puzzleProxyUrl(base,'wpf-index'),base+'v1/wpf/index');
  assert.throws(()=>puzzleProxyUrl('','wpf-index'),/尚未配置/);
  assert.throws(()=>puzzleProxyUrl('http://attacker.test','wpf-index'),/HTTPS/);
  assert.throws(()=>puzzleProxyUrl(base,'other',{url:'https://evil.test'}),/不受支持/);
  const got=[];
  const html=await fetchPuzzleProxy('lmd-puzzle',{id:'ABC123'},{
    base,fetcher:async(url,opts)=>{
      got.push([url,opts]);
      return new Response('<html>OK</html>');
    }
  });
  assert.equal(html,'<html>OK</html>');
  assert.equal(got[0][0],base+'v1/lmd/puzzle?id=ABC123');
  assert.equal(got[0][1].credentials,'omit');
  const binary=await fetchPuzzleProxy('wpf-pdf',{url:'https://gp.worldpuzzle.org/sites/default/files/Puzzles/1.pdf'},{
    base,binary:true,fetcher:async()=>new Response('%PDF-')});
  assert.deepEqual(binary,new TextEncoder().encode('%PDF-'));
  await assert.rejects(fetchPuzzleProxy('wpf-index',{},{
    base,limit:2,fetcher:async()=>new Response('oversized')}),/超出/);
});

test('LMD search, detail, WPF index, type and PDF web paths all use relay',()=>{
  const lmd=contents('src/online-ui.js'),wpf=contents('src/wpf-ui.js');
  const reader=contents('src/wpf-reader.js'),pages=contents('.github/workflows/pages.yml');
  assert.match(lmd,/fetchPuzzleProxy\('lmd-search'/);
  assert.match(lmd,/fetchPuzzleProxy\('lmd-puzzle'/);
  assert.match(wpf,/fetchPuzzleProxy\('wpf-index'/);
  assert.match(wpf,/fetchPuzzleProxy\('wpf-type'/);
  assert.match(reader,/fetchPuzzleProxy\('wpf-pdf'/);
  assert.match(pages,/VITE_PUZZLE_PROXY_URL/);
  assert.match(contents('.github/workflows/puzzle-proxy.yml'),/wrangler@4 deploy/);
});
