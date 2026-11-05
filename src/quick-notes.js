import {buildConflictHouses} from './conflicts.js';

// An automatic pencil list is only a *starting* list. Never use the answer
// grid or unverified user pencil marks to assert a logical deduction.
const sizes = new Set([4,6,9]);
function localSize(puzzle,index) {
  const rows=puzzle.rows,cols=puzzle.cols;
  if(rows===cols && sizes.has(rows))return rows;
  const row=Math.floor(index/cols),col=index%cols;
  const matching=new Set();
  for(const sector of puzzle.sectors||[]){
    const {left,top,width,height}=sector;
    if(![left,top,width,height].every(Number.isInteger) ||
       width!==height || !sizes.has(width) ||
       left<0 || top<0 || left+width>cols || top+height>rows)continue;
    if(row>=top&&row<top+height&&col>=left&&col<left+width)
      matching.add(width);
  }
  // Intersecting grids of different sizes do not have one safe digit domain.
  return matching.size===1?[...matching][0]:null;
}

export function buildCenterCandidateUpdates(puzzle,progress,houses=buildConflictHouses(puzzle)){
  if(!Array.isArray(puzzle?.cells) ||
     !Array.isArray(progress?.cells) ||
     progress.cells.length!==puzzle.cells.length)return [];
  const count=puzzle.cells.length;
  const placed=index=>{
    // Do not reveal authored digits (or player guesses) from under fog.
    if(progress.visible?.[index]===false)return null;
    return puzzle.cells[index]?.given ?? progress.cells[index]?.value ?? null;
  };
  const excluded=Array.from({length:count},()=>new Set());
  for(const house of houses){
    const seen=new Set(house.map(placed).filter(value=>value!=null&&value!=='').map(String));
    for(const index of house){
      if(index<0||index>=count)continue;
      for(const value of seen)excluded[index].add(value);
    }
  }
  const updates=[];
  for(let index=0;index<count;index++){
    const current=progress.cells[index];
    if(!current || progress.visible?.[index]===false ||
       puzzle.cells[index]?.given!=null || current.value!=null ||
       (current.center||[]).length)continue;
    const size=localSize(puzzle,index);
    if(!size)continue;
    const domain=Array.from({length:size},(_,i)=>String(i+1));
    // We do not know the symbol domain of custom alphabet/zero-based grids.
    if([...excluded[index]].some(value=>!domain.includes(value)))continue;
    const center=domain.filter(digit=>!excluded[index].has(digit));
    if(center.length)updates.push({
      index,corner:[...(current.corner||[])],center
    });
  }
  return updates;
}

// Red notes have already been identified by the same detector as the canvas.
// Do not delete unmarked pencil work or touch cells hidden by fog.
export function buildRedNoteRemovalUpdates(progress,conflicts){
  if(!Array.isArray(progress?.cells))return [];
  const updates=[];
  for(let index=0;index<progress.cells.length;index++){
    if(progress.visible?.[index]===false)continue;
    const red=conflicts?.noteSymbols?.[index];
    if(!(red instanceof Set)||red.size===0)continue;
    const current=progress.cells[index];
    if(!current)continue;
    const corner=(current.corner||[]).filter(value=>!red.has(value));
    const center=(current.center||[]).filter(value=>!red.has(value));
    if(corner.length!==current.corner?.length || center.length!==current.center?.length)
      updates.push({index,corner,center});
  }
  return updates;
}
