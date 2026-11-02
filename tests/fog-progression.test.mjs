import test from 'node:test';
import assert from 'node:assert/strict';
import {applyBossReveals,markBossCleared} from '../src/boss-gates.js';

const group='generated-adventure-1';
const bossId=group+'-boss-1';
function storage(){
  const records=new Map();
  return {
    getItem:key=>records.get(key)??null,
    setItem:(key,val)=>records.set(key,String(val))
  };
}
const idx=(r,c)=>r*27+c;
function fixture(){
  const puzzle={key:group,rows:27,cols:27,
    cells:Array.from({length:729},()=>({given:null})),
    bossGates:[
      {bossId,seed:20261102,rewardVersion:3,
        cell:[2,1],reward:'7',reveals:[[6,6],[6,7]]},
      {bossId:group+'-boss-2',seed:20261102,rewardVersion:3,
        cell:[8,9],reward:'3',reveals:[]}
    ],
    fogRules:[
      {chapter:0,cells:[[0,0]],values:['1'],reveals:[[0,1],[1,1]]},
      {chapter:0,cells:[[0,1]],values:['2'],reveals:[[0,2]]},
      {chapter:0,cells:[[0,0],[0,1]],values:['1','2'],reveals:[[2,1]]},
      {chapter:1,cells:[[6,6]],values:['4'],reveals:[[6,8]]}
    ]
  };
  const progress={
    visible:Array(729).fill(false),
    cells:Array.from({length:729},()=>({value:null})),solved:false
  };
  progress.visible[idx(0,0)]=true;
  return {puzzle,progress};
}

test('correct entries gradually reveal local cells, wrong entries do not',()=>{
  const {puzzle,progress}=fixture(),store=storage();
  progress.cells[idx(0,0)].value='3';
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(0,1)],false);
  progress.cells[idx(0,0)].value='1';
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(0,1)],true);
  assert.equal(progress.visible[idx(0,2)],false);
  assert.equal(progress.visible[idx(6,6)],false);
  progress.cells[idx(0,1)].value='2';
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(0,2)],true);
  assert.equal(progress.visible[idx(2,1)],true);
});

test('unrevealed or unopened chapters cannot trigger fog, even with correct values',()=>{
  const {puzzle,progress}=fixture(),store=storage();
  progress.cells[idx(0,1)].value='2'; // Hidden input is allowed as in SudokuPad.
  progress.cells[idx(6,6)].value='4'; // Chapter two is still boss-locked.
  progress.visible[idx(6,6)]=true; // Could be a shared overlap.
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(0,2)],false);
  assert.equal(progress.visible[idx(6,8)],false);
  progress.cells[idx(0,0)].value='1';
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(0,2)],true);
  assert.equal(progress.visible[idx(6,8)],false);
});

test('boss completion alone cannot reveal the next chapter, only its small seed',()=>{
  const {puzzle,progress}=fixture(),store=storage();
  progress.cells[idx(0,0)].value='1';
  progress.cells[idx(0,1)].value='2';
  applyBossReveals(puzzle,progress,store);
  const boss={bossLink:{parent:group,bossId,seed:20261102,rewardVersion:3}};
  assert.equal(markBossCleared(boss,{solved:true},store),true);
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(6,7)],false);
  progress.cells[idx(2,1)].value='7';
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(6,7)],true);
  assert.equal(progress.visible[idx(6,8)],false);
  progress.cells[idx(6,6)].value='4';
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(6,8)],true);
  assert.equal(progress.visible[idx(8,8)],false,
    'the remainder of the new Sudoku must stay hidden');
});

test('fog recalculates after restore without a stored visibility bitmap',()=>{
  const {puzzle,progress}=fixture(),store=storage();
  progress.cells[idx(0,0)].value='1';
  progress.cells[idx(0,1)].value='2';
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(2,1)],true);
  progress.visible=Array(729).fill(false);
  progress.visible[idx(0,0)]=true;
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(2,1)],true);
  progress.cells[idx(0,0)].value=null;
  progress.visible=Array(729).fill(false);
  progress.visible[idx(0,0)]=true;
  applyBossReveals(puzzle,progress,store);
  assert.equal(progress.visible[idx(2,1)],false);
});
