// Pure plans for one-step Hint+ and whole-board "clear red".
// Handwritten pencil marks are user input, never a solver proof.
import {buildRedNoteRemovalUpdates} from '../quick-notes.js';

export function singleMarkedCandidate(cell) {
  const marks=[...(cell?.center||[]),...(cell?.corner||[])].map(String);
  const unique=[...new Set(marks)];
  return unique.length===1 && /^[0-9A-Z]$/.test(unique[0])?unique[0]:null;
}

function editable(puzzle,progress,index) {
  return Number.isInteger(index)&&index>=0&&
    index<progress?.cells?.length&&index<puzzle?.cells?.length&&
    progress.visible?.[index]!==false&&
    puzzle.cells[index]?.given==null&&
    progress.cells[index]?.value==null;
}

function proposedUpdate(index,corner,center,forced=null,canPlaceIndex=()=>true) {
  const single=singleMarkedCandidate({corner,center});
  const value=canPlaceIndex(index)?forced??single:null;
  return value
    ?{index,corner:[],center:[],value}
    :{index,corner,center};
}

// A verified hint may eliminate several marks in its target and affected cells.
// A direct solver placement takes precedence over possibly incomplete user notes.
// A handwritten singleton can also be promoted, but only on the touched cells.
export function buildHintPlusUpdates(puzzle,progress,response,canPlaceIndex=()=>true) {
  if(response?.status!=='step'||!response.step||
     response.step.assumptionBased===true)return [];
  const step=response.step;
  const removed=new Set((step.removed||[]).map(String));
  const placement=!step.forceElimination&&
    step.method!=='search_contradiction'&&
    step.before?.length>1&&step.remaining?.length===1;
  const forced=placement?String(step.remaining[0]):null;
  const indices=[...new Set([step.cell,...(step.affectedCells||[])])];
  const updates=[];
  for(const index of indices){
    if(!editable(puzzle,progress,index))continue;
    const cell=progress.cells[index];
    const corner=(cell.corner||[]).filter(mark=>!removed.has(String(mark)));
    const center=(cell.center||[]).filter(mark=>!removed.has(String(mark)));
    const direct=index===step.cell?forced:null;
    const proposed=proposedUpdate(index,corner,center,direct,canPlaceIndex);
    if(proposed.value!=null||
       corner.length!==(cell.corner||[]).length||
       center.length!==(cell.center||[]).length)
      updates.push(proposed);
  }
  return updates;
}

// In addition to clearing every red mark, "clear red" promotes any *visible*
// playable cell with exactly one user-marked candidate, even if it had no red
// mark itself. The operation is applied atomically by the Rust session.
export function buildClearRedPlusUpdates(puzzle,progress,conflicts,canPlaceIndex=()=>true){
  if(!Array.isArray(progress?.cells)||!Array.isArray(puzzle?.cells))return [];
  const cleared=new Map(buildRedNoteRemovalUpdates(progress,conflicts)
    .map(update=>[update.index,update]));
  const updates=[];
  for(let index=0;index<progress.cells.length;index++){
    if(!editable(puzzle,progress,index))continue;
    const cell=progress.cells[index];
    const update=cleared.get(index);
    const corner=update?.corner??[...(cell.corner||[])];
    const center=update?.center??[...(cell.center||[])];
    const proposed=proposedUpdate(index,corner,center,null,canPlaceIndex);
    if(update||proposed.value!=null)updates.push(proposed);
  }
  return updates;
}
