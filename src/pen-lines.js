// Solver pen ink is independent of the imported puzzle artwork.
// Coordinates are half-cell units: odd/odd are cell centers, even/even are
// grid vertices, and mixed parity is a grid-edge midpoint.
export const PEN_COLORS = Object.freeze([
  '#34495e', '#d45867', '#2486b3', '#348b57', '#b77726'
]);
export const MAX_PEN_SEGMENTS = 50000;
export const MAX_PEN_MARKS = 20000;

const integer = Number.isInteger;
const sameNode = (a,b) => a && b && a[0]===b[0] && a[1]===b[1];
const nodeKey = node => node.join(',');

export function penSegmentKey(a,b) {
  const first=a[1]===b[1] ? a[0]<b[0] : a[1]<b[1];
  return (first?a:b).join(',')+'|'+(first?b:a).join(',');
}
function validMarkNode(node,rows,cols) {
  return Array.isArray(node) && node.length===2 && node.every(integer) &&
    node[0]>=0 && node[1]>=0 && node[0]<=2*cols && node[1]<=2*rows;
}
function validLineNode(node,rows,cols) {
  return validMarkNode(node,rows,cols) &&
    node[0]%2===node[1]%2 &&
    (node[0]%2===0 || (node[0]<2*cols && node[1]<2*rows));
}
function neighbors(a,b) {
  if(!a||!b || sameNode(a,b))return false;
  const dx=Math.abs(a[0]-b[0]),dy=Math.abs(a[1]-b[1]);
  return dx<=2&&dy<=2&&(dx===0||dx===2)&&(dy===0||dy===2) &&
    a[0]%2===b[0]%2 && a[1]%2===b[1]%2;
}

export function normalizePenLines(raw,rows,cols) {
  if(!Array.isArray(raw)||!integer(rows)||!integer(cols)||
      rows<1||cols<1||raw.length>MAX_PEN_SEGMENTS)
    throw Error('Invalid pen lines.');
  const map=new Map();
  for(const line of raw){
    if(!line || !validLineNode(line.a,rows,cols) ||
        !validLineNode(line.b,rows,cols) || !neighbors(line.a,line.b) ||
        !PEN_COLORS.includes(line.color))
      throw Error('Invalid pen line segment.');
    const a=[...line.a],b=[...line.b];
    map.set(penSegmentKey(a,b),{a,b,color:line.color});
  }
  return [...map.values()];
}

export function normalizePenMarks(raw,rows,cols) {
  if(!Array.isArray(raw)||!integer(rows)||!integer(cols)||
      rows<1||cols<1||raw.length>MAX_PEN_MARKS)
    throw Error('Invalid pen marks.');
  const map=new Map();
  for(const mark of raw){
    if(!mark || !validMarkNode(mark.at,rows,cols) ||
        (mark.type!=='circle' && mark.type!=='cross') ||
        !PEN_COLORS.includes(mark.color))
      throw Error('Invalid pen mark.');
    const at=[...mark.at];
    map.set(nodeKey(at),{at,type:mark.type,color:mark.color});
  }
  return [...map.values()];
}

export function penNodeAt(point,camera,cellSize,puzzle,grid='center') {
  if(!point||!puzzle||!camera||!(camera.scale>0))return null;
  const x=(point.x-camera.x)/camera.scale/cellSize;
  const y=(point.y-camera.y)/camera.scale/cellSize;
  if(!Number.isFinite(x)||!Number.isFinite(y) ||
      x<0||y<0||x>puzzle.cols||y>puzzle.rows)return null;
  if(grid==='edge')return [2*Math.round(x),2*Math.round(y)];
  if(x>=puzzle.cols||y>=puzzle.rows)return null;
  return [2*Math.floor(x)+1,2*Math.floor(y)+1];
}

// A tap on a grid line/vertex gets an X; taps inside a cell get an O.
// This is independent of the chosen drag-line grid, like SudokuPad's pen.
export function penMarkAt(point,camera,cellSize,puzzle) {
  if(!point||!puzzle||!camera||!(camera.scale>0))return null;
  const x=(point.x-camera.x)/(camera.scale*cellSize);
  const y=(point.y-camera.y)/(camera.scale*cellSize);
  if(!Number.isFinite(x)||!Number.isFinite(y) ||
     x<0||y<0||x>puzzle.cols||y>puzzle.rows)return null;
  const near=.22; // tolerance in cell widths, independent of zoom and density
  const gx=Math.round(x),gy=Math.round(y);
  const xEdge=Math.abs(x-gx)<=near;
  const yEdge=Math.abs(y-gy)<=near;
  if(xEdge&&yEdge)return [2*gx,2*gy];
  if(xEdge)return [2*gx,2*Math.floor(y)+1];
  if(yEdge)return [2*Math.floor(x)+1,2*gy];
  return [2*Math.floor(x)+1,2*Math.floor(y)+1];
}

// Tap cycles: inside cell O -> X -> clear; on grid line X -> O -> clear.
// Erase mode removes the mark immediately. Return the old array for no-op.
export function tapPenMark(before,at,color,erase=false) {
  if(!at || !PEN_COLORS.includes(color))return before;
  const index=before.findIndex(mark=>sameNode(mark.at,at));
  const previous=index<0?null:before[index];
  if(erase && !previous)return before;
  const preferred=at[0]%2===1&&at[1]%2===1?'circle':'cross';
  const nextType=erase?null:!previous?preferred:
    previous.type===preferred?(preferred==='circle'?'cross':'circle'):null;
  const next=before.filter((_,i)=>i!==index);
  if(nextType)next.push({at:[...at],type:nextType,color});
  return next;
}

