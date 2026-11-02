import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  cellLargeValue,isHighlightedNumber,advanceNumberHighlight,
  TAP_MOVE_TOLERANCE,DOUBLE_TAP_INTERVAL,DOUBLE_TAP_DISTANCE
} from '../src/number-highlight.js';

function board(){
  return {
    puzzle:{cells:[
      {given:'7'},{given:'7'},{given:'7'},{given:null},
      {given:null},{given:null},{given:'3'}
    ]},
    progress:{
      visible:[true,false,true,true,false,true,true],
      cells:[
        {},{},{},{value:'7'}, {value:'7'},
        {value:null,corner:['7'],center:['7']},{value:'3'}
      ]
    }
  };
}

function tap(index,time,value='7',x=30,y=30,pointerType='touch'){
  return {index,time,value,x,y,pointerType};
}

test('only displayed large digits match: givens, player entries, and letters',()=>{
  const {puzzle,progress}=board();
  assert.equal(cellLargeValue(puzzle,progress,0),'7');
  assert.equal(cellLargeValue(puzzle,progress,3),'7');
  assert.equal(cellLargeValue(puzzle,progress,4),'7');
  assert.equal(cellLargeValue(puzzle,progress,1),null,'fog hides an original given');
  assert.equal(cellLargeValue(puzzle,progress,2),'7');
  assert.equal(cellLargeValue(puzzle,progress,5),null,'corner and center notes do not count');
  assert.equal(isHighlightedNumber(puzzle,progress,1,'7'),false);
  assert.equal(isHighlightedNumber(puzzle,progress,4,'7'),true,
    'a player-entered value remains findable inside fog');
  assert.equal(isHighlightedNumber(puzzle,progress,6,'7'),false);
  assert.equal(isHighlightedNumber(puzzle,progress,0,null),false);
  progress.cells[3].value='A';
  assert.equal(cellLargeValue(puzzle,progress,3),'A');
  assert.equal(isHighlightedNumber(puzzle,progress,3,'A'),true);
});

test('double tap on a clue activates all-digit highlighting, repeat toggles off',()=>{
  const first=advanceNumberHighlight(null,tap(0,100),null);
  assert.equal(first.changed,false);
  assert.equal(first.selectedNumber,null);
  const second=advanceNumberHighlight(first.previousTap,tap(0,280,'7',39,33),first.selectedNumber);
  assert.equal(second.changed,true);
  assert.equal(second.selectedNumber,'7');
  assert.equal(second.previousTap,null);
  const third=advanceNumberHighlight(second.previousTap,tap(0,480),second.selectedNumber);
  assert.equal(third.selectedNumber,null,'a single new tap clears the highlight');
  assert.equal(third.changed,true);
  const fourth=advanceNumberHighlight(third.previousTap,tap(0,640),third.selectedNumber);
  assert.equal(fourth.selectedNumber,null,'double-tapping the same number keeps it off');
  assert.equal(fourth.changed,false);
});

test('double tapping a different number switches focus; blank double tap clears',()=>{
  const active=advanceNumberHighlight(tap(0,100),tap(0,210),null).selectedNumber;
  assert.equal(active,'7');
  const firstSwitch=advanceNumberHighlight(null,tap(6,250,'3'),active);
  assert.equal(firstSwitch.selectedNumber,null,'first tap must dismiss the old highlight');
  const switched=advanceNumberHighlight(firstSwitch.previousTap,tap(6,300,'3'),firstSwitch.selectedNumber);
  assert.equal(switched.selectedNumber,'3');
  const blank=advanceNumberHighlight(null,tap(5,400,null),switched.selectedNumber);
  assert.equal(blank.selectedNumber,null,'single blank tap clears number focus');
  const cleared=advanceNumberHighlight(blank.previousTap,tap(5,540,null),blank.selectedNumber);
  assert.equal(cleared.selectedNumber,null);
});

