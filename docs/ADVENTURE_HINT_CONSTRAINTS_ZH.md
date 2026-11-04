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
