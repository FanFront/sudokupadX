import test from 'node:test';
import assert from 'node:assert/strict';
import {editableCellIndices} from '../src/fog-editing.js';

const puzzle={cells:[{given:'9'},{given:null},{given:'4'},{given:null}]};

test('visible givens are included in dragged corner and center candidate selections',()=>{
  const progress={visible:[false,true,true,false]};
  for(const mode of ['corner','center','color','erase']){
    assert.deepEqual(editableCellIndices(puzzle,progress,[0,1,2,3],mode),
      [0,1,2,3]);
  }
  progress.visible[0]=true;
  assert.deepEqual(editableCellIndices(puzzle,progress,[0,2], 'corner'),[0,2]);
  assert.deepEqual(editableCellIndices(puzzle,progress,[0,2], 'center'),[0,2]);
});

test('big-digit edits never change revealed given digits',()=>{
  const progress={visible:[false,true,true,false]};
  assert.deepEqual(editableCellIndices(puzzle,progress,[0,1,2,3],'value'),[0,1,3]);
  progress.visible[0]=true;
  assert.deepEqual(editableCellIndices(puzzle,progress,[0,2],'value'),[]);
  assert.deepEqual(editableCellIndices(puzzle,progress,[0,2]),[]);
});

test('mixed drag selection remains de-duplicated and rejects out-of-grid cells',()=>{
  const progress={visible:[true,true,true,true]};
  assert.deepEqual(editableCellIndices(puzzle,progress,[-1,0,0,2,3,4,NaN],'center'),[0,2,3]);
  assert.deepEqual(editableCellIndices(puzzle,null,[0,1],'center'),[0,1]);
  assert.deepEqual(editableCellIndices(puzzle,null,[0,1],'value'),[1]);
  assert.deepEqual(editableCellIndices(null,progress,[0],'corner'),[]);
});
