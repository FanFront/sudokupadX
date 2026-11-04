import test from 'node:test';
import assert from 'node:assert/strict';
import {nextAdventureHint} from '../src/hints/adventure.js';
import {typedConstraints} from '../src/hints/constraint-data.js';
import {describeHint} from '../src/hints/format.js';

const rows=40,cols=50,at=(r,c)=>r*cols+c;
function game(constraints,fill={},notes={},rectangles=[]){
  const count=rows*cols;
  const puzzle={rows,cols,cells:Array.from({length:count},()=>({given:null})),
    sectors:rectangles,regions:[],cages:[],lines:[],overlays:[],
    hintConstraints:constraints};
  const progress={visible:Array(count).fill(false),
    cells:Array.from({length:count},()=>({value:null,center:[],corner:[]}))};
  for(const [cell,d] of Object.entries(fill)){
    puzzle.cells[Number(cell)].given=String(d);
    progress.visible[Number(cell)]=true;
  }
  for(const [cell,ds] of Object.entries(notes)){
    progress.cells[Number(cell)].center=ds.map(String);
    progress.visible[Number(cell)]=true;
  }
  for(const constraint of constraints){
    for(const cell of constraint.cells||[]){
      const idx=Array.isArray(cell)?at(cell[0],cell[1]):cell;
      progress.visible[idx]=true;
    }
    for(const cell of constraint.unlockCells||[]){
      const idx=Array.isArray(cell)?at(cell[0],cell[1]):cell;
      progress.visible[idx]=true;
    }
  }
  return {puzzle,progress};
}
function verifyPair(type,from,to,known,handwritten,expected,extra={}){
  const {puzzle,progress}=game([{type,cells:[from,to],...extra}],
    {[from]:known},{[to]:handwritten});
  const h=nextAdventureHint(puzzle,progress,4,to);
  assert.equal(h.status,'step',type+' status');
  assert.equal(h.step.method,type,type+' method');
  assert.equal(h.step.cell,to,type+' cell');
  assert.ok(h.step.removed.includes(expected),type+' removal');
  assert.ok(h.step.sources.includes(from),type+' witness');
  assert.equal(describeHint(h,cols,progress.cells).placement,false,
    type+' without a known digit domain cannot announce a placement');
  return {puzzle,progress};
}
test('palindrome uses symmetric values, not a colored line',()=>{
  verifyPair('palindrome',at(30,10),at(31,20),4,[2,4],2);
});
test('parity lines, prime sums and reverse whispers prove new candidate removals',()=>{
  verifyPair('parity_line',at(30,10),at(31,20),1,[3,4],3);
  verifyPair('prime_sum',at(30,10),at(31,20),1,[3,4],3);
  verifyPair('reverse_whisper',at(30,10),at(31,20),2,[3,8],8);
});
test('antiking, antiknight, anti-XV and lava work from explicit pair scopes',()=>{
  verifyPair('anti_king',at(30,10),at(31,11),4,[4,7],4);
  verifyPair('anti_knight',at(30,10),at(32,11),4,[4,7],4);
  verifyPair('anti_xv',at(30,10),at(30,11),1,[4,6],4);
  verifyPair('lava',at(30,10),at(30,11),3,[4,6],4);
});
test('shadow cells and greater-than-neighbor clues follow declared direction',()=>{
  const from=at(30,10),to=at(31,20);
  const {puzzle,progress}=game([
    {type:'shadow_lower',cells:[to,from]}],{[from]:5},{[to]:[3,8]});
  const h=nextAdventureHint(puzzle,progress,4,to);
  assert.equal(h.step?.method,'shadow_lower');
  assert.ok(h.step.removed.includes(8));
  const bigger=game([{type:'greater_neighbors',cells:[to,from]}],
    {[from]:5},{[to]:[3,8]});
  const v=nextAdventureHint(bigger.puzzle,bigger.progress,4,to);
  assert.equal(v.step?.method,'greater_neighbors');
  assert.ok(v.step.removed.includes(3));
});
test('zipline pairs each end about its actual middle cell',()=>{
  const a=at(21,1),center=at(21,0),b=at(21,2);
  const sector={top:21,left:0,width:6,height:6,title:'6×6 数独',
    rules:'数独：每行每列及 2×3 宫填入 1 至 6。'};
  const {puzzle,progress}=game([{type:'zipline',cells:[a,center,b]}],
    {[a]:1,[center]:5},{[b]:[3,4]},[sector]);
  const h=nextAdventureHint(puzzle,progress,4,b);
  assert.equal(h.step?.method,'zipline');
  assert.ok(h.step.removed.includes(3));
  assert.ok(h.step.sources.includes(center));
});
test('magic squares have a real 1–9 domain outside any square Sudoku sector',()=>{
  const cells=Array.from({length:9},(_,i)=>at(30+Math.floor(i/3),20+i%3));
  const fill={[cells[4]]:5},notes={[cells[0]]:[5,8]};
  const {puzzle,progress}=game([{type:'magic_square',cells}],fill,notes);
  const h=nextAdventureHint(puzzle,progress,4,cells[0]);
  assert.equal(h.step?.method,'magic_square');
  assert.ok(h.step.removed.includes(5));
  assert.ok(h.step.sources.includes(cells[4]));
});
test('crystal cage row and column sums work for non-Sudoku walls',()=>{
  const cells=[at(30,10),at(30,11),at(31,10),at(31,11)];
  const {puzzle,progress}=game([{
    type:'crystal_cage',cells,sum:7,
    groups:[[cells[0],cells[1]],[cells[2],cells[3]],
      [cells[0],cells[2]],[cells[1],cells[3]]]
  }],{[cells[0]]:3},{[cells[1]]:[2,4,5]});
  const h=nextAdventureHint(puzzle,progress,4,cells[1]);
  assert.equal(h.step?.method,'crystal_cage');
  assert.ok(h.step.removed.includes(2));
  assert.ok(h.step.removed.includes(5));
  assert.equal(h.step.forceElimination,true);
});
test('an unrevealed rule panel or a fogged peer never supplies evidence',()=>{
  const a=at(30,10),b=at(31,20),u=at(2,38);
  const {puzzle,progress}=game([{type:'palindrome',cells:[a,b],unlockCells:[u]}],
    {[a]:4},{[b]:[4,7]});
  progress.visible[u]=false;
  assert.notEqual(nextAdventureHint(puzzle,progress,4,b).status,'step');
  progress.visible[u]=true;
  assert.equal(nextAdventureHint(puzzle,progress,4,b).status,'step');
  progress.visible[a]=false;
  assert.notEqual(nextAdventureHint(puzzle,progress,4,b).status,'step');
});
test('typed region with hidden unrelated cells allows only visible peer deductions',()=>{
  const scope=Array.from({length:81},(_,i)=>at(20+Math.floor(i/9),20+i%9));
  const a=at(20,20),b=at(22,21);
  const {puzzle,progress}=game([{type:'anti_knight',cells:scope}],
    {[a]:6},{[b]:[6,8]});
  for(const i of scope)if(i!==a&&i!==b)progress.visible[i]=false;
  const h=nextAdventureHint(puzzle,progress,4,b);
  assert.equal(h.step?.method,'anti_knight');
  assert.equal(h.step.cell,b);
  assert.ok(h.step.sources.every(i=>progress.visible[i]===true));
  assert.equal(typedConstraints(puzzle,progress).length,1);
});
