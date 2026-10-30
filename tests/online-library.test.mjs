import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ONLINE_INDEX_URL, parseOnlineIndex, filterOnlineEntries,
  puzzleIdFromUrl, puzzleDownloadUrl, normalizeRemotePuzzle, fetchOnlinePuzzle
} from '../src/online-library.js';

const snapshot = JSON.parse(readFileSync(
  new URL('../public/puzzles/online-index.json',import.meta.url),'utf8'
));

test('upstream index v1 is bundled for first-launch offline searches',()=>{
  assert.equal(ONLINE_INDEX_URL,'https://stefanlobbenmeier.github.io/sudoku-index/index.json');
  assert.equal(snapshot.schemaVersion,1);
  const index=parseOnlineIndex(snapshot);
  assert.ok(index.entries.length>50,'bundled index must have real, searchable puzzles');
  assert.equal(index.generatedAt,snapshot.generatedAt);
  assert.ok(index.entries.every(entry=>entry.title && entry.id && entry.puzzleUrl));
  assert.ok(index.entries.every((entry,i,all)=>i===0 ||
    entry.publishedAt.localeCompare(all[i-1].publishedAt)<=0));
});

test('filter supports title, source, short ID, case-insensitive and offline only',()=>{
  const entries=parseOnlineIndex(snapshot).entries;
  const first=entries[0];
  assert.ok(filterOnlineEntries(entries,{search:first.title.toUpperCase()})
    .some(item=>item.id===first.id));
  assert.ok(filterOnlineEntries(entries,{search:first.sourceName.toUpperCase()})
    .some(item=>item.id===first.id));
  assert.deepEqual(filterOnlineEntries(entries,{
    offlineOnly:true,offlineIds:new Set([first.id])
  }).map(item=>item.id),[first.id]);
  assert.deepEqual(filterOnlineEntries(entries,{
    source:first.sourceId,search:first.title
  }).map(item=>item.id),[first.id]);
  assert.equal(filterOnlineEntries(entries,{search:'a-result-nobody-could-match'}).length,0);
});

test('decode short ids while rejecting malicious external URLs',()=>{
  assert.equal(puzzleIdFromUrl('https://sudokupad.app/abc123?setting-nogrid=1'),'abc123');
  assert.equal(puzzleIdFromUrl('https://sudokupad.app/philip-newman/20261027-curly-brackets'),
    'philip-newman/20261027-curly-brackets');
  assert.equal(puzzleDownloadUrl('https://sudokupad.app/abc123'),
    'https://sudokupad.svencodes.com/ctclegacy/abc123');
  assert.equal(puzzleDownloadUrl('https://sudokupad.app/path/to/puzzle'),
    'https://sudokupad.svencodes.com/ctclegacy/path/to/puzzle');
  for (const url of ['http://sudokupad.app/a','https://evil.example/abc',
    'https://sudokupad.app.evil.example/a','https://sudokupad.app/']) {
    assert.equal(puzzleIdFromUrl(url),null,url);
  }
});

test('remote SCL and JSON can pass through, but malformed formats are rejected',()=>{
  const scl=readFileSync(new URL('../public/puzzles/boss-6cn54q09sv.scl',import.meta.url),'utf8').trim();
  assert.equal(normalizeRemotePuzzle(scl),scl);
  assert.equal(normalizeRemotePuzzle(JSON.stringify(scl)),scl);
  const puzzle='{ "cells": [[{}]] }';
  assert.equal(normalizeRemotePuzzle(puzzle),puzzle);
  assert.equal(normalizeRemotePuzzle(JSON.stringify({puzzle:scl})),scl);
  assert.throws(()=>normalizeRemotePuzzle(''),/SCL|JSON/);
  assert.throws(()=>normalizeRemotePuzzle('not-a-puzzle'),/SCL|JSON/);
  assert.throws(()=>normalizeRemotePuzzle('x'.repeat(9*1024*1024)),/8 MiB/);
});

test('download helper consumes valid proxy data and rejects HTTP errors',async()=>{
  const entry={puzzleUrl:'https://sudokupad.app/test123'};
  const input='sclABC=';
  const received=[];
  const result=await fetchOnlinePuzzle(entry,async(url,options)=>{
    received.push([url,options]);
    return {ok:true,headers:{get:()=>String(input.length)},text:async()=>input};
  });
  assert.equal(result,input);
  assert.deepEqual(received,[['https://sudokupad.svencodes.com/ctclegacy/test123',
    {cache:'no-store'}]]);
  await assert.rejects(fetchOnlinePuzzle(entry,async()=>({ok:false,status:404})),/HTTP 404/);
});

test('Tauri content security policy allows only required remote puzzle hosts',()=>{
  const config=JSON.parse(readFileSync(
    new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'
  ));
  const csp=config.app.security.csp;
  assert.ok(csp.includes('connect-src'), 'Tauri must allow in-app network downloads');
  assert.ok(csp.includes('https://stefanlobbenmeier.github.io'));
  assert.ok(csp.includes('https://sudokupad.svencodes.com'));
});


test('Logic Masters native command and CSP are scoped to official puzzle pages',()=>{
  const rust=readFileSync(new URL('../src-tauri/src/lib.rs',import.meta.url),'utf8');
  const config=JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
  assert.match(rust,/async fn fetch_logic_masters_page/);
  assert.match(rust,/puzzle_id\.len\(\) != 6/);
  assert.match(rust,/redirect\(reqwest::redirect::Policy::none\(\)\)/);
  assert.match(rust,/LIMIT: usize = 1024 \* 1024/);
  assert.match(config.app.security.csp,/https:\/\/logic-masters\.de/);
});

test('Logic Masters importer controls are present in the shared web and Android UI',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  for(const id of ['lmdReference','lmdFetch','lmdPasted','lmdParsePaste','lmdResults','lmdStatus','lmdSourceLink'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(main,/sourceUrl:entry\.sourceUrl \|\| null/);
});


test('search-and-select LMD interface is present on Android and web',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const script=readFileSync(new URL('../src/online-ui.js',import.meta.url),'utf8');
  const rust=readFileSync(new URL('../src-tauri/src/lib.rs',import.meta.url),'utf8');
  for(const id of [
    'lmdLibraryTab','lmdLibraryPanel','lmdSearchForm','lmdSearch',
    'lmdSearchButton','lmdSearchResults','lmdPrev','lmdNext',
    'lmdDiscoverView','lmdSavedView','lmdDetailView',
    'lmdResults','lmdLatest','lmdSaved','lmdDiscover','lmdBack'
  ]) assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(script,/search_logic_masters/);
  assert.match(script,/parseLogicMastersSearch\(html\)/);
  assert.match(script,/selectLmdMatch\(item\)/);
  assert.match(rust,/async fn search_logic_masters\(query: String, start: u32\)/);
  assert.match(rust,/params\.append_pair\("suchtext", query\.trim\(\)\)/);
  assert.match(rust,/params\.append_pair\("skname", "x"\)/);
  assert.match(rust,/params\.append_pair\("sktext", "x"\)/);
});
