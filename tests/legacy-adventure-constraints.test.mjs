import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import LZString from 'lz-string';
import {typedConstraints} from '../src/hints/constraint-data.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const names=[
  ['digits-of-despair',56],
  ['lineage-of-logic',10],
  ['super-sudokoid-1',121],
  ['super-sudokoid-2',169]
];
const load=name=>{
  const scl=readFileSync(resolve(root,'public/puzzles',name+'.scl'),'utf8').trim();
  const source=JSON.parse(LZString.decompressFromBase64(scl.slice(3)));
  const manifest=JSON.parse(readFileSync(resolve(root,'public/puzzles/hint-constraints',name+'.json'),'utf8'));
  return {source,manifest};
};

test('four original adventure SCLs have reproducible pinned, solution-audited manifests',()=>{
  const command=spawnSync(process.execPath,
    ['scripts/build-legacy-adventure-constraints.mjs','--check'],
    {cwd:root,encoding:'utf8'});
  assert.equal(command.status,0,command.stderr||command.stdout);
  for(const [name,count] of names){
    const {source,manifest}=load(name);
    assert.equal(manifest.sourcePuzzleId,source.id,name);
    assert.deepEqual(manifest.sourceDimensions,
      [source.cells.length,source.cells[0].length],name);
    assert.equal(manifest.constraints.length,count,name);
    assert.equal(manifest.audit.accepted,count,name);
    assert.ok(manifest.audit.rejectedCandidates>=0,name);
  }
});

test('all authored variant manifests are available to the typed-only runtime',()=>{
  for(const [name,count] of names){
    const {source,manifest}=load(name);
    const rows=source.cells.length,cols=source.cells[0].length;
    const visible=Array(rows*cols).fill(true);
    const puzzle={rows,cols,hintConstraints:manifest.constraints,
      lines:source.lines,cages:source.cages,overlays:source.overlays,
      arrows:source.arrows};
    const rules=typedConstraints(puzzle,{visible});
    assert.equal(rules.length,count,name);
    for(const rule of rules){
      assert.ok(rule.cells.length>1,name);
      assert.ok(rule.cells.every(i=>i>=0&&i<rows*cols),name);
    }
    // Art style is no longer read by the hint compiler.
    const recolored={...puzzle,lines:[],cages:[],overlays:[],arrows:[]};
    assert.deepEqual(typedConstraints(recolored,{visible}),rules,name);
  }
});

test('legacy rules remain unavailable while their unlock or target cells are fogged',()=>{
  for(const [name] of names){
    const {source,manifest}=load(name);
    const rows=source.cells.length,cols=source.cells[0].length;
    const puzzle={rows,cols,hintConstraints:manifest.constraints};
    const first=manifest.constraints[0];
    const visible=Array(rows*cols).fill(false);
    assert.deepEqual(typedConstraints(puzzle,{visible}),[],name);
    for(const cell of first.cells)visible[cell]=true;
    assert.deepEqual(typedConstraints(puzzle,{visible}),[],name);
    const unlock=first.unlockCells[0];
    visible[unlock[0]*cols+unlock[1]]=true;
    const typed=typedConstraints(puzzle,{visible});
    assert.ok(typed.some(rule=>rule.cells.join(',')===first.cells.join(',')&&
      rule.type===first.type),name);
  }
});

test('every rule records its exact original artwork index for review',()=>{
  for(const [name] of names){
    const {source,manifest}=load(name);
    const seen=new Set();
    for(const rule of manifest.constraints){
      const key=rule.sourceKind+'#'+rule.sourceIndex;
      assert.ok(!seen.has(key),name+' duplicate '+key);
      seen.add(key);
      const original=source[rule.sourceKind]?.[rule.sourceIndex];
      assert.ok(original,name+' missing '+key);
      if(rule.type==='killer'){
        assert.equal(original.unique,true);
        assert.equal(Number(original.value),rule.sum);
      }
      if(rule.type==='kropki')assert.ok(original.center);
      if(['whisper','thermo','reverse_thermo'].includes(rule.type))
        assert.ok(Array.isArray(original.wayPoints));
    }
  }
});
