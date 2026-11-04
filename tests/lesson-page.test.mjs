import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLessonGuide,filterLessons,STAGES,EXERCISES} from '../src/lesson-data.js';
import {createLessonPractice,checkLessonMove} from '../src/lesson-puzzles.js';

const guide=readFileSync(new URL('../docs/techniques.zh-CN.md',import.meta.url),'utf8');
const lessons=parseLessonGuide(guide);

test('all twenty-five lessons come directly from the bundled Chinese guide',()=>{
  assert.deepEqual(lessons.map(lesson=>lesson.id),Array.from({length:25},(_,i)=>i+1));
  assert.equal(STAGES.length,4);
  assert.deepEqual(STAGES.map(stage=>lessons.filter(l=>l.stage===stage.id).length),
    [2,4,6,13]);
  assert.ok(lessons.every(l=>l.title&&l.content.length>80));
  assert.match(lessons[6].title,/X-Wing/);
  assert.match(lessons[22].title,/熵线/);
});

test('search and category filtering return the right lessons',()=>{
  assert.equal(filterLessons(lessons,'', 'all').length,25);
  assert.deepEqual(filterLessons(lessons,'鱼形','patterns').map(l=>l.id),
    [7,8,9].filter(id=>lessons[id-1].content.includes('鱼形')||
       lessons[id-1].title.includes('鱼形')));
  assert.equal(filterLessons(lessons,'zzzzzz').length,0);
  assert.ok(filterLessons(lessons,'白点').some(lesson=>lesson.id===16));
  assert.equal(filterLessons(lessons,'','basics').length,2);
});

test('all 25 lessons initialize an editable engine puzzle with a real deduction target',()=>{
  assert.equal(Object.keys(EXERCISES).length,25);
  for(const lesson of lessons){
    const task=createLessonPractice(lesson.id);
    const n=task.n;
    assert.ok([6,9].includes(n));
    assert.equal(task.puzzle.cells.length,n);
    assert.equal(task.puzzle.cells.every(row=>row.length===n),true);
    assert.equal(task.puzzle.regions.length,n);
    assert.equal(task.seed.length,n*n);
    assert.ok(task.focus.length>=1);
    assert.ok(task.goal.index>=0&&task.goal.index<n*n);
    assert.ok(task.goal.digit.match(/^[1-9]$/));
    assert.ok(['remove','fill'].includes(task.goal.kind));
    assert.ok(task.input.includes('metadata'));
    assert.match(task.puzzle.metadata.rules,/教学局部状态/);
    const target=task.seed[task.goal.index];
    const before=task.seed.map(cell=>({
      value:cell.value,center:[...cell.center]
    }));
    const after=before.map(cell=>({...cell,center:[...cell.center]}));
    const action=task.goal.kind==='fill'?'value':'center';
    if(action==='value')after[task.goal.index].value=task.goal.digit;
    else after[task.goal.index].center=after[task.goal.index].center
      .filter(value=>value!==task.goal.digit);
    assert.equal(checkLessonMove(task,before,after,action,task.goal.digit,
      [task.goal.index]),true,lesson.title);
    assert.equal(checkLessonMove(task,before,after,'erase',task.goal.digit,
      [task.goal.index]),false,'erasing everything must not earn a technique');
    assert.equal(checkLessonMove(task,before,after,action,task.goal.digit,
      [(task.goal.index+1)%(n*n)]),false,'wrong cell must not earn a technique');
    if(action==='center')assert.ok(target.center.includes(task.goal.digit));
  }
  assert.deepEqual(lessons.filter(l=>l.id===16||l.id===25)
    .map(l=>createLessonPractice(l.id).n),[6,6]);
});

