import * as vscode from "vscode";
import {
  TagIndexService,
  TaggedHeading,
  TagDefinition,
} from "../services/tagIndexService";
import * as path from "path";
import { HeadingMatch, parseHeadings } from "../providers/parser";
import { HeadingNode } from "../providers/headingProvider";
import {
  extractCommentContent,
  getCommentKindForDocument,
  normalizeTagsAndRemark,
  parseCommentContent,
  updateLineWithComment,
} from "../utils/tagRemark";
import { makeSafeFileComponent } from "../utils/subtree";

interface BatchItem {
  uri: string;
  line: number;
  text?: string;
  level?: number;
}

interface DocumentIndex {
  document: vscode.TextDocument;
  matches: HeadingMatch[];
  indexByLine: Map<number, number>;
}

interface SelectedHeadingSlice {
  key: string;
  document: vscode.TextDocument;
  range: vscode.Range;
}

export class TagViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "headingNavigator.tagView";
  private _view?: vscode.WebviewView;

  // 作用域状态：true = 全局（工作区），false = 当前文件
  private _isGlobalScope = true;
  // 多选模式状态：true = 多选，false = 单选
  private _isMultiSelectMode = false;

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
   * 切换多选模式
   */
  public toggleMultiSelectMode(): void {
    this._isMultiSelectMode = !this._isMultiSelectMode;
    // 发送消息给webview更新状态
    if (this._view) {
      this._view.webview.postMessage({
        type: "toggleMultiSelectFromExtension",
        enabled: this._isMultiSelectMode,
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
        case "toggleMultiSelect": {
          this._isMultiSelectMode = data.enabled;
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
        case "batchRemoveTagReferences": {
          await this.removeTagReferencesBatch(data.items ?? [], data.tagNames);
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
        case "createFileFromSelection": {
          await this.createFileFromSelection(data.items ?? [], data.title ?? "");
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
      isMultiSelect: this._isMultiSelectMode,
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

    return `<!DOCTYPE html>
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
            <button class="toggle-btn" id="edit-btn" title="Toggle edit mode">
                <span class="codicon codicon-edit toggle-btn-icon active" id="edit-icon-off"></span>
                <span class="codicon codicon-checklist toggle-btn-icon" id="edit-icon-on"></span>
            </button>
        </div>
    </div>
    <div id="batch-toolbar" class="batch-toolbar hidden">
        <div class="batch-row">
            <div class="batch-summary">
                <span id="batch-count" class="batch-count">0</span>
                <span class="batch-count-icon codicon codicon-checklist"></span>
                <span class="batch-separator">|</span>
                <button class="batch-checkbox" id="batch-select-all" title="Select all items">
                    <span class="codicon codicon-check"></span>
                </button>
            </div>
            <div class="batch-actions">
                <button class="toggle-btn" id="batch-tag-mode-btn" title="Tag clicks: Select items">
                    <span class="codicon codicon-list-selection toggle-btn-icon active" id="batch-tag-mode-select"></span>
                    <span class="codicon codicon-list-filter toggle-btn-icon" id="batch-tag-mode-filter"></span>
                </button>
                <button class="batch-icon-btn" id="batch-delete-btn" title="Remove tag references">
                    <span class="codicon codicon-trash"></span>
                </button>
                <button class="batch-icon-btn" id="batch-newfile-btn" title="Create a new file">
                    <span class="codicon codicon-new-file"></span>
                </button>
            </div>
        </div>
        <div id="batch-input-row" class="batch-input-row hidden">
            <input type="text" id="batch-input" class="batch-input" placeholder="Optional title for a new file">
            <div class="batch-input-actions">
                <button class="batch-btn" id="batch-input-cancel">Cancel</button>
                <button class="batch-btn primary" id="batch-input-confirm">Create</button>
            </div>
        </div>
        <div id="batch-input-hint" class="batch-hint hidden">Leave blank to keep original heading levels.</div>
    </div>
    <div id="tags" class="tags-container"></div>
    <div id="blocks" class="block-list"></div>

    <script>
        const vscode = acquireVsCodeApi();
    </script>
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * 从指定的文件和行中移除多个标签的引用
   */
  private async removeTagReferencesBatch(
    items: BatchItem[],
    tagNames: string[] = []
  ): Promise<void> {
    if (!items || items.length === 0) {
      return;
    }

    const uniqueItems = this.dedupeBatchItems(items);
    const edit = new vscode.WorkspaceEdit();
    const documentCache = new Map<string, vscode.TextDocument>();
    let editCount = 0;

    try {
      // Batch edits per workspace to avoid shifting line indices.
      for (const item of uniqueItems) {
        const uri = vscode.Uri.parse(item.uri);
        const document = await this.getCachedDocument(uri, documentCache);
        if (item.line < 0 || item.line >= document.lineCount) {
          continue;
        }

        const lineText = document.lineAt(item.line).text;
        const kind = getCommentKindForDocument(document);
        const commentPart = extractCommentContent(lineText, kind);
        if (!commentPart) {
          continue;
        }

        const { tags, remark } = parseCommentContent(commentPart);
        const targetTags = tagNames.length > 0 ? tagNames : tags;
        if (targetTags.length === 0) {
          continue;
        }

        const remainingTags = tags.filter((tag) => !targetTags.includes(tag));
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
        if (newLineText === lineText) {
          continue;
        }

        edit.replace(
          uri,
          new vscode.Range(item.line, 0, item.line + 1, 0),
          newLineText + "\n"
        );
        editCount += 1;
      }

      if (editCount === 0) {
        vscode.window.showInformationMessage("No tag references to remove.");
        return;
      }

      await vscode.workspace.applyEdit(edit);
      this._tagService.scanWorkspace();
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to remove tag references: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async createFileFromSelection(
    items: BatchItem[],
    title: string
  ): Promise<void> {
    if (!items || items.length === 0) {
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage("No active editor found.");
      return;
    }

    const activeDocument = activeEditor.document;
    if (activeDocument.isUntitled) {
      vscode.window.showErrorMessage("Save the current file before creating a new file.");
      return;
    }

    // Resolve target file type from the active editor.
    const extension = this.resolveTargetExtension(activeDocument);
    if (!extension) {
      vscode.window.showErrorMessage(
        "Batch file creation supports only Markdown or Typst files."
      );
      return;
    }

    // Preserve view order while removing duplicates.
    const orderedItems = this.dedupeBatchItems(items);
    const blocksText = await this.collectBlocksText(orderedItems);
    if (!blocksText.trim()) {
      vscode.window.showErrorMessage("No content found for the selected items.");
      return;
    }

    const titleText = (title || "").trim();
    // Prefer configured imports; fall back to the active document preamble.
    const preamble =
      extension === ".md"
        ? this.extractMarkdownFrontMatter(activeDocument)
        : await this.resolveTypstPreamble(activeDocument);
    const content = this.composeNewFileContent(
      preamble,
      blocksText,
      titleText,
      extension === ".md"
    );

    const dir = path.dirname(activeDocument.uri.fsPath);
    const baseNameSource = titleText || orderedItems[0]?.text || "batch";
    const baseName = makeSafeFileComponent(baseNameSource);
    const filePath = await this.getAvailableFilePath(dir, baseName, extension);
    const fileUri = vscode.Uri.file(filePath);

    try {
      await vscode.workspace.fs.writeFile(
        fileUri,
        Buffer.from(content, "utf8")
      );
      const doc = await vscode.workspace.openTextDocument(fileUri);
      await vscode.window.showTextDocument(doc, { preview: false });
      vscode.window.showInformationMessage(
        `Created new file: ${path.basename(filePath)}`
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to create file: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private resolveTargetExtension(
    document: vscode.TextDocument
  ): ".md" | ".typ" | null {
    const ext = path.extname(document.uri.fsPath).toLowerCase();
    if (ext === ".md" || document.languageId === "markdown") {
      return ".md";
    }
    if (ext === ".typ" || document.languageId === "typst") {
      return ".typ";
    }
    return null;
  }

  private dedupeBatchItems(items: BatchItem[]): BatchItem[] {
    const seen = new Set<string>();
    const result: BatchItem[] = [];

    for (const item of items) {
      if (!item?.uri || typeof item.line !== "number") {
        continue;
      }
      const key = this.getBatchItemKey(item);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(item);
    }

    return result;
  }

  private async collectBlocksText(items: BatchItem[]): Promise<string> {
    // Build selection ranges per document and skip nested headings to avoid duplicates.
    const parts: string[] = [];
    const documentCache = new Map<string, DocumentIndex>();
    const slicesByDocument = new Map<string, SelectedHeadingSlice[]>();
    const slicesByKey = new Map<string, SelectedHeadingSlice>();

    for (const item of items) {
      const uri = vscode.Uri.parse(item.uri);
      const entry = await this.getDocumentIndex(uri, documentCache);
      const index = entry.indexByLine.get(item.line);
      if (index === undefined) {
        continue;
      }

      // Extract heading text with its subtree until the next same-or-higher level heading.
      const range = this.getHeadingRange(entry.document, entry.matches, index);
      const slice: SelectedHeadingSlice = {
        key: this.getBatchItemKey(item),
        document: entry.document,
        range,
      };
      slicesByKey.set(slice.key, slice);
      const docKey = entry.document.uri.toString();
      const bucket = slicesByDocument.get(docKey) ?? [];
      bucket.push(slice);
      slicesByDocument.set(docKey, bucket);
    }

    const nestedKeys = this.getNestedSelectionKeys(slicesByDocument);
    for (const item of items) {
      const key = this.getBatchItemKey(item);
      if (nestedKeys.has(key)) {
        continue;
      }
      const slice = slicesByKey.get(key);
      if (!slice) {
        continue;
      }
      const text = slice.document.getText(slice.range).trimEnd();
      if (text.length > 0) {
        parts.push(text);
      }
    }

    return parts.join("\n\n");
  }

  // Skip headings that are fully contained in another selected heading.
  private getNestedSelectionKeys(
    entriesByDocument: Map<string, SelectedHeadingSlice[]>
  ): Set<string> {
    const nested = new Set<string>();

    for (const entries of entriesByDocument.values()) {
      const sorted = [...entries].sort((a, b) => {
        const startDiff = a.range.start.line - b.range.start.line;
        if (startDiff !== 0) {
          return startDiff;
        }
        return b.range.end.line - a.range.end.line;
      });

      let currentEnd = -1;
      for (const entry of sorted) {
        const startLine = entry.range.start.line;
        if (startLine < currentEnd) {
          nested.add(entry.key);
          continue;
        }
        currentEnd = entry.range.end.line;
      }
    }

    return nested;
  }

  private getBatchItemKey(item: BatchItem): string {
    return `${item.uri}:${item.line}`;
  }

  private async getDocumentIndex(
    uri: vscode.Uri,
    cache: Map<string, DocumentIndex>
  ): Promise<DocumentIndex> {
    const key = uri.toString();
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    const matches = parseHeadings(document.getText());
    const indexByLine = new Map<number, number>();
    matches.forEach((match, index) => {
      if (!indexByLine.has(match.line)) {
        indexByLine.set(match.line, index);
      }
    });

    const entry: DocumentIndex = { document, matches, indexByLine };
    cache.set(key, entry);
    return entry;
  }

  private getHeadingRange(
    document: vscode.TextDocument,
    matches: HeadingMatch[],
    startIndex: number
  ): vscode.Range {
    const current = matches[startIndex];
    let endLine = document.lineCount;

    // Find the next heading at the same or higher level.
    for (let index = startIndex + 1; index < matches.length; index++) {
      const candidate = matches[index];
      if (candidate.level <= current.level) {
        endLine = candidate.line;
        break;
      }
    }

    const start = new vscode.Position(current.line, 0);
    if (document.lineCount === 0) {
      return new vscode.Range(start, current.range.end);
    }

    const end =
      endLine >= document.lineCount
        ? document.lineAt(document.lineCount - 1).range.end
        : new vscode.Position(endLine, 0);
    return new vscode.Range(start, end);
  }

  private async resolveTypstPreamble(
    document: vscode.TextDocument
  ): Promise<string> {
    // Use shared imports if configured, otherwise extract from the active file.
    const imports = await this.loadExtraImportsSnippet(document);
    if (imports.trim().length > 0) {
      return imports.trimEnd();
    }

    return this.extractTypstPreamble(document);
  }

  private async loadExtraImportsSnippet(
    document: vscode.TextDocument
  ): Promise<string> {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const storedPath = (config.get<string>("export.extraImportsFile", "") || "")
      .trim();
    if (!storedPath) {
      return "";
    }

    const absolutePath = this.resolveImportsAbsolutePath(
      storedPath,
      document
    );
    try {
      const data = await vscode.workspace.fs.readFile(
        vscode.Uri.file(absolutePath)
      );
      return Buffer.from(data).toString("utf8");
    } catch (error) {
      vscode.window.showWarningMessage(
        `Failed to read imports file: ${absolutePath}. Falling back to document preamble.`
      );
      return "";
    }
  }

  private resolveImportsAbsolutePath(
    storedPath: string,
    document: vscode.TextDocument
  ): string {
    if (path.isAbsolute(storedPath)) {
      return storedPath;
    }

    const workspaceFolder =
      vscode.workspace.getWorkspaceFolder(document.uri) ??
      vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return path.join(workspaceFolder.uri.fsPath, storedPath);
    }

    return path.join(path.dirname(document.uri.fsPath), storedPath);
  }

  private extractTypstPreamble(document: vscode.TextDocument): string {
    // Copy everything before the first heading when possible, then fall back to leading directives.
    const matches = parseHeadings(document.getText());
    if (matches.length > 0) {
      const first = matches[0];
      const range = new vscode.Range(0, 0, first.line, 0);
      return document.getText(range).trimEnd();
    }

    const lines = document.getText().split(/\r?\n/);
    const collected: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        collected.push(line);
        continue;
      }

      if (
        trimmed.startsWith("//") ||
        /^#(import|set|show)\b/.test(trimmed)
      ) {
        collected.push(line);
        continue;
      }

      break;
    }

    return collected.join("\n").trimEnd();
  }

  private extractMarkdownFrontMatter(document: vscode.TextDocument): string {
    const lines = document.getText().split(/\r?\n/);
    if (lines.length === 0 || lines[0].trim() !== "---") {
      return "";
    }

    for (let index = 1; index < lines.length; index += 1) {
      const trimmed = lines[index].trim();
      if (trimmed === "---" || trimmed === "...") {
        return lines.slice(0, index + 1).join("\n").trimEnd();
      }
    }

    return "";
  }

  private composeNewFileContent(
    preamble: string,
    blocksText: string,
    title: string,
    isMarkdown: boolean
  ): string {
    const parts: string[] = [];
    const normalizedPreamble = preamble.trim();
    if (normalizedPreamble.length > 0) {
      parts.push(normalizedPreamble);
    }

    if (title.trim().length > 0) {
      parts.push(this.buildHeadingLine(title, isMarkdown));
    }

    const normalizedBlocks = blocksText.trim();
    if (normalizedBlocks.length > 0) {
      parts.push(normalizedBlocks);
    }

    let combined = parts.join("\n\n");
    if (!combined.endsWith("\n")) {
      combined += "\n";
    }
    return combined;
  }

  private buildHeadingLine(title: string, isMarkdown: boolean): string {
    const cleanTitle = title.trim();
    if (isMarkdown) {
      return `# ${cleanTitle}`;
    }
    return `= ${cleanTitle}`;
  }

  private async getAvailableFilePath(
    dir: string,
    baseName: string,
    extension: string
  ): Promise<string> {
    const safeBase = baseName && baseName.length > 0 ? baseName : "untitled";
    let counter = 0;

    while (true) {
      const suffix = counter === 0 ? "" : `-${counter}`;
      const candidate = path.join(dir, `${safeBase}${suffix}${extension}`);
      if (!(await this.fileExists(candidate))) {
        return candidate;
      }
      counter += 1;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
      return true;
    } catch {
      return false;
    }
  }

  private async getCachedDocument(
    uri: vscode.Uri,
    cache: Map<string, vscode.TextDocument>
  ): Promise<vscode.TextDocument> {
    const key = uri.toString();
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const document = await vscode.workspace.openTextDocument(uri);
    cache.set(key, document);
    return document;
  }

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
}
