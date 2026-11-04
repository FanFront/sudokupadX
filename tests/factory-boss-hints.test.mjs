import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';
import {typedConstraints} from '../src/hints/constraint-data.js';
import {nextAdventureHint} from '../src/hints/adventure.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(LZString.decompressFromBase64(readFileSync(
  resolve(root,'public/puzzles/boss-ny34cxleh8.scl'),'utf8').trim().slice(3)));
const sidecar=JSON.parse(readFileSync(resolve(root,
  'public/puzzles/hint-constraints/boss-ny34cxleh8.json'),'utf8'));
const solution=[...source.metadata.solution].map(Number);
const fullBoard=Array.from({length:81},(_,i)=>i);
function open(){
  return {
    puzzle:{rows:9,cols:9,cells:source.cells.flat().map(c=>({given:c?.value??null})),
      rules:source.metadata.rules,regions:source.regions,sectors:[],
      hintConstraints:[...sidecar.constraints,
        {type:'anti_knight',cells:fullBoard}]},
    progress:{visible:Array(81).fill(true),
      cells:Array.from({length:81},()=>({value:null,center:[],corner:[]}))}
  };
}
test('factory boss has six complete thermometers, four true whispers, global anti-knight',()=>{
  assert.equal(source.metadata.antiknight,true);
  const {puzzle,progress}=open(),rules=typedConstraints(puzzle,progress);
  assert.equal(rules.length,12);
  const thermos=rules.filter(r=>r.type==='thermo');
  const whispers=rules.filter(r=>r.type==='whisper');
  assert.equal(thermos.length,6);
  assert.equal(whispers.length,4);
  const bulbs=new Set(source.underlays.filter(u=>u.rounded&&u.width<1)
    .map(u=>Math.floor(u.center[0])*9+Math.floor(u.center[1])));
  for(const t of thermos){
    assert.ok(bulbs.has(t.cells[0]));
    assert.ok(t.cells.slice(1).every((i,k)=>solution[i]>solution[t.cells[k]]));
  }
  for(const w of whispers)
    assert.ok(w.cells.slice(1).every((i,k)=>
      Math.abs(solution[i]-solution[w.cells[k]])>=5));
  assert.equal(rules.filter(r=>r.type==='anti_knight').length,1);
});
test('factory boss can explain an actual bulb deduction with the original map',()=>{
  const {puzzle,progress}=open();
  // The first thermometer starts at R4C6 (r3c5).
  const bulb=3*9+5;
  progress.cells[bulb].center=['9','1'];
  const h=nextAdventureHint(puzzle,progress,4,bulb);
  assert.equal(h.status,'step');
  assert.equal(h.step.method,'thermo');
  assert.equal(h.step.cell,bulb);
  assert.ok(h.step.removed.includes(9));
});
