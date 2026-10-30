import {normalizePenLines} from './pen-lines.js';

// Portable checkpoint shared with FanFront/sodokupadAndroid.
// This is a board snapshot, not a SudokuPad replay or a puzzle definition.
export const CHECKPOINT_FORMAT = 'sudokupadx-checkpoint';
export const CHECKPOINT_VERSION = 1;
export const CHECKPOINT_LIMIT = 8 * 1024 * 1024;
export const PALETTE = ['#f8cd75','#a9d9a1','#9fcbff','#e9b0d6','#bfb5fa'];

export function puzzleSlug(url) {
  if(typeof url!=='string'||!url) return '';
  try {
    const uri=new URL(url);
    return uri.hostname.toLowerCase()==='sudokupad.app'
      ? uri.pathname.replace(/\/$/,'').split('/').pop().toLowerCase() : '';
  }catch{return '';}
}
const givensOf = puzzle => puzzle.cells.map(cell =>
  cell.given===undefined||cell.given===null||cell.given===''?null:String(cell.given).toUpperCase()
);
function normalizeCell(cell) {
  if(!cell||typeof cell!=='object'||Array.isArray(cell))throw Error('Invalid saved cell.');
  const symbol = v => {
    if(v===null||v===undefined||v==='')return null;
    if(typeof v!=='string'&&!Number.isInteger(v))throw Error('Invalid cell value.');
    const n=String(v).toUpperCase();
    if(!/^[0-9A-Z]$/.test(n))throw Error('Invalid cell symbol.');
    return n;
  };
  const marks = list => {
    if(!Array.isArray(list)||list.length>26)throw Error('Invalid pencil marks.');
    const values=list.map(symbol);
    if(values.some(v=>v===null)||new Set(values).size!==values.length)throw Error('Invalid pencil mark.');
    return values.sort();
  };
  const color = cell.color===undefined?null:cell.color;
  if(color!==null&&(!PALETTE.includes(color)))throw Error('Unsupported checkpoint colour.');
  return {value:symbol(cell.value),center:marks(cell.center||[]),corner:marks(cell.corner||[]),color};
}
export function createCheckpoint(puzzle, entry, progress, penLines = []) {
  if(!puzzle||!Array.isArray(progress?.cells))throw Error('No active puzzle to export.');
  const cells=progress.cells.map(normalizeCell);
  const lines=normalizePenLines(penLines,puzzle.rows,puzzle.cols);
  if(cells.length!==puzzle.cells.length)throw Error('Puzzle and checkpoint have different dimensions.');
  return {
    format:CHECKPOINT_FORMAT,version:CHECKPOINT_VERSION,
    source:'sudokupadx', exportedAt:new Date().toISOString(),
    puzzleId:entry?.id||null, sourceUrl:entry?.url||null,
    key:puzzle.key, title:puzzle.title, rows:puzzle.rows, cols:puzzle.cols,
    givens:givensOf(puzzle),cells,penLines:lines
  };
}
export function inspectCheckpoint(raw) {
  if(typeof raw!=='string'||raw.length>CHECKPOINT_LIMIT)throw Error('Checkpoint file exceeds 8 MiB.');
  let cp;
  try {cp=JSON.parse(raw);}catch{throw Error('Invalid checkpoint JSON.');}
  if(!cp||typeof cp!=='object'||cp.format!==CHECKPOINT_FORMAT||
     cp.version!==CHECKPOINT_VERSION)throw Error('Unsupported checkpoint format/version.');
  if(!Number.isInteger(cp.rows)||!Number.isInteger(cp.cols)||
     cp.rows<1||cp.cols<1||cp.rows*cp.cols>10000)throw Error('Invalid puzzle dimensions.');
  if(!Array.isArray(cp.givens)||cp.givens.length!==cp.rows*cp.cols||
     !Array.isArray(cp.cells)||cp.cells.length!==cp.givens.length)
    throw Error('Incomplete checkpoint grid.');
  if(typeof cp.puzzleId!=='string'&&cp.puzzleId!==null&&cp.puzzleId!==undefined)
    throw Error('Invalid checkpoint puzzle ID.');
  if(typeof cp.sourceUrl!=='string'&&cp.sourceUrl!==null&&cp.sourceUrl!==undefined)
    throw Error('Invalid checkpoint puzzle URL.');
  const givens=cp.givens.map(v=>{
    if(v===null||v==='')return null;
    const s=String(v).toUpperCase();
    if(!/^[0-9A-Z]$/.test(s))throw Error('Invalid checkpoint givens.');
    return s;
  });
  const cells=cp.cells.map(normalizeCell);
  const penLines=normalizePenLines(cp.penLines??[],cp.rows,cp.cols);
  return {...cp,givens,cells,penLines};
}
export function verifyCheckpoint(cp,puzzle,entry) {
  if(cp.rows!==puzzle.rows||cp.cols!==puzzle.cols)throw Error('Checkpoint board dimensions do not match.');
  const targetGivens=givensOf(puzzle);
  if(targetGivens.some((v,i)=>v!==cp.givens[i]))
    throw Error('Checkpoint givens differ from this puzzle. No progress was overwritten.');
  const sourceSlug=puzzleSlug(cp.sourceUrl),targetSlug=puzzleSlug(entry?.url);
  if(sourceSlug&&targetSlug&&sourceSlug!==targetSlug)
    throw Error('Checkpoint belongs to another SudokuPad puzzle.');
  if(!sourceSlug&&!targetSlug&&cp.key&&cp.key!==puzzle.key)
    throw Error('Checkpoint puzzle key differs from the current puzzle.');
  return cp.cells;
}
export function matchingCatalogEntry(cp,catalog) {
  const slug=puzzleSlug(cp.sourceUrl);
  if(slug) return catalog.find(entry=>puzzleSlug(entry.url)===slug)||null;
  return cp.puzzleId?catalog.find(entry=>entry.id===cp.puzzleId)||null:null;
}
