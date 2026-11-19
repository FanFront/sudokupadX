import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeChainMethod,createNativeChainPractice} from '../src/lesson-native-chain.js';
import {SUDOPEDIA_TECHNIQUES} from '../src/sudopedia-catalog.js';
import {checkLessonMove,lessonPracticeMode} from '../src/lesson-puzzles.js';

const SOLUTION='1234341221434321';
function nativeResponse(){
  const n=4;
  const puzzle={cells:Array.from({length:n},(_,r)=>
    Array.from({length:n},(_,c)=>r===0&&c===0?{value:'1'}:{})),
    regions:[[[0,0],[0,1],[1,0],[1,1]]],
    metadata:{solution:SOLUTION,rules:'standard'}};
  const candidates=[...SOLUTION].map(d=>[Number(d)]);
  for(const i of [1,2,3,4]){
    candidates[i]=[Number(SOLUTION[i]),1].filter((d,j,a)=>a.indexOf(d)===j);
  }
  candidates[5]=[1,4];
  return {puzzle,details:{focus:'x_chain',size:n,trainingStep:{
    method:'x_chain',cell:5,removed:[1],remaining:[4],before:[1,4],
    proof:{kind:'chain',nodes:[1,2,3,4].map(cell=>({cell,digit:1})),
      edges:[{from:0,to:1,strong:true},{from:1,to:2,strong:false},
        {from:2,to:3,strong:true}],candidates}
  }}};
}

test('mapped native chain topics have no duplicate external coaching engine',()=>{
  for(const name of ['x_chain','xy_chain','aic','color_trap','color_wrap','medusa_trap']){
    const lesson=SUDOPEDIA_TECHNIQUES.find(item=>item.method===name);
    assert.ok(lesson,name);
    assert.ok(nativeChainMethod(lesson.id));
    assert.equal(lessonPracticeMode(lesson.id),'generated');
  }
});

test('Rust training step renders through existing game practice input and notes',()=>{
  const lesson=SUDOPEDIA_TECHNIQUES.find(item=>item.method==='x_chain');
  const p=createNativeChainPractice(nativeResponse(),lesson.id,'x_chain');
  assert.equal(p.n,4);
  assert.equal(p.practiceKind,'targeted');
  assert.equal(p.origin,'native-rust');
  assert.equal(p.goal.kind,'remove');
  assert.deepEqual(p.seed[5].center,['1','4']);
  assert.equal(p.visualProof.kind,'chain');
  assert.ok(p.visualProof.edges.some(x=>!x.strong));
  const before=p.seed.map(c=>({...c,center:[...c.center]}));
  const after=p.seed.map(c=>({...c,center:[...c.center]}));
  after[5].center=['4'];
  assert.equal(checkLessonMove(p,before,after,'center','1',[5]),true);
  assert.equal(checkLessonMove(p,before,after,'center','4',[5]),false);
});

test('native chain lesson rejects missing or invalid proof instead of faking practice',()=>{
  const lesson=SUDOPEDIA_TECHNIQUES.find(item=>item.method==='x_chain');
  const good=nativeResponse();
  assert.throws(()=>createNativeChainPractice({...good,details:{
    ...good.details,trainingStep:null}},lesson.id,'x_chain'),/不完整/);
  const bad=nativeResponse();
  bad.details.trainingStep.proof.candidates[5]=[1];
  assert.throws(()=>createNativeChainPractice(bad,lesson.id,'x_chain'),/唯一解不符/);
  assert.throws(()=>createNativeChainPractice(good,lesson.id,'xy_chain'),/确认/);
});
