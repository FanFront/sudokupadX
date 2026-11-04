import test from 'node:test';
import assert from 'node:assert/strict';
import {describeHint,cellName} from '../src/hints/format.js';

test('hidden single describes its target and source cells',()=>{
  const hint=describeHint({status:'step',level:1,step:{
    method:'hidden_single',cell:4,removed:[1,2],remaining:[3],before:[1,2,3],
    sources:[0,1,2,3,4,5,6,7,8]}},9);
  assert.match(hint.title,/隐性唯一数/);
  assert.match(hint.description,/确定填入 3/);
  assert.deepEqual(hint.sources,[0,1,2,3,5,6,7,8]);
  assert.equal(hint.target,4);
  assert.equal(hint.placement,true);
  assert.equal(cellName(80,9),'R9C9');
});
test('candidate elimination is not incorrectly described as placement',()=>{
  const hint=describeHint({status:'step',level:3,step:{
    method:'x_wing',cell:60,removed:[9],remaining:[2,5],
    before:[2,5,9],sources:[4,13,31,40]}},9);
  assert.equal(hint.placement,false);
  assert.match(hint.description,/排除候选数 9/);
});
test('level-5 contradiction says it is not pure human logic',()=>{
  const hint=describeHint({status:'step',level:5,step:{
    method:'search_contradiction',cell:30,removed:[5],
    remaining:[3,7],before:[3,5,7],sources:[30]}},9);
  assert.match(hint.description,/不是前四级纯逻辑技巧/);
  assert.equal(hint.placement,false);
});
test('no proof means no fabricated highlights',()=>{
  for(const status of ['complete','stalled','search_limit','not_unique']){
    const hint=describeHint({status,level:5,step:null},9);
    assert.equal(hint.target,-1);
    assert.deepEqual(hint.sources,[]);
  }
});


test('2/7 center notes remove redundant 1..9 display and target only marked digits',()=>{
  const cells=Array.from({length:81},()=>({center:[],corner:[]}));
  cells[0]={center:['2','7'],corner:[]};
  const result=describeHint({status:'step',level:1,step:{
    method:'peer_elimination',cell:0,removed:[1,7],remaining:[2,3,4,5,6,8,9],
    before:[1,2,3,4,5,6,7,8,9],sources:[1]}},9,cells);
  assert.match(result.candidates,/已标候选：2、7/);
  assert.match(result.candidates,/本步可删：7/);
  assert.match(result.candidates,/手记剩余：2/);
  assert.doesNotMatch(result.candidates,/此前候选：1、2、3/);
  assert.deepEqual(result.removed,[7]);
  assert.equal(result.placement,false);
  assert.match(result.candidates,/尚未证明唯一/);
});
test('corner note fallback and note exhaustion remain explicit',()=>{
  const cells=Array.from({length:16},()=>({center:[],corner:[]}));
  cells[4]={center:[],corner:['3']};
  const result=describeHint({status:'step',level:1,step:{
    method:'peer_elimination',cell:4,removed:[3],remaining:[1,2,4],
    before:[1,2,3,4],sources:[0]}},4,cells);
  assert.deepEqual(result.removed,[3]);
  assert.match(result.candidates,/请检查是否漏标/);
});
test('no new marked candidate returns a neutral explanation without highlights',()=>{
  const hint=describeHint({status:'notes_current',step:null,level:1},9);
  assert.equal(hint.target,-1);
  assert.match(hint.description,/标记的候选数没有新排除项/);
});
