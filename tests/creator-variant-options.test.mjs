import test from 'node:test';
import assert from 'node:assert/strict';
import {availableVariants, availableTechniques, validateCreatorOptions}
  from '../src/creator/options.js';

const added=[
  'parity','inequality','clone','thermo_unknown',
  'little_killer','anti_knight_anchors','anti_whisper_anchors'
];

test('recent solver variants are selectable only on valid board sizes',()=>{
  const four=new Set(availableVariants(4).map(([kind])=>kind));
  const six=new Set(availableVariants(6).map(([kind])=>kind));
  const nine=new Set(availableVariants(9).map(([kind])=>kind));
  for(const kind of added)assert.ok(nine.has(kind),kind);
  for(const kind of ['parity','inequality','clone','thermo_unknown']){
    assert.ok(four.has(kind),kind);
    assert.ok(six.has(kind),kind);
  }
  assert.ok(!four.has('little_killer'));
  assert.ok(!four.has('anti_knight_anchors'));
  assert.ok(!six.has('anti_whisper_anchors'));
});

test('technique focus requires the matching printed constraint',()=>{
  const focus=new Set(availableTechniques(9,1,added).map(([name])=>name));
  for(const kind of added)assert.ok(focus.has(kind),kind);
  const without=new Set(availableTechniques(9,1,[]).map(([name])=>name));
  for(const kind of added)assert.ok(!without.has(kind),kind);
  assert.deepEqual(validateCreatorOptions({
    size:9,tier:1,variants:['parity','clone'],focus:'parity',
    density:'medium',attempts:10
  }).variants,['parity','clone']);
  assert.throws(()=>validateCreatorOptions({
    size:6,tier:1,variants:['anti_whisper_anchors'],focus:null,
    density:'medium',attempts:10
  }),/不支持|无效/);
});
