#!/usr/bin/env node
// Regenerate the paste-ready EdgeOne function from the validated Worker.
import {readFile,writeFile} from 'node:fs/promises';

const input=await readFile(new URL('../worker/remote-proxy.js',import.meta.url),'utf8');
const end=input.indexOf('export default {');
if(end===-1||!input.includes('export async function handleRequest'))
  throw Error('Cloudflare Worker layout changed; update EdgeOne adapter manually');
const body=input.slice(0,end).replace(/^export /gm,'').replace(
  /\n\s*cf:\{cacheTtl:0\}/,''
);
const header=[
  '// Tencent EdgeOne Edge Functions (independent/no-domain site) deployment.',
  '// Self-contained, paste directly in EdgeOne\'s Edge Function editor.',
  '// Generated from worker/remote-proxy.js; keep API and security policy in sync.',
  '// A mainland-China client gets Content-Disposition: attachment on EdgeOne\'s',
  '// default function domain. Fetch/XHR may still read the response if CORS passes;',
  '// this MUST be verified from a real mainland-China client before public rollout.'
].join('\n')+'\n';
const footer=[
  "addEventListener('fetch', event => {",
  "  const settings=typeof env==='undefined' ? {} : env;",
  "  event.respondWith(handleRequest(event.request,settings,fetch));",
  "});"
].join('\n')+'\n';
const output=header+body+'\n'+footer;
await writeFile(new URL('../worker/edgeone-default-domain.js',import.meta.url),output);
console.log('Updated standalone EdgeOne Edge Function ('+output.length+' characters).');
