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

export function exerciseIsCorrect(exercise, choice) {
  return String(choice)===String(exercise.answer);
}

// Questions never claim that a *possible* candidate must be the actual digit.
// The category of deduction ("fill", "remove", "possible") is explicit.
export const EXERCISES = Object.freeze({
  1:{context:'已知 R1C1 = 5。R1C2 与它同行，候选为 {2,5,7}。',target:'R1C2',
    prompt:'哪一个候选必须排除？',choices:['2','5','7'],answer:'5',kind:'remove',
    explanation:'同一行不能重复 5。因此 R1C2 必须删除候选 5。'},
  2:{context:'第 5 行里，数字 6 只可能放在 R5C7，即使该格还有其他候选。',target:'R5C7',
    prompt:'R5C7 必须填几？',choices:['3','6','9'],answer:'6',kind:'fill',
    explanation:'某个数字在一个单位只剩一个位置，就是隐性唯一数。'},
  3:{context:'R4C1、R4C5 都只能是 {2,7}，R4C6 的候选为 {2,5,7}。',target:'R4C6',
    prompt:'R4C6 最后剩下哪个候选？',choices:['2','5','7'],answer:'5',kind:'fill',
    explanation:'2 和 7 必须由同一行前两格分别占据，R4C6 排除它们后只剩 5。'},
  4:{context:'同一行的三格为 {1,4}、{1,6}、{4,6}，另一个格候选为 {2,4,9}。',target:'同一行其他格',
    prompt:'其他格里的哪个候选可以删除？',choices:['2','4','9'],answer:'4',kind:'remove',
    explanation:'三格共同锁定 {1,4,6}，同一行其余格不能包含其中任何数字。'},
  5:{context:'第 8 行的 3 和 6 只能出现于 R8C2、R8C7。R8C2 候选为 {1,3,6}。',target:'R8C2',
    prompt:'哪个候选可以删除？',choices:['1','3','6'],answer:'1',kind:'remove',
    explanation:'3 和 6 必须占据这两格，其他候选 1 可以移除。'},
  6:{context:'左上宫里的 7 只可能在 R2C1、R2C3。R2C5 候选为 {1,4,7}。',target:'R2C5',
    prompt:'哪个候选可以删除？',choices:['1','4','7'],answer:'7',kind:'remove',
    explanation:'7 已被锁在该宫与第 2 行的交集；该行宫外其他格不能再填 7。'},
  7:{context:'R2 与 R7 的数字 4 都只可能在 C3、C8。R5C3 候选为 {1,4,8}。',target:'R5C3',
    prompt:'X-Wing 排除哪个候选？',choices:['1','4','8'],answer:'4',kind:'remove',
    explanation:'第 2、7 行必须各占 C3 或 C8 的一个 4；其他行两列均排除 4。'},
  8:{context:'数字 6 在 R1 只可能于 C2/C5，R4 只可能于 C2/C9，R8 只可能于 C5/C9。',target:'R3C2',
    prompt:'R3C2 的哪个候选可以删除？',choices:['3','6','9'],answer:'6',kind:'remove',
    explanation:'三行的 6 全在三列 C2/C5/C9，其他行这些列都可删去 6。'},
  9:{context:'数字 2 在 R1/R3/R6/R8 的可能列都限定在 C1/C4/C7/C9 四列。',target:'R2C1',
    prompt:'水母结构排除哪个候选？',choices:['2','3','7'],answer:'2',kind:'remove',
    explanation:'四行的数字 2 必须分别占用四个覆盖列；其他行在这些列不能有 2。'},
  10:{context:'中心 R2C2={1,2}，两翼 R2C8={1,5}、R7C2={2,5}。',target:'R7C8',
    prompt:'同时能看到两翼的 R7C8 可以删掉什么？',choices:['3','5','8'],answer:'5',kind:'remove',
    explanation:'无论中心是 1 还是 2，至少一翼必为 5，因此能同时看见两翼的格子不能为 5。'},
  11:{context:'中心 R2C2={1,2,5}，两翼 R2C3={1,5}、R4C2={2,5}。',target:'R3C2',
    prompt:'同时看见中心与两翼的 R3C2 可删什么？',choices:['3','5','7'],answer:'5',kind:'remove',
    explanation:'中心为 5 时已有 5；中心为 1 或 2 时必使一翼为 5，因此共同可见格排除 5。'},
  12:{context:'数字 7 在 R2 只可能于 C2/C7，R6 只可能于 C2/C8。',target:'R5C7',
    prompt:'R5C7 需要排除什么？',choices:['3','7','9'],answer:'7',kind:'remove',
    explanation:'R2C7 和 R6C8 至少一格为 7；R5C7 同时看见这两格，不能为 7。'},
  13:{context:'两格杀手笼之和为 3，第一格已经确定为 1。',target:'杀手笼第二格',
    prompt:'第二格必定填几？',choices:['1','2','3'],answer:'2',kind:'fill',
    explanation:'1+2=3，且笼内不可重复，所以另一格是 2。'},
  14:{context:'某个 3×3 宫全部九格加上恰好一格宫外格，被不重叠杀手笼覆盖；笼和总计 52。',target:'唯一的宫外格',
    prompt:'宫外那格必须填几？',choices:['5','7','9'],answer:'7',kind:'fill',
    explanation:'完整 3×3 宫总和是 45。52−45=7，这是宫外余数（Outie）。'},
  15:{context:'四格温度计从 A 到 D 递增，且 B=3、D=7。',target:'A（圆头）',
    prompt:'A 不可能填哪个数字？',choices:['1','2','3'],answer:'3',kind:'remove',
    explanation:'A 必须小于 B=3，因此 A 只能是 1 或 2。'},
  16:{context:'6×6 同一行的两个白点三格链与另一组 Renban 分别覆盖三个格。',target:'白点链中间格',
    prompt:'下面哪个数字可能出现在白点链中间？',choices:['1','2','6'],answer:'2',kind:'possible',
    explanation:'两组三格分别为 {1,2,3} 与 {4,5,6}，白点链中间只能为 2 或 5。'},
  17:{context:'三格连续线已经有 4 和 6；三个数字各不相同且连续。',target:'第三格',
    prompt:'第三格必须是几？',choices:['3','5','7'],answer:'5',kind:'fill',
    explanation:'连续的三个数字只能是 {4,5,6}，中间缺少 5。'},
  18:{context:'9×9 耳语线某格是 2，下一格与它相差至少 5。',target:'相邻格',
    prompt:'以下哪个数字仍然可能？',choices:['3','5','7'],answer:'7',kind:'possible',
    explanation:'与 2 的差至少为 5 的数字包括 7、8、9；3 和 5 不符合规则。'},
  19:{context:'箭头圆圈为 7，箭杆上两格之和等于圆圈；其中一格为 3。',target:'箭杆另一格',
    prompt:'另一格必定填几？',choices:['3','4','7'],answer:'4',kind:'fill',
    explanation:'箭杆 3+4=7，所以另一格必为 4。'},
  20:{context:'一条区域和线先经过 A、B 两格，再跨宫经过 C、D 两格。A+B=5，C=2。',target:'D',
    prompt:'D 必定填几？',choices:['2','3','5'],answer:'3',kind:'fill',
    explanation:'每个宫中的线段总和相同，因此 C+D=5，D=5−2=3。'},
  21:{context:'9×9 熵线前三格分别是 2、未知、8，每三格必须各来自低/中/高一组。',target:'中间格',
    prompt:'哪个数字属于允许的中组？',choices:['2','4','9'],answer:'4',kind:'possible',
    explanation:'第一格属于低组，第三格属于高组，因此中间格只能是 {4,5,6}。'},
  22:{context:'9×9 模三线前三格分别为 1、未知、2，三格的模 3 余数必须各不相同。',target:'中间格',
    prompt:'下面哪个数字可能填入？',choices:['3','4','5'],answer:'3',kind:'possible',
    explanation:'1 余 1，2 余 2，剩下必须余 0，即可取 3、6、9。'},
  23:{context:'熵线要求 R2C2 ∈ {4,5,6}，交叉的模三线要求 R2C2 ∈ {1,4,7}。',target:'R2C2',
    prompt:'交点被确定为什么数字？',choices:['4','5','7'],answer:'4',kind:'fill',
    explanation:'交集 {4,5,6}∩{1,4,7}={4}。两线各需两个不同类别锚点才可确定类别位置。'},
  24:{context:'夹心线两个端点是 2 和 8，内部数字必须严格介于端点之间。',target:'任一内部格',
    prompt:'下面哪个数字必须被排除？',choices:['4','7','8'],answer:'8',kind:'remove',
    explanation:'内部只能取 3、4、5、6、7；端点 8 不属于严格区间。'},
  25:{context:'6×6 某一行：前三格为白点三格链，后三格为 Renban。',target:'白点链中间格',
    prompt:'哪个数字可以成为链中间格？',choices:['1','2','6'],answer:'2',kind:'possible',
    explanation:'两组三格将整行分成 {1,2,3}/{4,5,6}，白点链中间只能是 2 或 5。'}
});
