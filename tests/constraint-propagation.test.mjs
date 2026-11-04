import test from 'node:test';
import assert from 'node:assert/strict';
import {nextAdventureHint,gridsAndHouses}
  from '../src/hints/adventure.js';
import {typedConstraints} from '../src/hints/constraint-data.js';
import {findCombinedConstraintHint}
  from '../src/hints/constraint-propagation.js';
import {describeHint} from '../src/hints/format.js';

const all=Array.from({length:81},(_,i)=>i);
const at=(r,c)=>r*9+c;
function setup(){
  const puzzle={rows:9,cols:9,rules:'标准数独：每行、每列、每宫各有 1 至 9。',
    cells:all.map(()=>({given:null})),sectors:[],regions:[],
    hintConstraints:[{type:'classic_sudoku',cells:all}]};
  const progress={visible:all.map(()=>true),
    cells:all.map(()=>({value:null,center:[],corner:[]}))};
  return {puzzle,progress};
}
function sudokuValue(r,c){
  const x=((r*3+Math.floor(r/3)+c)%9)+1;
  // The last row has 4,5,9 at R9C5/6/7.
  return x===6?9:x===9?6:x;
}
const known=[[6,3],[6,4],[6,5],[7,3],[7,4],[7,5],
  [0,6],[1,6],[2,6],[4,6],[5,4],[5,5],[5,6],[6,6],[7,6]];
