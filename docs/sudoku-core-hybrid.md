# 混合人类逻辑求解器（sudoku-core + SudokuPadX）

## 适用范围
- 标准 9×9、显式验证过的空 \`hintRules\`、完整的九个 3×3 宫、无变体标记/迷雾/关卡规则：通过 Worker 调用 \`sudoku-core@4.1.1\`。
- 4×4、6×6、9×9、变体数独和大型地图仍然使用现有 Rust/Typed Constraint 逻辑，不把第三方标准数独算法当成变体证明。
- 老式 SCL 即使画面看起来像标准数独，若没有经过验证的 \`solverRules\`，不会触发第三方路径。
- 显示的 10 级难度来自 sudoku-core 对**当前剩余盘面**的分析，不替代 Rust 生成器的 1–5 技巧等级。
- 单步提示必须基于真实棋盘，**从不使用玩家候选标记作为证明前提**。

## 流程
1. \`src/hints/sudoku-core-adapter.js\` 验证资格，并从玩家大数字构造 81 格棋盘。
2. \`src/hints/sudoku-core-worker.js\` 检查至少存在一个解，执行 \`teachHint\`；唯一矩形/BUG+1 再确认唯一解。排除 Nishio forcing/guessing 作为常规逻辑步骤。
3. 只接受从**当前状态直接推出**的下一步，不跳过必要的前置消除、不偷偷直接采用解答；将更新映射成 \`Step\`、\`sources\`、\`removed\` 等字段。
4. \`src/hints/sudoku-core-adapter.js\` 结合当前用户已标候选，优先保留 Rust 已证明的确定填数。单独候选排除标记 \`forceElimination\`，不会因为暂时剩余一候选就错误宣称自动填数。
5. Hint+ 仍遵循既有规则：在提示作用的格子中，如果玩家留下唯一手记，会按照现有产品行为提升成填数。

## 通用 Rust 技巧

位于 \`crates/sudokupadx-core/src/creator/core_adapted.rs\`：
- \`two_string_kite\`（3 级）：行、列强链接在一个宫相接，远端共同可见的候选可被排除。
- \`w_wing\`（4 级）：同双候选翼格与数字强链接共同构成证明。
- \`simple_coloring\`（4 级）：单数字强链接二染色的 color trap / color wrap。

三个方法使用 \`units(n)\`、\`linked(n)\`、\`Mask\`，而不是硬编码 81 格。每次成功只排除一个被证明的候选，交给求解器主循环重新计算关联候选，方便后续技巧组合。带有针对 4/6/9 尺寸的 Rust 单元测试。

这只是第一批已移植通用技巧；并不意味着全部 31 项 sudoku-core 技巧都支持 4×4/6×6 或能够处理任意变体。

## 验证方式
- \`cargo test -p sudokupadx-core --all-targets\`
- \`npm test\`
- \`npm run build\`
- \`npm run build:web\`

如发现第三方不能认证的盘面，回退至现有原生求解器而非伪造提示。
