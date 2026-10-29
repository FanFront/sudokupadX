import test from 'node:test';
import assert from 'node:assert/strict';
import {buildConflictHouses,detectConflicts} from '../src/conflicts.js';

function game(rows=9,cols=9) {
  const puzzle={rows,cols,cells:Array.from({length:rows*cols},()=>({given:null})),regions:[],sectors:[]};
  const progress={cells:Array.from({length:rows*cols},()=>({value:null,corner:[],center:[]})),
    visible:Array(rows*cols).fill(true)};
  return {puzzle,progress};
}

test('duplicate placed values turn red in rows, columns, and imported regions',()=>{
  const {puzzle,progress}=game();
  progress.cells[0].value='5';
  puzzle.cells[1].given='5';
  progress.cells[9].value='6';
  progress.cells[18].value='6';
  progress.cells[30].value='7';
  progress.cells[40].value='7';
  puzzle.regions=[[[3,3],[4,4]]];
  const {valueCells}=detectConflicts(puzzle,progress);
  for(const index of [0,1,9,18,30,40])assert.equal(valueCells.has(index),true,index+' highlighted');
  assert.equal(valueCells.has(2),false);
});

test('corner and center candidates conflict with placed peers, not with other notes',()=>{
  const {puzzle,progress}=game();
  puzzle.cells[0].given='8';
  progress.cells[1].corner=['8','1'];
  progress.cells[2].center=['8','2'];
  progress.cells[3].corner=['1'];
  progress.cells[4].center=['1'];
  const {valueCells,noteSymbols}=detectConflicts(puzzle,progress);
  assert.equal(valueCells.size,0);
  assert.deepEqual([...noteSymbols[1]],['8']);
  assert.deepEqual([...noteSymbols[2]],['8']);
  assert.equal(noteSymbols[3].has('1'),false);
  assert.equal(noteSymbols[4].has('1'),false);
});

test('a value in the same cell does not flag its hidden notes',()=>{
  const {puzzle,progress}=game();
  progress.cells[0]={value:'4',corner:['4'],center:['4']};
  const {valueCells,noteSymbols}=detectConflicts(puzzle,progress);
  assert.equal(valueCells.size,0);
  assert.equal(noteSymbols[0].size,0);
});

test('large adventure maps check local Sudoku grids but not distant cells in a shared global row',()=>{
  const {puzzle,progress}=game(40,50);
  puzzle.sectors=[
    {left:0,top:0,width:9,height:9},
    {left:20,top:0,width:9,height:9},
    {left:0,top:12,width:18,height:10}, // storytelling sector, not a Sudoku grid
  ];
  progress.cells[0].value='9';
  progress.cells[20].value='9';
  const houses=buildConflictHouses(puzzle);
  assert.equal(detectConflicts(puzzle,progress,houses).valueCells.size,0);
  progress.cells[1].value='9';
  const {valueCells}=detectConflicts(puzzle,progress,houses);
  assert.equal(valueCells.has(0),true);
  assert.equal(valueCells.has(1),true);
  assert.equal(valueCells.has(20),false);
});

test('imported regions remain conflict houses even on an adventure map',()=>{
  const {puzzle,progress}=game(40,50);
  puzzle.regions=[[[0,0],[25,40]]];
  progress.cells[0].value='A';
  progress.cells[25*50+40].value='A';
  const {valueCells}=detectConflicts(puzzle,progress);
  assert.equal(valueCells.size,2);
});

test('hidden fog clues do not reveal themselves through conflict colors',()=>{
  const {puzzle,progress}=game();
  puzzle.cells[0].given='3';
  progress.cells[1].corner=['3'];
  progress.visible[0]=false;
  assert.equal(detectConflicts(puzzle,progress).noteSymbols[1].has('3'),false);
  progress.visible[0]=true;
  assert.equal(detectConflicts(puzzle,progress).noteSymbols[1].has('3'),true);
});
