#!/usr/bin/env node
/**
 * Capture source SudokuPad puzzles, retaining puzzle constraints/solutions
 * verbatim. A separately reviewed zh-Hans locale is applied only at display
 * time. Existing local snapshots never require the network at build time.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import LZString from 'lz-string';
import JSON5 from 'json5';

const puzzles=[
  {id:'k4995f3fx1',url:'https://sudokupad.app/k4995f3fx1?setting-outlinesonlines=0'},
  {id:'utmh5dybvf',url:'https://sudokupad.app/utmh5dybvf?setting-digitoutlines=0'},
  {id:'mfhh567b60',url:'https://sudokupad.app/mfhh567b60'},
  {id:'k7qc98e00u',url:'https://sudokupad.app/k7qc98e00u?setting-nogrid'}
];
const directory='public/puzzles';
await mkdir(directory,{recursive:true});
const summaries={};

function normalize(text) {
  let value=text.trim().replace(/^\uFEFF/,'');
  if(value.startsWith('"')) {
    try {value=JSON.parse(value);}catch {}
  }
  if(typeof value==='string'&&value.startsWith('{')) {
    try {
      const envelope=JSON.parse(value);
      if(typeof envelope.puzzle==='string')value=envelope.puzzle;
      else if(typeof envelope.data==='string')value=envelope.data;
    }catch {}
  }
  if(typeof value!=='string'||value.length>8*1024*1024||
     !/^scl[A-Za-z0-9+/=]+$/.test(value))
    throw Error('Endpoint did not provide a bounded valid SCL package');
  const decoded=LZString.decompressFromBase64(value.slice(3));
  if(!decoded||decoded.length>32*1024*1024)throw Error('SCL decompression failed');
  const data=JSON5.parse(decoded);
  if(!Array.isArray(data.cells)&&!Array.isArray(data.ce))throw Error('Source puzzle has no cells');
  return {value,data};
}
async function download(id) {
  const endpoints=[
    'https://sudokupad.app/api/puzzle/'+id,
    'https://sudokupad.svencodes.com/ctclegacy/'+id
  ];
  const failures=[];
  for(const url of endpoints) {
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(45000),headers:{accept:'text/plain, application/json'}});
      if(!response.ok)throw Error('HTTP '+response.status);
      return normalize(await response.text());
    }catch(error){failures.push(url+': '+error.message);}
  }
  throw Error('Unable to capture '+id+'\n'+failures.join('\n'));
}
for(const game of puzzles) {
  const file=join(directory,'new-'+game.id+'.scl');
  let parsed;
  try {
    const stored=await readFile(file,'utf8');
    parsed=normalize(stored);
    console.log(game.id+': using committed offline source');
  }catch {
    parsed=await download(game.id);
    await writeFile(file,parsed.value+'\n');
    console.log(game.id+': downloaded and verified original SCL');
  }
  const data=parsed.data, meta=data.metadata||data.me||{};
  const cells=data.cells||data.ce;
  summaries[game.id]={
    url:game.url, rows:cells.length,
    cols:Math.max(0,...cells.map(row=>Array.isArray(row)?row.length:0)),
    title:meta.title||data.title||'',
    author:meta.author||'',
    rules:meta.rules||'',
    msgcorrect:meta.msgcorrect||'',
    grids:(meta.grids||[]).map(grid=>({
      title:grid.title||'',rules:grid.rules||'',author:grid.author||''
    }))
  };
  console.log(game.id+': '+summaries[game.id].rows+'x'+summaries[game.id].cols+
    ' ('+summaries[game.id].title+')');
}
await writeFile(join(directory,'new-games-source-text.json'),
  JSON.stringify(summaries,null,2)+'\n');
