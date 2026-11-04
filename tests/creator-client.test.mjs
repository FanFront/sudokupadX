import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableVariants,availableTechniques,validateCreatorOptions
} from '../src/creator/options.js';
import {createdCatalogEntries} from '../src/creator/storage.js';

test('4x4/6x6 disable unsupported variants and level >=3',()=>{
  assert.ok(availableVariants(4).every(([, ,sizes])=>sizes.includes(4)));
  assert.ok(!availableVariants(4).some(([kind])=>kind==='whisper'));
  assert.ok(availableVariants(9).some(([kind])=>kind==='whisper'));
  assert.throws(()=>validateCreatorOptions({
    size:6,tier:5,variants:['kropki'],focus:'',density:'light',attempts:3
  }),/仅支持 9×9/);
});

test('level 5 must not falsely claim focus methods or logic completeness',()=>{
  const request=validateCreatorOptions({
    size:9,tier:5,variants:[],focus:'',density:'light',attempts:8
  });
  assert.equal(request.focus,null);
  assert.deepEqual(request.variants,[]);
  assert.equal(availableTechniques(9,5,[]).length,1);
  assert.throws(()=>validateCreatorOptions({
    size:9,tier:5,variants:[],focus:'x_wing',density:'light',attempts:8
  }),/重点技巧/);
});

test('focus technique is available only within selected families and tier',()=>{
  assert.ok(availableTechniques(9,3,['killer'])
    .some(([name])=>name==='killer_sum'));
  assert.ok(!availableTechniques(9,3,[]).some(([name])=>name==='killer_sum'));
  assert.ok(!availableTechniques(9,2,['killer']).some(([name])=>name==='x_wing'));
  assert.throws(()=>validateCreatorOptions({
    size:9,tier:2,variants:['killer'],focus:'xy_wing',density:'medium',attempts:4
  }),/重点技巧/);
});

test('created records appear as local entries with preservation flags',()=>{
  const rows=createdCatalogEntries([
    {id:'personal-abcdefgh',puzzle:{metadata:{title:'自定义高级题'}},
      details:{tier:5,givens:18},starred:true,done:false},
    {id:'personal-zzyyxxvv',puzzle:{metadata:{title:'下次继续'}},
      details:{tier:2,givens:10},starred:false,done:true}
  ]);
  assert.deepEqual(rows.map(x=>x.group),['personal-created','personal-created']);
  assert.match(rows[0].title,/★/);
  assert.equal(rows[0].tier,5);
  assert.equal(rows[1].done,true);
});
