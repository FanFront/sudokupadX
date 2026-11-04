import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLessonGuide,filterLessons,STAGES,LESSON_IDS} from '../src/lesson-data.js';
import {createLessonPractice,checkLessonMove,availableLessonPracticeIds,hasVerifiedLessonPractice} from '../src/lesson-puzzles.js';

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

test('only genuinely verified lesson boards are playable and every state remains satisfiable',()=>{
  assert.equal(LESSON_IDS.length,25);
  const available=availableLessonPracticeIds();
  assert.equal(available.length,25,'all lessons must have verified boards');
  assert.ok(available.includes(1),'peer elimination must be playable');
  assert.ok(available.includes(2),'hidden single must be playable');
  assert.ok(available.every(id=>id>=1&&id<=25));
  for(const lesson of lessons){
    if(!hasVerifiedLessonPractice(lesson.id)){
      assert.throws(()=>createLessonPractice(lesson.id),/暂无通过唯一解/);
      continue;
    }
    const task=createLessonPractice(lesson.id);
    const n=task.n;
    assert.ok([4,6,9].includes(n));
    assert.equal(task.puzzle.cells.length,n);
    assert.equal(task.puzzle.cells.every(row=>row.length===n),true);
    assert.equal(task.puzzle.regions.length,n);
    assert.equal(task.seed.length,n*n);
    assert.ok(task.focus.includes(task.goal.index));
    assert.ok(task.goal.index>=0&&task.goal.index<n*n);
    assert.match(task.goal.digit,/^[1-9]$/);
    assert.ok(['remove','fill'].includes(task.goal.kind));
    assert.equal(task.proof.method.length>0,true);
    assert.ok(task.proof.removed.length>0);
    assert.match(task.puzzle.metadata.rules,/经过唯一解验证/);
    assert.equal(task.input.includes('metadata'),true);
    const solution=[...task.puzzle.metadata.solution].map(Number);
    const masks=task.seed.map((state,i)=>{
      const r=Math.floor(i/n),c=i%n;
      const given=task.puzzle.cells[r][c].value;
      const digits=given?[Number(given)]:state.center.map(Number);
      assert.ok(digits.includes(solution[i]),'final solution is never erased from candidates');
      return new Set(digits);
    });
    // Every row, column, and box must still have a place for each digit.
    const houseDigits=Array.from({length:n},(_,i)=>i+1);
    for(const unit of task.puzzle.regions){
      const cells=unit.map(([r,c])=>r*n+c);
      assert.deepEqual([...new Set(cells.flatMap(i=>[...masks[i]]))].sort((a,b)=>a-b),
        houseDigits);
    }
    for(let line=0;line<n;line++){
      for(const cells of [Array.from({length:n},(_,c)=>line*n+c),
                          Array.from({length:n},(_,r)=>r*n+line)]){
        assert.deepEqual([...new Set(cells.flatMap(i=>[...masks[i]]))].sort((a,b)=>a-b),
          houseDigits);
      }
    }
    const before=task.seed.map(cell=>({value:cell.value,center:[...cell.center]}));
    const after=before.map(cell=>({...cell,center:[...cell.center]}));
    const action=task.goal.kind==='fill'?'value':'center';
    if(action==='value')after[task.goal.index].value=task.goal.digit;
    else after[task.goal.index].center=after[task.goal.index].center
      .filter(value=>value!==task.goal.digit);
    assert.equal(checkLessonMove(task,before,after,action,task.goal.digit,
      [task.goal.index]),true,lesson.title);
    assert.equal(checkLessonMove(task,before,after,'erase',task.goal.digit,
      [task.goal.index]),false);
    assert.equal(checkLessonMove(task,before,after,action,task.goal.digit,
      [(task.goal.index+1)%(n*n)]),false);
  }
});

test('lesson two is a real hidden single, not the impossible 128/369 row',()=>{
  const board=createLessonPractice(2);
  assert.equal(board.goal.index,4*9+6);
  assert.deepEqual(board.seed[board.goal.index].center,['6','7']);
  const row=Array.from({length:9},(_,c)=>4*9+c);
  const possibleSix=row.filter(i=>{
    const given=board.puzzle.cells[4][i%9].value;
    return given?given==='6':board.seed[i].center.includes('6');
  });
  assert.deepEqual(possibleSix,[board.goal.index]);
  assert.equal(board.goal.kind,'fill');
  assert.equal(board.goal.digit,'6');
});

test('variant lesson boards preserve their original rule geometry and recorded method',()=>{
  for(const id of availableLessonPracticeIds()){
    const task=createLessonPractice(id);
    if(id<=12)continue;
    const puzzle=task.puzzle;
    assert.ok(puzzle.cages.length+puzzle.lines.length+
      puzzle.overlays.length+puzzle.arrows.length>0,
      'variant class '+id+' must show actual constraints');
    assert.equal(typeof task.proof.method,'string');
    assert.ok(task.proof.removed.length>0);
  }
  assert.throws(()=>createLessonPractice(26),/暂无通过唯一解/);
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
