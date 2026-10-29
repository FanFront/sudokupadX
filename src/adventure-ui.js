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
// SudokuPad/SudokuMaker geometry uses [row, column], unlike Canvas [x, y].
export function puzzlePoint(pair) {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const [row,col] = pair.map(Number);
  return Number.isFinite(row) && Number.isFinite(col)
    ? [col * CELL_SIZE,row * CELL_SIZE] : null;
}
function visibleRect(clip, points) {
  if (!points.length) return false;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  return !(Math.max(...xs)<clip.left || Math.min(...xs)>clip.right ||
           Math.max(...ys)<clip.top || Math.min(...ys)>clip.bottom);
}
export function drawArrows(ctx, puzzle, clip) {
  for (const arrow of puzzle.arrows||[]) {
    const points = (arrow.wayPoints||arrow.points||[]).map(puzzlePoint).filter(Boolean);
    if (points.length<2 || !visibleRect(clip,points)) continue;
    ctx.save();
    const thickness=Number(arrow.thickness) || 3;
    const color=arrow.color || '#8885a1';
    ctx.strokeStyle=color;ctx.fillStyle=color;
    ctx.lineWidth=Math.max(.5,Math.min(CELL_SIZE,thickness*CELL_SIZE/64));
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(...points[0]);
    for (let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
    ctx.stroke();
    const end=points[points.length-1],prev=points[points.length-2];
    const angle=Math.atan2(end[1]-prev[1],end[0]-prev[0]);
    const size=Math.max(3,Math.min(CELL_SIZE,(Number(arrow.headLength)||.24)*CELL_SIZE));
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

function textOf(mark) {
  const value=mark?.text;
  return (typeof value==='string'||typeof value==='number') ? String(value) : '';
}

/** Draw original SudokuMaker overlay/underlay geometry with its row/column coordinates. */
export function drawDecorations(ctx, marks, clip) {
  for(const mark of marks||[]) {
    if(!mark || typeof mark!=='object') continue;
    const center=puzzlePoint(mark.center);
    if(!center) continue;
    const width=Math.max(0,Number(mark.width)||0)*CELL_SIZE;
    const height=Math.max(0,Number(mark.height)||0)*CELL_SIZE;
    if(width>CELL_SIZE*200||height>CELL_SIZE*200)continue;
    const content=textOf(mark),lines=content.split('\n');
    const explicitSize=Number(mark.fontSize);
    const fontSize=Number.isFinite(explicitSize)&&explicitSize>0
      ? Math.max(2,Math.min(420,explicitSize*CELL_SIZE/64))
      : Math.max(2,Math.min(CELL_SIZE*.65,height>0?height*.8:19*CELL_SIZE/64));
    // Width is frequently zero for free-floating text. In that case SudokuPad
    // doesn't constrain the line to the width of a single cell.
    const textSpan=content ? (width||Math.min(CELL_SIZE*50,
      Math.max(CELL_SIZE*.5,Math.max(...lines.map(line=>Array.from(line).length))*fontSize))) : 0;
    const halfX=Math.max(width,textSpan)/2;
    const halfY=Math.max(height,content?lines.length*fontSize*1.2:0)/2;
    if(center[0]+halfX<clip.left||center[0]-halfX>clip.right||
       center[1]+halfY<clip.top||center[1]-halfY>clip.bottom)continue;
    const x=center[0]-width/2,y=center[1]-height/2;
    ctx.save();
    const angle=Number(mark.angle)||0;
    if(angle) {
      ctx.translate(...center);
      ctx.rotate(angle*Math.PI/180);
      ctx.translate(-center[0],-center[1]);
    }
    if(width>0&&height>0) {
      const background=mark.backgroundColor;
      const border=mark.borderColor;
      if((background&&background!=='none'&&background!=='transparent')||border) {
        ctx.beginPath();
        if(mark.rounded&&typeof ctx.roundRect==='function')
          ctx.roundRect(x,y,width,height,Math.min(width,height)/2);
        else ctx.rect(x,y,width,height);
        if(typeof background==='string'&&background!=='none'&&background!=='transparent') {
          ctx.fillStyle=background;
          ctx.fill();
        }
        if(typeof border==='string'&&border!=='none'&&border!=='transparent') {
          ctx.strokeStyle=border;
          ctx.lineWidth=Math.max(.5,(Number(mark.thickness)||Number(mark.borderSize)||1)*CELL_SIZE/64);
          ctx.stroke();
        }
      }
    }
    if(content) {
      ctx.font='400 '+fontSize+'px system-ui, sans-serif';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.fillStyle=mark.textColor||mark.color||'#172534';
      const stroke=mark.stroke,strokeWidth=Number(mark['stroke-width']);
      for(let i=0;i<lines.length;i++) {
        const yy=center[1]+(i-(lines.length-1)/2)*fontSize*1.08;
        if(typeof stroke==='string'&&stroke!=='none'&&typeof ctx.strokeText==='function') {
          ctx.strokeStyle=stroke;
          ctx.lineWidth=Math.max(.5,(strokeWidth||1)*CELL_SIZE/64);
          ctx.lineJoin='round';
          if(width>0)ctx.strokeText(lines[i],center[0],yy,width);
          else ctx.strokeText(lines[i],center[0],yy);
        }
        if(width>0)ctx.fillText(lines[i],center[0],yy,width);
        else ctx.fillText(lines[i],center[0],yy);
      }
    }
    ctx.restore();
  }
}

/** Paint source lines in their intended layer, respecting [row, column]. */
export function drawPuzzleLines(ctx, lines, clip, layer='normal') {
  for(const line of lines||[]) {
    if(!line||typeof line!=='object')continue;
    const target=line.target||'';
    if(layer==='overlay'?target!=='overlay'
       :layer==='underlay'?target!=='underlay'
       :target==='overlay'||target==='underlay')continue;
    const points=(line.wayPoints||line.points||[]).map(puzzlePoint).filter(Boolean);
    if(points.length<2||!visibleRect(clip,points))continue;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);
    ctx.strokeStyle=line.color||'#657a8d';
    ctx.lineWidth=Math.max(.5,Math.min(CELL_SIZE,(Number(line.thickness)||3)*CELL_SIZE/64));
    ctx.lineCap='round';
    ctx.lineJoin='round';
    const dash=line['stroke-dasharray'];
    if(dash&&typeof ctx.setLineDash==='function') {
      const values=String(dash).split(/[ ,]+/).map(Number).filter(n=>Number.isFinite(n)&&n>=0);
      if(values.length)ctx.setLineDash(values.map(n=>n*CELL_SIZE/64));
    }
    ctx.stroke();
    ctx.restore();
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
