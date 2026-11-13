# SudokuPad X

[English](README.md) | **简体中文**

一款兼容 SudokuPad 谜题格式的 **Android 和网页版数独应用**，基于 Rust、Tauri 2 和自定义 Canvas 棋盘构建，主要支持冒险数独、离线游玩和中文本地化。

**[网页版在线游玩](https://fanfront.github.io/sudokupadX/)** · **[下载 Android APK](https://github.com/FanFront/sudokupadX/releases/download/android-test-latest/SudokuPadX-arm64.apk)**

## 主要功能

- **冒险数独：** 内置 Sudokuvania 1、2 和 Super Sudokoid 1、2，以及关联的支线谜题和首领谜题。
- **谜题库：** 支持检索内置的 [Sudoku Index](https://stefanlobbenmeier.github.io/sudoku-index/index.json) 索引和 Logic Masters Deutschland 谜题，打开兼容 SudokuPad 格式的题目，并下载以供离线游玩。
- **WPF PDF 题库：** 在谜题库的「WPF PDF」页签检索 [ropeko 的题型与赛事索引](https://logic-puzzles.ropeko.ch/php/db/search.php)，直接阅读 WPF 官方比赛题册 PDF，并用多色画笔、橡皮擦、撤销／重做在纸面标注。PDF 和逐页画笔笔迹均保存本机，断网可继续。Android 内置受限官方 PDF 下载接口；网页版能否访问取决于来源站点 CORS。历史赛事中非标准命名的 PDF 不一定能自动找到。
- **游戏操作：** 大型棋盘平移与缩放、战争迷雾、区域规则、关联谜题跳转、候选数、涂色、撤销/重做和自动保存进度。
- **中文支持：** 为有对应翻译的谜题显示中文规则和说明，同时保留原文。
- **存档互通：** 通过 JSON 导入、导出单个谜题的进度，在 Android、网页和已更新的 `sodokupadAndroid` 应用之间转移存档。

离线时可以**浏览**已内置的题库索引，但第三方谜题需要提前下载才能**离线游玩**。

## 开始使用

Android 用户可通过上方链接下载并安装 **APK 文件**（支持 Android 7.0+ 的 ARM64 设备）。GitHub Actions 的构建产物是 ZIP 压缩包，需先解压取得 APK，不能直接将 ZIP 改名为 APK。

进入应用后，打开 **游戏库**，即可选择内置游戏、搜索谜题或管理离线下载。探索到关联谜题所在区域后，可以进入支线或首领谜题，并在返回主地图时保留之前的视图位置。

## 数独解题技巧中文教程

在应用首页点击 **「解题技巧课堂」**，即可离线学习 25 节中文课程：支持按类别浏览、搜索及「已掌握」进度记录。**每节课直接打开原版 Rust／WASM 数独引擎的训练棋盘**，展示相关格子的中心候选数、杀手笼、线条和数字；通过真实键盘填写大数字或删除候选数完成指定推理，而非回答三选一问题。点击「返回课程」后，原谜题的数字、笔记、画线、视角和位置恢复（引擎撤销／重做历史会重置）。训练棋盘是**局部候选状态练习**，不冒充完整的唯一解数独。

文字版参考资料：[基础／变体 25 课](docs/techniques.zh-CN.md) ·
[Sudopedia 数独技巧总目录、实现状态与进阶中文例题](docs/sudopedia-catalog.zh-CN.md)。

当前 Python 无猜测求解器还支持双线风筝、W-Wing、远程数对、
简单双色陷阱／包围、有限长度的 X-Chain 和 XY-Chain、ALS-XZ、
鳍形 X-Wing、Squirmbag 五行鱼。高阶技巧只在基础逻辑无法推进时使用；
候选数穷举、回溯和依赖「唯一解」的假设不作为玩家必需解法。

内置「规则工坊」会生成 4×4、6×6、9×9 的多规则数独，并用不猜测的逻辑求解器验证所有题目。教程结合 [Sudopedia 解题技巧目录](https://sudopedia.sudocue.net/index.php?title=Solving_technique)，讲解唯一候选、数对／数组、锁定候选、X-Wing、剑鱼、水母、XY-Wing／XYZ-Wing、摩天楼、杀手笼 45 法则，以及连续线、熵线、模三线、夹心线等变体联动。

生成题的 `logicProfile.education` 保存**最低可通关技巧等级**、实际使用的技巧及其对应格子和候选数变化。求解器只通过逻辑排除完成题目；回溯只用于独立验证唯一解，不会当作玩家必需步骤。

## 网页版 Logic Masters / WPF 跨域检索

GitHub Pages 是静态托管，无法在浏览器中直接绕过第三方网站的 CORS。网页版统一通过白名单 Cloudflare Worker 请求 Logic Masters 搜索／详情、WPF 索引／题型和官方 PDF；Android 仍使用 Rust 原生接口。**必须先部署 Worker，并在 GitHub Actions 中配置 `PUZZLE_PROXY_URL` 公开仓库变量，才能在正式网页版启用检索。** 具体操作参见 [部署教程](docs/web-cors-proxy.zh-CN.md)。

## 开发与构建

需要 Node.js、Rust，以及对应平台的 [Tauri 2 开发环境](https://v2.tauri.app/start/prerequisites/)。

```sh
npm install
npm test
cargo test -p sudokupadx-core --all-targets
npm run tauri -- dev
```

开发网页版时，还需安装 Rust WebAssembly 目标和 `wasm-pack`：

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
npm run dev:web         # 本地网页预览
npm run build:web       # 网页生产构建
```

配置 Android SDK/NDK 并初始化 Tauri Android 工程后，可运行 `npm run android:build`。CI 通过 [GitHub Actions](https://github.com/FanFront/sudokupadX/actions/workflows/android.yml) 构建并发布使用测试证书签名的 APK。

## 注意事项

- 本项目**尚不能完全替代原版 SudokuPad**。部分特殊图形、规则和谜题格式可能存在渲染或行为差异。
- Logic Masters 谜题需要提供兼容的 SudokuPad 题目链接；只有图片或 PDF 的题目无法自动导入。
- 存档保存在各自的应用或浏览器本地。卸载应用、切换应用或更换 Android 签名证书前，请先导出存档。
- 内置与导入的第三方谜题版权归原作者所有。仓库中的 Android 签名密钥是公开的，**仅用于测试**，不可用于正式发布。
