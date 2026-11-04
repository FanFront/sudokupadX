import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';
import {nextAdventureHint} from '../src/hints/adventure.js';
import {typedConstraints} from '../src/hints/constraint-data.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const name='boss-frudzw3n73';
const src=readFileSync(resolve(root,'public/puzzles',name+'.scl'),'utf8');
const original=JSON.parse(LZString.decompressFromBase64(src.trim().slice(3)));
const manifest=JSON.parse(readFileSync(
  resolve(root,'public/puzzles/hint-constraints',name+'.json'),'utf8'));
const given=Array.from({length:81},()=>({value:null,center:[],corner:[]}));
const values=[...original.metadata.solution].map(Number);
function run(){
  const puzzle={rows:9,cols:9,rules:original.metadata.rules,
    cells:original.cells.flat().map(c=>({given:c?.value??null})),
    regions:original.regions,sectors:[],cages:[],hintConstraints:manifest.constraints};
  return {puzzle,progress:{visible:Array(81).fill(true),
    cells:given.map(c=>({...c,corner:[],center:[]}))}};
}
test('nine thermometer monster rules trace every intermediate cell and follow the bulb',()=>{
  const {puzzle,progress}=run(),rules=typedConstraints(puzzle,progress);
  assert.equal(rules.length,10);
  const thermos=rules.filter(r=>r.type==='thermo');
  assert.equal(thermos.length,9);
  const bulb=new Set(original.underlays.filter(x=>x.rounded&&x.width<1)
    .map(x=>Math.floor(x.center[0])*9+Math.floor(x.center[1])));
  for(const rule of thermos){
    assert.ok(bulb.has(rule.cells[0]),'first cell must be a real thermo bulb');
    assert.ok(rule.cells.slice(1).every((i,j)=>values[i]>values[rule.cells[j]]));
    for(let j=1;j<rule.cells.length;j++){
      const a=rule.cells[j-1],b=rule.cells[j];
      assert.ok(Math.abs(Math.floor(a/9)-Math.floor(b/9))<=1);
      assert.ok(Math.abs(a%9-b%9)<=1);
    }
  }
  // SCL line #8 stores its waypoints backwards; its actual bulb is R8C2.
  assert.equal(thermos[7].cells[0],64);
  assert.equal(thermos[7].cells[1],56);
});
test('thermometer monster solver produces a visible supported next step',()=>{
  const {puzzle,progress}=run();
  progress.cells[29].center=['1','9']; // R4C3 is the bulb of line 1.
  const hint=nextAdventureHint(puzzle,progress,4,29);
  assert.equal(hint.status,'step');
  assert.equal(hint.step.method,'thermo');
  assert.equal(hint.step.cell,29);
  assert.ok(hint.step.removed.includes(9));
});
