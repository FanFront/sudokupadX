import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  parsePenpaUrl, penpaPuzzleId, directPenpaEntry,
  preparePenpaScl, convertPenpaUrl
} from '../src/penpa-import.js';
import {fetchOnlinePuzzle} from '../src/online-library.js';
import {cachedSource,parseResume,serializeResume} from '../src/resume-session.js';
import {parseLogicMastersPage,directPuzzleEntry} from '../src/logic-masters.js';

const url = 'https://swaroopg92.github.io/penpa-edit/#m=solve&p=YWJj+/==';
const fixture = {
  id:'original-penpa',
  cells:[[{value:'1',given:true},{}],[{},{}]],
  cages:[
    {value:'title: Penpa example'},
    {value:'author: Setter'},
    {value:'rules: Fill every cell'},
    {value:'solution: 1234'},
    {value:'msgcorrect: Great!'},
    {cells:[[0,0]],value:'1'}
  ],
  lines:[{wayPoints:[[0,0],[1,1]],color:'#abcdef'}]
};

test('Penpa+ query and fragment URLs validate and normalize raw/escaped base64',()=>{
  const parsed=parsePenpaUrl(url);
  assert.equal(parsed.mode,'solve');
  assert.equal(parsed.payload,'YWJj+/==');
  assert.match(parsed.converterUrl,/\?m=solve&p=YWJj\+\/==$/);
  const escaped='https://swaroopg92.github.io/penpa-edit/?m=solve&p=YWJj%2B%2F%3D%3D';
  assert.equal(parsePenpaUrl(escaped).converterUrl,parsed.converterUrl);
  // Real Penpa+ shares often use URL-safe Base64 (- and _) rather than + and /.
  const urlSafe='https://swaroopg92.github.io/penpa-edit/#m=solve&p=YWJj-_==';
  assert.match(parsePenpaUrl(urlSafe).converterUrl,/p=YWJj\+\/==$/);
  assert.equal(penpaPuzzleId(urlSafe),penpaPuzzleId(url));
  assert.equal(penpaPuzzleId(escaped),penpaPuzzleId(url));
  assert.match(penpaPuzzleId(url),/^penpa-[0-9a-f]{16}-\d+$/);
});

test('reject untrusted, malformed, encoded or oversized Penpa URLs',()=>{
  const invalid=[
    'http://swaroopg92.github.io/penpa-edit/?m=solve&p=YWJj',
    'https://evil.example/penpa-edit/#m=solve&p=YWJj',
    'https://swaroopg92.github.io.evil.example/penpa-edit/?m=solve&p=YWJj',
    'https://swaroopg92.github.io/other/#m=solve&p=YWJj',
    'https://user:pass@swaroopg92.github.io/penpa-edit/?m=solve&p=YWJj',
    'https://swaroopg92.github.io/penpa-edit/#m=bad&p=YWJj',
    'https://swaroopg92.github.io/penpa-edit/#m=solve&p=not-valid~',
    'https://swaroopg92.github.io/penpa-edit/#m=solve&p=YWJj&a=%ZZ',
    'https://swaroopg92.github.io/penpa-edit/#m=solve&p=' + 'A'.repeat(1024*1024+1)
  ];
  for (const item of invalid) assert.equal(parsePenpaUrl(item),null,item.slice(0,120));
  assert.throws(()=>directPenpaEntry('https://example.com'),/Penpa/);
});

test('Penpa converted SCL preserves givens, artwork and source metadata',()=>{
  const input=JSON.parse(preparePenpaScl(structuredClone(fixture)));
  assert.equal(input.cells[0][0].value,'1');
  assert.deepEqual(input.lines,fixture.lines);
  assert.equal(input.id,'original-penpa');
  assert.equal(input.metadata.title,'Penpa example');
  assert.equal(input.metadata.author,'Setter');
  assert.equal(input.metadata.rules,'Fill every cell');
  assert.equal(input.metadata.msgcorrect,'Great!');
  assert.equal(input.metadata.solution,'1234');
  assert.equal(input.cages.length,fixture.cages.length);
  const partial=structuredClone(fixture);
  partial.cages[3].value='solution: 1?34';
  assert.equal(JSON.parse(preparePenpaScl(partial)).metadata.solution,undefined);
  assert.throws(()=>preparePenpaScl({cells:[]}),/方格/);
});

test('Penpa URLs convert locally and need no network request',async()=>{
  let convertedUrl='';
  const result=await convertPenpaUrl(url,async()=>({
    PenpaToSclConverter:class {
      convertPenpaToScl(source) {
        convertedUrl=source;
        return structuredClone(fixture);
      }
    }
  }));
  assert.equal(JSON.parse(result).metadata.title,'Penpa example');
  assert.match(convertedUrl,/\?m=solve&p=/);
  const fromOnline=await fetchOnlinePuzzle(
    directPenpaEntry(url),
    async()=>{ throw Error('network must not be used for Penpa share'); },
    async()=>result
  );
  assert.equal(fromOnline,result);
  await assert.rejects(convertPenpaUrl(url,async()=>({
    PenpaToSclConverter:class {convertPenpaToScl(){throw Error('bad payload')}}
  })),/Penpa.*bad payload/);
});

test('Logic Masters extracts Penpa+ links without mixing or duplicating SudokuPad ones',()=>{
  const html='<h2>Mixed puzzle</h2>' +
    '<a href="https://swaroopg92.github.io/penpa-edit/#m=solve&amp;p=YWJj+/==">Penpa+</a>' +
    ' https://swaroopg92.github.io/penpa-edit/#m=solve&p=YWJj+/==' +
    '<a href="https://sudokupad.app/abc123">SudokuPad</a>' +
    '<a href="https://evil.example/penpa-edit/?m=solve&p=YWJj">bad</a>';
  const list=parseLogicMastersPage(html,'000OKF');
  assert.equal(list.length,2);
  assert.equal(list[0].id,'lmd:000OKF:'+penpaPuzzleId(url));
  assert.equal(list[0].puzzleUrl,url);
  assert.equal(list[1].id,'lmd:000OKF:abc123');
  const direct=directPuzzleEntry(url);
  assert.equal(direct.id,'lmd:direct:'+penpaPuzzleId(url));
  assert.match(direct.puzzleUrl,/penpa-edit/);
});


test('Penpa+ imported puzzle can restore its source, camera and selection',()=>{
  const entry=directPenpaEntry(url);
  const source=cachedSource('original-penpa',entry);
  assert.equal(source.type,'online');
  const text=serializeResume(source,{centerX:100,centerY:140,scale:0.8,selectedCells:[2],gridLines:true});
  const restored=parseResume(text);
  assert.equal(restored.source.entry.puzzleUrl,url);
  assert.deepEqual(restored.view.selectedCells,[2]);
});

test('Main import UI and restricted Android CSP integrate the bundled converter',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  const tauri=JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
  assert.match(main,/parsePenpaUrl\(input\)/);
  assert.match(main,/fetchOnlinePuzzle\(entry\)/);
  assert.match(html,/SCL \/ JSON \/ Penpa\+/);
  assert.equal(pkg.dependencies['@sudokupad/penpa-to-scl'],'0.0.1-preview.2');
  assert.match(tauri.app.security.csp,/script-src 'self' 'unsafe-eval'/);
  assert.doesNotMatch(tauri.app.security.csp,/connect-src[^;]*swaroopg92/);
});
