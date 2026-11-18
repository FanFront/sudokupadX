import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSON_FIXTURES,TECHNIQUE_FIXTURES} from '../src/lesson-fixtures.js';
import {SUDOPEDIA_TECHNIQUES} from '../src/sudopedia-catalog.js';
import {lessonPracticeMode,availableLessonPracticeIds,createLessonPractice}
  from '../src/lesson-puzzles.js';
import {legalGivenCandidates} from '../src/lesson-candidates.js';

test('all 25 original chapters and Sudopedia catalog offer practice',()=>{
  assert.equal(Object.keys(LESSON_FIXTURES).length,25);
  assert.ok(TECHNIQUE_FIXTURES.naked_single);
  const all=[...Array.from({length:25},(_,i)=>i+1),
             ...SUDOPEDIA_TECHNIQUES.map(item=>item.id)];
  assert.deepEqual(availableLessonPracticeIds(),all);
  for(const id of all)
    assert.notEqual(lessonPracticeMode(id),'unavailable',String(id));
});

test('every random lesson starts from legal row/column/box notes',()=>{
  const all=[...Array.from({length:25},(_,i)=>i+1),
             ...SUDOPEDIA_TECHNIQUES.map(item=>item.id)];
  for(const id of all){
    const item=createLessonPractice(id,{randomize:true,random:()=>.37,
      allowReview:true});
    assert.ok(item.practiceKind==='targeted'||item.practiceKind==='review');
    const legal=legalGivenCandidates(item.puzzle);
    const given=item.puzzle.cells.flat();
    const isPeer=item.proof.method==='peer_elimination' &&
      item.goal.kind==='remove';
    for(let i=0;i<item.n*item.n;i++){
      if(given[i].value){
        assert.deepEqual(item.seed[i].center,[],
          'given cell must not display center marks');
      }else{
        for(const digit of item.seed[i].center){
          const exception=isPeer && i===item.goal.index &&
            digit===item.goal.digit;
          assert.ok(legal[i].includes(Number(digit))||exception,
            'invalid candidate at lesson '+id+', cell '+i+': '+digit);
        }
      }
    }
    if(item.practiceKind==='review'){
      assert.equal(item.proof.method,'naked_single');
      assert.ok(!item.puzzle.cages?.length);
      assert.ok(!item.puzzle.lines?.length);
      assert.ok(!item.puzzle.arrows?.length);
      assert.match(item.task,/不是.*专项练习/);
    }else{
      assert.ok(LESSON_FIXTURES[id] ||
        SUDOPEDIA_TECHNIQUES.some(t=>t.id===id&&t.method===item.proof.method));
    }
  }
});

test('well-known classical technique lessons prefer variant-free examples',()=>{
  for(const id of [1,2,4,8,10,11,12]){
    const exercise=createLessonPractice(id,{randomize:false});
    assert.equal(exercise.practiceKind,'targeted',String(id));
    assert.equal(exercise.puzzle.cages?.length||0,0,String(id));
    assert.equal(exercise.puzzle.lines?.length||0,0,String(id));
    assert.equal(exercise.puzzle.arrows?.length||0,0,String(id));
  }
});
