// Readable Chinese explanations reference the actual witness cells returned by Rust.
export const TECHNIQUES=Object.freeze({
  peer_elimination:'已知数排除',hidden_single:'隐性唯一数',
  naked_subset:'显性数组',hidden_subset:'隐性数组',
  locked_candidate:'区块排除',
  x_wing:'X-Wing',swordfish:'Swordfish',jellyfish:'Jellyfish',
  xy_wing:'XY-Wing',xyz_wing:'XYZ-Wing',skyscraper:'Skyscraper',
  xy_chain:'XY-Chain',killer_sum:'杀手笼求和',kropki:'黑白点',
  thermo:'温度计',renban:'连续数线',whisper:'低语线',
  arrow:'箭头求和',xv:'XV 和',entropic:'熵线',
  modular:'模三线',between:'夹心线',region_sum:'区域等和线',
  search_contradiction:'穷举反证'
});
const ruleText={
  peer_elimination:'同行、同列或同宫中已有的确定数字，不能再次出现在目标格。',
  hidden_single:'在这条行、列或宫中，剩余候选位置使目标数字只能落在目标格。',
  naked_subset:'这些来源格的候选数合起来恰好占满相同数量的格，其他同一区域的格不能再使用这些数。',
  hidden_subset:'这些数字在同一行、列或宫里只能出现在来源格中，因此这些格的其他候选数可删去。',
  locked_candidate:'某数字在一个行、列或宫中的位置都被限制在交集内，因此可从交集所在的另一单位其余位置排除。',
  x_wing:'两行或两列把某个数字限制在相同两列或两行，形成矩形，覆盖单位的其他位置可排除该数字。',
  swordfish:'三条基础行或列把某数字限制在三条覆盖列或行，覆盖单位其余位置可排除该数字。',
  jellyfish:'四条基础行或列把某数字限制在四条覆盖列或行，覆盖单位其余位置可排除该数字。',
  xy_wing:'双候选枢纽格与两个翼格构成强迫二选一，两个翼共同看到的目标格不能包含共同尾数。',
  xyz_wing:'三候选枢纽格与两个双候选翼格形成三择结构，同时看见三格的目标格不能包含共同数字。',
  skyscraper:'同一数字在两条行或列中各有两个位置，形成摩天楼强链。两端都可见的目标格可排除它。',
  xy_chain:'双候选格之间的强弱链接形成交替链，链首链尾共同可见的目标格可排除指定数字。',
  killer_sum:'依据笼内数字之和及互不重复要求，排除不能参与合法组合的候选数。',
  kropki:'白点两端相差 1，黑点两端为两倍关系；目标候选数无法与另一端形成合法配对。',
  thermo:'温度计从圆头到末端严格递增，超出可能顺序的数字不可填入。',
  renban:'连续数线必须使用一组互不重复的连续整数，其他候选数不符合条件。',
  whisper:'相邻线格数字差至少为 5，因此无法与相邻格配对的候选数可排除。',
  arrow:'箭头圆圈数字等于箭杆上数字之和，排除不能组成合法总和的候选数。',
  xv:'相连两格之和必须为 5（V）或 10（X），排除无法配对的候选数。',
  entropic:'每组三连格必须分别取自三个数字区间（1–3、4–6、7–9），不符合分组的候选数可排除。',
  modular:'每组三连格对 3 的余数必须各不相同，排除不可能的余数类别。',
  between:'线中间的数字必须严格介于两端数字之间，因此可排除超出两端范围的候选数。',
  region_sum:'线在各宫内的区段数字总和必须相等，无法满足等和的候选数可排除。',
  search_contradiction:'假设目标格填入要排除的数字，搜索所有可能的后续分支，均无法满足完整题目。此步骤属于有穷搜索反证，不是前四级纯逻辑技巧。'
};
export function cellName(index,size){
  return 'R'+(Math.floor(index/size)+1)+'C'+(index%size+1);
}
export function describeHint(response,size){
  if(response?.status!=='step'||!response.step){
    const status={
      complete:'当前盘面已经解完，没有下一步。',
      stalled:'当前设定等级没有找到可继续的逻辑步骤；可提高提示等级或自行推理。',
      search_limit:'前四级逻辑已停滞；第五级搜索在安全计算上限内未能给出可证明的排除。',
      not_unique:'根据当前棋盘和已知规则无法证明唯一解，因此不会猜一个数字。'
    };
    return {title:'暂无可验证步骤',description:status[response?.status]||'无法计算下一步。',
      candidates:'',sources:[],target:-1,level:response?.level??0};
  }
  const {step,level}=response;
  const before=(step.before||[]).join('、');
  const removed=(step.removed||[]).join('、');
  const remaining=(step.remaining||[]).join('、');
  const sourceCells=[...new Set((step.sources||[]).filter(i=>
    Number.isInteger(i)&&i>=0&&i<size*size&&i!==step.cell))];
  const entropicGroups=size===6?'1–2、3–4、5–6':'1–3、4–6、7–9';
  const rationale=step.method==='entropic'
    ?'每组三连格必须分别取自三个数字区间（'+entropicGroups+'），不符合分组的候选数可排除。'
    :ruleText[step.method]||'遵循已知数独规则。';
  const placement=step.remaining?.length===1&&step.before?.length>1;
  const action=step.method==='search_contradiction'
    ?'经反证，可排除 '+removed
    :placement?'确定填入 '+remaining:'排除候选数 '+removed;
  return {
    title:(TECHNIQUES[step.method]||step.method)+' · 等级 '+level,
    description:cellName(step.cell,size)+'：'+rationale+
      ' 由此'+action+'。'+(sourceCells.length?
        ' 参考格：'+sourceCells.slice(0,12).map(i=>cellName(i,size)).join('、')+
        (sourceCells.length>12?' 等':'')+'。':''),
    candidates:'此前候选：'+before+' ｜ 排除：'+removed+' ｜ 余下：'+remaining,
    target:step.cell,sources:sourceCells,removed:step.removed||[],
    placement:placement&&step.method!=='search_contradiction',level
  };
}
