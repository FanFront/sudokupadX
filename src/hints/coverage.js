// Source-of-truth coverage ledger for the four original adventure games.
// A numeric Sudoku deduction can remain valid when another constraint is
// missing, but it must NOT be advertised as complete variant-aware solving.
// Entries are keyed to the bundled catalog, not translated display titles.
const CERTIFIED=[
  'boss-6cn54q09sv','boss-frudzw3n73','boss-ny34cxleh8',
  'super-linked-hfyjv8jqr5',
  'super-linked-1hh6q5xl6l','super-linked-qfnpbofkiq',
  'super-linked-70qpd43i45','super-linked-f4c9vuptqj',
  'super-linked-gnp7aga2sx','super-linked-swxudk82v1',
  'super-linked-kt6bb0wm0k','super-linked-lzer9x4edb',
  'super-linked-jo12qmyc5v','super-linked-80kqa7jo0h'
];
const GAPS={
  'digits-of-despair':['全地图交互与剧情相关的动态解谜状态'],
  'lineage-of-logic':['全地图交互与剧情相关的动态解谜状态'],
  'prologue-empty-house':['序章多阶段教学地图与动态迷雾相关的完整提示推理约束'],
  'super-sudokoid-1':['全地图关联线索、动态状态和特殊区域的完整一致性'],
  'super-sudokoid-2':['全地图关联线索、动态状态和特殊区域的完整一致性'],
  'boss-84lyno986x':['洞穴黑白区域连通','Akari 照明与提灯位置','灯笼邻格计数'],
  'boss-mtrhhm8g95':['动态推导不规则宫','区域连通性和线条跨宫规则'],
  'boss-ofvhfxebg3':['蛇身路径及不接触规则','列索引','奇数标记','杀手笼总和'],
  'boss-qs2zx7uynr':['房间编号外侧线索','杀手笼总和'],
  'boss-vmp8mhugbr':['交叉处数字数值分摊','十和线动态分段'],
  'boss-xu2ai5oymi':['外侧摩天楼','圈箭头','黑色倍数点'],
  'boss-boss-a-nights-tale':['星系旋转对称分区','星星数量分组','星系求和和彗星白点'],
  'boss-boss-big-little-lines':['白点和小杀手外侧对角线'],
  'boss-boss-bone-constrictor':['动态不规则宫','石像鬼 X-Sums','黑色倍数点'],
  'boss-boss-clones-quad':['克隆区域','白点冲刺','不等号'],
  'boss-boss-fantasy-footwork':['连续线舞池','反 XV','攀墙箭头'],
  'boss-boss-hot-cuisine':['高温格加值','数值修正的三明治','攀墙箭头'],
  'boss-boss-in10sity':['十和杀手区域','挂锁 XV 提示'],
  'boss-boss-saving-grace':['闪现最近目标','可变配料三明治'],
  'boss-boss-stalking-the-freezer':['Icelom 非交叉路径','冰面区域等和','冰柱数值修正'],
  'boss-boss-the-witching-hour':['闪现最近目标','倍数/连续点','攀墙箭头'],
  'boss-boss-through-the-ringer':['模仿格旋转数值','弹弓箭头','黑点'],
  'super-linked-hf8r43jwsj':['1–3 迷你区域数独','温度计','拉链线'],
  'super-linked-n4c0dem40c':['多层母脑变形及盘面动态结构'],
  'super-linked-u6cj0y3fzy':['藤蔓低语线','必须覆盖苹果的蛇身路径'],
  'super-linked-y4o6cjk9ao':['王后/主教视线与挡墙','合法穿越路径'],
  'super-linked-64c4lkb5ss':['奇偶双蛇','蛇邻域计数','方向不等号'],
  'super-linked-7asln8p2u1':['动态反弹的 Renban 导弹路径','局部 4×4 数独区域'],
  'super-linked-bpij5pdi3x':['未知屏障线机制','白色 SCAN 点'],
  'super-linked-dxr2zdfldv':['箭头圆圈求和','障碍反弹 Renban 路径'],
  'super-linked-dz1iu0r3tl':['九宫照片旋转复位','关联规则的动态匹配'],
  'super-linked-gidcd5jrz7':['未知屏障线机制','白色 SCAN 点'],
  'super-linked-vaz2rx345r':['跨宫等和路径','不可自接触及星格避让','九星全异']
};
export const ADVENTURE_HINT_COVERAGE=Object.freeze(Object.fromEntries([
  ...CERTIFIED.map(id=>[id,Object.freeze({status:'certified',unmodelled:[]})]),
  ...Object.entries(GAPS).map(([id,unmodelled])=>
    [id,Object.freeze({status:'partial',unmodelled:Object.freeze(unmodelled)})])
]));
export function adventureHintCoverage(id){
  return typeof id==='string'?ADVENTURE_HINT_COVERAGE[id]||null:null;
}
