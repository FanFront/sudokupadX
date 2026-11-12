import test from 'node:test';
import assert from 'node:assert/strict';
import {buildHintPlusUpdates,buildClearRedPlusUpdates,singleMarkedCandidate} from '../src/hints/apply.js';

function setup(size=9) {
  const puzzle={cells:Array.from({length:size*size},()=>({given:null}))};
  const progress={cells:Array.from({length:size*size},()=>({value:null,center:[],corner:[],color:null})),
    visible:Array(size*size).fill(true)};
  return {puzzle,progress};
}
const verified=(step)=>({status:'step',step});

test('hint+ removes both candidate types and promotes a singleton after elimination',()=>{
  const {puzzle,progress}=setup();
  progress.cells[1].center=['2','3'];
  progress.cells[1].corner=['2','3'];
  progress.cells[2].center=['3','4','5'];
  const before=structuredClone(progress);
  const updates=buildHintPlusUpdates(puzzle,progress,verified({
    cell:1,removed:[3],remaining:[2,4,5],before:[2,3,4,5],
    forceElimination:true,affectedCells:[1,2]
  }));
  assert.deepEqual(updates,[
    {index:1,corner:[],center:[],value:'2'},
    {index:2,corner:[],center:['4','5']}
  ]);
  assert.deepEqual(progress,before,'hint planning must not mutate input');
});

test('verified direct placement works without prior notes, overriding a mistaken single mark',()=>{
  const {puzzle,progress}=setup();
  progress.cells[4].center=['9'];
  assert.deepEqual(buildHintPlusUpdates(puzzle,progress,verified({
    cell:4,removed:[1,2],remaining:[3],before:[1,2,3],method:'hidden_single'
  })),[{index:4,corner:[],center:[],value:'3'}]);
  assert.deepEqual(buildHintPlusUpdates(puzzle,progress,verified({
    cell:5,removed:[1,2],remaining:[3],before:[1,2,3],method:'hidden_single'
  })),[{index:5,corner:[],center:[],value:'3'}]);
});

test('unverified conditional hints cannot silently alter the game',()=>{
  const {puzzle,progress}=setup();
  progress.cells[3].center=['1','2'];
  assert.deepEqual(buildHintPlusUpdates(puzzle,progress,verified({
    cell:3,removed:[2],remaining:[1],before:[1,2],assumptionBased:true
  })),[]);
  assert.deepEqual(buildHintPlusUpdates(puzzle,progress,{status:'stalled'}),[]);
});

test('hint+ rejects fog and given cells and preserves existing values',()=>{
  const {puzzle,progress}=setup();
  puzzle.cells[0].given='1';
  progress.visible[1]=false;
  progress.cells[2].value='4';
  for(const i of [0,1,2])progress.cells[i].center=['4','5'];
  assert.deepEqual(buildHintPlusUpdates(puzzle,progress,verified({
    cell:0,affectedCells:[1,2,3],removed:[4],forceElimination:true
  })),[]);
});

test('clear red removes only red marks, promotes resulting and pre-existing singles',()=>{
  const {puzzle,progress}=setup();
  progress.cells[0].center=['3','7'];progress.cells[0].corner=['3','7'];
  progress.cells[1].center=['5'];
  progress.cells[2].corner=['2','6'];progress.cells[2].center=['6'];
  progress.cells[3].center=['1','9'];
  progress.cells[4].center=['8'];progress.cells[4].corner=['2'];
  const conflicts={noteSymbols:[]};conflicts.noteSymbols[0]=new Set(['7']);
  conflicts.noteSymbols[2]=new Set(['2']);
  const updates=buildClearRedPlusUpdates(puzzle,progress,conflicts);
  assert.deepEqual(updates,[
    {index:0,corner:[],center:[],value:'3'},
    {index:1,corner:[],center:[],value:'5'},
    {index:2,corner:[],center:[],value:'6'}
  ]);
  assert.equal(singleMarkedCandidate(progress.cells[4]),null);
});

test('clear red never promotes hidden or given cells; gate can prevent placement',()=>{
  const {puzzle,progress}=setup();
  progress.cells[0].center=['1'];puzzle.cells[0].given='7';
  progress.cells[1].center=['2'];progress.visible[1]=false;
  progress.cells[2].center=['3'];
  progress.cells[3].center=['8','9'];
  const conflicts={noteSymbols:[]};conflicts.noteSymbols[3]=new Set(['9']);
  assert.deepEqual(buildClearRedPlusUpdates(puzzle,progress,conflicts,
    index=>index!==2&&index!==3),[
    {index:3,corner:[],center:['8']}
  ]);
});

test('clear red can promote a pre-existing singleton even without red marks',()=>{
  const {puzzle,progress}=setup();
  progress.cells[8].corner=['7'];
  assert.deepEqual(buildClearRedPlusUpdates(puzzle,progress,{noteSymbols:[]}),[
    {index:8,corner:[],center:[],value:'7'}
  ]);
});

test('a removed last candidate never invents a value',()=>{
  const {puzzle,progress}=setup();
  progress.cells[0].center=['6'];
  const updates=buildHintPlusUpdates(puzzle,progress,verified({
    cell:0,removed:[6],remaining:[1,2],before:[1,2,6],forceElimination:true
  }));
  assert.deepEqual(updates,[{index:0,corner:[],center:[]}]);
});
