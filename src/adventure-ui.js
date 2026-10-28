// Local, side-effect-free adventure rendering and navigation helpers.
export const CELL_SIZE = 52;

export function isVisible(progress, index) {
  return index >= 0 && (progress?.visible?.[index] !== false);
}

export function getSectors(puzzle, index) {
  if (!puzzle || index < 0) return [];
  return (puzzle.sectors || []).filter(sector =>
    Array.isArray(sector.cells) && sector.cells.includes(index)
  ).sort((a,b) => a.width*a.height - b.width*b.height);
}

export function getLinkedPuzzles(rules, catalog, group) {
  if (!rules || !catalog?.length) return [];
  const results = [], seen = new Set();
  const links = rules.match(/https:\/\/sudokupad\.app\/[A-Za-z0-9_/-]+/g) || [];
  for (const url of links) {
    const slug = url.split('/').pop().toLowerCase();
    const entry = catalog.find(e => e.url?.split('/').pop()?.toLowerCase() === slug);
    // A visible sector rule is the source of truth, even for cross-game links.
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    results.push(entry);
  }
  return results;
}
function point(pair) {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const [x,y] = pair.map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? [x * CELL_SIZE,y * CELL_SIZE] : null;
}
function visibleRect(clip, points) {
  if (!points.length) return false;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return !(Math.max(...xs)<clip.left || Math.min(...xs)>clip.right ||
           Math.max(...ys)<clip.top || Math.min(...ys)>clip.bottom);
}
export function drawArrows(ctx, puzzle, clip) {
  for (const arrow of puzzle.arrows||[]) {
    const points = (arrow.wayPoints||arrow.points||[]).map(point).filter(Boolean);
    if (points.length<2 || !visibleRect(clip,points)) continue;
    ctx.save();
    const thickness=Number(arrow.thickness) || 3;
    const color=arrow.color || '#8885a1';
    ctx.strokeStyle=color;ctx.fillStyle=color;
    ctx.lineWidth=Math.max(1,Math.min(15,thickness));
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(...points[0]);
    for (let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
    ctx.stroke();
    const end=points[points.length-1],prev=points[points.length-2];
    const angle=Math.atan2(end[1]-prev[1],end[0]-prev[0]);
    const size=Math.max(5,Math.min(18,(Number(arrow.headLength)||.24)*CELL_SIZE));
    ctx.beginPath();ctx.moveTo(...end);
    ctx.lineTo(end[0]-size*Math.cos(angle-.45),end[1]-size*Math.sin(angle-.45));
    ctx.lineTo(end[0]-size*Math.cos(angle+.45),end[1]-size*Math.sin(angle+.45));
    ctx.closePath();ctx.fill();ctx.restore();
  }
}
export function drawCages(ctx, puzzle, clip) {
  const size=CELL_SIZE;
  for (const cage of puzzle.cages||[]) {
    if (!Array.isArray(cage.cells) || cage.cells.length===0)continue;
    const cells=cage.cells.map(pair=>
      Array.isArray(pair)?[Number(pair[0]),Number(pair[1])]:null
    ).filter(p=>p&&p.every(Number.isFinite));
    if (!cells.length)continue;
    const set=new Set(cells.map(([row,col])=>row+','+col));
    const left=Math.min(...cells.map(c=>c[1]))*size,top=Math.min(...cells.map(c=>c[0]))*size;
    if(left>clip.right || top>clip.bottom ||
       Math.max(...cells.map(c=>c[1]))*size<clip.left ||
       Math.max(...cells.map(c=>c[0]))*size<clip.top)continue;
    ctx.save();ctx.strokeStyle=cage.outlineC||'#6d5e8b';
    ctx.lineWidth=1.4;ctx.setLineDash([4,3]);ctx.beginPath();
    const inset=3;
    for(const [r,c] of cells){
      const x=c*size,y=r*size;
      if(!set.has((r-1)+','+c)){ctx.moveTo(x+inset,y+inset);ctx.lineTo(x+size-inset,y+inset);}
      if(!set.has((r+1)+','+c)){ctx.moveTo(x+inset,y+size-inset);ctx.lineTo(x+size-inset,y+size-inset);}
      if(!set.has(r+','+(c-1))){ctx.moveTo(x+inset,y+inset);ctx.lineTo(x+inset,y+size-inset);}
      if(!set.has(r+','+(c+1))){ctx.moveTo(x+size-inset,y+inset);ctx.lineTo(x+size-inset,y+size-inset);}
    }
    ctx.stroke();ctx.setLineDash([]);
    const sum=cage.value??cage.sum;
    if(sum!==undefined&&sum!==null&&String(sum)){
      ctx.textAlign='left';ctx.textBaseline='top';ctx.font='600 10px sans-serif';
      ctx.fillStyle='#5a4c74';ctx.fillText(String(sum).slice(0,8),left+6,top+5);
    }
    ctx.restore();
  }
}
export function drawPathMarks(ctx, marks, cellSize=CELL_SIZE) {
  // SudokuMaker compact overlays may contain an SVG path string. Path2D
  // parses SVG path data but never executes JavaScript from the puzzle.
  if (typeof Path2D==='undefined') return;
  for(const mark of marks||[]){
    if(typeof mark.d2!=='string'||mark.d2.length>80_000)continue;
    try{
      const path=new Path2D(mark.d2);
      ctx.save();ctx.scale(cellSize/64,cellSize/64);
      if(mark.fill&&mark.fill!=='none'){
        ctx.fillStyle=mark.fill;ctx.fill(path);
      }
      if(mark.stroke&&mark.stroke!=='none'){
        ctx.strokeStyle=mark.stroke;
        ctx.lineWidth=Number(mark['stroke-width'])||2;
        ctx.stroke(path);
      }
      ctx.restore();
    }catch{try{ctx.restore();}catch{}}
  }
}
export function drawFog(ctx, puzzle, progress, clip) {
  if (!Array.isArray(progress?.visible)) return;
  const n=puzzle.cols,sz=CELL_SIZE;
  const r0=Math.max(0,Math.floor(clip.top/sz)),r1=Math.min(puzzle.rows,Math.ceil(clip.bottom/sz));
  const c0=Math.max(0,Math.floor(clip.left/sz)),c1=Math.min(n,Math.ceil(clip.right/sz));
  ctx.save();ctx.fillStyle='#233444';
  for(let r=r0;r<r1;r++)for(let c=c0;c<c1;c++){
    const id=r*n+c;
    if(progress.visible[id]===false) ctx.fillRect(c*sz,r*sz,sz+.25,sz+.25);
  }
  ctx.restore();
}

export function focusInitialFog(puzzle, progress, viewport) {
  if (!puzzle||!progress?.visible) return null;
  const seen=[];
  for(let i=0;i<progress.visible.length;i++)
    if(progress.visible[i]) seen.push([i%puzzle.cols,Math.floor(i/puzzle.cols)]);
  if(!seen.length || seen.length===puzzle.cells.length)return null;
  // Choose a dense visible cluster, not the centroid of disconnected hints.
  let best=seen[0],score=-1;
  for(const p of seen) {
    let count=0;
    for(const q of seen) if(Math.abs(p[0]-q[0])<=4&&Math.abs(p[1]-q[1])<=4)count++;
    if(count>score){score=count;best=p;}
  }
  const scale=Math.min(1.65,Math.max(.7,Math.min(viewport.width,viewport.height)/(CELL_SIZE*10)));
  return {
    scale,
    x:viewport.width/2-(best[0]+.5)*CELL_SIZE*scale,
    y:viewport.height/2-(best[1]+.5)*CELL_SIZE*scale
  };
}
