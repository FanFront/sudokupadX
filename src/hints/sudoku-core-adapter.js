// Conservative adapter for MIT sudoku-core v4.x. Only the certified, fully
// visible, non-variant 9x9 grids use it. No player notes are solver premises.
import {hintImpact} from './priority.js';
import {normalizeCandidateProof} from './proof-view.js';

const N=9;
const techniqueTable=Object.freeze({
  'Open Singles':['hidden_single',1,'宫、行或列最后一个空格只能填剩下的数字。'],
  'Single Candidate':['hidden_single',1,'该数字在此行、列或宫只剩一个候选位置。'],
  'Visual Elimination':['naked_single',1,'同行、同列和同宫的已知数字排除后，该格只有一个可行数字。'],
  'Pointing Elimination':['locked_candidate',2,'数字在一个宫的候选位置被限制在同一行或列，其他格可以排除。'],
  'Naked Pair':['naked_subset',2,'两个格子恰好占用两个数字，可从同单位其余格排除它们。'],
  'Hidden Pair':['hidden_subset',2,'两个数字在同单位只可能位于指定两格，可排除这两格的其他候选。'],
  'Hidden Groups':['hidden_subset',2,'隐性数组锁定了指定数字的格位。'],
  'Hidden Triple':['hidden_subset',2,'隐性三数组锁定了指定数字的格位。'],
  'Hidden Quad':['hidden_subset',2,'隐性四数组锁定了指定数字的格位。'],
  'Naked Triplet':['naked_subset',2,'三格候选合起来恰好为三个数字。'],
  'Naked Quadruple':['naked_subset',2,'四格候选合起来恰好为四个数字。'],
  'X-Wing':['x_wing',3,'两个基础单位和两个覆盖单位形成鱼形锁定。'],
  'Swordfish':['swordfish',3,'三条基础单位和三条覆盖单位形成鱼形锁定。'],
  'Skyscraper':['skyscraper',3,'两条双候选强链形成摩天楼，两端共同可见的格可排除该数字。'],
  'Two-String-Kite':['two_string_kite',3,'行列强链接在同宫相接，两个远端至少有一处成立。'],
  'Crane':['crane',3,'两个相接的双候选强链接形成鹤形，端点共同可见的格可排除该数字。'],
  'Y-Wing':['xy_wing',3,'枢纽格与两个翼格至少有一个共同尾数成立。'],
  'W-Wing':['w_wing',4,'相同的双候选翼由一个数字的强链接连接，另一数字至少出现在一个翼格。'],
  'XYZ-Wing':['xyz_wing',4,'三候选枢纽及两个翼格共同锁定尾数。'],
  'WXYZ-Wing':['wxyz_wing',4,'四数字翼形锁定共同可见的候选数。'],
  'Simple Colouring':['simple_coloring',4,'同数字强链接交替着色，由双色陷阱或同色矛盾排除候选。'],
  'Empty Rectangle':['empty_rectangle',4,'宫内候选构成空矩形，结合外部强链接排除候选。'],
  'Unique Rectangle':['unique_rectangle',4,'在题目唯一解得到确认的前提下，避免形成可交换的致命矩形。'],
  'Finned X-Wing':['finned_x_wing',4,'有鳍 X-Wing 的额外候选限制了同宫内可排除的位置。'],
  'Finned Swordfish':['finned_swordfish',4,'有鳍三阶鱼形锁定同宫内目标候选。'],
  'Finned Jellyfish':['finned_jellyfish',4,'有鳍四阶鱼形锁定同宫内目标候选。'],
  'Jellyfish':['jellyfish',4,'四条基础单位与四条覆盖单位形成鱼形锁定。'],
  'BUG+1':['bug_plus_one',4,'在唯一解前提下，双值通用二义性格局中唯一多候选格必须避开二义性。'],
  'X-Chain':['x_chain',4,'单数字强弱链的端点构成共同排除。'],
  'XY-Chain':['xy_chain',4,'双候选链在端点上锁定相同的数字。'],
  '3D-Medusa':['medusa_3d',4,'对多个数字的强链接交替着色，利用矛盾或双色陷阱排除候选。'],
  'AIC':['aic',4,'交替推理链通过强弱链接推出必然排除。']
});
const uniquenessMethods=new Set(['Unique Rectangle','BUG+1']);
const validCell=i=>Number.isInteger(i)&&i>=0&&i<81;
const numeric=value=>{
  if(value==null||value==='')return null;
  const n=Number(value);
  return Number.isInteger(n)&&n>=1&&n<=N?n:NaN;
};
function standardRegions(regions){
  if(!Array.isArray(regions)||regions.length!==9)return false;
  const expected=new Set();
  for(let br=0;br<3;br++)for(let bc=0;bc<3;bc++){
    const indices=[];
    for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++)
      indices.push((br*3+dr)*N+bc*3+dc);
    expected.add(indices.sort((a,b)=>a-b).join(','));
  }
  const got=new Set();
  for(const region of regions){
    if(!Array.isArray(region)||region.length!==9)return false;
    const indices=region.map(pair=>{
      if(Array.isArray(pair)&&pair.length===2&&
         Number.isInteger(pair[0])&&Number.isInteger(pair[1])&&
         pair[0]>=0&&pair[0]<N&&pair[1]>=0&&pair[1]<N)
        return pair[0]*N+pair[1];
      return validCell(pair)?pair:-1;
    });
    if(indices.some(i=>i<0)||new Set(indices).size!==9)return false;
    got.add(indices.sort((a,b)=>a-b).join(','));
  }
  return got.size===9&&[...got].every(key=>expected.has(key));
}