// Sample fast swipes across intermediate cells, even when touchmove events
// are sparse. Pointer-up also runs this in case no final pointermove fired.
export function tracePenNodes(from,to,camera,cellSize,puzzle,grid) {
  if(!from||!to)return [];
  const step=Math.max(.5,camera.scale*cellSize/4);
  const count=Math.min(4000,Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/step)));
  const points=[];
  for(let n=1;n<=count;n++){
    const t=n/count;
    const node=penNodeAt({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t},
      camera,cellSize,puzzle,grid);
    if(!sameNode(node,points.at(-1)))points.push(node);
  }
  return points;
}

// A diagonal swipe R1C1 -> R2C2 can hit the vertical grid boundary a few
// pixels before the horizontal one and accidentally become a right-angle.
// If the sampled gesture follows the diagonal, snap the entire stroke to
// diagonal neighbor segments. Preserve deliberately bent gestures.
export function straightDiagonalPenNodes(start,end,samples,camera,cellSize,puzzle,grid) {
  const a=penNodeAt(start,camera,cellSize,puzzle,grid);
  const b=penNodeAt(end,camera,cellSize,puzzle,grid);
  if(!a||!b)return null;
  const dx=b[0]-a[0],dy=b[1]-a[1];
  if(!dx||Math.abs(dx)!==Math.abs(dy)||Math.abs(dx)%2!==0)return null;
  const vx=end.x-start.x,vy=end.y-start.y,dist=Math.hypot(vx,vy);
  if(dist<.38*camera.scale*cellSize)return null;
  const tolerance=.23*camera.scale*cellSize;
  if((samples||[]).some(p=>Math.abs((p.x-start.x)*vy-(p.y-start.y)*vx)/dist>tolerance))
    return null;
  const result=[a],sx=Math.sign(dx)*2,sy=Math.sign(dy)*2;
  for(let i=0;i<Math.abs(dx)/2;i++)
    result.push([a[0]+sx*(i+1),a[1]+sy*(i+1)]);
  return result;
}

export function createPenStroke(before,color,forceErase=false) {
  if(!PEN_COLORS.includes(color))throw Error('Unknown pen colour.');
  return {
    before,color,erase:forceErase,decided:forceErase,
    segments:new Map(before.map(line=>[penSegmentKey(line.a,line.b),line])),
    visited:new Set(),changed:false
  };
}
export function applyPenStep(stroke,a,b) {
  if(!neighbors(a,b))return false;
  const key=penSegmentKey(a,b);
  if(stroke.visited.has(key))return false;
  stroke.visited.add(key);
  if(!stroke.decided){
    stroke.erase=stroke.segments.has(key);
    stroke.decided=true;
  }
  if(stroke.erase){
    if(!stroke.segments.delete(key))return false;
  }else{
    const old=stroke.segments.get(key);
    if(old?.color===stroke.color)return false;
    stroke.segments.set(key,{a:[...a],b:[...b],color:stroke.color});
  }
  stroke.changed=true;
  return true;
}
export function penStrokeLines(stroke) {
  return [...stroke.segments.values()];
}

export function drawPenLines(ctx,lines,cellSize,clip) {
  ctx.save();
  ctx.lineCap='round';ctx.lineJoin='round';ctx.globalAlpha=.88;
  for(const line of lines){
    const x1=line.a[0]*cellSize/2,y1=line.a[1]*cellSize/2;
    const x2=line.b[0]*cellSize/2,y2=line.b[1]*cellSize/2;
    if(Math.max(x1,x2)<clip.left||Math.min(x1,x2)>clip.right ||
        Math.max(y1,y2)<clip.top||Math.min(y1,y2)>clip.bottom)continue;
    ctx.strokeStyle=line.color;
    ctx.lineWidth=line.a[0]%2===0?3.8:5;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  }
  ctx.restore();
}

export function drawPenMarks(ctx,marks,cellSize,clip) {
  ctx.save();
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const mark of marks){
    const x=mark.at[0]*cellSize/2,y=mark.at[1]*cellSize/2;
    if(x<clip.left-cellSize*.25||x>clip.right+cellSize*.25||
       y<clip.top-cellSize*.25||y>clip.bottom+cellSize*.25)continue;
    const paint=()=>{
      ctx.beginPath();
      if(mark.type==='circle'){
        ctx.arc(x,y,cellSize*.255,0,Math.PI*2);
      }else{
        const offset=cellSize*.125;
        ctx.moveTo(x-offset,y-offset);ctx.lineTo(x+offset,y+offset);
        ctx.moveTo(x-offset,y+offset);ctx.lineTo(x+offset,y-offset);
      }
      ctx.stroke();
    };
    // The light outer stroke keeps even dark user ink visible over fog.
    ctx.strokeStyle='#f7f9fb';ctx.lineWidth=6.5;paint();
    ctx.strokeStyle=mark.color;ctx.lineWidth=3.2;paint();
  }
  ctx.restore();
}
