import {hintImpact} from './priority.js';

// Center/corner note sets can suggest a naked pair or triple, but they are
// player observations, not axioms. Confirm their completeness against a
// sound upper bound from VISIBLE givens before promoting an elimination to
// a proof. Otherwise expose an explicitly conditional, non-placement hint.
import {typedConstraints} from './constraint-data.js';
import {gridsAndHouses} from './adventure.js';

const digit=(v,max=9)=>{
  const n=Number(v);
  return Number.isInteger(n)&&n>=1&&n<=max?n:0;
};
const unique=list=>[...new Set(list)].sort((a,b)=>a-b);
const notes=(cell,max)=>unique(
  (Array.isArray(cell?.center)&&cell.center.length?cell.center:cell?.corner||[])
    .map(v=>digit(v,max)).filter(Boolean));
const visible=(progress,index)=>progress.visible?.[index]!==false;
function combinations(items,count){
  const found=[];
  const walk=(start,selected)=>{
    if(selected.length===count){found.push([...selected]);return;}
    for(let i=start;i<=items.length-(count-selected.length);i++){
      selected.push(items[i]);walk(i+1,selected);selected.pop();
    }
  };
  walk(0,[]);
  return found;
}

export function findPencilSubsetHint(puzzle,progress,tier=4,focus=-1){
  const rows=puzzle?.rows,cols=puzzle?.cols,total=rows*cols;
  if(tier<2||!Number.isInteger(rows)||!Number.isInteger(cols)||
     total>26000||!Array.isArray(puzzle?.cells)||
     !Array.isArray(progress?.cells)||puzzle.cells.length!==total||
     progress.cells.length!==total)return null;
  // The generator's 4×4/6×6/9×9 solutions use ordinary Sudoku houses,
  // even when a variant rule is also present. Legacy adventure maps use
  // their actual authored sectors and named regions, never guessed colors.
  let board=puzzle;
  if(Array.isArray(puzzle.hintRules)&&rows===cols&&
      [4,6,9].includes(rows)&&!puzzle.sectors?.length){
    board={...puzzle,sectors:[{top:0,left:0,width:rows,height:cols,
      title:'数独',rules:'标准数独：每行、每列、每个宫均填写不重复的数字。'}]};
  }
  const {domains,houses}=gridsAndHouses(board,typedConstraints(puzzle,progress));
  if(!houses.length)return null;
  const values=Array.from({length:total},(_,i)=>visible(progress,i)
    ?digit(puzzle.cells[i]?.given??progress.cells[i]?.value,domains[i]||9):0);
  // Never use assumptions to deduce from a contradicted board.
  for(const h of houses){
    const placed=h.cells.map(i=>values[i]).filter(Boolean);
    if(new Set(placed).size!==placed.length)return null;
  }
  const maxDigit=i=>domains[i]||9;
  const marks=progress.cells.map((c,i)=>notes(c,maxDigit(i)));
  const candidates=new Map();
  function upperBound(cell){
    if(candidates.has(cell))return candidates.get(cell);
    const excluded=new Set();
    for(const house of houses)if(house.cells.includes(cell)){
      for(const peer of house.cells){
        if(peer!==cell&&values[peer])excluded.add(values[peer]);
      }
    }
    const result=Array.from({length:maxDigit(cell)},(_,k)=>k+1)
      .filter(d=>!excluded.has(d));
    candidates.set(cell,result);
    return result;
  }
  const options=[];
  for(const house of houses){
    if(!['row','column','box','region','unique'].includes(house.kind)||
       house.cells.length<3||house.cells.length>16)continue;
    const open=house.cells.filter(i=>visible(progress,i)&&!values[i]);
    const eligible=open.filter(i=>marks[i].length>=2&&marks[i].length<=8);
    for(let count=Math.min(8,eligible.length,open.length-1);
        count>=2;count--){
      if(open.length<=count||eligible.length<count)continue;
      for(const sources of combinations(eligible,count)){
        const group=unique(sources.flatMap(i=>marks[i]));
        if(group.length!==count)continue;
        const verified=sources.every(i=>domains[i]>0&&
          upperBound(i).length>0&&
          upperBound(i).every(d=>marks[i].includes(d)));
        for(const target of open){
          if(sources.includes(target))continue;
          const annotated=marks[target].length>0;
          const prior=verified?upperBound(target):
            annotated?marks[target]:upperBound(target);
          const removed=prior.filter(d=>group.includes(d));
          const remaining=prior.filter(d=>!group.includes(d));
          if(!removed.length||!remaining.length)continue;
          if(annotated&&!removed.some(d=>marks[target].includes(d)))
            continue; // Do not suggest an exclusion the player already made.
          // An unverified pencil pattern is useful only for an actual
          // recorded target candidate (or the explicitly focused target).
          // Selecting a source alone must not trigger speculative removals
          // from unrelated, unannotated cells.
          if(!verified&&!annotated&&target!==focus)continue;
          const groupName=count===2?'数对':count===3?'三数组':count+' 数组';
          const reason=verified
            ?house.description+'中 '+sources.length+' 格的全部可行数字都属于 '+
              group.join('、')+'；由不重复约束可推出显性'+
              groupName+
              '，该组其它格不可能再出现这些数字。'
            :'如果所标 '+sources.map(i=>'R'+(Math.floor(i/cols)+1)+
              'C'+(i%cols+1)).join('、')+
              ' 的候选数已经完整列出，'+
              sources.map(i=>marks[i].join('')).join('、')+
              ' 恰好组成 '+group.join('、')+' 的显性'+
              groupName+
              '；那么'+house.description+'的其它格可排除这些数字。'+
              '这是一条基于手记的条件建议；求解器尚未独立证明这几格没有漏标候选。';
          const step={
            method:verified?'naked_subset':'pencil_subset',
            cell:target,removed,remaining,before:prior,
            sources:[...sources],reason,level:2,
            adventure:true,forceElimination:true,
            assumptionBased:!verified,
            subsetDigits:[...group],subsetSize:count
          };
          const markedRemoved=removed.filter(d=>marks[target].includes(d)).length;
          const focusMatch=target===focus?3:sources.includes(focus)?1:0;
          const impact=hintImpact(step,marks[target]);
          const score=(verified?1000000:0)+impact.rank*100000+
            focusMatch*10000+(annotated?1000:0)+count*75+
            markedRemoved*80+removed.length*20+remaining.length/100;
          options.push({step,score});
        }
      }
    }
  }
  options.sort((a,b)=>b.score-a.score||
    a.step.cell-b.step.cell||
    a.step.sources.join(',').localeCompare(b.step.sources.join(',')));
  const step=options[0]?.step;
  return step?{status:'step',level:2,step}:null;
}

