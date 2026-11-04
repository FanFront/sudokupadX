#!/usr/bin/env node
// Vite's worker and chunk URLs are not necessarily literal src/href entries
// in index.html. Cache ALL emitted assets on first install so creating puzzles
// still works offline after an APK/PWA is installed.
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join,relative,sep} from 'node:path';

const ROOT='dist',ASSETS=join(ROOT,'assets');
async function traverse(dir){
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const full=join(dir,entry.name);
    if(entry.isDirectory())out.push(...await traverse(full));
    else if(entry.isFile())out.push(relative(ROOT,full).split(sep).join('/'));
  }
  return out;
}
const worker=join(ROOT,'offline-sw.js');
const files=(await traverse(ASSETS)).sort();
const source=await readFile(worker,'utf8');
const needle='const BUILT_ASSETS = []; // __VITE_WORKER_PRECACHE__';
if(!source.includes(needle))throw Error('Service-worker precache marker missing');
await writeFile(worker,source.replace(
  needle,'const BUILT_ASSETS = '+JSON.stringify(files)+'; // __VITE_WORKER_PRECACHE__'
));
console.log('Precaching '+files.length+' browser JS/CSS and Worker assets.');
