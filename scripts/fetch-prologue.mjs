#!/usr/bin/env node
/**
 * Capture the original Sudokuvania 2 tutorial as an immutable offline SCL.
 * This is a one-time vendor step; normal builds use the committed snapshot.
 * Run: npm run fetch:prologue [-- --refresh]
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import LZString from 'lz-string';
import JSON5 from 'json5';

const destination='public/puzzles/prologue-empty-house.scl';
const sources=[
  'https://sudokupad.svencodes.com/ctclegacy/sudokuvania/prologue-empty-house',
  'https://sudokupad.app/api/puzzle/sudokuvania/prologue-empty-house',
  // Canonical short link for the author's "Prologue: Empty House".
  'https://sudokupad.svencodes.com/ctclegacy/bqytbr5z3g',
  'https://sudokupad.app/api/puzzle/bqytbr5z3g'
];
const maxBytes=8*1024*1024;

function decodePackage(raw) {
  let value=raw.trim().replace(/^\uFEFF/,'');
  if(value.startsWith('"'))value=JSON.parse(value);
  if(typeof value==='string'&&value.startsWith('{')) {
    const envelope=JSON.parse(value);
    value=envelope.puzzle||envelope.data||value;
  }
  if(typeof value!=='string'||value.length>maxBytes||
     !/^scl[A-Za-z0-9+/=]+$/.test(value))throw Error('Not an SCL puzzle');
  const decoded=LZString.decompressFromBase64(value.slice(3));
  if(!decoded||decoded.length>32*1024*1024)throw Error('Invalid compressed SCL');

  // SudokuMaker uses compact JSON5 with optional empty list slots and colors.
  let compact='',quote='',escaped=false;
  const stack=[];
  for(let i=0;i<decoded.length;i++){
    const ch=decoded[i];
    if(quote){
      compact+=ch;
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch===quote)quote='';
      continue;
    }
    if(ch==="'"||ch==='"'){quote=ch;compact+=ch;continue;}
    if(ch==='['||ch==='{')stack.push(ch);
    if(ch===']'||ch==='}')stack.pop();
    if(ch===','&&stack.at(-1)==='['&&/[\[,]/.test(compact.trimEnd().at(-1)||''))compact+='null';
    if('tfn'.includes(ch)&&/[:,\[]/.test(compact.trimEnd().at(-1)||'')&&
       /[,}\]]/.test((decoded.slice(i+1).trimStart()[0]||''))){
      compact+=({t:'true',f:'false',n:'null'})[ch];continue;
    }
    compact+=ch;
  }
  let prepared='',q='',slash=false;
  for(let i=0;i<compact.length;i++){
    const ch=compact[i];
    if(q){
      prepared+=ch;
      if(slash)slash=false;
      else if(ch==='\\')slash=true;
      else if(ch===q)q='';
      continue;
    }
    if(ch==="'"||ch==='"'){q=ch;prepared+=ch;continue;}
    if(ch===':'){
      const match=compact.slice(i+1).match(/^(\s*)(#[0-9a-fA-F]+|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?=[,}\]\s]|$)/);
      if(match&&(match[2][0]==='#'||/[a-fA-F]/.test(match[2]))){
        prepared+=':'+match[1]+"'"+match[2]+"'";
        i+=match[0].length;continue;
      }
    }
    prepared+=ch;
  }
  const puzzle=JSON5.parse(prepared);
  const cells=puzzle.cells||puzzle.ce;
  if(!Array.isArray(cells)||!cells.length||!Array.isArray(cells[0])||
     !cells[0].length)throw Error('SCL has no grid');
  const meta=puzzle.metadata||puzzle.me||{};
  const title=String(meta.title||puzzle.title||'');
  if(!/prologue|empty house/i.test(title))
    throw Error('Unexpected puzzle title: '+title);
  return {value,rows:cells.length,cols:cells[0].length,title};
}

let existing;
try {existing=decodePackage(await readFile(destination,'utf8'));}
catch(error) {if(error.code!=='ENOENT')console.warn('Existing snapshot needs repair:',error.message);}
if(existing&&!process.argv.includes('--refresh')){
  console.log('Verified bundled '+existing.title+' ('+existing.rows+'x'+existing.cols+')');
  process.exit(0);
}

const failures=[];
for(const url of sources){
  try {
    const response=await fetch(url,{headers:{accept:'text/plain, application/json'},
      signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    if(Number(response.headers.get('content-length')||0)>maxBytes)throw Error('Too large');
    const captured=decodePackage(await response.text());
    await mkdir('public/puzzles',{recursive:true});
    await writeFile(destination,captured.value+'\n');
    console.log('Captured '+captured.title+' ('+captured.rows+'x'+captured.cols+') from '+url);
    process.exit(0);
  }catch(error){failures.push(url+': '+error.message);}
}
throw Error('Could not download original prologue:\n'+failures.join('\n'));
