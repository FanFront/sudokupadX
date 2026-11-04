import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';
import {nextAdventureHint} from '../src/hints/adventure.js';
import {typedConstraints} from '../src/hints/constraint-data.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const names=[
  ['super-linked-swxudk82v1',{classic_sudoku:1,arrow:13}],
  ['super-linked-kt6bb0wm0k',{classic_sudoku:1,parity_line:2,skyscraper:7}],
  ['super-linked-lzer9x4edb',{classic_sudoku:1,little_killer:8}]
];
function loaded(name){
  const src=readFileSync(resolve(root,'public/puzzles',name+'.scl'),'utf8');
  const original=JSON.parse(LZString.decompressFromBase64(src.trim().slice(3)));
  const sidecar=JSON.parse(readFileSync(resolve(root,
    'public/puzzles/hint-constraints',name+'.json'),'utf8'));
  const puzzle={rows:9,cols:9,cells:original.cells.flat().map(c=>({given:c?.value??null})),
    rules:original.metadata.rules,regions:original.regions||[],
    hintConstraints:sidecar.constraints,sectors:[]};
  const progress={cells:Array.from({length:81},()=>({value:null,center:[],corner:[]})),
    visible:Array(81).fill(true)};
  return {original,sidecar,puzzle,progress,solution:[...original.metadata.solution].map(Number)};
}
test('three source-verified 9×9 challenges load their complete numeric clues',()=>{
  for(const [name,expected] of names){
    const {puzzle,progress}=loaded(name);
    const rules=typedConstraints(puzzle,progress);
    const counts=Object.fromEntries([...new Set(rules.map(r=>r.type))]
      .map(t=>[t,rules.filter(r=>r.type===t).length]));
    assert.deepEqual(counts,expected,name);
  }
});
test('Robot Patrobot preserves every arrow circle and its actual shaft',()=>{
  const {puzzle,progress,solution}=loaded('super-linked-swxudk82v1');
  const rules=typedConstraints(puzzle,progress).filter(r=>r.type==='arrow');
  for(const rule of rules){
    const circle=rule.cells[0];
    assert.equal(solution[circle],rule.cells.slice(1)
      .reduce((sum,i)=>sum+solution[i],0));
  }
  const single=rules.find(r=>r.cells.length===2);
  assert.ok(single,'author also drew single-cell shaft arrows');
  const [circle,shaft]=single.cells;
  progress.cells[circle].value=String(solution[circle]);
  progress.cells[shaft].center=[String(solution[shaft]),
    String(solution[shaft]===1?2:1)];
  const h=nextAdventureHint(puzzle,progress,4,shaft);
  assert.equal(h.step?.method,'arrow');
  assert.equal(h.step.cell,shaft);
  assert.ok(h.step.sources.includes(circle));
});
test('Under Pressure counts real visible buildings in clue direction',()=>{
  const {puzzle,progress,solution}=loaded('super-linked-kt6bb0wm0k');
  const rules=typedConstraints(puzzle,progress);
  for(const rule of rules){
    if(rule.type==='parity_line')
      assert.ok(rule.cells.slice(1).every((i,j)=>
        (solution[i]%2)!==(solution[rule.cells[j]]%2)));
    if(rule.type==='skyscraper'){
      let tallest=0,seen=0;
      for(const i of rule.cells)if(solution[i]>tallest){
        tallest=solution[i];seen++;
      }
      assert.equal(seen,rule.count);
    }
  }
  const edge=rules.find(r=>r.type==='skyscraper'&&r.count===2);
  assert.ok(edge);
  const target=edge.cells[0];
  progress.cells[target].center=['1','9'];
  const response=nextAdventureHint(puzzle,progress,4,target);
  assert.ok(['step','stalled'].includes(response.status));
});
test('Ascent little killer rays enter at a corner, never one row displaced',()=>{
  const {puzzle,progress,solution}=loaded('super-linked-lzer9x4edb');
  const rules=typedConstraints(puzzle,progress).filter(r=>r.type==='little_killer');
  assert.deepEqual(rules[0].cells,[18,10,2],
    'first top-left ray enters at R3C1, not R4C1');
  assert.equal(rules[0].sum,15);
  assert.deepEqual(rules[5].cells,[80,70,60,50,40,30,20,10,0],
    'long main diagonal from the bottom-right corner');
  for(const r of rules)
    assert.equal(r.cells.reduce((sum,i)=>sum+solution[i],0),r.sum);
  const r=rules[0],target=r.cells[0];
  progress.cells[r.cells[1]].value=String(solution[r.cells[1]]);
  progress.cells[r.cells[2]].value=String(solution[r.cells[2]]);
  const wrong=[1,2,3,4,5,6,7,8,9].find(d=>d!==solution[target]&&
    d!==solution[r.cells[1]]&&d!==solution[r.cells[2]]);
  progress.cells[target].center=[String(solution[target]),String(wrong)];
  const hint=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(hint.step?.method,'little_killer');
  assert.ok(hint.step.removed.includes(wrong));
});
