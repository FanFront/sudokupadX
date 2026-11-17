# SudokuPadX · Sudopedia 技巧目录与随机训练

源：[Sudopedia · Solving technique](https://sudopedia.sudocue.net/index.php?title=Solving_technique)

## 收录范围

- `src/sudopedia-catalog.js` 将该目录中逐个出现的**技巧、别名、常见子类及少数概念性条目**整理为 98 个可搜索的中英双语条目，覆盖 Singles、Intersections、Subsets、Fish、Single Digit Patterns、Coloring、Uniqueness、Chains/Loops、Wings、ALS、Selected Cell Enumeration、Miscellaneous、Last Resort 共 13 类。
- 唯一明确不作为条目的是 **Backtracking Algorithms（穷举回溯）**；它只允许用于独立验证谜题是否有唯一解，不能作为人类提示或课程步骤。
- 原来的 25 节变体课程保留；进入「数独课程」可浏览 25 节原课与 98 个新条目，按分类或中文／英文名称搜索。
- 每个条目的「核心原理」是原创中文概括，下面追加项目已有的 [Sudopedia 进阶分类、例题和实现状态](sudopedia-catalog.zh-CN.md)。同一大类下多项技巧共享必要的背景资料。

## 什么才算“可训练”

**收录目录 ≠ 已实现求解 ≠ 已认证训练。** 三者独立：

1. 目录中全部条目可阅读；“概念性总论”“同义别名”仍有条目，但不是每个都代表不同的候选删除推理器。
2. `scripts/generate_lessons.py` 遍历变体工坊产生的真实、无猜测推理轨迹，为每一个找到的实际 `method` 以及数对／数组的具体 `size` 保存棋盘、候选数中间状态、目标格和证明来源。另构造并验算 Full House、Last Digit、Naked Single 的基础盘面。
3. 题盘必须经过独立的**唯一解计数**，候选状态必须能在真正的规则下重放，且不排除实际解。没有对应技巧的真实证明时，客户端只允许阅读课程，**不展示虚假候选或无关题**。
4. 对于确有证明的技巧，点击 **生成随机训练棋盘**：客户端通过规则保持的行列宫变换、反射和（适用时）转置产生新棋盘，并同时变换给定数、答案、图形规则、候选数、目标和消去数字。变体盘面只采用保持相邻关系的几何变换，**不**随意置换杀手笼数字、箭头求和和高低分组。新训练不会覆盖当前正在玩的谜题。
5. `proof.method`、`proof.removed`、`proof.remaining` 必须与题盘匹配；原始几何坐标在随机化后不再作为当前题目的坐标解释。

## 仍未有专项随机训练的内容

目录覆盖不等于 98 个技巧都具有自动生成与证明器。**当前尚未给出专项证书**的高阶家族包含：Sashimi／Franken／Mutant／Kraken Fish、Empty Rectangle、Multi-Colors、3D Medusa、广义环／AIC／定向链、WXYZ-Wing、ALS-XY-Wing／Chain、Death Blossom、Sue de Coq、局部组合排除等。对于它们，当前 UI 会明确显示“练习验证中”，避免让“随便找一盘无关数独”冒充技巧训练。

唯一解假设家族、试错／猜测／Nishio、模板覆盖等**都保留阅读索引**；因其证明语义、前提或求解方式与现有无猜测训练器不同，尚不能声称存在对应的训练实例。此项仍是开发缺口，而不是“已经支持”的技巧。

## 复现与测试

```sh
npm test
npm run build
```

`npm test` 通过 `pretest` 先生成工坊题与课程证书，运行 Python 逻辑证明测试，再测试 `tests/sudopedia-training.test.mjs` 的目录完整性、不可训练条目的拒绝逻辑、随机化棋盘的所有行列宫合法性、解保留，以及经典与变体图形的稳定性。

**后续完善目标：** 为每项目前不可训练的真正技巧单独补充模式识别器、精确候选排除证明、可随机生成的结构模板与性质测试；在全部通过前，不允许启用虚假训练入口。
