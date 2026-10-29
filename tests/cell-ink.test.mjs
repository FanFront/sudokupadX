import test from 'node:test';
import assert from 'node:assert/strict';
import {cellInk} from '../src/cell-ink.js';

function fixture() {
  return {
    puzzle:{cells:[{given:'9'},{given:null},{given:null}]},
    progress:{
      visible:[false,false,true],
      cells:[
        {value:null,corner:[],center:[]},
        {value:null,corner:[],center:[]},
        {value:null,corner:[],center:[]}
      ]
    }
  };
}

test('a fogged original given remains invisible while fogged player values show',()=>{
  const {puzzle,progress}=fixture();
  progress.cells[1].value='5';
  assert.deepEqual(cellInk(puzzle,progress,0),
    {fogged:true,given:false,value:null,corner:[],center:[]});
  assert.deepEqual(cellInk(puzzle,progress,1),
    {fogged:true,given:false,value:'5',corner:[],center:[]});
});

test('both corner and center candidates display above fog with no large value',()=>{
  const {puzzle,progress}=fixture();
  progress.cells[1].corner=['1','2'];
  progress.cells[1].center=['3','4'];
  const ink=cellInk(puzzle,progress,1);
  assert.equal(ink.fogged,true);
  assert.equal(ink.value,null);
  assert.deepEqual(ink.corner,['1','2']);
  assert.deepEqual(ink.center,['3','4']);
});

test('placing a big digit suppresses candidate display but clearing or undo restores it',()=>{
  const {puzzle,progress}=fixture();
  progress.cells[1].corner=['3'];
  progress.cells[1].center=['4'];
  const before=structuredClone(progress.cells[1]);
  progress.cells[1].value='7';
  assert.deepEqual(cellInk(puzzle,progress,1),
    {fogged:true,given:false,value:'7',corner:[],center:[]});
  // Simulate undo restoring the previous state.
  progress.cells[1]=before;
  assert.deepEqual(cellInk(puzzle,progress,1).corner,['3']);
  assert.deepEqual(cellInk(puzzle,progress,1).center,['4']);
});

test('fog clearing does not discard saved user values or notes',()=>{
  const {puzzle,progress}=fixture();
  progress.cells[1].center=['6'];
  assert.equal(cellInk(puzzle,progress,1).fogged,true);
  progress.visible[1]=true;
  assert.equal(cellInk(puzzle,progress,1).fogged,false);
  assert.deepEqual(cellInk(puzzle,progress,1).center,['6']);
  progress.visible[0]=true;
  assert.equal(cellInk(puzzle,progress,0).value,'9');
  assert.equal(cellInk(puzzle,progress,0).given,true);
});

test('ordinary puzzles with no explicit fog flags keep rendering normally',()=>{
  const {puzzle,progress}=fixture();
  delete progress.visible;
  progress.cells[2].value='A';
  assert.equal(cellInk(puzzle,progress,2).value,'A');
  assert.equal(cellInk(puzzle,progress,2).fogged,false);
  assert.equal(cellInk(puzzle,progress,0).value,'9');
});
