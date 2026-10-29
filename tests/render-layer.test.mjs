import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=main.indexOf('function draw() {');
const end=main.indexOf('\nfunction showCompletionIfNew()',start);
assert.ok(start>=0&&end>start,'Canvas renderer should exist');
const draw=main.slice(start,end);

function position(needle) {
  const index=draw.indexOf(needle);
  assert.ok(index>=0,'Missing render operation: '+needle);
  assert.equal(draw.indexOf(needle,index+1),-1,'Unexpected duplicate render operation: '+needle);
  return index;
}

test('circle-arrow overlays stay beneath regular values and pencil marks',()=>{
  const normal=position('drawArrows(ctx,puzzle,clip);');
  const overlayPaths=position('drawPathMarks(ctx,puzzle.overlays);');
  const overlayShapes=position('drawDecorations(ctx,puzzle.overlays,clip);');
  const overlayLines=position("drawPuzzleLines(ctx,puzzle.lines,clip,'overlay');");
  const visibleInk=position('drawCellInk(idx,c*CELL,r*CELL,false);');
  assert.ok(normal<overlayPaths,'normal arrows precede overlay artwork');
  assert.ok(overlayPaths<overlayShapes&&overlayShapes<overlayLines,'overlays retain their order');
  assert.ok(overlayLines<visibleInk,'values and candidate marks sit above circles');
});

test('fog hides authored puzzle art but player-written values and notes stay on top',()=>{
  const visibleInk=position('drawCellInk(idx,c*CELL,r*CELL,false);');
  const fog=position('drawFog(ctx,puzzle,progress,clip);');
  const borders=position("drawPuzzleLines(ctx,puzzle.lines,clip,'grid');");
  const fogInk=position('drawCellInk(idx,c*CELL,r*CELL,true);');
  const selection=position('for(const index of selectedCells){');
  assert.ok(visibleInk<fog,'fog conceals normal board rendering');
  assert.ok(fog<borders&&borders<fogInk,'fogged player ink is redrawn above the fog');
  assert.ok(fogInk<selection,'selection outline remains visible above player ink');
  assert.ok(draw.includes('if(!isVisible(progress,idx))drawCellInk('),
    'fog repaint only targets hidden cells');
});

test('both draw passes share the same player-ink renderer with contrast for fog',()=>{
  const begin=main.indexOf('function drawCellInk(');
  const finish=main.indexOf('\nfunction validSymbol(',begin);
  assert.ok(begin>=0&&finish>begin);
  const helper=main.slice(begin,finish);
  assert.match(helper,/cellInk\(puzzle,progress,index\)/,
    'player ink must be resolved separately from source givens');
  assert.match(helper,/drawNoteRow\(ink,'corner'/);
  assert.match(helper,/drawNoteRow\(ink,'center'/);
  assert.match(helper,/ink\.fogged\?'#f0f6ff'/,
    'fogged input values use text contrasting with the dark fog');
});
