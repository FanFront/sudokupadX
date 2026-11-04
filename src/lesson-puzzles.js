// A real SudokuPadX engine board for every Chinese lesson.
//
// Each exercise is a deliberately staged *candidate state*, not a
// made-up uniquely-solvable full Sudoku. It is played in the normal
// Rust/WASM puzzle engine with real number and pencilmark controls.
// The target deduction is grounded in the Chinese guide's example.
import {EXERCISES} from './lesson-data.js';

const point=(r,c)=>[r-1,c-1];
const center=(r,c)=>[r-.5,c-.5];
const baseCell=()=>({value:null,corner:[],center:[],color:null});
const validDigit=(digit,n)=>Number.isInteger(digit)&&digit>=1&&digit<=n;

export function createLessonPractice(id) {
  const exercise=EXERCISES[id];
  if(!exercise)throw Error('不存在这节数独训练课');
  const n=(id===16||id===25)?6:9;
  const boxHeight=n===6?2:3,boxWidth=3;
  const puzzleCells=Array.from({length:n},()=>Array.from({length:n},()=>({})));
  const seed=Array.from({length:n*n},baseCell);
  const focus=new Set();
  const lines=[],cages=[],overlays=[],underlays=[],arrows=[];
  let goal=null;

  const index=(r,c)=>{
    if(!Number.isInteger(r)||!Number.isInteger(c)||r<1||c<1||r>n||c>n)
      throw Error('课程格子超出棋盘范围');
    return (r-1)*n+c-1;
  };
  const note=(r,c,values)=>{
    const cell=index(r,c),digits=[...new Set(values)].sort((a,b)=>a-b);
    if(!digits.length||digits.some(d=>!validDigit(d,n)))
      throw Error('训练候选数字超出范围');
    seed[cell].center=digits.map(String);
    return cell;
  };
  const given=(r,c,digit)=>{
    if(!validDigit(digit,n))throw Error('课程提示数字无效');
    const idx=index(r,c);
    puzzleCells[r-1][c-1]={value:String(digit)};
    seed[idx].center=[];
    return idx;
  };
  // Derive real pencilmarks from the clue grid instead of inventing masks.
  const classicCandidates=(r,c)=>{
    if(puzzleCells[r-1][c-1].value)return [];
    const excluded=new Set();
    const add=cell=>{if(cell.value)excluded.add(Number(cell.value));};
    for(let i=0;i<n;i++){
      add(puzzleCells[r-1][i]);
      add(puzzleCells[i][c-1]);
    }
    const firstR=Math.floor((r-1)/boxHeight)*boxHeight;
    const firstC=Math.floor((c-1)/boxWidth)*boxWidth;
    for(let rr=firstR;rr<firstR+boxHeight;rr++)
      for(let cc=firstC;cc<firstC+boxWidth;cc++)
        add(puzzleCells[rr][cc]);
    return Array.from({length:n},(_,i)=>i+1)
      .filter(d=>!excluded.has(d));
  };
  const mark=(...locations)=>{
    for(const [r,c] of locations)focus.add(index(r,c));
  };
  const target=(r,c,correct,kind,choices)=>{
    const cell=index(r,c);
    if(kind==='remove'){
      if(!choices?.includes(correct))throw Error('目标候选未在格中');
      note(r,c,choices);
    }else if(kind==='fill'){
      if(!validDigit(correct,n))throw Error('课程答案数字错误');
      if(choices)note(r,c,choices);
    }else throw Error('未定义练习目标');
    goal={index:cell,digit:String(correct),kind};
  };
  const path=(type,coords,color,width=12)=>{
    lines.push({wayPoints:coords.map(([r,c])=>center(r,c)),
      target:'underlay',color,thickness:width});
  };
  const cage=(coords,total)=>{
    cages.push({cells:coords.map(([r,c])=>point(r,c)),
      value:String(total),unique:true,outlineC:'#46728e',fontC:'#254967'});
    mark(...coords);
  };
  const dot=(a,b)=>{
    overlays.push({center:[
      (a[0]+b[0])/2-.5,(a[1]+b[1])/2-.5],
      width:.22,height:.22,rounded:true,
      backgroundColor:'#ffffff',borderColor:'#24282e',borderSize:1.3});
  };
  const thermo=(coords)=>{
    path('thermo',coords,'#b89acb',20);
    underlays.push({center:center(...coords[0]),width:.65,height:.65,
      rounded:true,backgroundColor:'#b89acb',borderColor:'#7c5b9a',borderSize:1});
  };
  const between=(coords)=>{
    path('between',coords,'#a783d6',9);
    for(const end of [coords[0],coords.at(-1)])
      underlays.push({center:center(...end),width:.72,height:.72,
        rounded:true,backgroundColor:'#f8f3ff',borderColor:'#a783d6',borderSize:2});
  };
  const strongRow=(row,digit,columns,notes=[1,2])=>{
    for(let col=1;col<=n;col++)
      note(row,col,columns.includes(col)?[...notes,digit]:notes);
    mark(...columns.map(col=>[row,col]));
  };
  const strongColumn=(col,digit,rows,notes=[1,3])=>{
    for(let row=1;row<=n;row++)
      note(row,col,rows.includes(row)?[...notes,digit]:notes);
    mark(...rows.map(row=>[row,col]));
  };

  switch(id){
    case 1:
      given(1,1,5);mark([1,1]);target(1,2,5,'remove',[2,5,7]);break;
    case 2: {
      // Unique-solution classic Sudoku: a genuine hidden single in R5C7.
      // The target has three legal candidates, but only its position in
      // row 5 can contain 6. All given digits belong to one valid solution.
      const clueRows=[
        '.3..27..9',
        '...78916.',
        '.8..6.4..',
        '63..2.8.1',
        '5278.....',
        '89.6.4...',
        '..52....6',
        '27..1....',
        '.163...7.'
      ];
      for(let r=0;r<9;r++)for(let c=0;c<9;c++){
        const digit=Number(clueRows[r][c]);
        if(digit)given(r+1,c+1,digit);
      }
      for(let col=1;col<=9;col++)
        if(!puzzleCells[4][col-1].value)
          note(5,col,classicCandidates(5,col));
      target(5,7,6,'fill',classicCandidates(5,7));
      mark([6,4],[2,8],[7,9],[5,5],[5,6],[5,8],[5,9]);
      break;
    }
    case 3:
      note(4,1,[2,7]);note(4,5,[2,7]);
      mark([4,1],[4,5]);target(4,6,5,'fill',[2,5,7]);break;
    case 4:
      note(4,1,[1,4]);note(4,3,[1,6]);note(4,5,[4,6]);
      mark([4,1],[4,3],[4,5]);target(4,6,4,'remove',[2,4,9]);break;
    case 5:
      for(let col=1;col<=9;col++)
        note(8,col,col===2?[1,3,6]:col===7?[3,5,6]:[1,2,7]);
      target(8,2,1,'remove',[1,3,6]);
      mark([8,7]);break;
    case 6:
      for(let row=1;row<=3;row++)for(let col=1;col<=3;col++)
        note(row,col,row===2&&(col===1||col===3)?[2,7,9]:[1,2,4]);
      mark([2,1],[2,3]);target(2,5,7,'remove',[1,4,7]);break;
    case 7:
      strongRow(2,4,[3,8],[1,2]);
      strongRow(7,4,[3,8],[6,7]);
      target(5,3,4,'remove',[1,4,8]);break;
    case 8:
      strongRow(1,6,[2,5],[1,2]);strongRow(4,6,[2,9],[3,4]);
      strongRow(8,6,[5,9],[7,8]);
      target(3,2,6,'remove',[3,6,9]);break;
    case 9:
      strongRow(1,2,[1,4],[3,4]);
      strongRow(3,2,[4,7],[5,6]);
      strongRow(6,2,[7,9],[1,8]);
      strongRow(8,2,[1,9],[3,5]);
      target(2,1,2,'remove',[2,3,7]);break;
    case 10:
      note(2,2,[1,2]);note(2,8,[1,5]);note(7,2,[2,5]);
      mark([2,2],[2,8],[7,2]);target(7,8,5,'remove',[3,5,8]);break;
    case 11:
      note(2,2,[1,2,5]);note(2,3,[1,5]);note(4,2,[2,5]);
      mark([2,2],[2,3],[4,2]);target(3,2,5,'remove',[3,5,7]);break;
    case 12:
      strongRow(2,7,[2,7],[1,3]);strongRow(6,7,[2,8],[2,4]);
      target(5,7,7,'remove',[3,7,9]);break;
    case 13:
      given(1,8,1);cage([[1,8],[1,9]],3);
      mark([1,8]);target(1,9,2,'fill',[1,2,3]);break;
    case 14:
      // Complete top-middle house (sum 45) and exactly one outside cell.
      cage([[1,4],[1,5],[1,6]],21);
      cage([[2,4],[2,5],[2,6]],15);
      cage([[3,5],[3,6]],6);
      cage([[3,4],[4,4]],10);
      target(4,4,7,'fill',[5,7,9]);break;
    case 15:
      thermo([[2,2],[2,3],[2,4],[2,5]]);
      given(2,3,3);given(2,5,7);
      mark([2,3],[2,5]);target(2,2,3,'remove',[1,2,3]);break;
    case 16:
    case 25:
      dot([1,1],[1,2]);dot([1,2],[1,3]);
      path('renban',[[1,4],[1,5],[1,6]],'#85a8d8',16);
      note(1,1,[1,3,4]);note(1,3,[1,3,6]);
      note(1,4,[1,3,4]);note(1,5,[2,5,6]);note(1,6,[2,4,6]);
      mark([1,1],[1,3],[1,4],[1,5],[1,6]);
      target(1,2,id===16?1:6,'remove',[1,2,5,6]);break;
    case 17:
      path('renban',[[4,1],[4,2],[4,3]],'#85a8d8',16);
      given(4,1,4);given(4,2,6);
      mark([4,1],[4,2]);target(4,3,5,'fill',[3,5,7]);break;
    case 18:
      path('whisper',[[2,2],[2,3],[2,4]],'#7abe9a',12);
      given(2,2,2);mark([2,2]);
      target(2,3,3,'remove',[3,5,7]);break;
    case 19:
      arrows.push({wayPoints:[[3.5,2.5],[3.5,3.5],[3.5,4.5]],
        color:'#d29754',thickness:4,headLength:.18});
      underlays.push({center:center(4,3),width:.75,height:.75,
        rounded:true,backgroundColor:'#fff6e4',
        borderColor:'#d29754',borderSize:2});
      given(4,3,7);given(4,4,3);
      mark([4,3],[4,4]);target(4,5,4,'fill',[3,4,7]);break;
    case 20:
      path('region_sum',[[1,2],[1,3],[1,4],[1,5]],'#3b619c',10);
      cage([[1,2],[1,3]],5);
      given(1,4,2);mark([1,4]);target(1,5,3,'fill',[2,3,5]);break;
    case 21:
      path('entropic',[[2,1],[2,2],[2,3],[2,4]],'#d8a752',10);
      given(2,1,2);given(2,3,8);
      mark([2,1],[2,3]);target(2,2,9,'remove',[2,4,9]);break;
    case 22:
      path('modular',[[2,1],[2,2],[2,3],[2,4]],'#45a8ab',10);
      given(2,1,1);given(2,3,2);
      mark([2,1],[2,3]);target(2,2,4,'remove',[3,4,5]);break;
    case 23:
      path('entropic',[[2,1],[2,2],[2,3],[2,4]],'#d8a752',10);
      path('modular',[[1,2],[2,2],[3,2],[4,2]],'#45a8ab',10);
      given(2,1,2);given(2,3,8);given(1,2,3);given(3,2,5);
      mark([2,1],[2,3],[1,2],[3,2]);target(2,2,4,'fill',[4,5,7]);break;
    case 24:
      between([[3,3],[3,4],[3,5],[3,6],[3,7]]);
      given(3,3,2);given(3,7,8);
      mark([3,3],[3,7]);target(3,5,8,'remove',[4,7,8]);break;
    default:throw Error('该课程还没有训练棋盘');
  }

  const regions=[];
  for(let r=0;r<n;r+=boxHeight)for(let c=0;c<n;c+=boxWidth)
    regions.push(Array.from({length:boxHeight*boxWidth},(_,i)=>[
      r+Math.floor(i/boxWidth),c+i%boxWidth]));
  const goalLabel='R'+(Math.floor(goal.index/n)+1)+'C'+(goal.index%n+1);
  const task=goal.kind==='fill'?
    '根据棋盘提示及候选数，在黄色目标格填入正确的大数字。':
    '根据棋盘上的数字和候选结构，在黄色目标格用「中心」模式删去不可能的候选。';
  const puzzle={
    id:'sudokupadx-lesson-practice-'+id,
    cells:puzzleCells,regions,cages,lines,underlays,overlays,arrows,
    metadata:{
      title:'技巧练习 '+id+' · '+exercise.target,
      author:'SudokuPadX 中文数独课堂',
      rules:'本关是用真实游戏棋盘练习一步候选推理的教学局部状态，未要求完成整个数独。'+
        '蓝色格为推理相关位置，黄色格为操作目标。'+task+'\n'+exercise.context,
      msgcorrect:'这是一节局部技巧练习，可通过上方“返回课程”继续学习。'
    }
  };
  return {
    id,n,puzzle,seed,goal,focus:[...focus],task,goalLabel,
    explanation:exercise.explanation,
    input:JSON.stringify(puzzle)
  };
}

export function checkLessonMove(practice, before, after, action, symbol, indices) {
  if(!practice||!before||!after||!indices.includes(practice.goal.index))return false;
  const {index,digit,kind}=practice.goal;
  if(kind==='fill')
    return action==='value' && String(symbol)===digit &&
      String(after[index]?.value)===digit && String(before[index]?.value||'')!==digit;
  return action==='center' && String(symbol)===digit &&
    before[index]?.center?.includes(digit) &&
    !after[index]?.center?.includes(digit);
}
