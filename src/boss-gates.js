// Opt-in progression for procedurally generated adventures only.
// Regular SudokuPad/Sudokuvania fog and editing semantics stay unchanged.

function validLink(link) {
  return link && typeof link.bossId==='string' &&
    /^[a-z0-9-]{1,128}$/.test(link.bossId) &&
    typeof link.parent==='string' && /^[a-z0-9-]{1,128}$/.test(link.parent) &&
    Number.isSafeInteger(link.seed);
}

function completionKey(link) {
  if(!validLink(link))return null;
  // A new structural/solution design invalidates old boss completions.
  // V3 embeds the reward in the Sudoku and cannot reuse v1/v2 clears.
  const version=link.rewardVersion===3?'v3':link.rewardVersion===2?'v2':'v1';
  return 'sudokupadx:boss-cleared:'+version+':'+link.parent+':'+link.seed+':'+link.bossId;
}

function gateLink(puzzle,gate) {
  if(!puzzle || !gate || typeof gate.bossId!=='string')return null;
  return {parent:puzzle.key,bossId:gate.bossId,seed:gate.seed,
    rewardVersion:gate.rewardVersion};
}

export function markBossCleared(puzzle,progress,storage) {
  if(!progress?.solved)return false;
  const key=completionKey(puzzle?.bossLink);
  if(!key)return false;
  try {storage.setItem(key,'1');return true;}
  catch {return false;}
}

export function isBossCleared(puzzle,gate,storage) {
  const key=completionKey(gateLink(puzzle,gate));
  if(!key)return false;
  try {return storage.getItem(key)==='1';}
  catch {return false;}
}

function indexAt(puzzle,pair) {
  if(!Array.isArray(pair)||pair.length!==2)return -1;
  const [r,c]=pair;
  if(!Number.isInteger(r)||!Number.isInteger(c)||r<0||c<0||
     r>=puzzle.rows||c>=puzzle.cols)return -1;
  return r*puzzle.cols+c;
}

export function bossGateAt(puzzle,index) {
  if(!puzzle || !Array.isArray(puzzle.bossGates))return null;
  return puzzle.bossGates.find(gate=>indexAt(puzzle,gate.cell)===index) ?? null;
}

export function lockedBossGate(puzzle,index,storage) {
  const gate=bossGateAt(puzzle,index);
  return Boolean(gate&&!isBossCleared(puzzle,gate,storage));
}

/** Apply map visibility AFTER Rust restores/recomputes its standard fog.
 * Reveals are cumulative within one snapshot but contingent on every
 * preceding boss completion and correctly entered gate value. The gate
 * belongs to the Sudoku, but remains logically ambiguous even after
 * all overlapping cells are given. The boss supplies the missing digit.
 */
export function applyBossReveals(puzzle,progress,storage) {
  if(!puzzle||!progress||!Array.isArray(progress.visible)||
     !Array.isArray(puzzle.bossGates)||!puzzle.bossGates.length)return progress;
  const visible=[...progress.visible];
  for(const gate of puzzle.bossGates){
    const index=indexAt(puzzle,gate.cell);
    if(index<0 || !visible[index] || !isBossCleared(puzzle,gate,storage) ||
       !/^[1-9]$/.test(String(gate.reward??'')) ||
       String(progress.cells?.[index]?.value ??
         puzzle.cells?.[index]?.given ?? '')!==String(gate.reward))break;
    for(const point of gate.reveals||[]){
      const target=indexAt(puzzle,point);
      if(target>=0)visible[target]=true;
    }
  }
  progress.visible=visible;
  return progress;
}
