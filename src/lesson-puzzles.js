// Lesson boards are taken exclusively from a checked solver trace.
// Intermediate candidate notes are produced by replaying all earlier steps;
// never hand-author a row of "possible" digits or infer an answer from a key.
import {LESSON_FIXTURES} from './lesson-fixtures.js';

const baseCell=()=>({value:null,corner:[],center:[],color:null});

export function availableLessonPracticeIds(){
  return Object.keys(LESSON_FIXTURES).map(Number).sort((a,b)=>a-b);
}

export function hasVerifiedLessonPractice(id){
  return Object.prototype.hasOwnProperty.call(LESSON_FIXTURES,String(id));
}

export function createLessonPractice(id) {
  const fixture=LESSON_FIXTURES[id];
  if(!fixture){
    throw Error('本课暂无通过唯一解和逻辑推理验证的练习棋盘，已拒绝加载未经证明的候选数。');
  }
  const n=fixture.n;
  const puzzle=JSON.parse(JSON.stringify(fixture.puzzle));
  const solution=puzzle.metadata?.solution;
  const {goal,proof}=fixture;
  const row=Math.floor(goal.index/n)+1,col=goal.index%n+1;
  const goalLabel='R'+row+'C'+col;
  if(!/^[1-9]$/.test(goal.digit) || !['fill','remove'].includes(goal.kind) ||
     !Array.isArray(fixture.masks) || fixture.masks.length!==n*n ||
     !Array.isArray(puzzle.cells) || puzzle.cells.length!==n ||
     proof.method!==fixture.method || !proof.removed?.length ||
     !Array.isArray(fixture.focus) ||
     !fixture.focus.includes(goal.index) ||
     !solution || solution.length!==n*n){
    throw Error('课程验证数据损坏，禁止显示练习棋盘。');
  }

  const seed=fixture.masks.map((values,i)=>{
    const entry=baseCell();
    const given=puzzle.cells[Math.floor(i/n)]?.[i%n]?.value;
    if(!Array.isArray(values) || !values.length ||
       values.some(d=>!Number.isInteger(d)||d<1||d>n) ||
       !values.includes(Number(solution[i]))){
      throw Error('课程候选数与已验证的答案矛盾。');
    }
    if(given){
      if(values.length!==1 || values[0]!==Number(given)){
        throw Error('课程给定数字与候选状态不符。');
      }
    }else{
      entry.center=values.map(String);
    }
    return entry;
  });
  if(puzzle.cells[Math.floor(goal.index/n)]?.[goal.index%n]?.value){
    throw Error('课程目标不能是提示数字。');
  }
  if(!seed[goal.index].center.includes(goal.digit)){
    throw Error('课程目标候选不在被证明的推理状态里。');
  }
  const task=goal.kind==='fill'
    ?'根据真实棋盘及完整候选状态，在黄色目标格填入唯一确定的数字。'
    :'根据真实棋盘及完整候选状态，在黄色目标格用「中心」模式删除一个可证明排除的候选。';
  const explanation=goal.kind==='fill'
    ?'逻辑求解器证明：利用「'+fixture.nameZh+'」，'+goalLabel+
      ' 只能填 '+goal.digit+'。此结论来自当前棋盘，不是预设答案。'
    :'逻辑求解器证明：利用「'+fixture.nameZh+'」，'+goalLabel+
      ' 可以排除 '+goal.digit+'。此步骤由真实推理轨迹复现。';

  puzzle.id='sudokupadx-lesson-practice-'+id;
  puzzle.metadata={
    ...puzzle.metadata,
    title:'第 '+id+' 课 · '+fixture.nameZh+' · '+goalLabel,
    author:'SudokuPadX 中文数独课堂',
    rules:'本题来自经过唯一解验证的真实数独。盘面候选数是在无猜测求解器的中途步骤中获得的完整状态，'+
      '不是任意设置的数字。蓝色格为相关位置，黄色格为目标。'+task+
      '\n技巧：'+fixture.nameZh+'。\n'+(puzzle.metadata.rules||''),
    msgcorrect:'训练只要求完成黄色目标格中的一步逻辑推理，不要求解完整盘面。'
  };
  return {
    id:Number(id),n,puzzle,seed,
    goal:{...goal},
    focus:[...fixture.focus],task,goalLabel,explanation,
    proof:structuredClone(proof),
    input:JSON.stringify(puzzle)
  };
}

export function checkLessonMove(practice, before, after, action, symbol, indices) {
  if(!practice||!before||!after||!Array.isArray(indices)||
     !indices.includes(practice.goal.index))return false;
  const {index,digit,kind}=practice.goal;
  if(kind==='fill')
    return action==='value' && String(symbol)===digit &&
      String(after[index]?.value)===digit && String(before[index]?.value||'')!==digit;
  return action==='center' && String(symbol)===digit &&
    before[index]?.center?.includes(digit) &&
    !after[index]?.center?.includes(digit);
}