/** Deliberately excludes imported/legacy SCLs without certified solverRules. */
export function eligibleClassicNine(puzzle,visible=[]){
  if(puzzle?.rows!==9||puzzle?.cols!==9||
     !Array.isArray(puzzle?.cells)||puzzle.cells.length!==81||
     !Array.isArray(puzzle?.hintRules)||puzzle.hintRules.length!==0||
     !standardRegions(puzzle.regions)||
     (visible||[]).some(value=>value===false))return false;
  for(const key of ['hintConstraints','cages','arrows','lines','underlays',
    'overlays','sectors','bossGates','fogRules']){
    if(puzzle[key]!=null&&(!Array.isArray(puzzle[key])||puzzle[key].length))return false;
  }
  if(puzzle.bossLink)return false;
  return true;
}

export function currentClassicBoard(puzzle,cells){
  if(!Array.isArray(cells)||cells.length!==81)return null;
  const board=[];
  for(let i=0;i<81;i++){
    const given=numeric(puzzle?.cells?.[i]?.given);
    const player=numeric(cells[i]?.value);
    if(Number.isNaN(given)||Number.isNaN(player))return null;
    if(given!=null&&player!=null&&given!==player)return null;
    board.push(given??player??null);
  }
  return board;
}

export function adaptCoreTeaching(tip,board,tier=4,unique=false){
  if(!tip?.step||!Array.isArray(board)||board.length!==81)return null;
  const title=String(tip.strategy||tip.step.strategy||'').replace(/ Strategy$/,'');
  const match=techniqueTable[title];
  if(!match||match[1]>tier||
     uniquenessMethods.has(title)&&!unique)return null;
  const [method,level,reason]=match;
  const candidates=tip.previewCandidates;
  if(!Array.isArray(candidates)||candidates.length!==81)return null;
  const updates=tip.step.updates||[];
  const relevant=updates.filter(u=>validCell(u.index)&&board[u.index]==null);
  if(!relevant.length)return null;
  const sources=[...new Set([...(tip.step.patternCells||[]),...(tip.relatedCells||[]),
    ...(tip.step.regionCells||[])].filter(validCell))];
  const label=String(tip.label||title);
  const proof=normalizeCandidateProof(tip.step.proof,N);
  for(const u of relevant) {
    if(!Number.isInteger(u.filledValue)||u.filledValue<1||u.filledValue>9)continue;
    const before=candidates[u.index];
    if(!Array.isArray(before)||!before.includes(u.filledValue))continue;
    return {status:'step',level,step:{
      method,cell:u.index,removed:before.filter(d=>d!==u.filledValue),
      remaining:[u.filledValue],before:[...before],sources,
      placement:true,source:'sudoku-core',label,reason,
      ...(proof?{proof}:{})
    }};
  }
  for(const u of relevant){
    const digit=u.eliminatedCandidate;
    const before=candidates[u.index];
    if(!Number.isInteger(digit)||digit<1||digit>9||
       !Array.isArray(before)||!before.includes(digit)||before.length<2)continue;
    const affected=relevant.filter(update=>
      update.eliminatedCandidate===digit &&
      candidates[update.index]?.includes(digit)&&
      candidates[update.index]?.length>1).map(update=>update.index);
    return {status:'step',level,step:{
      method,cell:u.index,removed:[digit],
      remaining:before.filter(d=>d!==digit),before:[...before],sources,
      affectedCells:[...new Set(affected)],forceElimination:true,
      source:'sudoku-core',label,reason,
      ...(proof?{proof}:{})
    }};
  }
  return null;
}

/** Retain Rust's verified placement; consider core only if more useful. */
export function chooseClassicHint(base,core,cells=[]){
  if(!core?.step||core.status!=='step'||base?.status==='conflict')return base;
  if(base?.status!=='step'||!base.step)return core;
  const marks=cell=>{
    const notes=cells[cell]?.center?.length?cells[cell].center:
      cells[cell]?.corner||[];
    return [...new Set(notes.map(Number).filter(Number.isInteger))];
  };
  const resultScore=result=>{
    const step=result.step;
    const impact=hintImpact(step,marks(step.cell));
    const actionable=impact.rank===3||
      marks(step.cell).some(d=>(step.removed||[]).includes(d));
    return {impact,actionable};
  };
  const a=resultScore(base),b=resultScore(core);
  if(a.impact.rank===3)return base;
  if(b.impact.rank===3)return core;
  // Prefer an actionable elimination on the player's current notes; do not
  // replace a proven Rust step with an unmarked theoretical elimination.
  if(b.actionable&&(!a.actionable||
     b.impact.rank>a.impact.rank ||
     b.impact.rank===a.impact.rank&&b.impact.count>a.impact.count))
    return core;
  return base;
}

export function formatClassicAnalysis(analysis){
  if(!analysis?.hasSolution)return {
    title:'标准数独分析 · 无法求解',
    description:'当前填写的数字与标准行列宫规则无法组成有效解。',
    details:'请先检查已填大数字。'
  };
  const uniqueness=analysis.hasUniqueSolution?'唯一解':'尚不能确认唯一解';
  const level=analysis.difficulty||'未归级';
  return {
    title:'标准数独分析 · '+level,
    description:'当前剩余盘面的求解难度：'+level+'；'+uniqueness+
      '；最高使用技巧：'+(analysis.hardestTechnique||'尚未完成纯逻辑求解')+'。',
    details:(analysis.usedStrategies||[]).map(s=>s.title+' ×'+s.freq)
      .join('、')||'当前技巧序列尚不能完成整个盘面；不因此认定必须猜测。'
  };
}
