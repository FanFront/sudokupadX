// Candidate-level chain and colouring UI, inspired by SudokuCoach's proof.js.
// Only verified solver proof nodes are drawn; these are not player pencil marks.
const validSize=size=>[4,6,9].includes(size);
const finiteInt=value=>Number.isInteger(value);
const unique=(items)=>[...new Set(items)];

export function normalizeCandidateProof(raw,size){
  if(!validSize(size)||!raw||!['chain','colour'].includes(raw.kind)||
     !Array.isArray(raw.nodes)||raw.nodes.length<2||raw.nodes.length>128)return null;
  const nodes=[];
  for(const entry of raw.nodes){
    if(!entry||!finiteInt(entry.cell)||entry.cell<0||
       entry.cell>=size*size||!finiteInt(entry.digit)||
       entry.digit<1||entry.digit>size)return null;
    const colour=entry.colour;
    if(raw.kind==='colour' && ![0,1].includes(colour))return null;
    nodes.push({cell:entry.cell,digit:entry.digit,
      ...(raw.kind==='colour'?{colour}:{})});
  }
  const links=[];
  let edges=raw.edges;
  if(edges==null && raw.kind==='chain')
    edges=nodes.slice(1).map((_,i)=>({from:i,to:i+1,strong:i%2===0}));
  if(!Array.isArray(edges)||edges.length>256)return null;
  for(const edge of edges){
    let from,to,strong;
    if(Array.isArray(edge)){
      [from,to]=edge;strong=true;
    }else if(edge){
      ({from,to,strong}=edge);
    }
    if(!finiteInt(from)||!finiteInt(to)||
       from<0||to<0||from>=nodes.length||to>=nodes.length||
       from===to||typeof strong!=='boolean')return null;
    links.push({from,to,strong});
  }
  if(!links.length)return null;
  // Validate only structural soundness here; inference soundness is certified
  // by the Rust solver / SudokuCoach source, never by this UI transformer.
  return {kind:raw.kind,nodes,edges:links};
}

export function proofLinks(proof){
  return Array.isArray(proof?.edges)?proof.edges:[];
}
export function candidatePosition(cell,digit,size,cellSize=52){
  const columns=size===4?2:3;
  const rows=Math.ceil(size/columns);
  const unitX=cellSize/columns,unitY=cellSize/rows;
  return {
    x:(cell%size)*cellSize+((digit-1)%columns+.5)*unitX,
    y:Math.floor(cell/size)*cellSize+
      (Math.floor((digit-1)/columns)+.5)*unitY
  };
}
export function describeProofLinks(proof,size){
  const valid=normalizeCandidateProof(proof,size);
  if(!valid)return [];
  const label=node=>'R'+(Math.floor(node.cell/size)+1)+
    'C'+(node.cell%size+1)+' · '+node.digit;
  return valid.edges.map(({from,to,strong})=>
    label(valid.nodes[from])+(strong?' ━ 强链接 ━ ':' ┄ 弱链接 ┄ ')+
      label(valid.nodes[to]));
}
export function proofLabel(proof){
  return proof?.kind==='colour'?'双色推理':'交替推理链';
}
export function drawProofLinks(ctx,proof,size,cellSize=52,enabled=true,visible=()=>true){
  if(!enabled)return;
  const valid=normalizeCandidateProof(proof,size);
  if(!valid)return;
  ctx.save();
  ctx.lineWidth=2.1;ctx.lineCap='round';
  for(const {from,to,strong} of valid.edges){
    const a=valid.nodes[from],b=valid.nodes[to];
    if(!visible(a.cell)||!visible(b.cell))continue;
    const start=candidatePosition(a.cell,a.digit,size,cellSize);
    const end=candidatePosition(b.cell,b.digit,size,cellSize);
    ctx.beginPath();ctx.setLineDash([]);
    ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);
    ctx.strokeStyle='rgba(255,255,255,.84)';ctx.lineWidth=4.3;ctx.stroke();
    ctx.beginPath();ctx.setLineDash(strong?[]:[5,4]);
    ctx.moveTo(start.x,start.y);ctx.lineTo(end.x,end.y);
    ctx.lineWidth=2.1;ctx.strokeStyle=strong?'#2368ab':'#794d9b';ctx.stroke();
  }
  ctx.restore();
}
export function drawProofNodes(ctx,proof,size,cellSize=52,visible=()=>true){
  const valid=normalizeCandidateProof(proof,size);
  if(!valid)return;
  ctx.save();
  ctx.font='bold '+Math.max(10,cellSize*.22)+'px sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';
  const last=valid.nodes.length-1;
  for(const [index,node] of valid.nodes.entries()){
    if(!visible(node.cell))continue;
    const p=candidatePosition(node.cell,node.digit,size,cellSize);
    const radius=cellSize*(size===4?.185:.135);
    const type=valid.kind==='colour'?
      (node.colour===0?'blue':'purple'):
      (index===0||index===last?'purple':'blue');
    ctx.beginPath();ctx.roundRect(p.x-radius,p.y-radius,2*radius,2*radius,3);
    ctx.fillStyle=type==='blue'?'#bed9f8':'#e0c7f3';ctx.fill();
    ctx.lineWidth=1.05;ctx.strokeStyle=type==='blue'?'#366a9e':'#80549a';ctx.stroke();
    ctx.fillStyle=type==='blue'?'#153753':'#46255f';
    ctx.fillText(String(node.digit),p.x,p.y+.2);
  }
  ctx.restore();
}
