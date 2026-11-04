import test from 'node:test';
import assert from 'node:assert/strict';
import {filterBundledEntries, bundledEntrySubtitle,
  GENERATED_9X9_GROUP} from '../src/bundled-library.js';

const sample = [
  {id: 'adventure', title: '冒险地图', kind: 'main', group: 'adventure'},
  {id: 'boss', title: '隐藏首领', kind: 'boss', group: 'adventure'},
  {id: 'classic', title: '独立谜题', kind: 'standalone', group: 'workshop'},
  ...Array.from({length:100},(_,i)=>({
    id: GENERATED_9X9_GROUP+'-'+String(i+1).padStart(3,'0'),
    title:'九宫逻辑工坊 · 第 '+String(i+1).padStart(3,'0')+' 题',
    kind:'standalone',group:GENERATED_9X9_GROUP,
    tier:(i%4)+1,
    file:'puzzles/batch9/generated-9x9-'+String(i+1).padStart(3,'0')+'.json'
  }))
];

test('all 100 generated Sudoku entries are discoverable without spoilers',()=>{
  const results=filterBundledEntries(sample,{category:'generated'});
  assert.equal(results.length,100);
  assert.equal(new Set(results.map(e=>e.id)).size,100);
  assert.equal(results[0].id,'generated-9x9-001');
  assert.equal(results.at(-1).id,'generated-9x9-100');
  assert.match(bundledEntrySubtitle(results[0]),/技巧等级 1/);
  assert.match(bundledEntrySubtitle(results[3]),/技巧等级 4/);
});

test('category filters preserve adventure and other bundled puzzles',()=>{
  assert.deepEqual(filterBundledEntries(sample,{category:'adventure'}).map(x=>x.id),['adventure']);
  assert.deepEqual(filterBundledEntries(sample,{category:'other'}).map(x=>x.id),['classic']);
  assert.equal(filterBundledEntries(sample).length,102);
  assert.equal(filterBundledEntries(sample,{showLinked:true}).length,103);
});

test('generated 9x9 collection supports search by title, id, tier',()=>{
  assert.deepEqual(filterBundledEntries(sample,{category:'generated',query:'第 042 题'})
    .map(x=>x.id), ['generated-9x9-042']);
  assert.deepEqual(filterBundledEntries(sample,{category:'generated',query:'generated-9x9-100'})
    .map(x=>x.id), ['generated-9x9-100']);
  assert.ok(filterBundledEntries(sample,{category:'generated',query:'4'})
    .some(x=>x.tier===4));
});
