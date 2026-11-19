// Native SudokuPadX chain/colour training states are taken ONLY from the
// Rust creator's unique-solution trace, never external teaching examples.
import {SUDOPEDIA_BY_ID} from './sudopedia-catalog.js';
import {normalizeCandidateProof} from './hints/proof-view.js';

const METHODS=new Set(['x_chain','xy_chain','aic','simple_coloring',
  'medusa_wrap','medusa_trap']);
const ALIASES={color_trap:'simple_coloring',color_wrap:'simple_coloring',
  simple_colors:'simple_coloring'};
export function nativeChainMethod(id){
  const raw=SUDOPEDIA_BY_ID.get(Number(id))?.method;
  const method=ALIASES[raw]||raw;
  return METHODS.has(method)?method:null;
}
const titles={
  x_chain:'单数链 X-Chain',xy_chain:'双值链 XY-Chain',
  aic:'交替推理链 AIC',simple_coloring:'简单染色',
  medusa_wrap:'立体染色 · 同色冲突',
  medusa_trap:'立体染色 · 双色陷阱'
};
export function createNativeChainPractice(response,id,method){
  if(!METHODS.has(method)||!response?.puzzle||!response?.details||
     response.details.focus!==method)
    throw Error('Rust 生成器未确认所选专项技巧');
  const n=Number(response.details.size),step=response.details.trainingStep,
    puzzle=structuredClone(response.puzzle);
  if(![4,6,9].includes(n)||!step||step.method!==method||
     !Array.isArray(puzzle.cells)||puzzle.cells.length!==n||
     puzzle.cells.some(row=>!Array.isArray(row)||row.length!==n))
    throw Error('Rust 专项训练数据不完整');
  const proof=normalizeCandidateProof(step.proof,n);
  const masks=step.proof?.candidates,cell=step.cell;
  const solution=String(puzzle.metadata?.solution||'');
  if(!proof||!Array.isArray(masks)||masks.length!==n*n||
     !Number.isInteger(cell)||cell<0||cell>=n*n||
     puzzle.cells[Math.floor(cell/n)][cell%n]?.value||
     !Array.isArray(step.removed)||!step.removed.length||
     solution.length!==n*n)throw Error('没有经过验证的目标候选');
  for(let i=0;i<n*n;i++){
    const values=masks[i],answer=Number(solution[i]);
    if(!Array.isArray(values)||!values.length||
       new Set(values).size!==values.length||
       !values.every(d=>Number.isInteger(d)&&d>=1&&d<=n)||
       !values.includes(answer))throw Error('候选状态与唯一解不符');
    const given=Number(puzzle.cells[Math.floor(i/n)][i%n]?.value||0);
    if(given&&(values.length!==1||values[0]!==given))
      throw Error('原生候选状态与已知数不符');
  }
  const digit=step.removed.find(d=>
    Number.isInteger(d)&&masks[cell].includes(d)&&d!==Number(solution[cell]));
  if(!digit)throw Error('专项技巧尚无可验证候选排除');
  for(const node of proof.nodes)if(!masks[node.cell].includes(node.digit))
    throw Error('证明的候选节点不在原生状态里');
  if((['x_chain','xy_chain','aic'].includes(method)?'chain':'colour')!==proof.kind)
    throw Error('链与染色证明类型不匹配');
  const goalLabel='R'+(Math.floor(cell/n)+1)+'C'+(cell%n+1);
  const focus=[...new Set([...proof.nodes.map(node=>node.cell),cell])];
  const seed=masks.map((digits,i)=>{
    const given=puzzle.cells[Math.floor(i/n)][i%n]?.value;
    return {value:null,corner:[],center:given?[]:digits.map(String),color:null};
  });
  const nameZh=titles[method];
  const task='原生 Rust 技巧：观察蓝紫候选、实线强链接和虚线弱链接，然后在黄色目标格 '+
    goalLabel+' 删除候选 '+digit+'。直接在数独棋盘上操作。';
  const explanation=goalLabel+' 的候选 '+digit+' 由 '+nameZh+
    ' 证明必须删除。本课的候选标记来自求解器完成前置步骤、执行该步删除前的状态。';
  puzzle.id='sudokupadx-native-chain-lesson-'+id+'-'+n;
  puzzle.metadata={...puzzle.metadata,
    title:'原生技巧练习 · '+nameZh+' · '+n+'×'+n,
    author:'SudokuPadX Rust 求解器',
    rules:task+'\n'+String(puzzle.metadata?.rules||''),
    msgcorrect:'完成黄色格的候选删除即可通过专项训练。'
  };
  return {id:Number(id),n,puzzle,seed,practiceKind:'targeted',
    goal:{index:cell,digit:String(digit),kind:'remove'},
    focus,task,goalLabel,explanation,visualProof:proof,
    proof:step,origin:'native-rust',input:JSON.stringify(puzzle)};
}
