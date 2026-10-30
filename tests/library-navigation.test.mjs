import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {externalSourceUrl, installExternalLinkHandler} from '../src/external-links.js';

const html = readFileSync(new URL('../index.html',import.meta.url),'utf8');
const ui = readFileSync(new URL('../src/online-ui.js',import.meta.url),'utf8');

test('library exposes three mutually exclusive Logic Masters screens',()=>{
  for (const id of ['lmdDiscoverView','lmdSavedView','lmdDetailView',
    'lmdSearchResults','lmdSavedResults','lmdResults','lmdDiscover','lmdSaved','lmdBack']) {
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  const ids = [...html.matchAll(/\\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size,'HTML ids must be unique');
  assert.match(ui,/showLmdView\\('saved'\\)/);
  assert.match(ui,/showLmdView\\('detail'\\)/);
  assert.match(ui,/renderLmdEntries\\(\\$\\('lmdSavedResults'\\)/);
  assert.match(ui,/renderLmdEntries\\(\\$\\('lmdResults'\\), lmdFound/);
});

test('external original URLs only accept HTTPS',()=>{
  assert.equal(externalSourceUrl('https://sudokupad.app/abc123'),'https://sudokupad.app/abc123');
  assert.equal(externalSourceUrl('https://logic-masters.de/Raetselportal/'),'https://logic-masters.de/Raetselportal/');
  for (const url of ['javascript:alert(1)','http://example.com/','file:///x','/relative','not-a-url'])
    assert.equal(externalSourceUrl(url),null,url);
});

test('native source click flushes current progress and opens system browser',async()=>{
  let handler;
  let saved=0, opened=[],prevented=0;
  const root={
    addEventListener:(type,callback,capture)=>{assert.equal(type,'click');assert.equal(capture,true);handler=callback;},
    contains:()=>true
  };
  const link={href:'https://sudokupad.app/abc',closest:()=>link};
  installExternalLinkHandler({
    root,native:true,
    save:()=>{saved++;},
    openNative:async url=>{opened.push(url);},
    openWeb:()=>assert.fail('native must not navigate game WebView'),
    notify:error=>assert.fail(String(error))
  });
  handler({target:link,defaultPrevented:false,button:0,preventDefault:()=>{prevented++;}});
  await Promise.resolve();
  assert.deepEqual(opened,['https://sudokupad.app/abc']);
  assert.equal(saved,1);
  assert.equal(prevented,1);
});

test('browser source click uses separate tab rather than same-page navigation',()=>{
  let handler, saved=0, navigated=[];
  const link={href:'https://logic-masters.de/Raetselportal/',closest:()=>link};
  installExternalLinkHandler({
    root:{addEventListener:(_type,fn)=>{handler=fn;},contains:()=>true},
    native:false,save:()=>{saved++;},openWeb:url=>{navigated.push(url);},
    openNative:()=>assert.fail('browser must not invoke native opener'),notify:()=>{}
  });
  handler({target:link,defaultPrevented:false,button:0,preventDefault:()=>{}});
  assert.equal(saved,1);
  assert.deepEqual(navigated,['https://logic-masters.de/Raetselportal/']);
});
