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

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${codiconsUri}" rel="stylesheet" />
    <title>Tag View</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 10px;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
        }
        .controls {
            display: flex;
            flex-direction: row;
            gap: 4px;
            margin-bottom: 15px;
            align-items: center;
        }
        .header {
            display: flex;
            align-items: center;
            gap: 2px;
            margin-bottom: 10px;
        }
        .search-box {
            flex: 1;
            padding: 6px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            box-sizing: border-box;
            min-width: 0; /* Allow shrinking */
        }
        .search-controls {
            display: flex;
            align-items: center;
            gap: 2px;
            flex-shrink: 0; /* Prevent shrinking */
        }
        .toggle-btn {
            width: 24px;
            height: 24px;
            padding: 2px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            border-radius: 4px;
            opacity: 0.7;
            transition: opacity 0.2s ease, background 0.2s ease;
        }
        .toggle-btn:hover {
            opacity: 0.9;
            background: var(--vscode-toolbar-hoverBackground);
        }
        .toggle-btn-icon {
            opacity: 0;
            transition: opacity 0.3s ease;
            position: absolute;
        }
        .toggle-btn-icon.active {
            opacity: 1;
        }
        .icon-btn {
            background: none;
            border: none;
            color: var(--vscode-icon-foreground);
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
        }
        .icon-btn:hover {
            background-color: var(--vscode-toolbar-hoverBackground);
        }
        .icon-btn.active {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .tags-container {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-widget-border);
        }
        .tag-chip {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            border-radius: 12px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            cursor: pointer;
            border: 2px solid transparent;
            font-size: 0.9em;
            opacity: 0.5;
            transition: opacity 0.15s, border-color 0.15s, transform 0.1s;
        }
        .tag-chip:hover {
            opacity: 0.8;
            transform: scale(1.02);
        }
        .tag-chip.selected {
            opacity: 1;
            border-color: var(--vscode-focusBorder);
            font-weight: bold;
            background: var(--vscode-button-secondaryBackground);
        }
        .block-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .block-item {
            padding: 8px;
            border-radius: 4px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            cursor: pointer;
            transition: background 0.1s;
        }
        .block-item:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .block-header {
            display: flex;
            justify-content: space-between;
            font-size: 0.85em;
            opacity: 0.8;
            margin-bottom: 4px;
        }
        .block-content {
            font-weight: 500;
        }
        .empty-state {
            text-align: center;
            opacity: 0.6;
            margin-top: 20px;
        }
        .codicon { vertical-align: middle; }
    </style>
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

        let state = {
            tags: [],
            definitions: [],
            data: {},
            selectedTags: new Set(),
            searchQuery: "",
            isGlobal: false,
            isMultiSelect: false,
            currentFileName: null
        };

        // UI Elements
        const tagsContainer = document.getElementById('tags');
        const blocksContainer = document.getElementById('blocks');
        const searchInput = document.getElementById('search');
        const selectBtn = document.getElementById('select-btn');
        const scopeBtn = document.getElementById('scope-btn');

        // 消息处理
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'update') {
                state.tags = message.tags;
                state.definitions = message.definitions;
                state.data = message.data;
                state.isGlobal = message.isGlobal;
                state.isMultiSelect = message.isMultiSelect;
                state.currentFileName = message.currentFileName;
                updateScopeBtn();
                updateSelectBtn();
                render();
            } else if (message.type === 'scopeChanged') {
                state.isGlobal = message.isGlobal;
                updateScopeBtn();
            } else if (message.type === 'toggleMultiSelectFromExtension') {
                state.isMultiSelect = message.enabled;
                updateSelectBtn();
                // 切换到单选模式时，只保留第一个选中的标签
                if (!state.isMultiSelect && state.selectedTags.size > 1) {
                    const first = Array.from(state.selectedTags)[0];
                    state.selectedTags.clear();
                    state.selectedTags.add(first);
                }
                render();
            }
        });

        scopeBtn.addEventListener('click', () => {
            vscode.postMessage({ type: 'toggleScope' });
        });

        searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value.toLowerCase();
            renderTags();
        });

        selectBtn.addEventListener('click', () => {
            state.isMultiSelect = !state.isMultiSelect;
            updateSelectBtn();
            // 切换到单选模式时，只保留第一个选中的标签
            if (!state.isMultiSelect && state.selectedTags.size > 1) {
                const first = Array.from(state.selectedTags)[0];
                state.selectedTags.clear();
                state.selectedTags.add(first);
            }
            vscode.postMessage({ type: 'toggleMultiSelect', enabled: state.isMultiSelect });
            render();
        });

        function updateScopeBtn() {
            if (state.isGlobal) {
                document.getElementById('scope-icon-globe').classList.add('active');
                document.getElementById('scope-icon-file').classList.remove('active');
            } else {
                document.getElementById('scope-icon-file').classList.add('active');
                document.getElementById('scope-icon-globe').classList.remove('active');
            }
        }

        function updateSelectBtn() {
            if (state.isMultiSelect) {
                document.getElementById('select-icon-mult').classList.add('active');
                document.getElementById('select-icon-single').classList.remove('active');
            } else {
                document.getElementById('select-icon-single').classList.add('active');
                document.getElementById('select-icon-mult').classList.remove('active');
            }
        }

        function getTagStyle(tagName) {
            const def = state.definitions.find(d => d.name === tagName);
            return def;
        }

        function render() {
            renderTags();
            renderBlocks();
        }

        function renderTags() {
            tagsContainer.innerHTML = '';

            const filteredTags = state.tags.filter(t => t.toLowerCase().includes(state.searchQuery));

            if (filteredTags.length === 0) {
                 tagsContainer.innerHTML = '<span style="opacity:0.6; font-size:0.9em; padding:4px;">No tags found</span>';
                 return;
            }

            filteredTags.forEach(tag => {
                const el = document.createElement('div');
                el.className = 'tag-chip';
                if (state.selectedTags.has(tag)) {
                    el.classList.add('selected');
                }

                const def = getTagStyle(tag);
                let iconHtml = '';
                if (def && def.icon) {
                    iconHtml = '<span class="codicon codicon-' + def.icon + '"></span> ';
                }

                el.innerHTML = iconHtml + tag;
                el.title = tag;

                el.addEventListener('click', () => {
                    if (state.isMultiSelect) {
                        // 多选模式：切换选中状态
                        if (state.selectedTags.has(tag)) {
                            state.selectedTags.delete(tag);
                        } else {
                            state.selectedTags.add(tag);
                        }
                    } else {
                        // 单选模式：点击已选中的取消选中，否则替换选中
                        if (state.selectedTags.has(tag)) {
                            state.selectedTags.clear();
                        } else {
                            state.selectedTags.clear();
                            state.selectedTags.add(tag);
                        }
                    }
                    render();
                });

                tagsContainer.appendChild(el);
            });
        }

        function renderBlocks() {
            blocksContainer.innerHTML = '';

            if (state.selectedTags.size === 0) {
                blocksContainer.innerHTML = '<div class="empty-state">Select a tag to see blocks</div>';
                return;
            }

            // Find blocks that have ALL selected tags
            const selectedArray = Array.from(state.selectedTags);

            // Start with blocks from the first tag
            let candidates = state.data[selectedArray[0]] || [];

            // Intersect with subsequent tags
            for (let i = 1; i < selectedArray.length; i++) {
                const nextTagBlocks = state.data[selectedArray[i]] || [];
                const nextSet = new Set(nextTagBlocks.map(b => b.uri + ':' + b.line));
                candidates = candidates.filter(b => nextSet.has(b.uri + ':' + b.line));
            }

            if (candidates.length === 0) {
                blocksContainer.innerHTML = '<div class="empty-state">No blocks found with all selected tags</div>';
                return;
            }

            candidates.forEach(block => {
                const el = document.createElement('div');
                el.className = 'block-item';

                const header = document.createElement('div');
                header.className = 'block-header';
                header.innerHTML = '<span>' + block.fileName + ':' + (block.line + 1) + '</span>';

                const content = document.createElement('div');
                content.className = 'block-content';
                content.textContent = block.text; // Text content

                el.appendChild(header);
                el.appendChild(content);

                el.addEventListener('click', () => {
                    vscode.postMessage({
                        type: 'openLocation',
                        uri: block.uri,
                        line: block.line
                    });
                });

                blocksContainer.appendChild(el);
            });
        }

        // Initial request (optional if backend pushes on connect)
        vscode.postMessage({ type: 'refresh' });

    </script>
</body>
</html>`;
  }
}
