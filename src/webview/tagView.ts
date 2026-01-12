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

  private _isGlobalScope = true;
  private _isMultiSelectMode = false;
  private _isEditMode = false;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _tagService: TagIndexService
  ) {
    this._tagService.onDidUpdateTags(() => {
      this.updateView();
    });

    vscode.window.onDidChangeActiveTextEditor(() => {
      if (!this._isGlobalScope) {
        this.updateView();
      }
    });

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("adjustHeadingInTree.tags")) {
        this.updateView();
      }
    });
  }

  public toggleScope(): void {
    this._isGlobalScope = !this._isGlobalScope;
    void vscode.commands.executeCommand(
      "setContext",
      "headingNavigator.tagScopeGlobal",
      this._isGlobalScope
    );
    this.updateView();
    if (this._view) {
      this._view.webview.postMessage({
        type: "scopeChanged",
        isGlobal: this._isGlobalScope,
      });
    }
  }

  public get isGlobalScope(): boolean {
    return this._isGlobalScope;
  }

  public toggleMultiSelectMode(): void {
    this._isMultiSelectMode = !this._isMultiSelectMode;
    if (this._view) {
      this._view.webview.postMessage({
        type: "toggleMultiSelectFromExtension",
        enabled: this._isMultiSelectMode,
      });
    }
  }

  public toggleEditMode(): void {
    this._isEditMode = !this._isEditMode;
    void vscode.commands.executeCommand(
      "setContext",
      "headingNavigator.tagViewInEditMode",
      this._isEditMode
    );
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
        case "openLocation":
          this.openLocation(data.uri, data.line);
          break;
        case "refresh":
          this._tagService.scanWorkspace();
          break;
        case "toggleMultiSelect":
          this._isMultiSelectMode = data.enabled;
          break;
        case "toggleScope":
          this.toggleScope();
          break;
        case "removeTagReferences":
          await this.removeTagReferences(data.uri, data.line, data.tagNames);
          break;
        case "editTags":
          await this.editBlock(data.uri, data.line, "headingNavigator.editTags");
          break;
        case "editRemark":
          await this.editBlock(
            data.uri,
            data.line,
            "headingNavigator.editRemark"
          );
          break;
        case "batchRemoveTags":
          const confirmation = await vscode.window.showInformationMessage(
            `Are you sure you want to remove the tags from ${data.items.length} selected items?`,
            { modal: true },
            "Yes"
          );
          if (confirmation === "Yes") {
            for (const item of data.items) {
              await this.removeTagReferences(item.uri, item.line, item.tagNames);
            }
            this._view?.webview.postMessage({ type: "batchDeleteSuccess" });
          }
          break;
        case "createFileFromItems":
          await this.createFileFromItems(data.items);
          break;
        case "showInformationMessage":
            vscode.window.showInformationMessage(data.message);
            break;
      }
    });

    this.updateView();
  }

  private updateView() {
    if (!this._view) {
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    const activeUri = activeEditor?.document.uri;

    let tags: string[];
    const payload: Record<string, any[]> = {};

    if (this._isGlobalScope) {
      tags = this._tagService.getAllTags();
      for (const tag of tags) {
        payload[tag] = this._tagService.getBlocksByTag(tag).map((b) => ({
            ...b,
            uri: b.uri.toString(),
            fileName: path.basename(b.uri.fsPath),
            breadcrumb: this._tagService.getBreadcrumb(b.uri, b.line) ?? [],
          }));
      }
    } else {
      if (activeUri) {
        tags = this._tagService.getTagsForFile(activeUri);
        for (const tag of tags) {
            payload[tag] = this._tagService.getBlocksForFile(activeUri, tag).map((b) => ({
                ...b,
                uri: b.uri.toString(),
                fileName: path.basename(b.uri.fsPath),
                breadcrumb: this._tagService.getBreadcrumb(b.uri, b.line) ?? [],
              }));
        }
      } else {
        tags = [];
      }
    }

    const allBlocks = Object.values(payload).flat();
    for (const tag of tags) {
        payload[tag] = payload[tag].map((block) => ({
          ...block,
          tagName: tag,
        }));
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
    // ... (rest of the method is unchanged)
  }

  private getMaxPinnedDisplay(): number {
    const config = vscode.workspace.getConfiguration("adjustHeadingInTree");
    const maxPinned = config.get<number>("tags.maxPinnedDisplay", 6);
    return Math.max(1, maxPinned);
  }

  private async openLocation(uriStr: string, line: number) {
    // ... (rest of the method is unchanged)
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
      <link href="\${codiconsUri}" rel="stylesheet" />
      <link href="\${styleUri}" rel="stylesheet" />
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
      <script src="\${scriptUri}"></script>
  </body>
  </html>`;
      return html;
  }

  private async removeTagReferences(
    uriStr: string,
    line: number,
    tagNames: string[]
  ): Promise<void> {
    // ... (rest of the method is unchanged)
  }

  private async createFileFromItems(items: any[]): Promise<void> {
    if (!items || items.length === 0) {
      vscode.window.showInformationMessage("No items selected.");
      return;
    }

    const newTitle = await vscode.window.showInputBox({
        prompt: "Enter an optional title for the new file.",
        placeHolder: "e.g., My New Chapter (optional, press Enter to skip)",
    });

    if (newTitle === undefined) {
        return;
    }

    const useParentHeadings = !(newTitle && newTitle.trim());

    try {
      const { imports, content } = await this.extractContentFromItems(items, useParentHeadings);

      let finalContent = "";
      if (newTitle && newTitle.trim()) {
        finalContent = `= \${newTitle.trim()}\n\n\${content}`;
      } else {
        finalContent = content;
      }

      const fullContent = `\${imports}\n\n\${finalContent}`;

      const newDoc = await vscode.workspace.openTextDocument({
        content: fullContent,
        language: "typst",
      });
      await vscode.window.showTextDocument(newDoc);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to create file: \${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async extractContentFromItems(items: any[], useParentHeadings: boolean): Promise<{ imports: string, content: string }> {
    const uniqueImports = new Set<string>();
    const contentParts: string[] = [];
    const itemsByFile = this.groupItemsByFile(items);

    for (const [uriStr, fileItems] of Object.entries(itemsByFile)) {
      const uri = vscode.Uri.parse(uriStr);
      const document = await vscode.workspace.openTextDocument(uri);
      const lines = document.getText().split(/\\r?\\n/);
      this.extractFileHeaders(lines).forEach(header => uniqueImports.add(header));
      fileItems.sort((a, b) => a.line - b.line);

      let lastBreadcrumb: string[] = [];
      for (const item of fileItems) {
        const breadcrumb = this._tagService.getBreadcrumb(uri, item.line) ?? [];
        const itemContent = this.getItemContent(document, lines, item.line, breadcrumb, lastBreadcrumb, useParentHeadings);
        contentParts.push(itemContent);
        lastBreadcrumb = breadcrumb;
      }
    }

    return {
      imports: Array.from(uniqueImports).join("\\n"),
      content: contentParts.join("\\n\\n"),
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
        break;
      }
    }
    return headers;
  }

  private getItemContent(document: vscode.TextDocument, lines: string[], startLine: number, breadcrumb: string[], lastBreadcrumb: string[], useParentHeadings: boolean): string {
    const contentLines: string[] = [];

    if (useParentHeadings) {
        let lastCommonLevel = -1;
        if (lastBreadcrumb.length > 0) {
            for (let i = 0; i < Math.min(breadcrumb.length, lastBreadcrumb.length); i++) {
                if (breadcrumb[i] === lastBreadcrumb[i]) {
                    lastCommonLevel = i;
                } else {
                    break;
                }
            }
        }
        breadcrumb.forEach((title, index) => {
            if (index > lastCommonLevel && index < breadcrumb.length - 1) {
                const level = index + 1;
                contentLines.push(`\${"=".repeat(level)} \${title}`);
            }
        });
    }

    let endLine = startLine;
    for (let i = startLine + 1; i < lines.length; i++) {
        const lineText = lines[i];
        const match = parseHeadings(lineText);
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
