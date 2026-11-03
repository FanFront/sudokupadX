import test from 'node:test';
import assert from 'node:assert/strict';
import {variantKeypadSymbols} from '../src/variant-keypad.js';

test('generated variants expose only digits allowed by the board size', () => {
  for (const n of [4, 6, 9]) {
    const keys=variantKeypadSymbols({rows:n,cols:n},
      {group:'variant-workshop'});
    assert.deepEqual(keys, Array.from({length:n},(_,i)=>String(i+1)));
    assert.equal(keys.includes('0'),false);
  }
});

test('ordinary SudokuPad games keep their existing keypad and alphabet paging', () => {
  assert.equal(variantKeypadSymbols({rows:4,cols:4},
    {group:'original'}).length,10);
  assert.deepEqual(variantKeypadSymbols({rows:6,cols:6},
    {group:'variant-workshop'},true,0),[...'ABCDEFGHI']);
});