function verifiedArrowWorld(){
  const {puzzle,progress}=setup();
  for(const [r,c] of known)puzzle.cells[at(r,c)].given=String(sudokuValue(r,c));
  // Circle R9C7 = R9C5 + R9C6. From independent visible Sudoku
  // eliminations, the unfilled domains are {8,9}, {4,5}, {3,5}.
  puzzle.hintConstraints.push({
    type:'arrow',cells:[at(8,6),at(8,4),at(8,5)],
    circle:[at(8,6)],shaft:[at(8,4),at(8,5)]
  });
  progress.cells[at(8,4)].center=['4','5'];
  progress.cells[at(8,5)].center=['3','5'];
  progress.cells[at(8,6)].center=['8','9'];
  progress.cells[at(8,0)].center=['5','6'];
  return {puzzle,progress};
}
function directCandidateSets(puzzle,progress){
  const rules=typedConstraints(puzzle,progress);
  const layout=gridsAndHouses(puzzle,rules);
  const values=all.map(i=>Number(puzzle.cells[i].given??progress.cells[i].value)||0);
  const candidates=all.map(i=>{
    if(values[i])return null;
    const excluded=new Set();
    for(const house of layout.houses)if(house.cells.includes(i)){
      for(const j of house.cells)if(values[j])excluded.add(values[j]);
    }
    return Array.from({length:layout.domains[i]||9},(_,k)=>k+1)
      .filter(d=>!excluded.has(d));
  });
  return {rules,layout,state:{values,candidates}};
}
test('real Sudoku givens independently certify R9C5=45, R9C6=35, arrow circle=89',()=>{
  const {puzzle,progress}=verifiedArrowWorld();
  const {state}=directCandidateSets(puzzle,progress);
  assert.deepEqual(state.candidates[at(8,4)],[4,5]);
  assert.deepEqual(state.candidates[at(8,5)],[3,5]);
  assert.deepEqual(state.candidates[at(8,6)],[8,9]);
  assert.ok(state.candidates[at(8,0)].includes(5));
});
test('arrow 45 + 35 = 89 forces 5 in the shaft, eliminating 5 elsewhere in its row and box',()=>{
  const {puzzle,progress}=verifiedArrowWorld();
  const unchanged=JSON.stringify(progress);
  const {rules,layout,state}=directCandidateSets(puzzle,progress);
  const focus=at(8,5),result=findCombinedConstraintHint(puzzle,
    progress,layout,state,rules,4,focus);
  assert.ok(result,'multiple constraints should lead to a proved elimination');
  assert.equal(result.method,'constraint_locked_digit');
  assert.equal(result.level,3);
  assert.deepEqual([at(8,6),at(8,4),at(8,5)]
    .every(i=>result.sources.includes(i)),true);
  assert.ok(result.removed.includes(5));
  assert.ok(![at(8,4),at(8,5)].includes(result.cell));
  assert.ok(Math.floor(result.cell/9)===8||
    (Math.floor(result.cell/27)===2&&Math.floor(result.cell%9/3)===1));
  assert.match(result.reason,/至少一格必有 5/);
  assert.equal(JSON.stringify(progress),unchanged,
    'the true proof must not trust or modify pencil candidates');
});
test('the actual adventure hint pipeline prioritizes the mandatory 5 when the shaft is focused',()=>{
  const {puzzle,progress}=verifiedArrowWorld();
  // The app uses the source focus when the user selects R9C6.
  const result=nextAdventureHint(puzzle,progress,4,at(8,5));
  assert.equal(result.status,'step');
  assert.equal(result.step.method,'constraint_locked_digit');
  assert.equal(result.step.assumptionBased,undefined);
  assert.ok(result.step.removed.includes(5));
  const rendered=describeHint(result,9,progress.cells);
  assert.match(rendered.title,/变体强制数字/);
  assert.equal(rendered.assumptionBased,false);
  assert.equal(rendered.placement,false);
});
test('arrow reasoning is unchanged when all center/corner notes are deleted or deliberately wrong',()=>{
  const {puzzle,progress}=verifiedArrowWorld();
  progress.cells=progress.cells.map(()=>({value:null,center:[],corner:[]}));
  let first=nextAdventureHint(puzzle,progress,4,at(8,5));
  assert.equal(first.step?.method,'constraint_locked_digit');
  progress.cells[at(8,4)].center=['1','2'];
  progress.cells[at(8,5)].center=['1','2'];
  progress.cells[at(8,6)].center=['1','2'];
  let second=nextAdventureHint(puzzle,progress,4,at(8,5));
  assert.equal(second.step?.method,'constraint_locked_digit');
  assert.ok(second.step.removed.includes(5));
});
test('an unrevealed arrow circle or shaft cannot establish locked digits',()=>{
  const {puzzle,progress}=verifiedArrowWorld();
  progress.visible[at(8,6)]=false;
  const result=nextAdventureHint(puzzle,progress,4,at(8,5));
  assert.notEqual(result.step?.method,'constraint_locked_digit');
});
test('generalized N-subsets recognize a provable naked quadruple and eliminate 1–4',()=>{
  const {puzzle,progress}=setup(),state=directCandidateSets(puzzle,progress);
  const sources=[at(0,0),at(0,1),at(0,2),at(0,3)];
  const target=at(0,4);
  const sets=[[1,2],[1,3],[2,4],[3,4]];
  sources.forEach((i,j)=>state.state.candidates[i]=sets[j]);
  state.state.candidates[target]=[1,2,3,4,5,6];
  const proof=findCombinedConstraintHint(puzzle,progress,
    state.layout,state.state,state.rules,4,sources[2]);
  assert.ok(proof);
  assert.equal(proof.method,'naked_subset');
  assert.ok(proof.sources.length===4);
  assert.ok(proof.removed.some(d=>[1,2,3,4].includes(d)));
  assert.match(proof.reason,/4 格恰好被 4 个数字/);
});
test('an unsupported arrow combination is never turned into a forced candidate',()=>{
  const {puzzle,progress}=setup();
  // Both shafts can be 1 or 2; circle can be 2,3 or 4, so no
  // particular shaft digit is universally required.
  puzzle.hintConstraints.push({
    type:'arrow',cells:[at(8,6),at(8,4),at(8,5)],
    circle:[at(8,6)],shaft:[at(8,4),at(8,5)]
  });
  const {layout,rules,state}=directCandidateSets(puzzle,progress);
  state.candidates[at(8,4)]=[1,2];
  state.candidates[at(8,5)]=[1,2];
  state.candidates[at(8,6)]=[2,3,4];
  const step=findCombinedConstraintHint(puzzle,progress,layout,state,rules,4,at(8,5));
  assert.notEqual(step?.method,'constraint_locked_digit');
});
