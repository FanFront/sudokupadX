import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  parseWpfIndex,filterWpfIndex,wpfRoundPdfCandidates,
  validatedWpfPdfUrl,isPdfData,parseWpfTypePdfs
} from '../src/wpf-catalog.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('ropeko reference list is indexed by year, category and round',()=>{
  const parsed=parseWpfIndex(`
    <h2>References</h2>
    <div>WPF Sudoku GP 2025 - Round 4 (225)</div>
    <div>WPF Puzzle GP 2017 - Round 1A (21)</div>
    <div>WPF Sudoku GP 2025 - Round 4 (225)</div>
    <div>WPF Puzzle GP 2024 - Playoffs (221)</div>`);
  assert.equal(parsed.rounds.length,3);
  assert.deepEqual(filterWpfIndex(parsed.rounds,{search:'round 4',year:'2025',kind:'sudoku'})
    .map(item=>item.referenceId),[225]);
  assert.equal(filterWpfIndex(parsed.rounds,{kind:'puzzle'}).length,2);
  assert.equal(wpfRoundPdfCandidates(parsed.rounds[0])[0],
    'https://gp.worldpuzzle.org/sites/default/files/Puzzles/2025/2025_SudokuRound4.pdf');
  assert.equal(wpfRoundPdfCandidates(parsed.rounds.find(item=>item.round==='Playoffs')).length,0);
});

test('PDF URLs must come from the official competition-PDF directory',()=>{
  const accepted='https://gp.worldpuzzle.org/sites/default/files/Puzzles/2018/2018_SudokuRound4.pdf';
  assert.equal(validatedWpfPdfUrl(accepted),accepted);
  for(const uri of [
    'http://gp.worldpuzzle.org/sites/default/files/Puzzles/2018/x.pdf',
    'https://gp.worldpuzzle.org.evil.example/sites/default/files/Puzzles/2018/x.pdf',
    'https://gp.worldpuzzle.org/content/competition-puzzles',
    'https://gp.worldpuzzle.org/sites/default/files/Puzzles/2018/x.pdf?download=1',
    'https://gp.worldpuzzle.org/sites/default/files/Puzzles/2018/%2Fadmin.pdf',
    'https://other.org/sites/default/files/Puzzles/2018/x.pdf'
  ])assert.equal(validatedWpfPdfUrl(uri),null,uri);
  assert.equal(isPdfData(new TextEncoder().encode('%PDF-1.7\n')),true);
  assert.equal(isPdfData(new TextEncoder().encode('<html>not a pdf</html>')),false);
});

test('WPF type details only expose official PDF links, never arbitrary URLs',()=>{
  const old=globalThis.DOMParser;
  globalThis.DOMParser=class{
    parseFromString(){return {querySelectorAll:()=>[
      {getAttribute:()=> 'https://gp.worldpuzzle.org/sites/default/files/Puzzles/2024/a.pdf',textContent:'Example A'},
      {getAttribute:()=> 'https://evil.example/a.pdf',textContent:'Injected'},
      {getAttribute:()=> 'https://gp.worldpuzzle.org/sites/default/files/Puzzles/2024/a.pdf',textContent:'Duplicate'}
    ]};}
  };
  try{
    const data=parseWpfTypePdfs('<html>examples</html>');
    assert.equal(data.length,1);
    assert.equal(data[0].title,'Example A');
  }finally{if(old===undefined)delete globalThis.DOMParser;else globalThis.DOMParser=old;}
});

test('shared UI wires a full-screen PDF canvas with per-page notes',()=>{
  const html=source('index.html'),ui=source('src/wpf-ui.js');
  const reader=source('src/wpf-reader.js'),rust=source('src-tauri/src/lib.rs');
  const pkg=JSON.parse(source('package.json'));
  for(const id of ['wpfLibraryTab','wpfLibraryPanel','wpfSearchForm','wpfResults',
    'wpfSavedResults','wpfTypeExamples','wpfReaderDialog','wpfPdfCanvas','wpfInkCanvas',
    'wpfUndo','wpfRedo','wpfEraserToggle','wpfPenToggle','wpfPageInput'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(ui,/fetch_wpf_index/);
  assert.match(ui,/fetch_wpf_type/);
  assert.match(reader,/fetch_wpf_pdf/);
  assert.match(reader,/saveWpfInk/);
  assert.match(rust,/async fn fetch_wpf_pdf/);
  assert.match(rust,/!bytes\.starts_with\(b"%PDF-"\)/);
  assert.match(rust,/reqwest::redirect::Policy::none\(\)/);
  assert.ok(pkg.dependencies['pdfjs-dist']);
  const csp=JSON.parse(source('src-tauri/tauri.conf.json')).app.security.csp;
  assert.match(csp,/https:\/\/gp\.worldpuzzle\.org/);
});
