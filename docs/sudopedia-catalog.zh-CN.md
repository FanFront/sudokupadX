# Sudopedia 数独解题技巧总目录与进阶例题（中文）

> SudokuPadX 研究与教学用参考。**先以无猜测的推理验证谜题，再独立核对唯一解。**
>
> [基础与变体 25 课](techniques.zh-CN.md) ｜ [原始 Sudopedia 解题技巧目录](https://sudopedia.sudocue.net/index.php?title=Solving_technique) ｜ [131 个相关页面的分类索引](https://sudopedia.sudocue.net/index.php?title=Category:Solving_Techniques)

这是一份逐类整理的**中文学习与开发覆盖表**。Sudopedia 的 131 个分类页面里有别名、总论、图示、Killer 专项技巧和争议方法，不能直接把「131 个页面」等同于「131 个可独立出题的方法」。本表明确区分：

- **✓ 已实现**：生成器内有不依靠答案的候选数推理器，有可重放的来源和回归测试，允许成为玩家必需技巧。
- **≈ 已由通用规则覆盖**：属于另一技巧的常见别称／形态；逻辑已经支持，但不另造一个虚假的技巧 ID。
- **○ 学习材料／待实现**：介绍原理与识别特征，但目前不保证生成器能主动识别或生成专项题。
- **× 不纳入人类解题门槛**：需要题目「唯一解」的外部假设，或依赖对假设数字进行分叉、矛盾探索、穷举。

「已实现」**不代表每一粒种子都能生成以该技巧为必要突破的题**；教程模式只有在禁用目标技巧后、其他已实现方法不能解完题时才会接受。若找不到满足条件的几何布局，生成器明确失败而不造假。完整的图案编辑和自动构造专项题仍是需要持续优化的部分。

## 1. Singles｜基础唯一数

| Sudopedia 技巧 | 中文解释 | 覆盖 |
| --- | --- | --- |
| Full House | 一行／列／宫只剩一格，补齐缺少的数字 | ✓ |
| Last Digit | 某数字在其最后一个尚未确定的单位中仅剩一个位置 | ✓ |
| Hidden Single / Pinned Digit | 某行／列／宫的一个数字只有一处候选位置 | ✓ |
| Naked Single / Forced Digit / Sole Candidate | 单格仅剩一个可填数字 | ✓ |

**例题：** 第五行数字 6 只在 R5C7 有候选，尽管 R5C7 也写了其他备选，仍必填 **6**。

## 2. Intersections｜单位交集与锁定

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| Locked Candidates / Intersection Removal / Pointing / Claiming | 一个数字只能落在行列与宫的交集，删去目标单位交集外候选 | ✓ |
| Locked Pair / Locked Triple | 两／三个格子占用交集里的两／三个数字，结合显性数组和交集推理 | ≈ |
| Almost Locked Candidates (ALC) | 行宫交集中关联的准锁定数组带来额外删除 | ○ |

**例题：** 顶部左宫的 7 只可能在 R2C1、R2C3，第 2 行其他各宫均可删除 7。

## 3. Subsets｜显性与隐性数组

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| Naked Pair / Triple / Quad | N 格所有候选的并集恰好 N 个数字 | ✓ |
| Hidden Pair / Triple / Quad | N 个数字在一个单位中只占据 N 个格子 | ✓ |
| Naked Subset / Hidden Subset（总称） | 上面两组技巧的统一表达 | ✓ |

**例题：** R4C1 和 R4C5 同为 `{2,7}`，R4C6 为 `{2,5,7}`；该行的 2、7 已被两格占据，R4C6 **必为 5**。

## 4. Fish｜鱼形

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| Basic Fish / X-Wing | 两条基准行／列的某数字只在两条覆盖列／行出现 | ✓ |
| Swordfish | 三条基准线限制在三条覆盖线 | ✓ |
| Jellyfish | 四条基准线限制在四条覆盖线 | ✓ |
| Squirmbag | 五条基准线限制在五条覆盖线 | ✓ |
| Finned X-Wing | 双线鱼形之外多出的候选（鳍）被限制在一个宫 | ✓ |
| Finned Swordfish / Finned Jellyfish | 鳍形的三线、四线扩展 | ○ |
| Sashimi X-Wing / Swordfish / Jellyfish | 一个核心鱼形位置可缺失，由鳍补上逻辑关系 | ○ |
| Franken Fish | 基准／覆盖单位中包含宫，而不只是行列 | ○ |
| Mutant Fish | 混合行、列、宫组成鱼形 | ○ |
| Kraken Fish | 鳍与删除目标之间还有额外关联链 | ○ |
| Finned/Skewed Fish、Grouped Turbot Fish | 鱼形的特殊变体与混合形态 | ○ |

### 新例题 A：Squirmbag（五行鱼）

在 9×9 中，数字 **8** 在下列五行中只能放在列集合内：

| 行 | 8 的候选列 |
| --- | --- |
| R1 | C1、C3 |
| R3 | C3、C5 |
| R5 | C5、C7 |
| R7 | C7、C9 |
| R9 | C1、C9 |

五行的 8 必须各占一处，合起来只能占用 **C1、C3、C5、C7、C9** 这五列。因此，**R2C1 不能含有候选 8**；其他非基准行的这五列也要删 8。

这不是逐个假设五行的具体填法，而是「五个必需数字只能占五列」的计数证明。

### 新例题 B：Finned X-Wing（鳍形 X 翼）

数字 **6**：第一行只能在 **R1C4、R1C8**；第五行有 **R5C4、R5C8**，但还多一个 **R5C5（鳍）**。后者与 R5C4 同属中上区域的 *3×3 中宫*（准确说是第 4～6 行、第 4～6 列的宫）。

目标 **R4C4** 与 R5C4 同列，同时与 R5C5 同宫，因此必不能为 6：

- R1C4 若为 6，C4 其他格立即不能为 6；
- 否则 R1C8 为 6，第五行就不能在 C8 放 6，只能在 R5C4 或鳍 R5C5 放 6；目标对这两个位置都互斥。

两种可能都推出同一结论，因此 **R4C4 删除 6**。

## 5. Single-Digit Patterns｜单数字图案

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| Skyscraper（摩天楼） | 两条相平行的强关联共用一侧，另一侧至少有一个候选为真 | ✓ |
| 2-String Kite（双线风筝） | 一条行强关联与一条列强关联在宫内形成弱关联 | ✓ |
| Empty Rectangle（空矩形） | 一个宫的候选限制在十字行列上，再连接外部强关联 | ○ |
| Turbot Fish（涡轮鱼） | 用两个强关联和中间弱关联概括摩天楼、双线风筝等 | ≈ |
| Grouped Turbot Fish | 允许一个端点代表同宫多个候选位置 | ○ |

### 新例题 C：2-String Kite

考察数字 **4**：

- R2 只有 R2C2、R2C8 可以是 4（行强关联）。
- C3 只有 R3C3、R8C3 可以是 4（列强关联）。
- R2C2 与 R3C3 同属左上宫，因此不能同时为 4。

如果 R2C2 不为 4，R2C8 必为 4；如果 R3C3 不为 4，R8C3 必为 4。而 R2C2、R3C3 不可能同时为 4，故**外侧两个尖端 R2C8、R8C3 至少一个为 4**。R8C8 同时看见它们，因而 **R8C8 删除 4**。

「强关联」指两个候选位置中*至少有一个*为真；「弱关联」指两个位置*不能同时*为真。棋盘上看见的是固定候选结构，不需要先任选一个数尝试。

## 6. Coloring｜单数字染色

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| Simple Colors / Coloring（简单双染色） | 每条同数字强关联两端用不同颜色标记 | ✓ |
| Color Trap（颜色陷阱） | 某格看见同一染色链的两种颜色，候选可删除 | ✓ |
| Color Wrap（颜色包围） | 同色两候选互见，那种颜色整体为假 | ✓ |
| Multi-Colors / Color Wing | 两个或多个染色簇之间推导删除 | ○ |
| Weak Colors / X-Colors | 加入弱边或染色假设的进一步推理 | ○ |
| 3D Medusa | 多个数字之间联动的候选染色 | ○ |
| Grouped Coloring | 用候选组代替单格的染色节点 | ○ |
| Supercoloring / Ultracoloring | 更广义的染色系统 | ○ |

### 新例题 D：Color Trap（颜色陷阱）

考察 7 的强关联路径：

```text
R2C2（蓝）== R2C5（橙） == R5C5（蓝） == R6C6（橙）
```

其中第一个 `==` 表示第 2 行的两个唯一 7，第二个表示第 5 列的两个唯一 7，第三个表示中宫内的两个唯一 7。链上的数字 7 只能按「蓝色为真」或「橙色为真」两种交替方式存在。

**R6C2** 同时看见蓝色的 R2C2（同列）和橙色的 R6C6（同行），无论哪种染色为真，该格都不可能为 7，故**删去 7**。

### 新例题 E：Color Wrap（颜色包围）

考察链 `R2C2（蓝）—R2C3（橙）—R3C3（蓝）—R3C8（橙）`，其中三条相邻关联分别是第 2 行、第 3 列、第 3 行的强关联。

两个蓝色位置 R2C2 和 R3C3 **同属左上宫**，不可能同时为 7；但同一颜色在强关联链中总是一起成立或一起被排除，所以蓝色整体不成立。于是 **R2C2 和 R3C3 都删去 7**。

## 7. Chains and Loops｜链与环

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| X-Chain（单数字链） | 同一数字交替连接强／弱边，两端推出至少一端为真 | ✓（限五条边） |
| XY-Chain（双候选链） | 每个格只有两个候选，接力传递候选互斥关系 | ✓（限六格） |
| Remote Pairs（远程数对） | 相同双候选的偶数格链，两端占用相反的两个数字 | ✓ |
| Fishy Cycle / X-Cycle | 单数字强弱边组成闭合环 | ○ |
| Nice Loops / Alternating Inference Chain (AIC) | 广义交替推理链，可混合不同数字 | ○ |
| Double Implication Chain | 两端相互蕴涵或两个方向都能形成必然结论 | ○ |
| XY-Cycle | XY 链闭环的特殊形式 | ○ |
| Broken Wing | 奇数长度环带来的候选删除 | ○ |
| Generalized Fishy Cycles | 允许更广义节点与复杂链 | ○ |
| Oriented Chains（xyt／xyz／nrct 等） | 在链中利用此前已传播的约束挑选下一个节点 | ○ |
| Forcing Chain（泛称） | 一条单路推理链可能归结为 AIC；若靠设错数字寻找矛盾则不用于玩家门槛 | ○／× |

### 新例题 F：Remote Pairs（远程数对）

四格的候选都恰好是 `{1,5}`：

```text
R2C2 -- R2C5 -- R6C5 -- R6C8
```

相邻两格分别同行、同列、同行，所以每一对都必须一个 1、一个 5。沿链交替四格后，两端 R2C2 与 R6C8 **一定一格为 1，另一格为 5**。因此同时看见两端的 **R2C8 删除 1 和 5**。

### 新例题 G：XY-Chain（双候选链）

```text
R2C2 {1,2} -- R2C5 {2,3} -- R6C5 {3,4} -- R6C8 {1,4}
```

四格按同一行、同一列、同一行连接，每步共享一个候选：

- 如果起点不是 1，它只能是 2，使下一格不能为 2、只能为 3；
- 接着第三格只能为 4，终点于是只能为 1。

因此**起点或终点至少有一个为 1**。R2C8 同时看见两端，必须删除 1。这里是长度明确的单链蕴涵，不是任选候选、搜索到失败再排除。

### 新例题 H：X-Chain（单数字链）

考察数字 7，按 **强—弱—强—弱—强** 的关系连接：

```text
R2C2 == R3C3 -- R3C5 == R8C5 -- R8C8 == R9C9
       强          弱          强          弱          强
```

第一条强边来自左上宫两个仅存的 7；第二条强边来自第 5 列；最后一条强边来自右下宫。两条弱边分别来自第 3 行和第 8 行的互斥。

如果 R2C2 不为 7，强、弱边会逐次迫使 R9C9 为 7。因此 R2C2 和 R9C9 **至少一个为 7**，同时看见两端的 **R2C9 可以删去 7**。生成器只探索最多五条边，不通过任意深度的试错网络推断。

## 8. Wings｜翼形

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| XY-Wing | `{X,Y}` 的中心与 `{X,Z}`、`{Y,Z}` 两翼 | ✓ |
| XYZ-Wing | `{X,Y,Z}` 中心和两个包含 Z 的双候选翼 | ✓ |
| W-Wing | 两个相同双候选格，经另一数字的强关联串起 | ✓ |
| WXYZ-Wing | 四格、多候选翼形，带有限定可放数字 | ○ |
| Skewed XY-Wing | 斜向／变形条件下的翼形 | ○ |

### 新例题 I：W-Wing

- R2C2 与 R7C8 的候选**都为 `{1,5}`**。
- 第 5 列的数字 1 **只可能**在 R2C5、R7C5（强关联）。
- R2C2 能看见 R2C5；R7C8 能看见 R7C5。

若 R2C2 不为 5，就为 1，从而 R2C5 不是 1，强关联迫使 R7C5 为 1，继而 R7C8 必为 5。反之 R2C2 若为 5，条件已经成立。

因此两端 R2C2、R7C8 **至少一个为 5**；同时看见两端的 **R7C2 删除 5**。该结论由固定的双候选与强关联直接得出。

## 9. Almost Locked Sets (ALS)｜准锁定数组

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| Almost Locked Set（ALS 基础定义） | 一个单位中 N 格具有 N+1 种候选数 | ✓ |
| ALS-XZ | 两个 ALS 有受限制的共同数字 X，可删除另一共同候选 Z | ✓（每组最多三格） |
| ALS-XY-Wing | 三个 ALS 之间用两个受限共数连接 | ○ |
| ALS-XY-Chain | 使用 ALS 作为链节点的延伸 | ○ |
| Death Blossom（死亡绽放） | 一个多候选中心与多组 ALS 连接 | ○ |
| Almost ALS | 候选数量比普通 ALS 更多的近似结构 | ○ |

### 新例题 J：ALS-XZ

两个准锁定数组：

- A：R2C2=`{1,3}` 与 R2C3=`{3,5}`，两格共三种数字 `{1,3,5}`。
- B：R4C2=`{1,5}`，一格共两种数字 `{1,5}`。

两组中候选 **1** 的位置 R2C2、R4C2 在同一列，**不可能都为 1**。所以至少一组不能使用 1：

- A 不使用 1 时，两格必须放 `{3,5}`，故 A 含有 5；
- B 不使用 1 时，它就必须为 5。

无论哪一种，数字 **5 必在 R2C3 或 R4C2**。目标 **R4C3** 同时看见两格，因而 **R4C3 删除 5**。

这就是 Restricted Common Digit `X=1` 与另一个 Common Digit `Z=5` 的关系；它不是把所有组合列出来硬排除。

## 10. Enumeration on Selected Cells｜局部组合排除

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| Aligned Pair Exclusion | 研究交集处两个格子的合法组合 | ○ |
| Aligned Triple Exclusion | 将上法扩展到三个格子 | ○ |
| Subset Exclusion | 对任意候选格组排除不相容组合 | ○ |

**教学提示：** 与穷举全盘不同，这些方法只在局部格组枚举候选；但要成为实际教学关卡，还需要**让玩家能看懂为何每个组合被排除**，因此暂不作为生成器的强制突破类型。

## 11. Miscellaneous｜其它结构

| 技巧 | 原理 | 覆盖 |
| --- | --- | --- |
| Sue de Coq | 行／宫交集的互补数组互相锁定，形成跨单位删候选 | ○ |
| Subset Counting / Extended Subset Principle | 用格子数与候选数的容量限制推断 | ○ |
| Braid Analysis / Traveling Pairs | 研究同一宫带／列带内的数对分布 | ○ |
| Constraint Subsets | 用统一的数学语言概括数组与鱼形 | ≈ |
| Equivalence Marks | 用相等、相反关系标注候选 | ○ |
| Gurth's Symmetrical Placement | 利用特定谜题的整体对称结构 | ○ |
| Cross-Hatching / Scanning | 按行列宫扫描数字位置 | ≈（基础排除） |
| Common Peer Elimination | 对共同可见位置删除互斥候选 | ≈（已有多项技巧） |

## 12. Uniqueness｜唯一解假设（**不作为必需技巧**）

| 技巧族 | 说明 | 策略 |
| --- | --- | --- |
| Uniqueness Test / Unique Rectangle | 利用「若这样填会形成第二个解」来否定候选 | × |
| Avoidable Rectangle | Unique Rectangle 在有已填格情况下的扩展 | × |
| Bivalue Universal Grave / BUG / BUG Lite | 对多个二候选格的特殊全局候选结构作唯一性假设 | × |
| Reverse BUG / Reverse BUG Lite | 类似原理，观察已填与空格的反向结构 | × |
| Uniqueness Clue Cover | 将提示数及唯一性假设用于候选排除 | × |

**学习例子：** 看到四角候选均为 `{2,8}` 的矩形，可以**识别**它可能与 Unique Rectangle 有关。但在 SudokuPadX 生成题中，普通规则与变体规则有可能让这个矩形没有交换对称性；**不能仅凭题目被验证为唯一解，就把「唯一矩形排除」当作玩家必须使用的步骤**。这类技巧是供了解其历史和争议，不会进入自动人类证明。

## 13. Techniques of Last Resort｜最后手段

| 技巧 | 说明 | 策略 |
| --- | --- | --- |
| Forcing Net | 候选假设向多个方向分叉、合流并试图导出矛盾 | × |
| Tabling / Trebor's Tables | 系统列举每个候选的推理后果 | × |
| Graded Equivalence Marks (GEM) | 复杂的颜色与强弱关系标记系统 | ○ |
| Bowman Bingo | 按假设数字追踪系统性推导 | × |
| Trial & Error / Ariadne's Thread / Bifurcation | 假设一候选并寻找失败证据 | × |
| Nishio | 特别针对一个数字的试错 | × |
| Templating / Pattern Overlay Method | 枚举一个数字的所有摆放模板 | × |
| Guessing | 无证明的猜数 | × |

这些内容可以作为数独算法或逻辑体系研究对象，但**不应让玩家必须猜测、回溯或穷举才得到谜题设计者预期的「啊哈」**。

## 14. Brute Force｜计算机校验

Backtracking Algorithms／回溯搜索：**仅用于完成题目后的独立唯一解验证**。导出的玩家 `trace`、课程示例和每个 `ahaMoment` 都不包含回溯分支。

## 15. 变体数独的专门演绎

Sudopedia 主要是传统 9×9 数独目录；SudokuPadX 还必须在同一证明系统里处理变体：

| 变体方法 | 可推结论 | 覆盖 |
| --- | --- | --- |
| Killer 笼的和／不可重复候选组合 | 由笼总和决定每格允许值 | ✓ |
| 45 Rule／Innie／Outie | 宫的和减去笼的和求内外剩余格 | ✓ |
| Killer Pair / Triple / Subset | 笼里某些数字只能局限在特定格组 | ○（局部笼组合已有，跨笼专项未实现） |
| Innie-Outie Difference / Cage-splitting | 多宫交界的剩余和差值 | ○ |
| Law of Leftovers | 等数量格组与区域之间的剩余数字相同 | ○ |
| Kropki 三格链、全行连续段划分 | 整行被连续数三元组覆盖 | ✓ |
| Renban 与 Killer 重合 | 连续数字的和确定区间 | ✓ |
| Renban 与 Kropki 划分同一单位 | 将 1–6 分成 123/456 两组 | ✓ |
| 区域和线与 Killer | 某段笼和传递到其他宫中的线段 | ✓ |
| 熵线与模三线交叉 | 两组类别交集直接固定数字 | ✓ |
| Between 与 Renban 内部重合 | 内部连续数必须夹在两个端点之间 | ✓ |
| 温度计、耳语线、黑白点、箭头、V/X | 与同行列宫及其它约束联动，产生候选删除 | ✓ |

## 怎样让「学到的技巧」真正用于关卡？

1. **构造图案**：先挑技巧对应的必要强关联／数组／线段组合，再摆放约束，不是等完成答案后随意画线。
2. **无猜测证明**：在不接触完整答案的求解器上，按教程等级反复应用可解释步骤，必须解完整盘面。
3. **必要性检查**：将目标方法禁用后，若其它已支持方法仍能完成，不能把题叫作「必学该方法」。
4. **归档实际例子**：存储 `method`、`source`、`cell`、`removed`、`remaining`；中文解释与标记都来自这份追踪记录。
5. **独立检查**：只有通过另一套完整求解搜索验证数学唯一性，才可发布题目。此搜索**不参与玩家提示**。
6. **诚实报告失败**：某个目标技巧在给定种子里构造不出来时，报告失败而不是添加一个用不上的装饰。

推荐使用：

```sh
# 默认 4×4 / 6×6 / 9×9 多规则章节
python3 scripts/generate_variants.py --seed 20261103

# 试着构造一个必须使用 XY-Chain 的 9×9 课程题；
# 如果几何结构不满足真实逻辑门槛，会明确报错
python3 scripts/generate_variants.py --seed 20261103 \
  --focus-size 9 --focus-technique xy_chain --attempts 300

# 试着选择至少需三级技巧的 9×9 章节
python3 scripts/generate_variants.py --seed 20261103 \
  --focus-size 9 --min-tier 3 --attempts 300
```

当前源码索引：`scripts/classic_techniques.py`、`scripts/chain_techniques.py`、`scripts/als_techniques.py`、`scripts/variant_logic.py` 和 `scripts/technique_catalog.py`。每新增一种求解方法，应同时补上完整中文说明、局部候选数验证测试、带真实来源的提示数据，以及随机完整答案不被误删的性质测试。

## 参考资料

这份中文教材是根据 Sudoku 推理定义**重新编写的原创例题和证明**，不是复制英文站点的长段内容。

- [Sudopedia 总目录](https://sudopedia.sudocue.net/index.php?title=Solving_technique)
- [Sudopedia: Category Solving Techniques](https://sudopedia.sudocue.net/index.php?title=Category:Solving_Techniques)
- [Sudopedia: Alternating Inference Chain](https://sudopedia.sudocue.net/index.php?title=Alternating_Inference_Chain)
- [Sudopedia: ALS-XZ](https://sudopedia.sudocue.net/index.php?title=ALS-XZ)
- [Sudopedia: Almost Locked Set](https://sudopedia.sudocue.net/index.php?title=Almost_Locked_Set)
- [Sudopedia: XY-Wing](https://sudopedia.sudocue.net/index.php?title=XY-Wing)
