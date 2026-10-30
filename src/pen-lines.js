// SudokuPad-style solver pen ink, independent of authored puzzle lines.
// Coordinates are half-cell units: odd/odd = cell centers, even/even = vertices.
export const PEN_COLORS = Object.freeze([
  '#34495e', '#d45867', '#2486b3', '#348b57', '#b77726'
]);
export const MAX_PEN_SEGMENTS = 50000;

const integer = Number.isInteger;
const sameNode = (a,b) => a && b && a[0]===b[0] && a[1]===b[1];

export function penSegmentKey(a,b) {
  const first=a[1]===b[1] ? a[0]<b[0] : a[1]<b[1];
  return (first?a:b).join(',')+'|'+(first?b:a).join(',');
}
function validNode(node,rows,cols) {
  if(!Array.isArray(node)||node.length!==2||!node.every(integer))return false;
  const [x,y]=node;
  if(x<0||y<0||x>2*cols||y>2*rows)return false;
  return (x%2===0 && y%2===0) ||
    (x%2===1 && y%2===1 && x<2*cols && y<2*rows);
}
function neighbors(a,b) {
  if(!a||!b || sameNode(a,b))return false;
  const dx=Math.abs(a[0]-b[0]),dy=Math.abs(a[1]-b[1]);
  return dx<=2&&dy<=2&&(dx===0||dx===2)&&(dy===0||dy===2) &&
    a[0]%2===b[0]%2 && a[1]%2===b[1]%2;
}

// Reject damaged or foreign ink rather than drawing arbitrary off-board paths.
export function normalizePenLines(raw,rows,cols) {
  if(!Array.isArray(raw)||!integer(rows)||!integer(cols)||
      rows<1||cols<1||raw.length>MAX_PEN_SEGMENTS)
    throw Error('Invalid pen lines.');
  const map=new Map();
  for(const line of raw){
    if(!line || !validNode(line.a,rows,cols) ||
        !validNode(line.b,rows,cols) || !neighbors(line.a,line.b) ||
        !PEN_COLORS.includes(line.color))
      throw Error('Invalid pen line segment.');
    const a=[...line.a],b=[...line.b];
    map.set(penSegmentKey(a,b),{a,b,color:line.color});
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

// Sample screen movement at sub-cell intervals, so fast swipes do not jump over
// the cells between pointer events (at any zoom level).
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

export function createPenStroke(before,color,forceErase=false) {
  if(!PEN_COLORS.includes(color))throw Error('Unknown pen colour.');
  return {
    before,
    color,
    erase:forceErase,
    decided:forceErase,
    segments:new Map(before.map(line=>[penSegmentKey(line.a,line.b),line])),
    visited:new Set(),
    changed:false
  };
}
// Retracing an existing first segment erases it; the remainder of that same
// stroke also erases. Explicit eraser always removes rather than recolouring.
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
  ctx.lineCap='round';
  ctx.lineJoin='round';
  ctx.globalAlpha=.88;
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