test('nearby but different cells, slow taps, drags and pointer switches are not double taps',()=>{
  const existing='4';
  const first=advanceNumberHighlight(null,tap(0,100),existing);
  assert.equal(first.selectedNumber,null,'even the currently selected cell clears focus');
  assert.equal(first.changed,true);
  for(const second of [
    tap(1,120),
    tap(0,100+DOUBLE_TAP_INTERVAL+1),
    tap(0,120,'7',30+DOUBLE_TAP_DISTANCE+1),
    tap(0,120,'7',30,30,'mouse'),
    tap(0,99)
  ]){
    const result=advanceNumberHighlight(first.previousTap,second,first.selectedNumber);
    assert.equal(result.changed,false);
    assert.equal(result.selectedNumber,null);
    assert.equal(result.previousTap.index,second.index);
    assert.equal(result.previousTap.highlightBeforeTap,null);
  }
  assert.ok(TAP_MOVE_TOLERANCE<DOUBLE_TAP_DISTANCE);
});

test('rendering highlights above fog only for player ink, and below all solver marks',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=main.indexOf('function draw() {');
  const end=main.indexOf('\nfunction showCompletionIfNew()',start);
  const draw=main.slice(start,end);
  const visible=draw.indexOf('isVisible(progress,idx) &&\n       isHighlightedNumber(');
  const fog=draw.indexOf('drawFog(ctx,puzzle,progress,clip);');
  const hidden=draw.indexOf('if(!isVisible(progress,idx) &&\n         isHighlightedNumber(');
  const marks=draw.indexOf('drawPenLines(ctx,penLines,CELL,clip);');
  const ink=draw.indexOf('drawCellInk(idx,c*CELL,r*CELL,!isVisible(progress,idx));');
  assert.ok(visible>=0&&visible<fog,'visible matches should be behind constraints and fog');
  assert.ok(fog<hidden&&hidden<marks&&marks<ink,
    'fogged player highlights must not obscure drawn marks or their values');
  assert.ok(main.includes('advanceNumberHighlight(lastBoardTap,tap,gesture.highlightBeforeTap)'),
    'pointer completion should preserve the number before the first tap');
  assert.ok(main.includes('highlightedNumber=null;lastBoardTap=null;'),
    'puzzle changes should reset transient highlights');
});

test('board taps, typing, keyboard controls, outside controls and wheel dismiss highlights',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/function clearNumberHighlight\(resetTap=true\)/);
  assert.match(main,/const highlightBeforeTap=highlightedNumber;[\s\S]*?clearNumberHighlight\(false\);/,
    'board pointerdown should dismiss highlights before selecting');
  assert.match(main,/document\.addEventListener\('pointerdown',event=>\{\s*if\(event\.target!==board\)clearNumberHighlight\(\);/,
    'keypad, toolbar, modal and mouse/touch controls should clear focus');
  assert.match(main,/async function edit\(action,symbol=''\) \{\s*clearNumberHighlight\(\);/,
    'typing a value or editing notes should clear focus');
  assert.match(main,/async function history\(direction\) \{\s*clearNumberHighlight\(\);/,
    'undo and redo should clear focus');
  assert.match(main,/board\.addEventListener\('wheel',event=>\{\s*clearNumberHighlight\(\);/,
    'zooming with the mouse wheel should clear focus');
  assert.match(main,/\$\('checkDialog'\)\.open\)return;\s*clearNumberHighlight\(\);/,
    'keyboard shortcuts and arrow keys should clear focus');
});

test('clearing the first tap does not reactivate the same number on second tap',()=>{
  const selected='7';
  const first=advanceNumberHighlight(null,tap(0,100),selected);
  assert.equal(first.selectedNumber,null);
  const second=advanceNumberHighlight(first.previousTap,tap(0,200),first.selectedNumber);
  assert.equal(second.selectedNumber,null);
  assert.equal(second.previousTap,null);
  // A new double tap on a different digit can still choose that digit.
  const other=advanceNumberHighlight(null,tap(6,350,'3'),selected);
  const switched=advanceNumberHighlight(other.previousTap,tap(6,430,'3'),other.selectedNumber);
  assert.equal(switched.selectedNumber,'3');
});
