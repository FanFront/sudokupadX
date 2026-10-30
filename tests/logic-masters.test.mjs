import test from 'node:test';
import assert from 'node:assert/strict';
import {
  logicMastersReference,parseLogicMastersPage,directSudokuPadEntry,
  logicMastersSearchUrl,parseLogicMastersSearch,parseLogicMastersDetails,
  logicMastersDifficultyLabel
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


test('search results include per-row difficulty and estimated flag',()=>{
  const html = '<p>2 entries have been found.</p><table>' +
    '<tr><td><a href="../Raetsel/zeigen.php?id=000ABC">First</a> by <a href="#">Alice</a></td>' +
    '<td><img alt="Vom Rätselautor geschätzt: mittelschweres Rätsel"></td></tr>' +
    '<tr><td><a href="../Raetsel/zeigen.php?id=000DEF">Second</a> by <a href="#">Bob</a></td>' +
    '<td><img title="sehr schweres Rätsel"></td></tr></table>';
  const {items}=parseLogicMastersSearch(html);
  assert.deepEqual(items.map(x=>x.difficulty),[3,5]);
  assert.deepEqual(items.map(x=>x.difficultyEstimated),[true,false]);
  assert.match(logicMastersDifficultyLabel(3,true),/中等.*作者预估/);
  assert.equal(logicMastersDifficultyLabel(null),'');
});
test('difficulty does not leak from the next result row',()=>{
  const html = '<table><tr><td><a href="../Raetsel/zeigen.php?id=000ABC">No rating</a></td></tr>' +
    '<tr><td><a href="../Raetsel/zeigen.php?id=000DEF">Easy</a></td>' +
    '<td><img alt="sehr leichtes Rätsel"></td></tr></table>';
  assert.deepEqual(parseLogicMastersSearch(html).items.map(x=>x.difficulty),[null,1]);
});
test('details retain readable original rules without portal chrome or unsafe markup',()=>{
  const html = '<h2>Whispers &amp; Arrows</h2><p>(Eingestellt heute von Alex)</p>' +
    '<div><p>Rules:</p><ul><li>Place digits 1-9.</li><li>German Whispers line.</li></ul>' +
    '<p><a href="https://sudokupad.app/abc123">Play on SudokuPad</a></p>' +
    '<img src="grid.png"></div>' +
    '<p><strong>Lösungscode:</strong> Row 1</p>' +
    '<div>Kommentare<script>alert("unsafe")</script></div>' +
    '<img alt="Vom Rätselautor geschätzt: leichtes Rätsel">';
  const detail=parseLogicMastersDetails(html);
  assert.equal(detail.title,'Whispers & Arrows');
  assert.match(detail.description,/Place digits 1-9/);
  assert.match(detail.description,/German Whispers line/);
  assert.match(detail.description,/Play on SudokuPad/);
  assert.doesNotMatch(detail.description,/Lösungscode|Kommentare|unsafe|Eingestellt/);
  assert.equal(detail.hasImages,true);
  assert.equal(detail.difficulty,2);
  assert.equal(detail.difficultyEstimated,true);
});
test('missing description marker never displays the whole LMD website',()=>{
  const detail=parseLogicMastersDetails('<h2>Image only</h2><p>Menu and comments</p>');
  assert.equal(detail.description,'');
  assert.equal(detail.difficulty,null);
  assert.throws(()=>parseLogicMastersDetails('x'.repeat(1024*1024+1)),/1 MiB/);
});
