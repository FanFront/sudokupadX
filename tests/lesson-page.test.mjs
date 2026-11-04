import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseLessonGuide,filterLessons,STAGES,EXERCISES,exerciseIsCorrect} from '../src/lesson-data.js';

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

test('each lesson includes a deterministic playable candidate exercise',()=>{
  assert.equal(Object.keys(EXERCISES).length,25);
  for(const lesson of lessons){
    const exercise=EXERCISES[lesson.id];
    assert.ok(exercise,lesson.title+' missing exercise');
    assert.ok(exercise.context&&exercise.target&&exercise.prompt&&exercise.explanation);
    assert.ok(['fill','remove','possible'].includes(exercise.kind));
    assert.equal(exercise.choices.length,3);
    assert.equal(new Set(exercise.choices).size,3);
    assert.ok(exercise.choices.includes(exercise.answer));
    assert.equal(exerciseIsCorrect(exercise,exercise.answer),true);
    for(const other of exercise.choices.filter(x=>x!==exercise.answer))
      assert.equal(exerciseIsCorrect(exercise,other),false);
  }
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
  assert.match(main,/setupLessonPage\(\{showHome,showGame\}\)/);
  assert.match(main,/\$\('lessonFromRulesButton'\)\.addEventListener/);
  assert.match(main,/\$\('lessonScreen'\)\.hidden=true;/);
  assert.match(reader,/techniques\.zh-CN\.md\?raw/);
  assert.match(reader,/localStorage/);
  assert.match(reader,/aria-pressed/);
  assert.match(reader,/noopener noreferrer/);
  assert.match(style,/#app #lessonScreen\[hidden\]/);
});

test('parser ignores unrelated sections, handles Windows newlines and rejects duplicate IDs',()=>{
  const sample='## 第一阶段｜初学\r\n### 1. 测试\r\n\r\n看得见的文字。\r\n## 其他段落\r\n### 2. 不算课程\r\n测试';
  assert.deepEqual(parseLessonGuide(sample).map(x=>x.id),[1]);
  assert.throws(()=>parseLessonGuide(
    '## 第一阶段\n### 1. 首课\n正文\n### 1. 再一课\n正文'),/格式错误/);
});
