[English Guide](#english-guide) | [Github Repo](https://github.com/ffy6511/Adjust-heading-in-tree.git)

<div align="center">
  <img src="./resources/icons/logo.png" alt="logo" width="100">
</div>

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=ffy6511.adjust-heading-in-tree)
[![Version](https://img.shields.io/visual-studio-marketplace/v/ffy6511.adjust-heading-in-tree)](https://marketplace.visualstudio.com/items?itemName=ffy6511.adjust-heading-in-tree)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/ffy6511.adjust-heading-in-tree)](https://marketplace.visualstudio.com/items?itemName=ffy6511.adjust-heading-in-tree)
[![License](https://img.shields.io/github/license/ffy6511/Adjust-heading-in-tree)](./LICENSE)

Adjust Heading in Tree 是一款针对 Markdown 与 Typst 文档的 VS Code 扩展，提供导航树、拖拽重排、批量层级调整与块级标签机制，帮助你像操作“块”一样管理整段内容。

## ✨️ 功能特性

- **块级标签**：使用`Tag`来组织管理您的文件! 为标题块添加标签，支持全局/当前文件切换、搜索、多选, 并可在 Tag 管理面板中自定义颜色、图标等。标签注释固定写在标题下一行，避免污染 Typora 等编辑器的大纲视图；
- **Remark 备注**：支持为 block 添加备注，自动归类到 Remark 标签便于查询. 并已同步到 TOC/Tag View 的 hover 按钮组中。

<div align="center">
  <img src="https://my-blog-img-1358266118.cos.ap-guangzhou.myqcloud.com/undefined20260108151419515.png?imageSlim" alt="cover" width="80%">
</div>

- **标题导航与筛选**：侧边栏展示层级树，支持展开/折叠/点击定位，一键控制最大展开层级. 想要深入钻研某一区域?可以选中区域单独展示；
- **拖拽与同级重排**：拖动标题即可连同子树迁移位置，同级内可用内联按钮或快捷键快速上/下移，保持结构一致；
- **批量层级调整**：一键整体提升或降低选中标题及其子树的层级；
- **子树导出**：将选中的标题子树导出为 PDF 或 PNG（需 Tinymist），便于分享或后续处理。

## 自定义操作

### 个性化编辑您的 Tag 样式

在 Panel 中自定义您的 tag 名称、icon、颜色以及...显示优先级!

<div align="center">
  <img src="https://my-blog-img-1358266118.cos.ap-guangzhou.myqcloud.com/undefined20251209202614590.png?imageSlim" alt="cover" width="80%">
</div>

### 统一标题注释格式

新版本会将标题的标签和备注注释固定在标题下一行。旧的标题行右侧注释仍可被解析；当您编辑标签/备注，或在 Tag View 的批量工具栏中点击“格式化当前文件标题注释”按钮时，扩展会将旧格式迁移到下一行。

Markdown:

```markdown
## Heading text
<!-- #TagA #TagB :: remark text :: -->
```

Typst:

```typst
== Heading text
// #TagA #TagB :: remark text ::
```

### 将您的常用操作固定到 hover 栏

<div align="center">
  <img src="https://my-blog-img-1358266118.cos.ap-guangzhou.myqcloud.com/undefined20260108151550372.png?imageSlim" alt="cover" width="80%">
</div>

现在您可以自定义 hover 到 item 上的 Toolbar,通过拖拽来添加、删除和排序. 构建自己的工作区!

### 使用快捷键快捷操作

| 操作              | Windows / Linux    | macOS             |
| ----------------- | ------------------ | ----------------- |
| 提升标题层级      | `Ctrl + Shift + ←` | `Cmd + Shift + ←` |
| 降低标题层级      | `Ctrl + Shift + →` | `Cmd + Shift + →` |
| 向上移动（同级）  | `Ctrl + Shift + ↑` | `Cmd + Shift + ↑` |
| 向下移动（同级）  | `Ctrl + Shift + ↓` | `Cmd + Shift + ↓` |
| 显示 / 隐藏导航栏 | `Ctrl + Shift + T` | `Cmd + Shift + T` |

> 可在 VS Code `Preferences → Keyboard Shortcuts` 中自定义。“TOC Help” 按钮可快速打开对应设置。

## CLI 与 Codex skill

现在仓库同时维护 VS Code 扩展和独立的 `AHT CLI`，两者共享同一套标题解析与编辑核心逻辑。

常用工作流:

1. 安装依赖:

   ```bash
   npm install
   ```

2. 单独构建扩展:

   ```bash
   npm run build:extension
   ```

3. 单独构建 CLI:

   ```bash
   npm run build:cli
   ```

4. 一次构建全部产物:

   ```bash
   npm run build:all
   ```

5. 本地链接 CLI:

   ```bash
   npm link --workspace packages/aht-cli
   ```

常用 CLI 命令:

```bash
aht list --file note.md --json
aht normalize --file note.md
aht tags set --file note.md --selector 'text:Alpha' --tags Review --write
aht move --file note.md --selector 'text:Gamma' --before 'text:Alpha' --write
```

CLI 分发流程:

```bash
npm run pack:cli
npm run publish:cli
npm run brew:formula
```

`npm run publish:cli` 会发布 `packages/aht-cli` 这个 npm 包。`npm run brew:formula` 会在发布后根据 npm tarball 生成一个依赖 Node 的 Homebrew formula。

Typst 子树导出依赖外部 `tinymist` CLI。`aht export` 会先检测是否存在该命令；如果不存在，会提示您先安装。

## 许可

MIT License

# English Guide

Adjust Heading in Tree is a VS Code extension for Markdown and Typst documents. It provides navigation trees, drag-and-drop rearrangements, batch hierarchy adjustments, and block-level tagging so you can manage entire sections like modular blocks.

## ✨️ Features

- **Block tags / Tag View**: Organize with tags; pin key tags, auto-fill the list when pins are fewer than the limit, toggle global/current-file scope, search, multi-select, and remove references. Customize colors/icons/pin limit in the Tag Definitions panel. Tag comments are stored on the line below the heading so editor outlines stay readable.

<div align="center">
  <img src="https://my-blog-img-1358266118.cos.ap-guangzhou.myqcloud.com/undefined20260108151419515.png?imageSlim" alt="cover" width="80%">
</div>

- **Navigation & filtering**: Sidebar tree for Markdown `#` and Typst `=` with expand/collapse/jump, max-depth control, and quick filters to subtree or ancestor scopes.
- **Drag and reorder**: Drag a heading to move its entire subtree; reorder siblings via inline buttons or shortcuts.
- **Batch level shift**: Promote or demote selected headings and their subtrees together.
- **Subtree export**: Export a heading subtree as PDF or PNG (Tinymist required) for sharing or further processing.

## Customize

### Personalize your tag styles

Use the panel to set tag names, icons, colors, and display priority.

<div align="center">
  <img src="https://my-blog-img-1358266118.cos.ap-guangzhou.myqcloud.com/undefined20251209202614590.png?imageSlim" alt="cover" width="80%">
</div>

### Normalize heading comment format

The extension stores tag and remark comments on the line below each heading. Legacy inline comments at the end of the heading line still parse correctly. When you edit tags or remarks, or use the format button in the Tag View batch toolbar, the extension migrates inline comments to the next line.

Markdown:

```markdown
## Heading text
<!-- #TagA #TagB :: remark text :: -->
```

Typst:

```typst
== Heading text
// #TagA #TagB :: remark text ::
```

### Pin common actions to the hover bar

<div align="center">
  <img src="https://my-blog-img-1358266118.cos.ap-guangzhou.myqcloud.com/undefined20260108151550372.png?imageSlim" alt="cover" width="80%">
</div>

Customize the hover toolbar shown on items: drag to add, remove, and reorder buttons to build your workspace.

### Shortcuts

| Action                 | Windows / Linux    | macOS             |
| ---------------------- | ------------------ | ----------------- |
| Promote heading level  | `Ctrl + Shift + ←` | `Cmd + Shift + ←` |
| Demote heading level   | `Ctrl + Shift + →` | `Cmd + Shift + →` |
| Move up (same level)   | `Ctrl + Shift + ↑` | `Cmd + Shift + ↑` |
| Move down (same level) | `Ctrl + Shift + ↓` | `Cmd + Shift + ↓` |
| Toggle tree visibility | `Ctrl + Shift + T` | `Cmd + Shift + T` |

> All shortcuts can be customized via VS Code `Preferences → Keyboard Shortcuts`. The "TOC Help" command opens the relevant settings instantly.

## CLI and Codex skill

The repository now ships both the VS Code extension and a standalone `AHT CLI`, while keeping one shared heading engine.

Common workflow:

1. Install dependencies:

   ```bash
   npm install
   ```

2. Build the extension only:

   ```bash
   npm run build:extension
   ```

3. Build the CLI only:

   ```bash
   npm run build:cli
   ```

4. Build both artifacts:

   ```bash
   npm run build:all
   ```

5. Link the CLI locally:

   ```bash
   npm link --workspace packages/aht-cli
   ```

Common CLI commands:

```bash
aht list --file note.md --json
aht normalize --file note.md
aht tags set --file note.md --selector 'text:Alpha' --tags Review --write
aht move --file note.md --selector 'text:Gamma' --before 'text:Alpha' --write
```

CLI distribution flow:

```bash
npm run pack:cli
npm run publish:cli
npm run brew:formula
```

`npm run publish:cli` publishes the `packages/aht-cli` npm package. `npm run brew:formula` then generates a Node-based Homebrew formula from the published npm tarball.

Typst subtree export depends on the external `tinymist` CLI. `aht export` checks for it first and prints an install hint if the binary is missing.

### License

MIT License
