import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCheckpoint,inspectCheckpoint,verifyCheckpoint,matchingCatalogEntry,puzzleSlug
} from '../src/checkpoint.js';

const puzzle={key:'same-key',title:'Map',rows:2,cols:2,
  cells:[{given:'1'},{given:null},{given:null},{given:'4'}]};
const entry={id:'map-id',url:'https://sudokupad.app/abc123?setting-arrowsabovelines=1'};
const empty=()=>({value:null,corner:[],center:[],color:null});

test('portable checkpoint captures values, notes, colour and source without givens',()=>{
  const state={cells:[empty(),{value:'2',corner:['3'],center:['5'],color:'#a9d9a1'},empty(),empty()]};
  const cp=createCheckpoint(puzzle,entry,state);
  assert.deepEqual(cp.givens,['1',null,null,'4']);
  assert.equal(cp.sourceUrl,entry.url);
  assert.equal(cp.cells[1].value,'2');
  const reloaded=inspectCheckpoint(JSON.stringify(cp));
  assert.deepEqual(verifyCheckpoint(reloaded,puzzle,entry),cp.cells);
});

test('source-URL slug resolves same puzzle independent of options',()=>{
  const cp=inspectCheckpoint(JSON.stringify(createCheckpoint(puzzle,entry,{cells:Array.from({length:4},empty)})));
  assert.equal(puzzleSlug(cp.sourceUrl),'abc123');
  assert.equal(matchingCatalogEntry(cp,[{id:'other',url:'https://sudokupad.app/xyz'},entry])?.id,'map-id');
  const alternate={...entry,url:'https://sudokupad.app/abc123?setting-nogrid=1'};
  assert.equal(verifyCheckpoint(cp,puzzle,alternate).length,4);
});

test('foreign board/givens and malformed progress fail closed',()=>{
  const raw=createCheckpoint(puzzle,entry,{cells:Array.from({length:4},empty)});
  assert.throws(()=>verifyCheckpoint(raw,{...puzzle,cells:[{given:'9'},...puzzle.cells.slice(1)]},entry),/givens/i);
  assert.throws(()=>verifyCheckpoint(raw,{...puzzle,rows:4,cols:1},entry),/dimensions/i);
  assert.throws(()=>inspectCheckpoint(JSON.stringify({...raw,version:7})),/format/i);
  assert.throws(()=>inspectCheckpoint(JSON.stringify({...raw,cells:[{}]})),/grid/i);
  assert.throws(()=>inspectCheckpoint(JSON.stringify({...raw,cells:[empty(),{...empty(),value:'42'},empty(),empty()]})),/symbol/i);
  assert.throws(()=>inspectCheckpoint(JSON.stringify({...raw,cells:[empty(),{...empty(),color:'red'},empty(),empty()]})),/colour/i);
});

test('sodokupadAndroid checkpoint format can be imported without the X key',()=>{
  const cp=createCheckpoint(puzzle,entry,{cells:[empty(),{...empty(),center:['3'],corner:['8']},empty(),empty()]});
  cp.source='sodokupadAndroid';cp.key=null;
  const parsed=inspectCheckpoint(JSON.stringify(cp));
  assert.equal(verifyCheckpoint(parsed,puzzle,entry)[1].center[0],'3');
});

test('pen strokes round-trip through checkpoints without changing the Android v1 cell format',()=>{
  const state={cells:Array.from({length:4},empty)};
  const penLines=[{a:[1,1],b:[3,1],color:'#2486b3'},
    {a:[0,0],b:[2,0],color:'#34495e'}];
  const cp=createCheckpoint(puzzle,entry,state,penLines);
  assert.equal(cp.version,1);
  assert.deepEqual(inspectCheckpoint(JSON.stringify(cp)).penLines,penLines);
  assert.deepEqual(inspectCheckpoint(JSON.stringify(cp)).penMarks,[]);
  const old={...cp};delete old.penLines;
  assert.deepEqual(inspectCheckpoint(JSON.stringify(old)).penLines,[]);
  assert.deepEqual(inspectCheckpoint(JSON.stringify(old)).penMarks,[]);
  assert.throws(()=>inspectCheckpoint(JSON.stringify({
    ...cp,penLines:[{a:[1,1],b:[5,1],color:'#2486b3'}]
  })),/pen line/i);
});

test('circle and X pen marks round-trip in checkpoint v1 with old saves compatible',()=>{
  const state={cells:Array.from({length:4},empty)};
  const marks=[
    {at:[1,1],type:'circle',color:'#2486b3'},
    {at:[2,1],type:'cross',color:'#d45867'},
    {at:[2,2],type:'cross',color:'#34495e'}
  ];
  const cp=createCheckpoint(puzzle,entry,state,[],marks);
  assert.equal(cp.version,1);
  assert.deepEqual(inspectCheckpoint(JSON.stringify(cp)).penMarks,marks);
  const invalid={...cp,penMarks:[{at:[30,2],type:'cross',color:'#2486b3'}]};
  assert.throws(()=>inspectCheckpoint(JSON.stringify(invalid)),/pen mark/i);
});
