import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  RESUME_KEY,captureView,restoreView,parseResume,serializeResume,
  bundledSource,cachedSource
} from '../src/resume-session.js';

test('large-board zoom and the exact centered cell survive an app restart',()=>{
  const frame={width:390,height:620};
  const camera={x:-592.5,y:-2015.75,scale:1.35};
  const view=captureView(camera,frame.width,frame.height,[809,810],false);
  const saved=serializeResume(bundledSource('digits-of-despair'),view,[]);
  assert.equal(RESUME_KEY,'sudokupadx:last-session:v1');
  const decoded=parseResume(saved);
  assert.deepEqual(decoded.source,{type:'bundled',id:'digits-of-despair'});
  const result=restoreView(decoded.view,frame.width,frame.height,2000);
  assert.deepEqual(result.camera,camera);
  assert.deepEqual(result.selectedCells,[809,810]);
  assert.equal(result.gridLines,false);
});

test('rotating the phone preserves logical board center instead of pixel offsets',()=>{
  const camera={x:-1235,y:-2000,scale:.84};
  const saved=captureView(camera,360,760,[392],true);
  const rotated=restoreView(saved,760,360,1500);
  assert.equal(rotated.camera.scale,.84);
  assert.ok(Math.abs((760/2-rotated.camera.x)/.84-saved.centerX)<1e-9);
  assert.ok(Math.abs((360/2-rotated.camera.y)/.84-saved.centerY)<1e-9);
  assert.deepEqual(rotated.selectedCells,[392]);
});

test('linked puzzle stack survives restart and retains its own parent viewport',()=>{
  const parent={id:'super-sudokoid-1',view:captureView(
    {x:-621,y:-999,scale:1.8},412,845,[231],true)};
  const child=captureView({x:-20,y:-35,scale:1.2},412,845,[15],false);
  const parsed=parseResume(serializeResume(bundledSource('boss-6cn54q09sv'),child,[parent]));
  assert.deepEqual(parsed.stack,[parent]);
  assert.deepEqual(restoreView(parsed.stack[0].view,412,845,2000).selectedCells,[231]);
  assert.equal(restoreView(parsed.view,412,845,100).camera.scale,1.2);
});

test('online and imported sources can be restored from their own cached definition',()=>{
  const entry={id:'lmd:000OKF:abc',title:'Test puzzle',sourceName:'Logic Masters',
    puzzleUrl:'https://sudokupad.app/abc',sourceUrl:'https://logic-masters.de/Raetselportal/'};
  const online=cachedSource('puzzle-key-1',entry);
  assert.equal(online.type,'online');
  assert.deepEqual(parseResume(serializeResume(online,
    captureView({x:0,y:0,scale:1},400,600),[])).source,online);
  assert.deepEqual(cachedSource('puzzle-key-2'),{type:'imported',key:'puzzle-key-2'});
  assert.equal(cachedSource('bad','not-an-entry'),null);
  assert.equal(cachedSource('key',{id:'x',title:'Bad',puzzleUrl:'https://example.com/puzzle'}),null);
});

test('malformed storage cannot override the startup puzzle or create invalid camera geometry',()=>{
  for(const input of ['not JSON','{}','{"version":3}','{"version":1,"source":{"type":"bundled","id":"x"},"view":{"scale":0}}']){
    assert.equal(parseResume(input),null,input);
  }
  assert.equal(restoreView({centerX:Infinity,centerY:0,scale:1},400,700,100),null);
  assert.equal(restoreView({centerX:0,centerY:0,scale:100},400,700,100),null);
  const view=captureView({x:-20,y:40,scale:1},400,500,[2,2,50,999],true);
  assert.deepEqual(restoreView(view,400,500,100).selectedCells,[2,50]);
});

test('UI automatically resumes the last puzzle and no longer exposes an example puzzle',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const native=readFileSync(new URL('../src-tauri/src/lib.rs',import.meta.url),'utf8');
  const web=readFileSync(new URL('../src/web-runtime.js',import.meta.url),'utf8');
  const store=readFileSync(new URL('../src/online-library.js',import.meta.url),'utf8');
  assert.ok(!html.includes('id="demoButton"'));
  assert.ok(!main.includes('load_demo'));
  assert.ok(!native.includes('load_demo'));
  assert.ok(!web.includes('load_demo'));
  assert.ok(main.includes('parseResume(localStorage.getItem(RESUME_KEY))'));
  assert.ok(main.includes('readResumePuzzle(record.source.key)'));
  assert.ok(main.includes('navigationStack=record.stack.filter'));
  assert.ok(main.includes('saveResumePuzzle(puzzle.key,input)'));
  assert.ok(main.includes("window.addEventListener('pagehide', save)"));
  assert.ok(store.includes("indexedDB.open(DB_NAME, 2)"));
  assert.ok(store.includes("tx.objectStore('resume').put({id:'current',key,input})"));
});
