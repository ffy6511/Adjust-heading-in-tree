import * as vscode from "vscode";
import { TagIndexService, TagDefinition } from "../services/tagIndexService";
import { COMMON_ICONS } from "../constants/tagIcons";

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
      "Manage Tags",
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

  private _normalizeDefinitions(defs: TagDefinition[]): TagDefinition[] {
    return defs.map((def) => ({
      ...def,
      pinned: !!def.pinned,
    }));
  }

  private _countPinned(defs: TagDefinition[]): number {
    return defs.filter((def) => def.pinned).length;
  }

  private async _saveDefinition(def: TagDefinition, oldName?: string) {
    // 验证标签名称
    const validationError = this._validateTagName(def.name);
    if (validationError) {
      vscode.window.showErrorMessage(validationError);
      return;
    }

    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const userDefs = this._normalizeDefinitions(
      config.get<TagDefinition[]>("tags.definitions", [])
    );

    if (oldName && oldName !== def.name) {
      // 重命名：从用户配置中移除旧的
      const idx = userDefs.findIndex((d) => d.name === oldName);
      if (idx >= 0) {
        userDefs.splice(idx, 1);
      }
    }

    let pinnedCount = this._countPinned(userDefs);
    const normalizedDef: TagDefinition = { ...def, pinned: !!def.pinned };

    const existingIdx = userDefs.findIndex((d) => d.name === def.name);
    const willPin =
      normalizedDef.pinned &&
      (existingIdx < 0 || !userDefs[existingIdx].pinned);

    if (willPin && pinnedCount >= 6) {
      vscode.window.showErrorMessage("Maximum 6 pinned tags allowed");
      return;
    }

    if (
      !oldName &&
      existingIdx < 0 &&
      !normalizedDef.pinned &&
      pinnedCount < 6
    ) {
      normalizedDef.pinned = true;
      pinnedCount++;
    }

    // Update pinned count when toggling off an existing pinned tag
    if (
      existingIdx >= 0 &&
      userDefs[existingIdx].pinned &&
      !normalizedDef.pinned
    ) {
      pinnedCount = Math.max(0, pinnedCount - 1);
    }

    // 更新或添加到用户配置
    if (existingIdx >= 0) {
      userDefs[existingIdx] = normalizedDef;
    } else {
      userDefs.push(normalizedDef);
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
      placeHolder: "e.g., Important, Todo, Review",
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

    const styleUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "tagDefinitions",
        "style.css"
      )
    );

    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "tagDefinitions",
        "main.js"
      )
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>Manage Tags</title>
</head>
<body>
    <div class="header">
        <h1><span class="codicon codicon-tag"></span> Manage Tags</h1>
    </div>

    <div class="naming-hint">
        <span class="codicon codicon-info"></span>
        Tag names can contain Chinese characters, punctuation, letters, numbers, etc. <strong> Space characters are not allowed. </strong>
    </div>

    <div class="controls-row">
        <input type="text" id="tagSearch" class="tag-search" placeholder="Search tags...">
        <button class="add-btn" id="addBtn">
            <span class="codicon codicon-plus"></span> New
        </button>
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
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
