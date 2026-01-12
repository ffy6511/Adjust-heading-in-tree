import * as vscode from "vscode";
import {
  TagIndexService,
  TaggedHeading,
  TagDefinition,
} from "../services/tagIndexService";
import * as path from "path";
import { parseHeadings } from "../providers/parser";
import { HeadingNode } from "../providers/headingProvider";
import {
  extractCommentContent,
  getCommentKindForDocument,
  normalizeTagsAndRemark,
  parseCommentContent,
  updateLineWithComment,
} from "../utils/tagRemark";

export class TagViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "headingNavigator.tagView";
  private _view?: vscode.WebviewView;

  // 作用域状态：true = 全局（工作区），false = 当前文件
  private _isGlobalScope = true;
  // 编辑模式状态：true = 编辑，false = 正常
  private _isEditMode = false;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _tagService: TagIndexService
  ) {
    // 监听标签更新
    this._tagService.onDidUpdateTags(() => {
      this.updateView();
    });

    // 监听活动编辑器变化（用于当前文件模式）
    vscode.window.onDidChangeActiveTextEditor(() => {
      if (!this._isGlobalScope) {
        this.updateView();
      }
    });

    // 监听配置变化，确保最大展示数量等配置生效
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("adjustHeadingInTree.tags")) {
        this.updateView();
      }
    });
  }

  /**
   * 切换作用域（当前文件 / 全局）
   */
  public toggleScope(): void {
    this._isGlobalScope = !this._isGlobalScope;
    // 更新按钮图标
    void vscode.commands.executeCommand(
      "setContext",
      "headingNavigator.tagScopeGlobal",
      this._isGlobalScope
    );
    this.updateView();
    // 通知 WebView 更新状态
    if (this._view) {
      this._view.webview.postMessage({
        type: "scopeChanged",
        isGlobal: this._isGlobalScope,
      });
    }
  }

  /**
   * 获取当前作用域状态
   */
  public get isGlobalScope(): boolean {
    return this._isGlobalScope;
  }

  /**
   * 切换编辑模式
   */
  public toggleEditMode(): void {
    this._isEditMode = !this._isEditMode;
    void vscode.commands.executeCommand(
      "setContext",
      "headingNavigator.tagViewInEditMode",
      this._isEditMode
    );
    // 发送消息给webview更新状态
    if (this._view) {
      this._view.webview.postMessage({
        type: "toggleEditModeFromExtension",
        enabled: this._isEditMode,
      });
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case "openLocation": {
          this.openLocation(data.uri, data.line);
          break;
        }
        case "refresh": {
          this._tagService.scanWorkspace();
          break;
        }
        case "toggleEditMode": {
          this._isEditMode = data.enabled;
          break;
        }
        case "toggleScope": {
          this.toggleScope();
          break;
        }
        case "removeTagReferences": {
          await this.removeTagReferences(data.uri, data.line, data.tagNames);
          break;
        }
        case "editTags": {
          await this.editBlock(data.uri, data.line, "headingNavigator.editTags");
          break;
        }
        case "editRemark": {
          await this.editBlock(
            data.uri,
            data.line,
            "headingNavigator.editRemark"
          );
          break;
        }
        case "batchRemoveTags": {
          for (const item of data.items) {
            await this.removeTagReferences(item.uri, item.line, item.tagNames);
          }
          break;
        }
        case "createFileFromItems": {
          await this.createFileFromItems(data.items);
          break;
        }
        case "showInformationMessage": {
            vscode.window.showInformationMessage(data.message);
            break;
        }
      }
    });

    // Initial update
    this.updateView();
  }

  private updateView() {
    if (!this._view) {
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const activeUri = activeEditor?.document.uri;

    let tags: string[];
    const payload: Record<
      string,
      Array<{
        text: string;
        line: number;
        level: number;
        uri: string;
        fsPath: string;
        fileName: string;
        tagName?: string;
        breadcrumb?: string[];
        remark?: string;
      }>
    > = {};

    if (this._isGlobalScope) {
      // 全局模式：显示工作区所有标签
      tags = this._tagService.getAllTags();
      for (const tag of tags) {
        const blocks = this._tagService.getBlocksByTag(tag);
          payload[tag] = blocks.map((b) => ({
            text: b.displayText ?? b.text,
            line: b.line,
            level: b.level,
            uri: b.uri.toString(),
            fsPath: b.uri.fsPath,
            fileName: path.basename(b.uri.fsPath),
            tags: b.tags,
            breadcrumb:
              b.breadcrumb ??
              this._tagService.getBreadcrumb(b.uri, b.line) ??
              [],
            remark: b.remark,
          }));
      }

      // Add tagName to blocks for deletion purposes
      for (const tag of tags) {
        payload[tag] = payload[tag].map((block) => ({
          ...block,
          tagName: tag, // Add tagName to each block
        }));
      }
    } else {
      // 当前文件模式：只显示当前文件的标签
      if (activeUri) {
        tags = this._tagService.getTagsForFile(activeUri);
        for (const tag of tags) {
          const blocks = this._tagService.getBlocksForFile(activeUri, tag);
          payload[tag] = blocks.map((b) => ({
            text: b.displayText ?? b.text,
            line: b.line,
            level: b.level,
            uri: b.uri.toString(),
            fsPath: b.uri.fsPath,
            fileName: path.basename(b.uri.fsPath),
            tags: b.tags,
            breadcrumb:
              b.breadcrumb ??
              this._tagService.getBreadcrumb(b.uri, b.line) ??
              [],
            remark: b.remark,
          }));
        }
      } else {
        tags = [];
      }
    }

    const defs = this._tagService.getTagsFromSettings();

    this._view.webview.postMessage({
      type: "update",
      tags: tags,
      definitions: defs,
      remarkDefinition: this._tagService.getRemarkDefinition(),
      data: payload,
      isGlobal: this._isGlobalScope,
      isEditMode: this._isEditMode,
      maxPinnedDisplay: this.getMaxPinnedDisplay(),
      currentFileName: activeUri ? path.basename(activeUri.fsPath) : null,
    });
  }

  private async editBlock(
    uriStr: string,
    line: number,
    command: "headingNavigator.editTags" | "headingNavigator.editRemark"
  ): Promise<void> {
    try {
      const uri = vscode.Uri.parse(uriStr);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const lineText = doc.lineAt(line).text;
      const matches = parseHeadings(lineText);
      if (matches.length === 0) {
        vscode.window.showErrorMessage(
          "Could not parse heading at line " + (line + 1)
        );
        return;
      }

      const match = matches[0];
      const range = doc.lineAt(line).range;
      const node: HeadingNode = {
        id: `${line}-${match.level}`,
        label: match.displayText ?? match.text,
        level: match.level,
        kind: match.kind,
        range,
        children: [],
      };

      editor.selection = new vscode.Selection(range.start, range.start);
      await vscode.commands.executeCommand(command, node);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to edit tag: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * 读取并规范化标签视图的最大展示数量，确保配置异常时至少展示 1 个标签
   */
  private getMaxPinnedDisplay(): number {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const maxPinned = config.get<number>("tags.maxPinnedDisplay", 6);
    return Math.max(1, maxPinned);
  }

  private async openLocation(uriStr: string, line: number) {
    try {
      const uri = vscode.Uri.parse(uriStr);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const range = new vscode.Range(line, 0, line, 0);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.start);
    } catch (e) {
      vscode.window.showErrorMessage("Could not open file: " + e);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "node_modules",
        "@vscode/codicons",
        "dist",
        "codicon.css"
      )
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "tagView",
        "style.css"
      )
    );

    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        "resources",
        "webview",
        "tagView",
        "main.js"
      )
    );
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${codiconsUri}" rel="stylesheet" />
    <link href="${styleUri}" rel="stylesheet" />
    <title>Tag View</title>
