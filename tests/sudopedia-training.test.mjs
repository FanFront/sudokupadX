import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SUDOPEDIA_TECHNIQUES,SUDOPEDIA_GROUPS,SUDOPEDIA_SOURCE}
  from '../src/sudopedia-catalog.js';
import {buildLessonCatalog,parseLessonGuide,LESSON_IDS}
  from '../src/lesson-data.js';
import {createLessonPractice,hasVerifiedLessonPractice}
  from '../src/lesson-puzzles.js';

const originalGuide=readFileSync(new URL('../docs/techniques.zh-CN.md',import.meta.url),'utf8');
const advancedGuide=readFileSync(new URL('../docs/sudopedia-catalog.zh-CN.md',import.meta.url),'utf8');
const originals=parseLessonGuide(originalGuide);
const catalogue=buildLessonCatalog(originals,advancedGuide);
const seeded=seed=>()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
const houses=(n,regions)=>{
  const rows=Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>r*n+c));
  const cols=Array.from({length:n},(_,c)=>Array.from({length:n},(_,r)=>r*n+c));
  const boxes=regions.map(region=>region.map(([r,c])=>r*n+c));
  return [...rows,...cols,...boxes];
};

test('complete link-index is integrated, not only the original 25 lessons',()=>{
  assert.equal(SUDOPEDIA_SOURCE,
    'https://sudopedia.sudocue.net/index.php?title=Solving_technique');
  assert.ok(SUDOPEDIA_TECHNIQUES.length>=90);
  assert.equal(catalogue.length,25+SUDOPEDIA_TECHNIQUES.length);
  assert.deepEqual(LESSON_IDS,catalogue.map(item=>item.id));
  assert.equal(new Set(catalogue.map(item=>item.id)).size,catalogue.length);
  assert.equal(new Set(SUDOPEDIA_TECHNIQUES.map(item=>item.name)).size,
    SUDOPEDIA_TECHNIQUES.length);
  assert.ok(SUDOPEDIA_GROUPS.every(group=>
    SUDOPEDIA_TECHNIQUES.some(item=>item.group===group.id)));
  for(const name of ['Full House','Last Digit','Naked Single / Forced Digit',
    'Sashimi Fish','Mutant Fish','Kraken Fish','3D Medusa',
    'Avoidable Rectangle','Generalized Fishy Cycles','WXYZ-Wing',
    'ALS-XY-Wing','Death Blossom','Aligned Triple Exclusion',
    'Gurth\'s Symmetrical Placement','Nishio','Templating / Pattern Overlay Method']){
    assert.ok(SUDOPEDIA_TECHNIQUES.some(item=>item.name===name),name);
  }
  assert.ok(!SUDOPEDIA_TECHNIQUES.some(item=>/Backtracking Algorithms/i.test(item.name)),
    'exhaustive backtracking is intentionally excluded');
  assert.ok(catalogue.every(item=>item.content.length>80),
    'every entry needs a usable Chinese explanation');
});

test('missing technique-specific certificates are not represented as training',()=>{
  for(const name of ['Kraken Fish','3D Medusa','Death Blossom','Guessing']){
    const entry=SUDOPEDIA_TECHNIQUES.find(item=>item.name===name);
    assert.ok(entry);
    assert.equal(hasVerifiedLessonPractice(entry.id),false);
    assert.throws(()=>createLessonPractice(entry.id),/暂无通过唯一解/);
  }
  for(const name of ['Full House','Last Digit','Hidden Single / Pinned Digit',
    'Naked Single / Forced Digit','X-Wing','Swordfish','XY-Wing']){
    const entry=SUDOPEDIA_TECHNIQUES.find(item=>item.name===name);
    assert.ok(hasVerifiedLessonPractice(entry.id),name);
    const task=createLessonPractice(entry.id);
    assert.equal(task.proof.method,entry.method);
  }
  for(const name of ['Naked Pair','Naked Triple']){
    const entry=SUDOPEDIA_TECHNIQUES.find(item=>item.name===name);
    const task=createLessonPractice(entry.id);
    assert.equal(task.proof.source.size,entry.size,name);
  }
});

