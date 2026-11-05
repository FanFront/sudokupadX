export const VARIANTS=[
  ['killer','杀手笼',[4,6,9]],
  ['kropki','黑白点',[4,6,9]],
  ['thermo','温度计',[4,6,9]],
  ['renban','连续线',[4,6,9]],
  ['arrow','箭头',[4,6,9]],
  ['xv','V/X 标记',[4,6,9]],
  ['whisper','耳语线',[9]],
  ['entropic','熵线',[6,9]],
  ['modular','模三线',[6,9]],
  ['between','夹心线',[6,9]],
  ['region_sum','区域和线',[6,9]],
  ['parity','奇偶格（圆奇方偶）',[4,6,9]],
  ['inequality','不等号',[4,6,9]],
  ['clone','克隆同值格',[4,6,9]],
  ['thermo_unknown','无圆头温度计',[4,6,9]],
  ['little_killer','小杀手斜线和',[6,9]],
  ['anti_knight_anchors','反马步锚点',[6,9]],
  ['anti_whisper_anchors','反耳语锚点',[9]]
];
export const TECHNIQUES=[
  ['','任意技巧（严格匹配等级）',1],
  ['hidden_single','隐性唯一数',1],
  ['peer_elimination','基础排除',1],
  ['killer_sum','杀手笼组合',1],
  ['kropki','黑白点排除',1],
  ['thermo','温度计递增',1],
  ['renban','连续线',1],
  ['arrow','箭头求和',1],
  ['whisper','耳语线',1],
  ['xv','V/X 标记',1],
  ['entropic','熵线',1],
  ['modular','模三线',1],
  ['between','夹心线',1],
  ['region_sum','区域和线',1],
  ['parity','奇偶标记',1],
  ['inequality','不等式',1],
  ['clone','克隆同值',1],
  ['thermo_unknown','无圆头温度计',1],
  ['little_killer','小杀手斜线和',1],
  ['anti_knight_anchors','反马步锚点',1],
  ['anti_whisper_anchors','反耳语锚点',1],
  ['naked_subset','显性数对 / 数组',2],
  ['hidden_subset','隐性数对 / 数组',2],
  ['locked_candidate','锁定候选数',2],
  ['x_wing','X-Wing',3],
  ['swordfish','Swordfish',3],
  ['xy_wing','XY-Wing',3],
  ['skyscraper','摩天楼 Skyscraper',3],
  ['jellyfish','Jellyfish',4],
  ['xyz_wing','XYZ-Wing',4],
  ['xy_chain','XY-Chain',4]
];
export function availableVariants(size){
  return VARIANTS.filter(([, ,sizes])=>sizes.includes(Number(size)));
}
const METHOD_RULE={killer_sum:'killer',kropki:'kropki',thermo:'thermo',
  renban:'renban',whisper:'whisper',arrow:'arrow',xv:'xv',
  entropic:'entropic',modular:'modular',between:'between',region_sum:'region_sum',
  parity:'parity',inequality:'inequality',clone:'clone',
  thermo_unknown:'thermo_unknown',little_killer:'little_killer',
  anti_knight_anchors:'anti_knight_anchors',
  anti_whisper_anchors:'anti_whisper_anchors'};
export function availableTechniques(size,tier,selectedVariants=[]){
  if(Number(tier)===5)return TECHNIQUES.slice(0,1);
  return TECHNIQUES.filter(([name,,level])=>level<=Number(tier)&&
    (!METHOD_RULE[name]||selectedVariants.includes(METHOD_RULE[name])));
}
export function validateCreatorOptions({size,tier,variants,focus,density,attempts}){
  size=Number(size);tier=Number(tier);attempts=Number(attempts);
  if(![4,6,9].includes(size)||![1,2,3,4,5].includes(tier))
    throw Error('无效棋盘或技巧等级');
  if(size!==9&&tier>=3)throw Error('目前等级 3–5 仅支持 9×9');
  const supported=new Set(availableVariants(size).map(([name])=>name));
  if(!Array.isArray(variants)||variants.some(v=>!supported.has(v))||
     new Set(variants).size!==variants.length)throw Error('包含无效或重复的变体规则');
  if(!['light','medium','heavy'].includes(density))throw Error('规则密度无效');
  if(!Number.isInteger(attempts)||attempts<1||attempts>80)
    throw Error('尝试次数必须在 1–80 之间');
  if(!availableTechniques(size,tier,variants).some(([name])=>name===focus))
    throw Error('重点技巧不受当前棋盘、规则或等级支持');
  return {size,tier,variants,focus:focus||null,density,attempts};
}
