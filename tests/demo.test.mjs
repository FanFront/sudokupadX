import test from 'node:test';
import assert from 'node:assert/strict';
import {digits,makeDemo} from '../src/demo.js';
test('9x9 demonstration has one value per cell',()=>{
  const {puzzle,progress}=makeDemo();
  assert.equal(digits.length,9);
  assert.ok(digits.every(x=>x.length===9));
  assert.equal(puzzle.cells.length,81);
  assert.equal(progress.cells.length,81);
  assert.equal(puzzle.regions.length,9);
  assert.equal(puzzle.cells[0].given,'5');
  assert.equal(puzzle.cells[2].given,null);
});
