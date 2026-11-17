// The published Sudopedia "Solving technique" index, normalized into
// individual, searchable Chinese lessons. Each row is an index entry or an
// explicitly named sub-technique; aliases share a method, not fabricated proofs.
// No candidate list, grid or solved step is invented here.
export const SUDOPEDIA_SOURCE='https://sudopedia.sudocue.net/index.php?title=Solving_technique';
export const SUDOPEDIA_GROUPS=Object.freeze([
  {id:'single',zh:'基础唯一数',stage:'basics'},
  {id:'intersection',zh:'单位交集',stage:'subsets'},
  {id:'subset',zh:'显性与隐性数组',stage:'subsets'},
  {id:'fish',zh:'鱼形推理',stage:'advanced-patterns'},
  {id:'single-digit',zh:'单数字结构',stage:'advanced-patterns'},
  {id:'coloring',zh:'染色推理',stage:'advanced-chains'},
  {id:'uniqueness',zh:'唯一解假设',stage:'special-methods'},
  {id:'chain',zh:'链与环',stage:'advanced-chains'},
  {id:'wing',zh:'翼形推理',stage:'advanced-patterns'},
  {id:'als',zh:'准锁定数组',stage:'advanced-sets'},
  {id:'enumeration',zh:'局部组合排除',stage:'advanced-sets'},
  {id:'misc',zh:'其他结构',stage:'special-methods'},
  {id:'last-resort',zh:'最后手段',stage:'special-methods'}
]);

