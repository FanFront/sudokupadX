# SudokuPad X

[English](README.md) | **简体中文**

一款兼容 SudokuPad 谜题格式的 **Android 和网页版数独应用**，基于 Rust、Tauri 2 和自定义 Canvas 棋盘构建，主要支持冒险数独、离线游玩和中文本地化。

**[网页版在线游玩](https://fanfront.github.io/sudokupadX/)** · **[下载 Android APK](https://github.com/FanFront/sudokupadX/releases/download/android-test-latest/SudokuPadX-arm64.apk)**

## 主要功能

- **冒险数独：** 内置 Sudokuvania 1、2 和 Super Sudokoid 1、2，以及关联的支线谜题和首领谜题。
- **谜题库：** 支持检索内置的 [Sudoku Index](https://stefanlobbenmeier.github.io/sudoku-index/index.json) 索引和 Logic Masters Deutschland 谜题，打开兼容 SudokuPad 格式的题目，并下载以供离线游玩。
- **游戏操作：** 大型棋盘平移与缩放、战争迷雾、区域规则、关联谜题跳转、候选数、涂色、撤销/重做和自动保存进度。
- **中文支持：** 为有对应翻译的谜题显示中文规则和说明，同时保留原文。
- **存档互通：** 通过 JSON 导入、导出单个谜题的进度，在 Android、网页和已更新的 `sodokupadAndroid` 应用之间转移存档。

离线时可以**浏览**已内置的题库索引，但第三方谜题需要提前下载才能**离线游玩**。

## 开始使用

Android 用户可通过上方链接下载并安装 **APK 文件**（支持 Android 7.0+ 的 ARM64 设备）。GitHub Actions 的构建产物是 ZIP 压缩包，需先解压取得 APK，不能直接将 ZIP 改名为 APK。

进入应用后，打开 **游戏库**，即可选择内置游戏、搜索谜题或管理离线下载。探索到关联谜题所在区域后，可以进入支线或首领谜题，并在返回主地图时保留之前的视图位置。

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