test('lesson 2 is a unique, consistent Sudoku with a proved hidden single',()=>{
  const practice=createLessonPractice(2);
  const board=practice.puzzle.cells.map(row=>row.map(cell=>Number(cell.value||0)));
  const candidates=(r,c)=>{
    if(board[r][c])return [];
    const used=new Set();
    for(let i=0;i<9;i++){
      if(board[r][i])used.add(board[r][i]);
      if(board[i][c])used.add(board[i][c]);
    }
    for(let rr=Math.floor(r/3)*3;rr<Math.floor(r/3)*3+3;rr++)
      for(let cc=Math.floor(c/3)*3;cc<Math.floor(c/3)*3+3;cc++)
        if(board[rr][cc])used.add(board[rr][cc]);
    return Array.from({length:9},(_,i)=>i+1).filter(d=>!used.has(d));
  };

  const spotsForSix=[];
  for(let c=0;c<9;c++){
    if(board[4][c])continue;
    const legal=candidates(4,c);
    // Center notes on the showcased row must match real Sudoku domains.
    assert.deepEqual(practice.seed[4*9+c].center,legal.map(String),
      'R5C'+(c+1)+' must not contain fabricated candidate notes');
    if(legal.includes(6))spotsForSix.push(c+1);
  }
  assert.deepEqual(spotsForSix,[7]);
  assert.deepEqual(candidates(4,6),[3,6,9]);
  assert.equal(practice.goal.index,42);
  assert.deepEqual(practice.goal,{index:42,digit:'6',kind:'fill'});

  // Verify that the underlying puzzle is a real Sudoku, not an
  // unsatisfiable exercise with a predetermined target answer.
  let solutions=0;
  function search(){
    if(solutions>=2)return;
    let best=null;
    for(let r=0;r<9;r++)for(let c=0;c<9;c++){
      if(board[r][c])continue;
      const options=candidates(r,c);
      if(!options.length)return;
      if(!best||options.length<best.options.length)
        best={r,c,options};
    }
    if(!best){solutions++;return;}
    for(const digit of best.options){
      board[best.r][best.c]=digit;
      search();
      board[best.r][best.c]=0;
      if(solutions>=2)return;
    }
  }
  search();
  assert.equal(solutions,1,'lesson board must have exactly one completion');
});

test('visual variant examples use real SudokuPad cages, lines and clue overlays',()=>{
  const killer=createLessonPractice(14);
  assert.equal(killer.puzzle.cages.length,4);
  assert.equal(killer.puzzle.cages.reduce((s,cage)=>s+Number(cage.value),0),52);
  assert.equal(killer.puzzle.cages.reduce((s,cage)=>s+cage.cells.length,0),10);
  const white=createLessonPractice(16);
  assert.equal(white.puzzle.overlays.length,2);
  assert.equal(white.puzzle.lines.length,1);
  const cross=createLessonPractice(23);
  assert.equal(cross.puzzle.lines.length,2);
  assert.equal(cross.puzzle.cells[1][0].value,'2');
  const between=createLessonPractice(24);
  assert.equal(between.puzzle.underlays.length,2);
  assert.equal(between.puzzle.lines.length,1);
  assert.equal(createLessonPractice(19).puzzle.arrows.length,1);
  assert.throws(()=>createLessonPractice(26),/不存在/);
});

test('Home and puzzle rules have navigation into an actual offline lesson screen',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const style=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const reader=readFileSync(new URL('../src/lesson-page.js',import.meta.url),'utf8');
  for(const id of ['lessonButton','lessonScreen','lessonBack','lessonSearch',
       'lessonFilters','lessonList','lessonReading','lessonExercise',
       'lessonComplete','lessonPrev','lessonNext','lessonFromRulesButton'])
    assert.ok(html.includes('id="'+id+'"'),id+' missing in markup');
  assert.match(main,/const lessonPage=setupLessonPage\(/);
  assert.match(main,/launchPractice:lesson=>beginLessonPractice\(lesson.id\)/);
  assert.match(main,/\$\('lessonFromRulesButton'\)\.addEventListener/);
  assert.match(main,/\$\('lessonScreen'\)\.hidden=true;/);
  assert.match(reader,/techniques\.zh-CN\.md\?raw/);
  assert.match(reader,/localStorage/);
  assert.match(reader,/aria-pressed/);
  assert.match(reader,/noopener noreferrer/);
  assert.doesNotMatch(reader,/lesson-exercise-choices|button\[data-choice\]/);
  assert.match(main,/restoreOriginalAfterLesson\(/);
  assert.match(main,/checkLessonMove\(lessonPractice/);
  assert.match(style,/#app #lessonScreen\[hidden\]/);
});

test('parser ignores unrelated sections, handles Windows newlines and rejects duplicate IDs',()=>{
  const sample='## 第一阶段｜初学\r\n### 1. 测试\r\n\r\n看得见的文字。\r\n## 其他段落\r\n### 2. 不算课程\r\n测试';
  assert.deepEqual(parseLessonGuide(sample).map(x=>x.id),[1]);
  assert.throws(()=>parseLessonGuide(
    '## 第一阶段\n### 1. 首课\n正文\n### 1. 再一课\n正文'),/格式错误/);
});
