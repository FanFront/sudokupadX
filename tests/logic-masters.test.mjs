import test from 'node:test';
import assert from 'node:assert/strict';
import {
  logicMastersReference,parseLogicMastersPage,directSudokuPadEntry
} from '../src/logic-masters.js';

test('Logic Masters IDs and official HTTPS links resolve to canonical page',()=>{
  assert.deepEqual(logicMastersReference('000okf'),{
    id:'000OKF',url:'https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000OKF'
  });
  assert.equal(logicMastersReference(
    'https://www.logic-masters.de/Raetselportal/Raetsel/zeigen.php?chlang=en&id=000OKF'
  ).id,'000OKF');
  for(const bad of [
    'https://logic-masters.de.evil.com/Raetselportal/Raetsel/zeigen.php?id=000OKF',
    'http://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000OKF',
    'https://logic-masters.de/other?id=000OKF', '../puzzles', 'abcd'
  ]) assert.throws(()=>logicMastersReference(bad),/Logic Masters|六位/,bad);
});

test('extracts and deduplicates valid SudokuPad links from LMD HTML',()=>{
  const html = '<h2>N-Lines &amp; more</h2><p>' +
    '<a href="https://sudokupad.app/l1sowokb08?setting-nogrid=1&amp;a=2">Play</a>' +
    ' https://sudokupad.app/l1sowokb08?setting-nogrid=1&amp;a=2' +
    '<a href="https://www.sudokupad.app/another123">Second</a></p>';
  const entries=parseLogicMastersPage(html,'000OKF');
  assert.equal(entries.length,2);
  assert.equal(entries[0].id,'lmd:000OKF:1');
  assert.equal(entries[0].sourceUrl,
    'https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000OKF');
  assert.equal(entries[0].puzzleUrl,
    'https://sudokupad.app/l1sowokb08?setting-nogrid=1&a=2');
  assert.match(entries[0].title,/N-Lines & more/);
});

test('image-only pages remain unsupported, without inventing a playable grid',()=>{
  assert.deepEqual(parseLogicMastersPage('<h2>Image Puzzle</h2><img src="puzzle.png">','000OKF'),[]);
});
test('accept direct SudokuPad links but reject arbitrary hosts',()=>{
  assert.equal(directSudokuPadEntry('https://sudokupad.app/abc123').id,'lmd:direct:abc123');
  assert.throws(()=>directSudokuPadEntry('https://evil.example/x'),/SudokuPad/);
});
