import test from 'node:test';
import assert from 'node:assert/strict';
import {LESSON_FIXTURES} from '../src/lesson-fixtures.js';
import {createLessonPractice,randomizeClassicLesson} from '../src/lesson-puzzles.js';

test('classic practice relabeling preserves all true digits and proof exclusions',()=>{
  const original=LESSON_FIXTURES[2];
  const fixture=randomizeClassicLesson(original,()=>0.25);
  const solved=fixture.puzzle.metadata.solution;
  assert.equal(solved.length,81);
  assert.notEqual(solved,original.puzzle.metadata.solution);
  for(let i=0;i<81;i++){
    assert.ok(fixture.masks[i].includes(Number(solved[i])));
    const clue=fixture.puzzle.cells[Math.floor(i/9)][i%9].value;
    if(clue)assert.equal(clue,solved[i]);
  }
  assert.ok(!fixture.proof.removed.includes(
    Number(solved[fixture.goal.index])));
  assert.equal(fixture.proof.method,original.proof.method);
  assert.equal(fixture.method,original.method);
  assert.deepEqual(fixture.focus,original.focus);
  assert.deepEqual(fixture.goal.kind,original.goal.kind);
  assert.ok(fixture.proof.remaining.includes(Number(fixture.goal.digit)));
});

test('lesson boards produce valid randomized starting player notes',()=>{
  const practice=createLessonPractice(2,{randomize:true,random:()=>0.3});
  assert.equal(practice.seed.length,81);
  assert.equal(practice.goal.kind,'fill');
  assert.equal(practice.seed[practice.goal.index].center.includes(
    practice.goal.digit),true);
  const solution=practice.puzzle.metadata.solution;
  for(let i=0;i<81;i++){
    const cell=practice.seed[i];
    const given=practice.puzzle.cells[Math.floor(i/9)][i%9].value;
    if(given)assert.equal(given,solution[i]);
    else assert.ok(cell.center.includes(solution[i]));
  }
});

test('variant arithmetic lessons are never relabeled',()=>{
  const fixture=LESSON_FIXTURES[15]; // thermometer
  assert.equal(randomizeClassicLesson(fixture,()=>0.25),fixture);
  assert.deepEqual(createLessonPractice(15,{randomize:true,random:()=>0.2}).proof,
                   createLessonPractice(15).proof);
});
