import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAIN_COACH_TOPICS,CHAIN_COACH_TOTAL,coachExample,
  validateCoachExample,applyPracticeMove,topicFromLesson} from '../src/chain-coach/model.js';
import {normalizeCandidateProof,proofLinks} from '../src/hints/proof-view.js';

test('sudokuCoach-derived lessons retain their verified candidate-link witnesses',()=>{
  assert.equal(CHAIN_COACH_TOPICS.length,5);
  assert.equal(CHAIN_COACH_TOTAL,20);
  for(const topic of CHAIN_COACH_TOPICS)for(let i=0;i<4;i++){
    const example=coachExample(topic.id,i);
    assert.ok(example);
    assert.ok(validateCoachExample(example),topic.id+' #'+i);
    const proof=normalizeCandidateProof(example.proof,9);
    assert.equal(proof.kind,topic.group);
    assert.ok(proofLinks(proof).length>0);
  }
});

test('practice accepts only the actual per-step target candidate',()=>{
  const ex=coachExample('xy-chain',0);
  const correct=ex.updates[0];
  const key=correct.index+':'+correct.digit;
  const done=new Set();
  assert.equal(applyPracticeMove(ex,done,correct.index,correct.digit).accepted,true);
  assert.equal(applyPracticeMove(ex,done,correct.index,9===correct.digit?8:9).accepted,false);
  done.add(key);
  assert.equal(applyPracticeMove(ex,done,correct.index,correct.digit).accepted,false);
});

test('lesson titles route to the correct chain or colouring demonstration',()=>{
  assert.equal(topicFromLesson('立体染色'), '3d-medusa');
  assert.equal(topicFromLesson('XY-Chain 双值链'), 'xy-chain');
  assert.equal(topicFromLesson('X-Chain 单数链'), 'x-chain');
  assert.equal(topicFromLesson('AIC 交替推理链'), 'aic');
  assert.equal(topicFromLesson('双色染色'), 'simple-colouring');
});
