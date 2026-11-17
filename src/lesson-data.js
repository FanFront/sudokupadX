import {SUDOPEDIA_TECHNIQUES} from './sudopedia-catalog.js';
// Chinese Sudoku lesson data. All prose comes from the bundled original
// tutorial; concise self-check exercises are authored separately.
export const STAGES = [
  {id:'basics', title:'基础排除', short:'基础', description:'单格、同行列宫'},
  {id:'subsets', title:'候选数结构', short:'数组', description:'数对、数组、锁定'},
  {id:'patterns', title:'进阶结构', short:'进阶', description:'鱼形、翼形和摩天楼'},
  {id:'variants', title:'变体联动', short:'变体', description:'Killer、线条和跨规则'},
  {id:'advanced-patterns',title:'Sudopedia 鱼形与翼形',short:'高级图案',description:'鱼形、翼形、单数字结构'},
  {id:'advanced-chains',title:'Sudopedia 链与染色',short:'链与染色',description:'链、环、双色与多色'},
  {id:'advanced-sets',title:'Sudopedia 准锁定数组',short:'复杂数组',description:'ALS 与局部组合'},
  {id:'special-methods',title:'Sudopedia 特殊方法',short:'特殊方法',description:'唯一性、对称、最后手段'},
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
// Preserve the original 25 chapters and their stable progress IDs.
export const LESSON_IDS=Object.freeze([
  ...Array.from({length:25},(_,i)=>i+1),
  ...SUDOPEDIA_TECHNIQUES.map(item=>item.id)
]);
const GROUP_SECTION={single:1,intersection:2,subset:3,fish:4,
  'single-digit':5,coloring:6,chain:7,wing:8,als:9,
  enumeration:10,misc:11,uniqueness:12,'last-resort':13};

export function buildLessonCatalog(base,advancedGuide=''){
  if(!Array.isArray(base))throw TypeError('需要原始基础课程');
  const sections=new Map();
  const pieces=String(advancedGuide).split(/(?=^##\s+\d+\.\s)/m);
  for(const piece of pieces){
    const match=piece.match(/^##\s+(\d+)\.\s/);
    if(match)sections.set(Number(match[1]),piece.trim());
  }
  return [...base,...SUDOPEDIA_TECHNIQUES.map(item=>({
    ...item,content:item.content+'\n\n'+
      (sections.get(GROUP_SECTION[item.group])||'')
  }))];
}