export function preferPencilSubset(base,pencil,focus=-1,cells=[]){
  if(pencil?.status!=='step')return base;
  if(['conflict','complete'].includes(base?.status))return base;
  if(base?.status!=='step')return pencil;
  const step=pencil.step,baseStep=base.step;
  const marked=i=>{
    const note=cells[i]||{};
    const source=note.center?.length?note.center:note.corner||[];
    return source.map(Number);
  };
  const baseRank=hintImpact(baseStep,marked(baseStep?.cell)).rank;
  const pencilRank=hintImpact(step,marked(step.cell)).rank;
  // A verified placement must always remain above note-based eliminations.
  if(baseRank===3 || pencilRank<baseRank)return base;
  if(!step.assumptionBased&&pencilRank>baseRank)return pencil;
  // A handwritten, unverified subset cannot displace a proved multi-removal.
  if(step.assumptionBased&&baseRank>=2)return base;
  if(!step.assumptionBased&&
      (step.cell===focus||step.sources.includes(focus)))return pencil;
  if(step.assumptionBased&&
      (step.cell===focus||step.sources.includes(focus))&&
      ['peer_elimination','hidden_single','naked_single']
        .includes(baseStep?.method))return pencil;
  if(!step.assumptionBased&&
     ['peer_elimination','naked_single'].includes(baseStep?.method))
    return pencil;
  // A validated multi-constraint proof is always preferable to a
  // speculative handwritten candidate set, even when focused.
  if(step.assumptionBased&&
     ['constraint_locked_digit','naked_subset','hidden_subset',
       'killer_sum','arrow'].includes(baseStep?.method))
    return base;
  if(step.assumptionBased&&baseStep?.method==='peer_elimination')
    return pencil;
  return base;
}
