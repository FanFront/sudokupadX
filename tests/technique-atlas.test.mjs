import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTechniqueAtlas,parseTechniqueEntries} from '../src/lesson-data.js';

const markdown=readFileSync(
  new URL('../docs/sudopedia-catalog.zh-CN.md',import.meta.url),'utf8');

test('all Sudopedia technique categories are browsable offline',()=>{
  const sections=parseTechniqueAtlas(markdown);
  assert.ok(sections.length>=15);
  assert.equal(sections[0].id,1);
  assert.equal(sections[0].title.includes('Singles'),true);
  assert.ok(sections.some(section=>section.content.includes('ALS-XY-Wing')));
  assert.ok(sections.some(section=>section.content.includes('Unique Rectangle')));
  assert.ok(sections.some(section=>section.content.includes('3D Medusa')));
  assert.equal(new Set(sections.map(section=>section.id)).size,sections.length);
});

test('Sudopedia parser is safe on missing and malformed content',()=>{
  assert.deepEqual(parseTechniqueAtlas(''),[]);
  assert.deepEqual(parseTechniqueAtlas('## No numbered technique'),[]);
  assert.deepEqual(parseTechniqueAtlas('## 1. 单数技巧\n\n有解释'),[
    {id:1,title:'单数技巧',content:'有解释'}]);
});

test('Sudopedia technique index includes methods as individual entries',()=>{
  const entries=parseTechniqueEntries(markdown);
  assert.ok(entries.length>=55, 'all technique rows should be indexed');
  assert.ok(entries.some(item=>item.title.includes('Unique Rectangle')));
  assert.ok(entries.some(item=>item.title.includes('ALS-XY-Wing')));
  assert.ok(entries.some(item=>item.title.includes('3D Medusa')));
  assert.ok(entries.every(item=>item.chapterTitle&&item.description&&item.status));
  assert.equal(new Set(entries.map(entry=>entry.id)).size,entries.length);
});
