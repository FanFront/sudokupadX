import test from 'node:test';
import assert from 'node:assert/strict';
import {linksAtCell,parentMain,returnDestination} from '../src/linked-navigation.js';
import {getLinkedPuzzles} from '../src/adventure-ui.js';
import {readFileSync} from 'node:fs';
import LZString from 'lz-string';

const catalog=JSON.parse(readFileSync(new URL('../public/puzzles/catalog.json',import.meta.url),'utf8')).items;
const grid=(left,top,width,height,rules,title='Sector')=>({
  left,top,width,height,rules,title,
  cells:Array.from({length:width*height},(_,i)=>(top+Math.floor(i/width))*50+left+i%width)
});
const adventure=()=>({
  rows:40,cols:50,rules:'Starting area',
  cells:Array.from({length:40*50},()=>({given:null})),
  sectors:[]
});

test('real bundled links from every adventure resolve to a local SCL file',()=>{
  const examples=[
    'https://sudokupad.app/6cn54q09sv',
    'https://sudokupad.app/sudokuvania/boss-clones-quad',
    'https://sudokupad.app/gnp7aga2sx',
    'https://sudokupad.app/bpij5pdi3x'
  ];
  for(const url of examples) {
    const entry=getLinkedPuzzles('Enter '+url+'?setting-nogrid=1',catalog)[0];
    assert.ok(entry?.file?.endsWith('.scl'),url+' must map to a bundled puzzle');
  }
});

test('overlapping small story sector still exposes a link from its larger grid',()=>{
  const puzzle=adventure(),index=24*50+7;
  puzzle.sectors=[
    grid(5,24,9,9,'Boss: https://sudokupad.app/6cn54q09sv'),
    grid(7,24,1,1,'Read this note')
  ];
  const progress={visible:Array(2000).fill(false)};
  progress.visible[index]=true;
  const entries=linksAtCell(puzzle,progress,index,catalog,'digits-of-despair');
  assert.deepEqual(entries.map(entry=>entry.id),['boss-6cn54q09sv']);
});

test('overlapping multiple links remain distinct and a hidden cell cannot reveal them',()=>{
  const puzzle=adventure(),index=24*50+7;
  puzzle.sectors=[
    grid(5,24,9,9,'https://sudokupad.app/6cn54q09sv'),
    grid(7,24,1,1,'https://sudokupad.app/qs2zx7uynr'),
    grid(6,24,2,2,'https://sudokupad.app/6cn54q09sv')
  ];
  const progress={visible:Array(2000).fill(false)};
  assert.deepEqual(linksAtCell(puzzle,progress,index,catalog),[]);
  progress.visible[index]=true;
  const entries=linksAtCell(puzzle,progress,index,catalog);
  assert.deepEqual(new Set(entries.map(e=>e.id)),new Set(['boss-6cn54q09sv','boss-qs2zx7uynr']));
  assert.equal(linksAtCell(puzzle,progress,index,catalog,entries[0].id).length,1);
});

test('linked boss opened directly from URL or library can return to the correct parent map',()=>{
  const groups=[
    ['boss-6cn54q09sv','digits-of-despair'],
    ['boss-boss-clones-quad','lineage-of-logic'],
    ['super-linked-70qpd43i45','super-sudokoid-1'],
    ['super-linked-bpij5pdi3x','super-sudokoid-2']
  ];
  for(const [child,parent] of groups){
    const entry=catalog.find(x=>x.id===child);
    assert.equal(parentMain(entry,catalog)?.id,parent);
    assert.deepEqual(returnDestination(entry,catalog,[]),
      {id:parent,backState:null,fromStack:false});
  }
});

test('in-memory map return takes precedence and retains camera, selection and sector',()=>{
  const entry=catalog.find(x=>x.id==='boss-6cn54q09sv');
  const previous={id:'digits-of-despair',camera:{x:107,y:-33,scale:1.5},selected:731,
    selectedCells:[731]};
  assert.deepEqual(returnDestination(entry,catalog,[previous]),
    {id:'digits-of-despair',backState:previous,fromStack:true});
  const nested={...previous,id:'boss-qs2zx7uynr'};
  assert.deepEqual(returnDestination(entry,catalog,[previous,nested]).id,nested.id);
});

test('main puzzles have no fabricated return and unknown entries cannot escape catalog',()=>{
  assert.equal(returnDestination(catalog.find(x=>x.id==='digits-of-despair'),catalog),null);
  assert.equal(parentMain({id:'external',kind:'boss',group:'not-bundled'},catalog),null);
  assert.equal(returnDestination(null,catalog,[]),null);
});


