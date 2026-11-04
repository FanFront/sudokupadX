# 大型谜题的结构化提示约束

## 为什么不能根据颜色求解？

SudokuPad 的 SCL 文件是可展示、可交互的题面格式，但不等于 SudokuMaker 编辑器里的全部约束模型。特别是从原作导出的 Sudokuvania 1/2 与 Super Sudokoid 1/2，`lines` 只有 `wayPoints`、`color`、`thickness`，没有可区分 Renban / Whisper / Between / Entropic 等规则的 `type` 字段。`overlays` 同样主要用于绘图。蓝色、绿色、紫色不能作为数学证明的前提。

有明确语义的现成元素仍可使用：`cages[].unique: true` 表示不重复，`regions` 列出区域成员；`cages[].value` 只是标签，不能未经确认便当作 killer 总和。新生成题目中的 `metadata.solverRules` 已包含结构化约束。

## 约束声明

在题目的 JSON / SCL 原始内容中增加 `metadata.hintConstraints`，只存放**已经由作者或人工核对的规则**。解题引擎只读取 `metadata.solverRules` 和 `metadata.hintConstraints`，不再从线色、形状或规则说明文字推断变体类型。

例如：

```json
{
  "metadata": {
    "hintConstraints": [
      {"type": "whisper", "cells": [[4, 1], [4, 2], [4, 3]]},
      {"type": "between", "cells": [[7, 3], [7, 4], [7, 5]]},
      {"type": "kropki", "cells": [[12, 1], [12, 2]], "dot": "white"},
      {"type": "killer", "cells": [[15, 0], [15, 1]], "sum": 9, "unique": true},
      {"type": "region_sum", "cells": [[20, 1], [20, 2], [20, 3]],
       "segments": [[[20, 1]], [[20, 2], [20, 3]]]}
    ]
  }
}
```

坐标使用**整张地图的 0 起始 [行,列]**，也可以填写全局 row-major 下标。线约束的格子必须按路径顺序填写。Arrow 的第一个格是圆圈，余下格为箭杆；也支持单独的 `circle` 和 `shaft` 数组。

需要动态解锁的约束可增加：

```json
{"type": "kropki", "cells": [[25, 3], [25, 4]], "dot": "white",
 "unlockCells": [[13, 37]]}
```

只有当至少一个 `unlockCells` 格已揭开、且参与推理的所有格均可见时，该约束才参与提示。玩家中心/角标候选仅影响提示是否有新进展，不构成求解证据。

当前识别的类型为 `killer`、`kropki`、`xv`、`whisper`、`thermo`、`renban`、`between`、`entropic`、`modular`、`region_sum`、`arrow`。未知/格式错误的类型自动跳过，而不是猜测。

## 四部冒险的补全工作

原始游戏的 SCL 大多**没有**这些类型字段，因此基础数独行列宫和明确的不重复组仍可用于提示；没有核实的彩色线条不会生成变体推理。要完整支持所有关卡，应先为每个原作谜题制作经过验证的约束清单，并把特殊规则解锁条件一并标注。该清单必须来源于明确的规则/作者资料或逐条人工核查，不能由颜色批量猜测。

注意：`metadata.solution` 仅可用于游戏检查与测试，不得用于生成步骤或解锁隐藏线索。


## 现已补充的高阶及冒险变体

推理引擎现在理解下列额外的**类型化规则**，它们完全不依赖颜色或装饰对象：

| 类型 | 具体语义 |
| --- | --- |
| `palindrome` | 回文线两端等距格数字相同 |
| `parity_line` | 相邻格奇偶性相反 |
| `zipline` | 距中心等远的两端数字之和等于中心 |
| `prime_sum` | 相邻格之和为质数 |
| `anti_xv` | 区域内相邻格数字之和不能为 5 或 10 |
| `anti_king` / `anti_knight` | 区域内对应棋步的两格不能重复 |
| `lava` | 相邻岩浆格数字差至少 2 |
| `reverse_whisper` | 相邻格数字差严格小于 5 |
| `shadow_lower` | 第一格小于后续指定邻格 |
| `greater_neighbors` | 第一格大于后续指定邻格 |
| `magic_square` | 按行优先顺序的九格使用 1–9 各一次，每行、列、主对角线之和为 15 |
| `crystal_cage` | `groups` 明确列出的每行/每列分组均等于 `sum` |
| `reverse_thermo` | 从圆头向末端数字严格递减 |

多格约束可以通过 `unlockCells` 声明规则知识的解锁位置；一旦规则已解锁，即使其部分格子仍被迷雾覆盖，也允许从**全程可见的局部结构**推理。隐藏的数字永远不能成为推理依据，也不能成为当前提示的目标。

目前四部原版冒险已有 **363 条版本指纹绑定的结构化约束**，分别是：

- Sudokuvania 1：57 条，包括黑点、低语、温度计和工厂反马；
- Sudokuvania 2：10 条已核验的杀手隔间；
- Super Sudokoid 1：125 条，包括白/黑点、低语、杀手隔间、反王、反马和 3×3 魔方阵；
- Super Sudokoid 2：172 条，包括白点、低语、逆温度计，以及有明确数字和的晶体笼。

构建期提取程序 `scripts/build-legacy-adventure-constraints.mjs` 根据已核实的作者规则说明、原题图形索引和原题答案做**离线一致性检查**，将结果写入明确类型的清单；运行时不读取原题答案，也不根据颜色重新推断规则。原题文件若发生变化，其指纹不匹配，旧清单不会自动应用。运行 `node scripts/build-legacy-adventure-constraints.mjs --check` 可检查清单是否与原题一致。

**未完成的覆盖**：Sudokuvania 2 的密码/数值变换/任务状态、Fillomino 墙、动态绘制任务线、传送门、望远镜与全局收集要素等还需要独立建模。这些特殊语义目前不会被假装成标准数独规则；不能证明的提示应明确停滞。
