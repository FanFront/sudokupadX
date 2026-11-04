import test from 'node:test';
import assert from 'node:assert/strict';
import {findPencilSubsetHint,preferPencilSubset}
  from '../src/hints/pencil-subsets.js';
import {describeHint} from '../src/hints/format.js';

const at=(r,c)=>r*9+c;
function board(generated=false){
  const puzzle={rows:9,cols:9,rules:'标准数独：每行、每列、每宫均不能重复',
    cells:Array.from({length:81},()=>({given:null})),
    regions:[],sectors:[],
    hintConstraints:generated?[]:[
      {type:'classic_sudoku',cells:Array.from({length:81},(_,i)=>i)}
    ]};
  if(generated)puzzle.hintRules=[];
  const progress={visible:Array(81).fill(true),
    cells:Array.from({length:81},()=>({value:null,center:[],corner:[]}))};
  const three=[at(0,0),at(0,3),at(0,6)],target=at(0,8);
  progress.cells[three[0]].center=['3','4'];
  progress.cells[three[1]].center=['3','5'];
  progress.cells[three[2]].center=['4','5'];
  progress.cells[target].center=['3','4','5','9'];
  return {puzzle,progress,three,target};
}
function makeProvable({puzzle}){
  // R1 has 3,4,5,9 unplaced; column exclusions establish exactly
  // 34 at R1C1, 35 at R1C4, 45 at R1C7 without using pencil notes.
  for(const [r,c,d] of [
    [0,1,1],[0,2,2],[0,4,6],[0,5,7],[0,7,8],
    [3,0,5],[4,0,9],[3,3,4],[5,3,9],[3,6,3],[6,6,9]
  ])puzzle.cells[at(r,c)].given=String(d);
}
test('34,35,45 form a verified naked triple when the visible Sudoku rules prove each source bound',()=>{
  for(const generated of [false,true]){
    const sample=board(generated);
    makeProvable(sample);
    const {puzzle,progress,three,target}=sample;
    const hint=findPencilSubsetHint(puzzle,progress,2,target);
    assert.equal(hint.status,'step');
    assert.equal(hint.step.method,'naked_subset');
    assert.equal(hint.step.assumptionBased,false);
    assert.equal(hint.step.subsetSize,3);
    assert.deepEqual(hint.step.subsetDigits,[3,4,5]);
    assert.deepEqual(hint.step.sources,three);
    assert.equal(hint.step.cell,target);
    assert.deepEqual(hint.step.removed,[3,4,5]);
    assert.deepEqual(hint.step.remaining,[9]);
    const rendered=describeHint(hint,9,progress.cells);
    assert.equal(rendered.assumptionBased,false);
    assert.equal(rendered.placement,false,'elimination is not an automatic placement');
    assert.match(rendered.description,/显性三数组/);
  }
});
test('34,35,45 are still recognized from center notes but without pretending notes are exhaustive facts',()=>{
  const {puzzle,progress,target,three}=board();
  const before=JSON.stringify(progress);
  const hint=findPencilSubsetHint(puzzle,progress,4,target);
  assert.equal(hint.status,'step');
  assert.equal(hint.step.method,'pencil_subset');
  assert.equal(hint.step.assumptionBased,true);
  assert.equal(hint.step.cell,target);
  assert.deepEqual(hint.step.sources,three);
  assert.deepEqual(hint.step.removed,[3,4,5]);
  assert.deepEqual(hint.step.remaining,[9]);
  assert.match(hint.step.reason,/如果.*完整列出/);
  const display=describeHint(hint,9,progress.cells);
  assert.equal(display.assumptionBased,true);
  assert.match(display.title,/待验证/);
  assert.match(display.description,/不是已证明的排除/);
  assert.equal(display.placement,false);
  assert.equal(JSON.stringify(progress),before,'hints never mutate pencil marks');
});
test('three source notes must be in the same real all-different house',()=>{
  const {puzzle,progress,target,three}=board();
  progress.cells[three[1]].center=[];
  progress.cells[at(3,3)].center=['3','5'];
  assert.equal(findPencilSubsetHint(puzzle,progress,4,target),null);
});
test('fogged sources and targets may not be used to suggest pencil eliminations',()=>{
  const {puzzle,progress,three,target}=board();
  progress.visible[three[1]]=false;
  assert.equal(findPencilSubsetHint(puzzle,progress,4,target),null);
  progress.visible[three[1]]=true;
  progress.visible[target]=false;
  assert.equal(findPencilSubsetHint(puzzle,progress,4,target),null);
});
test('invalid or incomplete annotated source unions do not fake a naked triple',()=>{
  const {puzzle,progress,target,three}=board();
  progress.cells[three[0]].center=['3','4','6'];
  assert.equal(findPencilSubsetHint(puzzle,progress,4,target),null);
  progress.cells[three[0]].center=['3','4'];
  progress.cells[target].center=['3','4','5'];
  assert.equal(findPencilSubsetHint(puzzle,progress,4,target),null,
    'do not recommend deleting every user candidate in a cell');
});
test('center note naked triples require tier 2 and never override a conflicted or completed puzzle',()=>{
  const {puzzle,progress,target}=board();
  assert.equal(findPencilSubsetHint(puzzle,progress,1,target),null);
  const pencil=findPencilSubsetHint(puzzle,progress,4,target);
  const conflict={status:'conflict',step:null,level:0};
  assert.equal(preferPencilSubset(conflict,pencil,target),conflict);
  const complete={status:'complete',step:null,level:0};
  assert.equal(preferPencilSubset(complete,pencil,target),complete);
  assert.equal(preferPencilSubset({status:'stalled'},pencil,target),pencil);
  assert.equal(preferPencilSubset({status:'step',step:{
    method:'peer_elimination'}},pencil,target),pencil);
});
test('notes with an already filled source or a visible contradiction cannot certify triples',()=>{
  const {puzzle,progress,target,three}=board();
  puzzle.cells[three[0]].given='3';
  assert.equal(findPencilSubsetHint(puzzle,progress,4,target),null);
  puzzle.cells[three[0]].given=null;
  puzzle.cells[at(1,1)].given='6';
  puzzle.cells[at(2,2)].given='6'; // duplicates in the same 3×3 box
  assert.equal(findPencilSubsetHint(puzzle,progress,4,target),null);
});
