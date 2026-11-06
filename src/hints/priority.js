// Suggestion impact is separate from the maximum solving-technique level.
// A verified placement outranks several useful removals, which outrank one.
// Only pencil notes that are actually present count as actionable removals.
export function hintImpact(step,notes=[]){
  if(!step)return {rank:0,count:0,label:''};
  const marked=Array.isArray(notes)?notes:[];
  const removed=[...new Set(step.removed||[])].filter(d=>
    !marked.length||marked.includes(d));
  const placement=!step.assumptionBased&&!step.forceElimination&&
    step.method!=='search_contradiction'&&
    step.remaining?.length===1&&step.before?.length>1;
  if(placement)return {rank:3,count:1,label:'A · 确定数字'};
  if(removed.length>=2)return {rank:2,count:removed.length,label:'B · 多候选排除'};
  if(removed.length===1)return {rank:1,count:1,label:'C · 单候选排除'};
  return {rank:0,count:0,label:'无可执行排除'};
}
