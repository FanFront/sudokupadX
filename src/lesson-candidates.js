// Canonical pencil marks for lesson practice. The proof fixture is an
// intermediate solver state, but a learner must never start with candidates
// that visibly contradict printed givens in a row, column or box.
const boxShape=n=>n===6?[2,3]:[Math.sqrt(n),Math.sqrt(n)];

export function legalGivenCandidates(puzzle){
  const n=puzzle.cells?.length;
  if(![4,6,9].includes(n)||puzzle.cells.some(row=>row.length!==n))
    throw Error('课程棋盘尺寸不正确');
  const [h,w]=boxShape(n);
  const givens=puzzle.cells.flat().map(cell=>cell?.value?Number(cell.value):0);
  const all=Array.from({length:n*n},(_,index)=>{
    const value=givens[index];
    if(value&&!Number.isInteger(value))throw Error('课程提示数不是整数');
    if(value&&(value<1||value>n))throw Error('课程提示数超出范围');
    const r=Math.floor(index/n),c=index%n;
    const peer=new Set();
    for(let j=0;j<n;j++){
      if(j!==c)peer.add(r*n+j);
      if(j!==r)peer.add(j*n+c);
    }
    for(let rr=Math.floor(r/h)*h;rr<Math.floor(r/h)*h+h;rr++)
      for(let cc=Math.floor(c/w)*w;cc<Math.floor(c/w)*w+w;cc++)
        if(rr*n+cc!==index)peer.add(rr*n+cc);
    if(value){
      if([...peer].some(j=>givens[j]===value))
        throw Error('课程提示数字在行、列或宫中重复');
      return [value];
    }
    const excluded=new Set([...peer].map(j=>givens[j]).filter(Boolean));
    return Array.from({length:n},(_,j)=>j+1).filter(d=>!excluded.has(d));
  });
  return all;
}

export function normalizeLessonCandidates(fixture){
  const puzzle=fixture.puzzle,n=fixture.n;
  const masks=fixture.masks,legal=legalGivenCandidates(puzzle);
  if(masks?.length!==n*n)throw Error('课程候选数数量错误');
  const target=fixture.goal.index;
  const isPeerLesson=fixture.method==='peer_elimination' &&
    fixture.goal.kind==='remove';
  const normalized=masks.map((values,index)=>{
    const given=puzzle.cells[Math.floor(index/n)][index%n].value;
    if(!Array.isArray(values)||!values.every(v=>Number.isInteger(v)&&v>=1&&v<=n))
      throw Error('课程候选数格式错误');
    if(given){
      if(values.length!==1||values[0]!==Number(given))
        throw Error('课程提示数字与推理轨迹不一致');
      return [Number(given)];
    }
    const possible=new Set(legal[index]);
    // Peer elimination is the one lesson whose task is *precisely* to
    // remove a note that conflicts with a printed given. Keep only that
    // target candidate as an explicitly pending correction.
    if(index===target&&isPeerLesson)possible.add(Number(fixture.goal.digit));
    const out=[...new Set(values)].filter(v=>possible.has(v)).sort((a,b)=>a-b);
    if(!out.length)throw Error('课程候选数在提示数字约束下为空');
    return out;
  });
  if(!normalized[target]?.includes(Number(fixture.goal.digit)))
    throw Error('目标候选已被行列宫提示数排除，不构成对应技巧训练');
  return normalized;
}
