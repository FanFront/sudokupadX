// Chinese Sudoku lesson data. All prose comes from the bundled original
// tutorial; concise self-check exercises are authored separately.
export const STAGES = [
  {id:'basics', title:'基础排除', short:'基础', description:'单格、同行列宫'},
  {id:'subsets', title:'候选数结构', short:'数组', description:'数对、数组、锁定'},
  {id:'patterns', title:'进阶结构', short:'进阶', description:'鱼形、翼形和摩天楼'},
  {id:'variants', title:'变体联动', short:'变体', description:'Killer、线条和跨规则'},
];

const stageFromHeading = heading => {
  if (heading.includes('第一阶段')) return STAGES[0].id;
  if (heading.includes('第二阶段')) return STAGES[1].id;
  if (heading.includes('第三阶段')) return STAGES[2].id;
  if (heading.includes('第四阶段')) return STAGES[3].id;
  return null;
};

// Parse Markdown source at build time; the app needs no network and does not
// load GitHub Markdown at runtime.
export function parseLessonGuide(markdown) {
  if (typeof markdown !== 'string') throw new TypeError('中文教程需要 Markdown 文本');
  const result = [];
  let stage = null;
  let current = null;
  const flush = () => {
    if (current) {
      current.content = current.lines.join('\n').trim();
      delete current.lines;
      if (current.content) result.push(current);
      current = null;
    }
  };
  for (const line of markdown.replace(/\r\n?/g,'\n').split('\n')) {
    const section = line.match(/^##\s+(.+)$/);
    if (section) {
      flush();
      stage = stageFromHeading(section[1]);
      continue;
    }
    const heading = line.match(/^###\s+(\d+)\.\s+(.+)$/);
    if (heading) {
      flush();
      if (stage) {
        current = {id:Number(heading[1]), title:heading[2].trim(),
          stage,lines:[]};
      }
      continue;
    }
    if (current) current.lines.push(line);
  }
  flush();
  const ids = result.map(item => item.id);
  if (new Set(ids).size !== ids.length ||
      result.some(item => !item.title || !item.content || !STAGES.some(s => s.id===item.stage))) {
    throw new Error('课程章节格式错误');
  }
  return result;
}

export function filterLessons(lessons, term='', stage='all') {
  const q=String(term).trim().toLocaleLowerCase('zh-CN');
  return lessons.filter(lesson =>
    (stage==='all'||lesson.stage===stage) &&
    (!q||[lesson.title,lesson.content,String(lesson.id)].join(' ').toLocaleLowerCase('zh-CN').includes(q)));
}

// Practice boards are now generated from solver proofs. Do not embed
// manually invented "candidate exercises" here: those can contradict a
// Sudoku house (the retired lesson 2 once had eight {1,2,8} cells).
export const LESSON_IDS=Object.freeze(Array.from({length:25},(_,i)=>i+1));
