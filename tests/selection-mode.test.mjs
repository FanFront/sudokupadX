import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  SELECTION_MODE_KEY,normalizeSelectionMode,readSelectionMode,switchSelectionMode,
  selectionAfterModeChange,tapSelection,dragSelection
} from '../src/selection-mode.js';

test('single selection still replaces on tap and adds cells during a drag',()=>{
  assert.deepEqual(tapSelection('single',[3,4,5],7),[7]);
  assert.deepEqual(tapSelection('single',[3,4],-1),[]);
  assert.deepEqual(dragSelection('single',[3,4],7,[8,9,8]),[7,8,9]);
});

test('multiple selection toggles individual cells without clearing earlier picks',()=>{
  let chosen=[];
  chosen=tapSelection('multiple',chosen,5);
  chosen=tapSelection('multiple',chosen,9);
  chosen=tapSelection('multiple',chosen,2);
  assert.deepEqual(chosen,[5,9,2]);
  chosen=tapSelection('multiple',chosen,9);
  assert.deepEqual(chosen,[5,2]);
  chosen=tapSelection('multiple',chosen,9);
  assert.deepEqual(chosen,[5,2,9]);
  assert.deepEqual(tapSelection('multiple',chosen,-1),chosen,
    'tapping outside the board should not clear multi-selection');
});

test('multiple selection drag adds cells, including when starting on a selected cell',()=>{
  assert.deepEqual(dragSelection('multiple',[2,5],5,[5,6,7,7]),[2,5,6,7]);
  assert.deepEqual(dragSelection('multiple',[2,5],9,[10,11]),[2,5,9,10,11]);
  const prior=[2,5];
  dragSelection('multiple',prior,5,[6]);
  assert.deepEqual(prior,[2,5],'selection helpers must not mutate gesture snapshots');
});

test('switching from multiple to single keeps the last focused cell',()=>{
  assert.equal(switchSelectionMode('single'),'multiple');
  assert.equal(switchSelectionMode('multiple'),'single');
  assert.deepEqual(selectionAfterModeChange('single',[2,5,7]),[7]);
  assert.deepEqual(selectionAfterModeChange('single',[]),[]);
  assert.deepEqual(selectionAfterModeChange('multiple',[2,5]),[2,5]);
});

test('selection preference is validated and handles unavailable local storage',()=>{
  assert.equal(normalizeSelectionMode('multiple'),'multiple');
  assert.equal(normalizeSelectionMode('invalid'),'single');
  assert.equal(readSelectionMode({getItem:key=>key===SELECTION_MODE_KEY?'multiple':null}),'multiple');
  assert.equal(readSelectionMode({getItem:()=>null}),'single');
  assert.equal(readSelectionMode({getItem:()=>{throw Error('storage blocked');}}),'single');
});

test('board toggle and gesture wiring preserve mobile access and pinch rollback',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(html,/class="board-hud"[\\s\\S]*?id="selectionModeButton"/);
  assert.match(html,/id="selectionModeButton"[^>]*aria-pressed="false"/);
  assert.match(css,/\\.board-hud \\.board-hud-actions button\\{pointer-events:auto/);
  assert.match(main,/selectionMode=switchSelectionMode\\(selectionMode\\)/);
  assert.match(main,/localStorage\\.setItem\\(SELECTION_MODE_KEY,selectionMode\\)/);
  assert.match(main,/if\\(!panMouse&&selectionMode==='single'\\)select\\(startIndex\\)/);
  assert.match(main,/if\\(gesture\\?\\.kind==='select'\\)setSelection\\(gesture\\.oldSelection\\)/);
  assert.match(main,/tapSelection\\('multiple',gesture\\.oldSelection,index\\)/);
  assert.match(main,/dragSelection\\('multiple',selectedCells,gesture\\.startIndex/);
  assert.match(main,/if\\(event\\.type==='pointercancel'\\)/);
});
