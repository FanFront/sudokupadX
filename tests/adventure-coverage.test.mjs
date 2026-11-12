import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import LZString from 'lz-string';
import {ADVENTURE_HINT_COVERAGE,adventureHintCoverage}
  from '../src/hints/coverage.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(readFileSync(resolve(root,'public/puzzles/catalog.json'),'utf8'));
const groups=new Set([
  'digits-of-despair','lineage-of-logic',
  'super-sudokoid-1','super-sudokoid-2'
]);
// Only packaged assets have a source-fingerprint-reviewed typed hint manifest.
// Optional remote enemy puzzles are catalog links, not part of this offline pack.
const entries=catalog.items.filter(x=>groups.has(x.group)&&typeof x.file==='string');
test('every original adventure map and linked/Boss puzzle has a reviewed status',()=>{
  assert.equal(entries.length,47,'four main games, 42 authored links, plus the tutorial/prologue');
  assert.deepEqual(Object.keys(ADVENTURE_HINT_COVERAGE).sort(),
    entries.map(x=>x.id).sort());
  const counts={certified:0,partial:0};
  for(const entry of entries){
    const report=adventureHintCoverage(entry.id);
    assert.ok(report,entry.id);
    counts[report.status]++;
    if(report.status==='partial')
      assert.ok(report.unmodelled.length>0,
        'incomplete mechanics may not be silently hidden: '+entry.id);
    if(report.status==='certified'){
      assert.deepEqual(report.unmodelled,[]);
      assert.ok(existsSync(resolve(root,'public/puzzles/hint-constraints',
        entry.id+'.json')),'certified challenges must have reviewed rule manifests');
    }
  }
  assert.equal(counts.certified,14);
  assert.equal(counts.partial,33);
});
test('a certified manifest matches the exact bundled SCL source file',()=>{
  for(const entry of entries){
    if(adventureHintCoverage(entry.id)?.status!=='certified')continue;
    const raw=readFileSync(resolve(root,'public',entry.file),'utf8').trim();
    const manifest=JSON.parse(readFileSync(resolve(root,
      'public/puzzles/hint-constraints',entry.id+'.json'),'utf8'));
    const decoded=LZString.decompressFromBase64(raw.slice(3));
    const id=/["']?id["']?\s*:\s*["']([^"']+)/.exec(decoded)?.[1];
    assert.equal(manifest.sourcePuzzleId,id,entry.id);
    assert.ok(manifest.constraints.length>0,entry.id);
    let hash=0xcbf29ce484222325n;
    for(const byte of Buffer.from(raw,'utf8'))
      hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);
    const fingerprint='fnv1a-'+hash.toString(16).padStart(16,'0');
    assert.equal(manifest.sourceFingerprint,fingerprint,entry.id);
  }
});
