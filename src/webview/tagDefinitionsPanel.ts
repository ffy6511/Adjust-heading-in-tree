import * as vscode from "vscode";
import { TagIndexService, TagDefinition } from "../services/tagIndexService";
import { COMMON_ICONS } from "../constants/tagIcons";
import {
  extractCommentContent,
  getCommentKindForDocument,
  normalizeTagsAndRemark,
  parseCommentContent,
  updateLineWithComment,
} from "../utils/tagRemark";

export class TagDefinitionsPanel {
  public static currentPanel: TagDefinitionsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _tagService: TagIndexService;
  private readonly _defaultColor = "#808080";
  private _disposables: vscode.Disposable[] = [];
  private _suppressTagSync = false;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    tagService: TagIndexService
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._tagService = tagService;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    // 监听配置变化，保证当设置面板或其他地方调整 Pin 上限时，WebView 状态保持一致
    this._disposables.push(
      vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (this._suppressTagSync) {
          return;
        }
        if (e.affectsConfiguration("adjustHeadingInTree.tags")) {
          await this._sendDefinitions();
        }
      })
    );
    this._panel.webview.html = this._getWebviewContent();

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        console.log("TagDefinitionsPanel: Received message:", message.command);
        switch (message.command) {
          case "getDefinitions":
            await this._sendDefinitions();
            break;
          case "saveDefinition":
            await this._saveDefinition(message.definition, message.oldName);
            break;
          case "saveRemarkDefinition":
            await this._saveRemarkDefinition(message.definition);
            break;
          case "deleteDefinition":
            await this._deleteDefinition(message.name);
            break;
          case "updateMaxPinnedDisplay":
            await this._updateMaxPinnedDisplay(message.value);
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

  private async _sendDefinitions() {
    await this._ensureRemarkDefinition();
    const { defs, unpinned } = await this._enforcePinLimit();
    const remarkDef = this._getRemarkDefinition();
    const ordered = this._sortDefinitions(this._filterRemark(defs));
    await this._panel.webview.postMessage({
      type: "definitions",
      data: ordered,
      remark: remarkDef,
      icons: COMMON_ICONS,
      maxPinnedDisplay: this._getMaxPinnedDisplay(),
    });

    // 若因外部设置变更导致自动 Unpin，给出提示（英文）
    if (unpinned.length > 0) {
      vscode.window.showInformationMessage(
        `Pinned tags exceeded limit; automatically unpinned: ${unpinned.join(
          ", "
        )}.`
      );
    }
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
      color: def.color ?? this._defaultColor,
    }));
  }

  private _getRemarkName(): string {
    return this._tagService.getRemarkName();
  }

  private _getRemarkDefinition(): TagDefinition {
    return this._tagService.getRemarkDefinition();
  }

  private _filterRemark(defs: TagDefinition[]): TagDefinition[] {
    const remarkName = this._getRemarkName();
    return defs.filter((def) => def.name !== remarkName);
  }

  private async _ensureRemarkDefinition(): Promise<void> {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const defs = this._normalizeDefinitions(
      config.get<TagDefinition[]>("tags.definitions", [])
    );
    const remarkDef = this._getRemarkDefinition();
    const index = defs.findIndex((def) => def.name === remarkDef.name);
    let changed = false;

    if (index >= 0) {
      const existing = defs[index];
      const merged: TagDefinition = {
        ...existing,
        name: remarkDef.name,
        icon: remarkDef.icon ?? existing.icon,
        color: remarkDef.color ?? existing.color,
        pinned: existing.pinned ?? remarkDef.pinned,
      };
      const same =
        existing.name === merged.name &&
        existing.icon === merged.icon &&
        existing.color === merged.color &&
        existing.pinned === merged.pinned;
      if (!same) {
        defs[index] = merged;
        changed = true;
      }
    } else {
      defs.unshift(remarkDef);
      changed = true;
    }

    if (changed) {
      const ordered = this._sortDefinitions(defs);
      await config.update(
        "tags.definitions",
        ordered,
        vscode.ConfigurationTarget.Global
      );
    }
  }

  private _countPinned(defs: TagDefinition[]): number {
    return defs.filter((def) => def.pinned).length;
  }

  /**
   * 读取标签视图的最大展示数量，用于限定默认自动 Pin 的数量
   */
  private _getMaxPinnedDisplay(): number {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const maxPinned = config.get<number>("tags.maxPinnedDisplay", 6);
    return Math.max(1, maxPinned);
  }

  /**
   * 更新标签视图的最大展示数量（来自前端面板的输入）
   */
  private async _updateMaxPinnedDisplay(value: number): Promise<void> {
    const min = 1;
    const max = 20;
    const sanitized = Math.min(max, Math.max(min, Math.floor(value || 0)));

    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const defs = this._tagService.getTagsFromSettings();
    const unpinned: string[] = await this._applyPinLimit(
      defs,
      sanitized,
      config
    );

    await config.update(
      "tags.maxPinnedDisplay",
      sanitized,
      vscode.ConfigurationTarget.Global
    );

    if (unpinned.length > 0) {
      vscode.window.showInformationMessage(
        `Pinned tags exceeded new limit (${sanitized}); automatically unpinned: ${unpinned.join(
          ", "
        )}.`
      );
    } else {
      vscode.window.showInformationMessage(
        `Tag View can display up to ${sanitized} tags without search.`
      );
    }

    // 更新当前面板显示
    void this._sendDefinitions();
  }

  /**
   * 根据当前配置，若 Pin 数超过上限则自动取消多余的 Pin（保留定义顺序的前 N 个）
   */
  private async _enforcePinLimit(): Promise<{
    defs: TagDefinition[];
    unpinned: string[];
  }> {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const defs = this._tagService.getTagsFromSettings();
    const maxPinned = this._getMaxPinnedDisplay();
    const unpinned = await this._applyPinLimit(defs, maxPinned, config);
    return { defs: this._sortDefinitions(defs), unpinned };
  }

  /**
   * 实际执行 Pin 限制，必要时写回配置。
   */
  private async _applyPinLimit(
    defs: TagDefinition[],
    limit: number,
    config: vscode.WorkspaceConfiguration
  ): Promise<string[]> {
    const pinnedNames = defs.filter((d) => d.pinned).map((d) => d.name);
    const unpinned: string[] = [];

    if (pinnedNames.length > limit) {
      const toUnpin = new Set(pinnedNames.slice(limit));
      for (const def of defs) {
        if (toUnpin.has(def.name)) {
          def.pinned = false;
          unpinned.push(def.name);
        }
      }
      const ordered = this._sortDefinitions(defs);
      await config.update(
        "tags.definitions",
        ordered,
        vscode.ConfigurationTarget.Global
      );
    }

    return unpinned;
  }

  /**
   * 将已 Pin 的标签提前展示，其他标签保持原有顺序
   */
  private _sortDefinitions(defs: TagDefinition[]): TagDefinition[] {
    const pinned: TagDefinition[] = [];
    const others: TagDefinition[] = [];
    for (const def of defs) {
      if (def.pinned) {
        pinned.push(def);
      } else {
        others.push(def);
      }
    }
    return [...pinned, ...others];
  }

  private async _saveDefinition(def: TagDefinition, oldName?: string) {
    // 验证标签名称
    const validationError = this._validateTagName(def.name);
    if (validationError) {
      vscode.window.showErrorMessage(validationError);
      return;
    }
    const remarkName = this._getRemarkName();
    if (def.name === remarkName || oldName === remarkName) {
      vscode.window.showErrorMessage("Tag name is reserved for remark.");
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
    const maxPinnedDisplay = this._getMaxPinnedDisplay();
    const normalizedDef: TagDefinition = {
      ...def,
      pinned: !!def.pinned,
      color: def.color ?? this._defaultColor,
    };

    const existingIdx = userDefs.findIndex((d) => d.name === def.name);
    const isNewDefinition = !oldName && existingIdx < 0;
    const wasPinned = existingIdx >= 0 ? userDefs[existingIdx].pinned : false;

    // 默认在可用展示名额内自动 Pin 新建标签，便于在 Tag View 中快速看到
    if (
      isNewDefinition &&
      !normalizedDef.pinned &&
      pinnedCount < maxPinnedDisplay
    ) {
      normalizedDef.pinned = true;
    }

    const willPin = normalizedDef.pinned && !wasPinned;
    // 当开启 Pin 时需要遵守当前配置的上限
    if (willPin && pinnedCount >= maxPinnedDisplay) {
      vscode.window.showErrorMessage(
        `Pin ${maxPinnedDisplay} tags at most，please unpin one.`
      );
      return;
    }

    if (willPin) {
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

    // 更新或添加到用户配置，并保证 Pin 标签排在前面
    if (existingIdx >= 0) {
      userDefs[existingIdx] = normalizedDef;
    } else {
      userDefs.push(normalizedDef);
    }

    const orderedDefs = this._sortDefinitions(userDefs);
    await config.update(
      "tags.definitions",
      orderedDefs,
      vscode.ConfigurationTarget.Global
    );
    this._tagService.scanWorkspace();
    await this._sendDefinitions();
    vscode.window.showInformationMessage(`Tag "${def.name}" saved!`);
  }

  private async _saveRemarkDefinition(def: TagDefinition) {
    const validationError = this._validateTagName(def.name);
    if (validationError) {
      vscode.window.showErrorMessage(validationError);
      return;
    }

    const oldName = this._getRemarkName();
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const userDefs = this._normalizeDefinitions(
      config.get<TagDefinition[]>("tags.definitions", [])
    );
    const otherDefs = userDefs.filter((d) => d.name !== oldName);
    if (otherDefs.some((d) => d.name === def.name)) {
      vscode.window.showErrorMessage("Tag name is already in use.");
      return;
    }

    const existingRemark = userDefs.find((d) => d.name === oldName);
    const remarkDef: TagDefinition = {
      name: def.name.trim(),
      icon: def.icon ?? existingRemark?.icon ?? "comment",
      color: def.color ?? existingRemark?.color ?? this._defaultColor,
      pinned: def.pinned ?? existingRemark?.pinned ?? true,
    };

    const maxPinnedDisplay = this._getMaxPinnedDisplay();
    const pinnedCount = this._countPinned(otherDefs);
    const wasPinned = existingRemark?.pinned ?? false;
    const willPin = remarkDef.pinned && !wasPinned;
    if (willPin && pinnedCount >= maxPinnedDisplay) {
      vscode.window.showErrorMessage(
        `Pin ${maxPinnedDisplay} tags at most，please unpin one.`
      );
      return;
    }

    const ordered = this._sortDefinitions([remarkDef, ...otherDefs]);
    this._suppressTagSync = true;
    try {
      await config.update(
        "tags.remarkName",
        remarkDef.name,
        vscode.ConfigurationTarget.Global
      );
      await config.update(
        "tags.definitions",
        ordered,
        vscode.ConfigurationTarget.Global
      );
    } finally {
      this._suppressTagSync = false;
    }

    if (oldName !== remarkDef.name) {
      await this._renameTagInFiles(oldName, remarkDef.name);
    }

    this._tagService.scanWorkspace();
    await this._sendDefinitions();
    vscode.window.showInformationMessage("Remark tag updated.");
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
    await this._sendDefinitions();

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
      if (name.trim() === this._getRemarkName()) {
        vscode.window.showErrorMessage("Tag name is reserved for remark.");
        return;
      }
      const newDef: TagDefinition = {
        name: name.trim(),
        icon: "tag",
        color: this._defaultColor,
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
    if (name === this._getRemarkName()) {
      vscode.window.showErrorMessage("Remark tag cannot be deleted.");
      return;
    }
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
    const files = await vscode.workspace.findFiles("**/*.{md,typ}");

    if (files.length === 0) {
      return;
    }

    let totalChanged = 0;
    const edit = new vscode.WorkspaceEdit();
    const remarkTagName = this._tagService.getRemarkName();

    for (const fileUri of files) {
      try {
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const text = doc.getText();
        const kind = getCommentKindForDocument(doc);

        // 检查文件是否包含该标签
        if (!text.includes(`#${tagName}`)) {
          continue;
        }

        // 逐行处理
        for (let i = 0; i < doc.lineCount; i++) {
          const line = doc.lineAt(i);
          const lineText = line.text;

          const commentPart = extractCommentContent(lineText, kind);
          if (!commentPart) {
            continue;
          }

          const { tags, remark } = parseCommentContent(commentPart);
          if (!tags.includes(tagName)) {
            continue;
          }

          const remainingTags = tags.filter((tag) => tag !== tagName);
          const { tags: normalizedTags, remark: normalizedRemark } =
            normalizeTagsAndRemark(remainingTags, remark, remarkTagName, {
              ensureRemarkTag: false,
            });
          const newLineText = updateLineWithComment(
            lineText,
            kind,
            normalizedTags,
            normalizedRemark
          );

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
    const remarkTagName = this._tagService.getRemarkName();

    for (const [, file] of fileMap) {
      try {
        const doc = await vscode.workspace.openTextDocument(file.uri);
        const kind = getCommentKindForDocument(doc);
        for (const lineNum of file.lines) {
          const line = doc.lineAt(lineNum);
          const text = line.text;
          const commentPart = extractCommentContent(text, kind);
          if (!commentPart) {
            continue;
          }

          const { tags, remark } = parseCommentContent(commentPart);
          if (!tags.includes(oldName)) {
            continue;
          }

          const renamedTags = tags.map((tag) =>
            tag === oldName ? newName : tag
          );
          const { tags: normalizedTags, remark: normalizedRemark } =
            normalizeTagsAndRemark(renamedTags, remark, remarkTagName, {
              ensureRemarkTag: false,
            });
          const newText = updateLineWithComment(
            text,
            kind,
            normalizedTags,
            normalizedRemark
          );
          if (newText !== text) {
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
    await this._sendDefinitions();
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

    <div class="remark-section">
        <div class="section-title">Remark Settings</div>
        <div class="remark-hint">Used when a heading only has a remark without other tags.</div>
        <div class="tag-card">
            <button class="color-btn" id="remarkColorBtn" title="Choose color">
            </button>
            <div class="tag-icon" id="remarkIcon" title="Click to change icon">
                <span class="codicon codicon-comment"></span>
            </div>
            <div class="tag-info">
                <div class="tag-name">
                    <input type="text" id="remarkNameInput" placeholder="remark">
                </div>
            </div>
            <div class="tag-actions">
                <button class="icon-btn pin-btn" id="remarkPinBtn" title="Pin this tag to show first in Tag View">
                    <span class="codicon codicon-pin"></span>
                </button>
                <button class="icon-btn save-btn" id="remarkSaveBtn" title="Save remark settings">
                    <span class="codicon codicon-pass"></span>
                </button>
                <button class="icon-btn delete-btn" id="remarkDeleteBtn" title="Delete tag">
                    <span class="codicon codicon-close"></span>
                </button>
            </div>
        </div>
    </div>

    <div class="controls-row">
        <input type="text" id="tagSearch" class="tag-search" placeholder="Search tags...">
        <button class="add-btn" id="addBtn">
            <span class="codicon codicon-plus"></span> New
        </button>
        <div class="max-pinned-control" title="The maximum number of tags displayed when there is no search (Pin is displayed first, and then other tags are supplemented)">
            <label for="maxPinnedInput">Max pinned</label>
            <input type="number" id="maxPinnedInput" class="max-pinned-input" min="1" max="20" value="6">
        </div>
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
    <div id="colorPicker" class="color-picker hidden">
        <div class="color-picker-header">
            <span>Select Color</span>
            <button class="btn btn-secondary" id="closeColorPicker">
                <span class="codicon codicon-close"></span>
            </button>
        </div>
        <div class="color-grid" id="colorGrid"></div>
        <div class="color-picker-actions">
            <button class="btn btn-secondary" id="addCustomColor">
                <span class="codicon codicon-add"></span> Add Custom Color
            </button>
            <input type="color" id="customColorInput" class="hidden-input" aria-label="Custom color picker" />
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