</head>
<body>

    <div class="header">
        <input type="text" id="search" class="search-box" placeholder="Search tags...">
        <div class="search-controls">
            <button class="toggle-btn" id="scope-btn" title="Toggle scope (global/current)">
                <span class="codicon codicon-globe toggle-btn-icon active" id="scope-icon-globe"></span>
                <span class="codicon codicon-file toggle-btn-icon" id="scope-icon-file"></span>
            </button>
            <button class="toggle-btn" id="select-btn" title="Toggle selection mode">
                <span class="codicon codicon-list-selection toggle-btn-icon active" id="select-icon-single"></span>
                <span class="codicon codicon-list-filter toggle-btn-icon" id="select-icon-mult"></span>
            </button>
        </div>
    </div>
    <div id="edit-mode-actions" class="edit-actions-container" style="display: none;">
        <button id="batch-delete-btn" title="Remove selected tags from items"><span class="codicon codicon-trash"></span></button>
        <button id="create-file-btn" title="Create a new file from selected items"><span class="codicon codicon-new-file"></span></button>
    </div>
    <div id="tags" class="tags-container"></div>
    <div id="blocks" class="block-list"></div>

    <script>
        const vscode = acquireVsCodeApi();
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
    return html;
  }

  /**
   * 从指定的文件和行中移除多个标签的引用
   */
  private async removeTagReferences(
    uriStr: string,
    line: number,
    tagNames: string[]
  ): Promise<void> {
    try {
      const uri = vscode.Uri.parse(uriStr);
      const document = await vscode.workspace.openTextDocument(uri);
      const lineText = document.lineAt(line).text;
      const kind = getCommentKindForDocument(document);
      const commentPart = extractCommentContent(lineText, kind);
      if (!commentPart) {
        throw new Error("No comment found on this line");
      }

      const { tags, remark } = parseCommentContent(commentPart);
      const remainingTags = tags.filter((tag) => !tagNames.includes(tag));
      const remarkTagName = this._tagService.getRemarkName();
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

      // 应用编辑
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        uri,
        new vscode.Range(line, 0, line + 1, 0),
        newLineText + "\n"
      );

      await vscode.workspace.applyEdit(edit);

      // 重新扫描以更新索引
      this._tagService.scanWorkspace();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to remove tags: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async createFileFromItems(
    items: any[],
  ): Promise<void> {
    if (!items || items.length === 0) {
      vscode.window.showInformationMessage("No items selected.");
      return;
    }

    const newTitle = await vscode.window.showInputBox({
        prompt: "Enter an optional title for the new file.",
        placeHolder: "e.g., My New Chapter (optional, press Enter to skip)",
    });

    // If the user presses Escape, abort the operation.
    if (newTitle === undefined) {
        return;
    }

    try {
      const { imports, content } = await this.extractContentFromItems(items);

      let finalContent = "";
      if (newTitle && newTitle.trim()) {
        finalContent = `= ${newTitle.trim()}\n\n${content}`;
      } else {
        finalContent = content;
      }

      const fullContent = `${imports}\n\n${finalContent}`;

      const newDoc = await vscode.workspace.openTextDocument({
        content: fullContent,
        language: "typst",
      });
      await vscode.window.showTextDocument(newDoc);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to create file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async extractContentFromItems(items: any[]): Promise<{ imports: string, content: string }> {
    const uniqueImports = new Set<string>();
    const contentParts: string[] = [];

    const itemsByFile = this.groupItemsByFile(items);

    for (const [uriStr, fileItems] of Object.entries(itemsByFile)) {
      const uri = vscode.Uri.parse(uriStr);
      const document = await vscode.workspace.openTextDocument(uri);
      const lines = document.getText().split(/\r?\n/);

      // Extract imports and settings from the file
      this.extractFileHeaders(lines).forEach(header => uniqueImports.add(header));

      // Sort items by line number to process them in order
      fileItems.sort((a, b) => a.line - b.line);

      for (const item of fileItems) {
        const breadcrumb = this._tagService.getBreadcrumb(uri, item.line) ?? [];
        const itemContent = this.getItemContent(document, lines, item.line, breadcrumb);
        contentParts.push(itemContent);
      }
    }

    return {
      imports: Array.from(uniqueImports).join("\n"),
      content: contentParts.join("\n\n"),
    };
  }

  private groupItemsByFile(items: any[]): Record<string, any[]> {
    return items.reduce((acc, item) => {
      if (!acc[item.uri]) {
        acc[item.uri] = [];
      }
      acc[item.uri].push(item);
      return acc;
    }, {} as Record<string, any[]>);
  }

  private extractFileHeaders(lines: string[]): string[] {
    const headers: string[] = [];
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("#import") || trimmedLine.startsWith("#set") || trimmedLine.startsWith("#show")) {
        headers.push(line);
      }
      if (trimmedLine.startsWith("=") || (trimmedLine.length > 0 && !trimmedLine.startsWith("#"))) {
        // Stop when we hit the first heading or content line
        break;
      }
    }
    return headers;
  }

  private getItemContent(document: vscode.TextDocument, lines: string[], startLine: number, breadcrumb: string[]): string {
    const contentLines: string[] = [];

    // 1. Add breadcrumb headings
    breadcrumb.forEach((title, index) => {
        // We skip the last element of the breadcrumb because it's the item itself
        if (index < breadcrumb.length - 1) {
            const level = index + 1;
            contentLines.push(`${"=".repeat(level)} ${title}`);
        }
    });

    // 2. Find the end of the block for the actual item
    let endLine = startLine;
    for (let i = startLine + 1; i < lines.length; i++) {
        const lineText = lines[i];
        const match = parseHeadings(lineText);
        // Stop if we find another heading of the same or higher level
        if (match.length > 0 && match[0].level <= breadcrumb.length) {
            break;
        }
        endLine = i;
    }

    const blockRange = new vscode.Range(startLine, 0, endLine, lines[endLine].length);
    contentLines.push(document.getText(blockRange));

    return contentLines.join("\n");
  }
}
