import test from 'node:test';
import assert from 'node:assert/strict';
import {typedConstraints} from '../src/hints/constraint-data.js';
import {nextAdventureHint} from '../src/hints/adventure.js';
import {describeHint} from '../src/hints/format.js';

const at=(r,c)=>r*9+c;
const all=Array.from({length:81},(_,i)=>i);
const row=Array.from({length:9},(_,i)=>i);
function game(rules,known={},notes={},classic=true){
  const puzzle={rows:9,cols:9,rules:'',
    hintConstraints:[...(classic?[{type:'classic_sudoku',cells:all}]:[]),...rules],
    cells:Array.from({length:81},()=>({given:null})),
    sectors:[],regions:[],cages:[],lines:[],arrows:[]};
  const progress={visible:Array(81).fill(true),
    cells:Array.from({length:81},()=>({value:null,center:[],corner:[]}))};
  for(const [i,d] of Object.entries(known))progress.cells[i].value=String(d);
  for(const [i,ds] of Object.entries(notes))
    progress.cells[i].center=ds.map(String);
  return {puzzle,progress};
}
function prove(type,rules,known,notes,target,removed){
  const {puzzle,progress}=game(rules,known,notes);
  const result=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(result.status,'step',type+' produced a step');
  assert.equal(result.step.method,type,type+' method');
  assert.equal(result.step.cell,target,type+' target');
  assert.ok(result.step.removed.includes(removed),type+' removed '+removed);
  assert.match(describeHint(result,9,progress.cells).title,/等级/);
  return result;
}
test('odd/even markers filter correct parity without treating notes as axioms',()=>{
  prove('odd',[{type:'odd',cells:[at(0,0)]}],{},
    {[at(0,0)]:[2,3]},at(0,0),2);
  prove('even',[{type:'even',cells:[at(0,0)]}],{},
    {[at(0,0)]:[2,3]},at(0,0),3);
});
test('directional inequalities can eliminate a wrong handwritten candidate',()=>{
  prove('inequality',[{type:'inequality',cells:[at(0,0),at(0,1)]}],
    {[at(0,0)]:6},{[at(0,1)]:[3,7]},at(0,1),3);
});
test('clone semantics bind equal positions, not just a shared set of digits',()=>{
  const a=at(0,0),b=at(0,1),c=at(4,3),d=at(4,4);
  const rule={type:'clone',cells:[a,b,c,d],groups:[[a,b],[c,d]]};
  const response=prove('clone',[rule],{[a]:3},{[c]:[3,4]},c,4);
  assert.ok(response.step.sources.includes(a));
});
test('row/column index digits propagate the exact inverse position',()=>{
  const witness=at(1,1),target=at(1,6);
  const response=prove('indexing_rows',[{type:'indexing_rows',cells:all}],
    {[witness]:7},{[target]:[1,2]},target,1);
  assert.ok(response.step.sources.includes(witness));
});
test('long little killers are solved by exact dynamic programming',()=>{
  const diag=[at(0,0),at(1,1),at(2,2),at(3,3),at(4,4),at(5,5),at(6,6)];
  const response=prove('little_killer',[{type:'little_killer',cells:diag,sum:28}],
    Object.fromEntries(diag.slice(0,6).map((i,j)=>[i,j+1])),
    {[diag[6]]:[7,8]},diag[6],8);
  assert.equal(response.step.remaining.length,1);
});
test('X-sums exclude a first-cell length that cannot reach the outside sum',()=>{
  const response=prove('x_sums',[{type:'x_sums',cells:row,sum:6}],{},
    {[row[0]]:[3,4]},row[0],4);
  assert.ok(response.step.remaining.includes(3));
});
test('sandwich endpoints establish the exact sum interval',()=>{
  const response=prove('sandwich',[{type:'sandwich',cells:row,sum:15}],
    {[row[0]]:1,[row[1]]:3,[row[2]]:4,[row[4]]:9},
    {[row[3]]:[6,8]},row[3],6);
  assert.ok(response.step.remaining.includes(8));
});
test('one visible skyscraper forces the near-edge cell to be 9',()=>{
  const response=prove('skyscraper',[{type:'skyscraper',cells:row,count:1}],{},
    {[row[0]]:[8,9]},row[0],8);
  assert.ok(response.step.remaining.includes(9));
});
test('missing thermometer bulb allows either full monotonic direction, never a kink',()=>{
  const line=row.slice(0,8),target=line[3];
  const response=prove('ambiguous_thermo',
    [{type:'ambiguous_thermo',cells:line}],{},
    {[target]:[2,4,8]},target,2);
  assert.ok(response.step.removed.includes(8));
  assert.ok(response.step.remaining.includes(4));
});
test('fogged source cannot establish clone, inequality or X-sums evidence',()=>{
  const a=at(0,0),b=at(4,4);
  const {puzzle,progress}=game([{type:'clone',cells:[a,b],
    groups:[[a],[b]]}],{[a]:3},{[b]:[3,4]});
  progress.visible[a]=false;
  assert.notEqual(nextAdventureHint(puzzle,progress,4,b).step?.method,'clone');
});
test('long six-cell Renban uses whole-line matching, not guessing',()=>{
  const cells=row.slice(0,6);
  const known=Object.fromEntries(cells.slice(0,5).map((i,j)=>[i,j+2]));
  const response=prove('renban',[{type:'renban',cells}],known,
    {[cells[5]]:[1,7,9]},cells[5],9);
  assert.ok(response.step.remaining.includes(1));
  assert.ok(response.step.remaining.includes(7));
});
test('a long arrow circle with six shaft cells uses exact sum support',()=>{
  const bulb=at(8,5);
  const shaft=[at(0,3),at(1,6),at(3,0),at(4,4),at(6,1),at(7,7)];
  const known={[bulb]:9};
  for(const i of shaft.slice(0,5))known[i]=1;
  const target=shaft.at(-1);
  const hint=prove('arrow',[{type:'arrow',circle:[bulb],shaft,
    cells:[bulb,...shaft]}],known,{[target]:[4,5]},target,5);
  assert.ok(hint.step.sources.includes(bulb));
});
test('six-cell killer sum eliminates arithmetic impossibilities without brute force',()=>{
  const cage=[at(0,3),at(1,6),at(3,0),at(4,4),at(6,1),at(7,7)];
  const known=Object.fromEntries(cage.slice(0,5).map((i,j)=>[i,j+1]));
  const target=cage.at(-1);
  const hint=prove('killer_sum',[{type:'killer',cells:cage,
    sum:21,unique:true}],known,{[target]:[6,7]},target,7);
  assert.ok(hint.step.remaining.includes(6));
});
test('undeduced jigsaw regions are not leaked from authored solution layouts',()=>{
  const {puzzle,progress}=game([],{[at(0,0)]:1},
    {[at(1,1)]:[1,2]},false);
  puzzle.rules='不规则数独：每行、每列和每个区域填入 1–9。'+
    '区域形状需要自行推导，不能从答案偷看。';
  puzzle.regions=Array.from({length:9},(_,diagonal)=>
    Array.from({length:9},(_,r)=>[r,(r-diagonal+9)%9]));
  const result=nextAdventureHint(puzzle,progress,4,at(1,1));
  assert.notEqual(result.step?.cell,at(1,1),
    'hidden jigsaw region may not act as an all-different witness');
  assert.equal(result.status,'stalled');
});
test('invalid structured clue shapes are discarded, not guessed from visuals',()=>{
  const {puzzle,progress}=game([
    {type:'indexing_rows',cells:row},
    {type:'skyscraper',cells:row,count:10},
    {type:'little_killer',cells:row,sum:8},
    {type:'clone',cells:[0,1],groups:[[0],[1,2]]}
  ],{},{});
  assert.deepEqual(typedConstraints(puzzle,progress).map(r=>r.type),
    ['classic_sudoku']);
});
