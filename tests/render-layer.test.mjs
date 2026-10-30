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
  const visibleInk=position('drawCellInk(idx,c*CELL,r*CELL,!isVisible(progress,idx));');
  assert.ok(normal<overlayPaths,'normal arrows precede overlay artwork');
  assert.ok(overlayPaths<overlayShapes&&overlayShapes<overlayLines,'overlays retain their order');
  assert.ok(overlayLines<visibleInk,'values and candidate marks sit above circles');
});

test('fog hides authored puzzle art but player-written values and notes stay on top',()=>{
  const visibleInk=position('drawCellInk(idx,c*CELL,r*CELL,!isVisible(progress,idx));');
  const fog=position('drawFog(ctx,puzzle,progress,clip);');
  const borders=position("drawPuzzleLines(ctx,puzzle.lines,clip,'grid');");
  const userLines=position('drawPenLines(ctx,penLines,CELL,clip);');
  const userMarks=position('drawPenMarks(ctx,penMarks,CELL,clip);');
  const selection=position('for(const index of selectedCells){');
  assert.ok(fog<borders&&borders<userLines,'authored artwork stays behind fog while solver strokes stay on top');
  assert.ok(userLines<userMarks&&userMarks<visibleInk,
    'lines, circles and crosses must all be behind givens, player digits and pencil notes');
  assert.ok(visibleInk<selection,'selection outlines remain above player ink');
  assert.ok(draw.includes('!isVisible(progress,idx)'),
    'visibility-aware ink renderer must not expose hidden givens');
});

test('player ink renderer uses separate given/notes logic and contrast for fog',()=>{
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
