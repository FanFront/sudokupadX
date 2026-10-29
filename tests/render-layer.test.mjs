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
  assert.equal(draw.indexOf(needle,index+1),-1,'Unexpected duplicate draw operation: '+needle);
  return index;
}

test('overlay circles and arrow decoration render before all values and pencil marks',()=>{
  const normal=position('drawArrows(ctx,puzzle,clip);');
  const overlayPaths=position('drawPathMarks(ctx,puzzle.overlays);');
  const overlayShapes=position('drawDecorations(ctx,puzzle.overlays,clip);');
  const overlayLines=position("drawPuzzleLines(ctx,puzzle.lines,clip,'overlay');");
  const value=position('ctx.fillText(String(value),');
  const corner=position("drawNoteRow(entry,'corner',");
  const center=position("drawNoteRow(entry,'center',");
  assert.ok(normal<overlayPaths,'normal rules precede overlay artwork');
  assert.ok(overlayPaths<overlayShapes&&overlayShapes<overlayLines,'overlay artwork remains ordered');
  assert.ok(overlayLines<value&&overlayLines<corner&&overlayLines<center,
    'placed and candidate values must be painted on top of circles');
});

test('fog, borders and selection remain above value/overlay layers',()=>{
  const values=position('ctx.fillText(String(value),');
  const notes=position("drawNoteRow(entry,'center',");
  const fog=position('drawFog(ctx,puzzle,progress,clip);');
  const borders=position("drawPuzzleLines(ctx,puzzle.lines,clip,'grid');");
  const selection=position('for(const index of selectedCells){');
  assert.ok(values<fog&&notes<fog,'fog should still conceal hidden digits');
  assert.ok(fog<borders&&borders<selection,
    'adventure walls and selection outlines remain above fog');
});