test('every randomized published lesson preserves house solution, givens and sound elimination',()=>{
  const ids=[1,2,3,4,7,10,13,14,20,21,22,23,24,25];
  for(const extra of SUDOPEDIA_TECHNIQUES.filter(item=>hasVerifiedLessonPractice(item.id)).slice(0,25))
    ids.push(extra.id);
  for(const id of ids){
    for(let seed=1;seed<=4;seed++){
      const task=createLessonPractice(id,{randomize:true,random:seeded(seed+id*271)});
      const n=task.n,solution=task.puzzle.metadata.solution.split('').map(Number);
      assert.equal(solution.length,n*n);
      assert.deepEqual([...new Set(solution)].sort((a,b)=>a-b),
        Array.from({length:n},(_,i)=>i+1));
      for(const unit of houses(n,task.puzzle.regions))
        assert.deepEqual(unit.map(i=>solution[i]).sort((a,b)=>a-b),
          Array.from({length:n},(_,i)=>i+1),'invalid transformed house: '+id);
      for(let i=0;i<n*n;i++){
        const digit=solution[i];
        const given=task.puzzle.cells[Math.floor(i/n)][i%n].value;
        if(given)assert.equal(Number(given),digit);
        else assert.ok(task.seed[i].center.includes(String(digit)),
          'a transformed mask removed the true answer: '+id);
      }
      assert.ok(task.focus.includes(task.goal.index));
      assert.ok(!task.puzzle.cells[Math.floor(task.goal.index/n)]
        [task.goal.index%n].value);
      assert.ok(task.seed[task.goal.index].center.includes(task.goal.digit));
      if(task.goal.kind==='remove')
        assert.notEqual(Number(task.goal.digit),solution[task.goal.index],
          'lesson would remove its solved digit: '+id);
      else assert.equal(Number(task.goal.digit),solution[task.goal.index]);
    }
  }
});

test('randomized classic drills produce new clue positions without mutating the certificate',()=>{
  const source=createLessonPractice(10);
  const seen=new Set();
  for(let seed=1;seed<=12;seed++){
    const task=createLessonPractice(10,{randomize:true,random:seeded(seed)});
    seen.add(JSON.stringify(task.puzzle.cells));
    assert.equal(task.proof.method,source.proof.method);
  }
  assert.ok(seen.size>=5,'random practice must not replay one fixed layout');
  assert.deepEqual(createLessonPractice(10).goal,source.goal);
});

test('randomized variant lesson geometry remains attached to the solution',()=>{
  for(const id of [15,16,17,18,19,20,21,22,23,24,25]){
    const task=createLessonPractice(id,{randomize:true,random:seeded(id*31)});
    const rules=task.puzzle.metadata.solverRules;
    // Some generated lessons supply graphical constraints without a solverRules
    // metadata entry; in those cases geometry must still remain in the scene.
    assert.ok(task.puzzle.cages.length+task.puzzle.lines.length+
      task.puzzle.arrows.length+task.puzzle.overlays.length>0);
    if(!Array.isArray(rules))continue;
    const n=task.n,sol=task.puzzle.metadata.solution.split('').map(Number);
    for(const rule of rules){
      const digits=rule.cells.map(i=>sol[i]);
      if(rule.type==='killer')assert.equal(digits.reduce((a,b)=>a+b,0),rule.sum);
      if(rule.type==='xv')assert.equal(digits[0]+digits[1],rule.sum);
      if(rule.type==='thermo')
        assert.ok(digits.slice(1).every((d,i)=>d>digits[i]));
      if(rule.type==='kropki')
        assert.ok(rule.dot==='white'?Math.abs(digits[0]-digits[1])===1:
          digits[0]===2*digits[1]||digits[1]===2*digits[0]);
      if(rule.type==='renban'){
        assert.equal(new Set(digits).size,digits.length);
        assert.equal(Math.max(...digits)-Math.min(...digits),digits.length-1);
      }
      if(rule.type==='whisper')
        assert.ok(digits.slice(1).every((d,i)=>Math.abs(d-digits[i])>=5));
      if(rule.type==='arrow')
        assert.equal(digits[0],digits.slice(1).reduce((a,b)=>a+b,0));
    }
  }
});
