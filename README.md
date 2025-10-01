# Adjust Heading in Tree

Adjust Heading in Tree 是一款针对 Markdown 与 Typst 文档的 VS Code 扩展，提供导航树、拖拽重排与批量层级调整，帮助你像操作“块”一样管理整段内容。

## 功能概览

- **标题结构导航**：在侧边栏展示 Markdown `#` 与 Typst `=` 标题形成的层级树，支持展开、折叠与点击定位。
- **拖拽重排**：在树中拖动标题即可连同子树移动到新位置，保持文档结构一致。
- **同级快速排序**：通过内联按钮或快捷键在同一父级内向上/向下移动标题块。
- **批量层级调整**：整体提升或降低选中标题及其子树的层级。
- **层级显示控制**：工具栏按钮可设置导航树的最大展开层级（空值展开全部，0 折叠）。
- **帮助面板**：一键查看常用操作说明并跳转到快捷键设置。

## 快捷键（默认）

| 操作              | Windows / Linux    | macOS             |
| ----------------- | ------------------ | ----------------- |
| 提升标题层级      | `Ctrl + Shift + ←` | `Cmd + Shift + ←` |
| 降低标题层级      | `Ctrl + Shift + →` | `Cmd + Shift + →` |
| 向上移动（同级）  | `Ctrl + Shift + ↑` | `Cmd + Shift + ↑` |
| 向下移动（同级）  | `Ctrl + Shift + ↓` | `Cmd + Shift + ↓` |
| 显示 / 隐藏导航栏 | `Ctrl + Shift + T` | `Cmd + Shift + T` |

> 所有快捷键都可在 VS Code `Preferences → Keyboard Shortcuts` 中自定义。“Adjust Heading Tree Help” 按钮可快速打开对应设置。

## 开发与调试

```bash
npm install
npm run compile
```

在 VS Code 中按 `F5` 进入 Extension Development Host，即可加载调试扩展。

## 许可

MIT License
