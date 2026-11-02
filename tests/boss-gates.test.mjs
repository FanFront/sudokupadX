import test from 'node:test';
import assert from 'node:assert/strict';
import {markBossCleared,isBossCleared,lockedBossGate,applyBossReveals} from '../src/boss-gates.js';

function memoryStorage(){
  const items=new Map();
  return {
    setItem(key,value){items.set(key,String(value));},
    getItem(key){return items.get(key)??null;}
  };
}
const group='generated-adventure-1';
const gate0={bossId:group+'-boss-1',seed:20261102,cell:[4,9],
  reward:'7',reveals:[[6,6],[10,15]]};
const gate1={bossId:group+'-boss-2',seed:20261102,cell:[10,15],
  reward:'3',reveals:[[12,12]]};
function world(){
  const puzzle={key:group,rows:27,cols:27,
    cells:Array.from({length:729},()=>({given:null})),
    bossGates:[gate0,gate1]};
  const progress={visible:Array(729).fill(false),
    cells:Array.from({length:729},()=>({value:null})),solved:false};
  progress.visible[4*27+9]=true;
  return {puzzle,progress};
}
function boss(gate,solved=true){
  return {puzzle:{bossLink:{parent:group,bossId:gate.bossId,seed:gate.seed}},
    progress:{solved}};
}

test('boss reward cells remain locked until the linked boss is completed',()=>{
  const storage=memoryStorage();
  const {puzzle}=world();
  assert.equal(lockedBossGate(puzzle,4*27+9,storage),true);
  const a=boss(gate0,false);
  assert.equal(markBossCleared(a.puzzle,a.progress,storage),false);
  assert.equal(isBossCleared(puzzle,gate0,storage),false);
  const b=boss(gate0,true);
  assert.equal(markBossCleared(b.puzzle,b.progress,storage),true);
  assert.equal(lockedBossGate(puzzle,4*27+9,storage),false);
  assert.equal(lockedBossGate(puzzle,0,storage),false);
  assert.equal(isBossCleared(puzzle,gate1,storage),false);
});

test('boss completion alone does not reveal fog; correct code is also required',()=>{
  const storage=memoryStorage(),{puzzle,progress}=world();
  markBossCleared(boss(gate0).puzzle,boss(gate0).progress,storage);
  applyBossReveals(puzzle,progress,storage);
  assert.equal(progress.visible[6*27+6],false);
  progress.cells[4*27+9].value='5';
  applyBossReveals(puzzle,progress,storage);
  assert.equal(progress.visible[6*27+6],false);
  progress.cells[4*27+9].value='7';
  applyBossReveals(puzzle,progress,storage);
  assert.equal(progress.visible[6*27+6],true);
  assert.equal(progress.visible[10*27+15],true);
  assert.equal(progress.visible[12*27+12],false);
});

test('fog progression is ordered and restores from saved boss completion',()=>{
  const storage=memoryStorage(),{puzzle,progress}=world();
  progress.cells[4*27+9].value='7';
  progress.cells[10*27+15].value='3';
  markBossCleared(boss(gate1).puzzle,boss(gate1).progress,storage);
  applyBossReveals(puzzle,progress,storage);
  assert.equal(progress.visible[12*27+12],false,
    'second gate must not skip first gate');
  markBossCleared(boss(gate0).puzzle,boss(gate0).progress,storage);
  // Simulate a Rust restore (fog returns to initial state).
  progress.visible=Array(729).fill(false);
  progress.visible[4*27+9]=true;
  applyBossReveals(puzzle,progress,storage);
  assert.equal(progress.visible[6*27+6],true);
  assert.equal(progress.visible[12*27+12],true);
  progress.cells[4*27+9].value=null;
  progress.visible=Array(729).fill(false);
  progress.visible[4*27+9]=true;
  applyBossReveals(puzzle,progress,storage);
  assert.equal(progress.visible[12*27+12],false);
});

test('completion is scoped to parent and seed',()=>{
  const storage=memoryStorage(),{puzzle}=world();
  markBossCleared(boss(gate0).puzzle,boss(gate0).progress,storage);
  assert.equal(isBossCleared(puzzle,{...gate0,seed:20261103},storage),false);
  assert.equal(isBossCleared({...puzzle,key:'another-adventure'},gate0,storage),false);
  assert.equal(markBossCleared({bossLink:{parent:group,bossId:'../other',seed:1}},
    {solved:true},storage),false);
});

test('full-grid reward v2 never reuses an old R5C5 completion flag',()=>{
  const storage=memoryStorage();
  const oldGate={...gate0};
  const freshGate={...gate0,rewardVersion:2,reward:'8'};
  const {puzzle,progress}=world();
  puzzle.bossGates=[freshGate];
  const clearedV1=boss(oldGate,true);
  assert.equal(markBossCleared(clearedV1.puzzle,clearedV1.progress,storage),true);
  assert.equal(isBossCleared(puzzle,freshGate,storage),false);
  assert.equal(lockedBossGate(puzzle,4*27+9,storage),true);
  progress.cells[4*27+9].value='8';
  applyBossReveals(puzzle,progress,storage);
  assert.equal(progress.visible[6*27+6],false);
  const clearedV2=boss(freshGate,true);
  clearedV2.puzzle.bossLink.rewardVersion=2;
  assert.equal(markBossCleared(clearedV2.puzzle,clearedV2.progress,storage),true);
  assert.equal(isBossCleared(puzzle,freshGate,storage),true);
  applyBossReveals(puzzle,progress,storage);
  assert.equal(progress.visible[6*27+6],true);
});
