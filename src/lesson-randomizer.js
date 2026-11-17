// Produce new playable Sudoku lesson boards by applying bijections to an
// independently verified fixture. This is deliberately NOT a new proof:
// each elimination, givens, solution and every graphical rule move together.
// Variant geometry is only reflected / transposed; arbitrary row swaps or
// digit changes would break connected lines, arrows and cage sums.
const range=n=>Array.from({length:n},(_,i)=>i);
function shuffled(values,random){
  const out=[...values];
  for(let i=out.length-1;i>0;i--){
    const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));
    [out[i],out[j]]=[out[j],out[i]];
  }
  return out;
}
function housePermutation(n,blockSize,random){
  const groups=n/blockSize;
  const groupOrder=shuffled(range(groups),random);
  const result=range(n);
  for(let g=0;g<groups;g++){
    const positions=shuffled(range(blockSize),random);
    for(let i=0;i<blockSize;i++)
      result[g*blockSize+i]=groupOrder[g]*blockSize+positions[i];
  }
  return result;
}
const copy=object=>JSON.parse(JSON.stringify(object));
const indexOf=(n,[r,c])=>r*n+c;

export function randomizeLessonFixture(original,random=Math.random){
  if(typeof random!=='function')throw TypeError('随机数源必须是函数');
  const item=copy(original),n=item.n;
  if(![4,6,9].includes(n))throw Error('不支持的课程棋盘尺寸');
  const h=n===6?2:Math.sqrt(n),w=n===6?3:Math.sqrt(n);
  const puzzle=item.puzzle;
  const variant=Boolean(['cages','lines','arrows','overlays','underlays']
    .some(key=>puzzle[key]?.length)||puzzle.metadata?.solverRules?.length);
  const reverseRows=random()<0.5,reverseCols=random()<0.5;
  const swapAxes=h===w && random()<0.5;
  const rows=variant?(reverseRows?range(n).reverse():range(n)):
    housePermutation(n,h,random);
  const cols=variant?(reverseCols?range(n).reverse():range(n)):
    housePermutation(n,w,random);
  // No digit permutation for variants: even the 9x9 digit complement can
  // invalidate an arrow/cage or a modular/entropic group constraint.
  const digitOrder=variant?range(n).map(i=>i+1):shuffled(range(n).map(i=>i+1),random);
  const translate=number=>digitOrder[Number(number)-1];
  const cellAt=(r,c)=>{
    const rr=rows[r],cc=cols[c];
    return swapAxes?[cc,rr]:[rr,cc];
  };
  const remap=index=>indexOf(n,cellAt(Math.floor(index/n),index%n));
  const transformPoint=([r,c])=>{
    // Render geometry stores coordinates in grid units; center=0.5.
    const rr=reverseRows?n-r:r,cc=reverseCols?n-c:c;
    return swapAxes?[cc,rr]:[rr,cc];
  };
  const remapCoords=cells=>cells.map(([r,c])=>cellAt(r,c));
  const cells=Array.from({length:n},()=>Array.from({length:n},()=>({})));
  const masks=Array.from({length:n*n},()=>[]);
  for(let index=0;index<n*n;index++){
    const target=remap(index),[rr,cc]=[Math.floor(target/n),target%n];
    cells[rr][cc]=copy(puzzle.cells[Math.floor(index/n)][index%n]);
    if(cells[rr][cc].value)cells[rr][cc].value=String(translate(cells[rr][cc].value));
    masks[target]=item.masks[index].map(translate).sort((a,b)=>a-b);
  }
  puzzle.cells=cells;
  puzzle.regions=puzzle.regions.map(remapCoords);
  for(const cage of puzzle.cages||[])cage.cells=remapCoords(cage.cells);
  for(const line of [...(puzzle.lines||[]),...(puzzle.arrows||[])])
    if(line.wayPoints)line.wayPoints=line.wayPoints.map(transformPoint);
  for(const mark of [...(puzzle.overlays||[]),...(puzzle.underlays||[])])
    if(mark.center)mark.center=transformPoint(mark.center);
  if(Array.isArray(puzzle.metadata?.solverRules)){
    puzzle.metadata.solverRules=puzzle.metadata.solverRules.map(rule=>({
      ...rule,cells:rule.cells?.map(remap)
    }));
  }
  const solution=Array.from({length:n*n},()=>0);
  for(let index=0;index<n*n;index++)
    solution[remap(index)]=translate(puzzle.metadata.solution[index]);
  puzzle.metadata.solution=solution.join('');
  item.masks=masks;
  item.goal.index=remap(item.goal.index);
  item.goal.digit=String(translate(item.goal.digit));
  item.focus=[...new Set(item.focus.map(remap))].sort((a,b)=>a-b);
  item.proof.removed=item.proof.removed.map(translate).sort((a,b)=>a-b);
  item.proof.remaining=item.proof.remaining.map(translate).sort((a,b)=>a-b);
  // The original machine-readable source indices are in the original grid.
  // Suppress them rather than offering misleading coordinates after rotation.
  item.proof.source={transformed:true,
    note:'推理来源的格子和数字已随训练棋盘作同构变换',
    originalMethod:item.proof.method};
  item.randomized=true;
  return item;
}