// group | English name | Chinese title | solver method | explanation | optional subset size
// Last resort and uniqueness entries are documented in full, but are never
// mislabeled "verified" unless an actual technique-specific certificate exists.
const DATA=`
single|Full House|满宫最后一格|full_house|一行、一列或一宫仅剩一空格，用缺失数字直接确定该格。
single|Last Digit|最后一个该数字|last_digit|某个数字的八次出现已确定，只剩最后一次的位置需要定位。
single|Hidden Single / Pinned Digit|隐性唯一数|hidden_single|在某个行列宫中，某数字只剩唯一一个候选位置。
single|Naked Single / Forced Digit|显性唯一数|naked_single|某格在所有约束下只剩一个可用数字。
intersection|Locked Candidates / Pointing / Claiming|区块锁定候选|locked_candidate|某数字只在行列与宫的交集中出现，因此交集外可删除它。
intersection|Locked Pair|锁定数对||处在同一行宫交集中的显性数对，同时限制两种单位的其他候选。
intersection|Locked Triple|锁定三数组||交集中三个格被三种数字占据，可在关联的行宫中同步排除。
intersection|Almost Locked Candidates|准锁定交集||交集内的准锁定数组与其余单位候选形成额外关联。
subset|Naked Subset|显性数组总论|naked_subset|同单位的 N 格候选并集只有 N 种数字，其他格不能使用这些数字。
subset|Naked Pair|显性数对|naked_subset|同单位两格被两个数字锁住，排除其余位置的这两个候选。|2
subset|Naked Triple|显性三数组|naked_subset|三格候选的并集恰有三种数字，构成显性三数组。|3
subset|Naked Quad|显性四数组|naked_subset|四格候选的并集恰有四种数字，构成显性四数组。|4
subset|Hidden Subset|隐性数组总论|hidden_subset|同单位的 N 个数字只能占 N 格，删去这 N 格的其他候选。
subset|Hidden Pair|隐性数对|hidden_subset|两个数字只可能在单位内两个位置出现，删去两格的其他候选。|2
subset|Hidden Triple|隐性三数组|hidden_subset|三个数字仅出现在单位内三个格中。|3
subset|Hidden Quad|隐性四数组|hidden_subset|四个数字仅出现在单位内四个格中。|4
fish|Basic Fish|基本鱼形总论|x_wing|用 N 条基准行或列和 N 条覆盖列或行锁定同一数字。
fish|X-Wing|X 翼双行鱼|x_wing|两条行或列的同数字候选恰落在两条覆盖线上。
fish|Swordfish|剑鱼三行鱼|swordfish|三条基准线的同数字候选局限在三条覆盖线上。
fish|Jellyfish|水母四行鱼|jellyfish|四条基准线的同数字候选局限在四条覆盖线上。
fish|Squirmbag|五行鱼|squirmbag|五条基准线和五条覆盖线形成大鱼形计数约束。
fish|Fish and Subsets|鱼形与数组关系||鱼形和数组是行列数字占位计数的两个视角。
fish|Finned Fish|鳍形鱼|finned_x_wing|允许基准行额外的同宫鳍候选，限定删数位置。
fish|Finned X-Wing|鳍形 X 翼|finned_x_wing|两条行列形成 X 翼核心，额外鳍在宫中限制删数区域。
fish|Finned Swordfish|鳍形剑鱼|finned_swordfish|三行列鱼核心有额外候选鳍。
fish|Finned Jellyfish|鳍形水母|finned_jellyfish|四行列鱼核心有额外候选鳍。
fish|Sashimi Fish|生鱼片鱼形|sashimi_fish|带鳍但主体鱼形缺少一个候选位置的特殊鱼。
fish|Sashimi X-Wing|生鱼片 X 翼|sashimi_fish|两线生鱼片鱼形的特殊情况。
fish|Franken Fish|Franken 混合鱼|franken_fish|基础单位允许使用宫与行列混合。
fish|Mutant Fish|Mutant 变异鱼|mutant_fish|基准和覆盖约束可以同时混合行、列与宫。
fish|Kraken Fish|Kraken 关联鱼||通过鳍与目标候选之间的间接推理链实施删除。
single-digit|Skyscraper|摩天楼|skyscraper|两个平行的双候选强关联，一侧互斥使另一侧至少一真。
single-digit|2-String Kite|双线风筝|two_string_kite|一条行强关联、一条列强关联在宫中形成互斥。
single-digit|Empty Rectangle|空矩形|empty_rectangle|一个宫内候选限制在十字行列上，接外部强关联实现排除。
coloring|Simple Colors|简单双染色|color_trap|沿强关联给同一数字的候选交替染色。
coloring|Multi-Colors|多簇染色|multi_colors|在多个互不连接的强关联染色簇之间寻找推理。
coloring|Supercoloring|超染色||多簇染色的推广名称。
coloring|Weak Colors|弱边染色||在强关联染色基础上使用弱关联、铰链推理。
coloring|X-Colors|X 染色||在两色情形下继续传播各颜色对应的逻辑含义。
coloring|Color Trap|颜色陷阱|color_trap|目标同时看见同一染色簇的两种颜色，因此可删除目标数字。
coloring|Color Wrap|颜色包围|color_wrap|同色两候选相互可见，整个颜色集合为假。
coloring|Color Wing|颜色翼|multi_colors|多色簇联动的别名。
coloring|3D Medusa|三维美杜莎|medusa_trap|跨数字的强弱关联组成的扩展染色。
uniqueness|Uniqueness Test / Unique Rectangle|唯一矩形判定||仅在可交换矩形确实可能破坏解唯一性时才适用；依赖唯一解前提。
uniqueness|Avoidable Rectangle|可避矩形||把部分已填格纳入唯一矩形的推导。
uniqueness|Bivalue Universal Grave / BUG|双候选通用墓穴||所有未填格成双候选的特殊死局结构。
uniqueness|BUG Lite|简化 BUG||局部化的双候选墓穴结构。
uniqueness|Reverse BUG|反向 BUG||从已填格和互换结构反向观察 BUG。
uniqueness|Reverse BUG Lite|反向简化 BUG||对局部反向结构进行唯一解条件分析。
uniqueness|Uniqueness Clue Cover|给定数唯一性覆盖||结合已知数字与唯一解假设限制候选。
uniqueness|Uniqueness Controversy|唯一解假设争议||说明唯一解相关手法的逻辑前提与适用局限，并非可独立训练的删数方法。
chain|Forcing Chain|强制链总论||通过确定的蕴涵关系组成链；不可将无界试错伪称单链证明。
chain|X-Chain|单数字链|x_chain|同一数字强弱关联交替连接，得到链端至少一真。
chain|XY-Chain|双候选链|xy_chain|一串双候选格交替传递互斥关系，端点可产生删除。
chain|Remote Pairs|远程数对|remote_pairs|同样两个候选数字沿双候选格交替，端点一真一假。
chain|Fishy Cycle / X-Cycle|单数字鱼形环||同数字强弱关系构成闭合的环。
chain|Generalized Fishy Cycles|广义鱼形环||允许更广义候选节点与连接的鱼形环。
chain|Broken Wing|断翼奇环||奇数长度的推理环引出排除。
chain|Nice Loops|漂亮环||根据严格的强弱链规则构造闭合回路。
chain|Double Implication Chain|双向蕴涵链||链可由两个方向导出同一确定结论。
chain|Alternating Inference Chain / AIC|交替推理链|aic|强弱推理边交替的广义候选链。
chain|Oriented Chains|定向链总论||利用已传播候选信息选择下一环，分二维与三维形式。
chain|xyt-chain|xyt 定向链||在二维定向 XY 链中加入跟踪信息。
chain|xyz-chain|xyz 定向链||在二维定向链中允许额外候选关联。
chain|xyzt-chain|xyzt 定向链||在二维定向链中同时融合多种传递规则。
chain|hxyt-chain|隐性 xyt 链||xyt 的隐性候选版本。
chain|hxyz-chain|隐性 xyz 链||xyz 的隐性候选版本。
chain|hxyzt-chain|隐性 xyzt 链||xyzt 的隐性候选版本。
chain|nrct-chain|nrct 三维链||三维定向链的一种形式。
chain|nrcz-chain|nrcz 三维链||另一种三维定向链。
chain|nrczt-chain|nrczt 三维链||融合前述约束的三维定向链。
wing|XY-Wing|XY 三格翼|xy_wing|双候选中心 XY 与两个钳位 XZ、YZ 导出共同候选 Z。
wing|XYZ-Wing|XYZ 三格翼|xyz_wing|三候选中心 XYZ 与两个含 Z 的双候选钳位联动。
wing|WXYZ-Wing|WXYZ 四格翼|wxyz_wing|一格四候选和三格双候选构成更高阶翼形。
wing|W-Wing|W 双数对翼|w_wing|两个相同的双候选格经过一种数字的强关联相连。
als|Almost Locked Sets|准锁定数组总论|als_xz|同单位 N 格共有 N+1 种候选数。
als|ALS-XZ|ALS-XZ 规则|als_xz|两组 ALS 有受限共数 X，可删除另一共数 Z。
als|ALS-XY-Wing|ALS-XY 翼|als_xy_wing|三组 ALS 由两种受限共数连接。
als|ALS-XY-Chain|ALS-XY 链|als_xy_chain|用 ALS 作链节点实现交替传递。
als|Death Blossom|死亡绽放|death_blossom|一个中心多候选格连接多个 ALS 花瓣。
als|Almost ALS|准准锁定数组||比普通 ALS 再多一个候选的宽松结构。
enumeration|Aligned Pair Exclusion|对齐数对组合排除||检查交集内两格候选配对，不可省略组合证明。
enumeration|Aligned Triple Exclusion|对齐三数组组合排除||检查交集内三格候选组合及冲突。
enumeration|Subset Exclusion|任意数组组合排除||对不需对齐的局部格组进行可证明的组合删减。
misc|Sue de Coq|Sue de Coq 数组|sue_de_coq|在行宫交集利用互补数位限制两个单位。
misc|Subset Counting|数组计数||通过数字在某格组中必须出现的次数约束候选。
misc|Braid Analysis / Traveling Pairs|带状数对分析||观察宫带中数对的重复分布。
misc|Constraint Subsets|广义约束数组||用约束计数统一描述数组和鱼形。
misc|Equivalence Marks|等价标记||用奇偶关系、同真同假关系追踪候选。
misc|Gurth's Symmetrical Placement|Gurth 对称放置||对有特定旋转对称规律的题盘应用对称推理。
last-resort|Forcing Net|分叉推理网络||将互相依赖的分支合流；属于最后手段，不应掩饰其枚举性质。
last-resort|Tabling / Trebor's Tables|蕴涵表格||完整记录候选蕴涵关系；通常复杂且成本高。
last-resort|Graded Equivalence Marks / GEM|分级等价标记||从两个互补起点建立逐级候选等价记号。
last-resort|Bowman Bingo|鲍曼宾果||系统追踪候选假设的蕴涵，属于试错法。
last-resort|Trial & Error / Ariadne's Thread / Bifurcation|假设与试错||先假定候选成立，再跟踪矛盾；不是无猜测一步推理。
last-resort|Nishio|Nishio 单数字试错||在单个数字的候选上追踪假设的后果。
last-resort|Templating / Pattern Overlay Method|模板覆盖法||列举某数字合法分布的所有模板，以共同结论删候选。
last-resort|Guessing|无依据猜测||没有可解释排除证明的任意尝试，不生成伪训练题。`;

export const SUDOPEDIA_TECHNIQUES=Object.freeze(DATA.trim().split('\n').map((line,index)=>{
  const [group,name,zh,method,description,size]=line.split('|');
  if(!SUDOPEDIA_GROUPS.some(item=>item.id===group)||!name||!zh||!description)
    throw Error('Sudopedia 技巧目录格式错误: '+line);
  const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  return Object.freeze({
    id:26+index,slug,group,name,zh,method:method||null,
    size:size?Number(size):null,description,
    stage:SUDOPEDIA_GROUPS.find(item=>item.id===group).stage,
    title:zh+'（'+name+'）',
    content:'**核心原理：** '+description+'\n\n**训练原则：** 只有当无猜测求解器在真实盘面中证明了此技巧的指定推理步骤，且谜题独立验证为唯一解，才能开启练习；不能拿别的技巧的消除步骤冒充本技巧。\n\n**来源：** [Sudopedia 技巧目录]('+SUDOPEDIA_SOURCE+')。'
  });
}));
export const SUDOPEDIA_BY_ID=new Map(SUDOPEDIA_TECHNIQUES.map(item=>[item.id,item]));
