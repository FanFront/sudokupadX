import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';
import {typedConstraints} from '../src/hints/constraint-data.js';
import {nextAdventureHint} from '../src/hints/adventure.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function load(name){
  const source=JSON.parse(LZString.decompressFromBase64(
    readFileSync(resolve(root,'public/puzzles',name+'.scl'),'utf8')
      .trim().slice(3)));
  const manifest=JSON.parse(readFileSync(resolve(root,
    'public/puzzles/hint-constraints',name+'.json'),'utf8'));
  const puzzle={rows:9,cols:9,rules:source.metadata.rules,
    cells:Array.from({length:81},()=>({given:null})),regions:source.regions,
    sectors:[],hintConstraints:manifest.constraints};
  const progress={visible:Array(81).fill(true),cells:Array.from({length:81},
    ()=>({value:null,corner:[],center:[]}))};
  const solution=[...source.metadata.solution].map(Number);
  return {source,manifest,puzzle,progress,solution};
}
test('Beat It! has precisely 30 odd cells, 6 black dots, 4 ball chutes',()=>{
  const {puzzle,progress,solution}=load('super-linked-jo12qmyc5v');
  const rules=typedConstraints(puzzle,progress);
  assert.equal(rules.length,12);
  const odds=rules.find(r=>r.type==='odd');
  assert.equal(odds.cells.length,30);
  assert.ok(odds.cells.every(i=>solution[i]%2===1));
  for(const dot of rules.filter(r=>r.type==='kropki')){
    const vals=dot.cells.map(i=>solution[i]);
    assert.equal(Math.max(...vals),2*Math.min(...vals));
  }
  for(const chute of rules.filter(r=>r.type==='zipline')){
    assert.equal(chute.cells.length%2,1);
    const middle=solution[chute.cells[Math.floor(chute.cells.length/2)]];
    for(let i=0;i<Math.floor(chute.cells.length/2);i++)
      assert.equal(solution[chute.cells[i]]+
        solution[chute.cells[chute.cells.length-1-i]],middle);
  }
});
test('Beat It! odd marker and ball chute produce separate useful deductions',()=>{
  const {puzzle,progress,solution}=load('super-linked-jo12qmyc5v');
  const odd=puzzle.hintConstraints.find(r=>r.type==='odd').cells[0];
  progress.cells[odd].center=['2',String(solution[odd])];
  let hint=nextAdventureHint(puzzle,progress,4,odd);
  assert.equal(hint.step?.method,'odd');
  assert.ok(hint.step.removed.includes(2));

  const line=puzzle.hintConstraints.find(r=>r.type==='zipline').cells;
  const center=line[Math.floor(line.length/2)],a=line[0],b=line.at(-1);
  progress.cells=progress.cells.map(()=>({value:null,center:[],corner:[]}));
  progress.cells[center].value=String(solution[center]);
  progress.cells[a].value=String(solution[a]);
  const wrong=[1,2,3,4,5,6,7,8,9].find(d=>
    d!==solution[b]&&d!==solution[center]&&d!==solution[a]);
  progress.cells[b].center=[String(solution[b]),String(wrong)];
  hint=nextAdventureHint(puzzle,progress,4,b);
  assert.equal(hint.step?.method,'zipline');
  assert.ok(hint.step.removed.includes(wrong));
});
test('Refugee Rescue covers every original whisper, cache and alien',()=>{
  const {puzzle,progress,solution}=load('super-linked-80kqa7jo0h');
  const rules=typedConstraints(puzzle,progress);
  assert.deepEqual(Object.fromEntries([...new Set(rules.map(r=>r.type))]
    .map(type=>[type,rules.filter(r=>r.type===type).length])),
    {classic_sudoku:1,whisper:10,greater_neighbors:6,
      anti_knight_anchors:1});
  for(const rule of rules){
    if(rule.type==='whisper')
      assert.ok(rule.cells.slice(1).every((i,j)=>
        Math.abs(solution[i]-solution[rule.cells[j]])>=5));
    if(rule.type==='greater_neighbors')
      assert.ok(rule.cells.slice(1).every(i=>solution[rule.cells[0]]>solution[i]));
    if(rule.type==='anti_knight_anchors'){
      for(const i of rule.cells){
        const r=Math.floor(i/9),c=i%9;
        for(const [dr,dc] of [[1,2],[1,-2],[-1,2],[-1,-2],
          [2,1],[2,-1],[-2,1],[-2,-1]]){
          const row=r+dr,col=c+dc;
          if(row>=0&&row<9&&col>=0&&col<9)
            assert.notEqual(solution[i],solution[row*9+col]);
        }
      }
    }
  }
});
test('supply cache must exceed each specified ordinary neighbor',()=>{
  const {puzzle,progress,solution}=load('super-linked-80kqa7jo0h');
  const cache=puzzle.hintConstraints.find(r=>r.type==='greater_neighbors');
  const source=cache.cells[0],target=cache.cells[1];
  progress.cells[source].value=String(solution[source]);
  const wrong=Math.min(9,solution[source]+1);
  assert.ok(wrong>solution[source]);
  progress.cells[target].center=[String(solution[target]),String(wrong)];
  const hint=nextAdventureHint(puzzle,progress,4,target);
  assert.equal(hint.step?.method,'greater_neighbors');
  assert.ok(hint.step.removed.includes(wrong));
  assert.ok(hint.step.sources.includes(source));
});
