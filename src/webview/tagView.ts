import * as vscode from "vscode";
import {
  TagIndexService,
  TaggedHeading,
  TagDefinition,
} from "../services/tagIndexService";
import * as path from "path";

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
      }>
    > = {};

    if (this._isGlobalScope) {
      // 全局模式：显示工作区所有标签
      tags = this._tagService.getAllTags();
      for (const tag of tags) {
        const blocks = this._tagService.getBlocksByTag(tag);
        payload[tag] = blocks.map((b) => ({
          text: b.text,
          line: b.line,
          level: b.level,
          uri: b.uri.toString(),
          fsPath: b.uri.fsPath,
          fileName: path.basename(b.uri.fsPath),
        }));
      }
    } else {
      // 当前文件模式：只显示当前文件的标签
      if (activeUri) {
        tags = this._tagService.getTagsForFile(activeUri);
        for (const tag of tags) {
          const blocks = this._tagService.getBlocksForFile(activeUri, tag);
          payload[tag] = blocks.map((b) => ({
            text: b.text,
            line: b.line,
            level: b.level,
            uri: b.uri.toString(),
            fsPath: b.uri.fsPath,
            fileName: path.basename(b.uri.fsPath),
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
      data: payload,
      isGlobal: this._isGlobalScope,
      isMultiSelect: this._isMultiSelectMode,
      currentFileName: activeUri ? path.basename(activeUri.fsPath) : null,
    });
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
        </div>
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
}
