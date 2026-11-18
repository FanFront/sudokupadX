// Lesson boards are taken exclusively from a checked solver trace.
// Intermediate candidate notes are produced by replaying all earlier steps;
// never hand-author a row of "possible" digits or infer an answer from a key.
import {LESSON_FIXTURES,TECHNIQUE_FIXTURES} from './lesson-fixtures.js';
import {SUDOPEDIA_TECHNIQUES,SUDOPEDIA_BY_ID} from './sudopedia-catalog.js';
import {randomizeLessonFixture} from './lesson-randomizer.js';
import {normalizeLessonCandidates} from './lesson-candidates.js';

const baseCell=()=>({value:null,corner:[],center:[],color:null});

function certifiedFixture(id){
  const number=Number(id);
  if(Object.prototype.hasOwnProperty.call(LESSON_FIXTURES,String(number)))
    return LESSON_FIXTURES[number];
  const entry=SUDOPEDIA_BY_ID.get(number);
  if(!entry?.method)return null;
  const key=entry.method+(entry.size?':'+entry.size:'');
  const fixture=TECHNIQUE_FIXTURES[key];
  return fixture?.method===entry.method?fixture:null;
}

function knownLessonId(id){
  const number=Number(id);
  return Number.isInteger(number) &&
    ((number>=1&&number<=25)||SUDOPEDIA_BY_ID.has(number));
}

function reviewFixture(){
  // The fallback is a genuinely certified *basic* exercise, not an
  // invented proof of a specialist technique. Every catalog entry has a
  // useful training action without falsely advertising technique coverage.
  const item=TECHNIQUE_FIXTURES.naked_single;
  return item?.method==='naked_single'?item:null;
}

export function lessonPracticeMode(id){
  if(!knownLessonId(id))return 'unavailable';
  const source=certifiedFixture(id);
  if(source){
    try {
      normalizeLessonCandidates(structuredClone(source));
      return 'targeted';
    } catch {
      // A legacy snapshot may be valid as a raw solver trace but make
      // a poor *player* exercise once peer-conflicting notes are cleaned.
    }
  }
  return reviewFixture()?'review':'unavailable';
}

export function availableLessonPracticeIds(){
  return [...Array.from({length:25},(_,i)=>i+1),
          ...SUDOPEDIA_TECHNIQUES.map(item=>item.id)]
    .filter(id=>lessonPracticeMode(id)!=='unavailable');
}

// A verified exercise must demonstrate the *selected* lesson's technique.
// A basic review remains playable through the UI, but is not certification.
export function hasVerifiedLessonPractice(id){
  return lessonPracticeMode(id)==='targeted';
}

export function createLessonPractice(id,{
  randomize=false,random=Math.random,allowReview=false
}={}) {
  if(!knownLessonId(id))throw Error('课程编号无效');
  const unavailable='本课暂无通过唯一解和指定技巧推理验证的专项训练棋盘。';
  let specific=certifiedFixture(id);
  if(!specific&&!allowReview)throw Error(unavailable);
  let practiceKind=specific?'targeted':'review';
  const source=specific||reviewFixture();
  if(!source)throw Error('没有经过验证的基础数独练习盘面');
  // Never mutate frozen/generated shared fixtures, even if no random
  // transformation was requested.
  let fixture=randomize?randomizeLessonFixture(source,random):
    structuredClone(source);
  let candidates;
  try {
    candidates=normalizeLessonCandidates(fixture);
  } catch(error) {
    if(!specific||!allowReview||!reviewFixture())throw Error(
      !allowReview?unavailable:String(error?.message||error));
    // Older workshop traces can select an elimination that was already
    // forced by a *given* in a row/column/box. They are not valid specialist
    // practice after cleanup. Offer a labeled basic review instead.
    practiceKind='review';
    const review=reviewFixture();
    fixture=randomize?randomizeLessonFixture(review,random):
      structuredClone(review);
    candidates=normalizeLessonCandidates(fixture);
  }
  const topic=SUDOPEDIA_BY_ID.get(Number(id));
  const nameZh=practiceKind==='targeted'?
    (topic?.zh||fixture?.nameZh):fixture.nameZh;
  const topicName=topic?.zh||'第 '+id+' 课';
  const n=fixture.n;
  const puzzle=JSON.parse(JSON.stringify(fixture.puzzle));
  const solution=puzzle.metadata?.solution;
  const {goal,proof}=fixture;
  const row=Math.floor(goal.index/n)+1,col=goal.index%n+1;
  const goalLabel='R'+row+'C'+col;
  if(!/^[1-9]$/.test(goal.digit) || !['fill','remove'].includes(goal.kind) ||
     !Array.isArray(fixture.masks) || fixture.masks.length!==n*n ||
     !Array.isArray(puzzle.cells) || puzzle.cells.length!==n ||
     proof.method!==fixture.method ||
     (!proof.removed?.length && !(goal.kind==='fill' &&
       ['full_house','last_digit','naked_single'].includes(proof.method))) ||
     !Array.isArray(fixture.focus) ||
     !fixture.focus.includes(goal.index) ||
     !solution || solution.length!==n*n){
    throw Error('课程验证数据损坏，禁止显示练习棋盘。');
  }

  const seed=candidates.map((values,i)=>{
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
  const action=goal.kind==='fill'
    ?'根据已验证的候选状态，在黄色目标格填入唯一确定的数字。'
    :'根据已验证的候选状态，在黄色目标格用「中心」模式删除可证明排除的候选。';
  const task=(practiceKind==='review'?
    '本课的专项技巧尚无可验证的训练实例。现在进行标准数独「'+nameZh+
    '」基础复习（不是「'+topicName+'」的专项练习）。':'')+action;
  const explanation=(practiceKind==='review'?
    '本节仅完成基础复习，尚未验证「'+topicName+'」技巧。':'')+
    (goal.kind==='fill'
      ?'逻辑求解器证明：利用「'+nameZh+'」，'+goalLabel+
        ' 只能填 '+goal.digit+'。此结论来自当前棋盘。'
      :'逻辑求解器证明：利用「'+nameZh+'」，'+goalLabel+
        ' 可以排除 '+goal.digit+'。此步骤由真实推理轨迹复现。');

  puzzle.id='sudokupadx-lesson-practice-'+id;
  puzzle.metadata={
    ...puzzle.metadata,
    title:(practiceKind==='review'?'基础复习 ':'技巧练习 ')+id+' · '+nameZh+' · '+goalLabel,
    author:'SudokuPadX 中文数独课堂',
    rules:'本题来自经过唯一解验证的真实数独。所有候选数已排除与提示数字冲突的行、列、宫数字；'+
      '专项步骤由真实逻辑推理证明。蓝色格为相关位置，黄色格为目标。'+task+
      '\n技巧：'+nameZh+'。\n'+(puzzle.metadata.rules||''),
    msgcorrect:'训练只要求完成黄色目标格中的一步逻辑推理，不要求解完整盘面。'
  };
  return {
    id:Number(id),n,puzzle,seed,practiceKind,
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