test('new four game hubs and nested links work offline',()=>{
  for(const root of ['k4995f3fx1','utmh5dybvf','mfhh567b60','k7qc98e00u']){
    const hub=catalog.find(x=>x.id===root);
    assert.equal(hub?.kind,'standalone');
    assert.match(hub.file,/^puzzles\/new-[a-z0-9]+\.scl$/);
    assert.equal(returnDestination(hub,catalog,[]),null);
    assert.ok(catalog.filter(x=>x.group===root&&x.kind==='linked').length>=3);
  }
  for(const url of [
    'https://sudokupad.app/aaw113rfzh?setting-digitoutlines=0',
    'https://sudokupad.app/z7qsv9k00p?setting-digitoutlines=0&setting-nogrid=1',
    'https://sudokupad.app/sxa2lmgsa9',
    'https://sudokupad.app/mhyr83irby?setting-nogrid'
  ]){
    const result=getLinkedPuzzles('Enter '+url,catalog);
    assert.equal(result.length,1,url);
    assert.ok(result[0].file.endsWith('.scl'));
  }
  const deep=catalog.find(x=>x.id==='buekyq1ax3');
  assert.equal(parentMain(deep,catalog)?.id,'jsccrlmi02');
  assert.equal(returnDestination(deep,catalog,[]).id,'jsccrlmi02');
});


test('Sudokuvania 2 tutorial/prologue links to its fully bundled offline map',()=>{
  const entry=catalog.find(item=>item.id==='prologue-empty-house');
  assert.ok(entry,'prologue needs its own catalog entry');
  assert.equal(entry.parent,'lineage-of-logic');
  assert.equal(entry.group,'lineage-of-logic');
  assert.equal(entry.kind,'linked');
  assert.equal(entry.file,'puzzles/prologue-empty-house.scl');
  assert.deepEqual(getLinkedPuzzles(
    '[Click here to play the tutorial/prologue](https://sudokupad.app/sudokuvania/prologue-empty-house?setting-nogrid=1).',
    catalog).map(item=>item.id),['prologue-empty-house']);
  const puzzle=adventure(),index=7*50+8;
  puzzle.sectors=[grid(5,5,9,9,
    'Tutorial: https://sudokupad.app/sudokuvania/prologue-empty-house?setting-nogrid=1')];
  const progress={visible:Array(2000).fill(false)};
  assert.deepEqual(linksAtCell(puzzle,progress,index,catalog),[]);
  progress.visible[index]=true;
  assert.deepEqual(linksAtCell(puzzle,progress,index,catalog).map(item=>item.id),
    ['prologue-empty-house']);
  assert.equal(parentMain(entry,catalog)?.id,'lineage-of-logic');
  assert.equal(returnDestination(entry,catalog,[]).id,'lineage-of-logic');
});

test('every optional Sudokuvania 2 enemy tile resolves to an in-app playable catalog target',()=>{
  const source=readFileSync(new URL('../public/puzzles/lineage-of-logic.scl',import.meta.url),'utf8').trim();
  const raw=LZString.decompressFromBase64(source.slice(3));
  assert.ok(raw,'main adventure SCL must decompress');
  const sectors=JSON.parse(raw).metadata.grids;
  const enemies=sectors.filter(g=>g.width===1&&g.height===1&&
    /https:\/\/sudokupad\.app\/sudokuvania\/enemy-[a-z0-9-]+/.test(g.rules||''));
  assert.equal(enemies.length,27,'all original enemy encounters should be indexed');
  const entries=catalog.filter(e=>e.kind==='enemy'&&e.group==='lineage-of-logic');
  assert.equal(entries.length,27);
  assert.equal(new Set(entries.map(e=>e.id)).size,27);
  const puzzle={
    rows:50,cols:50,rules:'',
    cells:Array.from({length:2500},()=>({given:null})),
    sectors:enemies.map(g=>grid(g.left,g.top,g.width,g.height,g.rules,g.title))
  };
  const progress={visible:Array(2500).fill(false)};
  for(const sector of enemies){
    const at=sector.top*50+sector.left;
    const found=getLinkedPuzzles(sector.rules,catalog);
    assert.equal(found.length,1,'missing or ambiguous enemy: '+sector.rules);
    assert.equal(found[0].kind,'enemy');
    assert.equal(found[0].remote,true,'unbundled enemy must use remote on-demand importer');
    assert.equal(found[0].parent,'lineage-of-logic');
    assert.equal(returnDestination(found[0],catalog,[]).id,'lineage-of-logic');
    assert.deepEqual(linksAtCell(puzzle,progress,at,catalog,'lineage-of-logic'),[],
      'hidden enemy tile must not expose the link');
    progress.visible[at]=true;
    assert.deepEqual(linksAtCell(puzzle,progress,at,catalog,'lineage-of-logic')
      .map(e=>e.id),[found[0].id]);
    progress.visible[at]=false;
  }
});
