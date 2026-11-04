import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import LZString from 'lz-string';
import {nextAdventureHint,gridsAndHouses} from '../src/hints/adventure.js';
import {typedConstraints} from '../src/hints/constraint-data.js';
import {usesTypedHintEngine} from '../src/hints/mode.js';
import {describeHint} from '../src/hints/format.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const name='super-linked-hfyjv8jqr5';
const raw=readFileSync(resolve(root,'public/puzzles',name+'.scl'),'utf8');
const source=JSON.parse(LZString.decompressFromBase64(raw.trim().slice(3)));
const manifest=JSON.parse(readFileSync(
  resolve(root,'public/puzzles/hint-constraints',name+'.json'),'utf8'));
const values=[...source.metadata.solution].map(Number);
const puzzle=()=>({
  rows:9,cols:9,title:source.metadata.title,
  rules:source.metadata.rules,
  cells:source.cells.flat().map(c=>({given:c?.value==null?null:String(c.value)})),
  sectors:[],regions:source.regions,cages:source.cages||[],
  overlays:source.overlays||[],underlays:source.underlays||[],
  arrows:source.arrows||[],lines:source.lines||[],
  hintConstraints:structuredClone(manifest.constraints)
});
const progress=()=>({
  visible:Array(81).fill(true),
  cells:Array.from({length:81},()=>({value:null,center:[],corner:[]}))
});
const solved=(state,indices)=>{
  for(const i of indices)state.cells[i].value=String(values[i]);
};
const fingerprint=data=>{
  let h=0xcbf29ce484222325n;
  for(const byte of Buffer.from(data,'utf8'))
    h=BigInt.asUintN(64,(h^BigInt(byte))*0x100000001b3n);
  return 'fnv1a-'+h.toString(16).padStart(16,'0');
};

test('original Caldera Chaos boss has all ten pinned, separately verified rules',()=>{
  assert.equal(manifest.sourceFingerprint,fingerprint(raw.trim()));
  assert.equal(manifest.sourcePuzzleId,source.id);
  assert.deepEqual(manifest.sourceDimensions,[9,9]);
  const rules=typedConstraints(puzzle(),progress());
  assert.deepEqual(
    Object.fromEntries([...new Set(rules.map(r=>r.type))].map(t=>
      [t,rules.filter(r=>r.type===t).length])),
    {classic_sudoku:1,thermo:2,arrow:6,anti_knight_anchors:1}
  );
  for(let r=0;r<9;r++){
    assert.equal(new Set(values.slice(r*9,r*9+9)).size,9);
    assert.equal(new Set(Array.from({length:9},(_,c)=>values[c*9+r])).size,9);
  }
  for(const rule of rules){
    if(rule.type==='thermo')
      assert.ok(rule.cells.slice(1).every((c,i)=>values[c]>values[rule.cells[i]]),
        'thermometers increase from the actual circle');
    if(rule.type==='arrow')
      assert.equal(values[rule.cells[0]],
        rule.cells.slice(1).reduce((s,i)=>s+values[i],0),
        "Every arrow shaft sums to its exact circular bulb");
    if(rule.type==='anti_knight_anchors'){
      for(const a of rule.cells){
        const r=Math.floor(a/9),c=a%9;
        for(const [dr,dc] of [[1,2],[-1,2],[1,-2],[-1,-2],
          [2,1],[-2,1],[2,-1],[-2,-1]]){
          const rr=r+dr,cc=c+dc;
          if(rr>=0&&rr<9&&cc>=0&&cc<9)
            assert.notEqual(values[a],values[rr*9+cc]);
        }
      }
    }
  }
});

test('legacy 9×9 Boss puzzles use typed hints on Android as well as browser',()=>{
  const p=puzzle();
  assert.equal(usesTypedHintEngine({...p,hintRules:undefined}),true);
  assert.equal(usesTypedHintEngine({...p,hintRules:[]}),false);
  assert.equal(usesTypedHintEngine({...p,rows:42,cols:45}),true);
  const {domains,houses}=gridsAndHouses(p,
    typedConstraints(p,progress()));
  assert.ok(domains.every(n=>n===9));
  assert.ok(houses.filter(h=>h.kind==='row').length>=9);
  assert.ok(houses.filter(h=>h.kind==='column').length>=9);
  assert.ok(houses.filter(h=>h.kind==='box').length>=9);
});

test('an enemy alien constrains any knight-step neighbor, not only another alien',()=>{
  const p=puzzle(),state=progress();
  solved(state,[1]); // Blue alien at R1C2 is 8; R2C4 is a knight move.
  state.cells[12].center=['8','3'];
  const snapshot=JSON.stringify(state);
  const result=nextAdventureHint(p,state,4,12);
  assert.equal(result.status,'step');
  assert.equal(result.step.method,'anti_knight_anchors');
  assert.equal(result.step.cell,12);
  assert.ok(result.step.removed.includes(8));
  assert.ok(result.step.sources.includes(1));
  assert.equal(JSON.stringify(state),snapshot,'hint never edits pencil marks');
  assert.match(describeHint(result,9,state.cells).description,/R2C4/);
});

test('actual gray thermometer can eliminate a candidate at the circle',()=>{
  const p=puzzle(),state=progress();
  state.cells[36].center=['2','9']; // first thermometer circle R5C1
  const result=nextAdventureHint(p,state,4,36);
  assert.equal(result.status,'step');
  assert.equal(result.step.cell,36);
  assert.equal(result.step.method,'thermo');
  assert.ok(result.step.removed.includes(9));
  assert.ok(result.step.sources.includes(27));
});

test('actual arrow uses circular cell and full shaft, not decorative alien pointers',()=>{
  const p=puzzle(),state=progress();
  solved(state,[63,73]); // arrow R8C1=5; R9C2=1; R8C3 must be 4.
  state.cells[65].center=['4','6'];
  const result=nextAdventureHint(p,state,4,65);
  assert.equal(result.status,'step');
  assert.equal(result.step.cell,65);
  assert.equal(result.step.method,'arrow');
  assert.ok(result.step.removed.includes(6));
  assert.ok(result.step.sources.includes(63));
  assert.ok(result.step.sources.includes(73));
});

test('classical reasoning is available on other linked Sudokus without fake solverRules',()=>{
  const p=puzzle(),state=progress();
  p.hintConstraints=[]; // Still an explicitly authored 9×9 Sudoku.
  p.rules=source.metadata.rules;
  solved(state,[0]); // R1C1 = 1
  state.cells[3].center=['1','2'];
  const hint=nextAdventureHint(p,state,4,3);
  assert.equal(hint.status,'step');
  assert.equal(hint.step.method,'peer_elimination');
  assert.equal(hint.step.cell,3);
  assert.deepEqual(hint.step.removed,[1]);
});

test('without a typed manifest decorative artwork cannot assert Boss variants',()=>{
  const p=puzzle(),state=progress();
  p.hintConstraints=[];
  state.cells[36].center=['9','2'];
  // No filled digits: only thermometers would justify a removal.
  assert.notEqual(nextAdventureHint(p,state,4,36).status,'step');
});

test('fogged enemy cells cannot act as witnesses or be hinted as targets',()=>{
  const p=puzzle(),state=progress();
  solved(state,[1]);
  state.cells[12].center=['8','3'];
  state.visible[1]=false;
  assert.notEqual(nextAdventureHint(p,state,4,12).step?.method,'anti_knight_anchors');
  state.visible[1]=true;
  state.visible[12]=false;
  assert.notEqual(nextAdventureHint(p,state,4,12).step?.method,'anti_knight_anchors');
});
