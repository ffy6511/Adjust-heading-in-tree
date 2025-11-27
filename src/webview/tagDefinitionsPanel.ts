import * as vscode from "vscode";
import { TagIndexService, TagDefinition } from "../services/tagIndexService";

// 常用的 Codicons 图标列表
const COMMON_ICONS = [
  "circle-large-outline",
  "circle-filled",
  "star",
  "star-full",
  "tag",
  "bookmark",
  "pin",
  "heart",
  "heart-filled",
  "check",
  "close",
  "info",
  "warning",
  "error",
  "flame",
  "lightbulb",
  "eye",
  "bell",
  "megaphone",
  "rocket",
  "zap",
  "pulse",
  "target",
  "milestone",
  "note",
  "notebook",
  "pencil",
  "edit",
  "comment",
  "question",
  "issue-opened",
  "issue-closed",
  "bug",
  "beaker",
  "calendar",
  "clock",
  "history",
  "watch",
  "stopwatch",
  "folder",
  "file",
  "archive",
  "package",
  "database",
  "link",
  "unlink",
  "globe",
  "home",
  "inbox",
  "mail",
  "send",
  "reply",
  "sync",
  "refresh",
  "arrow-up",
  "arrow-down",
  "arrow-left",
  "arrow-right",
  "chevron-up",
  "chevron-down",
  "triangle-up",
  "triangle-down",
  "plus",
  "dash",
  "x",
  "check-all",
  "circle-slash",
  "thumbsup",
  "thumbsdown",
  "smiley",
  "person",
  "organization",
  "key",
  "lock",
  "unlock",
  "shield",
  "verified",
  "settings",
  "settings-gear",
  "tools",
  "wrench",
  "extensions",
  "play",
  "debug-start",
  "terminal",
  "code",
  "symbol-method",
];

