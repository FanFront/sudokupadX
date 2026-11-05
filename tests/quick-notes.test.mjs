import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConflictHouses,detectConflicts} from '../src/conflicts.js';
import {buildCenterCandidateUpdates,buildRedNoteRemovalUpdates} from '../src/quick-notes.js';

function board(rows=9,cols=rows) {
  const puzzle={rows,cols,cells:Array.from({length:rows*cols},()=>({given:null})),
    regions:[],sectors:[],cages:[]};
  const progress={cells:Array.from({length:rows*cols},()=>({
    value:null,corner:[],center:[],color:null
  })),visible:Array(rows*cols).fill(true)};
  return {puzzle,progress};
}

test('auto center notes eliminate visible placed values from all unique houses',()=>{
  const {puzzle,progress}=board();
  puzzle.cells[0].given='1';
  progress.cells[10].value='2';   // column 2
  progress.cells[20].value='3';   // custom region
  progress.cells[50].value='4';   // non-repeating killer cage
  puzzle.regions=[[[0,1],[2,2]]];
  puzzle.cages=[{cells:[[0,1],[5,5]],unique:true}];
  progress.cells[1].corner=['7'];
  progress.cells[2].center=['6']; // a player's prior elimination must survive
  const before=structuredClone(progress.cells);
  const updates=buildCenterCandidateUpdates(puzzle,progress);
  assert.deepEqual(updates.find(update=>update.index===1),{
    index:1,corner:['7'],center:['5','6','7','8','9']
  });
  assert.equal(updates.some(update=>update.index===0),false);
  assert.equal(updates.some(update=>update.index===2),false);
  assert.equal(updates.some(update=>update.index===10),false);
  assert.deepEqual(progress.cells,before,'candidate planning is pure');
});

test('fog does not reveal hidden clues, and hidden cells never get auto-filled',()=>{
  const {puzzle,progress}=board();
  puzzle.cells[0].given='7';
  progress.visible[0]=false;
  progress.visible[2]=false;
  progress.cells[3].value='8';
  const updates=buildCenterCandidateUpdates(puzzle,progress);
  assert.equal(updates.find(u=>u.index===1).center.includes('7'),true);
  assert.equal(updates.find(u=>u.index===1).center.includes('8'),false);
  assert.equal(updates.some(u=>u.index===0||u.index===2),false);
});

test('adventure grids do not borrow row exclusions from unrelated sectors',()=>{
  const {puzzle,progress}=board(40,50);
  puzzle.sectors=[
    {left:0,top:0,width:9,height:9},
    {left:20,top:0,width:9,height:9},
    {left:0,top:11,width:18,height:10}
  ];
  progress.cells[0].value='6';
  const updates=buildCenterCandidateUpdates(puzzle,progress);
  assert.equal(updates.find(u=>u.index===1).center.includes('6'),false);
  assert.equal(updates.find(u=>u.index===21).center.includes('6'),true);
  assert.equal(updates.some(u=>u.index===30),false,'story area is not a Sudoku grid');
  assert.equal(updates.some(u=>u.index===11*50),false,'non-square story sector has no digit domain');
});

test('auto center handles 4x4/6x6 but does not guess an unknown digit alphabet',()=>{
  const small=board(4);
  assert.deepEqual(buildCenterCandidateUpdates(small.puzzle,small.progress)[0].center,
    ['1','2','3','4']);
  const six=board(6);
  assert.equal(buildCenterCandidateUpdates(six.puzzle,six.progress)[0].center.length,6);
  const unknown=board(10);
  assert.deepEqual(buildCenterCandidateUpdates(unknown.puzzle,unknown.progress),[]);
  small.puzzle.cells[0].given='A';
  assert.equal(buildCenterCandidateUpdates(small.puzzle,small.progress).some(u=>u.index===1),
    false,'avoid assuming 1–4 when the board uses letters');
});

test('clear red only removes highlighted center/corner marks while preserving other marks',()=>{
  const {puzzle,progress}=board();
  puzzle.cells[0].given='5';
  progress.cells[1]={value:null,center:['1','5','7'],corner:['5','2'],color:'#f8cd75'};
  progress.cells[2].center=['5','9'];
  progress.cells[3].corner=['5'];
  progress.visible[3]=false;
  progress.cells[4].corner=['2'];
  const conflicts=detectConflicts(puzzle,progress,buildConflictHouses(puzzle));
  const before=structuredClone(progress.cells);
  const updates=buildRedNoteRemovalUpdates(progress,conflicts);
  assert.deepEqual(updates.find(u=>u.index===1),{
    index:1,center:['1','7'],corner:['2']
  });
  assert.deepEqual(updates.find(u=>u.index===2).center,['9']);
  assert.equal(updates.some(u=>u.index===3||u.index===4),false);
  assert.deepEqual(progress.cells,before);
  assert.deepEqual(buildRedNoteRemovalUpdates(progress,{noteSymbols:[]}),[]);
});

test('unique killer cages produce red candidates outside row/column houses',()=>{
  const {puzzle,progress}=board(40,50);
  puzzle.cages=[{cells:[[0,1],[11,12]],unique:true}];
  progress.cells[1].value='9';
  progress.cells[11*50+12].center=['9','6'];
  const conflict=detectConflicts(puzzle,progress);
  const update=buildRedNoteRemovalUpdates(progress,conflict);
  assert.deepEqual(update,[{index:11*50+12,corner:[],center:['6']}]);
});
