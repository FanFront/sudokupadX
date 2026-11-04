import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import LZString from 'lz-string';
import {typedConstraints} from '../src/hints/constraint-data.js';
import {nextAdventureHint} from '../src/hints/adventure.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const challenges=[
  ['super-linked-1hh6q5xl6l',{classic_sudoku:1,lava:1}],
  ['super-linked-qfnpbofkiq',{classic_sudoku:1,indexing_rows:1}],
  ['super-linked-70qpd43i45',{classic_sudoku:1,kropki:2,killer:15}],
  ['super-linked-f4c9vuptqj',{classic_sudoku:1,kropki:33}],
  ['super-linked-gnp7aga2sx',{classic_sudoku:1,ambiguous_thermo:10}]
];
function load(name){
  const raw=readFileSync(resolve(root,'public/puzzles',name+'.scl'),'utf8');
  const source=JSON.parse(LZString.decompressFromBase64(raw.trim().slice(3)));
  const manifest=JSON.parse(readFileSync(resolve(root,
    'public/puzzles/hint-constraints',name+'.json'),'utf8'));
  const puzzle={rows:9,cols:9,rules:source.metadata.rules,
    cells:Array.from({length:81},()=>({given:null})),
    // Leave unrelated original givens out of targeted rule-specific proof tests.
    regions:source.regions||[],sectors:[],cages:source.cages||[],
    hintConstraints:manifest.constraints};
  const progress={visible:Array(81).fill(true),
    cells:Array.from({length:81},()=>({value:null,center:[],corner:[]}))};
  return {raw,source,manifest,puzzle,progress,solution:[...source.metadata.solution].map(Number)};
}
function fnv(raw){
  let hash=0xcbf29ce484222325n;
  for(const byte of Buffer.from(raw.trim(),'utf8'))
    hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);
  return 'fnv1a-'+hash.toString(16).padStart(16,'0');
}
test('five original challenge manifests are pinned and audited as independent types',()=>{
  for(const [name,expected] of challenges){
    const {source,raw,manifest,puzzle,progress}=load(name);
    assert.equal(manifest.sourcePuzzleId,source.id);
    assert.equal(manifest.sourceFingerprint,fnv(raw));
    assert.deepEqual(manifest.sourceDimensions,[9,9]);
    const typed=typedConstraints(puzzle,progress);
    const byType=Object.fromEntries([...new Set(typed.map(r=>r.type))]
      .map(type=>[type,typed.filter(r=>r.type===type).length]));
    assert.deepEqual(byType,expected,name);
  }
});
test('No Fair applies lava adjacency to all 81 cells, not visual color alone',()=>{
  const {puzzle,progress,solution}=load('super-linked-1hh6q5xl6l');
  progress.cells[0].value=String(solution[0]);
  progress.cells[1].center=['2',String(solution[1])];
  const result=nextAdventureHint(puzzle,progress,4,1);
  assert.equal(result.step?.method,'lava');
  assert.ok(result.step.removed.includes(2));
  assert.ok(result.step.sources.includes(0));
});
test('Energy Transfer proves the index relation from the current row',()=>{
  const {puzzle,progress,solution}=load('super-linked-qfnpbofkiq');
  const source=1,digit=solution[source],target=digit-1;
  assert.notEqual(source,target);
  progress.cells[source].value=String(digit);
  progress.cells[target].center=[String(source+1),'5'];
  const result=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(result.step?.method,'indexing_rows');
  assert.equal(result.step.cell,target);
  assert.ok(result.step.removed.includes(5));
});
test('9 Feet Under exact killer cage totals produce supported exclusions',()=>{
  const {puzzle,progress,solution}=load('super-linked-70qpd43i45');
  // The authored white dots can prove an independent, higher-ranked
  // elimination in these same cells. Isolate the Killer to assert that the
  // arithmetic technique itself works, not the UI's technique ranking.
  const cage=puzzle.hintConstraints.find(r=>r.type==='killer'&&r.cells.length===3);
  assert.ok(cage);
  puzzle.hintConstraints=puzzle.hintConstraints.filter(r=>r.type!=='kropki');
  for(const i of cage.cells.slice(0,2))
    progress.cells[i].value=String(solution[i]);
  const target=cage.cells[2],correct=solution[target];
  const wrong=Array.from({length:9},(_,i)=>i+1)
    .find(d=>d!==correct&&!cage.cells.slice(0,2).some(i=>solution[i]===d));
  progress.cells[target].center=[String(correct),String(wrong)];
  const result=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(result.step?.method,'killer_sum');
  assert.ok(result.step.removed.includes(wrong));
});
test('Temple Temper scan dots apply exact +/-1 to their explicit neighbor cells',()=>{
  const {puzzle,progress,solution}=load('super-linked-f4c9vuptqj');
  const dot=puzzle.hintConstraints.find(r=>r.type==='kropki');
  const [source,target]=dot.cells,d=solution[source];
  const wrong=Array.from({length:9},(_,i)=>i+1)
    .find(x=>x!==d&&Math.abs(x-d)!==1&&x!==solution[target]);
  progress.cells[source].value=String(d);
  progress.cells[target].center=[String(solution[target]),String(wrong)];
  const result=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(result.step?.method,'kropki');
  assert.ok(result.step.removed.includes(wrong));
});
test('Critical Mess can exclude extremes without inventing missing bulbs',()=>{
  const {puzzle,progress,solution}=load('super-linked-gnp7aga2sx');
  const thermo=puzzle.hintConstraints
    .filter(r=>r.type==='ambiguous_thermo')
    .find(r=>r.cells.length>=5);
  assert.ok(thermo);
  const target=thermo.cells[Math.floor(thermo.cells.length/2)];
  const correct=solution[target];
  progress.cells[target].center=[String(correct),'1','9'];
  const result=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(result.step?.method,'ambiguous_thermo');
  assert.ok(result.step.removed.includes(1)||result.step.removed.includes(9));
});