export class TagDefinitionsPanel {
  public static currentPanel: TagDefinitionsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _tagService: TagIndexService;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    tagService: TagIndexService
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._tagService = tagService;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        console.log("TagDefinitionsPanel: Received message:", message.command);
        switch (message.command) {
          case "getDefinitions":
            this._sendDefinitions();
            break;
          case "saveDefinition":
            await this._saveDefinition(message.definition, message.oldName);
            break;
          case "deleteDefinition":
            await this._deleteDefinition(message.name);
            break;
          case "renameTagInFiles":
            await this._renameTagInFiles(message.oldName, message.newName);
            break;
          case "addNewTag":
            await this._addNewTag();
            break;
          case "confirmRename":
            await this._confirmRename(
              message.definition,
              message.oldName,
              message.newName
            );
            break;
          case "confirmDelete":
            await this._confirmDelete(message.name);
            break;
          case "showError":
            vscode.window.showErrorMessage(message.message);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    tagService: TagIndexService
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TagDefinitionsPanel.currentPanel) {
      TagDefinitionsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "tagDefinitions",
      "Manage Tag Definitions",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, "resources"),
          vscode.Uri.joinPath(extensionUri, "node_modules"),
        ],
      }
    );

    TagDefinitionsPanel.currentPanel = new TagDefinitionsPanel(
      panel,
      extensionUri,
      tagService
    );
  }

  public dispose() {
    TagDefinitionsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _sendDefinitions() {
    const defs = this._tagService.getTagsFromSettings();
    this._panel.webview.postMessage({
      type: "definitions",
      data: defs,
      icons: COMMON_ICONS,
    });
  }

  /**
   * 验证标签名称是否合法（允许中文字符、标点符号，只要不是空格就行）
   */
  private _validateTagName(name: string): string | null {
    if (!name || !name.trim()) {
      return "Tag name cannot be empty";
    }
    if (/\s/.test(name)) {
      return "Tag name cannot contain spaces";
    }
    return null;
  }

  private async _saveDefinition(def: TagDefinition, oldName?: string) {
    // 验证标签名称
    const validationError = this._validateTagName(def.name);
    if (validationError) {
      vscode.window.showErrorMessage(validationError);
      return;
    }

    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const userDefs = config.get<TagDefinition[]>("tags.definitions", []);

    if (oldName && oldName !== def.name) {
      // 重命名：从用户配置中移除旧的
      const idx = userDefs.findIndex((d) => d.name === oldName);
      if (idx >= 0) {
        userDefs.splice(idx, 1);
      }
    }

    // 更新或添加到用户配置
    const existingIdx = userDefs.findIndex((d) => d.name === def.name);
    if (existingIdx >= 0) {
      userDefs[existingIdx] = def;
    } else {
      userDefs.push(def);
    }

    await config.update(
      "tags.definitions",
      userDefs,
      vscode.ConfigurationTarget.Global
    );
    this._tagService.scanWorkspace();
    this._sendDefinitions();
    vscode.window.showInformationMessage(`Tag "${def.name}" saved!`);
  }

  private async _deleteDefinition(name: string) {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const userDefs = config.get<TagDefinition[]>("tags.definitions", []);
    const allDefs = this._tagService.getTagsFromSettings();

    // 从完整列表中找到要删除的标签（包括预设标签）
    const tagToDelete = allDefs.find((d) => d.name === name);
    if (!tagToDelete) {
      vscode.window.showErrorMessage(`Tag "${name}" not found.`);
      return;
    }

    // 检查是否在用户配置中
    const idx = userDefs.findIndex((d) => d.name === name);
    if (idx >= 0) {
      // 从用户配置中删除
      userDefs.splice(idx, 1);
      await config.update(
        "tags.definitions",
        userDefs,
        vscode.ConfigurationTarget.Global
      );
    } else {
      // 如果是预设标签，没有在用户配置中，先将其加入用户配置然后再删除
      // 这样是为了彻底删除这个标签，让它不再显示
      userDefs.push({ ...tagToDelete });
      await config.update(
        "tags.definitions",
        userDefs,
        vscode.ConfigurationTarget.Global
      );
      userDefs.pop(); // 移除刚刚添加的
      await config.update(
        "tags.definitions",
        userDefs,
        vscode.ConfigurationTarget.Global
      );
    }

    this._tagService.scanWorkspace();
    this._sendDefinitions();

    vscode.window.showInformationMessage(`Tag "${name}" deleted permanently!`);
  }

  /**
   * 添加新标签（使用 VS Code 原生输入框）
   */
  private async _addNewTag() {
    const name = await vscode.window.showInputBox({
      prompt: "Enter new tag name",
      placeHolder: "e.g., important, todo, review",
      validateInput: (value) => this._validateTagName(value),
    });

    if (name && name.trim()) {
      const newDef: TagDefinition = {
        name: name.trim(),
        icon: "tag",
        color: "charts.blue",
      };
      await this._saveDefinition(newDef);
    }
  }

  /**
   * 确认重命名标签（使用 VS Code 原生确认框）
   */
  private async _confirmRename(
    definition: TagDefinition,
    oldName: string,
    newName: string
  ) {
    const result = await vscode.window.showWarningMessage(
      `Rename tag from "${oldName}" to "${newName}"?\nThis will update all files using this tag.`,
      { modal: true },
      "Rename"
    );

    if (result === "Rename") {
      await this._saveDefinition(definition, oldName);
      await this._renameTagInFiles(oldName, newName);
    }
  }

  /**
   * 确认删除标签（使用 VS Code 原生确认框）
   */
  private async _confirmDelete(name: string) {
    // 检查是否有文档使用该标签
    const blocks = this._tagService.getBlocksByTag(name);
    const hasReferences = blocks.length > 0;

    let result: string | undefined;
    if (hasReferences) {
      result = await vscode.window.showWarningMessage(
        `Delete tag "${name}"? Found ${blocks.length} reference(s) in documents.`,
        { modal: true },
        "Delete Definition Only",
        "Delete Definition and References"
      );
    } else {
      result = await vscode.window.showWarningMessage(
        `Delete tag "${name}"?`,
        { modal: true },
        "Delete"
      );
      if (result === "Delete") {
        result = "Delete Definition Only";
      }
    }

    if (result === "Delete Definition Only") {
      await this._deleteDefinition(name);
    } else if (result === "Delete Definition and References") {
      await this._deleteDefinition(name);
      await this._removeTagReferencesFromFiles(name);
    }
  }

  /**
   * 从所有文件中删除标签引用
   */
  private async _removeTagReferencesFromFiles(tagName: string): Promise<void> {
    // 转义正则特殊字符
    const escapedTag = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const files = await vscode.workspace.findFiles("**/*.{md,typ}");

    if (files.length === 0) {
      return;
    }

    let totalChanged = 0;
    const edit = new vscode.WorkspaceEdit();

    for (const fileUri of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const text = doc.getText();

        // 检查文件是否包含该标签
        if (!text.includes(`#${tagName}`)) {
          continue;
        }

        // 逐行处理
        for (let i = 0; i < doc.lineCount; i++) {
          const line = doc.lineAt(i);
          const lineText = line.text;

          // 匹配包含标签的注释部分
          const commentMatch = lineText.match(/\/\/(.*)$/);
          if (!commentMatch) {
            continue;
          }

          const commentPart = commentMatch[1];
          // 检查注释中是否包含目标标签
          const tagRegex = new RegExp(`#${escapedTag}(?=\\s|$)`, "g");
          if (!tagRegex.test(commentPart)) {
            continue;
          }

          // 删除标签（保留其他标签和注释符号）
          let newCommentPart = commentPart.replace(
            new RegExp(`\\s*#${escapedTag}(?=\\s|$)`, "g"),
            ""
          );

          // 清理多余空格
          newCommentPart = newCommentPart.replace(/\s+/g, " ").trim();

          let newLineText: string;
          if (newCommentPart === "" || newCommentPart.match(/^\s*$/)) {
            // 注释为空，删除整个注释部分（包括//）
            newLineText = lineText.replace(/\s*\/\/.*$/, "");
          } else {
            // 保留非空注释
            newLineText = lineText.replace(/\/\/.*$/, `// ${newCommentPart}`);
          }

          if (newLineText !== lineText) {
            edit.replace(fileUri, line.range, newLineText);
            totalChanged++;
          }
        }
      } catch (err) {
        console.error(`Error processing file ${fileUri.fsPath}:`, err);
      }
    }

    if (totalChanged > 0) {
      await vscode.workspace.applyEdit(edit);
      vscode.window.showInformationMessage(
        `Removed ${totalChanged} tag reference(s) from documents.`
      );
    }

    this._tagService.scanWorkspace();
    this._sendDefinitions();
  }

  /**
   * 在所有文件中重命名标签
   */
  private async _renameTagInFiles(
    oldName: string,
    newName: string
  ): Promise<void> {
    const blocks = this._tagService.getBlocksByTag(oldName);
    if (blocks.length === 0) {
      this._panel.webview.postMessage({ type: "renameComplete", count: 0 });
      return;
    }

    // 按文件分组
    const fileMap = new Map<string, { uri: vscode.Uri; lines: number[] }>();
    for (const block of blocks) {
      const key = block.uri.toString();
      if (!fileMap.has(key)) {
        fileMap.set(key, { uri: block.uri, lines: [] });
      }
      fileMap.get(key)!.lines.push(block.line);
    }

    let totalChanged = 0;
    const edit = new vscode.WorkspaceEdit();

    for (const [, file] of fileMap) {
      try {
        const doc = await vscode.workspace.openTextDocument(file.uri);
        for (const lineNum of file.lines) {
          const line = doc.lineAt(lineNum);
          const text = line.text;
          // 替换 #oldName 为 #newName
          const regex = new RegExp(`#${oldName}\\b`, "g");
          if (regex.test(text)) {
            const newText = text.replace(regex, `#${newName}`);
            edit.replace(file.uri, line.range, newText);
            totalChanged++;
          }
        }
      } catch (e) {
        console.error(`Error processing file ${file.uri.fsPath}:`, e);
      }
    }

    if (totalChanged > 0) {
      await vscode.workspace.applyEdit(edit);
    }

    this._panel.webview.postMessage({
      type: "renameComplete",
      count: totalChanged,
    });

    if (totalChanged > 0) {
      vscode.window.showInformationMessage(
        `Renamed #${oldName} to #${newName} in ${totalChanged} location(s).`
      );
      this._tagService.scanWorkspace();
    }
  }

  private _getWebviewContent(): string {
    const codiconsUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "node_modules",
        "@vscode/codicons",
        "dist",
        "codicon.css"
      )
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${codiconsUri}" rel="stylesheet" />
    <title>Manage Tag Definitions</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        h1 {
            font-size: 1.4em;
            margin-bottom: 20px;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 10px;
        }
        .tag-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 20px;
        }
        .tag-card {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            border: 1px solid var(--vscode-widget-border);
        }
        .tag-icon {
            font-size: 20px;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--vscode-badge-background);
            border-radius: 50%;
            cursor: pointer;
        }
        .tag-icon:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .tag-info {
            flex: 1 1 auto;
            min-width: 0;
        }
        .tag-name {
            font-weight: bold;
            font-size: 1.1em;
        }
        .tag-name input {
            font-size: 1.1em;
            font-weight: bold;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 4px 8px;
            width: 100%;
            min-width: 80px;
            max-width: 200px;
            box-sizing: border-box;
        }
        .tag-actions {
            display: flex;
            gap: 4px;
            flex-shrink: 0;
        }
        .icon-btn {
            width: 28px;
            height: 28px;
            padding: 0;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            transition: all 0.15s ease;
        }
        .icon-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            transform: scale(1.05);
        }
        .icon-btn.delete-btn:hover {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }
        .btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .btn-danger {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
        }
        .icon-picker {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            padding: 16px;
            max-width: 400px;
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            z-index: 1000;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        .icon-picker-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .icon-picker-search {
            width: 100%;
            padding: 8px;
            margin-bottom: 12px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
        }
        .icon-grid {
            display: grid;
            grid-template-columns: repeat(8, 1fr);
            gap: 8px;
            overflow-y: auto;
            max-height: 300px;
            padding: 4px;
        }
        .icon-option {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            border-radius: 4px;
            font-size: 18px;
        }
        .icon-option:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999;
        }
        .hidden { display: none !important; }
        .add-btn {
            padding: 6px 12px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.9em;
            display: flex;
            align-items: center;
            gap: 4px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .add-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .codicon { vertical-align: middle; }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            border-bottom: 1px solid var(--vscode-widget-border);
            padding-bottom: 12px;
        }
        .header h1 {
            margin: 0;
            border: none;
            padding: 0;
        }
        .naming-hint {
            padding: 8px 12px;
            margin-bottom: 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
            border-left: 3px solid var(--vscode-textBlockQuote-border);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1><span class="codicon codicon-tag"></span> Manage Tag Definitions</h1>
        <button class="add-btn" id="addBtn">
            <span class="codicon codicon-plus"></span> New
        </button>
    </div>

    <div class="naming-hint">
        <span class="codicon codicon-info"></span>
        Tag names can contain Chinese characters, punctuation, letters, numbers, etc. Space characters are not allowed.
    </div>

    <div id="tagList" class="tag-list"></div>

    <div id="overlay" class="overlay hidden"></div>
    <div id="iconPicker" class="icon-picker hidden">
        <div class="icon-picker-header">
            <span>Select Icon</span>
            <button class="btn btn-secondary" id="closeIconPicker">
                <span class="codicon codicon-close"></span>
            </button>
        </div>
        <input type="text" class="icon-picker-search" id="iconSearch" placeholder="Search icons...">
        <div class="icon-grid" id="iconGrid"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let definitions = [];
        let allIcons = [];
        let editingTag = null;
        let iconPickerCallback = null;

        // 请求初始数据
        vscode.postMessage({ command: 'getDefinitions' });

        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.type === 'definitions') {
                definitions = msg.data;
                allIcons = msg.icons;
                renderTags();
            } else if (msg.type === 'renameComplete') {
                // 重命名完成
            }
        });

        function renderTags() {
            const container = document.getElementById('tagList');
            container.innerHTML = '';

            definitions.forEach((def, index) => {
                const card = document.createElement('div');
                card.className = 'tag-card';
                card.innerHTML = \`
                    <div class="tag-icon" data-index="\${index}" title="Click to change icon">
                        <span class="codicon codicon-\${def.icon || 'tag'}"></span>
                    </div>
                    <div class="tag-info">
                        <div class="tag-name">
                            <input type="text" value="\${def.name}" data-index="\${index}" data-original="\${def.name}">
                        </div>
                    </div>
                    <div class="tag-actions">
                        <button class="icon-btn save-btn" data-index="\${index}" title="Save changes">
                            <span class="codicon codicon-check"></span>
                        </button>
                        <button class="icon-btn delete-btn" data-index="\${index}" title="Delete tag">
                            <span class="codicon codicon-close"></span>
                        </button>
                    </div>
                \`;
                container.appendChild(card);
            });

            // 绑定事件
            document.querySelectorAll('.tag-icon').forEach(el => {
                el.addEventListener('click', () => openIconPicker(parseInt(el.dataset.index)));
            });
            document.querySelectorAll('.save-btn').forEach(el => {
                el.addEventListener('click', () => saveTag(parseInt(el.dataset.index)));
            });
            document.querySelectorAll('.delete-btn').forEach(el => {
                el.addEventListener('click', () => deleteTag(parseInt(el.dataset.index)));
            });
        }

        function openIconPicker(index) {
            editingTag = index;
            const picker = document.getElementById('iconPicker');
            const overlay = document.getElementById('overlay');
            const grid = document.getElementById('iconGrid');

            renderIconGrid(allIcons);

            picker.classList.remove('hidden');
            overlay.classList.remove('hidden');
            document.getElementById('iconSearch').value = '';
            document.getElementById('iconSearch').focus();
        }

        function renderIconGrid(icons) {
            const grid = document.getElementById('iconGrid');
            grid.innerHTML = '';
            icons.forEach(icon => {
                const el = document.createElement('div');
                el.className = 'icon-option';
                el.innerHTML = \`<span class="codicon codicon-\${icon}"></span>\`;
                el.title = icon;
                el.addEventListener('click', () => selectIcon(icon));
                grid.appendChild(el);
            });
        }

        function selectIcon(icon) {
            if (editingTag !== null) {
                definitions[editingTag].icon = icon;
                renderTags();
                // 立即保存图标更改
                const def = definitions[editingTag];
                vscode.postMessage({ command: 'saveDefinition', definition: def });
            }
            closeIconPicker();
        }

        function closeIconPicker() {
            document.getElementById('iconPicker').classList.add('hidden');
            document.getElementById('overlay').classList.add('hidden');
            editingTag = null;
        }

        document.getElementById('closeIconPicker').addEventListener('click', closeIconPicker);
        document.getElementById('overlay').addEventListener('click', closeIconPicker);
        document.getElementById('iconSearch').addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allIcons.filter(i => i.includes(query));
            renderIconGrid(filtered);
        });

        function saveTag(index) {
            console.log('saveTag called, index:', index);
            const input = document.querySelector(\`input[data-index="\${index}"]\`);
            if (!input) {
                console.error('Input not found for index:', index);
                return;
            }
            const newName = input.value.trim();
            const oldName = input.dataset.original;

            console.log('Saving tag:', { newName, oldName, index });

            if (!newName) {
                // 使用 VS Code 原生方式显示错误
                vscode.postMessage({ command: 'showError', message: 'Tag name cannot be empty' });
                return;
            }

            const def = { ...definitions[index], name: newName };

            // 如果名称变化，使用扩展端确认对话框
            if (oldName && oldName !== newName) {
                vscode.postMessage({ command: 'confirmRename', definition: def, oldName, newName });
            } else {
                vscode.postMessage({ command: 'saveDefinition', definition: def });
            }
        }

        function deleteTag(index) {
            console.log('deleteTag called, index:', index);
            const def = definitions[index];
            // 使用扩展端确认对话框
            vscode.postMessage({ command: 'confirmDelete', name: def.name });
        }

        document.getElementById('addBtn').addEventListener('click', () => {
            console.log('Add button clicked');
            // 使用扩展端输入框
            vscode.postMessage({ command: 'addNewTag' });
        });
    </script>
</body>
</html>`;
  }
}
