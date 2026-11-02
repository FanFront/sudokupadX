import test from 'node:test';
import assert from 'node:assert/strict';
import {editableCellIndices} from '../src/fog-editing.js';

const puzzle={cells:[{given:'9'},{given:null},{given:'4'},{given:null}]};

test('fogged clue accepts candidate and big-digit edits, but revealed clue stays fixed',()=>{
  const progress={visible:[false,true,true,false]};
  assert.deepEqual(editableCellIndices(puzzle,progress,[0,1,2,3]),[0,1,3]);
  progress.visible[0]=true;
  assert.deepEqual(editableCellIndices(puzzle,progress,[0,2]),[]);
});

test('selection de-duplicates, rejects invalid cells, and leaves visible givens unchanged',()=>{
  const progress={visible:[false,true,true,false]};
  assert.deepEqual(editableCellIndices(puzzle,progress,[-1,0,0,3,4,NaN]),[0,3]);
  assert.deepEqual(editableCellIndices(puzzle,null,[0,1]),[1]);
  assert.deepEqual(editableCellIndices(null,progress,[0]),[]);
});
