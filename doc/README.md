# 书页电子书阅读器

书页是一个基于 Electron、React 和 TypeScript 的本地电子书阅读器。当前版本支持 PDF、TXT、只读 DOCX 和 EPUB，不需要上传文件或联网服务。

## 当前功能

- 从书架导入、打开和移除本地 PDF/TXT/DOCX/EPUB 文件
- 以只读纯文本方式阅读 DOCX 正文
- 阅读 EPUB 章节，按阅读顺序浏览并恢复章节内进度
- 支持同时打开多本书，并在左右分栏中分别阅读两本书
- PDF 分页、页码跳转、书签、手动缩放
- PDF 单页/双页浏览，以及根据窗口大小自动适应页面
- PDF 高 DPI 渲染，提升文字和线条清晰度
- PDF 支持键盘 `↑/↓`、`PageUp/PageDown` 翻页，`B` 切换当前页书签
- TXT 编码识别、滚动阅读、进度恢复和关键词搜索
- EPUB 目录标题、章节选择、章节内搜索、书签和阅读进度恢复
- 读书笔记和批注：保存当前位置、选中文本摘录和个人批注，不修改原文件
- 批注入口使用可拖动悬浮球，默认位于当前阅读区域右侧中部；滚动阅读内容时保持在视野内，点击后打开可拖动的笔记面板
- 阅读进度、书签、主题和 TXT 阅读设置持久化保存
- 支持明亮、深色和暖黄色主题
- 支持自定义阅读背景颜色，并在下次启动时恢复

## 开发运行

在项目根目录执行：

```powershell
npm.cmd install
$env:ELECTRON_RUN_AS_NODE = $null
npm.cmd run dev
```

常用检查命令：

```powershell
npm.cmd run lint    # TypeScript 类型检查
npm.cmd run build   # 构建 main、preload 和 renderer
npm.cmd test        # 运行 Vitest 单元测试
```

开发模式默认不自动打开 DevTools。需要调试时：

```powershell
$env:ELECTRON_DEVTOOLS = '1'
npm.cmd run dev
```

Electron 的 renderer 使用 Chromium 渲染 React 界面，主进程负责窗口、文件和 IPC。开发模式下，修改 `src/` 中的前端代码通常会由 Vite HMR 自动更新；没有更新时可使用 `Ctrl + R` 普通刷新，或使用 `Ctrl + Shift + R` 忽略缓存刷新。修改 `electron/` 中的主进程或 preload 代码后，需要停止并重新执行 `npm.cmd run dev`。

阅读页顶部的标签栏维护当前会话中已打开的书籍。点击“打开书籍”或从书架打开第二本书后，可以在“右栏”选择一本书；左栏是当前标签，两个阅读器各自保存页码、滚动位置、缩放和书签。键盘翻页和 `B` 书签快捷键默认作用于左栏，右栏可使用自身的控制按钮。

阅读器中的批注入口是独立的悬浮球，默认显示在当前阅读区域右侧中部。悬浮球可以拖到阅读区域和窗口可见范围内的其他位置；页面或阅读内容滚动后，它仍固定在视野中。点击悬浮球会打开“读书笔记”面板，面板标题栏支持拖动。关闭后再次打开会保留当前面板位置，切换书籍后恢复默认位置。

## 目录结构

```text
electron/       主进程、preload、IPC 服务和共享类型
src/app/        应用状态和页面切换
src/features/   书架和阅读器页面
src/readers/    PDF、TXT/DOCX、EPUB 阅读器和共享批注组件
src/styles/     全局样式
doc/            产品设计和技术实现文档
out/            构建生成目录
```

## 数据与限制

书籍原文件保留在用户原路径，应用数据保存在 Electron 的 `userData/library.json`。DOCX 仅提取正文，不保留复杂排版，也不支持旧版 DOC。EPUB 支持章节文本和常见语义排版；MVP 暂不显示书内图片、外部链接及 EPUB 自带 CSS。笔记仅保存在本地，不会修改或覆盖原书文件。云同步、账号和安装包发布也暂不支持。PDF 文件本身如果是低分辨率扫描图片，渲染分辨率无法恢复原始细节。

更多说明见 [DESIGN.md](./DESIGN.md) 和 [TECHNICAL_DESIGN.md](./TECHNICAL_DESIGN.md)。
