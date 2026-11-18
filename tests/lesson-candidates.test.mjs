import test from 'node:test';
import assert from 'node:assert/strict';
import {legalGivenCandidates,normalizeLessonCandidates}
  from '../src/lesson-candidates.js';

const puzzle4=()=>{
  const givens={0:1,1:2,4:3};
  return {cells:Array.from({length:4},(_,r)=>
    Array.from({length:4},(_,c)=>givens[r*4+c]?
      {value:String(givens[r*4+c])}:{})),
    metadata:{solution:'1234341221434321'}};
};
const fixture=(method='naked_single')=>({
  n:4,puzzle:puzzle4(),
  masks:Array.from({length:16},(_,i)=>({0:[1],1:[2],4:[3]}[i]||[1,2,3,4])),
  goal:{kind:'fill',index:5,digit:'4'},method,
  proof:{removed:[],method,remaining:[4]}
});
test('standard Sudoku 2x2 boxes, rows and columns remove conflicting givens',()=>{
  const legal=legalGivenCandidates(puzzle4());
  assert.deepEqual(legal[5],[4]); // R2C2 sees 1, 2, 3 in box
  assert.deepEqual(legal[2],[3,4]); // R1C3 sees row 1 and 2
  const f=fixture();
  assert.deepEqual(normalizeLessonCandidates(f)[5],[4]);
  assert.deepEqual(normalizeLessonCandidates(f)[2],[3,4]);
});
test('given digit conflicts are rejected, never presented as valid training',()=>{
  const f=fixture();
  f.puzzle.cells[0][2]={value:'1'};
  assert.throws(()=>normalizeLessonCandidates(f),/重复/);
});
test('ordinary technique cannot train a candidate excluded by fixed givens',()=>{
  const f=fixture('killer_sum');
  f.goal={kind:'remove',index:5,digit:'1'};
  f.proof={method:'killer_sum',removed:[1],remaining:[4]};
  assert.throws(()=>normalizeLessonCandidates(f),/已被行列宫/);
});
test('peer-elimination lesson alone retains one conflicting note to remove',()=>{
  const f=fixture('peer_elimination');
  f.goal={kind:'remove',index:5,digit:'1'};
  f.proof={method:'peer_elimination',removed:[1],remaining:[4]};
  const masks=normalizeLessonCandidates(f);
  assert.deepEqual(masks[5],[1,4]);
  assert.deepEqual(masks[2],[3,4]);
});
test('an equally proved legal elimination replaces a conflicting first digit',()=>{
  const f=fixture('naked_subset');
  f.goal={kind:'remove',index:2,digit:'1'};
  f.proof={method:'naked_subset',removed:[1,3],remaining:[4]};
  const masks=normalizeLessonCandidates(f);
  assert.equal(f.goal.digit,'3');
  assert.deepEqual(masks[2],[3,4]);
});
test('six-by-six uses 2x3 boxes instead of 3x2',()=>{
  const puzzle={cells:Array.from({length:6},()=>Array.from({length:6},()=>({})))};
  puzzle.cells[0][2]={value:'6'};
  puzzle.cells[2][2]={value:'5'};
  const legal=legalGivenCandidates(puzzle);
  assert.equal(legal[1].includes(6),false); // same 2x3 box
  assert.equal(legal[7].includes(6),false); // same 2x3 box
  assert.equal(legal[13].includes(6),true); // different box and column
  assert.equal(legal[13].includes(5),false); // same column as R3C3? index13=R3C2 no
});
