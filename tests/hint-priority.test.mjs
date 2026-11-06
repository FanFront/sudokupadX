import test from 'node:test';
import assert from 'node:assert/strict';
import {hintImpact} from '../src/hints/priority.js';
import {nextAdventureHint} from '../src/hints/adventure.js';
import {describeHint} from '../src/hints/format.js';
import {preferPencilSubset} from '../src/hints/pencil-subsets.js';

const cols=50;
const cell=(r,c)=>r*cols+c;
function setup(){
  const rows=40,total=rows*cols;
  return {
    puzzle:{rows,cols,cells:Array.from({length:total},()=>({given:null})),
      sectors:[{top:21,left:0,width:6,height:6,
        title:'6×6 数独',rules:'数独——每行、每列与每个 2×3 宫填入 1 至 6。'}],
      regions:[],cages:[],overlays:[],underlays:[],arrows:[],lines:[],
      hintRules:[],hintConstraints:[]},
    progress:{cells:Array.from({length:total},()=>({value:null,center:[],corner:[]})),
      visible:Array(total).fill(false)}
  };
}
function given(state,r,c,d){
  const i=cell(r,c);
  state.puzzle.cells[i].given=String(d);
  state.progress.visible[i]=true;
}
function show(state,r,c,notes=[]){
  const i=cell(r,c);
  state.progress.visible[i]=true;
  state.progress.cells[i].center=notes.map(String);
  return i;
}

test('suggestion classes distinguish proved placements, multi-removal and single-removal',()=>{
  assert.equal(hintImpact({
    method:'hidden_single',before:[2,3,4],remaining:[3],removed:[2,4]
  }).rank,3);
  assert.equal(hintImpact({
    method:'peer_elimination',before:[1,2,3,4],remaining:[3,4],removed:[1,2]
  }).rank,2);
  assert.equal(hintImpact({
    method:'peer_elimination',before:[1,2,3],remaining:[2,3],removed:[1]
  }).rank,1);
  assert.equal(hintImpact({
    method:'peer_elimination',before:[1,2,3,4],remaining:[4],removed:[1,2,3],
    forceElimination:true
  }).rank,2,'a forced-elimination step is not a certified placement');
  assert.equal(hintImpact({
    method:'peer_elimination',before:[1,2,3,4],remaining:[4],removed:[1,2,3],
    forceElimination:true
  },[3,4]).rank,1,'only written candidates count as actionable');
});

test('an adventure placement wins even when a multi-removal is focused',()=>{
  const state=setup();
  for(let c=0;c<5;c++)given(state,21,c,c+1);
  const placement=show(state,21,5);
  const focused=show(state,22,0,[1,2,3,4,5,6]);
  const result=nextAdventureHint(state.puzzle,state.progress,4,focused);
  assert.equal(result.status,'step');
  assert.equal(result.step.cell,placement);
  const formatted=describeHint(result,cols,state.progress.cells);
  assert.equal(formatted.suggestionRank,3);
  assert.equal(formatted.placement,true);
  assert.match(formatted.title,/建议 A · 确定数字/);
});

test('a multi-removal wins over a focused one-digit elimination',()=>{
  const state=setup();
  given(state,21,0,1);
  given(state,21,1,2);
  given(state,21,3,3);
  const batch=show(state,21,2);
  const focused=show(state,22,3,[3,4,5,6]);
  const result=nextAdventureHint(state.puzzle,state.progress,4,focused);
  assert.equal(result.status,'step');
  assert.equal(result.step.cell,batch);
  assert.ok(result.step.removed.length>=2);
  assert.equal(describeHint(result,cols,state.progress.cells).suggestionRank,2);
});

test('visible known numbers are grouped into one peer-elimination explanation',()=>{
  const state=setup();
  given(state,21,0,1);
  given(state,21,1,2);
  const target=show(state,21,2,[1,2,3,4]);
  const result=nextAdventureHint(state.puzzle,state.progress,1,target);
  assert.equal(result.step.cell,target);
  assert.equal(result.step.method,'peer_elimination');
  assert.deepEqual(result.step.removed,[1,2]);
  assert.equal(describeHint(result,cols,state.progress.cells).suggestionRank,2);
});

test('an assumption-based pencil subset never displaces a verified placement',()=>{
  const base={status:'step',level:1,step:{
    method:'hidden_single',cell:2,before:[1,2],remaining:[2],removed:[1]}};
  const pencil={status:'step',level:2,step:{
    method:'pencil_subset',cell:3,before:[1,2,3],remaining:[3],
    removed:[1,2],forceElimination:true,assumptionBased:true,sources:[2]}};
  assert.equal(preferPencilSubset(base,pencil,3),base);
  pencil.step.assumptionBased=false;
  assert.equal(preferPencilSubset(base,pencil,3),base);
});
