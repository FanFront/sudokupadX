import test from 'node:test';
import assert from 'node:assert/strict';
import {
  logicMastersReference,parseLogicMastersPage,directSudokuPadEntry,
  logicMastersSearchUrl,parseLogicMastersSearch
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
  assert.equal(entries[0].id,'lmd:000OKF:l1sowokb08');
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


test('live portal keyword searches use the public advanced-search parameters',()=>{
  const uri = new URL(logicMastersSearchUrl('German Whispers',20));
  assert.equal(uri.hostname,'logic-masters.de');
  assert.equal(uri.pathname,'/Raetselportal/Suche/erweitert.php');
  assert.equal(uri.searchParams.get('skname'),'x');
  assert.equal(uri.searchParams.get('sktext'),'x');
  assert.equal(uri.searchParams.get('suchtext'),'German Whispers');
  assert.equal(uri.searchParams.get('start'),'20');
  assert.equal(new URL(logicMastersSearchUrl('')).searchParams.has('suchtext'),false);
  for(const start of [-1,15,20020,1.2])
    assert.throws(()=>logicMastersSearchUrl('test',start),/页码/);
  assert.throws(()=>logicMastersSearchUrl('x'.repeat(101)),/关键词/);
});

test('listings resolve only real LMD puzzle links with titles, unique IDs and authors',()=>{
  const html = '<html><h1>Search Results</h1><p>42 entries have been found.</p><table>' +
    '<tr><td><a href="../Raetsel/zeigen.php?id=000ABC">Whispers &amp; Arrows</a>' +
    ' by <a href="../Benutzer/anzeigen.php?name=Alex">Alex</a></td></tr>' +
    '<tr><td><a href="/Raetselportal/Raetsel/zeigen.php?id=000DEF">Renban</a>' +
    ' von <a href="https://logic-masters.de/Raetselportal/Benutzer/anzeigen.php?id=1">Paul</a></td></tr>' +
    '<tr><td><a href="../Raetsel/zeigen.php?id=000ABC">Duplicate</a></td></tr>' +
    '<tr><td><a href="https://evil.example/Raetselportal/Raetsel/zeigen.php?id=000EEE">Malicious</a></td></tr></table>';
  const result=parseLogicMastersSearch(html);
  assert.equal(result.total,42);
  assert.deepEqual(result.items.map(x=>x.id),['000ABC','000DEF']);
  assert.equal(result.items[0].title,'Whispers & Arrows');
  assert.equal(result.items[0].author,'Alex');
  assert.equal(result.items[0].url,
    'https://logic-masters.de/Raetselportal/Raetsel/zeigen.php?id=000ABC');
});
test('unrelated HTML cannot invent Logic Masters search hits',()=>{
  assert.deepEqual(parseLogicMastersSearch('<p>No puzzles</p>'),{items:[],total:null});
  assert.throws(()=>parseLogicMastersSearch('x'.repeat(1024*1024+1)),/1 MiB/);
});
