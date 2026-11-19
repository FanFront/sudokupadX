import test from 'node:test';
import assert from 'node:assert/strict';
import {hintImpact} from '../src/hints/priority.js';
import {describeHint} from '../src/hints/format.js';
import {buildHintPlusUpdates} from '../src/hints/apply.js';

test('core naked single is a placement even when candidate mask already has one digit',()=>{
  const puzzle={cells:Array.from({length:81},()=>({given:null}))};
  const cells=Array.from({length:81},()=>({value:null,center:[],corner:[]}));
  const progress={cells,visible:Array(81).fill(true)};
  const response={status:'step',level:1,step:{
    source:'sudoku-core',method:'naked_single',cell:0,
    before:[4],remaining:[4],removed:[],placement:true,sources:[1,2]
  }};
  assert.equal(hintImpact(response.step,[]).rank,3);
  assert.equal(describeHint(response,9,cells).placement,true);
  assert.deepEqual(buildHintPlusUpdates(puzzle,progress,response),[{
    index:0,corner:[],center:[],value:'4'
  }]);
});

test('core candidate elimination cannot force a fill from the remaining singleton',()=>{
  const puzzle={cells:Array.from({length:81},()=>({given:null}))};
  const cells=Array.from({length:81},()=>({value:null,center:['1','2'],corner:[]}));
  const response={status:'step',level:4,step:{
    source:'sudoku-core',method:'w_wing',cell:0,
    before:[1,2],remaining:[2],removed:[1],forceElimination:true,sources:[4,5]
  }};
  assert.equal(describeHint(response,9,cells).placement,false);
  const updates=buildHintPlusUpdates(puzzle,{cells,visible:Array(81).fill(true)},response);
  // An explicit single handwritten candidate may be promoted by Hint+;
  // the deduction itself must remain classified as elimination.
  assert.equal(hintImpact(response.step,[]).rank,1);
  assert.equal(updates[0].value,'2');
});
