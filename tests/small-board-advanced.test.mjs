import test from 'node:test';
import assert from 'node:assert/strict';
import {availableTechniques,validateCreatorOptions} from '../src/creator/options.js';
import {readFileSync} from 'node:fs';

const options=(size,tier,focus='')=>({
  size,tier,focus,variants:[],density:'light',attempts:4
});

test('4x4 and 6x6 accept high-tier technique requests and exact-search tier',()=>{
  for(const size of [4,6]){
    for(const tier of [3,4,5]){
      const request=validateCreatorOptions(options(size,tier));
      assert.equal(request.size,size);
      assert.equal(request.tier,tier);
    }
    assert.equal(validateCreatorOptions(options(size,3,'x_wing')).focus,'x_wing');
    assert.equal(validateCreatorOptions(options(size,3,'xy_wing')).focus,'xy_wing');
    assert.equal(validateCreatorOptions(options(size,4,'xyz_wing')).focus,'xyz_wing');
    assert.equal(validateCreatorOptions(options(size,4,'xy_chain')).focus,'xy_chain');
  }
});

test('do not advertise a size-4 fish on a 4x4 board with no possible elimination',()=>{
  assert.equal(availableTechniques(4,4,[]).some(([name])=>name==='jellyfish'),false);
  assert.equal(availableTechniques(6,4,[]).some(([name])=>name==='jellyfish'),true);
  assert.equal(availableTechniques(9,4,[]).some(([name])=>name==='jellyfish'),true);
  assert.equal(availableTechniques(6,5,[]).some(([name])=>name==='xy_wing'),false);
  assert.throws(()=>validateCreatorOptions(options(4,4,'jellyfish')),/重点技巧/);
});

test('small board UI no longer silently forces difficulty level two',()=>{
  const creator=readFileSync(new URL('../src/creator/ui.js',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.doesNotMatch(creator,/size!==9&&Number\(\$\('creatorTier'\)\.value\)>=3/);
  assert.doesNotMatch(creator,/option\.disabled=Number\(\$\('creatorSize'\)\.value\)!==9/);
  assert.doesNotMatch(main,/small&&Number\(\$\('hintTier'\)\.value\)>2/);
});


test('size-generalized imported tactics are selectable at their real tiers',()=>{
  for(const size of [4,6,9]){
    const entries=availableTechniques(size,4,[]).map(([name])=>name);
    assert.ok(entries.includes('two_string_kite'),String(size));
    assert.ok(entries.includes('w_wing'),String(size));
    assert.ok(entries.includes('simple_coloring'),String(size));
    assert.equal(validateCreatorOptions(options(size,3,'two_string_kite')).focus,'two_string_kite');
    assert.equal(validateCreatorOptions(options(size,4,'w_wing')).focus,'w_wing');
    assert.equal(validateCreatorOptions(options(size,4,'simple_coloring')).focus,'simple_coloring');
    assert.throws(()=>validateCreatorOptions(options(size,3,'w_wing')),/重点技巧/);
  }
});
