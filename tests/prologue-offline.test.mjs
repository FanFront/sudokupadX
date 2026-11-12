import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import LZString from 'lz-string';

const root=new URL('../public/puzzles/',import.meta.url);
const index=JSON.parse(readFileSync(new URL('catalog.json',root),'utf8'));
const locale=JSON.parse(readFileSync(new URL('locale-zh.json',root),'utf8'));

test('Sudokuvania 2 prologue has the original offline SCL, not just a URL',()=>{
  const entry=index.items.find(item=>item.id==='prologue-empty-house');
  assert.ok(entry);
  assert.equal(entry.kind,'linked');
  assert.equal(entry.file,'puzzles/prologue-empty-house.scl');
  assert.match(entry.url,/sudokuvania\/prologue-empty-house/);
  assert.equal(entry.parent,'lineage-of-logic');
  assert.equal(locale['prologue-empty-house']?.title,'教程序章：空屋');
  const input=readFileSync(new URL('prologue-empty-house.scl',root),'utf8').trim();
  assert.match(input,/^scl[A-Za-z0-9+/=]+$/);
  assert.ok(input.length>500,'must contain an actual puzzle package');
  const decoded=LZString.decompressFromBase64(input.slice(3));
  assert.match(decoded,/Prologue: Empty House/i);
});
