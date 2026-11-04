import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';
import {typedConstraints} from '../src/hints/constraint-data.js';
import {nextAdventureHint} from '../src/hints/adventure.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const input=readFileSync(resolve(root,'public/puzzles/boss-6cn54q09sv.scl'),'utf8');
const original=JSON.parse(LZString.decompressFromBase64(input.trim().slice(3)));
const manifest=JSON.parse(readFileSync(
  resolve(root,'public/puzzles/hint-constraints/boss-6cn54q09sv.json'),'utf8'));
function prepare(){
  const puzzle={rows:9,cols:9,cells:original.cells.flat().map(c=>({given:c?.value??null})),
    rules:original.metadata.rules,regions:original.regions,sectors:[],
    cages:[],arrows:[],underlays:original.underlays,lines:original.lines,
    hintConstraints:manifest.constraints};
  const progress={visible:Array(81).fill(true),
    cells:Array.from({length:81},()=>({value:null,center:[],corner:[]}))};
  return {puzzle,progress};
}
test('Negative Constraint Domain keeps explicit gray anchors and both verified negative rules',()=>{
  const {puzzle,progress}=prepare(),rules=typedConstraints(puzzle,progress);
  assert.deepEqual(rules.map(r=>r.type),
    ['classic_sudoku','anti_kropki_black','anti_whisper_anchors']);
  assert.equal(rules.at(-1).cells.length,34);
  const digits=[...original.metadata.solution].map(Number);
  const gray=new Set(rules.at(-1).cells);
  for(let i=0;i<81;i++){
    const r=Math.floor(i/9),c=i%9;
    for(const [dr,dc] of [[0,1],[1,0]]){
      const row=r+dr,col=c+dc;
      if(row>=9||col>=9)continue;
      const other=row*9+col;
      assert.notEqual(Math.max(digits[i],digits[other]),
        2*Math.min(digits[i],digits[other]));
      if(gray.has(i)||gray.has(other))
        assert.ok(Math.abs(digits[i]-digits[other])<5);
    }
  }
});
test('anti-black Kropki eliminates a double from adjacent player notes',()=>{
  const {puzzle,progress}=prepare();
  progress.cells[0].value='3';
  progress.cells[1].center=['6','5'];
  const response=nextAdventureHint(puzzle,progress,4,1);
  assert.equal(response.status,'step');
  assert.equal(response.step.method,'anti_kropki_black');
  assert.equal(response.step.cell,1);
  assert.ok(response.step.removed.includes(6));
  assert.ok(response.step.sources.includes(0));
});
test('gray cell forbids a difference of five or more in an adjacent cell',()=>{
  const {puzzle,progress}=prepare();
  // Isolate the gray-cell implication from unrelated original givens,
  // which can already exclude the same digits using ordinary Sudoku.
  puzzle.cells=puzzle.cells.map(()=>({given:null}));
  progress.cells[0].value='3';
  progress.cells[9].center=['9','2'];
  const response=nextAdventureHint(puzzle,progress,4,9);
  assert.equal(response.status,'step');
  assert.equal(response.step.method,'anti_whisper_anchors');
  assert.ok(response.step.removed.includes(9));
  assert.ok(response.step.sources.includes(0));
});
test('negative-rule deductions cannot use hidden source cells',()=>{
  const {puzzle,progress}=prepare();
  progress.cells[0].value='3';
  progress.cells[9].center=['9','2'];
  progress.visible[0]=false;
  assert.notEqual(nextAdventureHint(puzzle,progress,4,9).step?.method,
    'anti_whisper_anchors');
});
